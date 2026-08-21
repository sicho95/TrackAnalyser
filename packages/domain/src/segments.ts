import { deterministicHash } from './statistics'
import type { AnalysisRun, ComparableContext, GeoPoint, Segment, SensorSample, Session } from './types'

export interface SegmentCreationOptions {
  id?: string
  manual: boolean
  context?: ComparableContext
}

export interface SegmentComparisonProfile {
  version: string
  maxMeanRouteDistanceMeters: number
  minimumContextQuality: number
  maxSlopeGap: number
  maxRadiusRelativeGap: number
  maxSpeedRelativeGap: number
  maxDurationRelativeGap: number
  maxAltitudeGapMeters: number
}

export const DEFAULT_SEGMENT_COMPARISON_PROFILE: SegmentComparisonProfile = {
  version: '1.0.0',
  maxMeanRouteDistanceMeters: 60,
  minimumContextQuality: 0.35,
  maxSlopeGap: 0.08,
  maxRadiusRelativeGap: 0.35,
  maxSpeedRelativeGap: 0.4,
  maxDurationRelativeGap: 0.5,
  maxAltitudeGapMeters: 300,
}

export function createSegment(
  session: Session,
  name: string,
  startTime: number,
  endTime: number,
  samples: readonly SensorSample[],
  options: SegmentCreationOptions,
): Segment {
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime >= endTime) throw new Error('La période du segment est invalide.')
  const signature = routeSignature(samples, startTime, endTime)
  return {
    id: options.id ?? `segment-${session.id}-${crypto.randomUUID()}`,
    sessionId: session.id,
    name: name.trim() || 'Segment',
    startTime,
    endTime,
    ...(signature.length < 2 ? {} : { routeSignature: signature, routeFingerprint: deterministicHash(signature) }),
    ...(options.context === undefined ? {} : { context: options.context }),
    manual: options.manual,
  }
}

export function automaticSegments(session: Session, run: AnalysisRun, samples: readonly SensorSample[]): Segment[] {
  return run.result.events
    .filter((event) => event.endTime > event.startTime)
    .map((event) => createSegment(session, event.type, event.startTime, event.endTime, samples, {
      id: `segment-${session.id}-${run.id}-${event.id}`,
      manual: false,
      ...(event.context === undefined ? {} : { context: event.context }),
    }))
}

export function segmentsAreComparable(
  left: Segment,
  right: Segment,
  profile: SegmentComparisonProfile = DEFAULT_SEGMENT_COMPARISON_PROFILE,
): boolean {
  if (left.sessionId === right.sessionId && left.id === right.id) return false
  if (left.routeFingerprint !== undefined && left.routeFingerprint === right.routeFingerprint) return true
  if (left.routeSignature !== undefined && right.routeSignature !== undefined && routeDistance(left.routeSignature, right.routeSignature) <= profile.maxMeanRouteDistanceMeters) return true
  const a = left.context
  const b = right.context
  return contextsAreComparable(a, b, profile)
}

export function contextsAreComparable(
  a: ComparableContext | undefined,
  b: ComparableContext | undefined,
  profile: SegmentComparisonProfile = DEFAULT_SEGMENT_COMPARISON_PROFILE,
): boolean {
  if (a === undefined) return false
  if (b === undefined) return false
  if (a.type !== b.type || Math.min(a.quality, b.quality) < profile.minimumContextQuality) return false
  if (a.slope !== undefined && b.slope !== undefined && Math.abs(a.slope - b.slope) > profile.maxSlopeGap) return false
  if (a.radius !== undefined && b.radius !== undefined && relativeGap(a.radius, b.radius) > profile.maxRadiusRelativeGap) return false
  if (a.speed !== undefined && b.speed !== undefined && relativeGap(a.speed, b.speed) > profile.maxSpeedRelativeGap) return false
  if (a.duration !== undefined && b.duration !== undefined && relativeGap(a.duration, b.duration) > profile.maxDurationRelativeGap) return false
  if (a.altitude !== undefined && b.altitude !== undefined && Math.abs(a.altitude - b.altitude) > profile.maxAltitudeGapMeters) return false
  return true
}

export function segmentPercentWindow(session: Session, segment: Segment): [number, number] {
  const sessionStart = Date.parse(session.startTime)
  const sessionEnd = session.endTime === undefined ? segment.endTime : Date.parse(session.endTime)
  const duration = Math.max(1, sessionEnd - sessionStart)
  return [
    Math.max(0, Math.min(100, (segment.startTime - sessionStart) / duration * 100)),
    Math.max(0, Math.min(100, (segment.endTime - sessionStart) / duration * 100)),
  ]
}

function routeSignature(samples: readonly SensorSample[], startTime: number, endTime: number): GeoPoint[] {
  const positions = samples.flatMap((sample) => {
    if (sample.timestamp < startTime || sample.timestamp > endTime || sample.channel !== 'position') return []
    const value = sample.value
    if (typeof value !== 'object' || Array.isArray(value) || !('latitude' in value) || !('longitude' in value)) return []
    const point = value as GeoPoint
    return [{ latitude: round(point.latitude, 4), longitude: round(point.longitude, 4), ...(point.altitude === undefined ? {} : { altitude: round(point.altitude, 0) }) }]
  })
  if (positions.length <= 24) return positions
  return Array.from({ length: 24 }, (_, index) => positions[Math.min(positions.length - 1, Math.round(index * (positions.length - 1) / 23))]).filter((point): point is GeoPoint => point !== undefined)
}

function routeDistance(left: readonly GeoPoint[], right: readonly GeoPoint[]): number {
  const count = Math.min(16, left.length, right.length)
  if (count < 2) return Number.POSITIVE_INFINITY
  let total = 0
  for (let index = 0; index < count; index += 1) {
    const leftPoint = left[Math.round(index * (left.length - 1) / (count - 1))]
    const rightPoint = right[Math.round(index * (right.length - 1) / (count - 1))]
    if (leftPoint === undefined || rightPoint === undefined) return Number.POSITIVE_INFINITY
    total += haversine(leftPoint, rightPoint)
  }
  return total / count
}

function haversine(left: GeoPoint, right: GeoPoint): number {
  const radius = 6_371_000
  const toRadians = Math.PI / 180
  const dLat = (right.latitude - left.latitude) * toRadians
  const dLon = (right.longitude - left.longitude) * toRadians
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(left.latitude * toRadians) * Math.cos(right.latitude * toRadians) * Math.sin(dLon / 2) ** 2
  return 2 * radius * Math.asin(Math.sqrt(a))
}

function relativeGap(left: number, right: number): number { return Math.abs(left - right) / Math.max(Math.abs(left), Math.abs(right), 1e-9) }
function round(value: number, decimals: number): number { const factor = 10 ** decimals; return Math.round(value * factor) / factor }
