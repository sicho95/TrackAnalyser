import type { MetricProvenance, MetricValue, SensorSample } from './types'

export const COMPACT_RAW_MEDIA_TYPE = 'application/vnd.track-analyser.raw;version=2'
export const COMPACT_RAW_VERSION = 2

const MAGIC = new Uint8Array([0x54, 0x41, 0x52, 0x41, 0x57, COMPACT_RAW_VERSION, 0x0d, 0x0a])
const RECORD_DEFINITION = 1
const RECORD_FRAME = 2

interface CompactDefinition {
  id: number
  channel: SensorSample['channel']
  unit: string
  sourceId: string
  stage: SensorSample['stage']
  provenance: Omit<MetricProvenance, 'quality'>
}

interface PendingFrame {
  timestamp: number
  samples: SensorSample[]
}

export class CompactRawEncoder {
  private readonly encoder = new TextEncoder()
  private readonly definitions = new Map<string, CompactDefinition>()
  private pendingFrame: PendingFrame | undefined

  header(): Uint8Array {
    return MAGIC.slice()
  }

  push(sample: SensorSample): Uint8Array[] {
    const chunks: Uint8Array[] = []
    if (this.pendingFrame !== undefined && this.pendingFrame.timestamp !== sample.timestamp) {
      chunks.push(this.encodeFrame(this.pendingFrame))
      this.pendingFrame = undefined
    }
    const definitionKey = definitionFingerprint(sample)
    let definition = this.definitions.get(definitionKey)
    if (definition === undefined) {
      definition = createDefinition(this.definitions.size, sample)
      this.definitions.set(definitionKey, definition)
      chunks.push(record(RECORD_DEFINITION, this.encoder.encode(JSON.stringify(definition))))
    }
    this.pendingFrame ??= { timestamp: sample.timestamp, samples: [] }
    this.pendingFrame.samples.push(sample)
    return chunks
  }

  finish(): Uint8Array[] {
    if (this.pendingFrame === undefined) return []
    const chunk = this.encodeFrame(this.pendingFrame)
    this.pendingFrame = undefined
    return [chunk]
  }

  private encodeFrame(frame: PendingFrame): Uint8Array {
    const encodedSamples = frame.samples.map((sample) => {
      const definition = this.definitions.get(definitionFingerprint(sample))
      if (definition === undefined) throw new Error('Définition RAW compacte absente.')
      return encodeSample(definition.id, sample, this.encoder)
    })
    const payloadLength = 8 + 2 + encodedSamples.reduce((sum, value) => sum + value.byteLength, 0)
    const payload = new Uint8Array(payloadLength)
    const view = new DataView(payload.buffer)
    view.setFloat64(0, frame.timestamp, true)
    view.setUint16(8, encodedSamples.length, true)
    let offset = 10
    encodedSamples.forEach((value) => {
      payload.set(value, offset)
      offset += value.byteLength
    })
    return record(RECORD_FRAME, payload)
  }
}

export async function* decodeCompactRaw(chunks: AsyncIterable<Uint8Array>): AsyncGenerator<SensorSample> {
  const decoder = new TextDecoder()
  const definitions = new Map<number, CompactDefinition>()
  let pending = new Uint8Array()
  let pendingOffset = 0
  let headerRead = false
  for await (const chunk of chunks) {
    pending = concatenate(pending.subarray(pendingOffset), chunk)
    pendingOffset = 0
    if (!headerRead) {
      if (pending.byteLength - pendingOffset < MAGIC.byteLength) continue
      if (!MAGIC.every((value, index) => pending[pendingOffset + index] === value)) throw new Error('En-tête RAW compact invalide.')
      pendingOffset += MAGIC.byteLength
      headerRead = true
    }
    while (pending.byteLength - pendingOffset >= 5) {
      const payloadLength = new DataView(pending.buffer, pending.byteOffset + pendingOffset, pending.byteLength - pendingOffset).getUint32(1, true)
      if (pending.byteLength - pendingOffset < 5 + payloadLength) break
      const type = pending[pendingOffset]
      const payload = pending.subarray(pendingOffset + 5, pendingOffset + 5 + payloadLength)
      pendingOffset += 5 + payloadLength
      if (type === RECORD_DEFINITION) {
        const definition = JSON.parse(decoder.decode(payload)) as CompactDefinition
        definitions.set(definition.id, definition)
      } else if (type === RECORD_FRAME) {
        yield* decodeFrame(payload, definitions, decoder)
      } else {
        throw new Error(`Type d’enregistrement RAW compact inconnu : ${String(type)}.`)
      }
    }
  }
  if (!headerRead) throw new Error('Flux RAW compact vide ou tronqué.')
  if (pending.byteLength - pendingOffset > 0) throw new Error('Dernier enregistrement RAW compact incomplet.')
}

