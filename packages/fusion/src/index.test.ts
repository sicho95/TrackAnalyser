import { createPipelineDataset, transitionDataset, type ChannelFusionPolicy } from '@track-analyser/domain'
import { describe, expect, it } from 'vitest'
import { sample } from '../../../tests/helpers'
import { DataFusionEngine, synchronizeByUtc } from './index'

describe('DataFusionEngine', () => {
  it('choisit la vérité séparément pour chaque canal', () => {
    const raw = createPipelineDataset('session', 'damien', [
      sample('position', { latitude: 48, longitude: 2 }, 1_000, 'phone', 0.4),
      sample('position', { latitude: 48, longitude: 2 }, 1_000, 'garmin', 0.95),
      sample('heartRate', 145, 1_000, 'phone', 0.2),
      sample('heartRate', 142, 1_000, 'belt', 0.99),
    ], 'RAW')
    const synchronized = synchronizeByUtc(transitionDataset(raw, 'NORMALIZED'))
    const output = new DataFusionEngine().fuse(synchronized, [])
    expect(output.dataset.channels.get('position')?.selectedSourceId).toBe('garmin')
    expect(output.dataset.channels.get('heartRate')?.selectedSourceId).toBe('belt')
    expect(output.report.decisions).toHaveLength(2)
  })

  it('refuse une moyenne universelle et limite FUSION aux canaux validés', () => {
    const raw = createPipelineDataset('session', 'damien', [sample('altitude', 100, 1_000, 'a'), sample('altitude', 120, 1_000, 'b')], 'RAW')
    const synchronized = synchronizeByUtc(transitionDataset(raw, 'NORMALIZED'))
    const policies: ChannelFusionPolicy[] = [{ channel: 'altitude', strategy: 'FUSION' }]
    const output = new DataFusionEngine().fuse(synchronized, policies)
    expect(output.dataset.channels.get('altitude')?.samples).toHaveLength(1)
    expect(output.dataset.channels.get('altitude')?.samples[0]?.value).not.toBe(110)
    expect(output.report.decisions[0]?.reason).toMatch(/Refuser/)
  })
})

