import { beforeEach, describe, expect, it } from 'vitest'
import { COMPACT_RAW_MEDIA_TYPE, CompactRawEncoder } from '@track-analyser/domain'
import { sample, session } from '../../../tests/helpers'
import { SessionCheckpointService } from './checkpoints'
import { DATABASE_NAME, deleteTrackAnalyserDatabaseForTests, openTrackAnalyserDatabase } from './database'
import { chunkBytes, estimateRecordingStorage, ProgressiveRawStore } from './raw-store'
import { LocalRepositories } from './repositories'

describe('stockage local résilient', () => {
  beforeEach(async () => deleteTrackAnalyserDatabaseForTests())

  it('récupère une session interrompue à partir du checkpoint', async () => {
    const repositories = await LocalRepositories.open()
    const service = new SessionCheckpointService(repositories)
    const current = session('interrupted', 'damien')
    await service.markRecording(current)
    const recovered = await service.recoverInterrupted()
    expect(recovered.map((item) => item.id)).toContain(current.id)
    expect((await repositories.sessions.get(current.id))?.status).toBe('INTERRUPTED')
    expect((await repositories.getSettings()).activeSessionId).toBeUndefined()
  })

  it('rattache les chunks progressifs à la Session après une interruption Safari', async () => {
    const repositories = await LocalRepositories.open()
    const rawStore = new ProgressiveRawStore()
    const service = new SessionCheckpointService(repositories, rawStore)
    const current = { ...session('recoverable', 'damien'), status: 'DRAFT' as const, activeRawStreamId: 'stream-recoverable' }
    delete current.endTime
    const bytes = new TextEncoder().encode('{"timestamp":1000}\n{"timestamp":2000}\n')
    await rawStore.write(current.activeRawStreamId, chunkBytes(bytes, 12), { sessionId: current.id, sourceId: 'phone', mediaType: 'application/x-ndjson' })
    await service.markRecording(current)

    await service.recoverInterrupted()

    const recovered = await repositories.sessions.get(current.id)
    expect(recovered?.status).toBe('COMPLETED')
    expect(recovered?.analysisStatus).toBe('PENDING')
    expect(recovered?.activeRawStreamId).toBeUndefined()
    expect(recovered?.rawDataReferences).toHaveLength(1)
    expect(recovered?.rawDataReferences[0]).toMatchObject({ id: 'stream-recoverable', storage: 'INDEXED_DB', byteLength: bytes.byteLength, chunkCount: 4 })
    const replayed: number[] = []
    const reference = recovered?.rawDataReferences[0]
    if (reference !== undefined) for await (const chunk of rawStore.read(reference)) replayed.push(...chunk)
    expect(replayed).toEqual([...bytes])
  })

  it('récupère le format compact versionné après une interruption Safari', async () => {
    const repositories = await LocalRepositories.open()
    const rawStore = new ProgressiveRawStore()
    const service = new SessionCheckpointService(repositories, rawStore)
    const encoder = new CompactRawEncoder()
    const values = [encoder.header(), ...encoder.push(sample('speed', 12, 1_000, 'phone')), ...encoder.finish()]
    const bytes = new Uint8Array(values.reduce((sum, value) => sum + value.byteLength, 0))
    let offset = 0
    values.forEach((value) => { bytes.set(value, offset); offset += value.byteLength })
    await rawStore.write('stream-compact', chunkBytes(bytes, 32), { sessionId: 'compact', sourceId: 'phone', mediaType: COMPACT_RAW_MEDIA_TYPE, formatVersion: 2 })
    const current = {
      ...session('compact', 'damien'),
      status: 'DRAFT' as const,
      activeRawStreamId: 'stream-compact',
      activeRawMediaType: COMPACT_RAW_MEDIA_TYPE,
      activeRawFormatVersion: 2,
    }
    delete current.endTime
    await service.markRecording(current)

    await service.recoverInterrupted()

    expect((await repositories.sessions.get('compact'))?.rawDataReferences[0]).toMatchObject({ mediaType: COMPACT_RAW_MEDIA_TYPE, formatVersion: 2 })
  })

  it('chunk les RAW et refuse une modification sous la même identité', async () => {
    const store = new ProgressiveRawStore()
    const original = new TextEncoder().encode('raw-immutable')
    const reference = await store.write('stream-1', chunkBytes(original, 4), { sessionId: 's', sourceId: 'phone', mediaType: 'application/octet-stream' })
    const read: number[] = []
    for await (const chunk of store.read(reference)) read.push(...chunk)
    expect(read).toEqual([...original])
    await expect(store.write('stream-1', chunkBytes(new TextEncoder().encode('changed'), 4), { sessionId: 's', sourceId: 'phone', mediaType: 'application/octet-stream' })).rejects.toThrow(/immuable/i)
  })

  it('reprend dans le miroir IndexedDB après une erreur de lecture OPFS Safari', async () => {
    const store = new ProgressiveRawStore()
    const original = Uint8Array.from({ length: 300_000 }, (_, index) => index % 251)
    const stored = await store.write('stream-opfs-fallback', chunkBytes(original, 64 * 1024), { sessionId: 's', sourceId: 'phone', mediaType: 'application/octet-stream' })
    const storageDescriptor = Object.getOwnPropertyDescriptor(navigator, 'storage')
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        getDirectory: async () => ({
          getDirectoryHandle: async () => ({
            getFileHandle: async () => ({
              getFile: async () => ({
                size: original.byteLength,
                slice: (start: number, end: number) => start === 0
                  ? new Blob([original.slice(start, end) as unknown as BlobPart])
                  : { arrayBuffer: async () => { throw new DOMException('The I/O read operation failed.', 'NotReadableError') } },
              }),
            }),
          }),
        }),
      },
    })
    try {
      const replayed: number[] = []
      for await (const chunk of store.read({ ...stored, storage: 'OPFS', path: 'track-analyser-raw/stream-opfs-fallback.bin' })) replayed.push(...chunk)
      expect(replayed).toEqual([...original])
    } finally {
      if (storageDescriptor === undefined) Reflect.deleteProperty(navigator, 'storage')
      else Object.defineProperty(navigator, 'storage', storageDescriptor)
    }
  })

  it('supprime tous les chunks RAW associés à une session', async () => {
    const store = new ProgressiveRawStore()
    const reference = await store.write('stream-delete', chunkBytes(new TextEncoder().encode('à supprimer'), 3), { sessionId: 'session-delete', sourceId: 'phone', mediaType: 'application/octet-stream' })
    await store.delete(reference)
    await expect((async () => {
      for await (const chunk of store.read(reference)) {
        // Parcourir le flux afin de vérifier que la référence supprimée ne reste pas lisible.
        expect(chunk.byteLength).toBe(0)
      }
    })()).rejects.toThrow(/Chunk RAW manquant/)
  })

  it('supprime atomiquement la session, ses analyses et segments sans effacer les autres participants', async () => {
    const repositories = await LocalRepositories.open()
    await repositories.sessions.put({ ...session('session-a', 'damien'), activityGroupId: 'group' })
    await repositories.sessions.put({ ...session('session-b', 'autre'), activityGroupId: 'group' })
    await repositories.activityGroups.put({ id: 'group', activityType: 'RUNNING', sessionIds: ['session-a', 'session-b'] })
    await repositories.analysisRuns.put({ id: 'run-a', sessionId: 'session-a', analysisVersion: '1', analysisProfileVersion: '1', engineBuildId: 'test', createdAt: '2026-08-21T00:00:00.000Z', isOriginal: true, metricsReference: 'm', eventsReference: 'e', result: { activityType: 'RUNNING', metrics: [], events: [], quality: { gnss: 0, imu: 0, clock: 0, calibration: 0, coverage: 0, fusion: 0, confidence: 0 }, warnings: [], visualizationSeries: {}, routePreview: [] }, inputFingerprint: 'raw' })
    await repositories.segments.put({ id: 'segment-a', sessionId: 'session-a', name: 'A', startTime: 1, endTime: 2, manual: true })

    await repositories.deleteSessionGraph('session-a')

    expect(await repositories.sessions.get('session-a')).toBeUndefined()
    expect(await repositories.analysisRuns.get('run-a')).toBeUndefined()
    expect(await repositories.segments.get('segment-a')).toBeUndefined()
    expect(await repositories.sessions.get('session-b')).toBeDefined()
    expect(await repositories.activityGroups.get('group')).toBeUndefined()
    expect((await repositories.sessions.get('session-b'))?.activityGroupId).toBeUndefined()
  })

  it('migre une session historique incomplète sans toucher à ses données', async () => {
    await deleteTrackAnalyserDatabaseForTests()
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, 1)
      request.onupgradeneeded = () => {
        const sessions = request.result.createObjectStore('sessions', { keyPath: 'id' })
        sessions.createIndex('participantId', 'participantId')
        sessions.createIndex('status', 'status')
        request.result.createObjectStore('participants', { keyPath: 'id' })
        request.result.createObjectStore('activityGroups', { keyPath: 'id' })
        request.result.createObjectStore('equipment', { keyPath: 'id' })
        request.result.createObjectStore('devices', { keyPath: 'id' })
        request.result.createObjectStore('calibrations', { keyPath: 'id' })
        const profiles = request.result.createObjectStore('analysisProfiles', { keyPath: 'id' })
        profiles.createIndex('activityType', 'activityType')
        const runs = request.result.createObjectStore('analysisRuns', { keyPath: 'id' })
        runs.createIndex('sessionId', 'sessionId')
        request.result.createObjectStore('settings')
        sessions.put({ ...session('legacy', 'damien'), status: undefined })
      }
      request.onsuccess = () => { request.result.close(); resolve() }
      request.onerror = () => reject(request.error ?? new Error('Création de la base historique impossible.'))
    })
    const database = await openTrackAnalyserDatabase()
    expect((await database.get('sessions', 'legacy'))?.status).toBe('COMPLETED')
    expect(database.objectStoreNames.contains('segments')).toBe(true)
  })

  it('persiste les segments sans les rattacher au participant voisin', async () => {
    const repositories = await LocalRepositories.open()
    await repositories.segments.put({ id: 'segment-a', sessionId: 'session-a', name: 'Col', startTime: 1, endTime: 2, routeFingerprint: 'route', manual: true })
    await repositories.segments.put({ id: 'segment-b', sessionId: 'session-b', name: 'Col', startTime: 1, endTime: 2, routeFingerprint: 'route', manual: true })
    const stored = await repositories.segments.list()
    expect(stored.map((item) => item.sessionId).toSorted()).toEqual(['session-a', 'session-b'])
    const snapshot = await repositories.snapshot()
    await repositories.segments.delete('segment-a')
    await repositories.restore(snapshot)
    expect((await repositories.segments.get('segment-a'))?.sessionId).toBe('session-a')
  })

  it('signale si la marge locale couvre le RAW et son miroir pour dix heures', async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'storage')
    Object.defineProperty(navigator, 'storage', { configurable: true, value: { estimate: async () => ({ quota: 4 * 1024 ** 3, usage: 1 * 1024 ** 3 }) } })
    await expect(estimateRecordingStorage(10)).resolves.toMatchObject({ status: 'READY', durationHours: 10 })
    Object.defineProperty(navigator, 'storage', { configurable: true, value: { estimate: async () => ({ quota: 1 * 1024 ** 3, usage: 900 * 1024 ** 2 }) } })
    await expect(estimateRecordingStorage(10)).resolves.toMatchObject({ status: 'LOW' })
    if (original === undefined) delete (navigator as { storage?: StorageManager }).storage
    else Object.defineProperty(navigator, 'storage', original)
  })
})
