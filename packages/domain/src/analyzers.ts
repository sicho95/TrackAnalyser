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
  SensorSample,
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
    { id: 'speed.median', label: 'Vitesse médiane', channel: 'speed', unit: 'm/s', aggregate: 'median', method: 'médiane des vitesses valides' },
    { id: 'acceleration.longitudinal.p95', label: 'Accélération', channel: 'longitudinalAcceleration', unit: 'm/s²', aggregate: 'p95', method: 'P95 longitudinal' },
    { id: 'acceleration.events', label: 'Phases d’accélération', unit: 'événements', derive: (context) => thresholdCount(context, 'longitudinalAcceleration', context.profile.parameters.harshAccelerationThresholdMps2 ?? 2.5, 1), method: 'nombre de franchissements du seuil d’accélération du profil' },
    { id: 'braking.minimum', label: 'Freinage maximal', channel: 'longitudinalAcceleration', unit: 'm/s²', aggregate: 'minimum', method: 'minimum longitudinal' },
    { id: 'braking.events', label: 'Freinages brusques', unit: 'événements', derive: (context) => thresholdCount(context, 'longitudinalAcceleration', context.profile.parameters.harshBrakingThresholdMps2 ?? -3, -1), method: 'nombre de franchissements du seuil de freinage du profil' },
    { id: 'stability.yawRms', label: 'Stabilité de lacet', channel: 'yaw', unit: 'rad', aggregate: 'rms', method: 'RMS du lacet sur portions en mouvement' },
    { id: 'stability.correctionsPerKm', label: 'Corrections par kilomètre', unit: '/km', derive: correctionsPerKilometer, method: 'inversions du signe latéral rapportées à la distance' },
    { id: 'cornering.lateralP95', label: 'Accélération latérale', channel: 'lateralAcceleration', unit: 'm/s²', aggregate: 'p95', method: 'P95 latéral absolu' },
    { id: 'roll.p95', label: 'Roulis', channel: 'roll', unit: 'rad', aggregate: 'p95', method: 'P95 du roulis calibré' },
    { id: 'pitch.p95', label: 'Tangage', channel: 'pitch', unit: 'rad', aggregate: 'p95', method: 'P95 du tangage calibré' },
    { id: 'score.fluidity', label: 'Fluidité', unit: '/100', derive: (context) => inverseScore(context, 'jerk', 5), method: 'score 100/(1+RMS jerk/5), profil versionné et valeur physique conservée' },
    { id: 'score.stability', label: 'Stabilité', unit: '/100', derive: (context) => inverseScore(context, 'lateralAcceleration', 3), method: 'score 100/(1+RMS latéral/3), profil versionné et valeur physique conservée' },
    { id: 'score.braking', label: 'Freinage', unit: '/100', derive: (context) => inverseScore(context, 'longitudinalAcceleration', 3), method: 'score 100/(1+RMS longitudinal/3), profil versionné et valeur physique conservée' },
  ],
  MOTORCYCLE: [
    { id: 'lean.maximum', label: 'Inclinaison maximale robuste', channel: 'roll', unit: 'rad', aggregate: 'p95', method: 'P95 absolu du roulis moto calibré' },
    { id: 'lean.rms', label: 'Temps sur l’angle', channel: 'roll', unit: 'rad', aggregate: 'rms', method: 'RMS du roulis calibré' },
    { id: 'lean.duration', label: 'Durée sur l’angle', unit: 's', derive: (context) => durationBeyond(context, 'roll', 0.15), method: 'durée avec roulis absolu supérieur à 0,15 rad' },
    { id: 'lean.rate', label: 'Vitesse de mise sur l’angle', channel: 'rotationRate', unit: 'rad/s', aggregate: 'p95', method: 'P95 de rotation' },
    { id: 'braking.minimum', label: 'Freinage maximal', channel: 'longitudinalAcceleration', unit: 'm/s²', aggregate: 'minimum', method: 'minimum longitudinal' },
    { id: 'cornering.lateralP95', label: 'Charge latérale', channel: 'lateralAcceleration', unit: 'm/s²', aggregate: 'p95', method: 'P95 latéral' },
    { id: 'lean.symmetry', label: 'Symétrie gauche/droite', unit: '%', derive: signedSymmetry, method: 'écart normalisé des angles gauche et droite' },
    { id: 'regularity.score', label: 'Régularité', unit: '/100', derive: (context) => regularityScore(context, 'speed'), method: 'inverse du coefficient de variation de vitesse' },
  ],
  BIKE: [
    { id: 'slope.mean', label: 'Pente moyenne', unit: '%', derive: meanSlopePercent, method: 'rapport dénivelé sur distance' },
    { id: 'climb.rate', label: 'Vitesse ascensionnelle', channel: 'verticalSpeed', unit: 'm/s', aggregate: 'p95', method: 'P95 de vitesse verticale' },
    { id: 'vibration.rms', label: 'Vibrations', channel: 'verticalAcceleration', unit: 'm/s²', aggregate: 'rms', method: 'RMS vertical haute fréquence' },
    { id: 'temperature.mean', label: 'Température', channel: 'temperature', unit: '°C', aggregate: 'mean', method: 'moyenne du capteur disponible' },
    { id: 'slowdown.events', label: 'Ralentissements', unit: 'événements', derive: (context) => thresholdCount(context, 'longitudinalAcceleration', -1.5, -1), method: 'franchissements de -1,5 m/s², seuil du profil V1' },
  ],
  BOAT: [
    { id: 'roll.rms', label: 'Roulis RMS', channel: 'roll', unit: 'rad', aggregate: 'rms', method: 'RMS du roulis' },
    { id: 'pitch.rms', label: 'Tangage RMS', channel: 'pitch', unit: 'rad', aggregate: 'rms', method: 'RMS du tangage' },
    { id: 'heading.stability', label: 'Stabilité du cap', channel: 'yaw', unit: 'rad', aggregate: 'rms', method: 'RMS du lacet, sans prétention de hauteur de vague' },
    { id: 'impact.p95', label: 'Impacts', channel: 'verticalAcceleration', unit: 'm/s²', aggregate: 'p95', method: 'P95 vertical' },
    { id: 'impact.count', label: 'Nombre d’impacts', unit: 'événements', derive: (context) => thresholdCount(context, 'verticalAcceleration', context.profile.parameters.vibrationImpactThresholdMps2 ?? 8, 1), method: 'franchissements du seuil d’impact versionné' },
    { id: 'agitation.index', label: 'Agitation rencontrée', channel: 'acceleration', unit: 'm/s²', aggregate: 'rms', method: 'RMS dynamique non assimilé à une hauteur de vague' },
    { id: 'oscillation.frequency', label: 'Fréquence d’oscillation', unit: 'Hz', derive: (context) => zeroCrossingFrequency(context, 'roll'), method: 'demi-fréquence des passages par zéro du roulis' },
  ],
  AIRCRAFT: [
    { id: 'climb.rate', label: 'Taux de montée', channel: 'verticalSpeed', unit: 'm/s', aggregate: 'maximum', method: 'maximum vertical observé' },
    { id: 'descent.rate', label: 'Taux de descente', channel: 'verticalSpeed', unit: 'm/s', aggregate: 'minimum', method: 'minimum vertical observé' },
    { id: 'roll.p95', label: 'Roulis', channel: 'roll', unit: 'rad', aggregate: 'p95', method: 'P95 du roulis' },
    { id: 'pitch.p95', label: 'Tangage', channel: 'pitch', unit: 'rad', aggregate: 'p95', method: 'P95 du tangage' },
    { id: 'vibration.rms', label: 'Vibrations', channel: 'acceleration', unit: 'm/s²', aggregate: 'rms', method: 'RMS dynamique' },
    { id: 'stability.score', label: 'Stabilité', unit: '/100', derive: (context) => inverseScore(context, 'rotationRate', 0.2), method: 'score explicable par RMS de rotation et seuil versionné' },
  ],
  PARAGLIDING: [
    { id: 'vario.mean', label: 'Vario moyen', channel: 'verticalSpeed', unit: 'm/s', aggregate: 'mean', method: 'moyenne verticale signée' },
    { id: 'vario.maximum', label: 'Ascendance maximale', channel: 'verticalSpeed', unit: 'm/s', aggregate: 'maximum', method: 'maximum vertical observé' },
    { id: 'thermal.gain', label: 'Gain en thermique', unit: 'm', derive: thermalGain, method: 'gain cumulé au-dessus du seuil thermique versionné' },
    { id: 'thermal.count', label: 'Thermiques', unit: 'événements', derive: thermalCount, method: 'séquences ascendantes dépassant durée et seuil du profil' },
    { id: 'ascending.time', label: 'Temps ascendant', unit: 's', derive: (context) => signedVerticalDuration(context, 1), method: 'durée au-dessus du seuil de montée versionné' },
    { id: 'descending.time', label: 'Temps descendant', unit: 's', derive: (context) => signedVerticalDuration(context, -1), method: 'durée sous le seuil de descente versionné' },
    { id: 'groundGlideRatio', label: 'Finesse sol', unit: ':1', derive: groundGlideRatio, method: 'distance horizontale sur altitude perdue, sans correction du vent' },
    { id: 'turn.rate', label: 'Taux de rotation', channel: 'rotationRate', unit: 'rad/s', aggregate: 'mean', method: 'moyenne de rotation en thermique' },
  ],
  HIKING: [
    { id: 'pace.mean', label: 'Allure', unit: 's/km', derive: paceSecondsPerKilometer, method: 'durée de mouvement rapportée à la distance' },
    { id: 'moving.time', label: 'Temps en mouvement', unit: 's', derive: movingTimeSeconds, method: 'intervalles au-dessus du seuil de vitesse versionné' },
    { id: 'pause.time', label: 'Temps de pause', unit: 's', derive: pauseTimeSeconds, method: 'durée totale moins temps en mouvement' },
    { id: 'slope.mean', label: 'Pente moyenne', unit: '%', derive: meanSlopePercent, method: 'rapport dénivelé sur distance' },
    { id: 'regularity.score', label: 'Régularité', unit: '/100', derive: (context) => regularityScore(context, 'speed'), method: 'inverse du coefficient de variation de vitesse' },
  ],
  TRAIL_RUNNING: [
    { id: 'pace.moving', label: 'Allure en mouvement', unit: 's/km', derive: movingPaceSecondsPerKilometer, method: 'allure hors pauses selon profil' },
    { id: 'slope.mean', label: 'Pente moyenne', unit: '%', derive: meanSlopePercent, method: 'rapport dénivelé sur distance' },
    { id: 'climb.rate', label: 'Vitesse ascensionnelle', channel: 'verticalSpeed', unit: 'm/s', aggregate: 'p95', method: 'P95 vertical' },
    { id: 'strideLength.mean', label: 'Longueur de foulée', channel: 'strideLength', unit: 'm', aggregate: 'mean', method: 'moyenne des foulées importées' },
    { id: 'verticalOscillation.mean', label: 'Oscillation verticale', channel: 'verticalOscillation', unit: 'm', aggregate: 'mean', method: 'moyenne de dynamique de course' },
    { id: 'regularity.score', label: 'Régularité', unit: '/100', derive: (context) => regularityScore(context, 'speed'), method: 'inverse du coefficient de variation de vitesse' },
  ],
  RUNNING: [
    { id: 'pace.mean', label: 'Allure moyenne', unit: 's/km', derive: paceSecondsPerKilometer, method: 'durée rapportée à la distance' },
    { id: 'pace.moving', label: 'Allure en mouvement', unit: 's/km', derive: movingPaceSecondsPerKilometer, method: 'allure hors pauses selon profil' },
    { id: 'strideLength.mean', label: 'Longueur de foulée', channel: 'strideLength', unit: 'm', aggregate: 'mean', method: 'moyenne des foulées importées' },
    { id: 'groundContactTime.mean', label: 'Temps de contact au sol', channel: 'groundContactTime', unit: 'ms', aggregate: 'mean', method: 'moyenne de dynamique de course' },
    { id: 'verticalOscillation.mean', label: 'Oscillation verticale', channel: 'verticalOscillation', unit: 'm', aggregate: 'mean', method: 'moyenne de dynamique de course' },
    { id: 'verticalRatio.mean', label: 'Ratio vertical', channel: 'verticalRatio', unit: '%', aggregate: 'mean', method: 'moyenne de dynamique de course' },
    { id: 'splits.kilometerCount', label: 'Splits kilométriques complets', unit: 'splits', derive: (context) => { const distance = totalDistanceMeters(context); return distance === undefined ? undefined : Math.floor(distance / 1000) }, method: 'nombre de kilomètres complets issus de la distance conservée' },
    { id: 'regularity.score', label: 'Régularité', unit: '/100', derive: (context) => regularityScore(context, 'speed'), method: 'inverse du coefficient de variation de vitesse' },
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

function thresholdCount(context: AnalyzerContext, channel: MetricChannel, threshold: number, direction: 1 | -1): number | undefined {
  const values = context.numeric(channel)
  if (values.length === 0) return undefined
  let count = 0
  let active = false
  values.forEach((value) => {
    const exceeds = direction === 1 ? value >= threshold : value <= threshold
    if (exceeds && !active) count += 1
    active = exceeds
  })
  return count
}

function durationBeyond(context: AnalyzerContext, channel: MetricChannel, absoluteThreshold: number): number | undefined {
  const samples = context.series(channel)?.samples.filter((sample) => typeof sample.value === 'number')
  if (samples === undefined || samples.length < 2) return undefined
  return samples.slice(1).reduce((sum, sample, index) => {
    const previous = samples[index]
    return previous !== undefined && Math.abs(Number(sample.value)) >= absoluteThreshold ? sum + (sample.timestamp - previous.timestamp) / 1000 : sum
  }, 0)
}

function regularityScore(context: AnalyzerContext, channel: MetricChannel): number | undefined {
  const summary = statistics(context.numeric(channel))
  if (summary === undefined || Math.abs(summary.mean) <= Number.EPSILON) return undefined
  return Math.max(0, Math.min(100, 100 / (1 + summary.standardDeviation / Math.abs(summary.mean))))
}

function inverseScore(context: AnalyzerContext, channel: MetricChannel, reference: number): number | undefined {
  const summary = statistics(context.numeric(channel))
  return summary === undefined ? undefined : Math.max(0, Math.min(100, 100 / (1 + summary.rms / reference)))
}

function correctionsPerKilometer(context: AnalyzerContext): number | undefined {
  const values = context.numeric('lateralAcceleration')
  const distance = totalDistanceMeters(context)
  if (values.length < 2 || distance === undefined || distance <= 0) return undefined
  const corrections = values.slice(1).filter((value, index) => Math.sign(value) !== Math.sign(values[index] ?? value)).length
  return corrections / (distance / 1000)
}

function zeroCrossingFrequency(context: AnalyzerContext, channel: MetricChannel): number | undefined {
  const series = context.series(channel)?.samples.filter((sample) => typeof sample.value === 'number')
  if (series === undefined || series.length < 2) return undefined
  const duration = ((series.at(-1)?.timestamp ?? 0) - (series[0]?.timestamp ?? 0)) / 1000
  if (duration <= 0) return undefined
  const crossings = series.slice(1).filter((sample, index) => Math.sign(Number(sample.value)) !== Math.sign(Number(series[index]?.value ?? sample.value))).length
  return crossings / (2 * duration)
}

function thermalCount(context: AnalyzerContext): number | undefined {
  const samples = context.series('verticalSpeed')?.samples.filter((sample) => typeof sample.value === 'number')
  if (samples === undefined || samples.length < 2) return undefined
  const threshold = context.profile.parameters.climbThresholdMps ?? 0.3
  const minimumDuration = context.profile.parameters.thermalMinimumDurationSeconds ?? 20
  let start: number | undefined
  let count = 0
  samples.forEach((sample, index) => {
    const climbing = Number(sample.value) >= threshold
    if (climbing && start === undefined) start = sample.timestamp
    if ((!climbing || index === samples.length - 1) && start !== undefined) {
      if ((sample.timestamp - start) / 1000 >= minimumDuration) count += 1
      start = undefined
    }
  })
  return count
}

function signedVerticalDuration(context: AnalyzerContext, direction: 1 | -1): number | undefined {
  const samples = context.series('verticalSpeed')?.samples.filter((sample) => typeof sample.value === 'number')
  if (samples === undefined || samples.length < 2) return undefined
  const threshold = direction === 1 ? context.profile.parameters.climbThresholdMps ?? 0.3 : context.profile.parameters.sinkThresholdMps ?? -0.5
  return samples.slice(1).reduce((sum, sample, index) => {
    const previous = samples[index]
    const qualifies = direction === 1 ? Number(sample.value) >= threshold : Number(sample.value) <= threshold
    return previous !== undefined && qualifies ? sum + (sample.timestamp - previous.timestamp) / 1000 : sum
  }, 0)
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
        context: comparableContext(context, type, sample.timestamp, sample.quality),
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
          events.push({ id: `thermal-${start}`, type: 'THERMAL', startTime: start, endTime: end, metrics: {}, context: comparableContext(context, 'THERMAL', start, sample.quality, (end - start) / 1_000) })
        }
        start = undefined
      }
    })
  }
  if (context.profile.activityType === 'BOAT') {
    const threshold = context.profile.parameters.vibrationImpactThresholdMps2 ?? 8
    context.series('verticalAcceleration')?.samples.forEach((sample) => {
      if (typeof sample.value === 'number' && Math.abs(sample.value) >= threshold) {
        events.push({ id: `impact-${sample.timestamp}`, type: 'IMPACT', startTime: sample.timestamp, endTime: sample.timestamp, severity: Math.abs(sample.value), metrics: { verticalAcceleration: sample.value }, context: comparableContext(context, 'IMPACT', sample.timestamp, sample.quality) })
      }
    })
  }
  if (context.profile.activityType === 'MOTORCYCLE') {
    context.series('roll')?.samples.forEach((sample) => {
      if (typeof sample.value === 'number' && Math.abs(sample.value) >= 0.35) {
        const type = sample.value < 0 ? 'LEAN_LEFT' : 'LEAN_RIGHT'
        events.push({ id: `lean-${sample.timestamp}`, type, startTime: sample.timestamp, endTime: sample.timestamp, severity: Math.abs(sample.value), metrics: { roll: sample.value }, context: comparableContext(context, type, sample.timestamp, sample.quality) })
      }
    })
  }
  if (context.profile.activityType === 'AIRCRAFT') events.push(...aircraftPhases(context))
  return events
}

