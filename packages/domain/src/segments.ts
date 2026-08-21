import { deterministicHash } from './statistics'
import type { ComparableContext, GeoPoint, Segment, SensorSample, Session } from './types'

export interface SegmentCreationOptions {
  id?: string
  manual: boolean
  context?: ComparableContext
}

export interface SegmentComparisonProfile {
  version: string
  maxMeanRouteDistanceMeters: number
  minimumRouteSimilarity: number
  maximumPointDistanceMeters: number
  maximumDirectionGapDegrees: number
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
  minimumRouteSimilarity: 0.9,
  maximumPointDistanceMeters: 35,
  maximumDirectionGapDegrees: 45,
  minimumContextQuality: 0.35,
  maxSlopeGap: 0.08,
  maxRadiusRelativeGap: 0.35,
  maxSpeedRelativeGap: 0.4,
  maxDurationRelativeGap: 0.5,
  maxAltitudeGapMeters: 300,
}

export interface RouteTrack {
  session: Session
  points: readonly GeoPoint[]
}

export interface AutomaticRouteSegmentProfile {
  version: string
  minimumOccurrences: number
  minimumSimilarity: number
  spacingMeters: number
  minimumLengthMeters: number
  maximumPointDistanceMeters: number
  maximumEndpointDistanceMeters: number
  maximumDirectionGapDegrees: number
  searchStepPoints: number
}

