import type { ImportResult } from '@track-analyser/domain'
import { restoreTripArchive } from '@track-analyser/exporters'
import { parseFit } from './fit'
import { parseTrackAnalyserJson } from './json'
import { parseAppleHealthXml, parseGpx, parseTcx } from './xml'

export * from './fit'
export * from './json'
export * from './shared'
export * from './xml'

export function detectImportFormat(fileName: string, bytes: Uint8Array): ImportResult['identity']['format'] {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.fit')) return 'FIT'
  if (lower.endsWith('.gpx')) return 'GPX'
  if (lower.endsWith('.tcx')) return 'TCX'
  if (lower.endsWith('.tatrip')) return 'TATRIP'
  if (lower.endsWith('.tabackup')) return 'TABACKUP'
  const head = new TextDecoder().decode(bytes.slice(0, 1_024)).toLowerCase()
  if (head.includes('<healthdata')) return 'APPLE_XML'
  if (lower.endsWith('.json')) return 'TRACK_ANALYSER_JSON'
  throw new Error('Format d’import non reconnu.')
}

export function parseImportedFile(bytes: Uint8Array, fileName: string): ImportResult {
  const format = detectImportFormat(fileName, bytes)
  switch (format) {
    case 'FIT':
      return parseFit(bytes, fileName)
    case 'GPX':
      return parseGpx(bytes, fileName)
    case 'TCX':
      return parseTcx(bytes, fileName)
    case 'APPLE_XML':
      return parseAppleHealthXml(bytes, fileName)
    case 'TRACK_ANALYSER_JSON':
      return parseTrackAnalyserJson(bytes, fileName)
    case 'TATRIP':
      return parseTripArchive(bytes, fileName)
    case 'TABACKUP':
    case 'APPLE_WORKOUT':
      throw new Error(`Utiliser le restaurateur dédié pour ${format}.`)
  }
}

function parseTripArchive(bytes: Uint8Array, fileName: string): ImportResult {
  const restored = restoreTripArchive(bytes)
  return {
    identity: {
      format: 'TATRIP',
      fileName,
      sha256: restored.session.rawDataReferences[0]?.sha256 ?? restored.manifest.sessionId ?? fileName,
      startTime: restored.session.startTime,
      ...(restored.session.endTime === undefined ? {} : { endTime: restored.session.endTime }),
      activityType: restored.session.activityType,
      channels: [...new Set(restored.samples.map((sample) => sample.channel))],
    },
    samples: restored.samples,
    opaqueRecords: [],
    rawBytes: bytes,
    metadata: { tripSession: restored.session, analysisRuns: restored.analysisRuns, embeddedRawFiles: Object.keys(restored.rawFiles) },
    warnings: [],
  }
}
