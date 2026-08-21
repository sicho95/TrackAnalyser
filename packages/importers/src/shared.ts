import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import type { MetricChannel, SensorSample } from '@track-analyser/domain'

export function sha256Hex(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes))
}

export function createImportedSample(
  timestamp: number,
  channel: MetricChannel,
  value: SensorSample['value'],
  unit: string,
  sourceId: string,
  fileName: string,
  quality = 0.9,
): SensorSample {
  return {
    timestamp,
    channel,
    value,
    unit,
    sourceId,
    quality,
    stage: 'RAW',
    provenance: {
      sourceId,
      fileName,
      channel,
      sampleCount: 1,
      coverage: 1,
      quality,
      method: 'import fichier original',
      original: true,
    },
  }
}

export function parseTimestamp(value: unknown): number | undefined {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : (value + 631_065_600) * 1000
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

export function serializableValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) return value.map(serializableValue)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializableValue(item)]))
  }
  return value
}

export function semicirclesToDegrees(value: number): number {
  return Math.abs(value) <= 180 ? value : (value * 180) / 2 ** 31
}
