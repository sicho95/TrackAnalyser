import { describe, expect, it } from 'vitest'
import { toDisplayMeasurement, toDisplaySeries } from './measurements'

describe('unités de présentation', () => {
  it('présente la vitesse en km/h sans modifier les valeurs internes en m/s', () => {
    expect(toDisplayMeasurement('speed.mean', 10, 'm/s')).toEqual({ value: 36, unit: 'km/h' })
    expect(toDisplaySeries('speed', [0, 10], 'm/s')).toEqual({ values: [0, 36], unit: 'km/h' })
  })

  it('conserve le vario en m/s', () => {
    expect(toDisplayMeasurement('verticalSpeed.mean', 2, 'm/s')).toEqual({ value: 2, unit: 'm/s' })
  })
})
