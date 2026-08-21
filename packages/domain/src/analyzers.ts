import { deterministicHash, haversineDistanceMeters, statistics } from './statistics'
import type {
  ActivityType,
  AnalysisEvent,
  AnalysisMetric,
  AnalysisProfile,
  AnalysisResult,
  AnalysisRun,
  ChannelSeries,
  GeoPoint,
  MetricChannel,
  MetricProvenance,
  PipelineDataset,
  Session,
  SessionQuality,
} from './types'

interface MetricDefinition {
  id: string
  label: string
  channel?: MetricChannel
  unit?: string
  aggregate?: 'mean' | 'maximum' | 'minimum' | 'median' | 'p95' | 'rms' | 'last'
  derive?: (context: AnalyzerContext) => number | undefined
  method: string
}

interface AnalyzerContext {
  dataset: PipelineDataset
  profile: AnalysisProfile
  numeric: (channel: MetricChannel) => number[]
  series: (channel: MetricChannel) => ChannelSeries | undefined
}

export interface ActivityAnalyzer {
  readonly activityType: ActivityType
  analyze(dataset: PipelineDataset, profile: AnalysisProfile): AnalysisResult
}

const COMMON_METRICS: readonly MetricDefinition[] = [
  { id: 'duration', label: 'Durée', unit: 's', derive: durationSeconds, method: 'écart entre les horodatages extrêmes' },
  { id: 'distance', label: 'Distance', unit: 'm', derive: totalDistanceMeters, method: 'canal distance ou somme haversine GNSS' },
  { id: 'speed.mean', label: 'Vitesse moyenne', channel: 'speed', unit: 'm/s', aggregate: 'mean', method: 'moyenne des échantillons valides' },
  { id: 'speed.maximum', label: 'Vitesse P99', channel: 'speed', unit: 'm/s', aggregate: 'p95', method: 'percentile robuste des vitesses' },
  { id: 'altitude.minimum', label: 'Altitude minimale', channel: 'altitude', unit: 'm', aggregate: 'minimum', method: 'minimum des altitudes valides' },
  { id: 'altitude.maximum', label: 'Altitude maximale', channel: 'altitude', unit: 'm', aggregate: 'maximum', method: 'maximum des altitudes valides' },
  { id: 'elevation.gain', label: 'Dénivelé positif', unit: 'm', derive: (context) => elevationChange(context, 1), method: 'somme des variations positives filtrées' },
  { id: 'elevation.loss', label: 'Dénivelé négatif', unit: 'm', derive: (context) => elevationChange(context, -1), method: 'somme absolue des variations négatives filtrées' },
  { id: 'verticalSpeed.mean', label: 'Vitesse verticale', channel: 'verticalSpeed', unit: 'm/s', aggregate: 'mean', method: 'moyenne du canal vertical synchronisé' },
  { id: 'acceleration.p95', label: 'Accélération P95', channel: 'acceleration', unit: 'm/s²', aggregate: 'p95', method: 'percentile 95 de la norme accélération' },
  { id: 'jerk.p95', label: 'Jerk P95', channel: 'jerk', unit: 'm/s³', aggregate: 'p95', method: 'percentile 95 du jerk dérivé' },
  { id: 'heartRate.mean', label: 'Fréquence cardiaque', channel: 'heartRate', unit: 'bpm', aggregate: 'mean', method: 'moyenne des mesures cardiaques' },
  { id: 'cadence.mean', label: 'Cadence', channel: 'cadence', unit: 'rpm', aggregate: 'mean', method: 'moyenne des mesures de cadence' },
  { id: 'power.mean', label: 'Puissance', channel: 'power', unit: 'W', aggregate: 'mean', method: 'moyenne des mesures de puissance' },
]

