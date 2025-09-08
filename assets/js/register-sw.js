(function () {
  if (!("serviceWorker" in navigator)) return;

  const ASSETS_TO_TRACK = [
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

  async function sha256Hex(data) {
    const enc =
      data instanceof Uint8Array
        ? data
        : new TextEncoder().encode(String(data));
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async function computeVersion() {
    // If crypto is not available, fallback to lastModified to still trigger updates sometimes
    if (!window.crypto || !window.crypto.subtle) {
      return (document.lastModified || Date.now()).toString();
    }
    try {
      const parts = [];
      for (const url of ASSETS_TO_TRACK) {
        let res = await fetch(url, { method: "HEAD", cache: "no-store" });
        // Some servers may not support HEAD properly; fallback to GET for a robust hash
        if (
          !res.ok ||
          (!res.headers.get("ETag") && !res.headers.get("Last-Modified"))
        ) {
          res = await fetch(url, { cache: "no-store" });
          const buf = await res.arrayBuffer();
          const hash = await sha256Hex(new Uint8Array(buf));
          parts.push(`${url}@${hash}`);
          continue;
        }
        const etag = res.headers.get("ETag") || "";
        const lm = res.headers.get("Last-Modified") || "";
        parts.push(`${url}@${etag}@${lm}`);
      }
      // Hash the concatenation so the version changes if any asset changes
      return await sha256Hex(parts.join("|"));
    } catch (e) {
      console.warn("SW version hashing failed, falling back:", e);
      return (document.lastModified || Date.now()).toString();
    }
  }

  async function register() {
    const version = await computeVersion();
    const swUrl = `/service-worker.js?v=${version}`;
    const reg = await navigator.serviceWorker.register(swUrl);

    // Trigger update check and handle waiting workers
    if (reg.waiting) {
      reg.waiting.postMessage({ type: "SKIP_WAITING" });
    }
    reg.addEventListener("updatefound", () => {
      const sw = reg.installing;
      if (!sw) return;
      sw.addEventListener("statechange", () => {
        if (sw.state === "installed" && navigator.serviceWorker.controller) {
          sw.postMessage({ type: "SKIP_WAITING" });
        }
      });
    });
    reg.update();

    // Reload the page when the new SW takes control (avoid first install reload)
    let refreshing = false;
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing || !hadController) return;
      refreshing = true;
      window.location.reload();
    });
  }

  window.addEventListener("load", () => {
    register().catch((err) => {
      console.error("Échec de l'enregistrement du Service Worker:", err);
    });
  });
})();
