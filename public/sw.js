// Service worker de l'ERP OA Metal (PWA).
// - Les fichiers de l'application (JS, CSS, polices, icônes) sont mis en cache pour un démarrage rapide.
// - Les pages : réseau d'abord, la dernière version en cache si le réseau est coupé.
// - Les données (Supabase) ne sont JAMAIS mises en cache : elles viennent toujours du serveur.
const VERSION = 'oa-erp-v1'
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // Supabase, CDN… : toujours le réseau

  // Navigation : réseau d'abord, sinon l'application en cache (fonctionne hors ligne pour l'affichage)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(VERSION).then((c) => c.put('/', copy))
          return res
        })
        .catch(() => caches.match('/').then((r) => r || new Response('Hors ligne', { status: 503 }))),
    )
    return
  }

  // Fichiers versionnés (assets Vite, polices, icônes) : cache d'abord
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || /\.(woff2?|png|svg|ico|webmanifest)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(VERSION).then((c) => c.put(req, copy))
            }
            return res
          }),
      ),
    )
  }
})
