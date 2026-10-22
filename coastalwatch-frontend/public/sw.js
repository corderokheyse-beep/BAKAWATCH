/*
 * BAKAWATCH service worker.
 *
 * Strategy:
 *  - Navigation requests: network-first, fall back to cached shell when offline.
 *  - Static assets (same-origin GET): stale-while-revalidate.
 *  - API requests are NOT intercepted — offline writes are handled by the
 *    IndexedDB draft queue in the app (lib/offline-queue.ts), not by the SW,
 *    so that submissions are only sent once connectivity is confirmed.
 */
const CACHE = 'bakawatch-v2'
const SHELL = ['/', '/manifest.webmanifest', '/images/logo.png',
  '/images/pwa-192.png', '/images/pwa-512.png', '/images/pwa-maskable-512.png',
  '/images/apple-touch-icon.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Never handle cross-origin (e.g. API on :8000) or API paths.
  if (url.origin !== self.location.origin) return

  // Navigation: network-first with cached shell fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {})
          return res
        })
        .catch(() => caches.match(request).then((r) => r || caches.match('/')))
    )
    return
  }

  // Static same-origin assets: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {})
          return res
        })
        .catch(() => cached)
      return cached || network
    })
  )
})