function aircraftPhases(context: AnalyzerContext): AnalysisEvent[] {
  const speeds = context.series('speed')?.samples.filter((sample) => typeof sample.value === 'number') ?? []
  const vertical = context.series('verticalSpeed')?.samples.filter((sample) => typeof sample.value === 'number') ?? []
  const firstSpeed = speeds[0]
  if (firstSpeed === undefined) return []
  const verticalAt = (timestamp: number): number => {
    const closest = vertical.reduce<SensorSample | undefined>((selected, sample) =>
      selected === undefined || Math.abs(sample.timestamp - timestamp) < Math.abs(selected.timestamp - timestamp) ? sample : selected,
    undefined)
    return Number(closest?.value ?? 0)
  }
  const phaseAt = (sample: SensorSample): string => {
    const speed = Number(sample.value)
    const climb = verticalAt(sample.timestamp)
    if (speed < 3) return 'GROUND_STOP'
    if (speed < 20) return 'TAXI'
    if (climb > 1) return speed < 35 ? 'TAKEOFF' : 'CLIMB'
    if (climb < -1) return speed < 35 ? 'APPROACH' : 'DESCENT'
    return 'CRUISE'
  }
  const events: AnalysisEvent[] = []
  let phase = phaseAt(firstSpeed)
  let start = firstSpeed.timestamp
  speeds.slice(1).forEach((sample, index) => {
    const nextPhase = phaseAt(sample)
    if (nextPhase !== phase || index === speeds.length - 2) {
      events.push({ id: `flight-${phase}-${start}`, type: phase, startTime: start, endTime: sample.timestamp, metrics: {}, context: comparableContext(context, phase, start, sample.quality, (sample.timestamp - start) / 1_000) })
      phase = nextPhase
      start = sample.timestamp
    }
  })
  return events
}

function comparableContext(context: AnalyzerContext, type: string, timestamp: number, quality: number, duration?: number): NonNullable<AnalysisEvent['context']> {
  const speed = nearestNumericValue(context, 'speed', timestamp)
  const altitude = nearestNumericValue(context, 'altitude', timestamp)
  return {
    type,
    ...(speed === undefined ? {} : { speed }),
    ...(duration === undefined ? {} : { duration }),
    ...(altitude === undefined ? {} : { altitude }),
    quality,
  }
}

function nearestNumericValue(context: AnalyzerContext, channel: MetricChannel, timestamp: number): number | undefined {
  const closest = context.series(channel)?.samples.reduce<SensorSample | undefined>((selected, sample) => {
    if (typeof sample.value !== 'number') return selected
    return selected === undefined || Math.abs(sample.timestamp - timestamp) < Math.abs(selected.timestamp - timestamp) ? sample : selected
  }, undefined)
  return typeof closest?.value === 'number' ? closest.value : undefined
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
  if (dataset.stage !== 'DERIVED') throw new Error('L’analyse exige un jeu de données DERIVED.')
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
    scoresReference: `analysis/${inputFingerprint}/scores.json`,
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
