import { describe, expect, it } from 'vitest'
import { CompactRawEncoder, decodeCompactRaw } from './raw-codec'
import type { SensorSample } from './types'

function numericSample(timestamp: number, channel: SensorSample['channel'], value: number, quality = 0.9): SensorSample {
  return {
    timestamp,
    channel,
    value,
    unit: 'u',
    sourceId: 'phone:motion',
    quality,
    stage: 'RAW',
    provenance: { sourceId: 'phone:motion', channel, sampleCount: 1, coverage: 1, quality, method: 'capteur observé', original: true },
  }
}

describe('codec RAW compact V2', () => {
  it('restitue exactement valeurs, horodatages, qualité et provenance malgré le découpage', async () => {
    const samples: SensorSample[] = [
      { ...numericSample(1_000, 'acceleration', 1.234567890123), accuracy: 0.125 },
      numericSample(1_000, 'custom:axes', -4.5, 0.625),
      {
        ...numericSample(2_000, 'position', 0.8),
        value: { latitude: 44.123, longitude: -0.456, altitude: 123.4, accuracy: 3.2 },
        unit: 'WGS84',
        id: 'position-2',
        sequence: 42,
      },
      { ...numericSample(2_000, 'custom:label', 0.7), value: 'terrain' },
      { ...numericSample(2_000, 'custom:flag', 0.7), value: true },
      { ...numericSample(2_000, 'custom:vector', 0.7), value: [1, 2, 3] },
    ]
    const encoder = new CompactRawEncoder()
    const encoded = [encoder.header()]
    samples.forEach((sample) => encoder.push(sample).forEach((chunk) => encoded.push(chunk)))
    encoder.finish().forEach((chunk) => encoded.push(chunk))
    const bytes = concatenate(encoded)
    const decoded: SensorSample[] = []
    for await (const sample of decodeCompactRaw(fragment(bytes, 7))) decoded.push(sample)
    expect(decoded).toEqual(samples)
  })

  it('projette dix heures de DeviceMotion sous 512 Mio sans supprimer de canal', () => {
    const encoder = new CompactRawEncoder()
    let bytes = encoder.header().byteLength
    const channels: SensorSample['channel'][] = [
      'acceleration', 'custom:acceleration-x', 'custom:acceleration-y', 'custom:acceleration-z',
      'lateralAcceleration', 'longitudinalAcceleration', 'verticalAcceleration',
      'rotationRate', 'custom:rotation-alpha', 'custom:rotation-beta', 'custom:rotation-gamma',
    ]
    const durationSeconds = 60
    const frequencyHz = 50
    for (let frame = 0; frame < durationSeconds * frequencyHz; frame += 1) {
      const timestamp = 1_000 + frame * (1_000 / frequencyHz)
      channels.forEach((channel, index) => encoder.push(numericSample(timestamp, channel, Math.sin(frame / 10 + index))).forEach((chunk) => { bytes += chunk.byteLength }))
    }
    encoder.finish().forEach((chunk) => { bytes += chunk.byteLength })
    const projectedTenHours = bytes * ((10 * 60 * 60) / durationSeconds)
    expect(projectedTenHours).toBeLessThan(512 * 1024 * 1024)
  })
})

function concatenate(values: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(values.reduce((sum, value) => sum + value.byteLength, 0))
  let offset = 0
  values.forEach((value) => { result.set(value, offset); offset += value.byteLength })
  return result
}

async function* fragment(bytes: Uint8Array, size: number): AsyncGenerator<Uint8Array> {
  for (let offset = 0; offset < bytes.byteLength; offset += size) yield bytes.slice(offset, offset + size)
}
