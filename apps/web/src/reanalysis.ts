import type { RawDataReference, SensorSample } from '@track-analyser/domain'
import { restoreTripArchive } from '@track-analyser/exporters'
import { parseImportedFile } from '@track-analyser/importers'

export interface RawReader {
  read(reference: RawDataReference): AsyncIterable<Uint8Array>
}

export async function replayRawSamples(
  references: readonly RawDataReference[],
  reader: RawReader,
): Promise<SensorSample[]> {
  const samples: SensorSample[] = []
  for (const reference of references) {
    if (reference.mediaType === 'application/x-ndjson') {
      samples.push(...await decodeSampleNdjson(reader.read(reference)))
      continue
    }
    const bytes = await collectBytes(reader.read(reference))
    if (reference.importedFileName?.toLowerCase().endsWith('.tatrip') === true) {
      samples.push(...replayTripArchive(bytes))
      continue
    }
    const fileName = reference.importedFileName ?? inferFileName(reference)
    samples.push(...parseImportedFile(bytes, fileName).samples)
  }
  return samples.toSorted((left, right) => left.timestamp - right.timestamp || (left.sequence ?? 0) - (right.sequence ?? 0))
}

export async function decodeSampleNdjson(chunks: AsyncIterable<Uint8Array>): Promise<SensorSample[]> {
  const decoder = new TextDecoder()
  const samples: SensorSample[] = []
  let pending = ''
  for await (const chunk of chunks) {
    pending += decoder.decode(chunk, { stream: true })
    const lines = pending.split('\n')
    pending = lines.pop() ?? ''
    lines.filter((line) => line.trim().length > 0).forEach((line) => samples.push(JSON.parse(line) as SensorSample))
  }
  pending += decoder.decode()
  if (pending.trim().length > 0) samples.push(JSON.parse(pending) as SensorSample)
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

function replayTripArchive(bytes: Uint8Array): SensorSample[] {
  const restored = restoreTripArchive(bytes)
  const recovered = restored.session.rawDataReferences.flatMap((reference) => {
    const raw = restored.rawFiles[`${reference.id}.bin`]
    if (raw === undefined) return []
    if (reference.mediaType === 'application/x-ndjson') return decodeNdjsonBytes(raw)
    if (reference.importedFileName?.toLowerCase().endsWith('.tatrip') === true) return []
    try {
      return parseImportedFile(raw, reference.importedFileName ?? inferFileName(reference)).samples
    } catch {
      return []
    }
  })
  // Utiliser les mesures normalisées uniquement pour une ancienne archive ne contenant pas ses RAW.
  return recovered.length > 0 ? recovered : restored.samples
}

function decodeNdjsonBytes(bytes: Uint8Array): SensorSample[] {
  return new TextDecoder().decode(bytes).split('\n').filter((line) => line.trim().length > 0).map((line) => JSON.parse(line) as SensorSample)
}

function inferFileName(reference: RawDataReference): string {
  if (reference.mediaType === 'application/vnd.ant.fit') return `${reference.id}.fit`
  if (reference.mediaType.includes('xml')) return `${reference.id}.xml`
  if (reference.mediaType.includes('json')) return `${reference.id}.json`
  throw new Error(`Le format RAW ${reference.mediaType} ne peut pas être rejoué automatiquement.`)
}
