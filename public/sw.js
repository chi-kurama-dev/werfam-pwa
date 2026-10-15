// App-shell-only cache. No GPS, family, auth, map tile or Supabase responses are cached.
const CACHE = 'werfam-shell-v2-map-fix'
const APP_SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/logo-wordmark.webp', '/logo-emblem.webp']
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return
  const url = new URL(req.url)
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/')))
    return
  }
  if (/\.(js|css)$/.test(url.pathname)) {
    // Fetch current build files first. Offline falls back to cached assets.
    event.respondWith(fetch(req).then(response => {
      if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(req,copy))}
      return response
    }).catch(()=>caches.match(req)))
    return
  }
  if (/\.(png|webp|svg|woff2?|webmanifest)$/.test(url.pathname)) {
    event.respondWith(caches.match(req).then(cached => cached || fetch(req).then(response => {
      if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(req, copy)) }
      return response
    })))
  }
})
