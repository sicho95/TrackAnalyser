import type { ImportResult, SensorCapabilities, SensorSample, SensorSource } from '@track-analyser/domain'

export class ImportedFileSource implements SensorSource {
  private readonly listeners = new Set<(sample: SensorSample) => void>()
  private started = false

  constructor(private readonly result: ImportResult) {}

  async start(): Promise<void> {
    this.started = true
    for (const sample of this.result.samples) {
      if (!this.started) break
      this.listeners.forEach((listener) => listener(sample))
    }
  }

  async stop(): Promise<void> {
    this.started = false
  }

  async getCapabilities(): Promise<SensorCapabilities> {
    const groups = Map.groupBy(this.result.samples, (sample) => sample.channel)
    return {
      channels: [...groups.entries()].map(([channel, samples]) => ({
        channel,
        declared: true,
        observed: samples.length > 0,
        coverage: samples[0]?.provenance.coverage ?? 0,
        quality: samples.reduce((sum, sample) => sum + sample.quality, 0) / Math.max(1, samples.length),
      })),
      measuredAt: new Date().toISOString(),
    }
  }

  subscribe(callback: (sample: SensorSample) => void): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }
}
