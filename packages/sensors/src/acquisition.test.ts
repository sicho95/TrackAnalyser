import type { SensorCapabilities, SensorSample, SensorSource } from '@track-analyser/domain'
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
    expect(reference.chunkCount).toBe(1)
    expect(completed?.status).toBe('COMPLETED')
    expect(completed?.analysisStatus).toBe('PENDING')
    expect(completed?.activeRawStreamId).toBeUndefined()
    expect(completed?.rawDataReferences[0]?.id).toBe(reference.id)
    const storedChunks: Uint8Array[] = []
    for await (const chunk of rawStore.read(reference)) storedChunks.push(chunk)
    expect(storedChunks).toHaveLength(1)
    expect(new TextDecoder().decode(storedChunks[0]).trim().split('\n')).toHaveLength(101)
  })
})
