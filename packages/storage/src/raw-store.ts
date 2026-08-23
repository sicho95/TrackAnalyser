import { bytesToHex } from '@noble/hashes/utils'
import { sha256 } from '@noble/hashes/sha256'
import type { RawDataReference } from '@track-analyser/domain'
import { openTrackAnalyserDatabase, type RawChunkRecord } from './database'

export interface RawWriteOptions {
  sessionId: string
  sourceId: string
  mediaType: string
  importedFileName?: string
  formatVersion?: number
}

export interface RecordingStorageReadiness {
  durationHours: number
  estimatedRawBytes: number
  requiredAvailableBytes: number
  availableBytes?: number
  status: 'READY' | 'LOW' | 'UNKNOWN'
}

const COMPACT_RAW_BYTES_PER_HOUR_UPPER_BOUND = (512 * 1024 * 1024) / 10

export async function estimateRecordingStorage(durationHours = 10): Promise<RecordingStorageReadiness> {
  const estimatedRawBytes = Math.ceil(COMPACT_RAW_BYTES_PER_HOUR_UPPER_BOUND * durationHours)
  // Réserver le RAW, son miroir de récupération temporaire et une marge pour les index et analyses.
  const requiredAvailableBytes = estimatedRawBytes * 2 + 128 * 1024 * 1024
  if (typeof navigator === 'undefined' || navigator.storage?.estimate === undefined) {
    return { durationHours, estimatedRawBytes, requiredAvailableBytes, status: 'UNKNOWN' }
  }
  try {
    const estimate = await navigator.storage.estimate()
    if (estimate.quota === undefined || estimate.usage === undefined) return { durationHours, estimatedRawBytes, requiredAvailableBytes, status: 'UNKNOWN' }
    const availableBytes = Math.max(0, estimate.quota - estimate.usage)
    return { durationHours, estimatedRawBytes, requiredAvailableBytes, availableBytes, status: availableBytes >= requiredAvailableBytes ? 'READY' : 'LOW' }
  } catch {
    return { durationHours, estimatedRawBytes, requiredAvailableBytes, status: 'UNKNOWN' }
  }
}

async function opfsAvailable(): Promise<boolean> {
  return (
    typeof navigator !== 'undefined' &&
    'storage' in navigator &&
    typeof navigator.storage.getDirectory === 'function' &&
    typeof FileSystemFileHandle !== 'undefined' &&
    'createWritable' in FileSystemFileHandle.prototype
  )
}

async function openOpfsWritable(streamId: string): Promise<FileSystemWritableFileStream | undefined> {
  if (!(await opfsAvailable())) return undefined
  try {
    const root = await navigator.storage.getDirectory()
    const directory = await root.getDirectoryHandle('track-analyser-raw', { create: true })
    const file = await directory.getFileHandle(`${streamId}.bin`, { create: true })
    return await file.createWritable({ keepExistingData: false })
  } catch {
    return undefined
  }
}

async function writeResilient(
  streamId: string,
  chunks: AsyncIterable<Uint8Array>,
): Promise<{ byteLength: number; sha256: string; chunkCount: number; storage: 'OPFS' | 'INDEXED_DB' }> {
  const database = await openTrackAnalyserDatabase()
  const hasher = sha256.create()
  let writable = await openOpfsWritable(streamId)
  let byteLength = 0
  let chunkCount = 0
  for await (const chunk of chunks) {
    const hash = bytesToHex(sha256(chunk))
    const record: RawChunkRecord = {
      key: `${streamId}:${chunkCount.toString().padStart(8, '0')}`,
      streamId,
      index: chunkCount,
      bytes: chunk,
      sha256: hash,
      createdAt: new Date().toISOString(),
    }
    const existing = await database.get('rawChunks', record.key)
    if (existing !== undefined && existing.sha256 !== hash) throw new Error('Tentative de modification d’un chunk RAW immuable.')
    await database.put('rawChunks', record)
    if (writable !== undefined) {
      try {
        await writable.write(chunk as unknown as FileSystemWriteChunkType)
      } catch {
        try { await writable.abort() } catch { /* Conserver le fallback IndexedDB si OPFS échoue. */ }
        writable = undefined
      }
    }
    hasher.update(chunk)
    byteLength += chunk.byteLength
    chunkCount += 1
  }
  if (writable !== undefined) {
    try {
      await writable.close()
    } catch {
      writable = undefined
    }
  }
  const storage = writable === undefined ? 'INDEXED_DB' : 'OPFS'
  // Conserver temporairement le miroir IndexedDB jusqu'au rattachement de la référence à la Session.
  // Permettre ainsi une récupération même si Safari suspend la page juste après la fermeture OPFS.
  return { byteLength, sha256: bytesToHex(hasher.digest()), chunkCount, storage }
}

