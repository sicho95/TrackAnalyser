import {
  DEFAULT_ANALYSIS_PROFILES,
  attachAnalysisRun,
  createPipelineDataset,
  executeAnalysis,
  transitionDataset,
  validateImportTarget,
  type ActivityGroup,
  type ActivityType,
  type AnalysisRun,
  type AppSettings,
  type Equipment,
  type ImportResult,
  type Participant,
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
  settings: AppSettings
  activeSession?: Session
  liveSamples: SensorSample[]
  acquisitionStatus: string
  addParticipant(name: string): Promise<Participant>
  addEquipment(name: string, type: string): Promise<Equipment>
  startSession(participantId: string, activityType: ActivityType, equipmentId?: string): Promise<Session>
  stopSession(): Promise<Session>
  importData(result: ImportResult, participantId: string, sessionId?: string): Promise<Session>
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
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [activeSession, setActiveSession] = useState<Session>()
  const [liveSamples, setLiveSamples] = useState<SensorSample[]>([])
  const [acquisitionStatus, setAcquisitionStatus] = useState('IDLE')
  const coordinator = useRef<AcquisitionCoordinator | undefined>(undefined)
  const liveSamplesRef = useRef<SensorSample[]>([])
  const polling = useRef<number | undefined>(undefined)

  const refresh = useCallback(async (): Promise<void> => {
    if (repositories === undefined) return
    const [nextParticipants, nextSessions, nextEquipment, nextGroups, nextRuns, nextSettings] = await Promise.all([
      repositories.participants.list(),
      repositories.sessions.list(),
      repositories.equipment.list(),
      repositories.activityGroups.list(),
      repositories.analysisRuns.list(),
      repositories.getSettings(),
    ])
    setParticipants(nextParticipants.toSorted((left, right) => left.name.localeCompare(right.name)))
    setSessions(nextSessions.toSorted((left, right) => right.startTime.localeCompare(left.startTime)))
    setEquipment(nextEquipment)
    setActivityGroups(nextGroups)
    setAnalysisRuns(nextRuns)
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
    const run = analyzeSession(completed, liveSamplesRef.current, [], DEFAULT_ANALYSIS_PROFILES[completed.activityType])
    await repositories.analysisRuns.put(run)
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
    const finalSession = attachAnalysisRun(sessionWithRaw, run)
    await repositories.sessions.put(finalSession)
    await refresh()
    return finalSession
  }, [analysisRuns, participants, refresh, repositories, sessions])

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
    settings,
    ...(activeSession === undefined ? {} : { activeSession }),
    liveSamples,
    acquisitionStatus,
    addParticipant,
    addEquipment,
    startSession,
    stopSession,
    importData,
    updateSettings,
    refresh,
    ...(repositories === undefined ? {} : { repositories }),
  }), [acquisitionStatus, activeSession, activityGroups, addEquipment, addParticipant, analysisRuns, equipment, importData, liveSamples, participants, readyKey(repositories), refresh, sessions, settings, startSession, stopSession, updateSettings])

  return <AppDataContext value={value}>{children}</AppDataContext>
}

function readyKey(repositories: LocalRepositories | undefined): boolean {
  return repositories !== undefined
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
  return executeAnalysis(session, fused, profile, previousRuns, {
    analysisVersion: __ANALYSIS_VERSION__,
    engineBuildId: __BUILD_ID__,
    gitCommit: __GIT_COMMIT__,
  })
}

export function useAppData(): AppData {
  const context = useContext(AppDataContext)
  if (context === undefined) throw new Error('AppDataProvider absent.')
  return context
}
