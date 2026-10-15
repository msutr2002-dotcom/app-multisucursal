/* Service worker de arranque frío — SOLO producción.
 * Este archivo es una PLANTILLA: vite.config.mjs (plugin "generar-sw") lo copia a
 * build/sw.js inyectando el id de cache y el manifiesto de archivos del build. */
/* global __ASSETS__ */
const CACHE = '__CACHE__'
const ASSETS = __ASSETS__

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        fetch('./index.html', { cache: 'reload' })
          .then((respuesta) => {
            const copia = respuesta.clone()
            return cache.put('./index.html', respuesta).then(() => copia.text())
          })
          .then((html) => {
            const referencias = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
              .map((m) => m[1])
              .filter((u) => !/^(https?:|data:|#|mailto:|javascript:)/.test(u))
            // addAll rechaza duplicados: deduplicar sobre la URL ABSOLUTA resuelta
            const absolutas = [
              ...new Set(
                ['./', ...ASSETS, ...referencias].map((u) => new URL(u, self.location.href).href),
              ),
            ]
            return cache.addAll(absolutas.map((u) => new Request(u, { cache: 'reload' })))
          }),
      )
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nombres) =>
        Promise.all(nombres.filter((nombre) => nombre !== CACHE).map((n) => caches.delete(n))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (evento) => {
  const solicitud = evento.request
  if (solicitud.method !== 'GET') return
  const url = new URL(solicitud.url)
  if (url.origin !== self.location.origin) return

  if (solicitud.mode === 'navigate') {
    evento.respondWith(
      fetch(solicitud)
        .then((respuesta) => {
          const copia = respuesta.clone()
          caches.open(CACHE).then((cache) => cache.put(solicitud, copia))
          return respuesta
        })
        .catch(async () => {
          const cacheada = await caches.match(solicitud)
          if (cacheada) return cacheada
          const shell = await caches.match('./index.html')
          return shell || Response.error()
        }),
    )
    return
  }

  evento.respondWith(
    caches.match(solicitud).then(
      (cacheada) =>
        cacheada ||
        fetch(solicitud).then((respuesta) => {
          const copia = respuesta.clone()
          caches.open(CACHE).then((cache) => cache.put(solicitud, copia))
          return respuesta
        }),
    ),
  )
})
