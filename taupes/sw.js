/*
 * Cache hors ligne. La page elle-même passe par le réseau d'abord : sans cela,
 * un joueur qui a ouvert le jeu une fois resterait sur cette version pour
 * toujours, et une correction ne lui parviendrait jamais. Le cache ne sert
 * qu'en secours, quand le réseau ne répond pas.
 */
const CACHE = 'taupes-v1';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function aJour(req) {
  return fetch(req).then((res) => {
    if (res && res.ok) {
      const copie = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copie)).catch(() => {});
    }
    return res;
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // La page : réseau d'abord, cache en secours.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(aJour(req).catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))));
    return;
  }

  // Le reste : cache d'abord, mais rafraîchi en arrière-plan.
  event.respondWith(
    caches.match(req).then((hit) => {
      const reseau = aJour(req).catch(() => hit);
      return hit || reseau;
    })
  );
});
