import type { AnalysisRun, Segment, SensorSample, Session } from '@track-analyser/domain'
import { createTripArchive, exportAnalysisCsv, exportSummaryJson } from '@track-analyser/exporters'
import { ProgressiveRawStore } from '@track-analyser/storage'

export type SessionExportKind = 'JSON' | 'CSV' | 'TATRIP'

export async function exportSession(session: Session, runs: readonly AnalysisRun[], segments: readonly Segment[], kind: SessionExportKind): Promise<void> {
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
