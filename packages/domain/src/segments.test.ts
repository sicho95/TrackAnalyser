import { describe, expect, it } from 'vitest'
import { createSegment, segmentPercentWindow, segmentsAreComparable, type SegmentComparisonProfile } from './segments'
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
      minimumContextQuality: 1,
      maxSlopeGap: 0,
      maxRadiusRelativeGap: 0,
      maxSpeedRelativeGap: 0,
      maxDurationRelativeGap: 0,
      maxAltitudeGapMeters: 0,
    }
    expect(segmentsAreComparable(left, right, strict)).toBe(false)
  })
})
