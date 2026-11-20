(function () {
  "use strict";
  // Semantic tray selectors; live Instagram DOM coverage is unverified.
  var style = document.createElement("style");
  style.textContent = 'html.iy-ghost a[href^="/stories/"] canvas, html.iy-ghost :is(button, [role="button"]):is([aria-label*="story" i], [aria-label*="hikaye" i], [aria-label*="hik\u00e2ye" i]) canvas { filter: grayscale(1) !important; }';
  document.documentElement.appendChild(style);
  var revision = 0;
  function apply(cfg) { document.documentElement.classList.toggle("iy-ghost", !cfg || cfg.ghostStory !== false); }
  globalThis.IY.core.onStorage(function (changes, area) {
    if (area === "local" && changes.cfg) { revision++; apply(changes.cfg.newValue); }
  });
  var initial = revision;
  chrome.storage.local.get("cfg", function (data) {
    if (!chrome.runtime.lastError && initial === revision) apply(data && data.cfg);
  });
})();
