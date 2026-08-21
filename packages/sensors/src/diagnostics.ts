import type { MetricChannel, SensorCapability, SensorSample } from '@track-analyser/domain'

export class SourceDiagnostics {
  private readonly timestamps = new Map<MetricChannel, number[]>()
  private readonly accuracies = new Map<MetricChannel, number[]>()

  observe(sample: SensorSample): void {
    const timestamps = this.timestamps.get(sample.channel) ?? []
    timestamps.push(sample.timestamp)
    if (timestamps.length > 2_000) timestamps.shift()
    this.timestamps.set(sample.channel, timestamps)
    if (sample.accuracy !== undefined) {
      const accuracies = this.accuracies.get(sample.channel) ?? []
      accuracies.push(sample.accuracy)
      if (accuracies.length > 2_000) accuracies.shift()
      this.accuracies.set(sample.channel, accuracies)
    }
  }

  capability(channel: MetricChannel, declared: boolean): SensorCapability {
    const timestamps = this.timestamps.get(channel) ?? []
    const intervals = timestamps.slice(1).map((timestamp, index) => timestamp - (timestamps[index] ?? timestamp)).filter((value) => value > 0)
    const meanInterval = intervals.length === 0 ? undefined : intervals.reduce((sum, value) => sum + value, 0) / intervals.length
    const variance =
      meanInterval === undefined || intervals.length === 0
        ? undefined
        : intervals.reduce((sum, value) => sum + (value - meanInterval) ** 2, 0) / intervals.length
    const gapThreshold = (meanInterval ?? 1_000) * 3
    const gaps = intervals.filter((interval) => interval > gapThreshold).length
    const span = timestamps.length < 2 ? 0 : (timestamps.at(-1) ?? 0) - (timestamps[0] ?? 0)
    const covered = intervals.reduce((sum, interval) => sum + Math.min(interval, gapThreshold), 0)
    const accuracies = this.accuracies.get(channel) ?? []
    return {
      channel,
      declared,
      observed: timestamps.length > 0,
      ...(meanInterval === undefined ? {} : { observedFrequencyHz: 1000 / meanInterval }),
      ...(variance === undefined ? {} : { jitterMs: Math.sqrt(variance) }),
      gapCount: gaps,
      coverage: span <= 0 ? 0 : Math.min(1, covered / span),
      ...(accuracies.length === 0 ? {} : { accuracy: accuracies.reduce((sum, value) => sum + value, 0) / accuracies.length }),
      quality: this.quality(channel),
    }
  }

  quality(channel: MetricChannel): number {
    const timestamps = this.timestamps.get(channel) ?? []
    if (timestamps.length < 2) return timestamps.length === 1 ? 0.4 : 0
    const capability = this.capabilityWithoutQuality(channel)
    const coverage = capability.coverage ?? 0
    const jitter = capability.jitterMs ?? 1_000
    const jitterScore = 1 / (1 + jitter / 50)
    const accuracy = capability.accuracy
    const accuracyScore = accuracy === undefined ? 0.75 : 1 / (1 + accuracy / 10)
    return Math.max(0, Math.min(1, coverage * 0.5 + jitterScore * 0.25 + accuracyScore * 0.25))
  }

  private capabilityWithoutQuality(channel: MetricChannel): Omit<SensorCapability, 'quality'> {
    const timestamps = this.timestamps.get(channel) ?? []
    const intervals = timestamps.slice(1).map((timestamp, index) => timestamp - (timestamps[index] ?? timestamp)).filter((value) => value > 0)
    const meanInterval = intervals.length === 0 ? undefined : intervals.reduce((sum, value) => sum + value, 0) / intervals.length
    const variance =
      meanInterval === undefined || intervals.length === 0
        ? undefined
        : intervals.reduce((sum, value) => sum + (value - meanInterval) ** 2, 0) / intervals.length
    const gapThreshold = (meanInterval ?? 1_000) * 3
    const span = timestamps.length < 2 ? 0 : (timestamps.at(-1) ?? 0) - (timestamps[0] ?? 0)
    const accuracies = this.accuracies.get(channel) ?? []
    return {
      channel,
      declared: true,
      observed: timestamps.length > 0,
      ...(meanInterval === undefined ? {} : { observedFrequencyHz: 1000 / meanInterval }),
      ...(variance === undefined ? {} : { jitterMs: Math.sqrt(variance) }),
      gapCount: intervals.filter((interval) => interval > gapThreshold).length,
      coverage: span <= 0 ? 0 : intervals.reduce((sum, interval) => sum + Math.min(interval, gapThreshold), 0) / span,
      ...(accuracies.length === 0 ? {} : { accuracy: accuracies.reduce((sum, value) => sum + value, 0) / accuracies.length }),
    }
  }
}

