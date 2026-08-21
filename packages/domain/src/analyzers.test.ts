import { ACTIVITY_TYPES, attachAnalysisRun, createPipelineDataset, DEFAULT_ANALYSIS_PROFILES, deriveDataset, executeAnalysis, transitionDataset } from './index'
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
})
