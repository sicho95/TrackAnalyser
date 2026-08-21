import { describe, expect, it } from 'vitest'
import { participant, session } from '../../../tests/helpers'
import { sessionsEligibleForImport, validateImportTarget } from './pipeline'

describe('isolation multi-participant', () => {
  const damien = participant('damien')
  const claire = participant('claire')
  const sameTrackDamien = session('session-damien', damien.id)
  const sameTrackClaire = session('session-claire', claire.id)

  it('ne recherche les sessions qu’après le choix du participant', () => {
    expect(() => sessionsEligibleForImport('', [sameTrackDamien, sameTrackClaire])).toThrow(/participant/i)
    expect(sessionsEligibleForImport(damien.id, [sameTrackDamien, sameTrackClaire])).toEqual([sameTrackDamien])
  })

  it('interdit la fusion vers une session similaire d’un autre participant', () => {
    expect(() =>
      validateImportTarget(
        { participantId: damien.id, sessionId: sameTrackClaire.id, createSession: false },
        [damien, claire],
        [sameTrackDamien, sameTrackClaire],
      ),
    ).toThrow(/autre participant/i)
  })
})