const ACTIVITY_METRICS: Readonly<Record<ActivityType, readonly MetricDefinition[]>> = {
  GENERIC: [
    { id: 'rotation.rms', label: 'Rotation RMS', channel: 'rotationRate', unit: 'rad/s', aggregate: 'rms', method: 'RMS des rotations' },
    { id: 'slope.mean', label: 'Pente moyenne', unit: '%', derive: meanSlopePercent, method: 'rapport dénivelé sur distance par intervalle' },
  ],
  CAR: [
    { id: 'acceleration.longitudinal.p95', label: 'Accélération', channel: 'longitudinalAcceleration', unit: 'm/s²', aggregate: 'p95', method: 'P95 longitudinal' },
    { id: 'braking.minimum', label: 'Freinage maximal', channel: 'longitudinalAcceleration', unit: 'm/s²', aggregate: 'minimum', method: 'minimum longitudinal' },
    { id: 'stability.yawRms', label: 'Stabilité de lacet', channel: 'yaw', unit: 'rad', aggregate: 'rms', method: 'RMS du lacet sur portions en mouvement' },
    { id: 'cornering.lateralP95', label: 'Accélération latérale', channel: 'lateralAcceleration', unit: 'm/s²', aggregate: 'p95', method: 'P95 latéral absolu' },
    { id: 'roll.p95', label: 'Roulis', channel: 'roll', unit: 'rad', aggregate: 'p95', method: 'P95 du roulis calibré' },
    { id: 'pitch.p95', label: 'Tangage', channel: 'pitch', unit: 'rad', aggregate: 'p95', method: 'P95 du tangage calibré' },
  ],
  MOTORCYCLE: [
    { id: 'lean.maximum', label: 'Inclinaison maximale robuste', channel: 'roll', unit: 'rad', aggregate: 'p95', method: 'P95 absolu du roulis moto calibré' },
    { id: 'lean.rms', label: 'Temps sur l’angle', channel: 'roll', unit: 'rad', aggregate: 'rms', method: 'RMS du roulis calibré' },
    { id: 'braking.minimum', label: 'Freinage maximal', channel: 'longitudinalAcceleration', unit: 'm/s²', aggregate: 'minimum', method: 'minimum longitudinal' },
    { id: 'cornering.lateralP95', label: 'Charge latérale', channel: 'lateralAcceleration', unit: 'm/s²', aggregate: 'p95', method: 'P95 latéral' },
    { id: 'lean.symmetry', label: 'Symétrie gauche/droite', unit: '%', derive: signedSymmetry, method: 'écart normalisé des angles gauche et droite' },
  ],
  BIKE: [
    { id: 'slope.mean', label: 'Pente moyenne', unit: '%', derive: meanSlopePercent, method: 'rapport dénivelé sur distance' },
    { id: 'climb.rate', label: 'Vitesse ascensionnelle', channel: 'verticalSpeed', unit: 'm/s', aggregate: 'p95', method: 'P95 de vitesse verticale' },
    { id: 'vibration.rms', label: 'Vibrations', channel: 'verticalAcceleration', unit: 'm/s²', aggregate: 'rms', method: 'RMS vertical haute fréquence' },
    { id: 'temperature.mean', label: 'Température', channel: 'temperature', unit: '°C', aggregate: 'mean', method: 'moyenne du capteur disponible' },
  ],
  BOAT: [
    { id: 'roll.rms', label: 'Roulis RMS', channel: 'roll', unit: 'rad', aggregate: 'rms', method: 'RMS du roulis' },
    { id: 'pitch.rms', label: 'Tangage RMS', channel: 'pitch', unit: 'rad', aggregate: 'rms', method: 'RMS du tangage' },
    { id: 'heading.stability', label: 'Stabilité du cap', channel: 'yaw', unit: 'rad', aggregate: 'rms', method: 'RMS du lacet, sans prétention de hauteur de vague' },
    { id: 'impact.p95', label: 'Impacts', channel: 'verticalAcceleration', unit: 'm/s²', aggregate: 'p95', method: 'P95 vertical' },
    { id: 'agitation.index', label: 'Agitation rencontrée', channel: 'acceleration', unit: 'm/s²', aggregate: 'rms', method: 'RMS dynamique non assimilé à une hauteur de vague' },
  ],
  AIRCRAFT: [
    { id: 'climb.rate', label: 'Taux de montée', channel: 'verticalSpeed', unit: 'm/s', aggregate: 'maximum', method: 'maximum vertical observé' },
    { id: 'descent.rate', label: 'Taux de descente', channel: 'verticalSpeed', unit: 'm/s', aggregate: 'minimum', method: 'minimum vertical observé' },
    { id: 'roll.p95', label: 'Roulis', channel: 'roll', unit: 'rad', aggregate: 'p95', method: 'P95 du roulis' },
    { id: 'pitch.p95', label: 'Tangage', channel: 'pitch', unit: 'rad', aggregate: 'p95', method: 'P95 du tangage' },
    { id: 'vibration.rms', label: 'Vibrations', channel: 'acceleration', unit: 'm/s²', aggregate: 'rms', method: 'RMS dynamique' },
  ],
  PARAGLIDING: [
    { id: 'vario.mean', label: 'Vario moyen', channel: 'verticalSpeed', unit: 'm/s', aggregate: 'mean', method: 'moyenne verticale signée' },
    { id: 'vario.maximum', label: 'Ascendance maximale', channel: 'verticalSpeed', unit: 'm/s', aggregate: 'maximum', method: 'maximum vertical observé' },
    { id: 'thermal.gain', label: 'Gain en thermique', unit: 'm', derive: thermalGain, method: 'gain cumulé au-dessus du seuil thermique versionné' },
    { id: 'groundGlideRatio', label: 'Finesse sol', unit: ':1', derive: groundGlideRatio, method: 'distance horizontale sur altitude perdue, sans correction du vent' },
    { id: 'turn.rate', label: 'Taux de rotation', channel: 'rotationRate', unit: 'rad/s', aggregate: 'mean', method: 'moyenne de rotation en thermique' },
  ],
  HIKING: [
    { id: 'pace.mean', label: 'Allure', unit: 's/km', derive: paceSecondsPerKilometer, method: 'durée de mouvement rapportée à la distance' },
    { id: 'moving.time', label: 'Temps en mouvement', unit: 's', derive: movingTimeSeconds, method: 'intervalles au-dessus du seuil de vitesse versionné' },
    { id: 'pause.time', label: 'Temps de pause', unit: 's', derive: pauseTimeSeconds, method: 'durée totale moins temps en mouvement' },
    { id: 'slope.mean', label: 'Pente moyenne', unit: '%', derive: meanSlopePercent, method: 'rapport dénivelé sur distance' },
  ],
  TRAIL_RUNNING: [
    { id: 'pace.moving', label: 'Allure en mouvement', unit: 's/km', derive: movingPaceSecondsPerKilometer, method: 'allure hors pauses selon profil' },
    { id: 'slope.mean', label: 'Pente moyenne', unit: '%', derive: meanSlopePercent, method: 'rapport dénivelé sur distance' },
    { id: 'climb.rate', label: 'Vitesse ascensionnelle', channel: 'verticalSpeed', unit: 'm/s', aggregate: 'p95', method: 'P95 vertical' },
    { id: 'strideLength.mean', label: 'Longueur de foulée', channel: 'strideLength', unit: 'm', aggregate: 'mean', method: 'moyenne des foulées importées' },
    { id: 'verticalOscillation.mean', label: 'Oscillation verticale', channel: 'verticalOscillation', unit: 'm', aggregate: 'mean', method: 'moyenne de dynamique de course' },
  ],
  RUNNING: [
    { id: 'pace.mean', label: 'Allure moyenne', unit: 's/km', derive: paceSecondsPerKilometer, method: 'durée rapportée à la distance' },
    { id: 'pace.moving', label: 'Allure en mouvement', unit: 's/km', derive: movingPaceSecondsPerKilometer, method: 'allure hors pauses selon profil' },
    { id: 'strideLength.mean', label: 'Longueur de foulée', channel: 'strideLength', unit: 'm', aggregate: 'mean', method: 'moyenne des foulées importées' },
    { id: 'groundContactTime.mean', label: 'Temps de contact au sol', channel: 'groundContactTime', unit: 'ms', aggregate: 'mean', method: 'moyenne de dynamique de course' },
    { id: 'verticalOscillation.mean', label: 'Oscillation verticale', channel: 'verticalOscillation', unit: 'm', aggregate: 'mean', method: 'moyenne de dynamique de course' },
    { id: 'verticalRatio.mean', label: 'Ratio vertical', channel: 'verticalRatio', unit: '%', aggregate: 'mean', method: 'moyenne de dynamique de course' },
  ],
}

