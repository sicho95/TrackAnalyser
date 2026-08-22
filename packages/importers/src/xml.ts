import { finiteExtent, type ActivityType, type ImportResult, type MetricChannel, type SensorSample } from '@track-analyser/domain'
import { createImportedSample, sha256Hex } from './shared'

interface XmlPoint {
  timestamp: number
  latitude?: number
  longitude?: number
  altitude?: number
  distance?: number
  heartRate?: number
  cadence?: number
  speed?: number
  power?: number
}

function parser(): DOMParser {
  if (typeof DOMParser === 'undefined') throw new Error('Analyse XML indisponible dans cet environnement.')
  return new DOMParser()
}

function firstText(element: Element, selectors: readonly string[]): string | undefined {
  for (const selector of selectors) {
    const text = element.querySelector(selector)?.textContent?.trim()
    if (text !== undefined && text.length > 0) return text
  }
  return undefined
}

function numeric(element: Element, selectors: readonly string[]): number | undefined {
  const value = Number(firstText(element, selectors))
  return Number.isFinite(value) ? value : undefined
}

function pointSamples(point: XmlPoint, sourceId: string, fileName: string): SensorSample[] {
  const samples: SensorSample[] = []
  if (point.latitude !== undefined && point.longitude !== undefined) {
    samples.push(createImportedSample(point.timestamp, 'position', { latitude: point.latitude, longitude: point.longitude, ...(point.altitude === undefined ? {} : { altitude: point.altitude }) }, 'WGS84', sourceId, fileName))
  }
  const channels: Array<[MetricChannel, number | undefined, string]> = [
    ['altitude', point.altitude, 'm'],
    ['distance', point.distance, 'm'],
    ['heartRate', point.heartRate, 'bpm'],
    ['cadence', point.cadence, 'rpm'],
    ['speed', point.speed, 'm/s'],
    ['power', point.power, 'W'],
  ]
  channels.forEach(([channel, value, unit]) => {
    if (value !== undefined) samples.push(createImportedSample(point.timestamp, channel, value, unit, sourceId, fileName))
  })
  return samples
}

function xmlResult(format: 'GPX' | 'TCX', bytes: Uint8Array, fileName: string, points: XmlPoint[], activityType: ActivityType): ImportResult {
  const sha256 = sha256Hex(bytes)
  const sourceId = `${format.toLowerCase()}:${sha256}`
  const samples = points.flatMap((point) => pointSamples(point, sourceId, fileName))
  const channels = [...new Set(samples.map((sample) => sample.channel))]
  return {
    identity: {
      format,
      fileName,
      sha256,
      ...(points.length === 0 ? {} : { startTime: new Date(points[0]?.timestamp ?? 0).toISOString(), endTime: new Date(points.at(-1)?.timestamp ?? 0).toISOString() }),
      activityType,
      channels,
    },
    samples,
    opaqueRecords: [],
    rawBytes: bytes,
    metadata: { pointCount: points.length },
    warnings: [],
  }
}

export function parseGpx(bytes: Uint8Array, fileName: string): ImportResult {
  const document = parser().parseFromString(new TextDecoder().decode(bytes), 'application/xml')
  if (document.querySelector('parsererror') !== null) throw new Error('Fichier GPX XML invalide.')
  const points = [...document.querySelectorAll('trkpt')].flatMap((element): XmlPoint[] => {
    const timestamp = Date.parse(firstText(element, ['time']) ?? '')
    const latitude = Number(element.getAttribute('lat'))
    const longitude = Number(element.getAttribute('lon'))
    if (![timestamp, latitude, longitude].every(Number.isFinite)) return []
    return [compactPoint({ timestamp, latitude, longitude, altitude: numeric(element, ['ele']), heartRate: numeric(element, ['hr', 'gpxtpx\\:hr']), cadence: numeric(element, ['cad', 'gpxtpx\\:cad']), speed: numeric(element, ['speed']), power: numeric(element, ['power']) })]
  })
  return xmlResult('GPX', bytes, fileName, points, 'GENERIC')
}

