import { explainAnalysisDifference, type AnalysisMetric } from '@track-analyser/domain'
import { createTripArchive, exportAnalysisCsv, exportSummaryJson } from '@track-analyser/exporters'
import { ProgressiveRawStore } from '@track-analyser/storage'
import { ScreenHeader, StatusPill } from '@track-analyser/ui'
import { Histogram, Sparkline, visualizationSpecFor } from '@track-analyser/visualization'
import { ArrowLeft, Database, Download, GitCompareArrows } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { MapView } from '../components/MapView'
import { useAppData } from '../context'

function download(bytes: Uint8Array | string, name: string, type: string): void {
  const blob = new Blob([typeof bytes === 'string' ? bytes : bytes as unknown as BlobPart], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

function MetricPanel({ metric, values }: { metric: AnalysisMetric; values: readonly number[] }): ReactNode {
  if (metric.status === 'UNAVAILABLE') return <article className="metric-panel unavailable"><div><span>{metric.label}</span><strong>Indisponible</strong></div><p>{metric.unavailableReason}</p></article>
  const channel = metric.id.split('.')[0] ?? metric.id
  const spec = visualizationSpecFor(channel as Parameters<typeof visualizationSpecFor>[0])
  return <article className="metric-panel"><div className="metric-heading"><span>{metric.label}</span><strong>{metric.value?.toFixed(2)} <small>{metric.unit}</small></strong></div>{values.length > 2 ? spec.preferredSessionView === 'HISTOGRAM' || spec.preferredSessionView === 'DISTRIBUTION' ? <Histogram values={values} label={`Distribution ${metric.label}`} /> : <Sparkline values={values} label={`Évolution ${metric.label}`} scalePolicy={spec.scalePolicy} /> : null}<footer>{metric.sampleCount} échantillons · confiance {Math.round(metric.confidence * 100)} %</footer></article>
}

export function SessionDetailPage(): ReactNode {
  const { id } = useParams()
  const { sessions, participants, equipment, analysisRuns, settings } = useAppData()
  const [technical, setTechnical] = useState(false)
  const session = sessions.find((item) => item.id === id)
  if (session === undefined) return <div className="screen">Session introuvable.</div>
  const runs = analysisRuns.filter((run) => run.sessionId === session.id).toSorted((left, right) => left.createdAt.localeCompare(right.createdAt))
  const current = runs.find((run) => run.id === session.latestAnalysisRunId) ?? runs.at(-1)
  const original = runs.find((run) => run.id === session.originalAnalysisRunId) ?? runs[0]
  const participant = participants.find((item) => item.id === session.participantId)
  const itemEquipment = equipment.find((item) => item.id === session.equipmentId)
  const series = current?.result.visualizationSeries ?? {}

  const exportJson = (): void => download(exportSummaryJson(session, runs), `${session.id}.json`, 'application/json')
  const exportCsv = (): void => {
    if (current !== undefined) download(exportAnalysisCsv(current), `${session.id}.csv`, 'text/csv')
  }
  const exportTrip = async (): Promise<void> => {
    const store = new ProgressiveRawStore()
    const rawFiles: Record<string, Uint8Array> = {}
    for (const reference of session.rawDataReferences) rawFiles[`${reference.id}.bin`] = await collect(store.read(reference))
    download(createTripArchive({ session, analysisRuns: runs, samples: previewSamples(current), rawFiles }), `${session.id}.tatrip`, 'application/zip')
  }

  return <div className="screen detail-screen"><ScreenHeader eyebrow={`${participant?.name ?? ''} · ${session.activityType}`} title={session.title ?? new Date(session.startTime).toLocaleDateString('fr-FR')} action={<Link to="/sessions" className="icon-button"><ArrowLeft size={20} /></Link>} />
    <div className="detail-meta"><StatusPill state="good">{session.status}</StatusPill><span>{itemEquipment?.name ?? 'Sans équipement'}</span><span>{session.sourceIds.length} source(s)</span></div>
    <MapView route={current?.result.routePreview ?? []} provider={settings.mapProvider} />
    {current === undefined ? <p>Aucune analyse disponible.</p> : <><section className="quality-strip"><div><strong>{Math.round(current.result.quality.confidence * 100)} %</strong><span>Confiance</span></div><div><strong>{Math.round(current.result.quality.coverage * 100)} %</strong><span>Couverture</span></div><div><strong>{current.analysisVersion}</strong><span>Moteur</span></div></section><div className="metric-grid">{current.result.metrics.map((metric) => <MetricPanel key={metric.id} metric={metric} values={series[metric.id.split('.')[0] ?? ''] ?? []} />)}</div><section className="events-panel"><h2>Événements</h2>{current.result.events.length === 0 ? <p>Aucun événement détecté avec les canaux disponibles.</p> : current.result.events.map((event) => <div key={event.id}><strong>{event.type}</strong><span>{new Date(event.startTime).toLocaleTimeString('fr-FR')}</span></div>)}</section></>}
    {runs.length > 1 && original !== undefined && current !== undefined ? <section className="version-panel"><GitCompareArrows size={22} /><div><h2>Évolution des analyses</h2><p>Originale {original.analysisVersion} · actuelle {current.analysisVersion}</p>{explainAnalysisDifference(original.result.metrics, current.result.metrics).map((line) => <p key={line}>{line}</p>)}</div></section> : null}
    <section className="export-actions"><button type="button" onClick={exportJson}><Download size={18} />JSON</button><button type="button" onClick={exportCsv}><Download size={18} />CSV</button><button type="button" onClick={() => void exportTrip()}><Download size={18} />.tatrip</button></section>
    <button className="technical-toggle" type="button" onClick={() => setTechnical(!technical)}><Database size={18} />Données techniques et provenance</button>
    {technical ? <section className="technical-panel"><h2>RAW immuables</h2>{session.rawDataReferences.map((reference) => <dl key={reference.id}><dt>Source</dt><dd>{reference.sourceId}</dd><dt>Stockage</dt><dd>{reference.storage} · {reference.chunkCount} chunk(s)</dd><dt>Empreinte</dt><dd>{reference.sha256}</dd><dt>Taille</dt><dd>{reference.byteLength} octets</dd></dl>)}<h2>Analyses conservées</h2>{runs.map((run) => <dl key={run.id}><dt>Version</dt><dd>{run.analysisVersion} / profil {run.analysisProfileVersion}</dd><dt>Entrée</dt><dd>{run.inputFingerprint}</dd><dt>Rôle</dt><dd>{run.isOriginal ? 'Analyse originale' : 'Réanalyse'}</dd></dl>)}</section> : null}
  </div>
}

async function collect(stream: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  let length = 0
  for await (const chunk of stream) { chunks.push(chunk); length += chunk.byteLength }
  const bytes = new Uint8Array(length)
  let offset = 0
  chunks.forEach((chunk) => { bytes.set(chunk, offset); offset += chunk.byteLength })
  return bytes
}

function previewSamples(run: ReturnType<typeof useAppData>['analysisRuns'][number] | undefined): import('@track-analyser/domain').SensorSample[] {
  if (run === undefined) return []
  return Object.entries(run.result.visualizationSeries).flatMap(([channel, values]) =>
    values.map((value, index) => ({
      timestamp: Date.parse(run.createdAt) + index,
      channel: channel as import('@track-analyser/domain').MetricChannel,
      value,
      unit: '',
      sourceId: 'analysis-preview',
      quality: run.result.quality.confidence,
      stage: 'ANALYSIS' as const,
      provenance: { sourceId: 'analysis-preview', channel: channel as import('@track-analyser/domain').MetricChannel, sampleCount: values.length, coverage: run.result.quality.coverage, quality: run.result.quality.confidence, method: 'aperçu décimé pour visualisation', original: false },
    })),
  )
}
