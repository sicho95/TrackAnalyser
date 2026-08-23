import {
  DEFAULT_ANALYSIS_PROFILES,
  DEFAULT_SEGMENT_DETECTION_SETTINGS,
  attachAnalysisRun,
  createPipelineDataset,
  createVersionedAnalysisProfile,
  createAutomaticRouteSegmentProfile,
  detectRecurringRouteSegments,
  deriveDataset,
  executeBatchedAnalysis,
  executeAnalysis,
  transitionDataset,
  validateImportTarget,
  normalizeSegmentDetectionSettings,
  type ActivityGroup,
  type ActivityType,
  type AnalysisRun,
  type AnalysisResult,
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
import { needsInitialAnalysis } from './session-analysis'

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
  acquisitionErrors: string[]
  addParticipant(name: string): Promise<Participant>
  addEquipment(name: string, type: string): Promise<Equipment>
  createActivityGroup(sessionIds: string[], title?: string): Promise<ActivityGroup>
  prepareSessionStart(participantId: string, activityType: ActivityType, equipmentId?: string): Promise<{ motionAvailable: boolean }>
  commitPreparedSession(): Promise<Session>
  cancelPreparedSession(): Promise<void>
  stopSession(): Promise<Session>
  importData(result: ImportResult, participantId: string, sessionId?: string): Promise<Session>
  createAnalysisProfile(baseProfileId: string, version: string, name: string, parameters: Readonly<Record<string, number>>): Promise<AnalysisProfile>
  reanalyzeSession(sessionId: string, profileId: string): Promise<AnalysisRun>
  deleteSession(sessionId: string): Promise<void>
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
  segmentDetection: DEFAULT_SEGMENT_DETECTION_SETTINGS,
  pendingUpdate: false,
}

const AppDataContext = createContext<AppData | undefined>(undefined)
const scheduledAnalyses = new Map<string, Promise<void>>()

