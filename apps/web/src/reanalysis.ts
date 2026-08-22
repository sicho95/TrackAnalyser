import type { MetricChannel, RawDataReference, SensorSample } from '@track-analyser/domain'
import { restoreTripArchive } from '@track-analyser/exporters'
import { parseImportedFile } from '@track-analyser/importers'

export interface RawReader {
  read(reference: RawDataReference): AsyncIterable<Uint8Array>
}

export async function replayRawSamples(
  references: readonly RawDataReference[],
  reader: RawReader,
  channels?: readonly MetricChannel[],
): Promise<SensorSample[]> {
  const samples: SensorSample[] = []
  const acceptedChannels = channels === undefined ? undefined : new Set(channels)
  for (const reference of references) {
    if (reference.mediaType === 'application/x-ndjson') {
      appendSamples(samples, await decodeSampleNdjson(reader.read(reference), acceptedChannels))
      continue
    }
    const bytes = await collectBytes(reader.read(reference))
    if (reference.importedFileName?.toLowerCase().endsWith('.tatrip') === true) {
      appendSamples(samples, replayTripArchive(bytes, acceptedChannels))
      continue
    }
    const fileName = reference.importedFileName ?? inferFileName(reference)
    appendSamples(samples, filterChannels(parseImportedFile(bytes, fileName).samples, acceptedChannels))
  }
  return samples.toSorted((left, right) => left.timestamp - right.timestamp || (left.sequence ?? 0) - (right.sequence ?? 0))
}

export async function decodeSampleNdjson(chunks: AsyncIterable<Uint8Array>, acceptedChannels?: ReadonlySet<MetricChannel>): Promise<SensorSample[]> {
  const decoder = new TextDecoder()
  const samples: SensorSample[] = []
  let pending = ''
  for await (const chunk of chunks) {
    pending += decoder.decode(chunk, { stream: true })
    const lines = pending.split('\n')
    pending = lines.pop() ?? ''
    lines.filter((line) => line.trim().length > 0).forEach((line) => appendAcceptedSample(samples, JSON.parse(line) as SensorSample, acceptedChannels))
  }
  pending += decoder.decode()
  if (pending.trim().length > 0) appendAcceptedSample(samples, JSON.parse(pending) as SensorSample, acceptedChannels)
  return samples
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

function replayTripArchive(bytes: Uint8Array, acceptedChannels?: ReadonlySet<MetricChannel>): SensorSample[] {
  const restored = restoreTripArchive(bytes)
  const recovered = restored.session.rawDataReferences.flatMap((reference) => {
    const raw = restored.rawFiles[`${reference.id}.bin`]
    if (raw === undefined) return []
    if (reference.mediaType === 'application/x-ndjson') return decodeNdjsonBytes(raw, acceptedChannels)
    if (reference.importedFileName?.toLowerCase().endsWith('.tatrip') === true) return []
    try {
      return filterChannels(parseImportedFile(raw, reference.importedFileName ?? inferFileName(reference)).samples, acceptedChannels)
    } catch {
      return []
    }
  })
  // Utiliser les mesures normalisées uniquement pour une ancienne archive ne contenant pas ses RAW.
  return recovered.length > 0 ? recovered : filterChannels(restored.samples, acceptedChannels)
}

function decodeNdjsonBytes(bytes: Uint8Array, acceptedChannels?: ReadonlySet<MetricChannel>): SensorSample[] {
  return filterChannels(new TextDecoder().decode(bytes).split('\n').filter((line) => line.trim().length > 0).map((line) => JSON.parse(line) as SensorSample), acceptedChannels)
}

function appendAcceptedSample(samples: SensorSample[], sample: SensorSample, acceptedChannels?: ReadonlySet<MetricChannel>): void {
  if (acceptedChannels === undefined || acceptedChannels.has(sample.channel)) samples.push(sample)
}

function filterChannels(samples: readonly SensorSample[], acceptedChannels?: ReadonlySet<MetricChannel>): SensorSample[] {
  return acceptedChannels === undefined ? [...samples] : samples.filter((sample) => acceptedChannels.has(sample.channel))
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
