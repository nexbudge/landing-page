// Cache version is driven by the query string on the SW URL.
// Example: /service-worker.js?v=<hash>
// Use self.location.href to avoid any issues with WorkerLocation being passed to URL()
const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE_NAME = `nexbudge-cache-${VERSION}`;

const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/assets/css/style.css",
  "/assets/js/register-sw.js",
  "/assets/js/year.js",
  "/assets/fonts/montserrat-v30-latin-regular.woff2",
  "/assets/fonts/montserrat-v30-latin-500.woff2",
  "/assets/fonts/montserrat-v30-latin-700.woff2",
  "/assets/img/logo-nexbudge-white.svg",
  "/assets/img/logo-nexbudge-white-no-text.svg",
  "/assets/img/logo-nexbudge-blue-no-text.svg",
];

self.addEventListener("install", (event) => {
  // Activate the new SW immediately
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(
        ASSETS_TO_CACHE.map(async (url) => {
          try {
            const res = await fetch(url, { cache: "no-cache" });
            if (res && res.ok) {
              await cache.put(url, res.clone());
            }
          } catch (e) {
            // Ignore individual failures to avoid aborting the install
          }
        })
      );
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only cache GET requests. HEAD/POST/etc. should bypass caching to avoid errors.
  if (req.method !== "GET") {
    event.respondWith(fetch(req));
    return;
  }

  // Network-first for navigations/HTML to always pick up new content quickly
  const accept = req.headers.get("accept") || "";
  const isHTML = req.mode === "navigate" || accept.includes("text/html");
  if (isHTML) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req, { cache: "no-store" });
          const cache = await caches.open(CACHE_NAME);
          // Safe to cache: navigation requests are GET
          cache.put(req, fresh.clone());
          return fresh;
        } catch (err) {
          const cached = await caches.match(req);
          return (
            cached ||
            new Response("Vous êtes hors ligne.", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
          );
        }
      })()
    );
    return;
  }

  // Cache-first with background refresh for other assets
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) {
        // Refresh in background
        fetch(req)
          .then((res) => {
            if (res && res.ok) {
              caches.open(CACHE_NAME).then((c) => c.put(req, res.clone()));
            }
          })
          .catch(() => {});
        return cached;
      }
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, res.clone());
        }
        return res;
      } catch (e) {
        return cached || Response.error();
      }
    })()
  );
});
