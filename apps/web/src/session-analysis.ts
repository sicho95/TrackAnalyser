import type { Session } from '@track-analyser/domain'

export function needsInitialAnalysis(session: Session, analysisVersion: string): boolean {
  return session.status === 'COMPLETED'
    && session.rawDataReferences.length > 0
    && session.latestAnalysisRunId === undefined
    && (session.analysisStatus !== 'FAILED' || session.analysisAttemptVersion !== analysisVersion)
}
