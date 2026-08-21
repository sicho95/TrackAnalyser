import {
  DEFAULT_ANALYSIS_PROFILES,
  automaticSegments,
  attachAnalysisRun,
  createSegment,
  createPipelineDataset,
  createVersionedAnalysisProfile,
  deriveDataset,
  executeAnalysis,
  transitionDataset,
  validateImportTarget,
  type ActivityGroup,
  type ActivityType,
  type AnalysisRun,
  type AnalysisProfile,
  type AppSettings,
  type Equipment,
  type ImportResult,
  type Participant,
  type Segment,
  type SensorSample,
  type Session,
} from '@track-analyser/domain'
import { DataFusionEngine, synchronizeByUtc } from '@track-analyser/fusion'
import { chunkBytes, LocalRepositories, ProgressiveRawStore, SessionCheckpointService } from '@track-analyser/storage'
import { AcquisitionCoordinator, PhoneLocationSensorSource, PhoneMotionSensorSource, createObservedPhoneProfile } from '@track-analyser/sensors'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

interface AppData {
  ready: boolean
  participants: Participant[]
  sessions: Session[]
  equipment: Equipment[]
  activityGroups: ActivityGroup[]
  analysisRuns: AnalysisRun[]
  analysisProfiles: AnalysisProfile[]
  segments: Segment[]
  settings: AppSettings
  activeSession?: Session
  liveSamples: SensorSample[]
  acquisitionStatus: string
  addParticipant(name: string): Promise<Participant>
  addEquipment(name: string, type: string): Promise<Equipment>
  createActivityGroup(sessionIds: string[], title?: string): Promise<ActivityGroup>
  startSession(participantId: string, activityType: ActivityType, equipmentId?: string): Promise<Session>
  stopSession(): Promise<Session>
  importData(result: ImportResult, participantId: string, sessionId?: string): Promise<Session>
  createAnalysisProfile(baseProfileId: string, version: string, name: string, parameters: Readonly<Record<string, number>>): Promise<AnalysisProfile>
  reanalyzeSession(sessionId: string, profileId: string): Promise<AnalysisRun>
  createManualSegment(sessionId: string, name: string, startPercent: number, endPercent: number): Promise<Segment>
  updateSettings(settings: AppSettings): Promise<void>
  refresh(): Promise<void>
  repositories?: LocalRepositories
}

const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: __SCHEMA_VERSION__,
  theme: 'system',
  locale: 'fr',
  unitSystem: 'metric',
  mapProvider: 'osm',
  pendingUpdate: false,
}

const AppDataContext = createContext<AppData | undefined>(undefined)