function numericValues(series: ChannelSeries | undefined): number[] {
  return series?.samples.flatMap((sample) => (typeof sample.value === 'number' && Number.isFinite(sample.value) ? [sample.value] : [])) ?? []
}

function allTimestamps(context: AnalyzerContext): number[] {
  return [...context.dataset.channels.values()].flatMap((series) => series.samples.map((sample) => sample.timestamp))
}

function durationSeconds(context: AnalyzerContext): number | undefined {
  const timestamps = allTimestamps(context)
  if (timestamps.length < 2) return undefined
  return (Math.max(...timestamps) - Math.min(...timestamps)) / 1000
}

function totalDistanceMeters(context: AnalyzerContext): number | undefined {
  const distanceValues = context.numeric('distance')
  if (distanceValues.length > 0) return Math.max(...distanceValues) - Math.min(...distanceValues)
  const positions = context.series('position')?.samples.flatMap((sample) =>
    typeof sample.value === 'object' && !Array.isArray(sample.value) && 'latitude' in sample.value ? [sample.value as GeoPoint] : [],
  )
  if (positions === undefined || positions.length < 2) return undefined
  return positions.slice(1).reduce((sum, point, index) => sum + haversineDistanceMeters(positions[index] ?? point, point), 0)
}

function elevationChange(context: AnalyzerContext, direction: 1 | -1): number | undefined {
  const altitudes = context.numeric('altitude')
  if (altitudes.length < 2) return undefined
  return altitudes.slice(1).reduce((sum, altitude, index) => {
    const delta = altitude - (altitudes[index] ?? altitude)
    return direction === 1 ? sum + Math.max(0, delta) : sum + Math.max(0, -delta)
  }, 0)
}

