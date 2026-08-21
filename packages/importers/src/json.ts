import type { ImportResult, SensorSample } from '@track-analyser/domain'
import { sha256Hex } from './shared'

interface TrackAnalyserJson {
  format: 'track-analyser-summary'
  formatVersion: number
  activityType?: ImportResult['identity']['activityType']
  samples?: SensorSample[]
  metadata?: Record<string, unknown>
  session?: { activityType?: ImportResult['identity']['activityType'] }
}

export function parseTrackAnalyserJson(bytes: Uint8Array, fileName: string): ImportResult {
  const decoded: unknown = JSON.parse(new TextDecoder().decode(bytes))
  if (decoded === null || typeof decoded !== 'object' || (decoded as { format?: unknown }).format !== 'track-analyser-summary') {
    throw new Error('JSON TrackAnalyser non reconnu.')
  }
  const data = decoded as TrackAnalyserJson
  if (data.formatVersion !== 1) throw new Error(`Version JSON non prise en charge : ${data.formatVersion}.`)
  const samples = data.samples ?? []
  const sha256 = sha256Hex(bytes)
  const activityType = data.activityType ?? data.session?.activityType
  return {
    identity: {
      format: 'TRACK_ANALYSER_JSON',
      fileName,
      sha256,
      ...(activityType === undefined ? {} : { activityType }),
      channels: [...new Set(samples.map((sample) => sample.channel))],
    },
    samples,
    opaqueRecords: [],
    rawBytes: bytes,
    metadata: data.metadata ?? {},
    warnings: [],
  }
}
