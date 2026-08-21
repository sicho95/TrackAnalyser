import { explainAnalysisDifference, type AnalysisMetric } from '@track-analyser/domain'
import { ScreenHeader, StatusPill } from '@track-analyser/ui'
import { Histogram, Sparkline, visualizationSpecFor } from '@track-analyser/visualization'
import { ArrowLeft, Database, Download, GitCompareArrows, RefreshCw, Route, Trash2 } from 'lucide-react'
import { lazy, Suspense, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DeleteSessionDialog } from '../components/DeleteSessionDialog'
import { useAppData } from '../context'
import { messages } from '../i18n'
import { toDisplayMeasurement, toDisplaySeries } from '../measurements'
import { exportSession } from '../session-export'

const MapView = lazy(async () => ({ default: (await import('../components/MapView')).MapView }))

function MetricPanel({ metric, values }: { metric: AnalysisMetric; values: readonly number[] }): ReactNode {
  if (metric.status === 'UNAVAILABLE') return null
  const channel = metric.id.split('.')[0] ?? metric.id
  const spec = visualizationSpecFor(channel as Parameters<typeof visualizationSpecFor>[0])
  const displayedMetric = toDisplayMeasurement(metric.id, metric.value ?? 0, metric.unit ?? '')
  const displayedSeries = toDisplaySeries(channel, values, metric.unit ?? '')
  return <article className="metric-panel"><div className="metric-heading"><span>{metric.label}</span><strong>{displayedMetric.value.toFixed(2)} <small>{displayedMetric.unit}</small></strong></div>{displayedSeries.values.length > 2 ? spec.preferredSessionView === 'HISTOGRAM' || spec.preferredSessionView === 'DISTRIBUTION' ? <Histogram values={displayedSeries.values} label={`${messages.detail.distribution} ${metric.label}`} /> : <Sparkline values={displayedSeries.values} label={`${messages.detail.evolution} ${metric.label}`} scalePolicy={spec.scalePolicy} /> : null}<footer>{metric.sampleCount} {messages.common.samples} · {messages.common.confidence} {Math.round(metric.confidence * 100)} %</footer></article>
}

