const CACHE_NAME = 'caisse-musique-v2';

// Fichiers et librairies CDN indispensables
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
];

// 1. Installation du Service Worker et mise en cache initiale
self.addEventListener('install', (e) => {
  self.skipWaiting(); // Prise de contrôle immédiate
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 PWA : Mise en cache des ressources V2...');
      return cache.addAll(ASSETS);
    })
  );
});

// 2. Activation et nettoyage forcé des anciens caches (v1)
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('🧹 PWA : Suppression de l ancien cache :', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Stratégie Network-First (Réseau d'abord, puis secours sur le Cache)
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  // Ignorer la synchronisation interne Firestore
  if (e.request.url.includes('firestore.googleapis.com') || e.request.url.includes('google.com')) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((networkResponse) => {
        // Si le réseau répond, on met à jour le cache et on retourne la réponse fraîche
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // En cas de coupure réseau, on sert le fichier depuis le cache local
        return caches.match(e.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (e.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./index.html');
          }
        });
      })
  );
});
