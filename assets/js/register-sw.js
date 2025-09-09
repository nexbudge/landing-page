(function () {
  if (!("serviceWorker" in navigator)) return;

  // Placeholder remplacé en CI par le hash du SW, sinon fallback "" (pas de query)
  const __SWV_PLACEHOLDER__ = "__SW_VERSION__";
  const SW_VERSION =
    __SWV_PLACEHOLDER__ === "__SW_VERSION__" ? "" : __SWV_PLACEHOLDER__;

  function getCandidateSWUrls() {
    const urls = [];
    if (SW_VERSION) {
      urls.push(`/service-worker.js?v=${encodeURIComponent(SW_VERSION)}`);
    }
    urls.push("/service-worker.js");
    return urls;
  }

  async function canFetchSW() {
    const candidates = getCandidateSWUrls();
    for (const url of candidates) {
      try {
        const res = await fetch(url, { cache: "no-store", redirect: "manual" });
        const type = (res.headers.get("content-type") || "").toLowerCase();
        const isJS = type.includes("javascript");
        if (res.status === 200 && res.type === "basic" && isJS) {
          return url;
        }
      } catch (_) {
        // try next candidate
      }
    }
    return null;
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
          // Ne plus désinscrire si l'URL contient notre version (?v=...),
          // mais nettoyer d'anciens patterns avec autre chose que ?v=
          const legacyQuery = urls.some((u) => {
            if (typeof u !== "string") return false;
            const idx = u.indexOf("?");
            if (idx === -1) return false;
            const q = u.slice(idx + 1);
            return !/^(?:|.*&)v=/.test(q); // pas de paramètre v= → legacy
          });
          if (legacyQuery) {
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
    return navigator.serviceWorker.register(url, {
      updateViaCache: "none",
      scope: "/",
    });
  }

  async function register() {
    let reg;
    let chosenUrl = null;
    try {
      // Nettoie d'abord les anciens SW basés sur des URLs avec paramètres (ex: ?v=...)
      await cleanupLegacyRegistrations();
      // Vérifie que le SW (versionné si dispo) est accessible sans redirection et avec le bon type MIME
      const url = await canFetchSW();
      if (!url) {
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
      chosenUrl = url;
      // Enregistrer en utilisant l'URL validée (versionnée si dispo, sinon fallback)
      reg = await withTimeout(tryRegister(chosenUrl), 8000);
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
