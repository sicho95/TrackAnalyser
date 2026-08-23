import { COMPACT_RAW_MEDIA_TYPE, decodeCompactRaw, type MetricChannel, type RawDataReference, type SensorSample } from '@track-analyser/domain'
import { restoreTripArchive } from '@track-analyser/exporters'
import { parseImportedFile } from '@track-analyser/importers'

export interface RawReader {
  read(reference: RawDataReference): AsyncIterable<Uint8Array>
}

export interface AnalysisBatchOptions {
  maximumDurationMs?: number
  maximumSamples?: number
}

export const DEFAULT_ANALYSIS_BATCH_DURATION_MS = 5 * 60 * 1_000
export const DEFAULT_ANALYSIS_BATCH_SAMPLES = 75_000

export async function replayRawSamples(
  references: readonly RawDataReference[],
  reader: RawReader,
  channels?: readonly MetricChannel[],
): Promise<SensorSample[]> {
  const samples: SensorSample[] = []
  for await (const sample of iterateRawSamples(references, reader, channels)) samples.push(sample)
  return samples.toSorted(compareSamples)
}

export async function decodeSampleNdjson(chunks: AsyncIterable<Uint8Array>, acceptedChannels?: ReadonlySet<MetricChannel>): Promise<SensorSample[]> {
  const samples: SensorSample[] = []
  for await (const sample of iterateSampleNdjson(chunks, acceptedChannels)) samples.push(sample)
  return samples
}

export async function* iterateRawSamples(
  references: readonly RawDataReference[],
  reader: RawReader,
  channels?: readonly MetricChannel[],
): AsyncGenerator<SensorSample> {
  const acceptedChannels = channels === undefined ? undefined : new Set(channels)
  const cursors = await Promise.all(references.map(async (reference) => {
    const iterator = iterateReference(reference, reader, acceptedChannels)[Symbol.asyncIterator]()
    return { iterator, current: await iterator.next() }
  }))
  while (true) {
    let selectedIndex = -1
    cursors.forEach((cursor, index) => {
      if (cursor.current.done === true) return
      if (selectedIndex < 0) selectedIndex = index
      else {
        const selected = cursors[selectedIndex]?.current
        if (selected?.done === false && compareSamples(cursor.current.value, selected.value) < 0) selectedIndex = index
      }
    })
    if (selectedIndex < 0) return
    const cursor = cursors[selectedIndex]
    if (cursor === undefined || cursor.current.done === true) return
    yield cursor.current.value
    cursor.current = await cursor.iterator.next()
  }
}

export async function* iterateAnalysisSampleBatches(
  references: readonly RawDataReference[],
  reader: RawReader,
  options: AnalysisBatchOptions = {},
): AsyncGenerator<SensorSample[]> {
  const maximumDurationMs = options.maximumDurationMs ?? DEFAULT_ANALYSIS_BATCH_DURATION_MS
  const maximumSamples = options.maximumSamples ?? DEFAULT_ANALYSIS_BATCH_SAMPLES
  if (maximumDurationMs <= 0 || maximumSamples <= 0) throw new Error('Les bornes de fenêtre analytique doivent être positives.')
  let batch: SensorSample[] = []
  let batchStart = 0
  let previousTimestamp: number | undefined
  const carry = new Map<string, SensorSample>()
  for await (const sample of iterateRawSamples(references, reader)) {
    const boundary = batch.length > 0
      && previousTimestamp !== sample.timestamp
      && (sample.timestamp - batchStart >= maximumDurationMs || batch.length >= maximumSamples)
    if (boundary) {
      yield batch
      batch = [...carry.values()].toSorted(compareSamples)
      batchStart = sample.timestamp
    }
    if (batch.length === 0) batchStart = sample.timestamp
    batch.push(sample)
    carry.set(`${sample.sourceId}\u0000${sample.channel}`, sample)
    previousTimestamp = sample.timestamp
  }
  if (batch.length > 0) yield batch
}

async function* iterateReference(
  reference: RawDataReference,
  reader: RawReader,
  acceptedChannels?: ReadonlySet<MetricChannel>,
): AsyncGenerator<SensorSample> {
  if (reference.mediaType === 'application/x-ndjson') {
    yield* iterateSampleNdjson(reader.read(reference), acceptedChannels)
    return
  }
  if (reference.mediaType === COMPACT_RAW_MEDIA_TYPE || reference.formatVersion === 2) {
    for await (const sample of decodeCompactRaw(reader.read(reference))) {
      if (acceptedChannels === undefined || acceptedChannels.has(sample.channel)) yield sample
    }
    return
  }
  const bytes = await collectBytes(reader.read(reference))
  const values = reference.importedFileName?.toLowerCase().endsWith('.tatrip') === true
    ? await replayTripArchive(bytes, acceptedChannels)
    : filterChannels(parseImportedFile(bytes, reference.importedFileName ?? inferFileName(reference)).samples, acceptedChannels)
  for (const sample of values.toSorted(compareSamples)) yield sample
}

