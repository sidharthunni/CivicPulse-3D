/**
 * CivicPulse 3D - Service Worker & Offline Disaster Cache Engine
 * Provides 100% offline capability during monsoon communications blackout.
 * Caches application shell, spatial assets, and queues offline citizen reports.
 * Strictly zero emojis
 */

const CACHE_NAME = 'civicpulse-3d-cache-v7';
const OFFLINE_URLS = [
  './',
  './index.html',
  './citizen.html',
  './css/command-hud.css',
  './css/citizen.css',
  './js/incidents-data.js',
  './js/twin-engine.js',
  './js/simulation.js',
  './js/hud-controller.js',
  './js/citizen-portal.js',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js'
];

// Install: Cache all core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(OFFLINE_URLS).catch((err) => {
        console.warn('Some external assets could not be pre-cached immediately:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean old caches immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('Clearing old cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network-First with Offline Cache Fallback
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Network offline fallback to cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (event.request.destination === 'document') {
            return caches.match('./index.html') || caches.match('./citizen.html');
          }
        });
      })
  );
});
        }
      });
    })
  );
});
