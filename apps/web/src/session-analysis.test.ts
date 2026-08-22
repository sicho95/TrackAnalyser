import type { RawDataReference } from '@track-analyser/domain'
import { describe, expect, it } from 'vitest'
import { session } from '../../../tests/helpers'
import { needsInitialAnalysis } from './session-analysis'

const raw: RawDataReference = {
  id: 'raw', sessionId: 'session', sourceId: 'phone', storage: 'INDEXED_DB', path: 'raw', mediaType: 'application/x-ndjson',
  byteLength: 10, sha256: 'sha', chunkCount: 1, immutable: true, createdAt: '2026-08-22T00:00:00.000Z',
}

describe('reprise des analyses initiales', () => {
  it('reprend une analyse absente, en attente ou interrompue après sauvegarde du RAW', () => {
    const saved = { ...session('session', 'damien'), rawDataReferences: [raw] }
    expect(needsInitialAnalysis(saved)).toBe(true)
    expect(needsInitialAnalysis({ ...saved, analysisStatus: 'PENDING' })).toBe(true)
    expect(needsInitialAnalysis({ ...saved, analysisStatus: 'RUNNING' })).toBe(true)
  })

  it('ne relance ni un échec explicite ni une Session déjà analysée ou non finalisée', () => {
    const saved = { ...session('session', 'damien'), rawDataReferences: [raw] }
    expect(needsInitialAnalysis({ ...saved, analysisStatus: 'FAILED' })).toBe(false)
    expect(needsInitialAnalysis({ ...saved, latestAnalysisRunId: 'run' })).toBe(false)
    expect(needsInitialAnalysis({ ...saved, status: 'INTERRUPTED' })).toBe(false)
  })
})
