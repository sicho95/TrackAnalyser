import noSleepMedia from 'nosleep.js/src/media.js'

export type ScreenWakeLockState = 'IDLE' | 'ACTIVE' | 'COMPATIBILITY' | 'RELEASED' | 'UNAVAILABLE' | 'ERROR'

export interface ScreenWakeLockSentinel extends EventTarget {
  readonly released: boolean
  release(): Promise<void>
}

export interface ScreenWakeLockSource {
  request(type: 'screen'): Promise<ScreenWakeLockSentinel>
}

export interface ScreenWakeLockFallback {
  start(): Promise<boolean>
  stop(): void
}

interface StandaloneNavigator extends Navigator {
  readonly standalone?: boolean
}

export class IOSVideoWakeLockFallback implements ScreenWakeLockFallback {
  private readonly video: HTMLVideoElement

  constructor(pageDocument: Document) {
    const video = pageDocument.createElement('video')
    video.title = 'Maintien d’écran TrackAnalyser'
    video.setAttribute('aria-hidden', 'true')
    video.setAttribute('playsinline', '')
    video.preload = 'auto'
    video.disablePictureInPicture = true
    const source = pageDocument.createElement('source')
    source.src = noSleepMedia.mp4
    source.type = 'video/mp4'
    video.append(source)
    video.addEventListener('timeupdate', () => {
      // Revenir dans la plage utile avant la fin afin de conserver la session média iOS.
      if (video.currentTime > 0.5) video.currentTime = 0.1
    })
    this.video = video
  }

  async start(): Promise<boolean> {
    if (!this.video.paused) return true
    try {
      await this.video.play()
      return true
    } catch {
      return false
    }
  }

  stop(): void {
    this.video.pause()
    this.video.currentTime = 0
  }
}

export function createIOSWakeLockFallback(
  pageNavigator: Navigator,
  pageWindow: Window,
  pageDocument: Document,
): ScreenWakeLockFallback | undefined {
  const navigatorWithStandalone = pageNavigator as StandaloneNavigator
  const ios = /iPad|iPhone|iPod/.test(pageNavigator.userAgent)
    || (pageNavigator.platform === 'MacIntel' && pageNavigator.maxTouchPoints > 1)
  const standalone = navigatorWithStandalone.standalone === true
    || pageWindow.matchMedia('(display-mode: standalone)').matches
  return ios && standalone ? new IOSVideoWakeLockFallback(pageDocument) : undefined
}

export class ScreenWakeLockController {
  private sentinel: ScreenWakeLockSentinel | undefined
  private started = false
  private acquiring: Promise<void> | undefined
  private retryTimer: number | undefined
  private fallbackActive = false

  constructor(
    private readonly source: ScreenWakeLockSource | undefined,
    private readonly pageDocument: Document,
    private readonly onStateChange: (state: ScreenWakeLockState) => void,
    private readonly pageWindow: Window = window,
    private readonly fallback?: ScreenWakeLockFallback,
  ) {}

  async start(): Promise<void> {
    if (!this.started) {
      this.started = true
      this.pageDocument.addEventListener('visibilitychange', this.handleVisibilityChange)
      this.pageWindow.addEventListener('focus', this.handlePageActive)
      this.pageWindow.addEventListener('pageshow', this.handlePageActive)
    }
    // Démarrer le repli dans le geste utilisateur requis par iOS avant toute attente asynchrone.
    const fallbackStart = this.startFallback()
    const nativeStart = this.acquire()
    await Promise.all([fallbackStart, nativeStart])
  }

  async stop(): Promise<void> {
    this.started = false
    this.clearRetry()
    this.pageDocument.removeEventListener('visibilitychange', this.handleVisibilityChange)
    this.pageWindow.removeEventListener('focus', this.handlePageActive)
    this.pageWindow.removeEventListener('pageshow', this.handlePageActive)
    this.fallback?.stop()
    this.fallbackActive = false
    const current = this.sentinel
    this.sentinel = undefined
    if (current !== undefined && !current.released) await current.release()
    this.onStateChange('IDLE')
  }

  private async startFallback(): Promise<void> {
    if (!this.started || this.fallback === undefined) return
    this.fallbackActive = await this.fallback.start()
    if (this.started && this.sentinel === undefined) this.emitDegradedState()
  }

  private async acquire(): Promise<void> {
    if (this.acquiring !== undefined) return this.acquiring
    const pending = this.performAcquire()
    this.acquiring = pending
    try {
      await pending
    } finally {
      if (this.acquiring === pending) this.acquiring = undefined
    }
  }

  private async performAcquire(): Promise<void> {
    if (!this.started || this.pageDocument.visibilityState !== 'visible') return
    this.clearRetry()
    if (this.source === undefined) {
      this.emitDegradedState('UNAVAILABLE')
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
      this.emitDegradedState('ERROR')
      this.scheduleRetry()
    }
  }

  private emitDegradedState(withoutFallback: ScreenWakeLockState = 'RELEASED'): void {
    this.onStateChange(this.fallbackActive ? 'COMPATIBILITY' : withoutFallback)
  }

  private scheduleRetry(delay = 1_000): void {
    if (!this.started || this.retryTimer !== undefined || this.pageDocument.visibilityState !== 'visible') return
    this.retryTimer = this.pageWindow.setTimeout(() => {
      this.retryTimer = undefined
      void this.startFallback()
      void this.acquire()
    }, delay)
  }

  private clearRetry(): void {
    if (this.retryTimer === undefined) return
    this.pageWindow.clearTimeout(this.retryTimer)
    this.retryTimer = undefined
  }

  private readonly handleRelease = (): void => {
    this.sentinel = undefined
    if (!this.started) return
    this.emitDegradedState()
    this.scheduleRetry()
  }

  private readonly handleVisibilityChange = (): void => {
    if (this.pageDocument.visibilityState === 'visible') this.handlePageActive()
  }

  private readonly handlePageActive = (): void => {
    if (!this.started) return
    void this.startFallback()
    void this.acquire()
  }
}
