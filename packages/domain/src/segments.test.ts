import { describe, expect, it } from 'vitest'
import { createSegment, detectRecurringRouteSegments, segmentPercentWindow, segmentsAreComparable, type SegmentComparisonProfile } from './segments'
import { sample, session } from '../../../tests/helpers'

describe('segments comparables', () => {
  it('reconnaît deux portions GPS proches sans fusionner leurs sessions', () => {
    const leftSession = { ...session('left', 'damien'), startTime: new Date(0).toISOString(), endTime: new Date(10_000).toISOString() }
    const rightSession = { ...session('right', 'noa'), startTime: new Date(0).toISOString(), endTime: new Date(10_000).toISOString() }
    const positions = (offset: number) => [
      { ...sample('position', { latitude: 48.8566 + offset, longitude: 2.3522 }, 1_000), sourceId: 'gps' },
      { ...sample('position', { latitude: 48.857 + offset, longitude: 2.353 }, 5_000), sourceId: 'gps' },
      { ...sample('position', { latitude: 48.858 + offset, longitude: 2.354 }, 9_000), sourceId: 'gps' },
    ]
    const left = createSegment(leftSession, 'Montée', 1_000, 9_000, positions(0), { id: 'left-segment', manual: true })
    const right = createSegment(rightSession, 'Montée', 1_000, 9_000, positions(0.00005), { id: 'right-segment', manual: true })
    expect(segmentsAreComparable(left, right)).toBe(true)
    expect(left.sessionId).not.toBe(right.sessionId)
    expect(segmentPercentWindow(leftSession, left)).toEqual([10, 90])
  })

  it('refuse des contextes physiques trop différents', () => {
    const current = session('s', 'damien')
    const left = createSegment(current, 'Virage', 1_000, 2_000, [], { id: 'a', manual: false, context: { type: 'turn', radius: 20, speed: 12, quality: 0.8 } })
    const right = createSegment({ ...current, id: 'other' }, 'Virage', 1_000, 2_000, [], { id: 'b', manual: false, context: { type: 'turn', radius: 100, speed: 12, quality: 0.8 } })
    expect(segmentsAreComparable(left, right)).toBe(false)
  })

  it('permet de calibrer la reconnaissance sans modifier les segments', () => {
    const first = session('first', 'damien')
    const second = session('second', 'damien')
    const left = createSegment(first, 'Montée', 1_000, 9_000, [
      sample('position', { latitude: 48.85, longitude: 2.35 }, 1_000),
      sample('position', { latitude: 48.851, longitude: 2.351 }, 9_000),
    ], { id: 'left', manual: true })
    const right = createSegment(second, 'Montée', 1_000, 9_000, [
      sample('position', { latitude: 48.851, longitude: 2.351 }, 1_000),
      sample('position', { latitude: 48.852, longitude: 2.352 }, 9_000),
    ], { id: 'right', manual: true })
    const strict: SegmentComparisonProfile = {
      version: 'test-strict',
      maxMeanRouteDistanceMeters: 5,
      minimumRouteSimilarity: 0.9,
      maximumPointDistanceMeters: 5,
      maximumDirectionGapDegrees: 20,
      minimumContextQuality: 1,
      maxSlopeGap: 0,
      maxRadiusRelativeGap: 0,
      maxSpeedRelativeGap: 0,
      maxDurationRelativeGap: 0,
      maxAltitudeGapMeters: 0,
    }
    expect(segmentsAreComparable(left, right, strict)).toBe(false)
  })

  it('détecte automatiquement une portion GPS répétée à 90 % dans le même sens', () => {
    const first = { ...session('first', 'damien'), startTime: new Date(0).toISOString(), endTime: new Date(120_000).toISOString() }
    const second = { ...session('second', 'damien'), startTime: new Date(200_000).toISOString(), endTime: new Date(320_000).toISOString() }
    const route = Array.from({ length: 24 }, (_, index) => ({ latitude: 48.85 + index * 0.00002, longitude: 2.35 + index * 0.00012 }))
    const noisyRoute = route.map((point, index) => ({ latitude: point.latitude + (index % 10 === 0 ? 0.0004 : 0.00001), longitude: point.longitude + 0.00001 }))

    const detected = detectRecurringRouteSegments([{ session: first, points: route }, { session: second, points: noisyRoute }], {
      version: 'test', minimumOccurrences: 2, minimumSimilarity: 0.9, spacingMeters: 10, minimumLengthMeters: 120,
      maximumPointDistanceMeters: 35, maximumEndpointDistanceMeters: 60, maximumDirectionGapDegrees: 30, searchStepPoints: 1,
    })

    expect(new Set(detected.map((segment) => segment.sessionId))).toEqual(new Set(['first', 'second']))
    expect(detected.every((segment) => segment.context?.type === 'ROUTE_RECURRING')).toBe(true)
    expect(detected.every((segment) => segment.detection?.algorithmVersion === 'test' && segment.detection.direction === 'FORWARD')).toBe(true)
  })

  it('refuse la même trace GPS parcourue dans le sens opposé', () => {
    const first = { ...session('first', 'damien'), startTime: new Date(0).toISOString(), endTime: new Date(120_000).toISOString() }
    const second = { ...session('second', 'damien'), startTime: new Date(200_000).toISOString(), endTime: new Date(320_000).toISOString() }
    const route = Array.from({ length: 24 }, (_, index) => ({ latitude: 48.85, longitude: 2.35 + index * 0.00012 }))
    const detected = detectRecurringRouteSegments([{ session: first, points: route }, { session: second, points: route.toReversed() }], {
      version: 'test', minimumOccurrences: 2, minimumSimilarity: 0.9, spacingMeters: 10, minimumLengthMeters: 120,
      maximumPointDistanceMeters: 35, maximumEndpointDistanceMeters: 60, maximumDirectionGapDegrees: 30, searchStepPoints: 1,
    })
    expect(detected).toHaveLength(0)
  })
})
