import type { CalibrationSnapshot } from '@track-analyser/domain'

export interface Vector3 {
  x: number
  y: number
  z: number
}

export interface CalibrationObservation {
  timestamp: number
  acceleration: Vector3
  speedMps: number
  longitudinalHint?: Vector3
}

export interface CalibrationParameters {
  stationarySpeedThresholdMps: number
  stationaryAccelerationToleranceMps2: number
  minimumStationarySamples: number
  minimumLongitudinalHints: number
}

export const DEFAULT_CALIBRATION_PARAMETERS: CalibrationParameters = {
  stationarySpeedThresholdMps: 0.35,
  stationaryAccelerationToleranceMps2: 0.45,
  minimumStationarySamples: 30,
  minimumLongitudinalHints: 10,
}

const GRAVITY = 9.80665

function add(left: Vector3, right: Vector3): Vector3 {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z }
}

function scale(vector: Vector3, factor: number): Vector3 {
  return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor }
}

function dot(left: Vector3, right: Vector3): number {
  return left.x * right.x + left.y * right.y + left.z * right.z
}

function cross(left: Vector3, right: Vector3): Vector3 {
  return { x: left.y * right.z - left.z * right.y, y: left.z * right.x - left.x * right.z, z: left.x * right.y - left.y * right.x }
}

function norm(vector: Vector3): number {
  return Math.hypot(vector.x, vector.y, vector.z)
}

function normalize(vector: Vector3): Vector3 {
  const length = norm(vector)
  if (length <= Number.EPSILON) throw new Error('Vecteur de calibration nul.')
  return scale(vector, 1 / length)
}

function mean(vectors: readonly Vector3[]): Vector3 {
  return scale(vectors.reduce(add, { x: 0, y: 0, z: 0 }), 1 / Math.max(1, vectors.length))
}

export function calibrateDevice(
  deviceId: string,
  observations: readonly CalibrationObservation[],
  parameters: CalibrationParameters = DEFAULT_CALIBRATION_PARAMETERS,
  createdAt = new Date().toISOString(),
): CalibrationSnapshot {
  const stationary = observations.filter((observation) =>
    observation.speedMps <= parameters.stationarySpeedThresholdMps &&
    Math.abs(norm(observation.acceleration) - GRAVITY) <= parameters.stationaryAccelerationToleranceMps2,
  )
  if (stationary.length < parameters.minimumStationarySamples) throw new Error('Immobilité insuffisante pour estimer les biais et la verticale.')
  const measuredGravity = mean(stationary.map((observation) => observation.acceleration))
  const vertical = normalize(measuredGravity)
  const biases = add(measuredGravity, scale(vertical, -GRAVITY))
  const hints = observations.flatMap((observation) => observation.longitudinalHint === undefined ? [] : [observation.longitudinalHint])
  if (hints.length < parameters.minimumLongitudinalHints) throw new Error('Phases de déplacement insuffisantes pour déterminer l’axe longitudinal.')
  const rawForward = mean(hints)
  const horizontalForward = add(rawForward, scale(vertical, -dot(rawForward, vertical)))
  const forward = normalize(horizontalForward)
  const lateral = normalize(cross(vertical, forward))
  const correctedForward = normalize(cross(lateral, vertical))
  const stationaryCoverage = Math.min(1, stationary.length / parameters.minimumStationarySamples)
  const hintCoverage = Math.min(1, hints.length / parameters.minimumLongitudinalHints)
  const gravityResidual = Math.abs(norm(measuredGravity) - GRAVITY)
  const residualScore = 1 / (1 + gravityResidual / Math.max(0.01, parameters.stationaryAccelerationToleranceMps2))
  return {
    id: `calibration-${deviceId}-${createdAt}`,
    deviceId,
    createdAt,
    quality: Math.max(0, Math.min(1, stationaryCoverage * 0.35 + hintCoverage * 0.35 + residualScore * 0.3)),
    matrix: [
      correctedForward.x, correctedForward.y, correctedForward.z,
      lateral.x, lateral.y, lateral.z,
      vertical.x, vertical.y, vertical.z,
    ],
    biases: [biases.x, biases.y, biases.z],
    method: 'immobilité pour biais/gravité puis indices GNSS synchronisés pour axe longitudinal',
  }
}

