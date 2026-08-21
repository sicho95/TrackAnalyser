import type { SensorSample, Session } from '@track-analyser/domain'
import { LocalRepositories } from './repositories'

export interface AcquisitionCheckpoint {
  sessionId: string
  persistedSamples: number
  lastTimestamp: number
  savedAt: string
}

export class SessionCheckpointService {
  constructor(private readonly repositories: LocalRepositories) {}

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
      if (session?.status === 'RECORDING') await this.repositories.sessions.put({ ...session, status: 'INTERRUPTED' })
    }
    return this.repositories.interruptedSessions()
  }
}
