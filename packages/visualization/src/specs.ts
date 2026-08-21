import type { MetricChannel, VisualizationSpec } from '@track-analyser/domain'

const dynamicPositive = { mode: 'DYNAMIC_SHARED', includeZero: true, symmetricAroundZero: false } as const
const dynamicSigned = { mode: 'DYNAMIC_SHARED', includeZero: true, symmetricAroundZero: true } as const

export const VISUALIZATION_SPECS: Readonly<Record<string, VisualizationSpec>> = {
  speed: {
    metricId: 'speed',
    semanticType: 'rate-positive',
    preferredLiveView: 'SUMMARY_CARD',
    preferredSessionView: 'TIME_SERIES',
    preferredComparisonView: 'DISTRIBUTION',
    unitPolicy: 'speed',
    scalePolicy: dynamicPositive,
  },
  altitude: {
    metricId: 'altitude',
    semanticType: 'profile',
    preferredLiveView: 'SUMMARY_CARD',
    preferredSessionView: 'PROFILE',
    preferredComparisonView: 'TIME_SERIES',
    unitPolicy: 'altitude',
    scalePolicy: { mode: 'DYNAMIC_SHARED', includeZero: false, symmetricAroundZero: false },
  },
  heartRate: {
    metricId: 'heartRate',
    semanticType: 'bounded-positive',
    preferredLiveView: 'GAUGE',
    preferredSessionView: 'TIME_SERIES',
    preferredComparisonView: 'DISTRIBUTION',
    unitPolicy: 'heart-rate',
    scalePolicy: { mode: 'PHYSICAL', minimum: 30, maximum: 230, includeZero: false, symmetricAroundZero: false },
  },
  cadence: {
    metricId: 'cadence',
    semanticType: 'rate-positive',
    preferredLiveView: 'SUMMARY_CARD',
    preferredSessionView: 'HISTOGRAM',
    preferredComparisonView: 'DISTRIBUTION',
    unitPolicy: 'cadence',
    scalePolicy: dynamicPositive,
  },
  longitudinalAcceleration: {
    metricId: 'longitudinalAcceleration',
    semanticType: 'signed-zero-centered',
    preferredLiveView: 'DIVERGING_GAUGE',
    preferredSessionView: 'TIME_SERIES',
    preferredComparisonView: 'DISTRIBUTION',
    unitPolicy: 'acceleration',
    scalePolicy: { mode: 'PHYSICAL', minimum: -10, maximum: 10, includeZero: true, symmetricAroundZero: true },
  },
  lateralAcceleration: {
    metricId: 'lateralAcceleration',
    semanticType: 'signed-zero-centered',
    preferredLiveView: 'DIVERGING_GAUGE',
    preferredSessionView: 'TIME_SERIES',
    preferredComparisonView: 'DISTRIBUTION',
    unitPolicy: 'acceleration',
    scalePolicy: { mode: 'PHYSICAL', minimum: -10, maximum: 10, includeZero: true, symmetricAroundZero: true },
  },
  roll: {
    metricId: 'roll',
    semanticType: 'angle-signed',
    preferredLiveView: 'DIVERGING_GAUGE',
    preferredSessionView: 'TIME_SERIES',
    preferredComparisonView: 'HISTOGRAM',
    unitPolicy: 'angle',
    scalePolicy: { mode: 'PHYSICAL', minimum: -Math.PI / 2, maximum: Math.PI / 2, includeZero: true, symmetricAroundZero: true },
  },
  pitch: {
    metricId: 'pitch',
    semanticType: 'angle-signed',
    preferredLiveView: 'DIVERGING_GAUGE',
    preferredSessionView: 'TIME_SERIES',
    preferredComparisonView: 'HISTOGRAM',
    unitPolicy: 'angle',
    scalePolicy: dynamicSigned,
  },
  verticalSpeed: {
    metricId: 'verticalSpeed',
    semanticType: 'signed-zero-centered',
    preferredLiveView: 'DIVERGING_GAUGE',
    preferredSessionView: 'TIME_SERIES',
    preferredComparisonView: 'DISTRIBUTION',
    unitPolicy: 'vertical-speed',
    scalePolicy: dynamicSigned,
  },
  power: {
    metricId: 'power',
    semanticType: 'positive',
    preferredLiveView: 'GAUGE',
    preferredSessionView: 'TIME_SERIES',
    preferredComparisonView: 'DISTRIBUTION',
    unitPolicy: 'power',
    scalePolicy: dynamicPositive,
  },
}

export function visualizationSpecFor(channel: MetricChannel): VisualizationSpec {
  return (
    VISUALIZATION_SPECS[channel] ?? {
      metricId: channel,
      semanticType: 'generic',
      preferredLiveView: 'SUMMARY_CARD',
      preferredSessionView: 'TIME_SERIES',
      preferredComparisonView: 'COMPARISON_BAR',
      unitPolicy: 'source',
      scalePolicy: { mode: 'DYNAMIC_SHARED', includeZero: false, symmetricAroundZero: false },
    }
  )
}
