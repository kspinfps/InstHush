(function () {
  "use strict";

  var origin = "https://www.instagram.com";
  function targetFor(url, opts) {
    opts = opts || {};
    if (opts.followingFeed !== true || opts.explicitChoice || opts.defaultPrevented ||
        opts.ctrlKey || opts.metaKey || opts.shiftKey || opts.altKey ||
        (opts.button !== undefined && opts.button !== 0)) return null;
    try {
      var parsed = new URL(url, opts.baseURL || origin + "/");
      if (parsed.origin !== origin || parsed.username || parsed.password ||
          parsed.pathname !== "/" || parsed.searchParams.has("variant")) return null;
      // [Tahmin] Instagram's chronological feed uses variant=following.
      // Append without reserializing existing query values (e.g. %20 vs +).
      parsed.search += (parsed.search ? "&" : "?") + "variant=following";
      return parsed.href;
    } catch (err) { return null; }
  }

  var api = { targetFor: targetFor };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }
  var IY = globalThis.IY = globalThis.IY || {};
  IY.feedmode = api;
  if (globalThis.__iyFeedmodeInstalled) return;
  globalThis.__iyFeedmodeInstalled = true;

  var enabled = false, replaced = false;
  var explicitChoice = false;
  try {
    var initialUrl = new URL(location.href);
    // Honour a loaded For you/custom variant too. An automatic following reload
    // must still allow subsequent plain Home clicks to open Following.
    explicitChoice = initialUrl.pathname === "/" &&
      initialUrl.searchParams.getAll("variant").some(function (variant) {
        return variant !== "following";
      });
  } catch (err) { return; }

  function replaceHome() {
    if (!enabled || replaced || explicitChoice) return;
    var target = targetFor(location.href, { followingFeed: enabled, explicitChoice: explicitChoice });
    if (!target) return;
    replaced = true;
    try { location.replace(target); } catch (err) {}
  }
  // The capture-phase click listener exists only while the option is on, so
  // clicks made while it is off never touch session state.
  function onClick(event) {
    if (!enabled || event.defaultPrevented || event.ctrlKey || event.metaKey ||
        event.shiftKey || event.altKey || event.button !== 0) return;
    var node = event.target;
    if (node && node.nodeType === 3) node = node.parentElement;
    var anchor = node && typeof node.closest === "function" ? node.closest("a[href]") : null;
    if (!anchor || anchor.hasAttribute("download")) return;
    var linkTarget = anchor.getAttribute("target") || "";
    if (linkTarget && linkTarget.toLowerCase() !== "_self") return;
    var url;
    try { url = new URL(anchor.href, location.href); } catch (err) { return; }
    if (url.origin !== origin || url.pathname !== "/") return;
    if (url.searchParams.has("variant")) {
      // Keep the user's explicit feed choice for this document's SPA session,
      // even if it happened before the initial settings read completed.
      explicitChoice = true;
      return;
    }
    var target = targetFor(url.href, { followingFeed: enabled, explicitChoice: explicitChoice });
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    // Cancel Instagram's plain-home SPA handler and navigate once in this tab.
    try { location.assign(target); } catch (err) {}
  }

  IY.core.feature("feedmode", {
    enabled: ({ ui }) => ui?.followingFeed === true,
    start() {
      enabled = true;
      IY.core.listen(document, "click", onClick, true);
      replaceHome();
    },
    stop() { enabled = false; }
  });
})();
