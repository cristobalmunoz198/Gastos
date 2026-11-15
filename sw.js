/* sw.js — guarda la app en el iPhone para que abra al instante y sin internet.
 * Estrategia: responde desde lo guardado y, por detrás, baja la versión nueva
 * (la próxima vez que abras ya verás la actualización).
 * Las llamadas a Google (script.google.com) NO pasan por aquí: siempre van a la red.
 */
const CACHE = 'gastos-v1';
const ARCHIVOS = ['./', 'index.html', 'app.css', 'app.js', 'calculos.js', 'manifest.webmanifest', 'icon-180.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const clave = req.mode === 'navigate' ? 'index.html' : req;
  e.respondWith(caches.open(CACHE).then(cache =>
    cache.match(clave, { ignoreSearch: true }).then(guardado => {
      const red = fetch(req).then(resp => {
        if (resp && resp.ok) cache.put(clave, resp.clone());
        return resp;
      }).catch(() => guardado);
      return guardado || red;
    })
  ));
});
