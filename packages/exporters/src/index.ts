import type { AnalysisRun, SensorSample, Session } from '@track-analyser/domain'
import type { BackupSnapshot } from '@track-analyser/storage'
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'

export const EXPORT_FORMAT_VERSION = 1

interface ArchiveManifest {
  format: 'tatrip' | 'tabackup'
  formatVersion: number
  schemaVersion: number
  createdAt: string
  sessionId?: string
}

export interface TripArchiveInput {
  session: Session
  analysisRuns: AnalysisRun[]
  samples: SensorSample[]
  rawFiles: Readonly<Record<string, Uint8Array>>
}

export interface RestoredTrip extends TripArchiveInput {
  manifest: ArchiveManifest
}

function jsonBytes(value: unknown): Uint8Array {
  return strToU8(JSON.stringify(value, null, 2))
}

function requiredJson<T>(files: Record<string, Uint8Array>, path: string): T {
  const bytes = files[path]
  if (bytes === undefined) throw new Error(`Archive incomplète : ${path} absent.`)
  return JSON.parse(strFromU8(bytes)) as T
}

export function exportSummaryJson(session: Session, runs: readonly AnalysisRun[], samples: readonly SensorSample[] = []): string {
  return JSON.stringify(
    {
      format: 'track-analyser-summary',
      formatVersion: EXPORT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      session,
      analyses: runs,
      samples,
    },
    null,
    2,
  )
}

function csvCell(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return `"${text.replaceAll('"', '""')}"`
}

export function exportSamplesCsv(samples: readonly SensorSample[]): string {
  const header = ['timestamp', 'iso_time', 'channel', 'value', 'unit', 'source_id', 'quality', 'stage']
  const lines = samples.map((sample) =>
    [
      sample.timestamp,
      new Date(sample.timestamp).toISOString(),
      sample.channel,
      sample.value,
      sample.unit,
      sample.sourceId,
      sample.quality,
      sample.stage,
    ]
      .map(csvCell)
      .join(','),
  )
  return [header.join(','), ...lines].join('\n')
}

export function createTripArchive(input: TripArchiveInput): Uint8Array {
  const manifest: ArchiveManifest = {
    format: 'tatrip',
    formatVersion: EXPORT_FORMAT_VERSION,
    schemaVersion: input.session.schemaVersion,
    createdAt: new Date().toISOString(),
    sessionId: input.session.id,
  }
  const files: Zippable = {
    'manifest.json': jsonBytes(manifest),
    'session.json': jsonBytes(input.session),
    'summary.json': strToU8(exportSummaryJson(input.session, input.analysisRuns)),
    'analysis/runs.json': jsonBytes(input.analysisRuns),
    'normalized/samples.ndjson': strToU8(input.samples.map((sample) => JSON.stringify(sample)).join('\n')),
  }
  Object.entries(input.rawFiles).forEach(([path, bytes]) => {
    files[`raw/${path}`] = bytes
  })
  return zipSync(files, { level: 6 })
}

export function restoreTripArchive(bytes: Uint8Array): RestoredTrip {
  const files = unzipSync(bytes)
  const manifest = migrateManifest(requiredJson<ArchiveManifest>(files, 'manifest.json'))
  if (manifest.format !== 'tatrip') throw new Error('Cette archive n’est pas un fichier .tatrip.')
  const session = requiredJson<Session>(files, 'session.json')
  const analysisRuns = requiredJson<AnalysisRun[]>(files, 'analysis/runs.json')
  const ndjson = files['normalized/samples.ndjson']
  const samples =
    ndjson === undefined || ndjson.length === 0
      ? []
      : strFromU8(ndjson)
          .split('\n')
          .filter((line) => line.length > 0)
          .map((line) => JSON.parse(line) as SensorSample)
  const rawFiles = Object.fromEntries(
    Object.entries(files)
      .filter(([path]) => path.startsWith('raw/'))
      .map(([path, value]) => [path.slice(4), value]),
  )
  return { manifest, session, analysisRuns, samples, rawFiles }
}

export function createBackupArchive(snapshot: BackupSnapshot, rawFiles: Readonly<Record<string, Uint8Array>> = {}): Uint8Array {
  const manifest: ArchiveManifest = {
    format: 'tabackup',
    formatVersion: EXPORT_FORMAT_VERSION,
    schemaVersion: snapshot.settings.schemaVersion,
    createdAt: snapshot.createdAt,
  }
  const files: Zippable = {
    'manifest.json': jsonBytes(manifest),
    'settings.json': jsonBytes(snapshot.settings),
    'participants.json': jsonBytes(snapshot.participants),
    'equipment.json': jsonBytes(snapshot.equipment),
    'devices.json': jsonBytes(snapshot.devices),
    'calibrations.json': jsonBytes(snapshot.calibrations),
    'activity-groups.json': jsonBytes(snapshot.activityGroups),
    'sessions/index.json': jsonBytes(snapshot.sessions),
    'profiles/analysis.json': jsonBytes(snapshot.analysisProfiles),
    'statistics/analysis-runs.json': jsonBytes(snapshot.analysisRuns),
  }
  Object.entries(rawFiles).forEach(([path, value]) => {
    files[`sessions/raw/${path}`] = value
  })
  return zipSync(files, { level: 6 })
}

export function restoreBackupArchive(bytes: Uint8Array): { snapshot: BackupSnapshot; rawFiles: Record<string, Uint8Array> } {
  const files = unzipSync(bytes)
  const manifest = migrateManifest(requiredJson<ArchiveManifest>(files, 'manifest.json'))
  if (manifest.format !== 'tabackup') throw new Error('Cette archive n’est pas un fichier .tabackup.')
  const snapshot: BackupSnapshot = {
    formatVersion: 1,
    createdAt: manifest.createdAt,
    settings: requiredJson(files, 'settings.json'),
    participants: requiredJson(files, 'participants.json'),
    equipment: requiredJson(files, 'equipment.json'),
    devices: requiredJson(files, 'devices.json'),
    calibrations: requiredJson(files, 'calibrations.json'),
    activityGroups: requiredJson(files, 'activity-groups.json'),
    sessions: requiredJson(files, 'sessions/index.json'),
    analysisProfiles: requiredJson(files, 'profiles/analysis.json'),
    analysisRuns: requiredJson(files, 'statistics/analysis-runs.json'),
  }
  const rawFiles = Object.fromEntries(
    Object.entries(files)
      .filter(([path]) => path.startsWith('sessions/raw/'))
      .map(([path, value]) => [path.slice('sessions/raw/'.length), value]),
  )
  return { snapshot, rawFiles }
}

export function migrateManifest(manifest: ArchiveManifest): ArchiveManifest {
  if (manifest.formatVersion === EXPORT_FORMAT_VERSION) return manifest
  if (manifest.formatVersion === 0) return { ...manifest, formatVersion: 1, schemaVersion: manifest.schemaVersion ?? 1 }
  throw new Error(`Version d’archive non prise en charge : ${manifest.formatVersion}.`)
}