export function AppDataProvider({ children }: { children: ReactNode }): ReactNode {
  const [repositories, setRepositories] = useState<LocalRepositories>()
  const repositoriesRef = useRef<LocalRepositories | undefined>(undefined)
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
  const [acquisitionErrors, setAcquisitionErrors] = useState<string[]>([])
  const coordinator = useRef<AcquisitionCoordinator | undefined>(undefined)
  const preparedStart = useRef<{
    participantId: string
    activityType: ActivityType
    equipmentId?: string
    phone: ReturnType<typeof createObservedPhoneProfile>
    motion: PhoneMotionSensorSource
    location: PhoneLocationSensorSource
    motionAvailable: boolean
  } | undefined>(undefined)
  const liveSamplesRef = useRef<SensorSample[]>([])
  const polling = useRef<number | undefined>(undefined)

  const refresh = useCallback(async (): Promise<void> => {
    const currentRepositories = repositoriesRef.current
    if (currentRepositories === undefined) return
    const [nextParticipants, nextSessions, nextEquipment, nextGroups, nextRuns, nextProfiles, nextSegments, nextSettings] = await Promise.all([
      currentRepositories.participants.list(),
      currentRepositories.sessions.list(),
      currentRepositories.equipment.list(),
      currentRepositories.activityGroups.list(),
      currentRepositories.analysisRuns.list(),
      currentRepositories.analysisProfiles.list(),
      currentRepositories.segments.list(),
      currentRepositories.getSettings(),
    ])
    setParticipants(nextParticipants.toSorted((left, right) => left.name.localeCompare(right.name)))
    setSessions(nextSessions.toSorted((left, right) => right.startTime.localeCompare(left.startTime)))
    setEquipment(nextEquipment)
    setActivityGroups(nextGroups)
    setAnalysisRuns(nextRuns)
    setAnalysisProfiles(nextProfiles.toSorted((left, right) => left.activityType.localeCompare(right.activityType) || left.version.localeCompare(right.version)))
    setSegments(nextSegments.toSorted((left, right) => left.startTime - right.startTime))
    setSettings(nextSettings)
  }, [])

  useEffect(() => {
    void LocalRepositories.open().then(async (opened) => {
      repositoriesRef.current = opened
      setRepositories(opened)
      for (const profile of Object.values(DEFAULT_ANALYSIS_PROFILES)) await opened.analysisProfiles.put(profile)
      await new SessionCheckpointService(opened).recoverInterrupted()
      await refresh()
      const pendingSessions = (await opened.sessions.list()).filter((session) => needsInitialAnalysis(session, __ANALYSIS_VERSION__))
      pendingSessions.forEach((session) => void scheduleSessionAnalysis(opened, session.id).catch(() => undefined).finally(refresh))
    })
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

  const prepareSessionStart = useCallback(async (participantId: string, activityType: ActivityType, equipmentId?: string): Promise<{ motionAvailable: boolean }> => {
    if (repositories === undefined) throw new Error('Stockage non initialisé.')
    if (!participants.some((participant) => participant.id === participantId)) throw new Error('Participant invalide.')
    if (preparedStart.current !== undefined || activeSession !== undefined) throw new Error('Une session est déjà en préparation ou active.')
    const phone = createObservedPhoneProfile()
    phone.assignedParticipantId = participantId
    const motion = new PhoneMotionSensorSource(phone.id)
    const location = new PhoneLocationSensorSource(phone.id)
    // Déclencher la demande iOS pendant le geste utilisateur, avant tout accès asynchrone au stockage.
    let motionAvailable = await motion.requestPermission()
    if (motionAvailable) {
      motion.beginMountingZero()
      try {
        await motion.start()
      } catch {
        // Continuer avec le GPS lorsque le navigateur refuse finalement DeviceMotion.
        motionAvailable = false
      }
    }
    preparedStart.current = {
      participantId,
      activityType,
      ...(equipmentId === undefined || equipmentId.length === 0 ? {} : { equipmentId }),
      phone,
      motion,
      location,
      motionAvailable,
    }
    return { motionAvailable }
  }, [activeSession, participants, repositories])

  const cancelPreparedSession = useCallback(async (): Promise<void> => {
    const prepared = preparedStart.current
    preparedStart.current = undefined
    if (prepared !== undefined) await prepared.motion.stop()
  }, [])

  const commitPreparedSession = useCallback(async (): Promise<Session> => {
    if (repositories === undefined) throw new Error('Stockage non initialisé.')
    const prepared = preparedStart.current
    if (prepared === undefined) throw new Error('Aucune session préparée.')
    preparedStart.current = undefined
    const calibration = prepared.motionAvailable ? prepared.motion.completeMountingZero(prepared.phone.id) : undefined
    const phone = calibration === undefined ? prepared.phone : {
      ...prepared.phone,
      calibrationProfiles: [calibration.id],
      updatedAt: new Date().toISOString(),
    }
    if (calibration !== undefined) await repositories.calibrations.put(calibration)
    await repositories.devices.put(phone)
    const session: Session = {
      id: crypto.randomUUID(),
      participantId: prepared.participantId,
      activityType: prepared.activityType,
      ...(prepared.equipmentId === undefined ? {} : { equipmentId: prepared.equipmentId }),
      sourceIds: [`${prepared.phone.id}:motion`, `${prepared.phone.id}:geolocation`],
      startTime: new Date().toISOString(),
      schemaVersion: __SCHEMA_VERSION__,
      rawDataReferences: [],
      analysisRunIds: [],
      status: 'DRAFT',
      ...(calibration === undefined ? {} : { calibration }),
    }
    await repositories.sessions.put(session)
    const nextSettings: AppSettings = {
      ...settings,
      lastSessionDefaults: {
        participantId: prepared.participantId,
        activityType: prepared.activityType,
        ...(prepared.equipmentId === undefined ? {} : { equipmentId: prepared.equipmentId }),
      },
    }
    await repositories.putSettings(nextSettings)
    setSettings(nextSettings)
    const sources = [prepared.motion, prepared.location]
    sources.forEach((source) => source.subscribe((sample) => {
      liveSamplesRef.current.push(sample)
      if (liveSamplesRef.current.length > 50_000) liveSamplesRef.current.splice(0, liveSamplesRef.current.length - 50_000)
    }))
    const acquisition = new AcquisitionCoordinator(sources, new ProgressiveRawStore(), new SessionCheckpointService(repositories))
    coordinator.current = acquisition
    liveSamplesRef.current = []
    setLiveSamples([])
    setAcquisitionErrors([])
    setActiveSession(session)
    await acquisition.start(session)
    const initialState = acquisition.getState()
    setAcquisitionStatus(initialState.status)
    setAcquisitionErrors(initialState.sourceErrors)
    polling.current = window.setInterval(() => {
      const state = acquisition.getState()
      setAcquisitionStatus(state.status)
      setAcquisitionErrors(state.sourceErrors)
      setLiveSamples(liveSamplesRef.current.slice(-500))
    }, 200)
    await refresh()
    return session
  }, [refresh, repositories, settings])

  const stopSession = useCallback(async (): Promise<Session> => {
    if (repositories === undefined || activeSession === undefined || coordinator.current === undefined) throw new Error('Aucune session active.')
    if (polling.current !== undefined) window.clearInterval(polling.current)
    const reference = await coordinator.current.stop()
    const completed = (await repositories.sessions.get(activeSession.id)) ?? { ...activeSession, rawDataReferences: [reference], status: 'COMPLETED' as const, analysisStatus: 'PENDING' as const, endTime: new Date().toISOString() }
    coordinator.current = undefined
    setActiveSession(undefined)
    setAcquisitionStatus('IDLE')
    setAcquisitionErrors([])
    setLiveSamples([])
    await refresh()
    // Lancer seulement après avoir rendu la Session et sa référence RAW durables et consultables.
    void scheduleSessionAnalysis(repositories, completed.id).catch(() => undefined).finally(refresh)
    return completed
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
    const run = await analyzeSessionFromRaw(sessionWithRaw, rawStore, previousRuns, DEFAULT_ANALYSIS_PROFILES[sessionWithRaw.activityType])
    await repositories.analysisRuns.put(run)
    const finalSession = { ...attachAnalysisRun(sessionWithRaw, run), analysisStatus: 'COMPLETED' as const, analysisAttemptVersion: __ANALYSIS_VERSION__ }
    delete finalSession.analysisError
    await repositories.sessions.put(finalSession)
    if (reference.storage === 'OPFS') void rawStore.discardIndexedDbMirror(reference.id)
    await Promise.all(importedSegments(result.metadata, finalSession.id).map((segment) => repositories.segments.put(segment)))
    await refreshAutomaticSegments(repositories)
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
    const running = { ...session, analysisStatus: 'RUNNING' as const, analysisAttemptVersion: __ANALYSIS_VERSION__ }
    delete running.analysisError
    await repositories.sessions.put(running)
    try {
      const candidate = await analyzeSessionFromRaw(running, new ProgressiveRawStore(), previousRuns, profile)
      const run = previousRuns.find((existing) => existing.id === candidate.id) ?? candidate
      if (!previousRuns.some((existing) => existing.id === run.id)) await repositories.analysisRuns.put(run)
      const completed = { ...attachAnalysisRun(running, run), analysisStatus: 'COMPLETED' as const }
      delete completed.analysisError
      await repositories.sessions.put(completed)
      await refreshAutomaticSegments(repositories)
      await refresh()
      return run
    } catch (error) {
      await repositories.sessions.put({
        ...running,
        analysisStatus: 'FAILED',
        analysisAttemptVersion: __ANALYSIS_VERSION__,
        analysisError: error instanceof Error ? error.message : String(error),
      })
      await refresh()
      throw error
    }
  }, [activeSession, analysisProfiles, analysisRuns, refresh, repositories, sessions])

  const updateSettings = useCallback(async (next: AppSettings): Promise<void> => {
    if (repositories === undefined) throw new Error('Stockage non initialisé.')
    const normalized = { ...next, segmentDetection: normalizeSegmentDetectionSettings(next.segmentDetection) }
    const previousSegmentSettings = normalizeSegmentDetectionSettings(settings.segmentDetection)
    const segmentSettingsChanged = previousSegmentSettings.minimumSimilarity !== normalized.segmentDetection.minimumSimilarity
      || previousSegmentSettings.minimumLengthMeters !== normalized.segmentDetection.minimumLengthMeters
    await repositories.putSettings(normalized)
    setSettings(normalized)
    if (segmentSettingsChanged) {
      await refreshAutomaticSegments(repositories)
      await refresh()
    }
  }, [refresh, repositories, settings.segmentDetection])

  const deleteSession = useCallback(async (sessionId: string): Promise<void> => {
    if (repositories === undefined) throw new Error('Stockage non initialisé.')
    if (activeSession?.id === sessionId) throw new Error('Arrêter la session active avant de la supprimer.')
    const session = sessions.find((candidate) => candidate.id === sessionId)
    if (session === undefined) throw new Error('Session introuvable.')
    const rawStore = new ProgressiveRawStore()
    for (const reference of session.rawDataReferences) await rawStore.delete(reference)
    await repositories.deleteSessionGraph(sessionId)
    await refreshAutomaticSegments(repositories)
    await refresh()
  }, [activeSession?.id, refresh, repositories, sessions])

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
    acquisitionErrors,
    addParticipant,
    addEquipment,
    createActivityGroup,
    prepareSessionStart,
    commitPreparedSession,
    cancelPreparedSession,
    stopSession,
    importData,
    createAnalysisProfile,
    reanalyzeSession,
    deleteSession,
    updateSettings,
    refresh,
    ...(repositories === undefined ? {} : { repositories }),
  }), [acquisitionErrors, acquisitionStatus, activeSession, activityGroups, addEquipment, addParticipant, analysisProfiles, analysisRuns, cancelPreparedSession, commitPreparedSession, createActivityGroup, createAnalysisProfile, deleteSession, equipment, importData, liveSamples, participants, prepareSessionStart, reanalyzeSession, repositories, refresh, segments, sessions, settings, stopSession, updateSettings])

  return <AppDataContext value={value}>{children}</AppDataContext>
}

