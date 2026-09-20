const CACHE_NAME = 'caisse-musique-v1';

// Liste complète des fichiers et scripts externes à mettre en cache
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  // SDKs Firebase (indispensables en hors-ligne)
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js',
  // Librairies QR Code
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
];

// 1. Installation du Service Worker et mise en cache des fichiers
self.addEventListener('install', (e) => {
  self.skipWaiting(); // Activation immédiate sans attendre la fermeture des onglets
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 Mise en cache des ressources PWA...');
      return cache.addAll(ASSETS);
    })
  );
});

// 2. Activation et nettoyage des anciens caches lors des mises à jour
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('🧹 Suppression de l\'ancien cache :', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Interception des requêtes réseau
self.addEventListener('fetch', (e) => {
  // Ignorer les requêtes qui ne sont pas en GET (ex: POST)
  if (e.request.method !== 'GET') return;

  // Ignorer les requêtes internes Firestore/Firebase (gestion interne du hors-ligne via IndexedDB)
  if (e.request.url.includes('firestore.googleapis.com') || e.request.url.includes('google.com')) {
    return;
  }

  // Stratégie : Servir le cache en priorité, sinon récupérer sur le réseau et sauvegarder
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(e.request).then((networkResponse) => {
        // Ne mettre en cache que les réponses valides
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // Gestion de secours en cas d'absence totale de réseau pour les pages HTML
        if (e.request.headers.get('accept').includes('text/html')) {
          return caches.match('./index.html');
        }
      });
    })
  );
});
