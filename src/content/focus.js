(function () {
  "use strict";
  const dom = typeof module !== "undefined" && module.exports ? require("./core/selectors.js") : IY.selectors;
  function normalizeFocusOptions(ui) {
    var raw = ui && ui.focusOpts;
    var legacy = (!raw || typeof raw !== "object" || Array.isArray(raw)) && ui && ui.focus === true;
    var result = {};
    for (var key of ["counts", "suggested", "reelsNav", "exploreNav", "threads", "metaAi"]) {
      result[key] = legacy ? key === "counts" || key === "suggested" : !!raw && raw[key] === true;
    }
    return result;
  }
  function buildFocusCss(options) {
    var selectors = [];
    if (options.counts) selectors.push('a[href$="/liked_by/"]', 'a[href$="/views/"]');
    if (options.suggested) selectors.push(...dom.suggestedRegions);
    for (var key of ["reelsNav", "exploreNav"]) {
      if (!options[key]) continue;
      var href = key === "reelsNav" ? "/reels/" : "/explore/";
      // Exact destination also covers navigation built from unlabelled divs.
      selectors.push('a[href="' + href + '"]');
    }
    if (options.threads) selectors.push('a[href*="threads."]');
    if (options.metaAi) {
      // [Tahmin] Explicit Meta AI destinations; no guessed numeric DM thread IDs.
      // Match complete external authorities, never usernames, query strings,
      // or lookalike hosts containing "meta.ai". Include protocol-relative URLs.
      for (var origin of ["https://meta.ai", "http://meta.ai", "//meta.ai", "https://www.meta.ai", "http://www.meta.ai", "//www.meta.ai"]) {
        selectors.push('a[href="' + origin + '" i]');
        for (var boundary of ["/", "?", "#"]) selectors.push('a[href^="' + origin + boundary + '" i]');
      }
      // [Tahmin] Labelled entry links/options cover EN/TR Meta AI suggestions.
      selectors.push('a[aria-label*="Meta AI"]', '[role="option"][aria-label*="Meta AI"]');
      // [Tahmin] A title belongs to the DM link itself, never its normal-thread parent.
      selectors.push('a[href^="/direct/t/"][title="Meta AI"]', '[role="row"][aria-label="Meta AI"]');
      // [Tahmin] Exact action labels avoid matching search inputs or composer controls.
      selectors.push('button[aria-label="Ask Meta AI"]', 'button[aria-label="Meta AI ile sohbet"]',
        '[role="button"][aria-label="Ask Meta AI"]', '[role="button"][aria-label="Meta AI ile sohbet"]');
    }
    return selectors.length ? selectors.join(", ") + " { display: none !important; }" : "";
  }
  if (typeof module !== "undefined") {
    module.exports = { normalizeFocusOptions: normalizeFocusOptions, buildFocusCss: buildFocusCss };
    return;
  }
  // CSS only: intentionally omit unlabelled recommendation cards/counts.
  var style;
  function apply({ ui }) {
    style.textContent = buildFocusCss(normalizeFocusOptions(ui));
    document.documentElement.classList.toggle("iy-focus", true);
  }
  IY.core.feature("focus", {
    enabled: ({ ui }) => Object.values(normalizeFocusOptions(ui)).some(Boolean),
    start(settings) {
      style = document.createElement("style");
      document.documentElement.appendChild(style);
      apply(settings);
    },
    update: apply,
    stop() {
      document.documentElement.classList.toggle("iy-focus", false);
      style.remove();
      style = null;
    }
  });
})();
