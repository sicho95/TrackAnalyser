import { ACTIVITY_TYPES, attachAnalysisRun, comparableEventValues, createPipelineDataset, createVersionedAnalysisProfile, DEFAULT_ANALYSIS_PROFILES, deriveDataset, executeAnalysis, executeBatchedAnalysis, normalizedSegment, transitionDataset, type RawDataReference } from './index'
import { describe, expect, it } from 'vitest'
import { sample, session } from '../../../tests/helpers'

const samples = [
  sample('speed', 2, 1_000), sample('speed', 4, 2_000), sample('speed', 3, 3_000),
  sample('distance', 0, 1_000), sample('distance', 100, 3_000),
  sample('altitude', 100, 1_000), sample('altitude', 110, 2_000), sample('altitude', 105, 3_000),
  sample('verticalSpeed', 1, 1_000), sample('verticalSpeed', -0.5, 2_000),
  sample('heartRate', 140, 1_000), sample('cadence', 170, 1_000), sample('power', 280, 1_000),
  sample('roll', -0.2, 1_000), sample('roll', 0.25, 2_000), sample('pitch', 0.1, 1_000),
  sample('longitudinalAcceleration', -3.5, 1_000), sample('lateralAcceleration', 2.8, 2_000),
  sample('acceleration', 4, 1_000), sample('rotationRate', 0.2, 1_000),
]

