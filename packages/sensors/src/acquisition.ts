import type { RawDataReference, SensorSample, SensorSource, Session } from '@track-analyser/domain'
import { ProgressiveRawStore, SessionCheckpointService } from '@track-analyser/storage'

class AsyncChunkQueue implements AsyncIterable<Uint8Array> {
  private readonly chunks: Uint8Array[] = []
  private readonly waiters: Array<() => void> = []
  private closed = false

  push(chunk: Uint8Array): void {
    if (this.closed) throw new Error('Le flux RAW est déjà fermé.')
    this.chunks.push(chunk)
    this.waiters.shift()?.()
  }

  close(): void {
    this.closed = true
    this.waiters.splice(0).forEach((resolve) => resolve())
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
    while (!this.closed || this.chunks.length > 0) {
      if (this.chunks.length === 0) await new Promise<void>((resolve) => this.waiters.push(resolve))
      const chunk = this.chunks.shift()
      if (chunk !== undefined) yield chunk
    }
  }
}

export interface AcquisitionState {
  status: 'IDLE' | 'STARTING' | 'RECORDING' | 'STOPPING' | 'ERROR'
  sampleCount: number
  lastTimestamp?: number
  sourceErrors: string[]
}

export class AcquisitionCoordinator {
  private readonly queue = new AsyncChunkQueue()
  private readonly encoder = new TextEncoder()
  private readonly unsubscribe: Array<() => void> = []
  private writePromise: Promise<RawDataReference> | undefined
  private session: Session | undefined
  private checkpointSamples: SensorSample[] = []
  private state: AcquisitionState = { status: 'IDLE', sampleCount: 0, sourceErrors: [] }

  constructor(
    private readonly sources: readonly SensorSource[],
    private readonly rawStore: ProgressiveRawStore,
    private readonly checkpoints: SessionCheckpointService,
  ) {}

  getState(): AcquisitionState {
    return { ...this.state, sourceErrors: [...this.state.sourceErrors] }
  }

  async start(session: Session): Promise<void> {
    if (session.participantId.length === 0) throw new Error('Sélectionner un participant avant l’enregistrement.')
    if (this.state.status !== 'IDLE') throw new Error('Une acquisition est déjà active.')
    this.session = session
    this.state = { status: 'STARTING', sampleCount: 0, sourceErrors: [] }
    await this.checkpoints.markRecording(session)
    const streamId = `raw-${session.id}-${crypto.randomUUID()}`
    this.writePromise = this.rawStore.write(streamId, this.queue, {
      sessionId: session.id,
      sourceId: 'phone',
      mediaType: 'application/x-ndjson',
    })
    this.sources.forEach((source) => this.unsubscribe.push(source.subscribe((sample) => void this.onSample(sample))))
    try {
      await Promise.all(this.sources.map((source) => source.start()))
      this.state = { ...this.state, status: 'RECORDING' }
    } catch (error) {
      this.state = { ...this.state, status: 'ERROR', sourceErrors: [...this.state.sourceErrors, String(error)] }
      await this.stopSources()
      throw error
    }
  }

  async stop(): Promise<RawDataReference> {
    const session = this.session
    if (session === undefined || this.writePromise === undefined) throw new Error('Aucune acquisition active.')
    this.state = { ...this.state, status: 'STOPPING' }
    await this.stopSources()
    this.queue.close()
    const reference = await this.writePromise
    await this.checkpoints.complete({ ...session, rawDataReferences: [...session.rawDataReferences, reference] })
    this.state = { ...this.state, status: 'IDLE' }
    return reference
  }

  private async onSample(sample: SensorSample): Promise<void> {
    this.queue.push(this.encoder.encode(`${JSON.stringify(sample)}\n`))
    this.checkpointSamples.push(sample)
    this.state = { ...this.state, sampleCount: this.state.sampleCount + 1, lastTimestamp: sample.timestamp }
    if (this.checkpointSamples.length >= 100 && this.session !== undefined) {
      const samples = this.checkpointSamples
      this.checkpointSamples = []
      await this.checkpoints.checkpoint(this.session, samples)
    }
  }

  private async stopSources(): Promise<void> {
    this.unsubscribe.splice(0).forEach((unsubscribe) => unsubscribe())
    await Promise.allSettled(this.sources.map((source) => source.stop()))
  }
}

