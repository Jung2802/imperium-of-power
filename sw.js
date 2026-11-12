// Offline-Speicher: Beim ersten Öffnen wird alles geladen, danach läuft das Spiel ohne Internet.
const VERSION = 'imperium-v1';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/ui.js', 'js/engine.js', 'js/ai.js', 'js/config.js', 'js/audio.js', 'js/map-data.js',
  'assets/img/legion.webp', 'assets/img/legion-hoch.webp', 'assets/img/kommandant.webp', 'assets/img/kommandant-portrait.webp',
  'assets/img/icon-192.png', 'assets/img/icon-512.png', 'assets/img/icon-maskable-512.png', 'assets/img/apple-touch-icon.png',
  'assets/fonts/cinzel-latin-400-normal.woff2', 'assets/fonts/cinzel-latin-600-normal.woff2', 'assets/fonts/cinzel-latin-700-normal.woff2',
  'assets/fonts/inter-latin-400-normal.woff2', 'assets/fonts/inter-latin-500-normal.woff2', 'assets/fonts/inter-latin-600-normal.woff2',
];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Erst Netz (damit Updates ankommen), sonst Speicher
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
