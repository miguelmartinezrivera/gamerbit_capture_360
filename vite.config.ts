import { createHash } from 'node:crypto'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss(), {
    name: 'capture-offline',
    apply: 'build',
    generateBundle(_, bundle) {
      const paths = ['/index.html', ...Object.keys(bundle).filter(name => name !== 'index.html').map(name => '/' + name), '/manifest.webmanifest', '/icon-180.png', '/icon-192.png', '/icon-512.png']
      const version = createHash('sha256').update(JSON.stringify(paths)).digest('hex').slice(0, 16)
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const cacheName = 'capture-360-${version}'
const files = ${JSON.stringify(paths)}
self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(files)))
})
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('capture-360-') && key !== cacheName)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  if (request.mode === 'navigate') {
    event.respondWith(caches.open(cacheName).then(async cache => (await cache.match('/index.html')) || fetch(request)))
  } else if (files.includes(url.pathname)) {
    event.respondWith(caches.open(cacheName).then(async cache => (await cache.match(url.pathname)) || fetch(request)))
  }
})
` })
    },
  }],
  build: { target: 'safari16' },
})

