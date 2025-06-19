const CACHE_NAME = "nexbudge-cache-v2"; // Version mise à jour
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/assets/css/style.css",
  "/assets/fonts/montserrat-v30-latin-regular.woff2",
  "/assets/fonts/montserrat-v30-latin-500.woff2",
  "/assets/fonts/montserrat-v30-latin-700.woff2",
  "/assets/img/logo-nexbudge-white.svg",
  "/assets/img/logo-nexbudge-white-no-text.svg",
  "/assets/img/logo-nexbudge-blue-no-text.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Caching assets...");
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log("Deleting old cache:", cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return (
        response ||
        fetch(event.request).catch(() => {
          console.error("Fetch failed for:", event.request.url);
        })
      );
    })
  );
});