function scheduleSessionAnalysis(repositories: LocalRepositories, sessionId: string): Promise<void> {
  const existing = scheduledAnalyses.get(sessionId)
  if (existing !== undefined) return existing
  const task = analyzeStoredSession(repositories, sessionId).finally(() => scheduledAnalyses.delete(sessionId))
  scheduledAnalyses.set(sessionId, task)
  return task
}

async function analyzeStoredSession(repositories: LocalRepositories, sessionId: string): Promise<void> {
  const session = await repositories.sessions.get(sessionId)
  if (session === undefined || session.rawDataReferences.length === 0) return
  const running = { ...session, analysisStatus: 'RUNNING' as const, analysisAttemptVersion: __ANALYSIS_VERSION__ }
  delete running.analysisError
  await repositories.sessions.put(running)
  try {
    // Rejouer le RAW complet après sa sauvegarde afin que la fenêtre courte de l'interface ne tronque jamais l'analyse finale.
    const rawStore = new ProgressiveRawStore()
    const previousRuns = (await repositories.analysisRuns.list()).filter((run) => run.sessionId === running.id)
    const candidate = await analyzeSessionFromRaw(running, rawStore, previousRuns, DEFAULT_ANALYSIS_PROFILES[running.activityType])
    const run = previousRuns.find((existingRun) => existingRun.id === candidate.id) ?? candidate
    if (!previousRuns.some((existingRun) => existingRun.id === run.id)) await repositories.analysisRuns.put(run)
    const completed = { ...attachAnalysisRun(running, run), analysisStatus: 'COMPLETED' as const }
    delete completed.analysisError
    await repositories.sessions.put(completed)
    running.rawDataReferences.filter((reference) => reference.storage === 'OPFS').forEach((reference) => void rawStore.discardIndexedDbMirror(reference.id))
    await refreshAutomaticSegments(repositories)
  } catch (error) {
    const current = (await repositories.sessions.get(sessionId)) ?? running
    await repositories.sessions.put({
      ...current,
      analysisStatus: 'FAILED',
      analysisError: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

async function refreshAutomaticSegments(repositories: LocalRepositories): Promise<void> {
  const [storedSessions, storedRuns, storedSegments, storedSettings] = await Promise.all([
    repositories.sessions.list(),
    repositories.analysisRuns.list(),
    repositories.segments.list(),
    repositories.getSettings(),
  ])
  const tracks = storedSessions.flatMap((session) => {
    const runs = storedRuns.filter((run) => run.sessionId === session.id)
    const latest = runs.find((run) => run.id === session.latestAnalysisRunId) ?? runs.toSorted((left, right) => left.createdAt.localeCompare(right.createdAt)).at(-1)
    return latest === undefined || latest.result.routePreview.length < 2 ? [] : [{ session, points: latest.result.routePreview }]
  })
  const detected = detectRecurringRouteSegments(tracks, createAutomaticRouteSegmentProfile(storedSettings.segmentDetection))
  await Promise.all(storedSegments.filter((segment) => !segment.manual).map((segment) => repositories.segments.delete(segment.id)))
  await Promise.all(detected.map((segment) => repositories.segments.put(segment)))
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
  let dataset = createPipelineDataset(session.id, session.participantId, samples, 'RAW')
  dataset = transitionDataset(dataset, 'NORMALIZED')
  dataset = synchronizeByUtc(dataset)
  dataset = new DataFusionEngine(__ANALYSIS_VERSION__).fuse(dataset, []).dataset
  dataset = deriveDataset(dataset)
  return executeAnalysis(session, dataset, profile, previousRuns, {
    analysisVersion: __ANALYSIS_VERSION__,
    engineBuildId: __BUILD_ID__,
    gitCommit: __GIT_COMMIT__,
  })
}

async function analyzeSessionFromRaw(
  session: Session,
  rawStore: ProgressiveRawStore,
  previousRuns: readonly AnalysisRun[],
  profile: (typeof DEFAULT_ANALYSIS_PROFILES)[ActivityType],
): Promise<AnalysisRun> {
  const { iterateAnalysisSampleBatches } = await import('./reanalysis')
  const results: AnalysisResult[] = []
  for await (const samples of iterateAnalysisSampleBatches(session.rawDataReferences, rawStore)) {
    results.push(analyzeSession(session, samples, [], profile).result)
  }
  if (results.length === 0) throw new Error('Le RAW sauvegardé ne contient aucune mesure rejouable.')
  return executeBatchedAnalysis(session, results, profile, previousRuns, {
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
