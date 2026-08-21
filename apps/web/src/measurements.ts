export interface DisplayMeasurement {
  value: number
  unit: string
}

export function toDisplayMeasurement(channelOrMetricId: string, value: number, unit: string): DisplayMeasurement {
  if ((channelOrMetricId === 'speed' || channelOrMetricId.startsWith('speed.')) && unit === 'm/s') {
    return { value: value * 3.6, unit: 'km/h' }
  }
  return { value, unit }
}

export function toDisplaySeries(channelOrMetricId: string, values: readonly number[], unit: string): { values: number[]; unit: string } {
  const first = toDisplayMeasurement(channelOrMetricId, 1, unit)
  if (first.unit === unit) return { values: [...values], unit }
  return { values: values.map((value) => toDisplayMeasurement(channelOrMetricId, value, unit).value), unit: first.unit }
}
