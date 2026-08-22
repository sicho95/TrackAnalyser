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
    while (true) {
      const chunk = this.chunks.shift()
      if (chunk !== undefined) yield chunk
      else if (this.closed) return
      else await new Promise<void>((resolve) => this.waiters.push(resolve))
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
  private checkpointPromise: Promise<void> = Promise.resolve()
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
    const streamId = `raw-${session.id}-${crypto.randomUUID()}`
    const recordingSession = { ...session, activeRawStreamId: streamId }
    this.session = recordingSession
    this.state = { status: 'STARTING', sampleCount: 0, sourceErrors: [] }
    await this.checkpoints.markRecording(recordingSession)
    this.writePromise = this.rawStore.write(streamId, this.queue, {
      sessionId: session.id,
      sourceId: 'phone',
      mediaType: 'application/x-ndjson',
    })
    this.sources.forEach((source) => this.unsubscribe.push(source.subscribe((sample) => this.onSample(sample))))
    try {
      const starts = await Promise.allSettled(this.sources.map((source) => source.start()))
      const errors = starts.flatMap((result) => result.status === 'rejected' ? [String(result.reason)] : [])
      if (errors.length === starts.length) throw new Error(`Aucune source disponible : ${errors.join(' ; ')}`)
      this.state = { ...this.state, status: 'RECORDING', sourceErrors: errors }
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
    await this.checkpointPromise
    this.queue.close()
    const reference = await this.writePromise
    const completedSession = { ...session, analysisStatus: 'PENDING' as const, rawDataReferences: [...session.rawDataReferences, reference] }
    delete completedSession.activeRawStreamId
    await this.checkpoints.complete(completedSession)
    this.state = { ...this.state, status: 'IDLE' }
    return reference
  }

  private onSample(sample: SensorSample): void {
    this.queue.push(this.encoder.encode(`${JSON.stringify(sample)}\n`))
    this.checkpointSamples.push(sample)
    this.state = { ...this.state, sampleCount: this.state.sampleCount + 1, lastTimestamp: sample.timestamp }
    if (this.checkpointSamples.length >= 100 && this.session !== undefined) {
      const samples = this.checkpointSamples
      const session = this.session
      this.checkpointSamples = []
      this.checkpointPromise = this.checkpointPromise
        .then(async () => { await this.checkpoints.checkpoint(session, samples) })
        .catch((error: unknown) => {
          this.state = { ...this.state, sourceErrors: [...this.state.sourceErrors, `Checkpoint : ${String(error)}`] }
        })
    }
  }

  private async stopSources(): Promise<void> {
    this.unsubscribe.splice(0).forEach((unsubscribe) => unsubscribe())
    await Promise.allSettled(this.sources.map((source) => source.stop()))
  }
}