describe('analyseurs V1', () => {
  it.each(ACTIVITY_TYPES)('analyse réellement %s et signale les canaux absents', (activityType) => {
    const currentSession = session(`session-${activityType}`, 'damien', activityType)
    const raw = createPipelineDataset(currentSession.id, currentSession.participantId, samples, 'RAW')
    const derived = deriveDataset({ ...transitionDataset(raw, 'NORMALIZED'), stage: 'FUSED' as const })
    const run = executeAnalysis(currentSession, derived, DEFAULT_ANALYSIS_PROFILES[activityType], [], {
      analysisVersion: '1.0.0', engineBuildId: 'test', now: '2026-08-21T12:00:00.000Z',
    })
    expect(run.result.activityType).toBe(activityType)
    expect(run.result.metrics.length).toBeGreaterThan(12)
    expect(run.result.metrics.some((metric) => metric.status === 'AVAILABLE')).toBe(true)
    expect(run.result.metrics.some((metric) => metric.status === 'UNAVAILABLE')).toBe(true)
  })

  it('rejoue les mêmes RAW et versions de façon déterministe', () => {
    const currentSession = session('replay', 'damien', 'RUNNING')
    const raw = createPipelineDataset(currentSession.id, currentSession.participantId, samples, 'RAW')
    const fused = deriveDataset({ ...transitionDataset(raw, 'NORMALIZED'), stage: 'FUSED' as const })
    const options = { analysisVersion: '1.0.0', engineBuildId: 'test', now: '2026-08-21T12:00:00.000Z' }
    const left = executeAnalysis(currentSession, fused, DEFAULT_ANALYSIS_PROFILES.RUNNING, [], options)
    const right = executeAnalysis(currentSession, fused, DEFAULT_ANALYSIS_PROFILES.RUNNING, [], options)
    expect(right).toEqual(left)
    expect(right.inputFingerprint).toBe(left.inputFingerprint)
  })

  it('fonde l’empreinte volumétrique sur le contenu RAW immutable', () => {
    const raw = createPipelineDataset('raw-fingerprint', 'damien', samples, 'RAW')
    const fused = deriveDataset({ ...transitionDataset(raw, 'NORMALIZED'), stage: 'FUSED' as const })
    const reference: RawDataReference = {
      id: 'raw-reference', sessionId: 'raw-fingerprint', sourceId: 'phone', storage: 'INDEXED_DB' as const, path: 'raw',
      mediaType: 'application/x-ndjson', byteLength: 100, sha256: 'raw-sha-a', chunkCount: 1, immutable: true,
      createdAt: '2026-08-23T00:00:00.000Z',
    }
    const currentSession = { ...session('raw-fingerprint', 'damien', 'RUNNING'), rawDataReferences: [reference] }
    const options = { analysisVersion: '1.0.1', engineBuildId: 'test', now: '2026-08-23T00:00:00.000Z' }
    const first = executeAnalysis(currentSession, fused, DEFAULT_ANALYSIS_PROFILES.RUNNING, [], options)
    const same = executeAnalysis(currentSession, fused, DEFAULT_ANALYSIS_PROFILES.RUNNING, [], options)
    const changed = executeAnalysis({ ...currentSession, rawDataReferences: [{ ...reference, sha256: 'raw-sha-b' }] }, fused, DEFAULT_ANALYSIS_PROFILES.RUNNING, [], options)

    expect(same.inputFingerprint).toBe(first.inputFingerprint)
    expect(changed.inputFingerprint).not.toBe(first.inputFingerprint)
  })

  it('combine des fenêtres bornées en une seule analyse reproductible', () => {
    const start = Date.parse('2026-08-21T10:00:00.000Z')
    const reference: RawDataReference = {
      id: 'raw-long', sessionId: 'long', sourceId: 'phone', storage: 'INDEXED_DB', path: 'raw-long',
      mediaType: 'application/vnd.track-analyser.raw;version=2', formatVersion: 2, byteLength: 100, sha256: 'long-sha', chunkCount: 1, immutable: true,
      createdAt: '2026-08-21T10:00:00.000Z',
    }
    const currentSession = {
      ...session('long', 'damien', 'RUNNING'),
      startTime: '2026-08-21T10:00:00.000Z',
      endTime: '2026-08-21T10:02:00.000Z',
      rawDataReferences: [reference],
    }
    const windowResult = (offset: number, distanceStart: number, distanceEnd: number) => {
      const raw = createPipelineDataset('long', 'damien', [
        sample('distance', distanceStart, start + offset, 'phone'),
        sample('distance', distanceEnd, start + offset + 60_000, 'phone'),
        sample('speed', 10, start + offset, 'phone'),
        sample('speed', 10, start + offset + 60_000, 'phone'),
      ], 'RAW')
      const derived = deriveDataset({ ...transitionDataset(raw, 'NORMALIZED'), stage: 'FUSED' as const })
      return executeAnalysis(currentSession, derived, DEFAULT_ANALYSIS_PROFILES.RUNNING, [], { analysisVersion: '1.1.0', engineBuildId: 'test' }).result
    }
    const run = executeBatchedAnalysis(currentSession, [windowResult(0, 0, 1_000), windowResult(60_000, 1_000, 2_000)], DEFAULT_ANALYSIS_PROFILES.RUNNING, [], {
      analysisVersion: '1.1.0', engineBuildId: 'test', now: '2026-08-23T00:00:00.000Z',
    })

    expect(run.result.metrics.find((metric) => metric.id === 'distance')?.value).toBe(2_000)
    expect(run.result.metrics.find((metric) => metric.id === 'duration')?.value).toBe(120)
    expect(run.result.metrics.find((metric) => metric.id === 'pace.mean')?.value).toBe(60)
    expect(run.result.warnings).toContain('Analyse séquentielle de 2 fenêtres bornées ; RAW original intégral conservé.')
  })

  it('n’invente ni ligne droite ni distance pendant une suspension des capteurs', () => {
    const start = Date.parse('2026-08-21T10:00:00.000Z')
    const currentSession = {
      ...session('suspended', 'damien', 'CAR'),
      startTime: new Date(start).toISOString(),
      endTime: new Date(start + 60 * 60_000).toISOString(),
    }
    const windowResult = (timestamp: number, latitude: number) => {
      const raw = createPipelineDataset(currentSession.id, currentSession.participantId, [
        sample('position', { latitude, longitude: 2 }, timestamp, 'gps'),
        sample('position', { latitude: latitude + 0.001, longitude: 2 }, timestamp + 10_000, 'gps'),
      ], 'RAW')
      const derived = deriveDataset({ ...transitionDataset(raw, 'NORMALIZED'), stage: 'FUSED' as const })
      return executeAnalysis(currentSession, derived, DEFAULT_ANALYSIS_PROFILES.CAR, [], { analysisVersion: '1.2.0', engineBuildId: 'test' }).result
    }

    const run = executeBatchedAnalysis(currentSession, [windowResult(start, 46), windowResult(start + 50 * 60_000, 48)], DEFAULT_ANALYSIS_PROFILES.CAR, [], {
      analysisVersion: '1.2.0', engineBuildId: 'test', now: '2026-08-23T00:00:00.000Z',
    })

    expect(run.result.routePreviewSegments).toHaveLength(2)
    expect(run.result.metrics.find((metric) => metric.id === 'distance')?.value).toBeLessThan(300)
    expect(run.result.quality.coverage).toBeCloseTo(20 / 3_600)
    expect(run.result.metrics.find((metric) => metric.id === 'duration')?.value).toBe(3_600)
    expect(run.result.warnings.some((warning) => warning.includes('Couverture temporelle'))).toBe(true)
  })

  it('conserve l’analyse originale quand une nouvelle version est attachée', () => {
    const currentSession = session('history', 'damien', 'RUNNING')
    const raw = createPipelineDataset(currentSession.id, currentSession.participantId, samples, 'RAW')
    const fused = deriveDataset({ ...transitionDataset(raw, 'NORMALIZED'), stage: 'FUSED' as const })
    const original = executeAnalysis(currentSession, fused, DEFAULT_ANALYSIS_PROFILES.RUNNING, [], { analysisVersion: '1.0.0', engineBuildId: 'a', now: '2026-08-21T12:00:00.000Z' })
    const afterOriginal = attachAnalysisRun(currentSession, original)
    const latest = executeAnalysis(afterOriginal, fused, DEFAULT_ANALYSIS_PROFILES.RUNNING, [original], { analysisVersion: '1.1.0', engineBuildId: 'b', now: '2026-08-22T12:00:00.000Z' })
    const finalSession = attachAnalysisRun(afterOriginal, latest)
    expect(finalSession.originalAnalysisRunId).toBe(original.id)
    expect(finalSession.latestAnalysisRunId).toBe(latest.id)
    expect(finalSession.analysisRunIds).toEqual([original.id, latest.id])
    expect(original.isOriginal).toBe(true)
    expect(latest.isOriginal).toBe(false)
  })

  it('crée un nouveau profil immutable sans modifier le profil source', () => {
    const source = DEFAULT_ANALYSIS_PROFILES.RUNNING
    const next = createVersionedAnalysisProfile(
      source,
      '1.1.0',
      'Course calibrée terrain',
      { ...source.parameters, movingSpeedThresholdMps: 0.9 },
      { id: 'running-1.1.0', createdAt: '2026-08-22T12:00:00.000Z' },
    )
    expect(next.version).toBe('1.1.0')
    expect(next.parameters.movingSpeedThresholdMps).toBe(0.9)
    expect(source.parameters.movingSpeedThresholdMps).toBe(0.8)
    expect(() => createVersionedAnalysisProfile(source, source.version, 'Doublon', source.parameters)).toThrow(/différer/)
  })

  it('extrait une fenêtre de segment et filtre des événements comparables', () => {
    expect(normalizedSegment([0, 1, 2, 3, 4, 5], 25, 75)).toEqual([1, 2, 3, 4])
    expect(comparableEventValues([
      { type: 'freinage', severity: 0.8, metrics: { speed: 12 } },
      { type: 'virage', severity: 0.4, metrics: { speed: 8 } },
    ], 'freinage', 'speed')).toEqual([12])
    expect(comparableEventValues([
      { type: 'virage', severity: 0.4, metrics: { speed: 8 }, context: { type: 'turn', radius: 24, quality: 0.9 } },
      { type: 'virage', severity: 0.5, metrics: { speed: 9 }, context: { type: 'turn', radius: 120, quality: 0.9 } },
    ], 'virage', 'speed', { type: 'turn', radius: 20, quality: 0.9 })).toEqual([8])
    expect(() => normalizedSegment([1], 80, 20)).toThrow(/segment comparable/)
  })
})
