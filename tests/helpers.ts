import type { ActivityType, Participant, SensorSample, Session } from '../packages/domain/src/types'

export function participant(id: string): Participant {
  return { id, name: id, createdAt: '2026-08-21T10:00:00.000Z', updatedAt: '2026-08-21T10:00:00.000Z', archived: false }
}

export function session(id: string, participantId: string, activityType: ActivityType = 'RUNNING'): Session {
  return {
    id,
    participantId,
    activityType,
    sourceIds: ['source-a'],
    startTime: '2026-08-21T10:00:00.000Z',
    endTime: '2026-08-21T10:01:00.000Z',
    schemaVersion: 4,
    rawDataReferences: [],
    analysisRunIds: [],
    status: 'COMPLETED',
  }
}

export function sample(channel: SensorSample['channel'], value: SensorSample['value'], timestamp: number, sourceId = 'source-a', quality = 0.9): SensorSample {
  return {
    timestamp,
    channel,
    value,
    unit: channel === 'speed' ? 'm/s' : channel === 'altitude' ? 'm' : '',
    sourceId,
    quality,
    stage: 'RAW',
    provenance: { sourceId, channel, sampleCount: 1, coverage: 1, quality, method: 'fixture', original: true },
  }
}
