import type {
  ChannelFusionPolicy,
  ChannelSeries,
  FusionDecision,
  FusionReport,
  MetricChannel,
  PipelineDataset,
  SensorSample,
  SynchronizationReport,
} from '@track-analyser/domain'

export interface FusionOutput {
  dataset: PipelineDataset
  report: FusionReport
}

const SCIENTIFIC_FUSION_CHANNELS = new Set<MetricChannel>([
  'acceleration',
  'longitudinalAcceleration',
  'lateralAcceleration',
  'verticalAcceleration',
  'rotationRate',
  'heartRate',
])

function groupBySource(series: ChannelSeries): Map<string, SensorSample[]> {
  return Map.groupBy(series.samples, (sample) => sample.sourceId)
}

function sourceScore(samples: readonly SensorSample[]): number {
  if (samples.length === 0) return 0
  let qualityTotal = 0
  let coverageTotal = 0
  let accuracyTotal = 0
  samples.forEach((sample) => {
    qualityTotal += sample.quality
    coverageTotal += sample.provenance.coverage
    accuracyTotal += sample.accuracy === undefined ? 0.75 : 1 / (1 + Math.max(0, sample.accuracy))
  })
  const quality = qualityTotal / samples.length
  const coverage = coverageTotal / samples.length
  const accuracy = accuracyTotal / samples.length
  const durationSeconds = Math.max(0.001, ((samples.at(-1)?.timestamp ?? 0) - (samples[0]?.timestamp ?? 0)) / 1000)
  const frequencyFactor = Math.min(1, samples.length / durationSeconds / 10)
  return quality * 0.45 + coverage * 0.3 + accuracy * 0.15 + frequencyFactor * 0.1
}

function choosePriority(sources: Map<string, SensorSample[]>, priority: readonly string[]): string | undefined {
  return priority.find((sourceId) => (sources.get(sourceId)?.length ?? 0) > 0) ?? [...sources.keys()][0]
}

function bestSource(sources: Map<string, SensorSample[]>): string | undefined {
  return [...sources.entries()].toSorted((left, right) => sourceScore(right[1]) - sourceScore(left[1]) || left[0].localeCompare(right[0]))[0]?.[0]
}

function weightedMedian(samples: readonly SensorSample[]): SensorSample {
  const numeric = samples.filter((sample) => typeof sample.value === 'number').toSorted((left, right) => Number(left.value) - Number(right.value))
  const totalWeight = numeric.reduce((sum, sample) => sum + Math.max(0.01, sample.quality / Math.max(0.01, sample.accuracy ?? 1)), 0)
  let accumulated = 0
  const selected =
    numeric.find((sample) => {
      accumulated += Math.max(0.01, sample.quality / Math.max(0.01, sample.accuracy ?? 1))
      return accumulated >= totalWeight / 2
    }) ?? samples[0]
  if (selected === undefined) throw new Error('Impossible de fusionner un groupe vide.')
  return {
    ...selected,
    sourceId: `fusion:${samples.map((sample) => sample.sourceId).toSorted().join('+')}`,
    value: selected.value,
    quality: samples.reduce((maximum, sample) => Math.max(maximum, sample.quality), 0),
    provenance: {
      ...selected.provenance,
      sourceId: samples.map((sample) => sample.sourceId).toSorted().join('+'),
      method: 'médiane pondérée robuste selon qualité et précision',
      original: false,
    },
  }
}

function fuseSamples(samples: readonly SensorSample[]): SensorSample[] {
  const buckets = Map.groupBy(samples, (sample) => Math.round(sample.timestamp / 100))
  return [...buckets.values()].map(weightedMedian).toSorted((left, right) => left.timestamp - right.timestamp)
}

