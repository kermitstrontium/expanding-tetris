/* Expanding Tetris service worker. Network-first with cache fallback, so the game
   works offline once loaded but always picks up a new deploy when online.

   BUILD is stamped by deploy.sh. It must change on every deploy: browsers
   only reinstall a service worker when this file's bytes change. */

const BUILD = '20261019-085027';
const CACHE = 'expanding-tetris-' + BUILD;

const ASSETS = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './js/main.js', './js/core.js', './js/render.js', './js/audio.js', './js/input.js',
  './js/themes/index.js', './js/themes/painters.js', './js/themes/classic.js',
  './js/themes/gameboy.js', './js/themes/neon.js', './js/themes/paper.js',
  './js/music/tracks.js', './js/music/notation.js', './js/music/korobeiniki.js',
  './js/music/bach.js', './js/music/bach.tracks.js', './js/music/typeb.js', './js/music/typeb.data.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'no-store' }))))
      .catch(() => {})
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-store' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
  );
});
