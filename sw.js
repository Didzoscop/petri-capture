// Service worker : rend l'app installable et utilisable hors connexion.
// La page est cherchée d'abord sur le réseau (mises à jour immédiates), sinon dans le cache ;
// les bibliothèques et polices (adresses versionnées) sont servies depuis le cache.
const CACHE = 'petri-capture-v7';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './fonts/ByteBounce.ttf', './mascot.js', './demo.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate' || url.origin === location.origin){
    e.respondWith(fetch(req.mode === 'navigate' ? req.url : req, { cache:'no-cache' }).then(res => { // toujours revalidé : les mises à jour arrivent tout de suite
      if (res.ok){ const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok || res.type === 'opaque'){ const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});
