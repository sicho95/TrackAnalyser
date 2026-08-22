import { finiteExtent, type ComparisonResult, type ScalePolicy } from '@track-analyser/domain'
import type { ReactNode } from 'react'
import { visualizationFr } from './i18n'

interface ChartProps {
  values: readonly number[]
  width?: number
  height?: number
  label: string
  scalePolicy?: ScalePolicy
  color?: string
}

function finite(values: readonly number[]): number[] {
  return values.filter(Number.isFinite)
}

function extent(values: readonly number[], policy?: ScalePolicy): [number, number] {
  const valid = finite(values)
  const [observedMinimum, observedMaximum] = finiteExtent(valid) ?? [0, 1]
  const rawMinimum = policy?.minimum ?? Math.min(observedMinimum, 0)
  const rawMaximum = policy?.maximum ?? Math.max(observedMaximum, 1)
  if (policy?.symmetricAroundZero === true) {
    const bound = Math.max(Math.abs(rawMinimum), Math.abs(rawMaximum), 1e-9)
    return [-bound, bound]
  }
  const minimum = policy?.includeZero === true ? Math.min(0, rawMinimum) : rawMinimum
  const maximum = policy?.includeZero === true ? Math.max(0, rawMaximum) : rawMaximum
  return minimum === maximum ? [minimum - 1, maximum + 1] : [minimum, maximum]
}

export function Sparkline({ values, width = 160, height = 48, label, scalePolicy, color = 'var(--accent)' }: ChartProps): ReactNode {
  const valid = finite(values)
  if (valid.length < 2) return <div className="chart-empty">{visualizationFr.insufficientData}</div>
  const [minimum, maximum] = extent(valid, scalePolicy)
  const points = valid
    .map((value, index) => {
      const x = (index / (valid.length - 1)) * width
      const y = height - ((value - minimum) / (maximum - minimum)) * height
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
  const zeroY = minimum <= 0 && maximum >= 0 ? height - ((0 - minimum) / (maximum - minimum)) * height : undefined
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <title>{label}</title>
      {zeroY === undefined ? null : <line x1="0" x2={width} y1={zeroY} y2={zeroY} className="chart-zero" />}
      <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

interface GaugeProps {
  value: number
  minimum: number
  maximum: number
  label: string
  unit: string
  signed?: boolean
}

export function Gauge({ value, minimum, maximum, label, unit, signed = false }: GaugeProps): ReactNode {
  const bounded = Math.max(minimum, Math.min(maximum, value))
  const ratio = (bounded - minimum) / (maximum - minimum)
  const angle = -120 + ratio * 240
  return (
    <div className="gauge" role="img" aria-label={`${label} ${value.toFixed(1)} ${unit}, ${visualizationFr.range} ${minimum} à ${maximum}`}>
      <svg viewBox="0 0 200 124" aria-hidden="true">
        <path d="M 26 110 A 82 82 0 1 1 174 110" pathLength="1" className="gauge-track" />
        <path d="M 26 110 A 82 82 0 1 1 174 110" pathLength="1" className="gauge-value" strokeDasharray={`${ratio} 1`} />
        {signed ? <line x1="100" y1="18" x2="100" y2="28" className="gauge-zero" /> : null}
        <line x1="100" y1="104" x2="100" y2="40" className="gauge-needle" transform={`rotate(${angle} 100 104)`} />
      </svg>
      <div className="gauge-reading"><strong>{value.toFixed(1)}</strong><span>{unit}</span></div>
      <div className="gauge-label">{label}</div>
    </div>
  )
}

export function Histogram({ values, width = 320, height = 120, label, color = 'var(--accent)' }: ChartProps): ReactNode {
  const valid = finite(values)
  if (valid.length === 0) return <div className="chart-empty">{visualizationFr.insufficientData}</div>
  const [minimum, maximum] = extent(valid)
  const bucketCount = Math.min(16, Math.max(5, Math.ceil(Math.sqrt(valid.length))))
  const buckets = Array.from({ length: bucketCount }, () => 0)
  valid.forEach((value) => {
    const index = Math.min(bucketCount - 1, Math.floor(((value - minimum) / (maximum - minimum)) * bucketCount))
    buckets[index] = (buckets[index] ?? 0) + 1
  })
  const maximumCount = Math.max(...buckets)
  const gap = 2
  const barWidth = width / bucketCount
  return (
    <svg className="histogram" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <title>{label}</title>
      {buckets.map((count, index) => {
        const barHeight = (count / maximumCount) * height
        return <rect key={index} x={index * barWidth + gap} y={height - barHeight} width={Math.max(1, barWidth - gap * 2)} height={barHeight} fill={color} rx="2" />
      })}
    </svg>
  )
}

export function ComparisonBars({ comparison }: { comparison: ComparisonResult }): ReactNode {
  const range = comparison.commonMaximum - comparison.commonMinimum
  return (
    <div className="comparison-bars" role="img" aria-label={`${visualizationFr.comparison} ${comparison.metricId}, ${visualizationFr.commonScale}`}>
      {comparison.series.map((series) => {
        const value = finite(series.values).reduce((sum, item) => sum + item, 0) / Math.max(1, finite(series.values).length)
        const width = ((value - comparison.commonMinimum) / range) * 100
        return (
          <div className="comparison-row" key={series.id}>
            <div className="comparison-label"><span>{series.label}</span><strong>{value.toFixed(2)} {comparison.unit}</strong></div>
            <div className="comparison-track"><span style={{ width: `${Math.max(0, Math.min(100, width))}%` }} /></div>
            <small>{series.sampleCount} {visualizationFr.samples} · {visualizationFr.confidence} {Math.round(series.confidence * 100)} %</small>
          </div>
        )
      })}
    </div>
  )
}
