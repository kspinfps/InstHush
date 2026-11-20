// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
// Copyright jewdev; InstHush changes GPL-3.0-only.
//
// Unwraps Instagram's l.instagram.com/?u= external-link redirect shim in the DOM and
// on click/middle-click. Off by default because skipping l.instagram.com also skips
// Instagram's harmful-link warning.
(function () {
  "use strict";

  const SHIM_SELECTOR = 'a[href*="l.instagram.com"]';
  const OWN_HOST_RE = /\biy-(?:host|photo|toast|dock-host|keys-host|hoverzoom-host|media-toolbar-host|zoom-host|shadow-host)\b/;

  function fallbackUnwrap(input) {
    if (typeof input !== "string" || !/^https?:\/\/[^/]/i.test(input) ||
        /[\s\x00-\x1f\x7f\\]/.test(input)) return undefined;
    let shim;
    try { shim = new URL(input); } catch (_) { return undefined; }
    if (shim.hostname !== "l.instagram.com" || shim.pathname !== "/" ||
        shim.username || shim.password || shim.port) return undefined;
    const rawTarget = shim.searchParams.get("u");
    if (typeof rawTarget !== "string" || !/^https?:\/\/[^/]/i.test(rawTarget) ||
        /[\s\x00-\x1f\x7f\\]/.test(rawTarget)) return undefined;
    try { return new URL(rawTarget).href; } catch (_) { return undefined; }
  }

  function resolveLinksLib() {
    if (globalThis.IY && globalThis.IY.links && typeof globalThis.IY.links.unwrapLinkShim === "function") {
      return globalThis.IY.links;
    }
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
      try {
        const mod = require("../../lib/links.js");
        if (mod && typeof mod.unwrapLinkShim === "function") return mod;
      } catch (_) {}
    }
    return null;
  }

  function unwrap(input) {
    const lib = resolveLinksLib();
    return lib ? lib.unwrapLinkShim(input) : fallbackUnwrap(input);
  }

  function isEnabled(settings) {
    const ui = settings && settings.ui;
    return !!ui && ui.directLinks === true;
  }

  function isOwnUi(node) {
    const iy = globalThis.IY;
    if (iy && iy.shadow && typeof iy.shadow.isOwnUi === "function" && iy.shadow.isOwnUi(node)) return true;
    for (let n = node; n; n = n.host || n.parentNode || n.parentElement) {
      if (typeof n !== "object") break;
      if (typeof n.className === "string" && OWN_HOST_RE.test(n.className)) return true;
    }
    return false;
  }

  function anchorHref(anchor) {
    if (!anchor) return "";
    if (typeof anchor.getAttribute === "function") {
      const attr = anchor.getAttribute("href");
      if (typeof attr === "string" && attr) return attr;
    }
    return typeof anchor.href === "string" ? anchor.href : "";
  }

  function setAnchorHref(anchor, value) {
    if (typeof anchor.setAttribute === "function") anchor.setAttribute("href", value);
    else anchor.href = value;
  }

  function createController(deps) {
    const d = deps || {};
    let active = false;
    let unobserve = null;
    let unroute = null;
    let unclick = null;
    let unaux = null;
    const originals = new WeakMap();
    const tracked = new Set();
    const MAX_TRACKED = 128;

    function pruneTracked() {
      for (const anchor of tracked) {
        if (anchor.isConnected === false) {
          tracked.delete(anchor);
          originals.delete(anchor);
        }
      }
    }

    function getDoc() {
      return d.document || (typeof document !== "undefined" ? document : null);
    }

    function getWin() {
      return d.window || (typeof window !== "undefined" ? window : globalThis);
    }

    function getCore() {
      return d.core || (globalThis.IY && globalThis.IY.core) || null;
    }

    function rewriteAnchor(anchor) {
      if (!active || !anchor || isOwnUi(anchor)) return false;
      const raw = anchorHref(anchor);
      if (!raw) return false;
      const target = unwrap(raw);
      if (!target || target === raw) return false;
      if (tracked.size >= MAX_TRACKED) pruneTracked();
      originals.set(anchor, { original: raw, rewritten: target });
      tracked.add(anchor);
      setAnchorHref(anchor, target);
      return true;
    }

    function scan(root) {
      if (!active) return;
      const scope = root || getDoc();
      if (!scope || typeof scope.querySelectorAll !== "function") return;
      const anchors = scope.querySelectorAll(SHIM_SELECTOR);
      for (let i = 0; i < anchors.length; i++) rewriteAnchor(anchors[i]);
    }

    function restoreTracked() {
      for (const anchor of tracked) {
        const entry = originals.get(anchor);
        originals.delete(anchor);
        if (!entry || anchor.isConnected === false) continue;
        if (anchorHref(anchor) === entry.rewritten) {
          try { setAnchorHref(anchor, entry.original); } catch (_) {}
        }
      }
      tracked.clear();
    }

    function onClick(event) {
      if (!active || !event || event.defaultPrevented || event.isTrusted === false) return;
      if (event.altKey) return;
      if (event.type === "auxclick") {
        if (event.button !== 1) return;
      } else if (event.button !== undefined && event.button !== 0) {
        return;
      }
      const rawTarget = event.target && event.target.nodeType === 3 ? event.target.parentElement : event.target;
      if (!rawTarget || isOwnUi(rawTarget) || typeof rawTarget.closest !== "function") return;
      const anchor = rawTarget.closest("a[href]");
      if (!anchor || isOwnUi(anchor)) return;
      const target = unwrap(anchorHref(anchor));
      if (!target) return;
      if (typeof event.preventDefault === "function") event.preventDefault();
      if (typeof event.stopPropagation === "function") event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
      const win = getWin();
      if (win && typeof win.open === "function") {
        try { win.open(target, "_blank", "noopener,noreferrer"); } catch (_) {}
      }
    }

    function start(settings) {
      if (!isEnabled(settings)) { stop(); return; }
      if (active) return;
      active = true;
      const doc = getDoc();
      const core = getCore();
      if (doc && typeof doc.addEventListener === "function") {
        if (core && typeof core.listen === "function") {
          unclick = core.listen(doc, "click", onClick, true);
          unaux = core.listen(doc, "auxclick", onClick, true);
        } else {
          doc.addEventListener("click", onClick, true);
          doc.addEventListener("auxclick", onClick, true);
          unclick = () => doc.removeEventListener("click", onClick, true);
          unaux = () => doc.removeEventListener("auxclick", onClick, true);
        }
      }
      if (core && typeof core.observe === "function") {
        unobserve = core.observe(SHIM_SELECTOR, rewriteAnchor);
      }
      if (core && typeof core.route === "function") {
        unroute = core.route(() => scan());
      }
      scan();
    }

    function update(settings) {
      if (!isEnabled(settings)) stop();
      else if (!active) start(settings);
    }

    function stop() {
      if (!active && !unclick && !unaux && !unobserve && !unroute) return;
      active = false;
      for (const off of [unclick, unaux, unobserve, unroute]) {
        if (typeof off === "function") { try { off(); } catch (_) {} }
      }
      unclick = unaux = unobserve = unroute = null;
      restoreTracked();
    }

    return {
      start,
      update,
      stop,
      scan,
      rewriteAnchor,
      onClick,
      isActive: () => active
    };
  }

  let defaultController = null;

  function registerFeature(core) {
    const iyCore = core || (globalThis.IY && globalThis.IY.core);
    if (!iyCore || typeof iyCore.feature !== "function") return null;
    if (!defaultController) defaultController = createController();
    iyCore.feature("directLinks", {
      keys: ["ui"],
      enabled: isEnabled,
      start: settings => defaultController.start(settings),
      update: settings => defaultController.update(settings),
      stop: () => defaultController.stop()
    });
    return defaultController;
  }

  const api = {
    SHIM_SELECTOR,
    unwrap,
    isEnabled,
    createController,
    registerFeature,
    getController: () => defaultController
  };

  globalThis.IY = globalThis.IY || {};
  globalThis.IY.directLinks = api;
  if (globalThis.IY.core && typeof globalThis.IY.core.feature === "function") {
    registerFeature(globalThis.IY.core);
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