export function parseTcx(bytes: Uint8Array, fileName: string): ImportResult {
  const document = parser().parseFromString(new TextDecoder().decode(bytes), 'application/xml')
  if (document.querySelector('parsererror') !== null) throw new Error('Fichier TCX XML invalide.')
  const sport = document.querySelector('Activity')?.getAttribute('Sport')?.toLowerCase()
  const activityType: ActivityType = sport === 'running' ? 'RUNNING' : sport === 'biking' ? 'BIKE' : 'GENERIC'
  const points = [...document.querySelectorAll('Trackpoint')].flatMap((element): XmlPoint[] => {
    const timestamp = Date.parse(firstText(element, ['Time']) ?? '')
    if (!Number.isFinite(timestamp)) return []
    return [compactPoint({
      timestamp,
      latitude: numeric(element, ['LatitudeDegrees']),
      longitude: numeric(element, ['LongitudeDegrees']),
      altitude: numeric(element, ['AltitudeMeters']),
      distance: numeric(element, ['DistanceMeters']),
      heartRate: numeric(element, ['HeartRateBpm Value']),
      cadence: numeric(element, ['Cadence', 'RunCadence']),
      speed: numeric(element, ['Speed']),
      power: numeric(element, ['Watts']),
    })]
  })
  return xmlResult('TCX', bytes, fileName, points, activityType)
}

function compactPoint(point: { timestamp: number } & Record<string, number | undefined>): XmlPoint {
  return Object.fromEntries(Object.entries(point).filter(([, value]) => value !== undefined)) as unknown as XmlPoint
}

export function parseAppleHealthXml(bytes: Uint8Array, fileName: string): ImportResult {
  const document = parser().parseFromString(new TextDecoder().decode(bytes), 'application/xml')
  if (document.querySelector('parsererror') !== null) throw new Error('Export Apple Health XML invalide.')
  const sha256 = sha256Hex(bytes)
  const sourceId = `apple-health:${sha256}`
  const mapping: Readonly<Record<string, [MetricChannel, string, number]>> = {
    HKQuantityTypeIdentifierHeartRate: ['heartRate', 'bpm', 1],
    HKQuantityTypeIdentifierRunningSpeed: ['speed', 'm/s', 1],
    HKQuantityTypeIdentifierDistanceWalkingRunning: ['distance', 'm', 1000],
    HKQuantityTypeIdentifierStepCount: ['cadence', 'steps', 1],
    HKQuantityTypeIdentifierRunningPower: ['power', 'W', 1],
    HKQuantityTypeIdentifierRunningStrideLength: ['strideLength', 'm', 1],
  }
  const samples = [...document.querySelectorAll('Record')].flatMap((record): SensorSample[] => {
    const type = record.getAttribute('type')?.split('.').at(-1)
    const definition = type === undefined ? undefined : mapping[type]
    const timestamp = Date.parse(record.getAttribute('startDate') ?? '')
    const value = Number(record.getAttribute('value'))
    if (definition === undefined || !Number.isFinite(timestamp) || !Number.isFinite(value)) return []
    return [createImportedSample(timestamp, definition[0], value * definition[2], definition[1], sourceId, fileName, 0.85)]
  })
  const timestamps = samples.map((sample) => sample.timestamp)
  const timestampExtent = finiteExtent(timestamps)
  return {
    identity: {
      format: 'APPLE_XML',
      fileName,
      sha256,
      ...(timestampExtent === undefined ? {} : { startTime: new Date(timestampExtent[0]).toISOString(), endTime: new Date(timestampExtent[1]).toISOString() }),
      activityType: 'GENERIC',
      channels: [...new Set(samples.map((sample) => sample.channel))],
    },
    samples,
    opaqueRecords: [],
    rawBytes: bytes,
    metadata: { recordCount: document.querySelectorAll('Record').length },
    warnings: ['HealthKit direct n’est pas utilisé ; seules les données du fichier exporté sont traitées.'],
  }
}
