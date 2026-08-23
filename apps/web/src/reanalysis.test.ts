import { COMPACT_RAW_MEDIA_TYPE, CompactRawEncoder, type RawDataReference, type SensorSample } from '@track-analyser/domain'
import { describe, expect, it } from 'vitest'
import { decodeSampleNdjson, iterateAnalysisSampleBatches, replayRawSamples, type RawReader } from './reanalysis'

const samples: SensorSample[] = [
  { timestamp: 2_000, channel: 'speed', value: 4, unit: 'm/s', sourceId: 'phone', quality: 1, stage: 'RAW', provenance: { sourceId: 'phone', channel: 'speed', sampleCount: 1, coverage: 1, quality: 1, method: 'mesure', original: true } },
  { timestamp: 1_000, channel: 'speed', value: 2, unit: 'm/s', sourceId: 'phone', quality: 1, stage: 'RAW', provenance: { sourceId: 'phone', channel: 'speed', sampleCount: 1, coverage: 1, quality: 1, method: 'mesure', original: true } },
]

const reference: RawDataReference = {
  id: 'raw', sessionId: 'session', sourceId: 'phone', storage: 'INDEXED_DB', path: 'raw',
  mediaType: 'application/x-ndjson', byteLength: 1, sha256: 'sha', chunkCount: 2, immutable: true,
  createdAt: '2026-08-21T00:00:00.000Z',
}

describe('rejeu des RAW', () => {
  it('décode un flux NDJSON même lorsqu’une ligne traverse deux chunks', async () => {
    const text = samples.map((sample) => JSON.stringify(sample)).join('\n')
    const split = Math.floor(text.length / 2)
    async function* chunks(): AsyncGenerator<Uint8Array> {
      yield new TextEncoder().encode(text.slice(0, split))
      yield new TextEncoder().encode(text.slice(split))
    }
    expect(await decodeSampleNdjson(chunks())).toEqual(samples)
  })

  it('reclasse les mesures rejouées par timestamp sans les altérer', async () => {
    const reader: RawReader = {
      async *read(): AsyncGenerator<Uint8Array> {
        yield new TextEncoder().encode(samples.map((sample) => JSON.stringify(sample)).join('\n'))
      },
    }
    const replayed = await replayRawSamples([reference], reader)
    expect(replayed.map((sample) => sample.timestamp)).toEqual([1_000, 2_000])
    expect(samples.map((sample) => sample.timestamp)).toEqual([2_000, 1_000])
  })

  it('filtre les canaux pendant la relecture streaming destinée à un export', async () => {
    const geographic = [
      { ...samples[0], timestamp: 1_000, channel: 'position' as const, value: { latitude: 44.84, longitude: -0.58 }, unit: 'WGS84' },
      { ...samples[0], timestamp: 1_001, channel: 'acceleration' as const, value: 2.5, unit: 'm/s²' },
      { ...samples[0], timestamp: 1_002, channel: 'altitude' as const, value: 31, unit: 'm' },
    ]
    const reader: RawReader = {
      async *read(): AsyncGenerator<Uint8Array> {
        yield new TextEncoder().encode(geographic.map((sample) => JSON.stringify(sample)).join('\n'))
      },
    }
    const replayed = await replayRawSamples([reference], reader, ['position', 'altitude'])

    expect(replayed.map((sample) => sample.channel)).toEqual(['position', 'altitude'])
  })

  it('parcourt dix heures en fenêtres bornées sans charger la Session complète', async () => {
    const tenHours = 10 * 60 * 60
    const compactReference: RawDataReference = {
      ...reference,
      mediaType: COMPACT_RAW_MEDIA_TYPE,
      formatVersion: 2,
    }
    const reader: RawReader = {
      async *read(): AsyncGenerator<Uint8Array> {
        const encoder = new CompactRawEncoder()
        const base = samples[0]
        if (base === undefined) return
        yield encoder.header()
        for (let second = 0; second <= tenHours; second += 1) {
          const current = { ...base, timestamp: 1_000 + second * 1_000, value: 10 + Math.sin(second / 60) }
          for (const chunk of encoder.push(current)) yield chunk
        }
        for (const chunk of encoder.finish()) yield chunk
      },
    }
    const batches: SensorSample[][] = []
    for await (const batch of iterateAnalysisSampleBatches([compactReference], reader)) batches.push(batch)

    expect(batches.length).toBeGreaterThanOrEqual(120)
    expect(Math.max(...batches.map((batch) => batch.length))).toBeLessThanOrEqual(302)
    expect(batches[0]?.[0]?.timestamp).toBe(1_000)
    expect(batches.at(-1)?.at(-1)?.timestamp).toBe(1_000 + tenHours * 1_000)
  }, 20_000)

  it('coupe aussi une rafale selon la borne de mesures', async () => {
    const reader: RawReader = {
      async *read(): AsyncGenerator<Uint8Array> {
        const encoder = new CompactRawEncoder()
        const base = samples[0]
        if (base === undefined) return
        yield encoder.header()
        for (let index = 0; index < 5_000; index += 1) {
          for (const chunk of encoder.push({ ...base, timestamp: 1_000 + index })) yield chunk
        }
        for (const chunk of encoder.finish()) yield chunk
      },
    }
    const compactReference = { ...reference, mediaType: COMPACT_RAW_MEDIA_TYPE, formatVersion: 2 }
    const sizes: number[] = []
    for await (const batch of iterateAnalysisSampleBatches([compactReference], reader, { maximumDurationMs: 60_000, maximumSamples: 1_000 })) sizes.push(batch.length)

    expect(sizes.length).toBeGreaterThanOrEqual(5)
    expect(Math.max(...sizes)).toBeLessThanOrEqual(1_001)
  })
})
