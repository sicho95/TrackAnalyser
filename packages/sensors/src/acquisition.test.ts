import { COMPACT_RAW_MEDIA_TYPE, decodeCompactRaw, type SensorCapabilities, type SensorSample, type SensorSource } from '@track-analyser/domain'
import { LocalRepositories, ProgressiveRawStore, SessionCheckpointService, deleteTrackAnalyserDatabaseForTests } from '@track-analyser/storage'
import { beforeEach, describe, expect, it } from 'vitest'
import { sample, session } from '../../../tests/helpers'
import { AcquisitionCoordinator } from './acquisition'

class TestSource implements SensorSource {
  private readonly listeners = new Set<(sample: SensorSample) => void>()

  async start(): Promise<void> {
    for (let index = 0; index < 101; index += 1) {
      const value = sample('speed', 12, 1_000 + index, 'phone')
      this.listeners.forEach((listener) => listener(value))
    }
  }

  stop(): Promise<void> { return Promise.resolve() }

  async getCapabilities(): Promise<SensorCapabilities> {
    return { channels: [] }
  }

  subscribe(callback: (sample: SensorSample) => void): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }
}

describe('coordinateur d’acquisition résilient', () => {
  beforeEach(async () => deleteTrackAnalyserDatabaseForTests())

  it('persiste l’identité du flux avant les mesures puis sauvegarde avant analyse', async () => {
    const repositories = await LocalRepositories.open()
    const current = { ...session('recorded', 'damien'), status: 'DRAFT' as const }
    delete current.endTime
    await repositories.sessions.put(current)
    const rawStore = new ProgressiveRawStore()
    const coordinator = new AcquisitionCoordinator([new TestSource()], rawStore, new SessionCheckpointService(repositories))

    await coordinator.start(current)
    const recording = await repositories.sessions.get(current.id)
    expect(recording?.status).toBe('RECORDING')
    expect(recording?.activeRawStreamId).toMatch(/^raw-recorded-/)

    const reference = await coordinator.stop()
    const completed = await repositories.sessions.get(current.id)
    expect(reference.chunkCount).toBeGreaterThan(0)
    expect(reference).toMatchObject({ mediaType: COMPACT_RAW_MEDIA_TYPE, formatVersion: 2 })
    expect(completed?.status).toBe('COMPLETED')
    expect(completed?.analysisStatus).toBe('PENDING')
    expect(completed?.activeRawStreamId).toBeUndefined()
    expect(completed?.rawDataReferences[0]?.id).toBe(reference.id)
    const storedChunks: Uint8Array[] = []
    for await (const chunk of rawStore.read(reference)) storedChunks.push(chunk)
    expect(storedChunks).toHaveLength(reference.chunkCount)
    const decoded: SensorSample[] = []
    for await (const sample of decodeCompactRaw(chunks(storedChunks))) decoded.push(sample)
    expect(decoded).toHaveLength(101)
    expect(decoded.at(-1)?.timestamp).toBe(1_100)
  })
})

async function* chunks(values: readonly Uint8Array[]): AsyncGenerator<Uint8Array> {
  for (const value of values) yield value
}
