// Service Worker for BPM Pro PWA
// Version 4.0 - Offline-first caching strategy

const CACHE_NAME = 'bpm-pro-v4.0';
const RUNTIME_CACHE = 'bpm-pro-runtime-v4.0';

// Files to cache on install
const PRECACHE_URLS = [
  '/index.html',
  '/style.css',
  '/tutorial.html',
  '/versions.html',
  '/sc-737.html',
  '/sc-a333.html',
  '/sc-a332.html',
  '/sc-a339.html',
  '/sc-a359.html',
  '/sc-a350.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Install event - cache all static resources
self.addEventListener('install', event => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
    .then(cache => {
      console.log('[SW] Caching app shell');
      return cache.addAll(PRECACHE_URLS);
    })
    .then(() => {
      console.log('[SW] Installation complete');
      return self.skipWaiting(); // Activate immediately
    })
    .catch(error => {
      console.error('[SW] Installation failed:', error);
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activating service worker...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
        .filter(cacheName => {
          // Delete old caches
          return cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE;
        })
        .map(cacheName => {
          console.log('[SW] Deleting old cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    })
    .then(() => {
      console.log('[SW] Activation complete');
      return self.clients.claim(); // Take control immediately
    })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }
  
  // Skip chrome-extension and other non-http(s) requests
  if (!request.url.startsWith('http')) {
    return;
  }
  
  event.respondWith(
    caches.match(request)
    .then(cachedResponse => {
      // Return cached response if found
      if (cachedResponse) {
        console.log('[SW] Serving from cache:', request.url);
        return cachedResponse;
      }
      
      // Otherwise fetch from network
      console.log('[SW] Fetching from network:', request.url);
      return fetch(request)
        .then(response => {
          // Don't cache non-successful responses
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }
          
          // Clone the response
          const responseToCache = response.clone();
          
          // Cache the fetched response for runtime
          caches.open(RUNTIME_CACHE)
            .then(cache => {
              cache.put(request, responseToCache);
            });
          
          return response;
        })
        .catch(error => {
          console.error('[SW] Fetch failed:', error);
          
          // Return offline fallback page if available
          return caches.match('/index.html');
        });
    })
  );
});

// Message event - handle messages from clients
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(RUNTIME_CACHE)
      .then(cache => cache.addAll(event.data.urls))
    );
  }
});

// Push notification event (future feature)
self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : 'New update available',
    icon: '/icon-192.png',
    badge: '/icon-72.png',
    vibrate: [200, 100, 200]
  };
  
  event.waitUntil(
    self.registration.showNotification('BPM Pro Update', options)
  );
});

// Background sync event (future feature)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-reports') {
    event.waitUntil(syncReports());
  }
});

async function syncReports() {
  // Future: Sync saved reports when back online
  console.log('[SW] Syncing reports...');
}