export class ProgressiveRawStore {
  async write(streamId: string, chunks: AsyncIterable<Uint8Array>, options: RawWriteOptions): Promise<RawDataReference> {
    const result = await writeResilient(streamId, chunks)
    return {
      id: streamId,
      sessionId: options.sessionId,
      sourceId: options.sourceId,
      storage: result.storage,
      path: result.storage === 'OPFS' ? `track-analyser-raw/${streamId}.bin` : streamId,
      mediaType: options.mediaType,
      byteLength: result.byteLength,
      sha256: result.sha256,
      chunkCount: result.chunkCount,
      immutable: true,
      ...(options.formatVersion === undefined ? {} : { formatVersion: options.formatVersion }),
      ...(options.importedFileName === undefined ? {} : { importedFileName: options.importedFileName }),
      createdAt: new Date().toISOString(),
    }
  }

  async *read(reference: RawDataReference): AsyncGenerator<Uint8Array> {
    if (reference.storage === 'OPFS') {
      let emittedBytes = 0
      try {
        const root = await navigator.storage.getDirectory()
        const directory = await root.getDirectoryHandle('track-analyser-raw')
        const fileHandle = await directory.getFileHandle(`${reference.id}.bin`)
        const file = await fileHandle.getFile()
        if (file.size !== reference.byteLength) throw new Error(`Taille OPFS invalide pour ${reference.id}.`)
        const chunkSize = 256 * 1024
        for (let offset = 0; offset < file.size; offset += chunkSize) {
          const bytes = new Uint8Array(await file.slice(offset, offset + chunkSize).arrayBuffer())
          if (bytes.byteLength !== Math.min(chunkSize, file.size - offset)) throw new Error(`Tranche OPFS incomplète pour ${reference.id}.`)
          emittedBytes += bytes.byteLength
          yield bytes
        }
        return
      } catch {
        // Reprendre exactement à l'octet suivant dans le miroir IndexedDB si Safari interrompt une lecture OPFS.
        // Éviter de réémettre les premiers octets afin de ne pas corrompre le décodeur streaming.
        yield* readIndexedDbChunks(reference.id, emittedBytes, true, reference.byteLength, reference.chunkCount)
        return
      }
    }
    yield* readIndexedDbChunks(reference.id, 0, false, reference.byteLength, reference.chunkCount)
  }

  async recoverReference(streamId: string, options: RawWriteOptions): Promise<RawDataReference | undefined> {
    const database = await openTrackAnalyserDatabase()
    const chunks = (await database.getAllFromIndex('rawChunks', 'streamId', streamId)).toSorted((left, right) => left.index - right.index)
    if (chunks.length === 0) return undefined
    const hasher = sha256.create()
    let byteLength = 0
    chunks.forEach((chunk, index) => {
      if (chunk.index !== index || bytesToHex(sha256(chunk.bytes)) !== chunk.sha256) throw new Error(`Flux RAW interrompu invalide : ${streamId}.`)
      hasher.update(chunk.bytes)
      byteLength += chunk.bytes.byteLength
    })
    return {
      id: streamId,
      sessionId: options.sessionId,
      sourceId: options.sourceId,
      storage: 'INDEXED_DB',
      path: streamId,
      mediaType: options.mediaType,
      byteLength,
      sha256: bytesToHex(hasher.digest()),
      chunkCount: chunks.length,
      immutable: true,
      ...(options.formatVersion === undefined ? {} : { formatVersion: options.formatVersion }),
      ...(options.importedFileName === undefined ? {} : { importedFileName: options.importedFileName }),
      createdAt: chunks[0]?.createdAt ?? new Date().toISOString(),
    }
  }

