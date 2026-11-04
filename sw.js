/* オフラインで開けるようにする(競馬場で電波が弱くても動く)。更新したら VERSION を上げる。 */
const VERSION = "lh-paddock-v5";
const FILES = ["./", "index.html", "app.js", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request).then((hit) => {
    const net = fetch(e.request).then((res) => { if (res.ok) { const cp = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, cp)); } return res; }).catch(() => hit);
    return hit || net;
  }));
});
