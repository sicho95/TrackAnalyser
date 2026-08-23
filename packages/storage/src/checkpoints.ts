import type { SensorSample, Session } from '@track-analyser/domain'
import { LocalRepositories } from './repositories'
import { ProgressiveRawStore } from './raw-store'

export interface AcquisitionCheckpoint {
  sessionId: string
  persistedSamples: number
  lastTimestamp: number
  savedAt: string
}

export class SessionCheckpointService {
  constructor(
    private readonly repositories: LocalRepositories,
    private readonly rawStore = new ProgressiveRawStore(),
  ) {}

  async markRecording(session: Session): Promise<void> {
    await this.repositories.sessions.put({ ...session, status: 'RECORDING', checkpointAt: new Date().toISOString() })
    const settings = await this.repositories.getSettings()
    await this.repositories.putSettings({ ...settings, activeSessionId: session.id })
  }

  async checkpoint(session: Session, samples: readonly SensorSample[]): Promise<AcquisitionCheckpoint> {
    const savedAt = new Date().toISOString()
    await this.repositories.sessions.put({ ...session, status: 'RECORDING', checkpointAt: savedAt })
    return {
      sessionId: session.id,
      persistedSamples: samples.length,
      lastTimestamp: samples.at(-1)?.timestamp ?? 0,
      savedAt,
    }
  }

  async complete(session: Session, endTime = new Date().toISOString()): Promise<void> {
    await this.repositories.sessions.put({ ...session, status: 'COMPLETED', endTime, checkpointAt: endTime })
    const settings = await this.repositories.getSettings()
    const nextSettings = { ...settings }
    delete nextSettings.activeSessionId
    await this.repositories.putSettings(nextSettings)
  }

  async recoverInterrupted(): Promise<Session[]> {
    const settings = await this.repositories.getSettings()
    if (settings.activeSessionId !== undefined) {
      const session = await this.repositories.sessions.get(settings.activeSessionId)
      if (session?.status === 'RECORDING') {
        const reference = session.activeRawStreamId === undefined ? undefined : await this.rawStore.recoverReference(session.activeRawStreamId, {
          sessionId: session.id,
          sourceId: 'phone',
          mediaType: session.activeRawMediaType ?? 'application/x-ndjson',
          ...(session.activeRawFormatVersion === undefined ? {} : { formatVersion: session.activeRawFormatVersion }),
        })
        if (reference === undefined) {
          await this.repositories.sessions.put({ ...withoutActiveStream(session), status: 'INTERRUPTED' })
        } else {
          const endTime = session.checkpointAt ?? new Date().toISOString()
          await this.repositories.sessions.put({
            ...withoutActiveStream(session),
            status: 'COMPLETED',
            analysisStatus: 'PENDING',
            endTime,
            checkpointAt: endTime,
            rawDataReferences: session.rawDataReferences.some((item) => item.id === reference.id) ? session.rawDataReferences : [...session.rawDataReferences, reference],
          })
        }
      }
      const nextSettings = { ...settings }
      delete nextSettings.activeSessionId
      await this.repositories.putSettings(nextSettings)
    }
    return this.repositories.interruptedSessions()
  }
}

function withoutActiveStream(session: Session): Session {
  const result = { ...session }
  delete result.activeRawStreamId
  delete result.activeRawMediaType
  delete result.activeRawFormatVersion
  return result
}
