import type { AnalysisMetric, ComparisonResult, ComparisonSeries } from './types'

export function compareMetricSeries(metricId: string, series: readonly ComparisonSeries[], includeZero: boolean): ComparisonResult {
  if (series.length < 2) throw new Error('Sélectionner au moins deux séries comparables.')
  const unit = series[0]?.unit ?? ''
  if (series.some((item) => item.unit !== unit)) throw new Error('Les séries comparées doivent utiliser la même unité.')
  const values = series.flatMap((item) => item.values).filter(Number.isFinite)
  if (values.length === 0) throw new Error('Aucune valeur comparable disponible.')
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  const margin = Math.max((maximum - minimum) * 0.05, Math.abs(maximum) * 0.01, 1e-9)
  const firstMean = mean(series[0]?.values ?? [])
  const secondMean = mean(series[1]?.values ?? [])
  const absoluteDifference = secondMean - firstMean
  return {
    metricId,
    unit,
    commonMinimum: includeZero ? Math.min(0, minimum - margin) : minimum - margin,
    commonMaximum: includeZero ? Math.max(0, maximum + margin) : maximum + margin,
    includeZero,
    series: [...series],
    absoluteDifference,
    ...(firstMean === 0 ? {} : { relativeDifference: absoluteDifference / Math.abs(firstMean) }),
  }
}

export function explainAnalysisDifference(original: readonly AnalysisMetric[], current: readonly AnalysisMetric[]): string[] {
  return current.flatMap((metric) => {
    const previous = original.find((candidate) => candidate.id === metric.id)
    if (previous?.status !== 'AVAILABLE' || metric.status !== 'AVAILABLE' || previous.value === undefined || metric.value === undefined) return []
    const difference = metric.value - previous.value
    if (Math.abs(difference) <= Number.EPSILON) return []
    return [`${metric.label} : ${difference > 0 ? '+' : ''}${difference.toFixed(3)} ${metric.unit ?? ''} ; méthode actuelle : ${metric.method}.`]
  })
}

export function normalizedSegment(values: readonly number[], startPercent: number, endPercent: number): number[] {
  if (!Number.isFinite(startPercent) || !Number.isFinite(endPercent) || startPercent < 0 || endPercent > 100 || startPercent >= endPercent) {
    throw new Error('Le segment comparable doit respecter 0 ≤ début < fin ≤ 100.')
  }
  if (values.length === 0) return []
  const start = Math.floor(values.length * startPercent / 100)
  const end = Math.max(start + 1, Math.ceil(values.length * endPercent / 100))
  return values.slice(start, Math.min(values.length, end))
}

export function comparableEventValues(
  events: readonly { type: string; severity?: number; metrics: Readonly<Record<string, number>> }[],
  eventType: string,
  metricId: string,
): number[] {
  return events
    .filter((event) => event.type === eventType)
    .flatMap((event) => {
      const value = event.metrics[metricId] ?? event.severity
      return value === undefined || !Number.isFinite(value) ? [] : [value]
    })
}

function mean(values: readonly number[]): number {
  const finite = values.filter(Number.isFinite)
  return finite.length === 0 ? Number.NaN : finite.reduce((sum, value) => sum + value, 0) / finite.length
}
