import { describe, expect, it } from 'vitest'
import { parseGpx, parseTcx } from './xml'

describe('imports XML', () => {
  it('normalise GPX sans perdre le RAW', () => {
    const bytes = new TextEncoder().encode('<?xml version="1.0"?><gpx><trk><trkseg><trkpt lat="48" lon="2"><ele>120</ele><time>2026-08-21T10:00:00Z</time></trkpt></trkseg></trk></gpx>')
    const result = parseGpx(bytes, 'trace.gpx')
    expect(result.samples.map((sample) => sample.channel)).toEqual(['position', 'altitude'])
    expect(result.rawBytes).toEqual(bytes)
  })

  it('identifie une activité course TCX', () => {
    const bytes = new TextEncoder().encode('<?xml version="1.0"?><TrainingCenterDatabase><Activities><Activity Sport="Running"><Lap><Track><Trackpoint><Time>2026-08-21T10:00:00Z</Time><Position><LatitudeDegrees>48</LatitudeDegrees><LongitudeDegrees>2</LongitudeDegrees></Position><DistanceMeters>10</DistanceMeters></Trackpoint></Track></Lap></Activity></Activities></TrainingCenterDatabase>')
    expect(parseTcx(bytes, 'run.tcx').identity.activityType).toBe('RUNNING')
  })
})

