// Offline support. Keeps a copy of the page so it opens even with no signal at the venue;
// with no connection the guest still gets the free on-phone watercolour.
// Pages and code: network first (updates arrive straight away), saved copy if offline.
// Fonts: saved copy first. Portrait requests (/api/) are never cached.

const CACHE = "keepsake-v3";
const SHELL = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/favicon.svg",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/js/main.js",
  "/js/config.js",
  "/js/state.js",
  "/js/ui.js",
  "/js/storage.js",
  "/js/camera.js",
  "/js/photo.js",
  "/js/api.js",
  "/js/share.js",
  "/js/compare.js",
  "/js/design.js",
  "/js/settings.js",
  "/js/i18n/index.js",
  "/js/i18n/strings.js",
  "/js/portrait/compose.js",
  "/js/portrait/shapes.js",
  "/js/portrait/text.js",
  "/js/sketch/watercolor.js",
];
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request, { ignoreSearch: true })) || (await cache.match("/")) || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const response = await fetch(request);
    if (response.ok || response.type === "opaque") cache.put(request, response.clone());
    return response;
  } catch {
    return Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin")) return;
    event.respondWith(networkFirst(request));
  } else if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request));
  }
});
