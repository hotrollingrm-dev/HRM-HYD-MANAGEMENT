/* HRM Hydraulic phone page: works without signal (opens from cache, readings wait in the phone's queue) */
var CACHE = 'hrm-mobile-v10';
var FILES = ['./', 'index.html', 'config.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'fonts/chakra-petch-thai-600-normal.woff2', 'fonts/chakra-petch-latin-600-normal.woff2', 'fonts/chakra-petch-thai-700-normal.woff2', 'fonts/chakra-petch-latin-700-normal.woff2', 'fonts/ibm-plex-sans-thai-thai-400-normal.woff2', 'fonts/ibm-plex-sans-thai-latin-400-normal.woff2', 'fonts/ibm-plex-sans-thai-thai-600-normal.woff2', 'fonts/ibm-plex-sans-thai-latin-600-normal.woff2'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
/* own files: network first (updates show at once), cache when offline; Google calls are never cached */
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin) return;
  e.respondWith(fetch(e.request).then(function (r) {
    var copy = r.clone();
    caches.open(CACHE).then(function (c) { c.put(u.pathname.endsWith('/') ? './' : e.request, copy); });
    return r;
  }).catch(function () {
    return caches.match(e.request, { ignoreSearch: true }).then(function (r) { return r || caches.match('./'); });
  }));
});
