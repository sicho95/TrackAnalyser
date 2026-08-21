import type { AnalysisRun } from '@track-analyser/domain'
import { describe, expect, it } from 'vitest'
import { participant, session } from '../../../tests/helpers'
import { createBackupArchive, createTripArchive, migrateManifest, restoreBackupArchive, restoreTripArchive } from './index'

const run: AnalysisRun = {
  id: 'run', sessionId: 'session', analysisVersion: '1', analysisProfileVersion: '1', engineBuildId: 'test',
  createdAt: '2026-08-21T10:00:00.000Z', isOriginal: true, metricsReference: 'metrics', eventsReference: 'events', inputFingerprint: 'abc',
  result: { activityType: 'RUNNING', metrics: [], events: [], warnings: [], visualizationSeries: {}, routePreview: [], quality: { gnss: 1, imu: 1, clock: 1, calibration: 1, coverage: 1, fusion: 1, confidence: 1 } },
}

describe('archives froides versionnées', () => {
  it('réimporte un .tatrip avec son RAW', () => {
    const currentSession = { ...session('session', 'damien'), analysisRunIds: ['run'], originalAnalysisRunId: 'run', latestAnalysisRunId: 'run' }
    const raw = new Uint8Array([1, 2, 3, 4])
    const restored = restoreTripArchive(createTripArchive({ session: currentSession, analysisRuns: [run], samples: [], rawFiles: { 'activity.fit': raw } }))
    expect(restored.session).toEqual(currentSession)
    expect(restored.analysisRuns).toEqual([run])
    expect(restored.rawFiles['activity.fit']).toEqual(raw)
  })

  it('restaure tous les objets métier d’un .tabackup', () => {
    const currentParticipant = participant('damien')
    const currentSession = session('session', 'damien')
    const snapshot = {
      formatVersion: 1 as const,
      createdAt: '2026-08-21T10:00:00.000Z',
      settings: { schemaVersion: 3, theme: 'system' as const, locale: 'fr' as const, unitSystem: 'metric' as const, mapProvider: 'osm', pendingUpdate: false },
      participants: [currentParticipant], activityGroups: [], equipment: [], devices: [], calibrations: [], sessions: [currentSession], analysisProfiles: [], analysisRuns: [run],
    }
    const restored = restoreBackupArchive(createBackupArchive(snapshot, { 'raw.bin': new Uint8Array([7, 8]) }))
    expect(restored.snapshot).toMatchObject(snapshot)
    expect(restored.rawFiles['raw.bin']).toEqual(new Uint8Array([7, 8]))
  })

  it('migre explicitement un manifeste historique', () => {
    expect(migrateManifest({ format: 'tatrip', formatVersion: 0, schemaVersion: 1, createdAt: '2026-01-01T00:00:00.000Z' })).toMatchObject({ formatVersion: 1, schemaVersion: 1 })
    expect(() => migrateManifest({ format: 'tatrip', formatVersion: 99, schemaVersion: 1, createdAt: '2026-01-01T00:00:00.000Z' })).toThrow(/non prise en charge/)
  })
})
