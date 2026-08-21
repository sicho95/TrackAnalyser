import { describe, expect, it } from 'vitest'
import { calibrateDevice, type CalibrationObservation } from './calibration'

describe('calibration automatique', () => {
  it('reconstruit un repère orthonormé et une qualité explicable', () => {
    const stationary: CalibrationObservation[] = Array.from({ length: 40 }, (_, index) => ({
      timestamp: index * 10,
      acceleration: { x: 0.1, y: -0.05, z: 9.85665 },
      speedMps: 0,
    }))
    const moving: CalibrationObservation[] = Array.from({ length: 15 }, (_, index) => ({
      timestamp: 1_000 + index * 100,
      acceleration: { x: 0.1, y: -0.05, z: 9.85665 },
      speedMps: 5,
      longitudinalHint: { x: 1, y: 0, z: 0 },
    }))
    const result = calibrateDevice('phone', [...stationary, ...moving], undefined, '2026-08-21T10:00:00.000Z')
    expect(result.quality).toBeGreaterThan(0.8)
    expect(result.matrix).toHaveLength(9)
    expect(Math.hypot(...result.biases)).toBeLessThan(0.1)
  })

  it('refuse de prétendre calibrer sans phase immobile', () => {
    expect(() => calibrateDevice('phone', [])).toThrow(/Immobilité insuffisante/)
  })
})
