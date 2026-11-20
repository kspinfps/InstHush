// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
(function () {
  "use strict";

  var MIN_SCALE = 0.5;
  var MAX_SCALE = 8;
  var ZOOM_FACTOR = 1.15;
  var DRAG_SLOP = 4;

  var ZOOM_CSS = `:host {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  display: block;
  pointer-events: auto;
}
.zoom {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.88);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: var(--iy-text, #eaf0e8);
  animation: iy-zoom-in 160ms cubic-bezier(0.2, 0, 0, 1);
}
@keyframes iy-zoom-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
.stage {
  flex: 1 1 auto;
  position: relative;
  display: grid;
  place-items: center;
  overflow: hidden;
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.stage.is-dragging {
  cursor: grabbing;
}
.zoom-img {
  max-width: 92vw;
  max-height: calc(100vh - 96px);
  object-fit: contain;
  border-radius: 6px;
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
  transform-origin: center center;
  transition: transform 60ms linear;
}
.stage.is-dragging .zoom-img {
  transition: none;
}
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 0 auto 16px;
  width: min(560px, calc(100vw - 32px));
  padding: 4px 6px 4px 12px;
  border-radius: 12px;
  border: 1px solid var(--iy-hairline, rgb(var(--iy-ink, 255 255 255) / 0.12));
  background: var(--iy-glass, var(--iy-surface-a, #171d19eb));
  color: var(--iy-text, #eaf0e8);
  box-shadow: 0 2px 4px #00000026, 0 8px 24px #00000033, inset 0 1px 0 rgb(var(--iy-ink, 255 255 255) / 0.0588);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
.caption {
  flex: 1 1 auto;
  min-width: 0;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex: 0 0 auto;
}
@media (prefers-reduced-motion: reduce) {
  .zoom, .zoom-img {
    animation: none !important;
    transition: none !important;
  }
}
:host([data-motion="off"]) .zoom,
:host([data-motion="off"]) .zoom-img,
[data-motion="off"] .zoom,
[data-motion="off"] .zoom-img {
  animation: none !important;
  transition: none !important;
}`;

  var activeViewer = null;

  function getShadow() {
    var iy = globalThis.IY;
    if (iy && iy.shadow && typeof iy.shadow.createHost === "function") return iy.shadow;
    if (typeof require === "function") {
      try { return require("./shadow.js"); } catch (_) {}
    }
    return null;
  }

  function t(key, fallback) {
    try {
      if (typeof chrome !== "undefined" && chrome && chrome.i18n && typeof chrome.i18n.getMessage === "function") {
        var msg = chrome.i18n.getMessage(key);
        if (msg) return msg;
      }
    } catch (_) {}
    return fallback;
  }

  const media = typeof module !== "undefined" && module.exports ? require("../../lib/media") : globalThis.IY;
  function isSafeImageSrc(src) {
    if (typeof src !== "string" || !src.trim()) return false;
    var trimmed = src.trim();
    if (media?.isAllowedCdn?.(trimmed)) return true;
    if (/^blob:https:\/\/www\.instagram\.com\//.test(trimmed)) return true;
    if (/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,/i.test(trimmed)) return true;
    return false;
  }

  function computeWheelZoom(state, deltaY, cursorX, cursorY, stageRect) {
    var prev = Number(state && state.scale) || 1;
    var curX = Number(state && state.x) || 0;
    var curY = Number(state && state.y) || 0;
    if (!deltaY) return { scale: prev, x: curX, y: curY };
    var factor = deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    var next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev * factor));
    next = Math.round(next * 10000) / 10000;

    var rLeft = Number(stageRect && stageRect.left) || 0;
    var rTop = Number(stageRect && stageRect.top) || 0;
    var rWidth = Number(stageRect && stageRect.width) || (typeof window !== "undefined" && window.innerWidth) || 0;
    var rHeight = Number(stageRect && stageRect.height) || (typeof window !== "undefined" && window.innerHeight) || 0;

    var cx = cursorX - rLeft - rWidth / 2;
    var cy = cursorY - rTop - rHeight / 2;
    var nx = cx - ((cx - curX) * next) / prev;
    var ny = cy - ((cy - curY) * next) / prev;

    return {
      scale: next,
      x: Math.round(nx * 100) / 100,
      y: Math.round(ny * 100) / 100
    };
  }

  function formatCaption(baseCaption, width, height) {
    var base = typeof baseCaption === "string" ? baseCaption.trim() : "";
    var w = Number(width) || 0;
    var h = Number(height) || 0;
    if (w > 0 && h > 0) {
      return (base ? base + " · " : "") + w + "×" + h;
    }
    return base;
  }

  function findDeepActiveElement(doc) {
    var active = doc && doc.activeElement ? doc.activeElement : null;
    while (active && active.shadowRoot && active.shadowRoot.activeElement) {
      active = active.shadowRoot.activeElement;
    }
    return active;
  }

  function closeZoom() {
    if (!activeViewer) return false;
    var viewer = activeViewer;
    activeViewer = null;
    viewer.cleanup();
    return true;
  }

  function openZoom(options) {
    var opts = options || {};
    var src = opts.src || opts.url || "";
    if (!isSafeImageSrc(src)) return null;

    if (activeViewer) {
      closeZoom();
    }

    var sh = getShadow();
    if (!sh) return null;
    var doc = opts.document || (typeof document !== "undefined" ? document : null);
    var win = opts.window || (typeof window !== "undefined" ? window : null);
    if (!doc) return null;

    var previousFocus = opts.opener || findDeepActiveElement(doc);
    var state = {
      scale: 1,
      x: 0,
      y: 0,
      width: Number(opts.width) || 0,
      height: Number(opts.height) || 0,
      caption: opts.caption || "",
      src: src
    };
    var drag = null;
    var backdropPress = false;
    var lastKeyEvent = null;

    var img = sh.h("img", {
      className: "zoom-img",
      src: src,
      alt: opts.alt || opts.caption || ""
    });
    img.draggable = false;
    img.addEventListener("dragstart", function (e) {
      if (e && typeof e.preventDefault === "function") e.preventDefault();
    });

    var captionEl = sh.h("span", {
      className: "caption"
    }, formatCaption(state.caption, state.width, state.height));

    img.addEventListener("load", function () {
      var nw = Number(img.naturalWidth) || state.width;
      var nh = Number(img.naturalHeight) || state.height;
      if (nw > 0 && nh > 0) {
        state.width = nw;
        state.height = nh;
        captionEl.textContent = formatCaption(state.caption, nw, nh);
      }
    });

    var resetLabel = t("toolReset", "Görünümü sıfırla");
    var resetBtn = sh.h("button", {
      type: "button",
      className: "chip iy-chip zoom-reset",
      title: resetLabel + " (0)",
      "aria-label": resetLabel
    }, "100%");

    function applyTransform() {
      var transformValue = "translate(" + state.x + "px, " + state.y + "px) scale(" + state.scale + ")";
      img.style.transform = transformValue;
      resetBtn.textContent = Math.round(state.scale * 100) + "%";
    }

    function reset() {
      state.scale = 1;
      state.x = 0;
      state.y = 0;
      applyTransform();
    }

    resetBtn.addEventListener("click", function (e) {
      if (e && typeof e.preventDefault === "function") e.preventDefault();
      if (e && typeof e.stopPropagation === "function") e.stopPropagation();
      reset();
    });

    var focusables = [resetBtn];
    var downloadBtn = null;
    var copyBtn = null;

    if (typeof opts.onDownload === "function") {
      downloadBtn = sh.iconButton("download", t("videoDownload", "İndir"), function () {
        opts.onDownload();
      }, "zoom-download");
      focusables.push(downloadBtn);
    }

    if (typeof opts.onCopy === "function") {
      copyBtn = sh.iconButton("link", t("mediaCopyUrl", "Medya adresini kopyala"), function () {
        opts.onCopy();
      }, "zoom-copy");
      focusables.push(copyBtn);
    }

    var closeBtn = sh.iconButton("close", t("keysClose", "Kapat"), function () {
      closeZoom();
    }, "zoom-close");
    focusables.push(closeBtn);

    var focusedBtn = closeBtn;
    for (var fi = 0; fi < focusables.length; fi++) {
      (function (btn) {
        btn.addEventListener("focus", function () {
          focusedBtn = btn;
        });
      })(focusables[fi]);
    }

    var stage = sh.h("div", { className: "stage" }, img);

    function onWheel(e) {
      if (!e) return;
      if (typeof e.preventDefault === "function") e.preventDefault();
      if (typeof e.stopPropagation === "function") e.stopPropagation();
      var rect = typeof stage.getBoundingClientRect === "function"
        ? stage.getBoundingClientRect()
        : { left: 0, top: 0, width: (win && win.innerWidth) || 0, height: (win && win.innerHeight) || 0 };
      var cx = Number.isFinite(e.clientX) ? e.clientX : (rect.left + rect.width / 2);
      var cy = Number.isFinite(e.clientY) ? e.clientY : (rect.top + rect.height / 2);
      var next = computeWheelZoom(state, e.deltaY, cx, cy, rect);
      state.scale = next.scale;
      state.x = next.x;
      state.y = next.y;
      applyTransform();
    }

    function onPointerDown(e) {
      if (!e || (e.button !== undefined && e.button !== 0)) return;
      if (typeof e.preventDefault === "function") e.preventDefault();
      backdropPress = e.target === stage;
      drag = {
        sx: Number(e.clientX) || 0,
        sy: Number(e.clientY) || 0,
        ox: state.x,
        oy: state.y,
        moved: false
      };
      if (e.pointerId !== undefined && typeof stage.setPointerCapture === "function") {
        try { stage.setPointerCapture(e.pointerId); } catch (_) {}
      }
      if (stage.classList && typeof stage.classList.add === "function") {
        stage.classList.add("is-dragging");
      }
    }

    function onPointerMove(e) {
      if (!drag || !e) return;
      var dx = (Number(e.clientX) || 0) - drag.sx;
      var dy = (Number(e.clientY) || 0) - drag.sy;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) > DRAG_SLOP) {
        drag.moved = true;
        backdropPress = false;
      }
      state.x = drag.ox + dx;
      state.y = drag.oy + dy;
      applyTransform();
    }

    function endDrag() {
      drag = null;
      if (stage.classList && typeof stage.classList.remove === "function") {
        stage.classList.remove("is-dragging");
      }
    }

    function onStageClick(e) {
      if (e && e.target && e.target !== stage && e.target !== img) return;
      if (backdropPress) {
        backdropPress = false;
        closeZoom();
        return;
      }
      backdropPress = false;
    }

    stage.addEventListener("wheel", onWheel, { passive: false });
    stage.addEventListener("pointerdown", onPointerDown);
    stage.addEventListener("pointermove", onPointerMove);
    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", endDrag);
    stage.addEventListener("lostpointercapture", endDrag);
    stage.addEventListener("dblclick", function (e) {
      if (e && typeof e.preventDefault === "function") e.preventDefault();
      reset();
    });
    stage.addEventListener("click", onStageClick);

    var actionsWrap = sh.h("div", { className: "actions" }, resetBtn, downloadBtn, copyBtn, closeBtn);
    var bar = sh.h("div", { className: "bar" }, captionEl, actionsWrap);
    var dialog = sh.h("div", {
      className: "zoom",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": t("zoomTitle", "Tam boyutta görüntüleyici")
    }, stage, bar);

    var hostRecord = sh.createHost({
      document: doc,
      className: "iy-zoom-host",
      css: ZOOM_CSS,
      top: dialog,
      theme: opts.theme || undefined,
      mode: "media",
      mount: true
    });

    applyTransform();

    function cycleFocus(reverse) {
      var list = focusables.filter(function (b) { return b && !b.disabled && !b.hidden; });
      if (!list.length) return;
      var rootActive = hostRecord.root && hostRecord.root.activeElement;
      var docActive = doc && doc.activeElement;
      var currentIdx = list.indexOf(rootActive);
      if (currentIdx === -1) currentIdx = list.indexOf(docActive);
      if (currentIdx === -1) currentIdx = list.indexOf(focusedBtn);
      var step = reverse ? -1 : 1;
      var nextIdx = (currentIdx + step + list.length) % list.length;
      focusedBtn = list[nextIdx];
      if (typeof focusedBtn.focus === "function") {
        focusedBtn.focus({ preventScroll: true });
      }
    }

    function onKeyDown(e) {
      if (!e || e === lastKeyEvent) return;
      lastKeyEvent = e;
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      var key = e.key;
      var code = e.code;

      if (key === "Escape") {
        if (typeof e.preventDefault === "function") e.preventDefault();
        if (typeof e.stopPropagation === "function") e.stopPropagation();
        if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
        closeZoom();
        return;
      }

      if (!e.shiftKey && (key === "0" || code === "Numpad0" || code === "Digit0")) {
        if (typeof e.preventDefault === "function") e.preventDefault();
        if (typeof e.stopPropagation === "function") e.stopPropagation();
        if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
        reset();
        return;
      }

      if (key === "+" || key === "=" || code === "NumpadAdd" || key === "-" || code === "NumpadSubtract") {
        if (typeof e.preventDefault === "function") e.preventDefault();
        if (typeof e.stopPropagation === "function") e.stopPropagation();
        if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
        var rect = typeof stage.getBoundingClientRect === "function"
          ? stage.getBoundingClientRect()
          : { left: 0, top: 0, width: (win && win.innerWidth) || 0, height: (win && win.innerHeight) || 0 };
        var zoomIn = key === "+" || key === "=" || code === "NumpadAdd";
        var next = computeWheelZoom(state, zoomIn ? -100 : 100, rect.left + rect.width / 2, rect.top + rect.height / 2, rect);
        state.scale = next.scale;
        state.x = next.x;
        state.y = next.y;
        applyTransform();
        return;
      }

      if (key === "Tab") {
        if (typeof e.preventDefault === "function") e.preventDefault();
        if (typeof e.stopPropagation === "function") e.stopPropagation();
        if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
        cycleFocus(!!e.shiftKey);
        return;
      }

      // Keep focus trap and prevent background shortcuts while modal viewer is open.
      if (typeof e.stopPropagation === "function") e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
    }

    if (win && typeof win.addEventListener === "function") {
      win.addEventListener("keydown", onKeyDown, true);
    }
    if (typeof doc.addEventListener === "function") {
      doc.addEventListener("keydown", onKeyDown, true);
    }

    if (typeof closeBtn.focus === "function") {
      closeBtn.focus({ preventScroll: true });
    }

    activeViewer = {
      host: hostRecord.host,
      root: hostRecord.root,
      dialog: dialog,
      stage: stage,
      img: img,
      bar: bar,
      captionEl: captionEl,
      resetBtn: resetBtn,
      downloadBtn: downloadBtn,
      copyBtn: copyBtn,
      closeBtn: closeBtn,
      focusables: focusables,
      state: state,
      reset: reset,
      close: closeZoom,
      getFocusedButton: function () { return focusedBtn; },
      cleanup: function () {
        if (win && typeof win.removeEventListener === "function") {
          win.removeEventListener("keydown", onKeyDown, true);
        }
        if (typeof doc.removeEventListener === "function") {
          doc.removeEventListener("keydown", onKeyDown, true);
        }
        hostRecord.destroy();
        if (previousFocus && previousFocus.isConnected !== false && typeof previousFocus.focus === "function") {
          try { previousFocus.focus({ preventScroll: true }); } catch (_) {}
        }
      }
    };

    return activeViewer;
  }

  function isZoomOpen() {
    return !!(activeViewer && activeViewer.host && activeViewer.host.isConnected !== false);
  }

  function getActiveViewer() {
    return isZoomOpen() ? activeViewer : null;
  }

  var api = {
    MIN_SCALE: MIN_SCALE,
    MAX_SCALE: MAX_SCALE,
    ZOOM_FACTOR: ZOOM_FACTOR,
    ZOOM_CSS: ZOOM_CSS,
    open: openZoom,
    openZoom: openZoom,
    close: closeZoom,
    closeZoom: closeZoom,
    isOpen: isZoomOpen,
    getActive: getActiveViewer,
    computeWheelZoom: computeWheelZoom,
    formatCaption: formatCaption,
    isSafeImageSrc: isSafeImageSrc
  };

  globalThis.IY = globalThis.IY || {};
  globalThis.IY.zoom = api;
  globalThis.IY.openZoom = openZoom;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
