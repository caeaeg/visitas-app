const CACHE_NAME = 'visitas-v1';

// Instalar el Service Worker
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

// Activar el Service Worker
self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

// Escuchar peticiones (Requisito para PWA)
self.addEventListener('fetch', (e) => {
  // Estrategia básica: va directo a la red
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
