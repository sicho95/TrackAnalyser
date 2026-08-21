import {
  ACTIVITY_TYPES,
  comparableEventValues,
  compareMetricSeries,
  normalizedSegment,
  segmentPercentWindow,
  segmentsAreComparable,
  type ActivityType,
  type AnalysisRun,
  type ComparisonSeries,
  type Session,
} from '@track-analyser/domain'
import { ScreenHeader } from '@track-analyser/ui'
import { ComparisonBars, Sparkline } from '@track-analyser/visualization'
import { GitCompareArrows, Route, TimerReset } from 'lucide-react'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useAppData } from '../context'
import { messages } from '../i18n'

type ComparisonMode = 'SESSION' | 'PARTICIPANT' | 'EQUIPMENT' | 'GROUP' | 'SEGMENT' | 'EVENT' | 'TEMPORAL' | 'ANALYSIS'

const MODE_LABELS: Readonly<Record<ComparisonMode, string>> = messages.compare.modes

export function ComparePage(): ReactNode {
  const { sessions, participants, equipment, analysisRuns, activityGroups, segments, createActivityGroup } = useAppData()
  const [mode, setMode] = useState<ComparisonMode>('SESSION')
  const [leftId, setLeftId] = useState('')
  const [rightId, setRightId] = useState('')
  const [metric, setMetric] = useState('speed')
  const [activityType, setActivityType] = useState<ActivityType>('RUNNING')
  const [participantA, setParticipantA] = useState('')
  const [participantB, setParticipantB] = useState('')
  const [equipmentA, setEquipmentA] = useState('')
  const [equipmentB, setEquipmentB] = useState('')
  const [groupId, setGroupId] = useState('')
  const [temporalParticipantId, setTemporalParticipantId] = useState('')
  const [analysisSessionId, setAnalysisSessionId] = useState('')
  const [eventType, setEventType] = useState('')
  const [leftSegmentId, setLeftSegmentId] = useState('')
  const [rightSegmentId, setRightSegmentId] = useState('')

  const runFor = useCallback((session: Session | undefined): AnalysisRun | undefined => analysisRuns.find((run) => run.id === session?.latestAnalysisRunId), [analysisRuns])
  const effectiveLeftId = sessions.some((session) => session.id === leftId) ? leftId : sessions[0]?.id ?? ''
  const effectiveRightId = sessions.some((session) => session.id === rightId && session.id !== effectiveLeftId) ? rightId : sessions.find((session) => session.id !== effectiveLeftId)?.id ?? ''
  const left = sessions.find((session) => session.id === effectiveLeftId)
  const right = sessions.find((session) => session.id === effectiveRightId)
  const channels = useMemo(() => [...new Set(analysisRuns.flatMap((run) => Object.keys(run.result.visualizationSeries)))].toSorted(), [analysisRuns])
  const eventTypes = useMemo(() => [...new Set(analysisRuns.flatMap((run) => run.result.events.map((event) => event.type)))].toSorted(), [analysisRuns])
  const effectiveEventType = eventTypes.includes(eventType) ? eventType : eventTypes[0] ?? ''
  const effectiveParticipantA = participants.some((item) => item.id === participantA) ? participantA : participants[0]?.id ?? ''
  const effectiveParticipantB = participants.some((item) => item.id === participantB && item.id !== effectiveParticipantA) ? participantB : participants.find((item) => item.id !== effectiveParticipantA)?.id ?? ''
  const effectiveEquipmentA = equipment.some((item) => item.id === equipmentA) ? equipmentA : equipment[0]?.id ?? ''
  const effectiveEquipmentB = equipment.some((item) => item.id === equipmentB && item.id !== effectiveEquipmentA) ? equipmentB : equipment.find((item) => item.id !== effectiveEquipmentA)?.id ?? ''
  const effectiveGroupId = activityGroups.some((group) => group.id === groupId) ? groupId : activityGroups[0]?.id ?? ''
  const effectiveTemporalParticipantId = participants.some((item) => item.id === temporalParticipantId) ? temporalParticipantId : participants[0]?.id ?? ''
  const versionedSessions = sessions.filter((session) => session.analysisRunIds.length > 1)
  const effectiveAnalysisSessionId = versionedSessions.some((session) => session.id === analysisSessionId) ? analysisSessionId : versionedSessions[0]?.id ?? ''
  const effectiveLeftSegmentId = segments.some((segment) => segment.id === leftSegmentId) ? leftSegmentId : segments[0]?.id ?? ''
  const leftSegment = segments.find((segment) => segment.id === effectiveLeftSegmentId)
  const comparableSegments = leftSegment === undefined ? [] : segments.filter((segment) => segmentsAreComparable(leftSegment, segment))
  const effectiveRightSegmentId = comparableSegments.some((segment) => segment.id === rightSegmentId) ? rightSegmentId : comparableSegments[0]?.id ?? ''
  const rightSegment = comparableSegments.find((segment) => segment.id === effectiveRightSegmentId)

  const series = useMemo(() => {
    const fromSession = (session: Session, label: string, values?: readonly number[]): ComparisonSeries | undefined => {
      const run = runFor(session)
      const selected = values ?? run?.result.visualizationSeries[metric] ?? []
      if (run === undefined || selected.length === 0) return undefined
      return { id: `${session.id}-${metric}-${label}`, label, unit: unitFor(metric), values: displayValues(metric, selected), sampleCount: selected.length, coverage: run.result.quality.coverage, confidence: run.result.quality.confidence }
    }
    const aggregate = (id: string, label: string, selectedSessions: readonly Session[]): ComparisonSeries | undefined => {
      const runs = selectedSessions.flatMap((session) => { const run = runFor(session); return run === undefined ? [] : [run] })
      const values = runs.flatMap((run) => run.result.visualizationSeries[metric] ?? [])
      if (values.length === 0) return undefined
      return { id, label, unit: unitFor(metric), values: displayValues(metric, values), sampleCount: values.length, coverage: average(runs.map((run) => run.result.quality.coverage)), confidence: average(runs.map((run) => run.result.quality.confidence)) }
    }
    if (mode === 'SESSION') return compact([
      left === undefined ? undefined : fromSession(left, sessionLabel(left, participants, equipment)),
      right === undefined ? undefined : fromSession(right, sessionLabel(right, participants, equipment)),
    ])
    if (mode === 'SEGMENT') return compact([leftSegment, rightSegment].map((segment) => {
      if (segment === undefined) return undefined
      const session = sessions.find((candidate) => candidate.id === segment.sessionId)
      if (session === undefined) return undefined
      const values = runFor(session)?.result.visualizationSeries[metric] ?? []
      try {
        const [start, end] = segmentPercentWindow(session, segment)
        return fromSession(session, `${segment.name} · ${sessionLabel(session, participants, equipment)}`, normalizedSegment(values, start, end))
      } catch {
        return undefined
      }
    }))
    if (mode === 'EVENT') return compact([left, right].map((session) => {
      if (session === undefined) return undefined
      const run = runFor(session)
      const referenceContext = runFor(left)?.result.events.find((event) => event.type === effectiveEventType)?.context
      return fromSession(session, sessionLabel(session, participants, equipment), comparableEventValues(run?.result.events ?? [], effectiveEventType, metric, session.id === left?.id ? undefined : referenceContext))
    }))
    if (mode === 'PARTICIPANT') return compact([
      aggregate(`participant-${effectiveParticipantA}`, participants.find((item) => item.id === effectiveParticipantA)?.name ?? 'Participant A', sessions.filter((session) => session.participantId === effectiveParticipantA && session.activityType === activityType)),
      aggregate(`participant-${effectiveParticipantB}`, participants.find((item) => item.id === effectiveParticipantB)?.name ?? 'Participant B', sessions.filter((session) => session.participantId === effectiveParticipantB && session.activityType === activityType)),
    ])
    if (mode === 'EQUIPMENT') return compact([
      aggregate(`equipment-${effectiveEquipmentA}`, equipment.find((item) => item.id === effectiveEquipmentA)?.name ?? 'Équipement A', sessions.filter((session) => session.equipmentId === effectiveEquipmentA && session.activityType === activityType)),
      aggregate(`equipment-${effectiveEquipmentB}`, equipment.find((item) => item.id === effectiveEquipmentB)?.name ?? 'Équipement B', sessions.filter((session) => session.equipmentId === effectiveEquipmentB && session.activityType === activityType)),
    ])
    if (mode === 'GROUP') {
      const group = activityGroups.find((candidate) => candidate.id === effectiveGroupId)
      return compact((group?.sessionIds ?? []).map((id) => {
        const session = sessions.find((candidate) => candidate.id === id)
        return session === undefined ? undefined : fromSession(session, sessionLabel(session, participants, equipment))
      }))
    }
    if (mode === 'ANALYSIS') {
      const session = sessions.find((candidate) => candidate.id === effectiveAnalysisSessionId)
      return compact(analysisRuns.filter((run) => run.sessionId === session?.id).map((run) => {
        const values = run.result.visualizationSeries[metric] ?? []
        return values.length === 0 ? undefined : { id: run.id, label: `${run.analysisVersion} · profil ${run.analysisProfileVersion}`, unit: unitFor(metric), values: displayValues(metric, values), sampleCount: values.length, coverage: run.result.quality.coverage, confidence: run.result.quality.confidence }
      }))
    }
    return []
  }, [activityGroups, activityType, analysisRuns, effectiveAnalysisSessionId, effectiveEquipmentA, effectiveEquipmentB, effectiveEventType, effectiveGroupId, effectiveParticipantA, effectiveParticipantB, equipment, left, leftSegment, metric, mode, participants, right, rightSegment, runFor, sessions])

  const comparison = useMemo(() => {
    if (series.length < 2) return undefined
    try { return compareMetricSeries(metric, series, ['speed', 'power', 'cadence', 'heartRate'].includes(metric)) } catch { return undefined }
  }, [metric, series])

  const temporal = useMemo(() => sessions
    .filter((session) => session.participantId === effectiveTemporalParticipantId && session.activityType === activityType)
    .toSorted((a, b) => a.startTime.localeCompare(b.startTime))
    .flatMap((session) => {
      const run = runFor(session)
      const values = run?.result.visualizationSeries[metric] ?? []
      return values.length === 0 || run === undefined ? [] : [{ session, value: average(displayValues(metric, values)), confidence: run.result.quality.confidence, sampleCount: values.length }]
    }), [activityType, effectiveTemporalParticipantId, metric, runFor, sessions])

  const canGroup = left !== undefined && right?.activityType === left.activityType && left.activityGroupId !== right.activityGroupId

  return <div className="screen"><ScreenHeader eyebrow={messages.compare.eyebrow} title={messages.compare.title} />
    <section className="comparison-mode"><label>{messages.compare.type}<select value={mode} onChange={(event) => setMode(event.target.value as ComparisonMode)}>{Object.entries(MODE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></section>
    {['SESSION', 'EVENT'].includes(mode) ? <SessionPickers sessions={sessions} leftId={effectiveLeftId} rightId={effectiveRightId} onLeft={setLeftId} onRight={setRightId} participants={participants} equipment={equipment} /> : null}
    {['PARTICIPANT', 'EQUIPMENT', 'TEMPORAL'].includes(mode) ? <label>{messages.compare.activity}<select value={activityType} onChange={(event) => setActivityType(event.target.value as ActivityType)}>{ACTIVITY_TYPES.map((type) => <option key={type}>{messages.activity[type]}</option>)}</select></label> : null}
    {mode === 'PARTICIPANT' ? <div className="comparison-picker"><EntityPicker label={messages.compare.participantA} value={effectiveParticipantA} onChange={setParticipantA} options={participants.map((item) => ({ id: item.id, label: item.name }))} /><EntityPicker label={messages.compare.participantB} value={effectiveParticipantB} onChange={setParticipantB} options={participants.filter((item) => item.id !== effectiveParticipantA).map((item) => ({ id: item.id, label: item.name }))} /></div> : null}
    {mode === 'EQUIPMENT' ? <div className="comparison-picker"><EntityPicker label={messages.compare.equipmentA} value={effectiveEquipmentA} onChange={setEquipmentA} options={equipment.map((item) => ({ id: item.id, label: item.name }))} /><EntityPicker label={messages.compare.equipmentB} value={effectiveEquipmentB} onChange={setEquipmentB} options={equipment.filter((item) => item.id !== effectiveEquipmentA).map((item) => ({ id: item.id, label: item.name }))} /></div> : null}
    {mode === 'GROUP' ? <EntityPicker label={messages.compare.group} value={effectiveGroupId} onChange={setGroupId} options={activityGroups.map((group) => ({ id: group.id, label: group.title ?? `${group.activityType} · ${group.sessionIds.length} sessions` }))} /> : null}
    {mode === 'ANALYSIS' ? <EntityPicker label={messages.compare.historySession} value={effectiveAnalysisSessionId} onChange={setAnalysisSessionId} options={versionedSessions.map((session) => ({ id: session.id, label: sessionLabel(session, participants, equipment) }))} /> : null}
    {mode === 'TEMPORAL' ? <EntityPicker label={messages.compare.participant} value={effectiveTemporalParticipantId} onChange={setTemporalParticipantId} options={participants.map((item) => ({ id: item.id, label: item.name }))} /> : null}
    {mode === 'SEGMENT' ? <section className="segment-picker"><Route size={20} /><div className="comparison-picker"><EntityPicker label={messages.compare.segmentA} value={effectiveLeftSegmentId} onChange={setLeftSegmentId} options={segments.map((segment) => ({ id: segment.id, label: segmentLabel(segment, sessions, participants, equipment) }))} /><EntityPicker label={messages.compare.segmentB} value={effectiveRightSegmentId} onChange={setRightSegmentId} options={comparableSegments.map((segment) => ({ id: segment.id, label: segmentLabel(segment, sessions, participants, equipment) }))} /></div><p>{leftSegment === undefined ? messages.compare.segmentEmpty : leftSegment.routeFingerprint === undefined ? messages.compare.segmentContext : messages.compare.segmentGps}</p></section> : null}
    {mode === 'EVENT' ? <EntityPicker label={messages.compare.eventType} value={effectiveEventType} onChange={setEventType} options={eventTypes.map((type) => ({ id: type, label: type }))} /> : null}
    <label>{messages.compare.metric}<select value={metric} onChange={(event) => setMetric(event.target.value)}>{channels.map((channel) => <option key={channel} value={channel}>{channel}</option>)}</select></label>
    {mode === 'SESSION' && canGroup ? <button className="secondary-button" type="button" onClick={() => void createActivityGroup([left.id, right.id], 'Sortie commune')}>{messages.compare.associate}</button> : null}
    {mode === 'TEMPORAL' ? <TemporalResult values={temporal} metric={metric} /> : comparison === undefined ? <section className="empty-state"><GitCompareArrows size={36} /><h2>{messages.compare.requiredTitle}</h2><p>{messages.compare.requiredBody}</p></section> : <ComparisonResultView comparison={comparison} />}
  </div>
}

function SessionPickers({ sessions, leftId, rightId, onLeft, onRight, participants, equipment }: { sessions: Session[]; leftId: string; rightId: string; onLeft(value: string): void; onRight(value: string): void; participants: ReturnType<typeof useAppData>['participants']; equipment: ReturnType<typeof useAppData>['equipment'] }): ReactNode {
  return <div className="comparison-picker"><EntityPicker label={messages.compare.sessionA} value={leftId} onChange={onLeft} options={sessions.map((session) => ({ id: session.id, label: sessionLabel(session, participants, equipment) }))} /><EntityPicker label={messages.compare.sessionB} value={rightId} onChange={onRight} options={sessions.filter((session) => session.id !== leftId).map((session) => ({ id: session.id, label: sessionLabel(session, participants, equipment) }))} /></div>
}

function EntityPicker({ label, value, onChange, options }: { label: string; value: string; onChange(value: string): void; options: { id: string; label: string }[] }): ReactNode {
  const effective = options.some((option) => option.id === value) ? value : options[0]?.id ?? ''
  return <label>{label}<select value={effective} onChange={(event) => onChange(event.target.value)}><option value="">{messages.common.choose}</option>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
}

function ComparisonResultView({ comparison }: { comparison: ReturnType<typeof compareMetricSeries> }): ReactNode {
  return <section className="comparison-result"><h2>{comparison.metricId}</h2><ComparisonBars comparison={comparison} /><div className="small-multiples">{comparison.series.map((item) => <div key={item.id}><h3>{item.label}</h3><Sparkline values={item.values} label={item.label} scalePolicy={{ mode: 'DYNAMIC_SHARED', minimum: comparison.commonMinimum, maximum: comparison.commonMaximum, includeZero: comparison.includeZero, symmetricAroundZero: false }} /></div>)}</div><p className="difference">{messages.compare.absoluteGap} : {comparison.absoluteDifference?.toFixed(2)} {comparison.unit} · {messages.compare.relativeGap} : {comparison.relativeDifference === undefined ? messages.compare.undefined : `${(comparison.relativeDifference * 100).toFixed(1)} %`}</p></section>
}

function TemporalResult({ values, metric }: { values: { session: Session; value: number; confidence: number; sampleCount: number }[]; metric: string }): ReactNode {
  if (values.length < 2) return <section className="empty-state"><TimerReset size={34} /><h2>{messages.compare.insufficientTitle}</h2><p>{messages.compare.insufficientBody}</p></section>
  const numeric = values.map((item) => item.value)
  return <section className="comparison-result"><h2>{messages.compare.temporalEvolution} · {metric}</h2><Sparkline values={numeric} label={`${messages.compare.temporalEvolution} ${metric}`} scalePolicy={{ mode: 'DYNAMIC_SHARED', includeZero: false, symmetricAroundZero: false }} /><div className="timeline-values">{values.map((item, index) => <div key={item.session.id}><time>{new Date(item.session.startTime).toLocaleDateString('fr-FR')}</time><strong>{item.value.toFixed(2)} {unitFor(metric)}</strong><span>{item.sampleCount} {messages.common.samples} · {messages.common.confidence} {Math.round(item.confidence * 100)} %{index === 0 ? '' : ` · Δ ${(item.value - (values[index - 1]?.value ?? item.value)).toFixed(2)}`}</span></div>)}</div></section>
}

function compact<T>(values: readonly (T | undefined)[]): T[] { return values.filter((value): value is T => value !== undefined) }
function average(values: readonly number[]): number { return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length }
function sessionLabel(session: Session, participants: ReturnType<typeof useAppData>['participants'], equipment: ReturnType<typeof useAppData>['equipment']): string { const participant = participants.find((item) => item.id === session.participantId)?.name ?? '?'; const item = equipment.find((candidate) => candidate.id === session.equipmentId)?.name; return `${participant} · ${session.activityType}${item === undefined ? '' : ` · ${item}`}` }
function segmentLabel(segment: ReturnType<typeof useAppData>['segments'][number], sessions: Session[], participants: ReturnType<typeof useAppData>['participants'], equipment: ReturnType<typeof useAppData>['equipment']): string { const session = sessions.find((candidate) => candidate.id === segment.sessionId); return session === undefined ? segment.name : `${segment.name} · ${sessionLabel(session, participants, equipment)}` }
function displayValues(metric: string, values: readonly number[]): number[] { return metric === 'speed' ? values.map((value) => value * 3.6) : [...values] }
function unitFor(metric: string): string { return metric === 'speed' ? 'km/h' : metric === 'heartRate' ? 'bpm' : metric === 'cadence' ? 'rpm' : metric === 'power' ? 'W' : metric === 'altitude' ? 'm' : '' }
