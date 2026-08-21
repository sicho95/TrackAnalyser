import type {
  ChannelSeries,
  ImportTargetDecision,
  MetricChannel,
  Participant,
  PipelineDataset,
  PipelineStage,
  SensorSample,
  Session,
} from './types'

export function createPipelineDataset(
  sessionId: string,
  participantId: string,
  samples: readonly SensorSample[],
  stage: PipelineStage,
): PipelineDataset {
  if (participantId.length === 0) throw new Error('Un participant est obligatoire.')
  const channels = new Map<MetricChannel, ChannelSeries>()
  const grouped = Map.groupBy(samples, (sample) => sample.channel)
  grouped.forEach((channelSamples, channel) => {
    const ordered = channelSamples.toSorted((left, right) => left.timestamp - right.timestamp || (left.sequence ?? 0) - (right.sequence ?? 0))
    channels.set(channel, {
      channel,
      unit: ordered[0]?.unit ?? '',
      samples: ordered.map((sample) => ({ ...sample, stage })),
      provenance: ordered.map((sample) => sample.provenance),
    })
  })
  return {
    sessionId,
    participantId,
    stage,
    channels,
    sourceIds: [...new Set(samples.map((sample) => sample.sourceId))],
    createdAt: new Date(Math.max(0, ...samples.map((sample) => sample.timestamp))).toISOString(),
  }
}

export function transitionDataset(dataset: PipelineDataset, targetStage: PipelineStage): PipelineDataset {
  const order: PipelineStage[] = ['RAW', 'NORMALIZED', 'SYNCHRONIZED', 'FUSED', 'DERIVED', 'ANALYSIS']
  if (order.indexOf(targetStage) !== order.indexOf(dataset.stage) + 1) {
    throw new Error(`Transition invalide de ${dataset.stage} vers ${targetStage}.`)
  }
  return {
    ...dataset,
    stage: targetStage,
    channels: new Map(
      [...dataset.channels.entries()].map(([channel, series]) => [
        channel,
        { ...series, samples: series.samples.map((sample) => ({ ...sample, stage: targetStage })) },
      ]),
    ),
  }
}

export function sessionsEligibleForImport(participantId: string, sessions: readonly Session[]): Session[] {
  if (participantId.length === 0) throw new Error('Choisir le participant avant de rechercher une session.')
  return sessions.filter((session) => session.participantId === participantId)
}

export function validateImportTarget(
  decision: ImportTargetDecision,
  participants: readonly Participant[],
  sessions: readonly Session[],
): void {
  if (!participants.some((participant) => participant.id === decision.participantId && !participant.archived)) {
    throw new Error('Le participant cible est introuvable ou archivé.')
  }
  if (decision.sessionId !== undefined) {
    const session = sessions.find((candidate) => candidate.id === decision.sessionId)
    if (session === undefined) throw new Error('La session cible est introuvable.')
    if (session.participantId !== decision.participantId) {
      throw new Error('Interdiction d’enrichir une session appartenant à un autre participant.')
    }
  }
}

