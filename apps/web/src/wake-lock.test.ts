import { describe, expect, it, vi } from 'vitest'
import { ScreenWakeLockController, type ScreenWakeLockSentinel } from './wake-lock'

class TestSentinel extends EventTarget implements ScreenWakeLockSentinel {
  released = false

  async release(): Promise<void> {
    this.released = true
    this.dispatchEvent(new Event('release'))
  }
}

describe('maintien de l’écran actif', () => {
  it('acquiert, réacquiert après retour visible puis libère le verrou', async () => {
    const sentinels = [new TestSentinel(), new TestSentinel()]
    const firstSentinel = sentinels[0]
    const request = vi.fn(async () => sentinels.shift() ?? new TestSentinel())
    const states: string[] = []
    const controller = new ScreenWakeLockController({ request }, document, (state) => states.push(state))

    await controller.start()
    expect(request).toHaveBeenCalledWith('screen')
    expect(states.at(-1)).toBe('ACTIVE')
    if (firstSentinel === undefined) throw new Error('Sentinelle absente.')
    await firstSentinel.release()
    expect(states.at(-1)).toBe('RELEASED')
    document.dispatchEvent(new Event('visibilitychange'))
    await Promise.resolve()
    expect(request).toHaveBeenCalledTimes(2)
    await controller.stop()
    expect(states.at(-1)).toBe('IDLE')
  })

  it('signale clairement une API indisponible', async () => {
    const onStateChange = vi.fn()
    const controller = new ScreenWakeLockController(undefined, document, onStateChange)
    await controller.start()
    expect(onStateChange).toHaveBeenCalledWith('UNAVAILABLE')
    await controller.stop()
  })
})
