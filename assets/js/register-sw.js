(function () {
  if (!("serviceWorker" in navigator)) return;

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
      // Toujours enregistrer sans paramètre de version pour éviter tout redirect/fetch particulier
      reg = await withTimeout(tryRegister("/service-worker.js"), 8000);
    } catch (e) {
      console.error("Échec de l'enregistrement du Service Worker:", e);
      throw e;
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
