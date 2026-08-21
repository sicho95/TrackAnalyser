import type {
  ActivityGroup,
  AnalysisProfile,
  AnalysisRun,
  AppSettings,
  CalibrationSnapshot,
  DeviceProfile,
  Equipment,
  Participant,
  Session,
} from '@track-analyser/domain'
import { openTrackAnalyserDatabase, type TrackAnalyserDatabaseHandle } from './database'

export interface Repository<T extends { id: string }> {
  get(id: string): Promise<T | undefined>
  list(): Promise<T[]>
  put(value: T): Promise<void>
  delete(id: string): Promise<void>
}

class ObjectStoreRepository<T extends { id: string }> implements Repository<T> {
  constructor(
    private readonly database: TrackAnalyserDatabaseHandle,
    private readonly storeName:
      | 'participants'
      | 'activityGroups'
      | 'equipment'
      | 'devices'
      | 'calibrations'
      | 'sessions'
      | 'analysisProfiles'
      | 'analysisRuns',
  ) {}

  async get(id: string): Promise<T | undefined> {
    return (await this.database.get(this.storeName, id)) as T | undefined
  }

  async list(): Promise<T[]> {
    return (await this.database.getAll(this.storeName)) as unknown as T[]
  }

  async put(value: T): Promise<void> {
    await this.database.put(this.storeName, value as never)
  }

  async delete(id: string): Promise<void> {
    await this.database.delete(this.storeName, id)
  }
}

export interface BackupSnapshot {
  formatVersion: 1
  createdAt: string
  settings: AppSettings
  participants: Participant[]
  activityGroups: ActivityGroup[]
  equipment: Equipment[]
  devices: DeviceProfile[]
  calibrations: CalibrationSnapshot[]
  sessions: Session[]
  analysisProfiles: AnalysisProfile[]
  analysisRuns: AnalysisRun[]
}

export class LocalRepositories {
  readonly participants: Repository<Participant>
  readonly activityGroups: Repository<ActivityGroup>
  readonly equipment: Repository<Equipment>
  readonly devices: Repository<DeviceProfile>
  readonly calibrations: Repository<CalibrationSnapshot>
  readonly sessions: Repository<Session>
  readonly analysisProfiles: Repository<AnalysisProfile>
  readonly analysisRuns: Repository<AnalysisRun>

  private constructor(private readonly database: TrackAnalyserDatabaseHandle) {
    this.participants = new ObjectStoreRepository(database, 'participants')
    this.activityGroups = new ObjectStoreRepository(database, 'activityGroups')
    this.equipment = new ObjectStoreRepository(database, 'equipment')
    this.devices = new ObjectStoreRepository(database, 'devices')
    this.calibrations = new ObjectStoreRepository(database, 'calibrations')
    this.sessions = new ObjectStoreRepository(database, 'sessions')
    this.analysisProfiles = new ObjectStoreRepository(database, 'analysisProfiles')
    this.analysisRuns = new ObjectStoreRepository(database, 'analysisRuns')
  }

  static async open(): Promise<LocalRepositories> {
    return new LocalRepositories(await openTrackAnalyserDatabase())
  }

  async sessionsForParticipant(participantId: string): Promise<Session[]> {
    if (participantId.length === 0) throw new Error('Choisir le participant avant de rechercher ses sessions.')
    return this.database.getAllFromIndex('sessions', 'participantId', participantId)
  }

  async interruptedSessions(): Promise<Session[]> {
    return this.database.getAllFromIndex('sessions', 'status', 'INTERRUPTED')
  }

  async getSettings(): Promise<AppSettings> {
    return (
      (await this.database.get('settings', 'app')) ?? {
        schemaVersion: 3,
        theme: 'system',
        locale: 'fr',
        unitSystem: 'metric',
        mapProvider: 'osm',
        pendingUpdate: false,
      }
    )
  }

  async putSettings(settings: AppSettings): Promise<void> {
    await this.database.put('settings', settings, 'app')
  }

  async snapshot(): Promise<BackupSnapshot> {
    const [settings, participants, activityGroups, equipment, devices, calibrations, sessions, analysisProfiles, analysisRuns] =
      await Promise.all([
        this.getSettings(),
        this.participants.list(),
        this.activityGroups.list(),
        this.equipment.list(),
        this.devices.list(),
        this.calibrations.list(),
        this.sessions.list(),
        this.analysisProfiles.list(),
        this.analysisRuns.list(),
      ])
    return {
      formatVersion: 1,
      createdAt: new Date().toISOString(),
      settings,
      participants,
      activityGroups,
      equipment,
      devices,
      calibrations,
      sessions,
      analysisProfiles,
      analysisRuns,
    }
  }

  async restore(snapshot: BackupSnapshot): Promise<void> {
    if (snapshot.formatVersion !== 1) throw new Error('Version de sauvegarde non prise en charge.')
    const transaction = this.database.transaction(
      ['settings', 'participants', 'activityGroups', 'equipment', 'devices', 'calibrations', 'sessions', 'analysisProfiles', 'analysisRuns'],
      'readwrite',
    )
    await Promise.all([
      transaction.objectStore('settings').put(snapshot.settings, 'app'),
      ...snapshot.participants.map((item) => transaction.objectStore('participants').put(item)),
      ...snapshot.activityGroups.map((item) => transaction.objectStore('activityGroups').put(item)),
      ...snapshot.equipment.map((item) => transaction.objectStore('equipment').put(item)),
      ...snapshot.devices.map((item) => transaction.objectStore('devices').put(item)),
      ...snapshot.calibrations.map((item) => transaction.objectStore('calibrations').put(item)),
      ...snapshot.sessions.map((item) => transaction.objectStore('sessions').put(item)),
      ...snapshot.analysisProfiles.map((item) => transaction.objectStore('analysisProfiles').put(item)),
      ...snapshot.analysisRuns.map((item) => transaction.objectStore('analysisRuns').put(item)),
      transaction.done,
    ])
  }
}
