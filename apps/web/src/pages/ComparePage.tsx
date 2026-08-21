import { compareMetricSeries } from '@track-analyser/domain'
import { ScreenHeader } from '@track-analyser/ui'
import { ComparisonBars, Sparkline } from '@track-analyser/visualization'
import { GitCompareArrows } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useAppData } from '../context'

export function ComparePage(): ReactNode {
  const { sessions, participants, equipment, analysisRuns, activityGroups, createActivityGroup } = useAppData()
  const [leftId, setLeftId] = useState(sessions[0]?.id ?? '')
  const [rightId, setRightId] = useState(sessions[1]?.id ?? '')
  const [metric, setMetric] = useState('speed')
  const left = sessions.find((session) => session.id === leftId)
  const right = sessions.find((session) => session.id === rightId)
  const leftRun = analysisRuns.find((run) => run.id === left?.latestAnalysisRunId)
  const rightRun = analysisRuns.find((run) => run.id === right?.latestAnalysisRunId)
  const channels = useMemo(() => [...new Set([...Object.keys(leftRun?.result.visualizationSeries ?? {}), ...Object.keys(rightRun?.result.visualizationSeries ?? {})])], [leftRun, rightRun])
  const comparison = leftRun !== undefined && rightRun !== undefined && (leftRun.result.visualizationSeries[metric]?.length ?? 0) > 0 && (rightRun.result.visualizationSeries[metric]?.length ?? 0) > 0 ? compareMetricSeries(metric, [
    { id: leftRun.id, label: labelFor(left, participants, equipment), unit: unitFor(metric), values: leftRun.result.visualizationSeries[metric] ?? [], sampleCount: leftRun.result.visualizationSeries[metric]?.length ?? 0, coverage: leftRun.result.quality.coverage, confidence: leftRun.result.quality.confidence },
    { id: rightRun.id, label: labelFor(right, participants, equipment), unit: unitFor(metric), values: rightRun.result.visualizationSeries[metric] ?? [], sampleCount: rightRun.result.visualizationSeries[metric]?.length ?? 0, coverage: rightRun.result.quality.coverage, confidence: rightRun.result.quality.confidence },
  ], ['speed', 'power', 'cadence', 'heartRate'].includes(metric)) : undefined
  const canGroup = left !== undefined && right?.activityType === left.activityType && left.activityGroupId !== right.activityGroupId

  return <div className="screen"><ScreenHeader eyebrow="Axes et unités communs" title="Comparer" />
    <section className="comparison-picker"><label>Session A<select value={leftId} onChange={(event) => setLeftId(event.target.value)}><option value="">Choisir</option>{sessions.map((session) => <option key={session.id} value={session.id}>{labelFor(session, participants, equipment)}</option>)}</select></label><label>Session B<select value={rightId} onChange={(event) => setRightId(event.target.value)}><option value="">Choisir</option>{sessions.filter((session) => session.id !== leftId).map((session) => <option key={session.id} value={session.id}>{labelFor(session, participants, equipment)}</option>)}</select></label><label>Métrique<select value={metric} onChange={(event) => setMetric(event.target.value)}>{channels.map((channel) => <option key={channel} value={channel}>{channel}</option>)}</select></label></section>
    {canGroup ? <button className="secondary-button" type="button" onClick={() => void createActivityGroup([left.id, right.id], 'Sortie commune')}>Associer à un ActivityGroup sans fusionner</button> : null}
    {left?.activityGroupId !== undefined && left.activityGroupId === right?.activityGroupId ? <p className="inline-message">Même sortie commune : {activityGroups.find((group) => group.id === left.activityGroupId)?.title ?? 'ActivityGroup'}. Les sessions restent distinctes.</p> : null}
    {comparison === undefined ? <section className="empty-state"><GitCompareArrows size={36} /><h2>Deux séries comparables requises</h2><p>Les participants restent distincts, même pour un parcours et un horaire identiques.</p></section> : <section className="comparison-result"><h2>{metric}</h2><ComparisonBars comparison={comparison} /><div className="small-multiples">{comparison.series.map((series) => <div key={series.id}><h3>{series.label}</h3><Sparkline values={series.values} label={series.label} scalePolicy={{ mode: 'DYNAMIC_SHARED', minimum: comparison.commonMinimum, maximum: comparison.commonMaximum, includeZero: comparison.includeZero, symmetricAroundZero: false }} /></div>)}</div><p className="difference">Écart absolu : {comparison.absoluteDifference?.toFixed(2)} {comparison.unit} · écart relatif : {comparison.relativeDifference === undefined ? 'non défini' : `${(comparison.relativeDifference * 100).toFixed(1)} %`}</p></section>}
  </div>
}

function labelFor(session: Parameters<typeof labelForInternal>[0], participants: Parameters<typeof labelForInternal>[1], equipment: Parameters<typeof labelForInternal>[2]): string { return labelForInternal(session, participants, equipment) }
function labelForInternal(session: ReturnType<typeof useAppData>['sessions'][number] | undefined, participants: ReturnType<typeof useAppData>['participants'], equipment: ReturnType<typeof useAppData>['equipment']): string { const participant = participants.find((item) => item.id === session?.participantId)?.name ?? '?'; const item = equipment.find((candidate) => candidate.id === session?.equipmentId)?.name; return `${participant} · ${session?.activityType ?? ''}${item === undefined ? '' : ` · ${item}`}` }
function unitFor(metric: string): string { return metric === 'speed' ? 'm/s' : metric === 'heartRate' ? 'bpm' : metric === 'cadence' ? 'rpm' : metric === 'power' ? 'W' : metric === 'altitude' ? 'm' : '' }
