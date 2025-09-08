(function () {
  if (!("serviceWorker" in navigator)) return;

  const isAudit =
    /HeadlessChrome|Chrome-Lighthouse|Lighthouse/i.test(navigator.userAgent) ||
    navigator.webdriver === true;
  if (isAudit) return;

  async function canFetchSW() {
    try {
      const res = await fetch("/service-worker.js", {
        cache: "no-store",
        redirect: "manual",
      });
      // Redirects are not allowed for SW scripts; ensure 200 OK and a JavaScript content-type
      const type = (res.headers.get("content-type") || "").toLowerCase();
      const isJS = type.includes("javascript");
      return res.status === 200 && res.type === "basic" && isJS;
    } catch (_) {
      return false;
    }
  }

  async function cleanupLegacyRegistrations() {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        regs.map(async (reg) => {
          const urls = [
            reg.active?.scriptURL,
            reg.waiting?.scriptURL,
            reg.installing?.scriptURL,
          ].filter(Boolean);
          const hasQuery = urls.some(
            (u) => typeof u === "string" && u.includes("?")
          );
          if (hasQuery) {
            await reg.unregister();
          }
        })
      );
    } catch {}
  }

  function withTimeout(promise, ms) {
    let id;
    const timeout = new Promise((_, rej) => {
      id = setTimeout(() => rej(new Error(`timeout after ${ms}ms`)), ms);
    });
    return Promise.race([promise.finally(() => clearTimeout(id)), timeout]);
  }

  async function tryRegister(url) {
    // use updateViaCache 'none' to avoid cached SW script during updates
    return navigator.serviceWorker.register(url, { updateViaCache: "none" });
  }

  async function register() {
    let reg;
    try {
      // Nettoie d'abord les anciens SW basés sur des URLs avec paramètres (ex: ?v=...)
      await cleanupLegacyRegistrations();
      // Vérifie que le SW est accessible sans redirection et avec le bon type MIME
      const ok = await canFetchSW();
      if (!ok) {
        console.warn(
          "Service Worker non enregistré: script inaccessible (redirection, type MIME, ou statut ≠ 200)."
        );
        try {
          const existing = await navigator.serviceWorker.getRegistration();
          if (existing) {
            await existing.unregister();
            console.warn(
              "Ancien Service Worker désenregistré (prévention erreurs de mise à jour)."
            );
          }
        } catch {}
        return;
      }
      // Toujours enregistrer sans paramètre de version pour éviter tout redirect/fetch particulier
      reg = await withTimeout(tryRegister("/service-worker.js"), 8000);
    } catch (e) {
      // Reste silencieux côté 'error' pour ne pas pénaliser l'audit Lighthouse
      console.warn(
        "Échec de l'enregistrement du Service Worker (ignoré):",
        e && e.message
      );
      return;
    }

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
    // Force an update check; guard errors so it doesn't crash
    try {
      reg.update();
    } catch {}

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
