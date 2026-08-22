import { useEffect, useState } from 'react'

export type ScreenWakeLockState = 'IDLE' | 'ACTIVE' | 'RELEASED' | 'UNAVAILABLE' | 'ERROR'

export interface ScreenWakeLockSentinel extends EventTarget {
  readonly released: boolean
  release(): Promise<void>
}

export interface ScreenWakeLockSource {
  request(type: 'screen'): Promise<ScreenWakeLockSentinel>
}

export class ScreenWakeLockController {
  private sentinel: ScreenWakeLockSentinel | undefined
  private started = false

  constructor(
    private readonly source: ScreenWakeLockSource | undefined,
    private readonly pageDocument: Document,
    private readonly onStateChange: (state: ScreenWakeLockState) => void,
  ) {}

  async start(): Promise<void> {
    if (this.started) return
    this.started = true
    this.pageDocument.addEventListener('visibilitychange', this.handleVisibilityChange)
    await this.acquire()
  }

  async stop(): Promise<void> {
    this.started = false
    this.pageDocument.removeEventListener('visibilitychange', this.handleVisibilityChange)
    const current = this.sentinel
    this.sentinel = undefined
    if (current !== undefined && !current.released) await current.release()
    this.onStateChange('IDLE')
  }

  private async acquire(): Promise<void> {
    if (!this.started || this.pageDocument.visibilityState !== 'visible') return
    if (this.source === undefined) {
      this.onStateChange('UNAVAILABLE')
      return
    }
    if (this.sentinel !== undefined && !this.sentinel.released) return
    try {
      const sentinel = await this.source.request('screen')
      if (!this.started) {
        await sentinel.release()
        return
      }
      this.sentinel = sentinel
      sentinel.addEventListener('release', this.handleRelease, { once: true })
      this.onStateChange('ACTIVE')
    } catch {
      this.onStateChange('ERROR')
    }
  }

  private readonly handleRelease = (): void => {
    this.sentinel = undefined
    if (this.started) this.onStateChange('RELEASED')
  }

  private readonly handleVisibilityChange = (): void => {
    if (this.pageDocument.visibilityState === 'visible') void this.acquire()
  }
}

export function useScreenWakeLock(enabled: boolean): ScreenWakeLockState {
  const [state, setState] = useState<ScreenWakeLockState>('IDLE')
  useEffect(() => {
    if (!enabled) {
      setState('IDLE')
      return
    }
    const wakeLock = 'wakeLock' in navigator ? navigator.wakeLock as ScreenWakeLockSource : undefined
    const controller = new ScreenWakeLockController(wakeLock, document, setState)
    void controller.start()
    return () => { void controller.stop() }
  }, [enabled])
  return state
}
