import { describe, expect, it } from 'vitest'
import { createAnalyticsCore, type AnalyticsWasmModule } from './index'

describe('pont WebAssembly', () => {
  it('transmet les tableaux au cœur exporté', () => {
    const buffer = new ArrayBuffer(1_024)
    const module: AnalyticsWasmModule = {
      HEAPF64: new Float64Array(buffer),
      _malloc: () => 0,
      _free: () => undefined,
      cwrap: (name) => (pointer, length, probability = 0.5) => {
        const values = [...new Float64Array(buffer, pointer, length)]
        if (name === 'ta_mean') return values.reduce((sum, value) => sum + value, 0) / length
        if (name === 'ta_rms') return Math.sqrt(values.reduce((sum, value) => sum + value ** 2, 0) / length)
        return values.toSorted((left, right) => left - right)[Math.round((length - 1) * probability)] ?? Number.NaN
      },
    }
    const core = createAnalyticsCore(module)
    expect(core.mean([1, 2, 3])).toBe(2)
    expect(core.rms([3, 4])).toBeCloseTo(Math.sqrt(12.5))
    expect(core.percentile([1, 2, 3], 0.5)).toBe(2)
  })
})
