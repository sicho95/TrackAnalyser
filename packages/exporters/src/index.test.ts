import type { AnalysisRun } from '@track-analyser/domain'
import { describe, expect, it } from 'vitest'
import { participant, sample, session } from '../../../tests/helpers'
import { createBackupArchive, createTripArchive, exportSessionGpx, migrateManifest, restoreBackupArchive, restoreTripArchive } from './index'

const run: AnalysisRun = {
  id: 'run', sessionId: 'session', analysisVersion: '1', analysisProfileVersion: '1', engineBuildId: 'test',
  createdAt: '2026-08-21T10:00:00.000Z', isOriginal: true, metricsReference: 'metrics', eventsReference: 'events', inputFingerprint: 'abc',
  result: { activityType: 'RUNNING', metrics: [], events: [], warnings: [], visualizationSeries: {}, routePreview: [], quality: { gnss: 1, imu: 1, clock: 1, calibration: 1, coverage: 1, fusion: 1, confidence: 1 } },
}

describe('archives froides versionnées', () => {
  it('exporte une trace GPX 1.1 avec ses timestamps et l’altitude réellement mesurée', () => {
    const currentSession = { ...session('session', 'damien'), title: 'Kuga & trajet <court>' }
    const firstTimestamp = Date.parse('2026-08-21T10:00:00.000Z')
    const gpx = exportSessionGpx(currentSession, [
      sample('position', { latitude: 44.84, longitude: -0.58 }, firstTimestamp),
      sample('altitude', 31.4, firstTimestamp),
      sample('position', { latitude: 44.841, longitude: -0.579, altitude: 32.1 }, firstTimestamp + 1_000),
      sample('position', { latitude: 120, longitude: -0.57 }, firstTimestamp + 2_000),
    ])

    expect(gpx).toContain('<gpx version="1.1" creator="TrackAnalyser"')
    expect(gpx).toContain('<name>Kuga &amp; trajet &lt;court&gt;</name>')
    expect(gpx).toContain('<trkpt lat="44.84" lon="-0.58">\n        <ele>31.4</ele>')
    expect(gpx).toContain('<time>2026-08-21T10:00:01.000Z</time>')
    expect(gpx.match(/<trkpt /g)).toHaveLength(2)
  })

  it('refuse un GPX sans position valide au lieu d’inventer une trace', () => {
    expect(() => exportSessionGpx(session('session', 'damien'), [sample('altitude', 31, 1_000)])).toThrow(/Aucun point GPS/)
  })

  it('réimporte un .tatrip avec son RAW', () => {
    const currentSession = { ...session('session', 'damien'), analysisRunIds: ['run'], originalAnalysisRunId: 'run', latestAnalysisRunId: 'run' }
    const raw = new Uint8Array([1, 2, 3, 4])
    const tripSegment = { id: 'segment', sessionId: 'session', name: 'Montée', startTime: 1, endTime: 2, manual: true }
    const restored = restoreTripArchive(createTripArchive({ session: currentSession, analysisRuns: [run], segments: [tripSegment], samples: [], rawFiles: { 'activity.fit': raw } }))
    expect(restored.session).toEqual(currentSession)
    expect(restored.analysisRuns).toEqual([run])
    expect(restored.segments).toEqual([tripSegment])
    expect(restored.rawFiles['activity.fit']).toEqual(raw)
  })

  it('restaure tous les objets métier d’un .tabackup', () => {
    const currentParticipant = participant('damien')
    const currentSession = session('session', 'damien')
    const snapshot = {
      formatVersion: 1 as const,
      createdAt: '2026-08-21T10:00:00.000Z',
      settings: { schemaVersion: 4, theme: 'system' as const, locale: 'fr' as const, unitSystem: 'metric' as const, mapProvider: 'osm', pendingUpdate: false },
      participants: [currentParticipant], activityGroups: [], equipment: [], devices: [], calibrations: [], sessions: [currentSession], analysisProfiles: [], analysisRuns: [run],
      segments: [{ id: 'segment', sessionId: 'session', name: 'Montée', startTime: 1, endTime: 2, manual: true }],
    }
    const restored = restoreBackupArchive(createBackupArchive(snapshot, { 'raw.bin': new Uint8Array([7, 8]) }))
    expect(restored.snapshot).toMatchObject(snapshot)
    expect(restored.rawFiles['raw.bin']).toEqual(new Uint8Array([7, 8]))
  })

  it('migre explicitement un manifeste historique', () => {
    expect(migrateManifest({ format: 'tatrip', formatVersion: 0, schemaVersion: 1, createdAt: '2026-01-01T00:00:00.000Z' })).toMatchObject({ formatVersion: 2, schemaVersion: 1 })
    expect(migrateManifest({ format: 'tabackup', formatVersion: 1, schemaVersion: 3, createdAt: '2026-01-01T00:00:00.000Z' })).toMatchObject({ formatVersion: 2, schemaVersion: 3 })
    expect(() => migrateManifest({ format: 'tatrip', formatVersion: 99, schemaVersion: 1, createdAt: '2026-01-01T00:00:00.000Z' })).toThrow(/non prise en charge/)
  })
})
