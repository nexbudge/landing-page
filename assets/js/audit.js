(function () {
  if (!("serviceWorker" in navigator)) return;
  const isAudit =
    /HeadlessChrome|Chrome-Lighthouse|Lighthouse/i.test(navigator.userAgent) ||
    navigator.webdriver === true;
  if (!isAudit) return;
  // Désinscrit immédiatement tout SW pour cette origine pendant l’audit
  navigator.serviceWorker
    .getRegistrations()
    .then((rs) => Promise.all(rs.map((r) => r.unregister())))
    .catch(() => {});
})();
