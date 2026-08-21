import { bytesToHex } from '@noble/hashes/utils'
import { sha256 } from '@noble/hashes/sha256'
import type { RawDataReference } from '@track-analyser/domain'
import { openTrackAnalyserDatabase, type RawChunkRecord } from './database'

export interface RawWriteOptions {
  sessionId: string
  sourceId: string
  mediaType: string
  importedFileName?: string
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
  if (storage === 'OPFS') {
    const keys = await database.getAllKeysFromIndex('rawChunks', 'streamId', streamId)
    await Promise.allSettled(keys.map((key) => database.delete('rawChunks', key)))
  }
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
      ...(options.importedFileName === undefined ? {} : { importedFileName: options.importedFileName }),
      createdAt: new Date().toISOString(),
    }
  }

  async *read(reference: RawDataReference): AsyncGenerator<Uint8Array> {
    if (reference.storage === 'OPFS') {
      const root = await navigator.storage.getDirectory()
      const directory = await root.getDirectoryHandle('track-analyser-raw')
      const fileHandle = await directory.getFileHandle(`${reference.id}.bin`)
      const file = await fileHandle.getFile()
      const chunkSize = 256 * 1024
      for (let offset = 0; offset < file.size; offset += chunkSize) {
        yield new Uint8Array(await file.slice(offset, offset + chunkSize).arrayBuffer())
      }
      return
    }
    const database = await openTrackAnalyserDatabase()
    const chunks = await database.getAllFromIndex('rawChunks', 'streamId', reference.id)
    for (const chunk of chunks.toSorted((left, right) => left.index - right.index)) yield chunk.bytes
  }
}

export async function* chunkBytes(bytes: Uint8Array, chunkSize = 256 * 1024): AsyncGenerator<Uint8Array> {
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) yield bytes.slice(offset, offset + chunkSize)
}
