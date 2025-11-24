const CACHE_NAME = 'pary-mvp-v21';
const ASSETS = [
  '/pary-mvp/',
  '/pary-mvp/index.html',
  '/pary-mvp/trio-challenge.html',
  '/pary-mvp/trio-challenge-room.html',
  '/pary-mvp/trio-challenge-waiting.html',
  '/pary-mvp/trio-challenge-board.html',
  '/pary-mvp/zdrapka-pozycji.html',
  '/pary-mvp/zdrapka-pozycji-play.html',
  '/pary-mvp/pozycje-na-czas.html',
  '/pary-mvp/pozycje-na-czas-play.html',
  '/pary-mvp/niegrzeczne-kolo.html',
  '/pary-mvp/niegrzeczne-kolo-play.html',
  '/pary-mvp/5-7-10.html',
  '/pary-mvp/5-7-10-room.html',
  '/pary-mvp/pytania-dla-par.html',
  '/pary-mvp/jak-dobrze-mnie-znasz.html',
  '/pary-mvp/plan-wieczoru.html',
  '/pary-mvp/plan-wieczoru-room.html',
  '/pary-mvp/plan-wieczoru-play.html',
  '/pary-mvp/room.html',
  '/pary-mvp/room-waiting.html',
  '/pary-mvp/room-invite.html',
  '/pary-mvp/nigdy-przenigdy.html',
  '/pary-mvp/nigdy-przenigdy-room.html',
  '/pary-mvp/nigdy-przenigdy-waiting.html',
  '/pary-mvp/jak-dobrze-mnie-znasz-room.html',
  '/pary-mvp/jak-dobrze-mnie-znasz-waiting.html',
  '/pary-mvp/admin-import.html',
  '/pary-mvp/assets/css/style.css',
  '/pary-mvp/assets/js/app.js',
  '/pary-mvp/assets/js/plan-wieczoru.js',
  '/pary-mvp/assets/js/room.js',
  '/pary-mvp/assets/js/invite.js',
  '/pary-mvp/assets/js/waiting-room.js',
  '/pary-mvp/assets/js/trio-challenge.js',
  '/pary-mvp/assets/js/import.js',
  '/pary-mvp/assets/js/zdrapka-pozycji.js',
  '/pary-mvp/assets/js/pozycje-na-czas.js',
  '/pary-mvp/assets/js/niegrzeczne-kolo.js',
  '/pary-mvp/assets/js/sekundy.js',
  '/pary-mvp/data/questions.json',
  '/pary-mvp/data/nigdy-przenigdy.json',
  '/pary-mvp/data/jak-dobrze-mnie-znasz.json',
  '/pary-mvp/assets/data/plan-wieczoru.json',
  '/pary-mvp/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(request)
        .then((response) => {
          const clone = response.clone();
          if (response.ok && request.url.startsWith(self.location.origin)) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          if (request.destination === 'document') {
            return caches.match('/pary-mvp/index.html');
          }
          return new Response(
            JSON.stringify({
              ok: false,
              error: 'Brak połączenia. Synchronizacja odpowiedzi wymaga dostępu do internetu.',
            }),
            {
              headers: { 'Content-Type': 'application/json; charset=utf-8' },
            }
          );
        });
    })
  );
});
