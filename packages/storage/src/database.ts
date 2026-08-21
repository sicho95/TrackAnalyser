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
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

export const DATABASE_NAME = 'track-analyser'
export const DATABASE_VERSION = 3

export interface RawChunkRecord {
  key: string
  streamId: string
  index: number
  bytes: Uint8Array
  sha256: string
  createdAt: string
}

interface TrackAnalyserDatabase extends DBSchema {
  participants: { key: string; value: Participant }
  activityGroups: { key: string; value: ActivityGroup }
  equipment: { key: string; value: Equipment }
  devices: { key: string; value: DeviceProfile }
  calibrations: { key: string; value: CalibrationSnapshot }
  sessions: { key: string; value: Session; indexes: { participantId: string; status: Session['status'] } }
  analysisProfiles: { key: string; value: AnalysisProfile; indexes: { activityType: string } }
  analysisRuns: { key: string; value: AnalysisRun; indexes: { sessionId: string } }
  settings: { key: string; value: AppSettings }
  rawChunks: { key: string; value: RawChunkRecord; indexes: { streamId: string } }
}

let databasePromise: Promise<IDBPDatabase<TrackAnalyserDatabase>> | undefined

export function openTrackAnalyserDatabase(): Promise<IDBPDatabase<TrackAnalyserDatabase>> {
  databasePromise ??= openDB<TrackAnalyserDatabase>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(database, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        database.createObjectStore('participants', { keyPath: 'id' })
        database.createObjectStore('activityGroups', { keyPath: 'id' })
        database.createObjectStore('equipment', { keyPath: 'id' })
        database.createObjectStore('devices', { keyPath: 'id' })
        database.createObjectStore('calibrations', { keyPath: 'id' })
        const sessions = database.createObjectStore('sessions', { keyPath: 'id' })
        sessions.createIndex('participantId', 'participantId')
        sessions.createIndex('status', 'status')
        const profiles = database.createObjectStore('analysisProfiles', { keyPath: 'id' })
        profiles.createIndex('activityType', 'activityType')
        const runs = database.createObjectStore('analysisRuns', { keyPath: 'id' })
        runs.createIndex('sessionId', 'sessionId')
        database.createObjectStore('settings')
      }
      if (oldVersion < 2) {
        const chunks = database.createObjectStore('rawChunks', { keyPath: 'key' })
        chunks.createIndex('streamId', 'streamId')
      }
      if (oldVersion < 3) {
        // Normaliser les sessions antérieures sans modifier leurs références RAW.
        const store = transaction.objectStore('sessions')
        void store.openCursor().then(function migrate(cursor): Promise<void> | void {
          if (cursor === null) return
          const session = cursor.value
          if (session.status === undefined) {
            void cursor.update({ ...session, status: session.endTime === undefined ? 'INTERRUPTED' : 'COMPLETED' })
          }
          return cursor.continue().then(migrate)
        })
      }
    },
  })
  return databasePromise
}

export async function deleteTrackAnalyserDatabaseForTests(): Promise<void> {
  const database = await databasePromise
  database?.close()
  databasePromise = undefined
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('Suppression IndexedDB impossible.'))
    request.onblocked = () => reject(new Error('Suppression IndexedDB bloquée.'))
  })
}

export type TrackAnalyserDatabaseHandle = IDBPDatabase<TrackAnalyserDatabase>
