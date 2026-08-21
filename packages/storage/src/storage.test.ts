import { beforeEach, describe, expect, it } from 'vitest'
import { session } from '../../../tests/helpers'
import { SessionCheckpointService } from './checkpoints'
import { DATABASE_NAME, deleteTrackAnalyserDatabaseForTests, openTrackAnalyserDatabase } from './database'
import { chunkBytes, ProgressiveRawStore } from './raw-store'
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
})
