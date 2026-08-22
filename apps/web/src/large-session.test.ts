import { createPipelineDataset, DEFAULT_ANALYSIS_PROFILES, deriveDataset, executeAnalysis, transitionDataset, type RawDataReference, type SensorSample } from '@track-analyser/domain'
import { DataFusionEngine, synchronizeByUtc } from '@track-analyser/fusion'
import { describe, expect, it } from 'vitest'
import { session } from '../../../tests/helpers'
import { replayRawSamples, type RawReader } from './reanalysis'

const LARGE_SAMPLE_COUNT = 130_000

const rawReference: RawDataReference = {
  id: 'raw-large', sessionId: 'large', sourceId: 'phone', storage: 'INDEXED_DB', path: 'raw-large',
  mediaType: 'application/x-ndjson', byteLength: 1, sha256: 'large-raw-sha', chunkCount: 130, immutable: true,
  createdAt: '2026-08-22T13:51:31.175Z',
}

function largeSample(index: number): SensorSample {
  return {
    timestamp: 1_787_406_685_091 + index,
    channel: 'custom:stress',
    value: index % 100,
    unit: 'u',
    sourceId: 'phone:motion',
    quality: 0.8,
    stage: 'RAW',
    provenance: { sourceId: 'phone:motion', channel: 'custom:stress', sampleCount: 1, coverage: 1, quality: 0.8, method: 'fixture volumineuse', original: true },
  }
}

describe('analyse des grosses sessions Safari', () => {
  it('rejoue plus de mesures que la limite d’arguments JavaScript sans débordement de pile', async () => {
    const reader: RawReader = {
      async *read(): AsyncGenerator<Uint8Array> {
        const encoder = new TextEncoder()
        const batchSize = 1_000
        for (let start = 0; start < LARGE_SAMPLE_COUNT; start += batchSize) {
          const lines = Array.from({ length: Math.min(batchSize, LARGE_SAMPLE_COUNT - start) }, (_, offset) => JSON.stringify(largeSample(start + offset)))
          yield encoder.encode(`${lines.join('\n')}\n`)
        }
      },
    }

    const replayed = await replayRawSamples([rawReference], reader)

    expect(replayed).toHaveLength(LARGE_SAMPLE_COUNT)
    expect(replayed.at(-1)?.timestamp).toBe(1_787_406_685_091 + LARGE_SAMPLE_COUNT - 1)
  }, 20_000)

  it('exécute le pipeline complet sans convertir les grands tableaux en arguments de fonction', () => {
    const samples = Array.from({ length: LARGE_SAMPLE_COUNT }, (_, index) => largeSample(index))
    const currentSession = { ...session('large', 'damien', 'GENERIC'), rawDataReferences: [rawReference] }
    let dataset = createPipelineDataset(currentSession.id, currentSession.participantId, samples, 'RAW')
    dataset = transitionDataset(dataset, 'NORMALIZED')
    dataset = synchronizeByUtc(dataset)
    dataset = new DataFusionEngine('1.0.1').fuse(dataset, []).dataset
    dataset = deriveDataset(dataset)

    const run = executeAnalysis(currentSession, dataset, DEFAULT_ANALYSIS_PROFILES.GENERIC, [], {
      analysisVersion: '1.0.1', engineBuildId: 'test', now: '2026-08-23T00:00:00.000Z',
    })

    expect(run.result.visualizationSeries['custom:stress']).toHaveLength(500)
    expect(run.inputFingerprint).toMatch(/^[0-9a-f]{8}$/)
  }, 20_000)
})
