// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
// Stops accidental double-click/double-tap likes on post and reel media while preserving
// single clicks, play/pause, zoom reset, carousel navigation, text selection and Like buttons.
(function () {
  "use strict";

  const MIN_SIZE = 100;
  const CALL_ROUTE_RE = /^\/(?:direct\/(?:t\/[^/]+\/)?|)(?:call|calls|video_call|videocall|video_chat|rtc)(?:\/|$)/i;
  const CALL_SELECTOR = '[role="dialog"][aria-label*="call" i], [role="dialog"][aria-label*="arama" i], [data-call-id]';
  const OWN_HOST_RE = /\biy-(?:host|photo|toast|dock-host|keys-host|hoverzoom-host|media-toolbar-host|zoom-host|shadow-host)\b/;

  function isEnabled(settings) {
    const ui = settings && settings.ui;
    return !!ui && ui.noDoubleTap === true;
  }

  function isOwnUi(node) {
    const iy = globalThis.IY;
    if (iy && iy.shadow && typeof iy.shadow.isOwnUi === "function" && iy.shadow.isOwnUi(node)) return true;
    if (iy && iy.hover && typeof iy.hover.isOwnUi === "function" && iy.hover.isOwnUi(node)) return true;
    for (let n = node; n; n = n.host || n.parentNode || n.parentElement) {
      if (typeof n !== "object") break;
      if (typeof n.className === "string" && OWN_HOST_RE.test(n.className)) return true;
    }
    return false;
  }

  function isMediaTag(el) {
    if (!el || typeof el !== "object") return false;
    if (typeof HTMLImageElement !== "undefined" && el instanceof HTMLImageElement) return true;
    if (typeof HTMLVideoElement !== "undefined" && el instanceof HTMLVideoElement) return true;
    return el.tagName === "IMG" || el.tagName === "VIDEO";
  }

  function isCommentGif(el) {
    const iy = globalThis.IY;
    if (iy && iy.hover && typeof iy.hover.isCommentGif === "function") return iy.hover.isCommentGif(el);
    if (!el || el.tagName !== "IMG") return false;
    if (typeof el.closest === "function" && el.closest("a")) return false;
    const src = el.currentSrc || el.src || (typeof el.getAttribute === "function" ? el.getAttribute("src") : "");
    if (!src || typeof src !== "string") return false;
    try {
      const host = new URL(src, "https://www.instagram.com").hostname.toLowerCase();
      return host === "fbsbx.com" || host.endsWith(".fbsbx.com");
    } catch (_) {
      return src.includes("fbsbx.com");
    }
  }

  function isCallMedia(el, pathname) {
    const iy = globalThis.IY;
    if (iy && iy.hover && typeof iy.hover.isCallMedia === "function") return iy.hover.isCallMedia(el, pathname);
    const path = typeof pathname === "string" ? pathname : (typeof location !== "undefined" ? location.pathname : "");
    if (CALL_ROUTE_RE.test(path)) return true;
    if (!el) return false;
    if (el.srcObject && typeof el.srcObject.getTracks === "function") return true;
    try {
      if (typeof el.closest === "function" && el.closest(CALL_SELECTOR)) return true;
    } catch (_) {}
    return false;
  }

  function rectOf(el) {
    if (!el || typeof el.getBoundingClientRect !== "function") return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
    try {
      const r = el.getBoundingClientRect();
      const left = Number(r.left) || 0;
      const top = Number(r.top) || 0;
      const width = Number(r.width) || 0;
      const height = Number(r.height) || 0;
      return {
        left,
        top,
        width,
        height,
        right: r.right !== undefined ? Number(r.right) : left + width,
        bottom: r.bottom !== undefined ? Number(r.bottom) : top + height
      };
    } catch (_) {
      return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
    }
  }

  function pointInRect(r, x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return true;
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  function isOnTopLayer(el, doc) {
    const iy = globalThis.IY;
    if (iy && iy.hover && typeof iy.hover.isOnTopLayer === "function") return iy.hover.isOnTopLayer(el);
    const d = doc || (el && el.ownerDocument) || (typeof document !== "undefined" ? document : null);
    if (!d || typeof d.querySelectorAll !== "function") return true;
    const list = d.querySelectorAll('div[role="dialog"], [role="dialog"]');
    const dialogs = [];
    for (let i = 0; i < list.length; i++) {
      const dlg = list[i];
      if (isOwnUi(dlg)) continue;
      const r = rectOf(dlg);
      if (r.width > 0 && r.height > 0) dialogs.push(dlg);
    }
    if (!dialogs.length) return true;
    for (let i = 0; i < dialogs.length; i++) {
      if (dialogs[i] === el || (typeof dialogs[i].contains === "function" && dialogs[i].contains(el))) return true;
    }
    return false;
  }

  function isVideoZoomed(el) {
    if (!el || el.tagName !== "VIDEO" || !el.style || typeof el.style.getPropertyValue !== "function") return false;
    return !!el.style.getPropertyValue("object-view-box");
  }

  function visibleRectOf(el) {
    const iy = globalThis.IY;
    if (iy && iy.hover && typeof iy.hover.visibleRect === "function") {
      try { return iy.hover.visibleRect(el); } catch (_) {}
    }
    return rectOf(el);
  }

  // Native <button>, links, inputs, and compact [role="button"] controls (Like, carousel arrows,
  // mute) must stay interactive; full-size [role="button"] media wrappers are NOT bypassed.
  function isInteractiveTarget(target) {
    if (!target || typeof target.closest !== "function") return false;
    if (target.closest('button, a[href], input, textarea, select, option, [role="textbox"], [contenteditable="true"], [contenteditable=""]')) {
      return true;
    }
    const roleBtn = target.closest('[role="button"]');
    if (!roleBtn) return false;
    const r = rectOf(roleBtn);
    if (r.width > 0 || r.height > 0) {
      return r.width <= 240 && r.height <= 96;
    }
    return typeof roleBtn.querySelector !== "function" || !roleBtn.querySelector("img, video");
  }

  function isEligibleMedia(el, doc) {
    if (!isMediaTag(el) || el.isConnected === false) return false;
    if (isOwnUi(el) || isCommentGif(el) || isCallMedia(el)) return false;
    const r = visibleRectOf(el);
    if (r.width < MIN_SIZE || r.height < MIN_SIZE) return false;
    return isOnTopLayer(el, doc);
  }

  function mediaUnderPointer(x, y, target, doc) {
    const d = doc || (typeof document !== "undefined" ? document : null);
    if (!d) return null;

    if (typeof d.elementsFromPoint === "function" && Number.isFinite(x) && Number.isFinite(y)) {
      const stack = d.elementsFromPoint(x, y) || [];
      for (let i = 0; i < stack.length; i++) {
        if (isEligibleMedia(stack[i], d)) return stack[i];
      }
    }

    if (target && isEligibleMedia(target, d) && pointInRect(visibleRectOf(target), x, y)) {
      return target;
    }

    // Fallback when an invisible presentation overlay hides the media element in a synthetic DOM.
    if (target && typeof target.closest === "function") {
      const scope = target.closest('[data-testid="media-container"], li, article, [role="dialog"]') || target.parentElement;
      if (scope && typeof scope.querySelectorAll === "function") {
        const list = scope.querySelectorAll("video, img");
        for (let i = 0; i < list.length; i++) {
          if (isEligibleMedia(list[i], d) && pointInRect(visibleRectOf(list[i]), x, y)) {
            return list[i];
          }
        }
      }
    }
    return null;
  }

  function createController(deps) {
    const d = deps || {};
    let active = false;
    let unlisten = null;

    function getDoc() {
      return d.document || (typeof document !== "undefined" ? document : null);
    }

    function getCore() {
      return d.core || (globalThis.IY && globalThis.IY.core) || null;
    }

    function onDblClick(e) {
      if (!active || !e) return;
      if (e.button !== undefined && e.button !== 0) return;
      const iy = globalThis.IY;
      if (iy && iy.zoom && typeof iy.zoom.isOpen === "function" && iy.zoom.isOpen()) return;
      const target = e.target && e.target.nodeType === 3 ? e.target.parentElement : e.target;
      if (!target || isOwnUi(target) || isInteractiveTarget(target)) return;
      const media = mediaUnderPointer(e.clientX, e.clientY, target, getDoc());
      if (!media || isVideoZoomed(media)) return;
      if (typeof e.stopPropagation === "function") e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
    }

    function start(settings) {
      if (!isEnabled(settings)) { stop(); return; }
      if (active) return;
      active = true;
      const doc = getDoc();
      if (!doc || typeof doc.addEventListener !== "function") return;
      const core = getCore();
      if (core && typeof core.listen === "function") {
        unlisten = core.listen(doc, "dblclick", onDblClick, true);
      } else {
        doc.addEventListener("dblclick", onDblClick, true);
        unlisten = () => doc.removeEventListener("dblclick", onDblClick, true);
      }
    }

    function update(settings) {
      if (!isEnabled(settings)) stop();
      else if (!active) start(settings);
    }

    function stop() {
      if (!active && !unlisten) return;
      active = false;
      if (unlisten) { try { unlisten(); } catch (_) {} unlisten = null; }
    }

    return {
      start,
      update,
      stop,
      onDblClick,
      isActive: () => active
    };
  }

  let defaultController = null;

  function registerFeature(core) {
    const iyCore = core || (globalThis.IY && globalThis.IY.core);
    if (!iyCore || typeof iyCore.feature !== "function") return null;
    if (!defaultController) defaultController = createController();
    iyCore.feature("noDoubleTap", {
      keys: ["ui"],
      enabled: isEnabled,
      start: settings => defaultController.start(settings),
      update: settings => defaultController.update(settings),
      stop: () => defaultController.stop()
    });
    return defaultController;
  }

  const api = {
    MIN_SIZE,
    isEnabled,
    isOwnUi,
    isInteractiveTarget,
    isVideoZoomed,
    isOnTopLayer,
    mediaUnderPointer,
    createController,
    registerFeature,
    getController: () => defaultController
  };

  globalThis.IY = globalThis.IY || {};
  globalThis.IY.noDoubleTap = api;
  if (globalThis.IY.core && typeof globalThis.IY.core.feature === "function") {
    registerFeature(globalThis.IY.core);
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
