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

export function deriveDataset(dataset: PipelineDataset): PipelineDataset {
  if (dataset.stage !== 'FUSED') throw new Error('La dérivation exige un jeu FUSED.')
  const channels = new Map(dataset.channels)
  deriveNumericChannel(channels, 'speed', 'distance', 'm/s')
  deriveNumericChannel(channels, 'verticalSpeed', 'altitude', 'm/s')
  deriveNumericChannel(channels, 'jerk', 'acceleration', 'm/s³')
  return {
    ...dataset,
    stage: 'DERIVED',
    channels: new Map(
      [...channels.entries()].map(([channel, series]) => [channel, { ...series, samples: series.samples.map((sample) => ({ ...sample, stage: 'DERIVED' as const })) }]),
    ),
  }
}

function deriveNumericChannel(
  channels: Map<MetricChannel, ChannelSeries>,
  target: MetricChannel,
  source: MetricChannel,
  unit: string,
): void {
  if (channels.has(target)) return
  const sourceSeries = channels.get(source)
  const sourceSamples = sourceSeries?.samples.filter((sample) => typeof sample.value === 'number') ?? []
  if (sourceSamples.length < 2 || sourceSeries === undefined) return
  const samples = sourceSamples.slice(1).flatMap((sample, index) => {
    const previous = sourceSamples[index]
    if (previous === undefined) return []
    const durationSeconds = (sample.timestamp - previous.timestamp) / 1000
    if (durationSeconds <= 0) return []
    const value = (Number(sample.value) - Number(previous.value)) / durationSeconds
    return [{
      ...sample,
      channel: target,
      value,
      unit,
      stage: 'DERIVED' as const,
      provenance: {
        ...sample.provenance,
        channel: target,
        method: `dérivée temporelle du canal ${source}`,
        original: false,
      },
    }]
  })
  channels.set(target, {
    channel: target,
    unit,
    samples,
    provenance: samples.map((sample) => sample.provenance),
    ...(sourceSeries.selectedSourceId === undefined ? {} : { selectedSourceId: sourceSeries.selectedSourceId }),
  })
}

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