function meanSlopePercent(context: AnalyzerContext): number | undefined {
  const distance = totalDistanceMeters(context)
  const gain = elevationChange(context, 1)
  const loss = elevationChange(context, -1)
  if (distance === undefined || distance <= 0 || gain === undefined || loss === undefined) return undefined
  return ((gain - loss) / distance) * 100
}

function paceSecondsPerKilometer(context: AnalyzerContext): number | undefined {
  const distance = totalDistanceMeters(context)
  const duration = durationSeconds(context)
  if (distance === undefined || distance <= 0 || duration === undefined) return undefined
  return duration / (distance / 1000)
}

function movingTimeSeconds(context: AnalyzerContext): number | undefined {
  const samples = context.series('speed')?.samples.filter((sample) => typeof sample.value === 'number')
  if (samples === undefined || samples.length < 2) return undefined
  const threshold = context.profile.parameters.movingSpeedThresholdMps ?? 0.6
  return samples.slice(1).reduce((duration, sample, index) => {
    const previous = samples[index]
    return previous !== undefined && Number(sample.value) >= threshold ? duration + (sample.timestamp - previous.timestamp) / 1000 : duration
  }, 0)
}

function pauseTimeSeconds(context: AnalyzerContext): number | undefined {
  const duration = durationSeconds(context)
  const moving = movingTimeSeconds(context)
  return duration === undefined || moving === undefined ? undefined : Math.max(0, duration - moving)
}