function createDefinition(id: number, sample: SensorSample): CompactDefinition {
  return { id, channel: sample.channel, unit: sample.unit, sourceId: sample.sourceId, stage: sample.stage, provenance: staticProvenance(sample.provenance) }
}

function definitionFingerprint(sample: SensorSample): string {
  return JSON.stringify([sample.channel, sample.unit, sample.sourceId, sample.stage, staticProvenance(sample.provenance)])
}

function staticProvenance(provenance: MetricProvenance): Omit<MetricProvenance, 'quality'> {
  return {
    sourceId: provenance.sourceId,
    ...(provenance.deviceId === undefined ? {} : { deviceId: provenance.deviceId }),
    ...(provenance.fileName === undefined ? {} : { fileName: provenance.fileName }),
    channel: provenance.channel,
    sampleCount: provenance.sampleCount,
    coverage: provenance.coverage,
    method: provenance.method,
    original: provenance.original,
  }
}

function record(type: number, payload: Uint8Array): Uint8Array {
  const result = new Uint8Array(5 + payload.byteLength)
  result[0] = type
  new DataView(result.buffer).setUint32(1, payload.byteLength, true)
  result.set(payload, 5)
  return result
}

function encodeSample(definitionId: number, sample: SensorSample, encoder: TextEncoder): Uint8Array {
  const value = encodeValue(sample.value, encoder)
  const id = sample.id === undefined ? undefined : encoder.encode(sample.id)
  let flags = 0
  if (sample.accuracy !== undefined) flags |= 1
  if (sample.sequence !== undefined) flags |= 2
  if (sample.provenance.quality !== sample.quality) flags |= 4
  if (id !== undefined) flags |= 8
  const byteLength = 2 + value.byteLength + 8 + 1
    + (sample.accuracy === undefined ? 0 : 8)
    + (sample.sequence === undefined ? 0 : 8)
    + (sample.provenance.quality === sample.quality ? 0 : 8)
    + (id === undefined ? 0 : 2 + id.byteLength)
  const result = new Uint8Array(byteLength)
  const view = new DataView(result.buffer)
  view.setUint16(0, definitionId, true)
  result.set(value, 2)
  let offset = 2 + value.byteLength
  view.setFloat64(offset, sample.quality, true)
  offset += 8
  result[offset] = flags
  offset += 1
  if (sample.accuracy !== undefined) { view.setFloat64(offset, sample.accuracy, true); offset += 8 }
  if (sample.sequence !== undefined) { view.setFloat64(offset, sample.sequence, true); offset += 8 }
  if (sample.provenance.quality !== sample.quality) { view.setFloat64(offset, sample.provenance.quality, true); offset += 8 }
  if (id !== undefined) {
    view.setUint16(offset, id.byteLength, true)
    offset += 2
    result.set(id, offset)
  }
  return result
}

function encodeValue(value: MetricValue, encoder: TextEncoder): Uint8Array {
  if (typeof value === 'number') {
    const result = new Uint8Array(9)
    result[0] = 0
    new DataView(result.buffer).setFloat64(1, value, true)
    return result
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    let flags = 0
    if (value.altitude !== undefined) flags |= 1
    if (value.accuracy !== undefined) flags |= 2
    const result = new Uint8Array(2 + 16 + (value.altitude === undefined ? 0 : 8) + (value.accuracy === undefined ? 0 : 8))
    result[0] = 1
    result[1] = flags
    const view = new DataView(result.buffer)
    view.setFloat64(2, value.latitude, true)
    view.setFloat64(10, value.longitude, true)
    let offset = 18
    if (value.altitude !== undefined) { view.setFloat64(offset, value.altitude, true); offset += 8 }
    if (value.accuracy !== undefined) view.setFloat64(offset, value.accuracy, true)
    return result
  }
  if (typeof value === 'string') {
    const bytes = encoder.encode(value)
    const result = new Uint8Array(5 + bytes.byteLength)
    result[0] = 2
    new DataView(result.buffer).setUint32(1, bytes.byteLength, true)
    result.set(bytes, 5)
    return result
  }
  if (typeof value === 'boolean') return new Uint8Array([3, value ? 1 : 0])
  const result = new Uint8Array(3 + value.length * 8)
  result[0] = 4
  new DataView(result.buffer).setUint16(1, value.length, true)
  value.forEach((item, index) => new DataView(result.buffer).setFloat64(3 + index * 8, item, true))
  return result
}