function selectedSeries(series: ChannelSeries, policy: ChannelFusionPolicy): { series: ChannelSeries; decision: FusionDecision } {
  const sources = groupBySource(series)
  const allSourceIds = [...sources.keys()].toSorted()
  if (sources.size === 0) {
    return {
      series,
      decision: {
        channel: series.channel,
        strategy: policy.strategy,
        selectedSourceIds: [],
        rejectedSourceIds: [],
        reason: 'Aucun échantillon disponible.',
        quality: 0,
        coverage: 0,
        switches: 0,
      },
    }
  }

  if (policy.strategy === 'PARALLEL') {
    return {
      series: { channel: series.channel, unit: series.unit, samples: series.samples, provenance: series.provenance, ...(series.divergences === undefined ? {} : { divergences: series.divergences }) },
      decision: {
        channel: series.channel,
        strategy: 'PARALLEL',
        selectedSourceIds: allSourceIds,
        rejectedSourceIds: [],
        reason: 'Conserver toutes les séries originales sans agrégation.',
        quality: [...sources.values()].reduce((maximum, sourceSamples) => Math.max(maximum, sourceScore(sourceSamples)), 0),
        coverage: series.provenance.reduce((maximum, item) => Math.max(maximum, item.coverage), 0),
        switches: 0,
      },
    }
  }

  if (policy.strategy === 'FUSION' && SCIENTIFIC_FUSION_CHANNELS.has(series.channel)) {
    const samples = fuseSamples(series.samples)
    return {
      series: { ...series, samples, ...(samples[0]?.sourceId === undefined ? {} : { selectedSourceId: samples[0].sourceId }) },
      decision: {
        channel: series.channel,
        strategy: 'FUSION',
        selectedSourceIds: allSourceIds,
        rejectedSourceIds: [],
        reason: 'Appliquer une médiane pondérée robuste sur un canal continu autorisé ; conserver les originaux en provenance.',
        quality: samples.reduce((sum, sample) => sum + sample.quality, 0) / Math.max(1, samples.length),
        coverage: series.provenance.reduce((maximum, item) => Math.max(maximum, item.coverage), 0),
        switches: 0,
      },
    }
  }

  const requestedStrategy = policy.strategy
  const selectedSourceId =
    requestedStrategy === 'PRIORITY' ? choosePriority(sources, policy.prioritySourceIds ?? []) : bestSource(sources)
  if (selectedSourceId === undefined) throw new Error('Aucune source sélectionnable.')
  const samples = sources.get(selectedSourceId) ?? []
  const score = sourceScore(samples)
  const belowThreshold = score < (policy.minimumQuality ?? 0)
  return {
    series: { ...series, samples: belowThreshold ? [] : samples, selectedSourceId },
    decision: {
      channel: series.channel,
      strategy: requestedStrategy === 'FUSION' ? 'PARALLEL' : requestedStrategy,
      selectedSourceIds: belowThreshold ? [] : [selectedSourceId],
      rejectedSourceIds: allSourceIds.filter((sourceId) => sourceId !== selectedSourceId),
      reason:
        requestedStrategy === 'FUSION'
          ? 'Refuser une fusion mathématique non validée pour ce canal et retenir la meilleure source explicable.'
          : requestedStrategy === 'PRIORITY'
            ? 'Appliquer l’ordre de priorité explicite du canal.'
            : 'Choisir la source selon qualité, couverture, précision et fréquence observées.',
      quality: score,
      coverage: samples[0]?.provenance.coverage ?? 0,
      switches: 0,
    },
  }
}

export class DataFusionEngine {
  constructor(private readonly engineVersion = '1.0.0') {}

  fuse(dataset: PipelineDataset, policies: readonly ChannelFusionPolicy[]): FusionOutput {
    if (dataset.participantId.length === 0) throw new Error('Le participant doit être déterminé avant la fusion.')
    if (dataset.stage !== 'SYNCHRONIZED') throw new Error('La fusion exige un jeu de données SYNCHRONIZED.')
    const channels = new Map<MetricChannel, ChannelSeries>()
    const decisions: FusionDecision[] = []
    dataset.channels.forEach((series, channel) => {
      const policy = policies.find((candidate) => candidate.channel === channel) ?? { channel, strategy: 'AUTO' as const }
      const selected = selectedSeries(series, policy)
      channels.set(channel, {
        ...selected.series,
        samples: selected.series.samples.map((sample) => ({ ...sample, stage: 'FUSED' })),
      })
      decisions.push(selected.decision)
    })
    return {
      dataset: { ...dataset, stage: 'FUSED', channels },
      report: {
        sessionId: dataset.sessionId,
        participantId: dataset.participantId,
        decisions,
        generatedAt: dataset.createdAt,
        engineVersion: this.engineVersion,
      },
    }
  }
}

export function synchronizeByUtc(dataset: PipelineDataset, offsetsMs: Readonly<Record<string, number>> = {}): PipelineDataset {
  if (dataset.stage !== 'NORMALIZED') throw new Error('La synchronisation exige un jeu NORMALIZED.')
  const channels = new Map(
    [...dataset.channels.entries()].map(([channel, series]) => [
      channel,
      {
        ...series,
        samples: series.samples.map((sample) => ({
          ...sample,
          timestamp: sample.timestamp + (offsetsMs[sample.sourceId] ?? 0),
          stage: 'SYNCHRONIZED' as const,
        })),
      },
    ]),
  )
  const report: SynchronizationReport = {
    method: 'UTC',
    offsetsMs: { ...offsetsMs },
    driftPpm: Object.fromEntries(dataset.sourceIds.map((sourceId) => [sourceId, 0])),
    confidence: 1,
  }
  return { ...dataset, stage: 'SYNCHRONIZED', channels, synchronization: report }
}