export function SessionDetailPage(): ReactNode {
  const { id } = useParams()
  const { sessions, participants, equipment, analysisRuns, analysisProfiles, segments, settings, reanalyzeSession, createManualSegment, deleteSession } = useAppData()
  const navigate = useNavigate()
  const [technical, setTechnical] = useState(false)
  const [profileId, setProfileId] = useState('')
  const [reanalysisMessage, setReanalysisMessage] = useState('')
  const [reanalyzing, setReanalyzing] = useState(false)
  const [segmentName, setSegmentName] = useState('Segment personnel')
  const [segmentStart, setSegmentStart] = useState(0)
  const [segmentEnd, setSegmentEnd] = useState(100)
  const [segmentMessage, setSegmentMessage] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const session = sessions.find((item) => item.id === id)
  if (session === undefined) return <div className="screen">{messages.detail.missing}</div>
  const runs = analysisRuns.filter((run) => run.sessionId === session.id).toSorted((left, right) => left.createdAt.localeCompare(right.createdAt))
  const current = runs.find((run) => run.id === session.latestAnalysisRunId) ?? runs.at(-1)
  const original = runs.find((run) => run.id === session.originalAnalysisRunId) ?? runs[0]
  const participant = participants.find((item) => item.id === session.participantId)
  const itemEquipment = equipment.find((item) => item.id === session.equipmentId)
  const series = current?.result.visualizationSeries ?? {}
  const profiles = analysisProfiles.filter((profile) => profile.activityType === session.activityType)
  const selectedProfileId = profiles.some((profile) => profile.id === profileId) ? profileId : profiles.at(-1)?.id ?? ''
  const route = current?.result.routePreview ?? []
  const sessionSegments = segments.filter((segment) => segment.sessionId === session.id)

  const runExport = async (kind: 'JSON' | 'CSV' | 'TATRIP'): Promise<void> => exportSession(session, runs, sessionSegments, kind)
  const reanalyze = async (): Promise<void> => {
    if (selectedProfileId.length === 0) return
    setReanalyzing(true)
    setReanalysisMessage('Relecture des RAW immuables…')
    try {
      const run = await reanalyzeSession(session.id, selectedProfileId)
      setReanalysisMessage(`Analyse ${run.analysisVersion} avec profil ${run.analysisProfileVersion} disponible. L’analyse originale reste conservée.`)
    } catch (error) {
      setReanalysisMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setReanalyzing(false)
    }
  }
  const saveSegment = async (): Promise<void> => {
    setSegmentMessage(messages.detail.segmentSaving)
    try {
      const segment = await createManualSegment(session.id, segmentName, segmentStart, segmentEnd)
      setSegmentMessage(`${segment.name} ${messages.detail.segmentSaved}`)
    } catch (error) {
      setSegmentMessage(error instanceof Error ? error.message : String(error))
    }
  }

  return <div className="screen detail-screen"><ScreenHeader eyebrow={`${participant?.name ?? ''} · ${session.activityType}`} title={session.title ?? new Date(session.startTime).toLocaleDateString('fr-FR')} action={<Link to="/sessions" className="icon-button"><ArrowLeft size={20} /></Link>} />
    <div className="detail-meta"><StatusPill state="good">{session.status}</StatusPill><span>{itemEquipment?.name ?? messages.detail.noEquipment}</span><span>{session.sourceIds.length} {messages.detail.sources}</span></div>
    {route.length === 0 ? null : <Suspense fallback={<div className="map-placeholder">{messages.detail.loadingMap}</div>}><MapView route={route} provider={settings.mapProvider} /></Suspense>}
    {current === undefined ? <p>{messages.detail.noAnalysis}</p> : <><section className="quality-strip"><div><strong>{Math.round(current.result.quality.confidence * 100)} %</strong><span>{messages.common.confidence}</span></div><div><strong>{Math.round(current.result.quality.coverage * 100)} %</strong><span>{messages.common.coverage}</span></div><div><strong>{current.analysisVersion}</strong><span>{messages.common.engine}</span></div></section><div className="metric-grid">{current.result.metrics.filter((metric) => metric.status === 'AVAILABLE').map((metric) => <MetricPanel key={metric.id} metric={metric} values={series[metric.id.split('.')[0] ?? ''] ?? []} />)}</div>{current.result.events.length === 0 ? null : <section className="events-panel"><h2>{messages.detail.events}</h2>{current.result.events.map((event) => <div key={event.id}><strong>{event.type}</strong><span>{new Date(event.startTime).toLocaleTimeString('fr-FR')}</span></div>)}</section>}</>}
    {runs.length > 1 && original !== undefined && current !== undefined ? <section className="version-panel"><GitCompareArrows size={22} /><div><h2>{messages.detail.history}</h2><p>{messages.detail.original} {original.analysisVersion} · {messages.detail.current} {current.analysisVersion}</p>{explainAnalysisDifference(original.result.metrics, current.result.metrics).map((line) => <p key={line}>{line}</p>)}</div></section> : null}
    <section className="segment-panel"><div><Route size={22} /><div><h2>{messages.detail.segmentsTitle}</h2><p>{messages.detail.segmentsBody}</p></div></div><div className="segment-list">{sessionSegments.length === 0 ? <p>{messages.detail.noSegment}</p> : sessionSegments.map((segment) => <div key={segment.id}><strong>{segment.name}</strong><span>{segment.manual ? messages.detail.manualSegment : messages.detail.automaticSegment} · {Math.max(0, (segment.endTime - segment.startTime) / 1_000).toFixed(1)} s{segment.routeFingerprint === undefined ? '' : ` · GPS ${segment.routeFingerprint.slice(0, 8)}`}</span></div>)}</div><div className="segment-form"><label>{messages.detail.segmentName}<input value={segmentName} onChange={(event) => setSegmentName(event.target.value)} /></label><label>{messages.detail.segmentStart}<input type="number" min="0" max="99" value={segmentStart} onChange={(event) => setSegmentStart(Number(event.target.value))} /> %</label><label>{messages.detail.segmentEnd}<input type="number" min="1" max="100" value={segmentEnd} onChange={(event) => setSegmentEnd(Number(event.target.value))} /> %</label><button className="secondary-button" type="button" onClick={() => void saveSegment()}><Route size={18} />{messages.detail.saveSegment}</button></div>{segmentMessage.length === 0 ? null : <p className="inline-message">{segmentMessage}</p>}</section>
    <section className="reanalysis-panel"><div><RefreshCw size={22} /><div><h2>{messages.detail.rawTitle}</h2><p>{messages.detail.rawBody}</p></div></div><label>{messages.detail.profile}<select value={selectedProfileId} onChange={(event) => setProfileId(event.target.value)}>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · {profile.version}</option>)}</select></label><button className="secondary-button" type="button" disabled={reanalyzing || selectedProfileId.length === 0} onClick={() => void reanalyze()}><RefreshCw size={18} />{reanalyzing ? messages.detail.running : messages.detail.run}</button>{reanalysisMessage.length === 0 ? null : <p className="inline-message">{reanalysisMessage}</p>}</section>
    <section className="export-actions"><button type="button" onClick={() => void runExport('JSON')}><Download size={18} />JSON</button><button type="button" onClick={() => void runExport('CSV')}><Download size={18} />CSV</button><button type="button" onClick={() => void runExport('TATRIP')}><Download size={18} />.tatrip</button></section>
    <button className="delete-session-button" type="button" onClick={() => setDeleteOpen(true)}><Trash2 size={18} />{messages.sessions.deleteSession}</button>
    <button className="technical-toggle" type="button" onClick={() => setTechnical(!technical)}><Database size={18} />{messages.detail.technical}</button>
    {technical ? <section className="technical-panel"><h2>{messages.detail.immutableRaw}</h2>{session.rawDataReferences.map((reference) => <dl key={reference.id}><dt>{messages.detail.source}</dt><dd>{reference.sourceId}</dd><dt>{messages.detail.storage}</dt><dd>{reference.storage} · {reference.chunkCount} chunk(s)</dd><dt>{messages.detail.fingerprint}</dt><dd>{reference.sha256}</dd><dt>{messages.detail.size}</dt><dd>{reference.byteLength} {messages.detail.bytes}</dd></dl>)}<h2>{messages.detail.analysesKept}</h2>{runs.map((run) => <dl key={run.id}><dt>{messages.detail.version}</dt><dd>{run.analysisVersion} / profil {run.analysisProfileVersion}</dd><dt>{messages.detail.input}</dt><dd>{run.inputFingerprint}</dd><dt>{messages.detail.role}</dt><dd>{run.isOriginal ? messages.detail.originalAnalysis : messages.detail.reanalysis}</dd></dl>)}</section> : null}
    <DeleteSessionDialog open={deleteOpen} sessionName={session.title ?? messages.activity[session.activityType]} onCancel={() => setDeleteOpen(false)} onConfirm={async () => { await deleteSession(session.id); void navigate('/sessions', { replace: true }) }} />
  </div>
}
