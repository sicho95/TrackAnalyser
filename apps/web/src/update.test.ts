import { describe, expect, it } from 'vitest'
import { canActivateUpdate } from './update-policy'

describe('activation PWA contrôlée', () => {
  it('interdit le remplacement pendant une session active', () => {
    expect(canActivateUpdate('session-active')).toBe(false)
    expect(canActivateUpdate(undefined)).toBe(true)
  })
})