export function AppDataProvider({ children }: { children: ReactNode }): ReactNode {
  const [repositories, setRepositories] = useState<LocalRepositories>()
  const [participants, setParticipants] = useState<Participant[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [activityGroups, setActivityGroups] = useState<ActivityGroup[]>([])
  const [analysisRuns, setAnalysisRuns] = useState<AnalysisRun[]>([])
  const [analysisProfiles, setAnalysisProfiles] = useState<AnalysisProfile[]>([])
  const [segments, setSegments] = useState<Segment[]>([])
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [activeSession, setActiveSession] = useState<Session>()
  const [liveSamples, setLiveSamples] = useState<SensorSample[]>([])
  const [acquisitionStatus, setAcquisitionStatus] = useState('IDLE')
  const coordinator = useRef<AcquisitionCoordinator | undefined>(undefined)
  const liveSamplesRef = useRef<SensorSample[]>([])
  const polling = useRef<number | undefined>(undefined)

  const refresh = useCallback(async (): Promise<void> => {
    if (repositories === undefined) return
    const [nextParticipants, nextSessions, nextEquipment, nextGroups, nextRuns, nextProfiles, nextSegments, nextSettings] = await Promise.all([
      repositories.participants.list(),
      repositories.sessions.list(),
      repositories.equipment.list(),
      repositories.activityGroups.list(),
      repositories.analysisRuns.list(),
      repositories.analysisProfiles.list(),
      repositories.segments.list(),
      repositories.getSettings(),
    ])
    setParticipants(nextParticipants.toSorted((left, right) => left.name.localeCompare(right.name)))
    setSessions(nextSessions.toSorted((left, right) => right.startTime.localeCompare(left.startTime)))
    setEquipment(nextEquipment)
    setActivityGroups(nextGroups)
    setAnalysisRuns(nextRuns)
    setAnalysisProfiles(nextProfiles.toSorted((left, right) => left.activityType.localeCompare(right.activityType) || left.version.localeCompare(right.version)))
    setSegments(nextSegments.toSorted((left, right) => left.startTime - right.startTime))
    setSettings(nextSettings)
  }, [repositories])

  useEffect(() => {
    void LocalRepositories.open().then(async (opened) => {
      setRepositories(opened)
      for (const profile of Object.values(DEFAULT_ANALYSIS_PROFILES)) await opened.analysisProfiles.put(profile)
      await new SessionCheckpointService(opened).recoverInterrupted()
    })
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
  }, [settings.theme])

  const addParticipant = useCallback(async (name: string): Promise<Participant> => {
    if (repositories === undefined) throw new Error('Stockage non initialisé.')
    const trimmed = name.trim()
    if (trimmed.length === 0) throw new Error('Le nom du participant est obligatoire.')
    const now = new Date().toISOString()
    const participant: Participant = { id: crypto.randomUUID(), name: trimmed, createdAt: now, updatedAt: now, archived: false }
    await repositories.participants.put(participant)
    await refresh()
    return participant
  }, [refresh, repositories])

  const addEquipment = useCallback(async (name: string, type: string): Promise<Equipment> => {
    if (repositories === undefined) throw new Error('Stockage non initialisé.')
    const item: Equipment = { id: crypto.randomUUID(), name: name.trim(), type: type.trim() }
    await repositories.equipment.put(item)
    await refresh()
    return item
  }, [refresh, repositories])

  const createActivityGroup = useCallback(async (sessionIds: string[], title?: string): Promise<ActivityGroup> => {
    if (repositories === undefined) throw new Error('Stockage non initialisé.')
    const selected = sessionIds.map((id) => sessions.find((session) => session.id === id)).filter((session): session is Session => session !== undefined)
    if (selected.length < 2) throw new Error('Sélectionner au moins deux sessions.')
    if (new Set(selected.map((session) => session.activityType)).size !== 1) throw new Error('Un ActivityGroup regroupe une même activité réelle.')
    const firstSession = selected[0]
    if (firstSession === undefined) throw new Error('Aucune session sélectionnée.')
    const endTime = selected.flatMap((session) => session.endTime === undefined ? [] : [session.endTime]).toSorted().at(-1)
    const group: ActivityGroup = {
      id: crypto.randomUUID(),
      activityType: firstSession.activityType,
      ...(title?.trim() ? { title: title.trim() } : {}),
      startTime: firstSession.startTime,
      ...(endTime === undefined ? {} : { endTime }),
      sessionIds: selected.map((session) => session.id),
    }
    await repositories.activityGroups.put(group)
    await Promise.all(selected.map((session) => repositories.sessions.put({ ...session, activityGroupId: group.id })))
    await refresh()
    return group
  }, [refresh, repositories, sessions])

  const startSession = useCallback(async (participantId: string, activityType: ActivityType, equipmentId?: string): Promise<Session> => {
    if (repositories === undefined) throw new Error('Stockage non initialisé.')
    if (!participants.some((participant) => participant.id === participantId)) throw new Error('Participant invalide.')
    const phone = createObservedPhoneProfile()
    phone.assignedParticipantId = participantId
    await repositories.devices.put(phone)
    const session: Session = {
      id: crypto.randomUUID(),
      participantId,
      activityType,
      ...(equipmentId === undefined || equipmentId.length === 0 ? {} : { equipmentId }),
      sourceIds: [`${phone.id}:motion`, `${phone.id}:geolocation`],
      startTime: new Date().toISOString(),
      schemaVersion: __SCHEMA_VERSION__,
      rawDataReferences: [],
      analysisRunIds: [],
      status: 'DRAFT',
    }
    await repositories.sessions.put(session)
    const sources = [new PhoneMotionSensorSource(phone.id), new PhoneLocationSensorSource(phone.id)]
    sources.forEach((source) => source.subscribe((sample) => {
      liveSamplesRef.current.push(sample)
      if (liveSamplesRef.current.length > 50_000) liveSamplesRef.current.splice(0, liveSamplesRef.current.length - 50_000)
    }))
    const acquisition = new AcquisitionCoordinator(sources, new ProgressiveRawStore(), new SessionCheckpointService(repositories))
    coordinator.current = acquisition
    liveSamplesRef.current = []
    setLiveSamples([])
    setActiveSession(session)
    await acquisition.start(session)
    setAcquisitionStatus('RECORDING')
    polling.current = window.setInterval(() => {
      setAcquisitionStatus(acquisition.getState().status)
      setLiveSamples(liveSamplesRef.current.slice(-500))
    }, 200)
    await refresh()
    return session
  }, [participants, refresh, repositories])

  const stopSession = useCallback(async (): Promise<Session> => {
    if (repositories === undefined || activeSession === undefined || coordinator.current === undefined) throw new Error('Aucune session active.')
    if (polling.current !== undefined) window.clearInterval(polling.current)
    const reference = await coordinator.current.stop()
    const completed = (await repositories.sessions.get(activeSession.id)) ?? { ...activeSession, rawDataReferences: [reference], status: 'COMPLETED' as const, endTime: new Date().toISOString() }
    // Rejouer le RAW complet afin que la fenêtre courte de l'interface ne tronque jamais l'analyse finale.
    const { replayRawSamples } = await import('./reanalysis')
    const samples = await replayRawSamples([reference], new ProgressiveRawStore())
    const run = analyzeSession(completed, samples, [], DEFAULT_ANALYSIS_PROFILES[completed.activityType])
    await repositories.analysisRuns.put(run)
    await persistAutomaticSegments(completed, run, samples, repositories)
    const withAnalysis = attachAnalysisRun(completed, run)
    await repositories.sessions.put(withAnalysis)
    coordinator.current = undefined
    setActiveSession(undefined)
    setAcquisitionStatus('IDLE')
    await refresh()
    return withAnalysis
  }, [activeSession, refresh, repositories])

  const importData = useCallback(async (result: ImportResult, participantId: string, sessionId?: string): Promise<Session> => {
    if (repositories === undefined) throw new Error('Stockage non initialisé.')
    validateImportTarget(
      { participantId, ...(sessionId === undefined ? { createSession: true } : { sessionId, createSession: false }) },
      participants,
      sessions,
    )
    const existing = sessionId === undefined ? undefined : sessions.find((session) => session.id === sessionId)
    const baseSession: Session =
      existing ?? {
        id: crypto.randomUUID(),
        participantId,
        activityType: result.identity.activityType ?? 'GENERIC',
        sourceIds: [],
        startTime: result.identity.startTime ?? new Date().toISOString(),
        ...(result.identity.endTime === undefined ? {} : { endTime: result.identity.endTime }),
        schemaVersion: __SCHEMA_VERSION__,
        rawDataReferences: [],
        analysisRunIds: [],
        status: 'COMPLETED',
        title: result.identity.fileName,
      }
    const rawStore = new ProgressiveRawStore()
    const reference = await rawStore.write(`raw-import-${crypto.randomUUID()}`, chunkBytes(result.rawBytes), {
      sessionId: baseSession.id,
      sourceId: result.samples[0]?.sourceId ?? `import:${result.identity.sha256}`,
      mediaType: result.identity.format === 'FIT' ? 'application/vnd.ant.fit' : 'application/octet-stream',
      importedFileName: result.identity.fileName,
    })
    const sessionWithRaw: Session = {
      ...baseSession,
      rawDataReferences: [...baseSession.rawDataReferences, reference],
      sourceIds: [...new Set([...baseSession.sourceIds, ...result.samples.map((sample) => sample.sourceId)])],
    }
    const previousRuns = analysisRuns.filter((run) => run.sessionId === sessionWithRaw.id)
    const run = analyzeSession(sessionWithRaw, result.samples, previousRuns, DEFAULT_ANALYSIS_PROFILES[sessionWithRaw.activityType])
    await repositories.analysisRuns.put(run)
    await persistAutomaticSegments(sessionWithRaw, run, result.samples, repositories)
    const finalSession = attachAnalysisRun(sessionWithRaw, run)
    await repositories.sessions.put(finalSession)
    await Promise.all(importedSegments(result.metadata, finalSession.id).map((segment) => repositories.segments.put(segment)))
    await refresh()
    return finalSession
  }, [analysisRuns, participants, refresh, repositories, sessions])

  const createAnalysisProfile = useCallback(async (
    baseProfileId: string,
    version: string,
    name: string,
    parameters: Readonly<Record<string, number>>,
  ): Promise<AnalysisProfile> => {
    if (repositories === undefined) throw new Error('Stockage non initialisé.')
    const base = analysisProfiles.find((profile) => profile.id === baseProfileId)
    if (base === undefined) throw new Error('Le profil source est introuvable.')
    if (analysisProfiles.some((profile) => profile.activityType === base.activityType && profile.version === version.trim())) {
      throw new Error('Cette version existe déjà pour cette activité.')
    }
    const profile = createVersionedAnalysisProfile(base, version, name, parameters)
    await repositories.analysisProfiles.put(profile)
    await refresh()
    return profile
  }, [analysisProfiles, refresh, repositories])

  const reanalyzeSession = useCallback(async (sessionId: string, profileId: string): Promise<AnalysisRun> => {
    if (repositories === undefined) throw new Error('Stockage non initialisé.')
    if (activeSession !== undefined) throw new Error('Terminer la session active avant de lancer une réanalyse.')
    const session = sessions.find((candidate) => candidate.id === sessionId)
    if (session === undefined) throw new Error('La session à réanalyser est introuvable.')
    const profile = analysisProfiles.find((candidate) => candidate.id === profileId)
    if (profile?.activityType !== session.activityType) throw new Error('Le profil ne correspond pas à cette activité.')
    if (session.rawDataReferences.length === 0) throw new Error('Aucun RAW immutable n’est disponible pour cette session.')
    const previousRuns = analysisRuns.filter((run) => run.sessionId === session.id)
    const { replayRawSamples } = await import('./reanalysis')
    const samples = await replayRawSamples(session.rawDataReferences, new ProgressiveRawStore())
    if (samples.length === 0) throw new Error('Les RAW ne contiennent aucune mesure rejouable.')
    const candidate = analyzeSession(session, samples, previousRuns, profile)
    const run = previousRuns.find((existing) => existing.id === candidate.id) ?? candidate
    if (!previousRuns.some((existing) => existing.id === run.id)) await repositories.analysisRuns.put(run)
    await persistAutomaticSegments(session, run, samples, repositories)
    await repositories.sessions.put(attachAnalysisRun(session, run))
    await refresh()
    return run
  }, [activeSession, analysisProfiles, analysisRuns, refresh, repositories, sessions])

  const createManualSegment = useCallback(async (
    sessionId: string,
    name: string,
    startPercent: number,
    endPercent: number,
  ): Promise<Segment> => {
    if (repositories === undefined) throw new Error('Stockage non initialisé.')
    if (activeSession !== undefined) throw new Error('Terminer la session active avant de créer un segment.')
    const session = sessions.find((candidate) => candidate.id === sessionId)
    if (session === undefined) throw new Error('La session est introuvable.')
    if (!Number.isFinite(startPercent) || !Number.isFinite(endPercent) || startPercent < 0 || endPercent > 100 || startPercent >= endPercent) {
      throw new Error('Choisir une période comprise entre 0 et 100 %.')
    }
    const { replayRawSamples } = await import('./reanalysis')
    const samples = await replayRawSamples(session.rawDataReferences, new ProgressiveRawStore())
    let first = Number.POSITIVE_INFINITY
    let last = Number.NEGATIVE_INFINITY
    let timestampCount = 0
    samples.forEach((sample) => {
      if (!Number.isFinite(sample.timestamp)) return
      first = Math.min(first, sample.timestamp)
      last = Math.max(last, sample.timestamp)
      timestampCount += 1
    })
    if (timestampCount < 2 || first >= last) throw new Error('Les RAW ne contiennent pas assez de mesures pour créer un segment.')
    const segment = createSegment(
      session,
      name,
      first + (last - first) * startPercent / 100,
      first + (last - first) * endPercent / 100,
      samples,
      { manual: true },
    )
    await repositories.segments.put(segment)
    await refresh()
    return segment
  }, [activeSession, refresh, repositories, sessions])

  const updateSettings = useCallback(async (next: AppSettings): Promise<void> => {
    if (repositories === undefined) throw new Error('Stockage non initialisé.')
    await repositories.putSettings(next)
    setSettings(next)
  }, [repositories])

  const value = useMemo<AppData>(() => ({
    ready: repositories !== undefined,
    participants,
    sessions,
    equipment,
    activityGroups,
    analysisRuns,
    analysisProfiles,
    segments,
    settings,
    ...(activeSession === undefined ? {} : { activeSession }),
    liveSamples,
    acquisitionStatus,
    addParticipant,
    addEquipment,
    createActivityGroup,
    startSession,
    stopSession,
    importData,
    createAnalysisProfile,
    reanalyzeSession,
    createManualSegment,
    updateSettings,
    refresh,
    ...(repositories === undefined ? {} : { repositories }),
  }), [acquisitionStatus, activeSession, activityGroups, addEquipment, addParticipant, analysisProfiles, analysisRuns, createActivityGroup, createAnalysisProfile, createManualSegment, equipment, importData, liveSamples, participants, reanalyzeSession, repositories, refresh, segments, sessions, settings, startSession, stopSession, updateSettings])

  return <AppDataContext value={value}>{children}</AppDataContext>
}

async function persistAutomaticSegments(
  session: Session,
  run: AnalysisRun,
  samples: readonly SensorSample[],
  repositories: LocalRepositories,
): Promise<void> {
  await Promise.all(automaticSegments(session, run, samples).map((segment) => repositories.segments.put(segment)))
}

function importedSegments(metadata: Readonly<Record<string, unknown>>, sessionId: string): Segment[] {
  const candidates = metadata.segments
  if (!Array.isArray(candidates)) return []
  return candidates.flatMap((candidate) => {
    if (typeof candidate !== 'object' || candidate === null) return []
    const value = candidate as Partial<Segment>
    if (typeof value.name !== 'string' || typeof value.startTime !== 'number' || typeof value.endTime !== 'number' || value.startTime >= value.endTime) return []
    return [{
      ...value,
      id: `segment-${sessionId}-${crypto.randomUUID()}`,
      sessionId,
      name: value.name,
      startTime: value.startTime,
      endTime: value.endTime,
      manual: value.manual === true,
    } as Segment]
  })
}

function analyzeSession(
  session: Session,
  samples: readonly SensorSample[],
  previousRuns: readonly AnalysisRun[],
  profile: (typeof DEFAULT_ANALYSIS_PROFILES)[ActivityType],
): AnalysisRun {
  const raw = createPipelineDataset(session.id, session.participantId, samples, 'RAW')
  const normalized = transitionDataset(raw, 'NORMALIZED')
  const synchronized = synchronizeByUtc(normalized)
  const fused = new DataFusionEngine(__ANALYSIS_VERSION__).fuse(synchronized, []).dataset
  const derived = deriveDataset(fused)
  return executeAnalysis(session, derived, profile, previousRuns, {
    analysisVersion: __ANALYSIS_VERSION__,
    engineBuildId: __BUILD_ID__,
    gitCommit: __GIT_COMMIT__,
  })
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppData(): AppData {
  const context = useContext(AppDataContext)
  if (context === undefined) throw new Error('AppDataProvider absent.')
  return context
}
