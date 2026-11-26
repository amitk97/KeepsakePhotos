// Offline support. Keeps a copy of the page so it opens even with a weak signal at the venue.
// Paths are relative to this file, so it works at a site's root or in a sub-folder (GitHub Pages).
// Pages and code: network first (updates arrive straight away), saved copy if offline.
// Fonts are part of the saved copy. Portrait requests (/api/) are never cached.

const CACHE = "keepsake-v37";
const SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./css/fonts.css",
  "./fonts/cormorant-garamond.woff",
  "./fonts/cormorant-garamond-italic.woff",
  "./fonts/plus-jakarta-sans.woff",
  "./fonts/noto-serif-gujarati.woff",
  "./fonts/noto-serif-devanagari.woff",
  "./favicon.svg",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./js/ai/huggingFace.js",
  "./js/ai/spaces.js",
  "./js/ai/styles.js",
  "./js/config.js",
  "./js/flows/form.js",
  "./js/flows/navigation.js",
  "./js/flows/photoInput.js",
  "./js/flows/portrait.js",
  "./js/i18n/index.js",
  "./js/i18n/strings.js",
  "./js/main.js",
  "./js/media/camera.js",
  "./js/media/photo.js",
  "./js/media/photoCheck.js",
  "./js/portrait/compose.js",
  "./js/portrait/shapes.js",
  "./js/portrait/text.js",
  "./js/portrait/tint.js",
  "./js/services/api.js",
  "./js/services/drafts.js",
  "./js/services/share.js",
  "./js/services/siteSettings.js",
  "./js/services/todayCount.js",
  "./js/state.js",
  "./js/ui/backgrounds.js",
  "./js/ui/bigText.js",
  "./js/ui/compare.js",
  "./js/ui/langSwitch.js",
  "./js/ui/todayCount.js",
  "./js/ui/design.js",
  "./js/ui/dom.js",
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
    return (await cache.match(request, { ignoreSearch: true })) || (await cache.match("./")) || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.includes("/api/") || url.pathname.includes("/admin")) return;
    event.respondWith(networkFirst(request));
  }
});
