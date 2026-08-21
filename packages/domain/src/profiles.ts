import { ACTIVITY_TYPES, type ActivityType, type AnalysisProfile } from './types'

const COMMON_PARAMETERS: Readonly<Record<string, number>> = {
  movingSpeedThresholdMps: 0.6,
  pauseMinimumDurationSeconds: 8,
  harshAccelerationThresholdMps2: 2.5,
  harshBrakingThresholdMps2: -3,
  lateralEventThresholdMps2: 2.2,
  vibrationImpactThresholdMps2: 8,
  minimumGnssQuality: 0.45,
  aggregationWindowSeconds: 5,
  climbThresholdMps: 0.3,
  sinkThresholdMps: -0.5,
  thermalMinimumDurationSeconds: 20,
  turnRateThresholdRadS: 0.08,
}

const ACTIVITY_OVERRIDES: Readonly<Record<ActivityType, Readonly<Record<string, number>>>> = {
  GENERIC: {},
  CAR: { movingSpeedThresholdMps: 1.5, lateralEventThresholdMps2: 2.8 },
  MOTORCYCLE: { movingSpeedThresholdMps: 1.5, lateralEventThresholdMps2: 2.5 },
  BIKE: { movingSpeedThresholdMps: 0.8, harshBrakingThresholdMps2: -2.2 },
  BOAT: { movingSpeedThresholdMps: 0.4, vibrationImpactThresholdMps2: 6 },
  AIRCRAFT: { movingSpeedThresholdMps: 5, climbThresholdMps: 0.8, sinkThresholdMps: -0.8 },
  PARAGLIDING: { movingSpeedThresholdMps: 2, climbThresholdMps: 0.3, sinkThresholdMps: -0.5 },
  HIKING: { movingSpeedThresholdMps: 0.35, pauseMinimumDurationSeconds: 15 },
  TRAIL_RUNNING: { movingSpeedThresholdMps: 0.7, pauseMinimumDurationSeconds: 8 },
  RUNNING: { movingSpeedThresholdMps: 0.8, pauseMinimumDurationSeconds: 6 },
}

export function createDefaultAnalysisProfile(activityType: ActivityType): AnalysisProfile {
  return {
    id: `default-${activityType.toLowerCase()}-1`,
    activityType,
    version: '1.0.0',
    name: `Profil ${activityType} V1`,
    parameters: { ...COMMON_PARAMETERS, ...ACTIVITY_OVERRIDES[activityType] },
    createdAt: '2026-08-21T00:00:00.000Z',
    notes: [
      'Paramètres initiaux à calibrer sur des acquisitions terrain contrôlées.',
      'Conserver cette version pour garantir la reproductibilité des analyses existantes.',
    ],
  }
}

export const DEFAULT_ANALYSIS_PROFILES = Object.fromEntries(
  ACTIVITY_TYPES.map((activityType) => [activityType, createDefaultAnalysisProfile(activityType)]),
) as Record<ActivityType, AnalysisProfile>