export const DEFAULT_AUTOMATIC_ROUTE_SEGMENT_PROFILE: AutomaticRouteSegmentProfile = {
  version: '1.0.0',
  minimumOccurrences: 2,
  minimumSimilarity: 0.9,
  spacingMeters: 20,
  minimumLengthMeters: 180,
  maximumPointDistanceMeters: 35,
  maximumEndpointDistanceMeters: 50,
  maximumDirectionGapDegrees: 45,
  searchStepPoints: 2,
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

export function detectRecurringRouteSegments(
  tracks: readonly RouteTrack[],
  profile: AutomaticRouteSegmentProfile = DEFAULT_AUTOMATIC_ROUTE_SEGMENT_PROFILE,
): Segment[] {
  const prepared = tracks.flatMap((track) => {
    if (track.session.endTime === undefined || track.points.length < 2) return []
    const points = resampleRoute(track.points, profile.spacingMeters)
    return points.length < Math.ceil(profile.minimumLengthMeters / profile.spacingMeters) + 1 ? [] : [{ track, points }]
  })
  const minimumPoints = Math.ceil(profile.minimumLengthMeters / profile.spacingMeters) + 1
  const candidates: RouteCandidate[] = []

  for (let leftIndex = 0; leftIndex < prepared.length; leftIndex += 1) {
    const left = prepared[leftIndex]
    if (left === undefined) continue
    for (let rightIndex = leftIndex; rightIndex < prepared.length; rightIndex += 1) {
      const right = prepared[rightIndex]
      if (right === undefined) continue
      for (let leftStart = 0; leftStart + minimumPoints <= left.points.length; leftStart += profile.searchStepPoints) {
        const firstRightStart = leftIndex === rightIndex ? leftStart + minimumPoints : 0
        for (let rightStart = firstRightStart; rightStart + minimumPoints <= right.points.length; rightStart += profile.searchStepPoints) {
          const leftWindow = left.points.slice(leftStart, leftStart + minimumPoints)
          const rightWindow = right.points.slice(rightStart, rightStart + minimumPoints)
          const similarity = routeSimilarity(leftWindow, rightWindow, profile.maximumPointDistanceMeters, profile.maximumDirectionGapDegrees)
          if (similarity < profile.minimumSimilarity) continue
          const leftFirst = leftWindow[0]
          const leftLast = leftWindow.at(-1)
          const rightFirst = rightWindow[0]
          const rightLast = rightWindow.at(-1)
          if (leftFirst === undefined || leftLast === undefined || rightFirst === undefined || rightLast === undefined) continue
          if (haversine(leftFirst, rightFirst) > profile.maximumEndpointDistanceMeters || haversine(leftLast, rightLast) > profile.maximumEndpointDistanceMeters) continue

          let extension = 0
          let consecutiveMisses = 0
          while (leftStart + minimumPoints + extension < left.points.length && rightStart + minimumPoints + extension < right.points.length && consecutiveMisses < 2) {
            const leftPoint = left.points[leftStart + minimumPoints + extension]
            const rightPoint = right.points[rightStart + minimumPoints + extension]
            if (leftPoint === undefined || rightPoint === undefined) break
            if (haversine(leftPoint, rightPoint) <= profile.maximumPointDistanceMeters) consecutiveMisses = 0
            else consecutiveMisses += 1
            extension += 1
          }
          const acceptedExtension = Math.max(0, extension - consecutiveMisses)
          candidates.push({
            left: occurrence(left.track, left.points, leftStart, leftStart + minimumPoints + acceptedExtension - 1),
            right: occurrence(right.track, right.points, rightStart, rightStart + minimumPoints + acceptedExtension - 1),
            similarity,
          })
        }
      }
    }
  }

  const groups: RouteGroup[] = []
  candidates
    .toSorted((a, b) => routeLength(b.left.signature) - routeLength(a.left.signature) || b.similarity - a.similarity)
    .forEach((candidate) => {
      const existing = groups.find((group) => routeSimilarity(group.signature, candidate.left.signature, profile.maximumPointDistanceMeters, profile.maximumDirectionGapDegrees) >= profile.minimumSimilarity)
      const group = existing ?? { signature: candidate.left.signature, similarities: [], occurrences: [] }
      if (existing === undefined) groups.push(group)
      group.similarities.push(candidate.similarity)
      addOccurrence(group.occurrences, candidate.left)
      addOccurrence(group.occurrences, candidate.right)
    })

  return groups
    .filter((group) => group.occurrences.length >= profile.minimumOccurrences)
    .flatMap((group, groupIndex) => {
      const fingerprint = deterministicHash({ version: profile.version, signature: group.signature })
      const quality = mean(group.similarities)
      return group.occurrences.map((item) => ({
        id: `segment-auto-${deterministicHash({ sessionId: item.session.id, startTime: item.startTime, endTime: item.endTime, fingerprint })}`,
        sessionId: item.session.id,
        name: `Tronçon comparable ${groupIndex + 1}`,
        startTime: item.startTime,
        endTime: item.endTime,
        routeFingerprint: fingerprint,
        routeSignature: item.signature,
        context: { type: 'ROUTE_RECURRING', duration: (item.endTime - item.startTime) / 1_000, quality },
        detection: { algorithmVersion: profile.version, similarity: quality, occurrenceCount: group.occurrences.length, direction: 'FORWARD' as const },
        manual: false,
      }))
    })
}

export function segmentsAreComparable(
  left: Segment,
  right: Segment,
  profile: SegmentComparisonProfile = DEFAULT_SEGMENT_COMPARISON_PROFILE,
): boolean {
  if (left.sessionId === right.sessionId && left.id === right.id) return false
  if (left.routeSignature !== undefined && right.routeSignature !== undefined) {
    if (routeSimilarity(left.routeSignature, right.routeSignature, profile.maximumPointDistanceMeters, profile.maximumDirectionGapDegrees) >= profile.minimumRouteSimilarity) return true
    if (sameDirection(left.routeSignature, right.routeSignature, profile.maximumDirectionGapDegrees) && routeDistance(left.routeSignature, right.routeSignature) <= profile.maxMeanRouteDistanceMeters) return true
  }
  if (left.routeFingerprint !== undefined && left.routeFingerprint === right.routeFingerprint && left.routeSignature === undefined && right.routeSignature === undefined) return true
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

interface ResampledPoint extends GeoPoint { fraction: number }
interface RouteOccurrence { session: Session; startTime: number; endTime: number; signature: GeoPoint[] }
interface RouteCandidate { left: RouteOccurrence; right: RouteOccurrence; similarity: number }
interface RouteGroup { signature: GeoPoint[]; similarities: number[]; occurrences: RouteOccurrence[] }

function occurrence(track: RouteTrack, points: readonly ResampledPoint[], start: number, end: number): RouteOccurrence {
  const first = points[start]
  const last = points[end]
  const startTimestamp = Date.parse(track.session.startTime)
  const endTimestamp = Date.parse(track.session.endTime ?? track.session.startTime)
  const duration = Math.max(1, endTimestamp - startTimestamp)
  return {
    session: track.session,
    startTime: startTimestamp + duration * (first?.fraction ?? 0),
    endTime: startTimestamp + duration * (last?.fraction ?? 1),
    signature: decimateRoute(points.slice(start, end + 1)),
  }
}

function addOccurrence(occurrences: RouteOccurrence[], candidate: RouteOccurrence): void {
  const duplicate = occurrences.some((current) => current.session.id === candidate.session.id && intervalOverlap(current, candidate) >= 0.6)
  if (!duplicate) occurrences.push(candidate)
}

function intervalOverlap(left: RouteOccurrence, right: RouteOccurrence): number {
  const intersection = Math.max(0, Math.min(left.endTime, right.endTime) - Math.max(left.startTime, right.startTime))
  return intersection / Math.max(1, Math.min(left.endTime - left.startTime, right.endTime - right.startTime))
}

function resampleRoute(route: readonly GeoPoint[], spacingMeters: number): ResampledPoint[] {
  const cumulative = [0]
  for (let index = 1; index < route.length; index += 1) {
    const previous = route[index - 1]
    const current = route[index]
    cumulative.push((cumulative.at(-1) ?? 0) + (previous === undefined || current === undefined ? 0 : haversine(previous, current)))
  }
  const total = cumulative.at(-1) ?? 0
  if (total < spacingMeters) return []
  const result: ResampledPoint[] = []
  let sourceIndex = 1
  for (let distance = 0; distance <= total; distance += spacingMeters) {
    while ((cumulative[sourceIndex] ?? total) < distance && sourceIndex < cumulative.length - 1) sourceIndex += 1
    const before = route[sourceIndex - 1]
    const after = route[sourceIndex]
    const startDistance = cumulative[sourceIndex - 1] ?? 0
    const endDistance = cumulative[sourceIndex] ?? total
    if (before === undefined || after === undefined) continue
    const ratio = (distance - startDistance) / Math.max(1e-9, endDistance - startDistance)
    result.push({
      latitude: before.latitude + (after.latitude - before.latitude) * ratio,
      longitude: before.longitude + (after.longitude - before.longitude) * ratio,
      ...(before.altitude === undefined || after.altitude === undefined ? {} : { altitude: before.altitude + (after.altitude - before.altitude) * ratio }),
      fraction: distance / total,
    })
  }
  return result
}

function routeSimilarity(left: readonly GeoPoint[], right: readonly GeoPoint[], maximumDistance: number, maximumDirectionGap: number): number {
  const count = Math.min(24, left.length, right.length)
  if (count < 2 || !sameDirection(left, right, maximumDirectionGap)) return 0
  let matches = 0
  for (let index = 0; index < count; index += 1) {
    const leftPoint = left[Math.round(index * (left.length - 1) / (count - 1))]
    const rightPoint = right[Math.round(index * (right.length - 1) / (count - 1))]
    if (leftPoint !== undefined && rightPoint !== undefined && haversine(leftPoint, rightPoint) <= maximumDistance) matches += 1
  }
  return matches / count
}

function sameDirection(left: readonly GeoPoint[], right: readonly GeoPoint[], maximumGap: number): boolean {
  const leftStart = left[0]
  const leftEnd = left.at(-1)
  const rightStart = right[0]
  const rightEnd = right.at(-1)
  if (leftStart === undefined || leftEnd === undefined || rightStart === undefined || rightEnd === undefined) return false
  const gap = Math.abs(bearing(leftStart, leftEnd) - bearing(rightStart, rightEnd))
  return Math.min(gap, 360 - gap) <= maximumGap
}

function bearing(start: GeoPoint, end: GeoPoint): number {
  const toRadians = Math.PI / 180
  const y = Math.sin((end.longitude - start.longitude) * toRadians) * Math.cos(end.latitude * toRadians)
  const x = Math.cos(start.latitude * toRadians) * Math.sin(end.latitude * toRadians) - Math.sin(start.latitude * toRadians) * Math.cos(end.latitude * toRadians) * Math.cos((end.longitude - start.longitude) * toRadians)
  return (Math.atan2(y, x) / toRadians + 360) % 360
}

function decimateRoute(points: readonly GeoPoint[]): GeoPoint[] {
  const count = Math.min(24, points.length)
  return Array.from({ length: count }, (_, index) => points[Math.round(index * (points.length - 1) / Math.max(1, count - 1))])
    .filter((point): point is GeoPoint => point !== undefined)
    .map((point) => ({ latitude: round(point.latitude, 5), longitude: round(point.longitude, 5), ...(point.altitude === undefined ? {} : { altitude: round(point.altitude, 0) }) }))
}

function routeLength(points: readonly GeoPoint[]): number {
  let length = 0
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    if (previous !== undefined && current !== undefined) length += haversine(previous, current)
  }
  return length
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
function mean(values: readonly number[]): number { return values.reduce((total, value) => total + value, 0) / Math.max(1, values.length) }
