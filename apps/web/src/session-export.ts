import { createPipelineDataset, transitionDataset, type AnalysisRun, type Segment, type SensorSample, type Session } from '@track-analyser/domain'
import { createTripArchive, exportAnalysisCsv, exportSessionGpx, exportSummaryJson } from '@track-analyser/exporters'
import { DataFusionEngine, synchronizeByUtc } from '@track-analyser/fusion'
import { ProgressiveRawStore } from '@track-analyser/storage'
import { replayRawSamples } from './reanalysis'

export type SessionExportKind = 'JSON' | 'CSV' | 'GPX' | 'TATRIP'

export async function exportSession(
  session: Session,
  runs: readonly AnalysisRun[],
  segments: readonly Segment[],
  kind: SessionExportKind,
  maximumContinuityGapMs = 60_000,
): Promise<void> {
  const current = runs.find((run) => run.id === session.latestAnalysisRunId) ?? runs.at(-1)
  if (kind === 'JSON') {
    download(exportSummaryJson(session, runs), `${session.id}.json`, 'application/json')
    return
  }
  if (kind === 'CSV') {
    if (current === undefined) throw new Error('Aucune analyse disponible pour l’export CSV.')
    download(exportAnalysisCsv(current), `${session.id}.csv`, 'text/csv')
    return
  }
  const store = new ProgressiveRawStore()
  if (kind === 'GPX') {
    const geographicSamples = await replayRawSamples(session.rawDataReferences, store, ['position', 'altitude'])
    const raw = createPipelineDataset(session.id, session.participantId, geographicSamples, 'RAW')
    const normalized = transitionDataset(raw, 'NORMALIZED')
    const synchronized = synchronizeByUtc(normalized)
    const fused = new DataFusionEngine(__ANALYSIS_VERSION__).fuse(synchronized, [{ channel: 'position', strategy: 'AUTO' }]).dataset
    const fusedSamples = [...fused.channels.values()].flatMap((series) => series.samples)
    download(exportSessionGpx(session, fusedSamples, maximumContinuityGapMs), `${session.id}.gpx`, 'application/gpx+xml')
    return
  }
  const rawFiles: Record<string, Uint8Array> = {}
  for (const reference of session.rawDataReferences) rawFiles[`${reference.id}.bin`] = await collect(store.read(reference))
  download(createTripArchive({ session, analysisRuns: [...runs], segments: [...segments], samples: previewSamples(current), rawFiles }), `${session.id}.tatrip`, 'application/zip')
}

function download(bytes: Uint8Array | string, name: string, type: string): void {
  const blob = new Blob([typeof bytes === 'string' ? bytes : bytes as unknown as BlobPart], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
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

function previewSamples(run: AnalysisRun | undefined): SensorSample[] {
  if (run === undefined) return []
  return Object.entries(run.result.visualizationSeries).flatMap(([channel, values]) =>
    values.map((value, index) => ({
      timestamp: Date.parse(run.createdAt) + index,
      channel: channel as SensorSample['channel'],
      value,
      unit: '',
      sourceId: 'analysis-preview',
      quality: run.result.quality.confidence,
      stage: 'ANALYSIS' as const,
      provenance: { sourceId: 'analysis-preview', channel: channel as SensorSample['channel'], sampleCount: values.length, coverage: run.result.quality.coverage, quality: run.result.quality.confidence, method: 'aperçu décimé pour visualisation', original: false },
    })),
  )
}