async function* iterateSampleNdjson(chunks: AsyncIterable<Uint8Array>, acceptedChannels?: ReadonlySet<MetricChannel>): AsyncGenerator<SensorSample> {
  const decoder = new TextDecoder()
  let pending = ''
  for await (const chunk of chunks) {
    pending += decoder.decode(chunk, { stream: true })
    const lines = pending.split('\n')
    pending = lines.pop() ?? ''
    for (const line of lines) {
      if (line.trim().length === 0) continue
      const sample = JSON.parse(line) as SensorSample
      if (acceptedChannels === undefined || acceptedChannels.has(sample.channel)) yield sample
    }
  }
  pending += decoder.decode()
  if (pending.trim().length > 0) {
    const sample = JSON.parse(pending) as SensorSample
    if (acceptedChannels === undefined || acceptedChannels.has(sample.channel)) yield sample
  }
}

async function collectBytes(chunks: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const values: Uint8Array[] = []
  let byteLength = 0
  for await (const chunk of chunks) {
    values.push(chunk)
    byteLength += chunk.byteLength
  }
  const bytes = new Uint8Array(byteLength)
  let offset = 0
  values.forEach((value) => {
    bytes.set(value, offset)
    offset += value.byteLength
  })
  return bytes
}

async function replayTripArchive(bytes: Uint8Array, acceptedChannels?: ReadonlySet<MetricChannel>): Promise<SensorSample[]> {
  const restored = restoreTripArchive(bytes)
  const recovered: SensorSample[] = []
  for (const reference of restored.session.rawDataReferences) {
    const raw = restored.rawFiles[`${reference.id}.bin`]
    if (raw === undefined) continue
    if (reference.mediaType === 'application/x-ndjson') {
      appendSamples(recovered, decodeNdjsonBytes(raw, acceptedChannels))
      continue
    }
    if (reference.mediaType === COMPACT_RAW_MEDIA_TYPE || reference.formatVersion === 2) {
      for await (const sample of decodeCompactRaw(singleChunk(raw))) {
        if (acceptedChannels === undefined || acceptedChannels.has(sample.channel)) recovered.push(sample)
      }
      continue
    }
    if (reference.importedFileName?.toLowerCase().endsWith('.tatrip') === true) continue
    try {
      appendSamples(recovered, filterChannels(parseImportedFile(raw, reference.importedFileName ?? inferFileName(reference)).samples, acceptedChannels))
    } catch {
      // Conserver les autres RAW exploitables lorsqu'un ancien fichier reste inconnu.
    }
  }
  // Utiliser les mesures normalisées uniquement pour une ancienne archive ne contenant pas ses RAW.
  return recovered.length > 0 ? recovered : filterChannels(restored.samples, acceptedChannels)
}

function decodeNdjsonBytes(bytes: Uint8Array, acceptedChannels?: ReadonlySet<MetricChannel>): SensorSample[] {
  return filterChannels(new TextDecoder().decode(bytes).split('\n').filter((line) => line.trim().length > 0).map((line) => JSON.parse(line) as SensorSample), acceptedChannels)
}

function filterChannels(samples: readonly SensorSample[], acceptedChannels?: ReadonlySet<MetricChannel>): SensorSample[] {
  return acceptedChannels === undefined ? [...samples] : samples.filter((sample) => acceptedChannels.has(sample.channel))
}

async function* singleChunk(bytes: Uint8Array): AsyncGenerator<Uint8Array> {
  yield bytes
}

function compareSamples(left: SensorSample, right: SensorSample): number {
  return left.timestamp - right.timestamp || (left.sequence ?? 0) - (right.sequence ?? 0) || left.sourceId.localeCompare(right.sourceId) || left.channel.localeCompare(right.channel)
}

function appendSamples(target: SensorSample[], values: readonly SensorSample[]): void {
  values.forEach((sample) => target.push(sample))
}

function inferFileName(reference: RawDataReference): string {
  if (reference.mediaType === 'application/vnd.ant.fit') return `${reference.id}.fit`
  if (reference.mediaType.includes('xml')) return `${reference.id}.xml`
  if (reference.mediaType.includes('json')) return `${reference.id}.json`
  throw new Error(`Le format RAW ${reference.mediaType} ne peut pas être rejoué automatiquement.`)
}
