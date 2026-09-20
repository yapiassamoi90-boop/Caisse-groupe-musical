const CACHE_NAME = 'caisse-musique-v1';

// Liste complète des fichiers et scripts externes à mettre en cache
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  // SDKs Firebase (indispensables en hors-ligne)
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js',
  // Librairies QR Code
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
];

// 1. Installation du Service Worker et mise en cache des fichiers
self.addEventListener('install', (e) => {
  self.skipWaiting(); // Activation immédiate
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 Mise en cache des ressources de la PWA...');
      return cache.addAll(ASSETS);
    })
  );
});

// 2. Activation et nettoyage des anciens caches (lors d'une mise à jour)
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
  // Ignorer les requêtes internes Firestore/Firebase (elles gèrent leur propre cache hors-ligne)
  if (e.request.url.includes('firestore.googleapis.com') || e.request.url.includes('google.com')) {
    return;
  }

  // Stratégie : Servir le cache si disponible, sinon aller sur le réseau
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request);
    })
  );
});