function movingPaceSecondsPerKilometer(context: AnalyzerContext): number | undefined {
  const distance = totalDistanceMeters(context)
  const moving = movingTimeSeconds(context)
  return distance === undefined || distance <= 0 || moving === undefined ? undefined : moving / (distance / 1000)
}

function signedSymmetry(context: AnalyzerContext): number | undefined {
  const roll = context.numeric('roll')
  const left = roll.filter((value) => value < 0).map(Math.abs)
  const right = roll.filter((value) => value > 0)
  if (left.length === 0 || right.length === 0) return undefined
  const leftMean = statistics(left)?.mean ?? 0
  const rightMean = statistics(right)?.mean ?? 0
  const denominator = leftMean + rightMean
  return denominator === 0 ? 100 : (1 - Math.abs(leftMean - rightMean) / denominator) * 100
}

function thermalGain(context: AnalyzerContext): number | undefined {
  const samples = context.series('verticalSpeed')?.samples.filter((sample) => typeof sample.value === 'number')
  if (samples === undefined || samples.length < 2) return undefined
  const threshold = context.profile.parameters.climbThresholdMps ?? 0.3
  return samples.slice(1).reduce((gain, sample, index) => {
    const previous = samples[index]
    const speed = Number(sample.value)
    return previous !== undefined && speed >= threshold ? gain + speed * ((sample.timestamp - previous.timestamp) / 1000) : gain
  }, 0)
}

function groundGlideRatio(context: AnalyzerContext): number | undefined {
  const distance = totalDistanceMeters(context)
  const loss = elevationChange(context, -1)
  return distance === undefined || loss === undefined || loss <= 0 ? undefined : distance / loss
}

function uniqueProvenance(series: ChannelSeries | undefined): MetricProvenance[] {
  return series?.provenance.filter((item, index, values) => values.findIndex((candidate) => candidate.sourceId === item.sourceId && candidate.channel === item.channel) === index) ?? []
}

function metricFromDefinition(definition: MetricDefinition, context: AnalyzerContext): AnalysisMetric {
  const channelSeries = definition.channel === undefined ? undefined : context.series(definition.channel)
  const values = definition.channel === undefined ? [] : context.numeric(definition.channel)
  const summary = statistics(values)
  let value: number | undefined
  if (definition.derive !== undefined) value = definition.derive(context)
  else if (summary !== undefined) {
    const aggregate = definition.aggregate ?? 'mean'
    value = aggregate === 'last' ? values.at(-1) : summary[aggregate]
  }
  if (value === undefined || !Number.isFinite(value)) {
    return {
      id: definition.id,
      label: definition.label,
      status: 'UNAVAILABLE',
      sampleCount: values.length,
      confidence: 0,
      provenance: uniqueProvenance(channelSeries),
      method: definition.method,
      unavailableReason: 'Canal ou couverture insuffisante ; aucune valeur n’est inventée.',
    }
  }
  const quality = channelSeries?.samples.reduce((sum, sample) => sum + sample.quality, 0) ?? values.length
  const confidence = Math.max(0, Math.min(1, quality / Math.max(1, channelSeries?.samples.length ?? values.length)))
  return {
    id: definition.id,
    label: definition.label,
    status: 'AVAILABLE',
    value,
    ...(definition.unit === undefined ? {} : { unit: definition.unit }),
    ...(summary === undefined ? {} : { statistics: summary }),
    sampleCount: Math.max(values.length, value === undefined ? 0 : 1),
    confidence,
    provenance: uniqueProvenance(channelSeries),
    method: definition.method,
  }
}

