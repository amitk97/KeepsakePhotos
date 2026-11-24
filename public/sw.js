// Offline support. Keeps a copy of the page so it opens even with no signal at the venue;
// with no connection the guest still gets the free on-phone watercolour.
// Pages and code: network first (updates arrive straight away), saved copy if offline.
// Fonts are part of the saved copy. Portrait requests (/api/) are never cached.

const CACHE = "keepsake-v5";
const SHELL = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/css/fonts.css",
  "/fonts/cormorant-garamond.woff",
  "/fonts/cormorant-garamond-italic.woff",
  "/fonts/plus-jakarta-sans.woff",
  "/fonts/noto-serif-gujarati.woff",
  "/fonts/noto-serif-devanagari.woff",
  "/favicon.svg",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/js/main.js",
  "/js/config.js",
  "/js/state.js",
  "/js/ui/dom.js",
  "/js/services/drafts.js",
  "/js/media/camera.js",
  "/js/media/photo.js",
  "/js/services/api.js",
  "/js/services/share.js",
  "/js/ui/compare.js",
  "/js/ui/design.js",
  "/js/services/siteSettings.js",
  "/js/i18n/index.js",
  "/js/i18n/strings.js",
  "/js/portrait/compose.js",
  "/js/portrait/shapes.js",
  "/js/portrait/text.js",
  "/js/fallback/watercolour.js",
  "/js/flows/navigation.js",
  "/js/flows/photoInput.js",
  "/js/flows/portrait.js",
  "/js/flows/form.js",
];

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

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin")) return;
    event.respondWith(networkFirst(request));
  }
});
