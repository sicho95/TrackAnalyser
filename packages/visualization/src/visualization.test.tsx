import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { compareMetricSeries } from '@track-analyser/domain'
import { Gauge, Sparkline } from './components'
import { visualizationSpecFor } from './specs'

describe('visualisations fidèles', () => {
  it('centre les métriques signées sur zéro avec une plage physique', () => {
    const specification = visualizationSpecFor('lateralAcceleration')
    expect(specification.scalePolicy).toMatchObject({ minimum: -10, maximum: 10, includeZero: true, symmetricAroundZero: true })
    render(<Gauge value={0.2} minimum={-10} maximum={10} label="Latéral" unit="m/s²" signed />)
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/plage -10 à 10/)
  })

  it('impose la même échelle à deux séries comparées', () => {
    const result = compareMetricSeries('speed', [
      { id: 'a', label: 'A', unit: 'm/s', values: [1, 2], sampleCount: 2, coverage: 1, confidence: 1 },
      { id: 'b', label: 'B', unit: 'm/s', values: [2, 3], sampleCount: 2, coverage: 1, confidence: 1 },
    ], true)
    expect(result.commonMinimum).toBeLessThanOrEqual(0)
    expect(result.commonMaximum).toBeGreaterThan(3)
    render(<Sparkline values={[1, 2, 3]} label="Vitesse" scalePolicy={{ mode: 'DYNAMIC_SHARED', minimum: result.commonMinimum, maximum: result.commonMaximum, includeZero: true, symmetricAroundZero: false }} />)
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Vitesse')
  })
})