function eventsFor(context: AnalyzerContext): AnalysisEvent[] {
  const events: AnalysisEvent[] = []
  const longitudinal = context.series('longitudinalAcceleration')?.samples
  const accelerationThreshold = context.profile.parameters.harshAccelerationThresholdMps2 ?? 2.5
  const brakingThreshold = context.profile.parameters.harshBrakingThresholdMps2 ?? -3
  longitudinal?.forEach((sample) => {
    if (typeof sample.value !== 'number') return
    const type = sample.value >= accelerationThreshold ? 'ACCELERATION' : sample.value <= brakingThreshold ? 'BRAKING' : undefined
    if (type !== undefined) {
      events.push({
        id: `${type.toLowerCase()}-${sample.timestamp}-${events.length}`,
        type,
        startTime: sample.timestamp,
        endTime: sample.timestamp,
        severity: Math.abs(sample.value),
        metrics: { acceleration: sample.value },
      })
    }
  })
  if (context.profile.activityType === 'PARAGLIDING') {
    const vertical = context.series('verticalSpeed')?.samples ?? []
    const threshold = context.profile.parameters.climbThresholdMps ?? 0.3
    let start: number | undefined
    vertical.forEach((sample, index) => {
      const climbing = typeof sample.value === 'number' && sample.value >= threshold
      if (climbing && start === undefined) start = sample.timestamp
      const last = index === vertical.length - 1
      if ((!climbing || last) && start !== undefined) {
        const end = sample.timestamp
        if ((end - start) / 1000 >= (context.profile.parameters.thermalMinimumDurationSeconds ?? 20)) {
          events.push({ id: `thermal-${start}`, type: 'THERMAL', startTime: start, endTime: end, metrics: {} })
        }
        start = undefined
      }
    })
  }
  return events
}

function qualityFor(dataset: PipelineDataset): SessionQuality {
  const values = [...dataset.channels.values()]
  const channelQuality = (channel: MetricChannel): number => {
    const samples = dataset.channels.get(channel)?.samples ?? []
    return samples.length === 0 ? 0 : samples.reduce((sum, sample) => sum + sample.quality, 0) / samples.length
  }
  const coverage = values.length === 0 ? 0 : values.reduce((sum, series) => sum + (series.provenance[0]?.coverage ?? 0), 0) / values.length
  const gnss = channelQuality('position')
  const imuChannels: MetricChannel[] = ['acceleration', 'roll', 'pitch', 'yaw']
  const imu = imuChannels.reduce((sum, channel) => sum + channelQuality(channel), 0) / imuChannels.length
  const clock = dataset.synchronization?.confidence ?? 1
  const fusion = values.length === 0 ? 0 : values.filter((series) => series.selectedSourceId !== undefined).length / values.length
  const calibration = values.some((series) => ['roll', 'pitch', 'yaw'].includes(series.channel)) ? 0.7 : 1
  return { gnss, imu, clock, calibration, coverage, fusion, confidence: (gnss + imu + clock + calibration + coverage + fusion) / 6 }
}

class ConfiguredAnalyzer implements ActivityAnalyzer {
  constructor(readonly activityType: ActivityType) {}

  analyze(dataset: PipelineDataset, profile: AnalysisProfile): AnalysisResult {
    if (dataset.participantId.length === 0) throw new Error('Un participant est obligatoire pour analyser une session.')
    if (profile.activityType !== this.activityType) throw new Error('Le profil d’analyse ne correspond pas à l’activité.')
    const context: AnalyzerContext = {
      dataset,
      profile,
      numeric: (channel) => numericValues(dataset.channels.get(channel)),
      series: (channel) => dataset.channels.get(channel),
    }
    const definitions = [...COMMON_METRICS, ...ACTIVITY_METRICS[this.activityType]]
    return {
      activityType: this.activityType,
      metrics: definitions.map((definition) => metricFromDefinition(definition, context)),
      events: eventsFor(context),
      quality: qualityFor(dataset),
      warnings: profile.notes,
      visualizationSeries: Object.fromEntries(
        [...dataset.channels.entries()]
          .map(([channel, series]) => [channel, decimate(numericValues(series), 500)] as const)
          .filter(([, values]) => values.length > 0),
      ),
      routePreview: decimate(
        dataset.channels.get('position')?.samples.flatMap((sample) =>
          typeof sample.value === 'object' && !Array.isArray(sample.value) && 'latitude' in sample.value ? [sample.value as GeoPoint] : [],
        ) ?? [],
        1_000,
      ),
    }
  }
}