function* decodeFrame(payload: Uint8Array, definitions: ReadonlyMap<number, CompactDefinition>, decoder: TextDecoder): Generator<SensorSample> {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  const timestamp = view.getFloat64(0, true)
  const sampleCount = view.getUint16(8, true)
  let offset = 10
  for (let index = 0; index < sampleCount; index += 1) {
    const definitionId = view.getUint16(offset, true)
    offset += 2
    const decodedValue = decodeValue(payload, offset, decoder)
    offset = decodedValue.offset
    const quality = view.getFloat64(offset, true)
    offset += 8
    const flags = payload[offset] ?? 0
    offset += 1
    const accuracy = (flags & 1) === 0 ? undefined : view.getFloat64(offset, true)
    if (accuracy !== undefined) offset += 8
    const sequence = (flags & 2) === 0 ? undefined : view.getFloat64(offset, true)
    if (sequence !== undefined) offset += 8
    const provenanceQuality = (flags & 4) === 0 ? quality : view.getFloat64(offset, true)
    if ((flags & 4) !== 0) offset += 8
    let id: string | undefined
    if ((flags & 8) !== 0) {
      const length = view.getUint16(offset, true)
      offset += 2
      id = decoder.decode(payload.slice(offset, offset + length))
      offset += length
    }
    const definition = definitions.get(definitionId)
    if (definition === undefined) throw new Error(`Définition RAW compacte ${definitionId} absente.`)
    yield {
      ...(id === undefined ? {} : { id }),
      timestamp,
      channel: definition.channel,
      value: decodedValue.value,
      unit: definition.unit,
      sourceId: definition.sourceId,
      ...(sequence === undefined ? {} : { sequence }),
      ...(accuracy === undefined ? {} : { accuracy }),
      quality,
      stage: definition.stage,
      provenance: { ...definition.provenance, quality: provenanceQuality },
    }
  }
  if (offset !== payload.byteLength) throw new Error('Taille de frame RAW compacte incohérente.')
}

function decodeValue(bytes: Uint8Array, start: number, decoder: TextDecoder): { value: MetricValue; offset: number } {
  const kind = bytes[start]
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (kind === 0) return { value: view.getFloat64(start + 1, true), offset: start + 9 }
  if (kind === 1) {
    const flags = bytes[start + 1] ?? 0
    const latitude = view.getFloat64(start + 2, true)
    const longitude = view.getFloat64(start + 10, true)
    let offset = start + 18
    const altitude = (flags & 1) === 0 ? undefined : view.getFloat64(offset, true)
    if (altitude !== undefined) offset += 8
    const accuracy = (flags & 2) === 0 ? undefined : view.getFloat64(offset, true)
    if (accuracy !== undefined) offset += 8
    return { value: { latitude, longitude, ...(altitude === undefined ? {} : { altitude }), ...(accuracy === undefined ? {} : { accuracy }) }, offset }
  }
  if (kind === 2) {
    const length = view.getUint32(start + 1, true)
    return { value: decoder.decode(bytes.slice(start + 5, start + 5 + length)), offset: start + 5 + length }
  }
  if (kind === 3) return { value: bytes[start + 1] === 1, offset: start + 2 }
  if (kind === 4) {
    const length = view.getUint16(start + 1, true)
    return { value: Array.from({ length }, (_, index) => view.getFloat64(start + 3 + index * 8, true)), offset: start + 3 + length * 8 }
  }
  throw new Error(`Type de valeur RAW compact inconnu : ${String(kind)}.`)
}

function concatenate(left: Uint8Array, right: Uint8Array): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(left.byteLength + right.byteLength)
  result.set(left)
  result.set(right, left.byteLength)
  return result
}
