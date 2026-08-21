export interface AnalyticsWasmModule {
  HEAPF64: Float64Array
  _malloc(size: number): number
  _free(pointer: number): void
  cwrap(name: string, returnType: string, argumentTypes: string[]): (...arguments_: number[]) => number
}

export interface AnalyticsCore {
  mean(values: readonly number[]): number
  rms(values: readonly number[]): number
  percentile(values: readonly number[], probability: number): number
}

export function createAnalyticsCore(module: AnalyticsWasmModule): AnalyticsCore {
  const invoke = (name: string, values: readonly number[], extra?: number): number => {
    const bytes = values.length * Float64Array.BYTES_PER_ELEMENT
    const pointer = module._malloc(bytes)
    try {
      module.HEAPF64.set(values, pointer / Float64Array.BYTES_PER_ELEMENT)
      const wrapped = module.cwrap(name, 'number', extra === undefined ? ['number', 'number'] : ['number', 'number', 'number'])
      return extra === undefined ? wrapped(pointer, values.length) : wrapped(pointer, values.length, extra)
    } finally {
      module._free(pointer)
    }
  }
  return {
    mean: (values) => invoke('ta_mean', values),
    rms: (values) => invoke('ta_rms', values),
    percentile: (values, probability) => invoke('ta_percentile', values, probability),
  }
}

