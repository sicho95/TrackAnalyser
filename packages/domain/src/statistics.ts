import type { MetricStatistics } from './types'

function sortedFinite(values: readonly number[]): number[] {
  return values.filter(Number.isFinite).toSorted((left, right) => left - right)
}

export function percentile(values: readonly number[], probability: number): number {
  const sorted = sortedFinite(values)
  if (sorted.length === 0) return Number.NaN
  const index = Math.min(sorted.length - 1, Math.max(0, (sorted.length - 1) * probability))
  const lowerIndex = Math.floor(index)
  const upperIndex = Math.ceil(index)
  const lower = sorted[lowerIndex] ?? Number.NaN
  const upper = sorted[upperIndex] ?? lower
  return lower + (upper - lower) * (index - lowerIndex)
}

export function statistics(values: readonly number[]): MetricStatistics | undefined {
  const sorted = sortedFinite(values)
  if (sorted.length === 0) return undefined
  const count = sorted.length
  const mean = sorted.reduce((sum, value) => sum + value, 0) / count
  const variance = sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / count
  const rms = Math.sqrt(sorted.reduce((sum, value) => sum + value ** 2, 0) / count)
  return {
    count,
    minimum: sorted[0] ?? Number.NaN,
    maximum: sorted.at(-1) ?? Number.NaN,
    mean,
    median: percentile(sorted, 0.5),
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    rms,
    variance,
    standardDeviation: Math.sqrt(variance),
  }
}

export function haversineDistanceMeters(
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number },
): number {
  const earthRadius = 6_371_000
  const radians = Math.PI / 180
  const latitudeDelta = (right.latitude - left.latitude) * radians
  const longitudeDelta = (right.longitude - left.longitude) * radians
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(left.latitude * radians) * Math.cos(right.latitude * radians) * Math.sin(longitudeDelta / 2) ** 2
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .toSorted()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}

export function deterministicHash(value: unknown): string {
  const text = stableStringify(value)
  let hash = 2_166_136_261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
