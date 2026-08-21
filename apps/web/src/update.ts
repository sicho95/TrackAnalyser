import { registerSW } from 'virtual:pwa-register'

export interface UpdateController {
  apply(): Promise<void>
}

export function registerControlledUpdate(onReady: (controller: UpdateController) => void): void {
  const update = registerSW({
    immediate: true,
    onNeedRefresh() {
      onReady({ apply: async () => update(true) })
    },
    onRegisteredSW(_url, registration) {
      const check = (): void => {
        if (document.visibilityState === 'visible') void registration?.update()
      }
      document.addEventListener('visibilitychange', check)
    },
  })
}
