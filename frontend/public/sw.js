// Service Worker minimal : permet de recharger l'application hors connexion une fois qu'elle a été chargée en ligne.
// Ne met PAS en cache l'API (les données sont gérées par src/api.js : cache + file d'attente).
const V = "ae-shell-v1";
self.addEventListener("install", (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(["/", "/index.html"]))); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return; // API (autre origine) : non interceptée
  if (r.mode === "navigate") { // navigation : réseau d'abord, coquille de l'application en secours
    e.respondWith(fetch(r).then((x) => { caches.open(V).then((c) => c.put("/index.html", x.clone())); return x; }).catch(() => caches.match("/index.html")));
    return;
  }
  e.respondWith(caches.match(r).then((hit) => hit || fetch(r).then((x) => { if (x.ok) caches.open(V).then((c) => c.put(r, x.clone())); return x; })));
});
