import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFit } from './fit'

describe('import FIT Garmin réel', () => {
  it('décode la fixture réelle et conserve le contenu non exposé', async () => {
    const path = resolve(process.cwd(), 'tests/fixtures/garmin/24048447957_ACTIVITY.fit')
    const bytes = new Uint8Array(await readFile(path))
    const result = parseFit(bytes, '24048447957_ACTIVITY.fit')
    const counts = result.metadata.messageCounts as Record<string, number>
    expect(result.rawBytes).toEqual(bytes)
    expect(result.identity.sha256).toBe('1a6ab020cd0d168f921867465bcd4add77d6588e72703864dfeef3b9d2dc3af4')
    expect(counts.record).toBe(1_319)
    expect(result.identity.activityType).toBe('RUNNING')
    expect(result.identity.channels).toEqual(expect.arrayContaining(['position', 'heartRate', 'cadence', 'distance', 'power', 'altitude', 'speed']))
    expect(result.samples.length).toBeGreaterThan(8_000)
    expect(result.opaqueRecords.length).toBeGreaterThan(result.samples.length)
    expect(result.opaqueRecords.filter((record) => record.messageName === 'unknown').length).toBeGreaterThan(0)
    expect(result.opaqueRecords.filter((record) => record.rawType === 'message-definition').length).toBeGreaterThan(0)
    expect(result.metadata.integrityValid).toBe(true)
    expect(JSON.stringify(result.metadata.decodedMessages).length).toBeGreaterThan(bytes.length)
  })
})
