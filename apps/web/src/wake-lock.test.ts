import { describe, expect, it, vi } from 'vitest'
import { ScreenWakeLockController, type ScreenWakeLockFallback, type ScreenWakeLockSentinel } from './wake-lock'

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

  it('retente automatiquement après une libération alors que la page reste visible', async () => {
    vi.useFakeTimers()
    try {
      const sentinels = [new TestSentinel(), new TestSentinel()]
      const firstSentinel = sentinels[0]
      const request = vi.fn(async () => sentinels.shift() ?? new TestSentinel())
      const controller = new ScreenWakeLockController({ request }, document, () => undefined)

      await controller.start()
      if (firstSentinel === undefined) throw new Error('Sentinelle absente.')
      await firstSentinel.release()
      await vi.advanceTimersByTimeAsync(1_000)

      expect(request).toHaveBeenCalledTimes(2)
      await controller.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('maintient le mode de compatibilité iOS lorsque le verrou natif est indisponible', async () => {
    const states: string[] = []
    const fallback: ScreenWakeLockFallback = {
      start: vi.fn(async () => true),
      stop: vi.fn(),
    }
    const controller = new ScreenWakeLockController(undefined, document, (state) => states.push(state), window, fallback)

    await controller.start()
    expect(fallback.start).toHaveBeenCalledOnce()
    expect(states.at(-1)).toBe('COMPATIBILITY')
    await controller.stop()
    expect(fallback.stop).toHaveBeenCalledOnce()
  })
})
