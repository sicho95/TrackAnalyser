import { explainAnalysisDifference, type AnalysisMetric, type ImportResult } from '@track-analyser/domain'
import { parseImportedFile } from '@track-analyser/importers'
import { ScreenHeader, StatusPill } from '@track-analyser/ui'
import { Histogram, Sparkline, visualizationSpecFor } from '@track-analyser/visualization'
import { ArrowLeft, Database, Download, FileUp, GitCompareArrows, RefreshCw, Route, Trash2 } from 'lucide-react'
import { lazy, Suspense, useState, type ChangeEvent, type ReactNode } from 'react'
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
  const { sessions, participants, equipment, analysisRuns, analysisProfiles, segments, settings, reanalyzeSession, importData, deleteSession, updateSettings } = useAppData()
  const navigate = useNavigate()
  const [technical, setTechnical] = useState(false)
  const [profileId, setProfileId] = useState('')
  const [reanalysisMessage, setReanalysisMessage] = useState('')
  const [reanalyzing, setReanalyzing] = useState(false)
  const [importCandidate, setImportCandidate] = useState<ImportResult>()
  const [importMessage, setImportMessage] = useState('')
  const [importing, setImporting] = useState(false)
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
  const sessionSegments = segments.filter((segment) => segment.sessionId === session.id && !segment.manual)

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
  const selectEnrichment = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    if (file === undefined) return
    try {
      const result = parseImportedFile(new Uint8Array(await file.arrayBuffer()), file.name)
      setImportCandidate(result)
      setImportMessage(messages.detail.enrichmentIdentified)
    } catch (error) {
      setImportCandidate(undefined)
      setImportMessage(error instanceof Error ? error.message : String(error))
    }
  }
  const confirmEnrichment = async (): Promise<void> => {
    if (importCandidate === undefined) return
    setImporting(true)
    try {
      await importData(importCandidate, session.participantId, session.id)
      setImportMessage(messages.detail.enrichmentComplete)
      setImportCandidate(undefined)
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setImporting(false)
    }
  }

  return <div className="screen detail-screen"><ScreenHeader eyebrow={`${participant?.name ?? ''} · ${session.activityType}`} title={session.title ?? new Date(session.startTime).toLocaleDateString('fr-FR')} action={<Link to="/sessions" className="icon-button"><ArrowLeft size={20} /></Link>} />
    <div className="detail-meta"><StatusPill state="good">{session.status}</StatusPill><span>{itemEquipment?.name ?? messages.detail.noEquipment}</span><span>{session.sourceIds.length} {messages.detail.sources}</span></div>
    {route.length === 0 ? null : <Suspense fallback={<div className="map-placeholder">{messages.detail.loadingMap}</div>}><MapView route={route} provider={settings.mapProvider} onProviderChange={(mapProvider) => void updateSettings({ ...settings, mapProvider })} /></Suspense>}
    {current === undefined ? <p>{messages.detail.noAnalysis}</p> : <><section className="quality-strip"><div><strong>{Math.round(current.result.quality.confidence * 100)} %</strong><span>{messages.common.confidence}</span></div><div><strong>{Math.round(current.result.quality.coverage * 100)} %</strong><span>{messages.common.coverage}</span></div><div><strong>{current.analysisVersion}</strong><span>{messages.common.engine}</span></div></section><div className="metric-grid">{current.result.metrics.filter((metric) => metric.status === 'AVAILABLE').map((metric) => <MetricPanel key={metric.id} metric={metric} values={series[metric.id.split('.')[0] ?? ''] ?? []} />)}</div>{current.result.events.length === 0 ? null : <section className="events-panel"><h2>{messages.detail.events}</h2>{current.result.events.map((event) => <div key={event.id}><strong>{event.type}</strong><span>{new Date(event.startTime).toLocaleTimeString('fr-FR')}</span></div>)}</section>}</>}
    {runs.length > 1 && original !== undefined && current !== undefined ? <section className="version-panel"><GitCompareArrows size={22} /><div><h2>{messages.detail.history}</h2><p>{messages.detail.original} {original.analysisVersion} · {messages.detail.current} {current.analysisVersion}</p>{explainAnalysisDifference(original.result.metrics, current.result.metrics).map((line) => <p key={line}>{line}</p>)}</div></section> : null}
    <section className="segment-panel"><div><Route size={22} /><div><h2>{messages.detail.segmentsTitle}</h2><p>{messages.detail.segmentsBody}</p></div></div><div className="segment-list">{sessionSegments.length === 0 ? <p>{messages.detail.noSegment}</p> : sessionSegments.map((segment) => <div key={segment.id}><strong>{segment.name}</strong><span>{messages.detail.automaticSegment} · {Math.max(0, (segment.endTime - segment.startTime) / 1_000).toFixed(1)} s · {Math.round((segment.detection?.similarity ?? segment.context?.quality ?? 0) * 100)} % {messages.detail.routeSimilarity} · {segment.detection?.occurrenceCount ?? 2} passages</span></div>)}</div></section>
    <section className="enrichment-panel"><div><FileUp size={22} /><div><h2>{messages.detail.enrichmentTitle}</h2><p>{messages.detail.enrichmentBody}</p></div></div><label className="secondary-button enrichment-file"><FileUp size={18} />{messages.detail.chooseEnrichment}<input type="file" accept=".fit,.gpx,.tcx,.json,.xml,.tatrip" hidden onChange={(event) => void selectEnrichment(event)} /></label>{importCandidate === undefined ? null : <div className="enrichment-candidate"><strong>{importCandidate.identity.fileName}</strong><span>{importCandidate.identity.format} · {importCandidate.samples.length} {messages.common.samples}</span><p>{messages.detail.enrichmentTarget} <strong>{participant?.name ?? session.participantId}</strong> · {session.title ?? new Date(session.startTime).toLocaleString('fr-FR')}</p><button className="primary-button" type="button" disabled={importing} onClick={() => void confirmEnrichment()}>{importing ? messages.detail.enriching : messages.detail.confirmEnrichment}</button></div>}{importMessage.length === 0 ? null : <p className="inline-message">{importMessage}</p>}</section>
    <section className="reanalysis-panel"><div><RefreshCw size={22} /><div><h2>{messages.detail.rawTitle}</h2><p>{messages.detail.rawBody}</p></div></div><label>{messages.detail.profile}<select value={selectedProfileId} onChange={(event) => setProfileId(event.target.value)}>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · {profile.version}</option>)}</select></label><button className="secondary-button" type="button" disabled={reanalyzing || selectedProfileId.length === 0} onClick={() => void reanalyze()}><RefreshCw size={18} />{reanalyzing ? messages.detail.running : messages.detail.run}</button>{reanalysisMessage.length === 0 ? null : <p className="inline-message">{reanalysisMessage}</p>}</section>
    <section className="export-actions"><button type="button" onClick={() => void runExport('JSON')}><Download size={18} />JSON</button><button type="button" onClick={() => void runExport('CSV')}><Download size={18} />CSV</button><button type="button" onClick={() => void runExport('TATRIP')}><Download size={18} />.tatrip</button></section>
    <button className="delete-session-button" type="button" onClick={() => setDeleteOpen(true)}><Trash2 size={18} />{messages.sessions.deleteSession}</button>
    <button className="technical-toggle" type="button" onClick={() => setTechnical(!technical)}><Database size={18} />{messages.detail.technical}</button>
    {technical ? <section className="technical-panel"><h2>{messages.detail.immutableRaw}</h2>{session.rawDataReferences.map((reference) => <dl key={reference.id}><dt>{messages.detail.source}</dt><dd>{reference.sourceId}</dd><dt>{messages.detail.storage}</dt><dd>{reference.storage} · {reference.chunkCount} chunk(s)</dd><dt>{messages.detail.fingerprint}</dt><dd>{reference.sha256}</dd><dt>{messages.detail.size}</dt><dd>{reference.byteLength} {messages.detail.bytes}</dd></dl>)}<h2>{messages.detail.analysesKept}</h2>{runs.map((run) => <dl key={run.id}><dt>{messages.detail.version}</dt><dd>{run.analysisVersion} / profil {run.analysisProfileVersion}</dd><dt>{messages.detail.input}</dt><dd>{run.inputFingerprint}</dd><dt>{messages.detail.role}</dt><dd>{run.isOriginal ? messages.detail.originalAnalysis : messages.detail.reanalysis}</dd></dl>)}</section> : null}
    <DeleteSessionDialog open={deleteOpen} sessionName={session.title ?? messages.activity[session.activityType]} onCancel={() => setDeleteOpen(false)} onConfirm={async () => { await deleteSession(session.id); void navigate('/sessions', { replace: true }) }} />
  </div>
}
