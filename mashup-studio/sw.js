const VERSION = 'mashup-v1';
const CORE = [
  './', './index.html', './manifest.webmanifest',
  './css/style.css',
  './js/main.js', './js/ui.js', './js/state.js', './js/audio.js',
  './js/timeline.js', './js/waveform.js', './js/bpm.js',
  './js/export.js', './js/tempo.js', './js/mp3.js', './js/project.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => hit))
  );
});