/// <reference lib="webworker" />
import { clientsClaim, type WorkboxPlugin } from 'workbox-core'
import { ExpirationPlugin } from 'workbox-expiration'
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: { url: string; revision?: string }[] }

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
clientsClaim()

registerRoute(
  ({ url }) => url.hostname.endsWith('tile.openstreetmap.org') || url.hostname === 'tile.opentopomap.org',
  new CacheFirst({
    cacheName: `track-analyser-map-tiles-${__BUILD_ID__}`,
    plugins: [new ExpirationPlugin({ maxEntries: 600, maxAgeSeconds: 7 * 24 * 60 * 60, purgeOnQuotaError: true }) as unknown as WorkboxPlugin],
  }),
)

registerRoute(
  ({ request }) => request.destination === 'document',
  new StaleWhileRevalidate({ cacheName: `track-analyser-pages-${__BUILD_ID__}` }),
)

self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | undefined)?.type === 'SKIP_WAITING') void self.skipWaiting()
})