  async discardIndexedDbMirror(streamId: string): Promise<void> {
    const database = await openTrackAnalyserDatabase()
    const keys = await database.getAllKeysFromIndex('rawChunks', 'streamId', streamId)
    await deleteChunkKeys(database, keys)
  }

  async delete(reference: RawDataReference): Promise<void> {
    if (reference.storage === 'OPFS' && typeof navigator !== 'undefined' && 'storage' in navigator) {
      try {
        const root = await navigator.storage.getDirectory()
        const directory = await root.getDirectoryHandle('track-analyser-raw')
        await directory.removeEntry(`${reference.id}.bin`)
      } catch (error) {
        // Rendre la suppression idempotente lorsqu'un navigateur a déjà évincé le fichier OPFS.
        if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error
      }
    }
    const database = await openTrackAnalyserDatabase()
    const keys = await database.getAllKeysFromIndex('rawChunks', 'streamId', reference.id)
    await deleteChunkKeys(database, keys)
  }
}

async function* readIndexedDbChunks(
  streamId: string,
  skipBytes = 0,
  required = false,
  expectedByteLength?: number,
  expectedChunkCount?: number,
): AsyncGenerator<Uint8Array> {
  const database = await openTrackAnalyserDatabase()
  const transaction = database.transaction('rawChunks', 'readonly')
  const index = transaction.store.index('streamId')
  let cursor = await index.openCursor(IDBKeyRange.only(streamId))
  let remainingSkip = skipBytes
  let chunkCount = 0
  let byteLength = 0
  while (cursor !== null) {
    const chunk = cursor.value
    if (chunk.index !== chunkCount) throw new Error(`Ordre des chunks RAW invalide pour ${streamId}.`)
    chunkCount += 1
    byteLength += chunk.bytes.byteLength
    if (bytesToHex(sha256(chunk.bytes)) !== chunk.sha256) throw new Error(`Chunk RAW corrompu : ${chunk.key}.`)
    if (remainingSkip >= chunk.bytes.byteLength) remainingSkip -= chunk.bytes.byteLength
    else {
      const bytes = remainingSkip === 0 ? chunk.bytes : chunk.bytes.slice(remainingSkip)
      remainingSkip = 0
      if (bytes.byteLength > 0) yield bytes
    }
    cursor = await cursor.continue()
  }
  await transaction.done
  if (required && chunkCount === 0) throw new Error(`Lecture OPFS impossible et miroir RAW absent pour ${streamId}.`)
  if (remainingSkip > 0) throw new Error(`Miroir RAW incomplet pour ${streamId}.`)
  if (expectedChunkCount !== undefined && chunkCount !== expectedChunkCount) throw new Error(`Nombre de chunks RAW invalide pour ${streamId}.`)
  if (expectedByteLength !== undefined && byteLength !== expectedByteLength) throw new Error(`Taille du miroir RAW invalide pour ${streamId}.`)
}

async function deleteChunkKeys(database: Awaited<ReturnType<typeof openTrackAnalyserDatabase>>, keys: readonly string[]): Promise<void> {
  const batchSize = 500
  for (let start = 0; start < keys.length; start += batchSize) {
    await Promise.all(keys.slice(start, start + batchSize).map((key) => database.delete('rawChunks', key)))
  }
}

export async function* chunkBytes(bytes: Uint8Array, chunkSize = 256 * 1024): AsyncGenerator<Uint8Array> {
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) yield bytes.slice(offset, offset + chunkSize)
}