function decimate<T>(values: readonly T[], maximum: number): T[] {
  if (values.length <= maximum) return [...values]
  const step = values.length / maximum
  return Array.from({ length: maximum }, (_, index) => values[Math.min(values.length - 1, Math.floor(index * step))]).filter(
    (value): value is T => value !== undefined,
  )
}

export const ACTIVITY_ANALYZERS: Readonly<Record<ActivityType, ActivityAnalyzer>> = {
  GENERIC: new ConfiguredAnalyzer('GENERIC'),
  CAR: new ConfiguredAnalyzer('CAR'),
  MOTORCYCLE: new ConfiguredAnalyzer('MOTORCYCLE'),
  BIKE: new ConfiguredAnalyzer('BIKE'),
  BOAT: new ConfiguredAnalyzer('BOAT'),
  AIRCRAFT: new ConfiguredAnalyzer('AIRCRAFT'),
  PARAGLIDING: new ConfiguredAnalyzer('PARAGLIDING'),
  HIKING: new ConfiguredAnalyzer('HIKING'),
  TRAIL_RUNNING: new ConfiguredAnalyzer('TRAIL_RUNNING'),
  RUNNING: new ConfiguredAnalyzer('RUNNING'),
}

export interface AnalysisExecutionOptions {
  analysisVersion: string
  engineBuildId: string
  gitCommit?: string
  now?: string
}

export function executeAnalysis(
  session: Session,
  dataset: PipelineDataset,
  profile: AnalysisProfile,
  previousRuns: readonly AnalysisRun[],
  options: AnalysisExecutionOptions,
): AnalysisRun {
  if (session.participantId !== dataset.participantId) throw new Error('Le jeu de données appartient à un autre participant.')
  const result = ACTIVITY_ANALYZERS[session.activityType].analyze(dataset, profile)
  const inputFingerprint = deterministicHash({
    participantId: dataset.participantId,
    sessionId: dataset.sessionId,
    channels: [...dataset.channels.entries()].map(([channel, series]) => [channel, series.samples]),
    analysisVersion: options.analysisVersion,
    profile,
  })
  const isOriginal = previousRuns.length === 0
  const createdAt = options.now ?? new Date().toISOString()
  return {
    id: `analysis-${session.id}-${options.analysisVersion}-${inputFingerprint}`,
    sessionId: session.id,
    analysisVersion: options.analysisVersion,
    analysisProfileVersion: profile.version,
    engineBuildId: options.engineBuildId,
    ...(options.gitCommit === undefined ? {} : { gitCommit: options.gitCommit }),
    createdAt,
    isOriginal,
    metricsReference: `analysis/${inputFingerprint}/metrics.json`,
    eventsReference: `analysis/${inputFingerprint}/events.json`,
    qualityReference: `analysis/${inputFingerprint}/quality.json`,
    result,
    inputFingerprint,
  }
}

export function attachAnalysisRun(session: Session, run: AnalysisRun): Session {
  if (run.sessionId !== session.id) throw new Error('L’analyse ne correspond pas à la session.')
  const runIds = session.analysisRunIds.includes(run.id) ? session.analysisRunIds : [...session.analysisRunIds, run.id]
  return {
    ...session,
    analysisRunIds: runIds,
    originalAnalysisRunId: session.originalAnalysisRunId ?? run.id,
    latestAnalysisRunId: run.id,
  }
}
