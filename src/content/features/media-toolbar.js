// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
(function () {
  "use strict";

  var DEFAULT_DWELL_MS = 180;
  var STORY_TOP_OFFSET = 64;
  var STORY_BOTTOM_OFFSET = 64;
  var INSET = 8;
  var BUTTON_SIZE = 32;
  var BAR_PAD = 10; // Two 4px insets and the border on both sides.
  var BAR_GAP = 2;

  var TOOLBAR_CSS = `:host {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 2147483000;
  width: 0;
  height: 0;
  pointer-events: none;
}
.toolbar {
  position: fixed;
  top: 8px;
  width: max-content;
  overflow-x: auto;
  scrollbar-width: none;
  flex-wrap: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border-radius: 12px;
  border: 1px solid var(--iy-hairline, rgb(var(--iy-ink, 255 255 255) / 0.12));
  background: var(--iy-surface-a, #171d19eb);
  color: var(--iy-text, #eaf0e8);
  box-shadow: 0 2px 4px #00000026, 0 8px 24px #00000033, inset 0 1px 0 rgb(var(--iy-ink, 255 255 255) / 0.0588);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  user-select: none;
  -webkit-user-select: none;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-2px) scale(0.96);
  transform-origin: top right;
  transition: opacity 120ms cubic-bezier(0.2, 0, 0, 1), transform 140ms cubic-bezier(0.2, 0, 0, 1), visibility 0s 140ms;
}
.toolbar .btn { flex: none; }
.toolbar.is-visible {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  transform: translateY(0) scale(1);
  transition-delay: 0s;
}
@media (prefers-reduced-motion: reduce) {
  .toolbar, .toolbar.is-visible {
    transition: none !important;
    transform: none !important;
  }
}
:host([data-motion="off"]) .toolbar,
:host([data-motion="off"]) .toolbar.is-visible {
  transition: none !important;
  transform: none !important;
}`;

  function getShadow() {
    var iy = globalThis.IY;
    if (iy && iy.shadow && typeof iy.shadow.createHost === "function") return iy.shadow;
    if (typeof require === "function") {
      try { return require("../ui/shadow.js"); } catch (_) {}
    }
    return null;
  }

  function getHover() {
    var iy = globalThis.IY;
    if (iy && iy.hover && typeof iy.hover.onHover === "function") return iy.hover;
    if (typeof require === "function") {
      try { return require("../core/hover.js"); } catch (_) {}
    }
    return null;
  }

  function getActions() {
    var iy = globalThis.IY;
    if (iy && iy.actions && typeof iy.actions.downloadOne === "function") return iy.actions;
    if (typeof require === "function") {
      try { return require("../core/actions.js"); } catch (_) {}
    }
    return null;
  }

  function getZoom() {
    var iy = globalThis.IY;
    if (iy && iy.zoom && typeof iy.zoom.isOpen === "function") return iy.zoom;
    if (typeof require === "function") {
      try { return require("../ui/zoom.js"); } catch (_) {}
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

  function isToolbarEnabled(cfg, ui) {
    if (ui && typeof ui === "object" && ui.mediaToolbar === false) return false;
    if (cfg && typeof cfg === "object" && cfg.mediaToolbar === false) return false;
    return true;
  }

  function isShortcutsEnabled(ui) {
    if (ui && typeof ui === "object") {
      if (ui.keys === false || ui.shortcuts === false) return false;
    }
    return true;
  }

  // Respect the produced Latin letter (including Turkish F/Q); fall back to physical code for non-Latin layouts.
  // D and Shift+D can be rebound in Settings (media.download / media.downloadAll, shared with
  // video.js). Only those two read stored overrides; Z and Shift+C stay fixed like the schema says.
  var DOWNLOAD_IDS = ["media.download", "media.downloadAll"];
  function readKeyOverrides(raw) {
    var out = {};
    var schema = globalThis.IY && globalThis.IY.settingsSchema;
    if (!schema || typeof schema.normalizeShortcuts !== "function") return out;
    try {
      var map = schema.normalizeShortcuts(raw).map;
      for (var i = 0; i < DOWNLOAD_IDS.length; i++) {
        if (Object.prototype.hasOwnProperty.call(map, DOWNLOAD_IDS[i])) out[DOWNLOAD_IDS[i]] = map[DOWNLOAD_IDS[i]];
      }
    } catch (_) { out = {}; }
    return out;
  }
  function eventChord(e) {
    var schema = globalThis.IY && globalThis.IY.settingsSchema;
    if (!schema || typeof schema.chordFromEvent !== "function") return null;
    var key = e.key;
    if (typeof key === "string" && key.length === 1 && /\p{L}/u.test(key) && !/\p{Script=Latin}/u.test(key) &&
        typeof e.code === "string" && /^Key[A-Z]$/.test(e.code)) key = e.code.slice(3).toLowerCase();
    return schema.chordFromEvent({ key: key, code: e.code, ctrlKey: !!e.ctrlKey, altKey: !!e.altKey, shiftKey: !!e.shiftKey,
      metaKey: !!e.metaKey, isComposing: false, repeat: false, keyCode: 0 });
  }
  // Which download a keydown asks for, following the user's bindings: "" when none.
  function downloadActionFor(e, letter, overrides) {
    var chord = null;
    for (var i = 0; i < DOWNLOAD_IDS.length; i++) {
      var id = DOWNLOAD_IDS[i];
      if (Object.prototype.hasOwnProperty.call(overrides, id)) {
        if (overrides[id] === "") continue;
        if (chord === null) chord = eventChord(e) || "";
        if (chord === overrides[id]) return id === "media.download" ? "downloadOne" : "downloadAll";
      } else if (letter === "d" && !e.altKey && e.shiftKey === (id === "media.downloadAll")) {
        return id === "media.download" ? "downloadOne" : "downloadAll";
      }
    }
    return "";
  }

  function letterOf(e) {
    if (!e) return "";
    var k = typeof e.key === "string" ? e.key : "";
    if (/^[a-z]$/i.test(k)) return k.toLowerCase();
    if (k === "İ" || k === "ı") return "i";
    var c = typeof e.code === "string" ? e.code : "";
    if (!/^[a-z]$/i.test(k) && /^Key([A-Z])$/.test(c)) {
      return c.slice(3).toLowerCase();
    }
    return "";
  }

  function isTypingEvent(e, doc) {
    if (!e) return false;
    if (e.isComposing) return true;
    var iy = globalThis.IY;
    if (iy && iy.feedKeys && typeof iy.feedKeys.typing === "function" && iy.feedKeys.typing(e)) {
      return true;
    }
    var d = doc || (typeof document !== "undefined" ? document : null);
    var path = typeof e.composedPath === "function" ? e.composedPath() : [e.target];
    var list = d && d.activeElement ? path.concat([d.activeElement]) : path;
    for (var i = 0; i < list.length; i++) {
      var node = list[i];
      if (!node || typeof node !== "object") continue;
      var tag = typeof node.tagName === "string" ? node.tagName.toUpperCase() : "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (node.isContentEditable) return true;
      if (typeof node.getAttribute === "function" && node.getAttribute("role") === "textbox") return true;
      if (typeof node.matches === "function") {
        try {
          if (node.matches("input,textarea,select,[role=textbox],[contenteditable=true]")) return true;
        } catch (_) {}
      }
    }
    return false;
  }

  function rectsOverlap(a, b, pad) {
    var p = Number(pad) || 0;
    return (
      a.left - p < b.right &&
      a.right + p > b.left &&
      a.top - p < b.bottom &&
      a.bottom + p > b.top
    );
  }

  function collectNativeButtonRects(el, mediaRect, ownHost) {
    if (!el || !mediaRect) return [];
    var scope = (typeof el.closest === "function" && el.closest('article, [role="dialog"], div[role="dialog"], section, header')) || el.parentElement;
    if (!scope || typeof scope.querySelectorAll !== "function") return [];
    var sh = getShadow();
    var nodes;
    try {
      nodes = scope.querySelectorAll('button, [role="button"]');
    } catch (_) {
      return [];
    }
    var out = [];
    for (var i = 0; i < nodes.length && i < 80; i++) {
      var n = nodes[i];
      if (!n || n === ownHost) continue;
      if (ownHost && typeof ownHost.contains === "function" && ownHost.contains(n)) continue;
      if (sh && typeof sh.isOwnUi === "function" && sh.isOwnUi(n)) continue;
      if (typeof n.getBoundingClientRect !== "function") continue;
      var r = n.getBoundingClientRect();
      var rLeft = Number(r.left) || 0;
      var rTop = Number(r.top) || 0;
      var rWidth = Number(r.width) || 0;
      var rHeight = Number(r.height) || 0;
      var rRight = r.right !== undefined ? Number(r.right) : rLeft + rWidth;
      var rBottom = r.bottom !== undefined ? Number(r.bottom) : rTop + rHeight;
      if (rWidth < 8 || rHeight < 8 || rWidth > mediaRect.width * 0.6 || rHeight > 96) continue;
      if (rRight <= mediaRect.left || rLeft >= mediaRect.right || rBottom <= mediaRect.top || rTop >= mediaRect.bottom) continue;
      out.push({ left: rLeft, top: rTop, right: rRight, bottom: rBottom, width: rWidth, height: rHeight });
    }
    return out;
  }

  // Positions the toolbar in the top-right of mediaRect while shifting left or down to never cover Instagram's own buttons.
  function computeToolbarPlacement(mediaRect, toolbarSize, nativeRects, options) {
    var opts = options || {};
    if (!mediaRect || !(mediaRect.width > 0) || !(mediaRect.height > 0)) {
      return { left: 8, top: 8, right: 8, width: 0, height: 0, visible: false };
    }
    var isStory = !!(opts.isStory || opts.kind === "story" || opts.kind === "highlight");
    var vw = Number(opts.viewportW) || (typeof window !== "undefined" && window.innerWidth) || 1024;
    var vh = Number(opts.viewportH) || (typeof window !== "undefined" && window.innerHeight) || 768;
    var w = Number(toolbarSize && toolbarSize.width) || 140;
    var h = Number(toolbarSize && toolbarSize.height) || 40;

    var minLeft = Math.max(INSET, Math.round(mediaRect.left + INSET));
    var maxRightEdge = Math.min(vw - INSET, Math.round(mediaRect.right - INSET));
    w = Math.min(w, Math.max(0, maxRightEdge - minLeft));
    var defaultLeft = Math.max(minLeft, maxRightEdge - w);
    var top = Math.max(INSET, Math.round(mediaRect.top + (isStory ? STORY_TOP_OFFSET : INSET)));
    var left = defaultLeft;

    var buttons = Array.isArray(nativeRects) ? nativeRects : [];
    for (var pass = 0; pass < 6 && buttons.length > 0; pass++) {
      var box = { left: left, top: top, right: left + w, bottom: top + h };
      var hit = null;
      for (var i = 0; i < buttons.length; i++) {
        if (rectsOverlap(box, buttons[i], 4)) {
          hit = buttons[i];
          break;
        }
      }
      if (!hit) break;

      var shiftedLeft = Math.floor(hit.left - w - 6);
      if (shiftedLeft >= minLeft) {
        var trialBox = { left: shiftedLeft, top: top, right: shiftedLeft + w, bottom: top + h };
        var conflictOnRow = false;
        for (var j = 0; j < buttons.length; j++) {
          if (rectsOverlap(trialBox, buttons[j], 4)) {
            conflictOnRow = true;
            break;
          }
        }
        if (!conflictOnRow) {
          left = shiftedLeft;
          break;
        }
      }

      top = Math.ceil(hit.bottom + 6);
      left = defaultLeft;
    }

    var bottomReserve = isStory ? STORY_BOTTOM_OFFSET : INSET;
    var maxBottom = Math.min(vh - INSET, mediaRect.bottom - bottomReserve);
    var finalBox = { left: left, top: top, right: left + w, bottom: top + h };
    var visible = w >= BUTTON_SIZE + BAR_PAD && left + w <= maxRightEdge && !buttons.some(function (r) { return rectsOverlap(finalBox, r, 4); }) && (maxBottom - top >= h) && (top + h <= mediaRect.bottom);
    var right = Math.max(INSET, Math.round(vw - (left + w)));

    return {
      left: Math.round(left),
      top: Math.round(top),
      right: right,
      width: w,
      height: h,
      visible: visible
    };
  }

  function estimateToolbarSize(barEl) {
    if (!barEl) return { width: 140, height: 40 };
    var children = barEl.children || [];
    var visibleCount = 0;
    for (var i = 0; i < children.length; i++) {
      var c = children[i];
      var isHidden = c.hidden || (c.classList && typeof c.classList.contains === "function" && c.classList.contains("is-hidden"));
      if (!isHidden) visibleCount++;
    }
    if (visibleCount > 0) {
      var width = BAR_PAD + visibleCount * BUTTON_SIZE + Math.max(0, visibleCount - 1) * BAR_GAP;
      return { width: width, height: BUTTON_SIZE + BAR_PAD };
    }
    if (typeof barEl.getBoundingClientRect === "function") {
      var r = barEl.getBoundingClientRect();
      if (r && r.width > 0 && r.height >= 24 && r.height <= 64) {
        return { width: Math.ceil(r.width), height: Math.ceil(r.height) };
      }
    }
    return { width: 140, height: BUTTON_SIZE + BAR_PAD };
  }

  function findMediaInScope(scope) {
    if (!scope || typeof scope.querySelectorAll !== "function") return null;
    var hv = getHover();
    var candidates = scope.querySelectorAll("video, img");
    var best = null;
    var bestArea = 0;
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (!el || el.isConnected === false) continue;
      if (hv && (hv.isOwnUi ? hv.isOwnUi(el) : false)) continue;
      if (hv && hv.isCommentGif && hv.isCommentGif(el)) continue;
      if (hv && hv.isCallMedia && hv.isCallMedia(el)) continue;
      var rect = hv && typeof hv.visibleRect === "function" ? hv.visibleRect(el) : el.getBoundingClientRect();
      var isVid = (hv && hv.isVideoEl && hv.isVideoEl(el)) || el.tagName === "VIDEO";
      if (rect.width < 100 || rect.height < 100) continue;
      var area = rect.width * rect.height;
      if (area > bestArea || (area > 0 && area === bestArea && isVid)) {
        bestArea = area;
        best = el;
      }
    }
    return best;
  }

  function findLargestVisibleMedia(doc, win) {
    var d = doc || (typeof document !== "undefined" ? document : null);
    var w = win || (typeof window !== "undefined" ? window : null);
    if (!d || typeof d.querySelectorAll !== "function") return null;
    var hv = getHover();
    var vw = (w && w.innerWidth) || 1024;
    var vh = (w && w.innerHeight) || 768;
    var list;
    try {
      list = d.querySelectorAll('article img, article video, div[role="dialog"] img, div[role="dialog"] video, [role="dialog"] img, [role="dialog"] video, main img, main video, section img, section video');
    } catch (_) {
      list = d.querySelectorAll("video, img");
    }
    var best = null;
    var bestArea = 0;
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (!el || el.isConnected === false) continue;
      if (hv && hv.isCommentGif && hv.isCommentGif(el)) continue;
      if (hv && hv.isCallMedia && hv.isCallMedia(el)) continue;
      if (hv && hv.isOnTopLayer && !hv.isOnTopLayer(el)) continue;
      var rect = hv && typeof hv.visibleRect === "function" ? hv.visibleRect(el) : el.getBoundingClientRect();
      var visW = Math.max(0, Math.min(rect.right, vw) - Math.max(rect.left, 0));
      var visH = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
      if (visW < 120 || visH < 120) continue;
      var area = visW * visH;
      var isVid = (hv && hv.isVideoEl && hv.isVideoEl(el)) || el.tagName === "VIDEO";
      if (area > bestArea || (area === bestArea && isVid)) {
        bestArea = area;
        best = el;
      }
    }
    return best;
  }

  function buildToolbarButtons(ctx, actMod, sh, onMultiRevealed) {
    var btns = [];
    var allBtn = null;

    if (!ctx || !sh || !actMod) return { btns: btns, allBtn: null };

    // Instagram can recycle the same node before the pointer moves again.
    function run(name) {
      if (!ctx.el || ctx.el.isConnected === false) return;
      var fresh = getHover()?.contextFor(ctx.el);
      if (fresh) Promise.resolve(actMod[name](fresh)).catch(function () {}); // Actions report failures via toast.
    }

    if (ctx.kind === "avatar") {
      var zAvatar = sh.iconButton("zoom", t("avatarViewFull", "HD profil fotoğrafını görüntüle"), function () {
        run("openZoom");
      }, "tb-zoom");
      if (!zAvatar.dataset) zAvatar.dataset = {};
      zAvatar.dataset.action = "zoom";
      zAvatar.setAttribute("aria-keyshortcuts", "Z");

      var dlAvatar = sh.iconButton("download", t("avatarDownloadBtn", "Profil fotoğrafını tam boy indir"), function () {
        run("downloadOne");
      }, "tb-download");
      if (!dlAvatar.dataset) dlAvatar.dataset = {};
      dlAvatar.dataset.action = "download";
      dlAvatar.setAttribute("aria-keyshortcuts", "D");

      var cpAvatar = sh.iconButton("link", t("mediaCopyUrl", "Medya adresini kopyala"), function () {
        run("copyMediaUrl");
      }, "tb-copy-url");
      if (!cpAvatar.dataset) cpAvatar.dataset = {};
      cpAvatar.dataset.action = "copyUrl";
      cpAvatar.setAttribute("aria-keyshortcuts", "Shift+C");

      btns.push(zAvatar, dlAvatar, cpAvatar);
      return { btns: btns, allBtn: null };
    }

    var isStory = ctx.kind === "story" || ctx.kind === "highlight";
    var showAllInitially = isStory || !!ctx.isCarousel;

    allBtn = sh.iconButton("downloadAll", t("mediaDownloadAll", "Tümünü indir"), function () {
      run("downloadAll");
    }, "tb-download-all" + (showAllInitially ? "" : " is-hidden"));
    if (!allBtn.dataset) allBtn.dataset = {};
    allBtn.dataset.action = "downloadAll";
    allBtn.setAttribute("aria-keyshortcuts", "Shift+D");
    if (!showAllInitially) {
      allBtn.hidden = true;
    }
    btns.push(allBtn);

    var dlOne = sh.iconButton("download", t("mediaDownloadOne", "Medyayı indir"), function (e) {
      if (e && e.shiftKey) run("downloadAll");
      else run("downloadOne");
    }, "tb-download");
    if (!dlOne.dataset) dlOne.dataset = {};
    dlOne.dataset.action = "download";
    dlOne.title = t("videoDownloadHint", "İndir (Shift: tümü)");
    dlOne.setAttribute("aria-keyshortcuts", "D");
    btns.push(dlOne);

    var isVideo = ctx.mediaType === "video" || (ctx.el && ctx.el.tagName === "VIDEO");
    if (!isVideo) {
      var zoomBtn = sh.iconButton("zoom", t("mediaViewFull", "Tam boyutta aç"), function () {
        run("openZoom");
      }, "tb-zoom");
      if (!zoomBtn.dataset) zoomBtn.dataset = {};
      zoomBtn.dataset.action = "zoom";
      zoomBtn.setAttribute("aria-keyshortcuts", "Z");
      btns.push(zoomBtn);
    }

    var urlBtn = sh.iconButton("link", t("mediaCopyUrl", "Medya adresini kopyala"), function () {
      run("copyMediaUrl");
    }, "tb-copy-url");
    if (!urlBtn.dataset) urlBtn.dataset = {};
    urlBtn.dataset.action = "copyUrl";
    urlBtn.setAttribute("aria-keyshortcuts", "Shift+C");
    btns.push(urlBtn);

    if (!isStory) {
      var capBtn = sh.iconButton("caption", t("mediaCopyCaption", "Açıklamayı kopyala"), function () {
        run("copyCaption");
      }, "tb-copy-caption");
      if (!capBtn.dataset) capBtn.dataset = {};
      capBtn.dataset.action = "copyCaption";
      btns.push(capBtn);
    }

    if (!showAllInitially && typeof actMod.hasMultiple === "function") {
      Promise.resolve(actMod.hasMultiple(ctx, { offline: true })).then(function (multi) {
        if (multi && allBtn) {
          allBtn.hidden = false;
          if (allBtn.classList && typeof allBtn.classList.remove === "function") {
            allBtn.classList.remove("is-hidden");
          }
          if (typeof onMultiRevealed === "function") onMultiRevealed();
        }
      }).catch(function () {});
    }

    return { btns: btns, allBtn: allBtn };
  }

  function createController(options) {
    var opts = options || {};
    var dwellMs = typeof opts.dwellMs === "number" && opts.dwellMs >= 0 ? opts.dwellMs : DEFAULT_DWELL_MS;
    var enabled = false;
    var shortcutsOn = true;
    var hostRecord = null;
    var barEl = null;
    var offHover = null;
    var cleanups = [];
    var dwellTimer = 0;
    var boundEl = null;
    var boundSrc = "";
    var activeCtx = null;
    var barVisible = false;
    var toolbarFocused = false;
    var currentButtons = [];
    var lastPlacement = null;
    var lastHandledKeyEvent = null;
    var keyOverrides = {};
    var videoControlsOn = true;

    function getDoc() {
      return opts.document || (typeof document !== "undefined" ? document : null);
    }

    function getWin() {
      return opts.window || (typeof window !== "undefined" ? window : null);
    }

    function ensureDom() {
      if (hostRecord && barEl) return true;
      var sh = getShadow();
      var doc = getDoc();
      if (!sh || !doc) return false;
      barEl = sh.h("div", {
        className: "toolbar iy-toolbar",
        role: "toolbar",
        "aria-label": t("mediaToolbarLabel", "Medya araç çubuğu"),
        "aria-hidden": "true"
      });
      barEl.addEventListener("keydown", onToolbarKeyDown);
      hostRecord = sh.createHost({
        document: doc,
        className: "iy-media-toolbar-host",
        css: TOOLBAR_CSS,
        top: barEl,
        mode: "media",
        mount: true
      });
      return true;
    }

    function clearDwell() {
      if (dwellTimer) {
        clearTimeout(dwellTimer);
        dwellTimer = 0;
      }
    }

    function setBarVisible(vis) {
      barVisible = !!vis;
      if (!barEl) return;
      if (barEl.classList && typeof barEl.classList.toggle === "function") {
        barEl.classList.toggle("is-visible", barVisible);
      }
      barEl.setAttribute("aria-hidden", barVisible ? "false" : "true");
    }

    function hideToolbar() {
      clearDwell();
      boundEl = null;
      boundSrc = "";
      activeCtx = null;
      // The old buttons' handlers hold the media element: drop them with the context.
      if (barEl && currentButtons.length && !toolbarFocused) replaceBarButtons([]);
      currentButtons = [];
      lastPlacement = null;
      toolbarFocused = false;
      setBarVisible(false);
    }

    function placeCurrent() {
      if (!activeCtx || !barEl || !hostRecord) return;
      var hv = getHover();
      var rect = (activeCtx.el && hv && typeof hv.visibleRect === "function")
        ? hv.visibleRect(activeCtx.el)
        : activeCtx.rect;
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        setBarVisible(false);
        return;
      }
      activeCtx.rect = rect;
      var size = estimateToolbarSize(barEl);
      var nativeRects = collectNativeButtonRects(activeCtx.el, rect, hostRecord.host);
      var win = getWin();
      var placement = computeToolbarPlacement(rect, size, nativeRects, {
        kind: activeCtx.kind,
        isStory: activeCtx.kind === "story" || activeCtx.kind === "highlight",
        viewportW: (win && win.innerWidth) || 1024,
        viewportH: (win && win.innerHeight) || 768
      });
      lastPlacement = placement;
      barEl.style.top = placement.top + "px";
      barEl.style.width = placement.width + "px";
      barEl.style.left = placement.left + "px";
      setBarVisible(placement.visible);
    }

    function replaceBarButtons(btns) {
      if (!barEl) return;
      currentButtons = btns || [];
      if (typeof barEl.replaceChildren === "function") {
        barEl.replaceChildren.apply(barEl, currentButtons);
      } else {
        barEl.children = [];
        for (var i = 0; i < currentButtons.length; i++) {
          if (typeof barEl.appendChild === "function") barEl.appendChild(currentButtons[i]);
        }
      }
    }

    function usesPlayer(ctx) {
      return videoControlsOn && globalThis.IY?.playerOwnsMedia?.(ctx.el);
    }

    function revealForContext(ctx) {
      if (!enabled || !ctx || !ctx.el || ctx.el.isConnected === false || usesPlayer(ctx)) {
        hideToolbar();
        return;
      }
      if (!ensureDom()) return;
      var sh = getShadow();
      var actMod = getActions();
      boundEl = ctx.el;
      boundSrc = ctx.src || ctx.el.currentSrc || ctx.el.src || "";
      activeCtx = ctx;
      var built = buildToolbarButtons(ctx, actMod, sh, function () {
        if (enabled && activeCtx === ctx) placeCurrent();
      });
      if (!built.btns.length) {
        hideToolbar();
        return;
      }
      replaceBarButtons(built.btns);
      placeCurrent();
    }

    function handleHover(hv) {
      if (!enabled) return;
      if (!hv || !hv.el) {
        clearDwell();
        if (!toolbarFocused) {
          hideToolbar();
        }
        return;
      }
      if (usesPlayer(hv)) { hideToolbar(); return; }
      var hvSrc = hv.src || hv.el.currentSrc || hv.el.src || "";
      if (hv.el === boundEl && hvSrc === boundSrc && barVisible && activeCtx && activeCtx.shortcode === hv.shortcode &&
          activeCtx.kind === hv.kind && activeCtx.storyId === hv.storyId && activeCtx.slideIndex === hv.slideIndex && activeCtx.isCarousel === hv.isCarousel) {
        activeCtx = hv;
        placeCurrent();
        return;
      }
      clearDwell();
      boundEl = hv.el;
      boundSrc = hvSrc;
      activeCtx = hv;
      if (dwellMs <= 0) {
        revealForContext(hv);
      } else {
        setBarVisible(false);
        dwellTimer = setTimeout(function () {
          dwellTimer = 0;
          if (!enabled || boundEl !== hv.el || hv.el.isConnected === false) return;
          revealForContext(hv);
        }, dwellMs);
      }
    }

    function onToolbarKeyDown(e) {
      if (!e || !barVisible) return;
      var visibleBtns = currentButtons.filter(function (b) {
        return b && !b.hidden && !(b.classList && typeof b.classList.contains === "function" && b.classList.contains("is-hidden"));
      });
      if (!visibleBtns.length) return;
      var doc = getDoc();
      var rootActive = hostRecord && hostRecord.root && hostRecord.root.activeElement;
      var idx = visibleBtns.indexOf(rootActive || (doc && doc.activeElement));
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        if (typeof e.preventDefault === "function") e.preventDefault();
        if (typeof e.stopPropagation === "function") e.stopPropagation();
        var next = visibleBtns[(idx + 1) % visibleBtns.length];
        if (next && typeof next.focus === "function") next.focus();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        if (typeof e.preventDefault === "function") e.preventDefault();
        if (typeof e.stopPropagation === "function") e.stopPropagation();
        var prev = visibleBtns[(idx - 1 + visibleBtns.length) % visibleBtns.length];
        if (prev && typeof prev.focus === "function") prev.focus();
      } else if (e.key === "Escape") {
        if (typeof e.preventDefault === "function") e.preventDefault();
        if (typeof e.stopPropagation === "function") e.stopPropagation();
        var opener = boundEl;
        hideToolbar();
        if (opener && typeof opener.focus === "function") {
          try { opener.focus({ preventScroll: true }); } catch (_) {}
        }
      }
    }

    function onScroll() {
      if (!barVisible && !dwellTimer) return;
      hideToolbar();
    }

    function onFocusIn(e) {
      if (!enabled || !e || !e.target) return;
      var sh = getShadow();
      var target = e.target;
      if ((hostRecord && target === hostRecord.host) || (sh && sh.isOwnUi(target))) {
        toolbarFocused = true;
        return;
      }
      var hv = getHover();
      if (!hv) return;
      if (hv.isMediaTag(target)) {
        var directCtx = hv.contextFor(target);
        if (directCtx) revealForContext(directCtx);
        return;
      }
      if (typeof target.closest === "function") {
        var scope = target.closest('article, [role="dialog"], div[role="dialog"], header');
        if (scope) {
          var media = findMediaInScope(scope);
          if (media) {
            var scopeCtx = hv.contextFor(media);
            if (scopeCtx) revealForContext(scopeCtx);
          }
        }
      }
    }

    function onFocusOut(e) {
      if (!toolbarFocused) return;
      var sh = getShadow();
      var rel = e && e.relatedTarget;
      if (rel && ((hostRecord && rel === hostRecord.host) || (sh && sh.isOwnUi(rel)))) {
        return;
      }
      toolbarFocused = false;
      var hv = getHover();
      if (!hv || !hv.getHovered()) {
        hideToolbar();
      }
    }

    function resolveShortcutTarget(actionName) {
      var hv = getHover();
      var doc = getDoc();
      var win = getWin();

      // 1. Hovered media or active toolbar context
      var hovered = hv && typeof hv.getHovered === "function" ? hv.getHovered() : null;
      if (hovered && hovered.el && hovered.el.isConnected !== false) {
        var hCtx = hv.contextFor(hovered.el) || hovered;
        if (hCtx) return hCtx;
      }
      if (activeCtx && activeCtx.el && activeCtx.el.isConnected !== false) {
        return activeCtx;
      }

      // 2. Focused element inside a post/dialog/header
      var activeEl = doc && doc.activeElement;
      if (activeEl && typeof activeEl.closest === "function") {
        if (hv && hv.isMediaTag(activeEl)) {
          var fCtx = hv.contextFor(activeEl);
          if (fCtx) return fCtx;
        }
        var fScope = activeEl.closest('article, [role="dialog"], div[role="dialog"]');
        if (fScope) {
          var fMedia = findMediaInScope(fScope);
          if (fMedia) return (hv && hv.contextFor(fMedia)) || { kind: "post", el: fMedia };
        }
      }

      // 3. J/K selected or current feed post via existing IY.feedKeys
      var iy = globalThis.IY;
      if (iy && iy.feedKeys && typeof iy.feedKeys.currentPost === "function") {
        var post = iy.feedKeys.currentPost();
        if (post) {
          var pMedia = findMediaInScope(post);
          if (pMedia) {
            return (hv && hv.contextFor(pMedia)) || {
              kind: "post",
              mediaType: pMedia.tagName === "VIDEO" ? "video" : "image",
              el: pMedia,
              shortcode: hv && hv.shortcodeInRoot ? hv.shortcodeInRoot(post) : undefined
            };
          }
          // Empty current post must not fall through to an unrelated video.
          return null;
        }
      }

      // 4. Profile picture on a profile route when pressing Z without a hovered post
      var route = hv && typeof hv.parseRoute === "function" ? hv.parseRoute() : null;
      if (actionName === "openZoom" && route && route.kind === "profile" && route.username) {
        return { kind: "avatar", mediaType: "image", username: route.username, el: null };
      }

      // 5. Largest visible media in viewport
      var best = findLargestVisibleMedia(doc, win);
      if (best) {
        return (hv && hv.contextFor(best)) || {
          kind: "post",
          mediaType: best.tagName === "VIDEO" ? "video" : "image",
          el: best
        };
      }
      return null;
    }

    function onKeyDown(e) {
      if (!enabled || !shortcutsOn || !e) return;
      if (e.isTrusted === false || e.defaultPrevented || e === lastHandledKeyEvent) return;
      if (e.repeat || e.ctrlKey || e.metaKey) return;

      var doc = getDoc();
      // Modal viewer or shortcut help dialog takes precedence.
      var zoomMod = getZoom();
      if (zoomMod && typeof zoomMod.isOpen === "function" && zoomMod.isOpen()) return;
      if (doc && typeof doc.querySelector === "function" && doc.querySelector(".iy-keys-host")) return;

      var hv = getHover();
      if (hv && hv.isCallMedia && hv.isCallMedia(e.target)) return;
      if (isTypingEvent(e, doc)) return;

      var letter = letterOf(e);
      // Alt chords belong to the browser and the dock unless the user bound one to a download.
      var actionName = downloadActionFor(e, letter, keyOverrides);
      if (!actionName && !e.altKey) {
        if (letter === "z" && !e.shiftKey) actionName = "openZoom";
        else if (letter === "c" && e.shiftKey) actionName = "copyMediaUrl";
      }

      if (!actionName) return;

      var target = resolveShortcutTarget(actionName);
      if (!target) return;

      // A video keeps its own player keys (video.js): in-place Z zoom, and D / Shift+D through the
      // video bar's download path, so one key press never starts two downloads.
      var isVid = target.mediaType === "video" || (target.el && target.el.tagName === "VIDEO");
      if (isVid && (actionName === "openZoom" ||
          (videoControlsOn && (actionName === "downloadOne" || actionName === "downloadAll")))) {
        return;
      }

      var actMod = getActions();
      if (!actMod || typeof actMod[actionName] !== "function") return;

      lastHandledKeyEvent = e;
      if (typeof e.preventDefault === "function") e.preventDefault();
      if (typeof e.stopPropagation === "function") e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();

      if (actionName === "downloadAll" && target.kind === "avatar") {
        actMod.downloadOne(target);
      } else {
        actMod[actionName](target);
      }
    }

    function applySettings(settings) {
      var s = settings || {};
      var cfg = s.cfg;
      var ui = s.ui;
      var sh = getShadow();
      if (sh) {
        if (ui && typeof ui.theme === "string") sh.setTheme(ui.theme);
        if (ui && typeof ui.animations === "boolean") sh.setMotion(ui.animations);
      }
      shortcutsOn = isShortcutsEnabled(ui);
      keyOverrides = readKeyOverrides(s.shortcuts);
      var previousVideoControls = videoControlsOn;
      videoControlsOn = !cfg || cfg.video !== false;
      var shouldEnable = isToolbarEnabled(cfg, ui);
      if (enabled && shouldEnable && previousVideoControls !== videoControlsOn) {
        handleHover(getHover()?.getHovered());
      }
      if (shouldEnable && !enabled) start(s);
      else if (!shouldEnable && enabled) stop();
    }

    function start(settings) {
      var s = settings || {};
      if (!isToolbarEnabled(s.cfg, s.ui)) return;
      var sh = getShadow();
      if (sh) {
        if (s.ui && typeof s.ui.theme === "string") sh.setTheme(s.ui.theme);
        if (s.ui && typeof s.ui.animations === "boolean") sh.setMotion(s.ui.animations);
      }
      shortcutsOn = isShortcutsEnabled(s.ui);
      keyOverrides = readKeyOverrides(s.shortcuts);
      videoControlsOn = !s.cfg || s.cfg.video !== false;
      if (enabled) return;
      enabled = true;

      var hv = getHover();
      if (hv && typeof hv.onHover === "function") {
        offHover = hv.onHover(handleHover);
      }

      var doc = getDoc();
      var win = getWin();
      var scrollOpts = { passive: true, capture: true };

      var iy = globalThis.IY;
      if (iy && iy.core && typeof iy.core.route === "function") {
        var offRoute = iy.core.route(hideToolbar);
        if (typeof offRoute === "function") cleanups.push(offRoute);
      }

      var scrollTarget = (win && typeof win.addEventListener === "function") ? win : doc;
      if (scrollTarget && typeof scrollTarget.addEventListener === "function") {
        scrollTarget.addEventListener("scroll", onScroll, scrollOpts);
        cleanups.push(function () {
          scrollTarget.removeEventListener("scroll", onScroll, true);
        });
      }
      var keyTarget = (doc && typeof doc.addEventListener === "function") ? doc : win;
      if (keyTarget && typeof keyTarget.addEventListener === "function") {
        keyTarget.addEventListener("keydown", onKeyDown, true);
        cleanups.push(function () {
          keyTarget.removeEventListener("keydown", onKeyDown, true);
        });
      }
      if (doc && typeof doc.addEventListener === "function") {
        doc.addEventListener("focusin", onFocusIn, true);
        doc.addEventListener("focusout", onFocusOut, true);
        cleanups.push(function () {
          doc.removeEventListener("focusin", onFocusIn, true);
          doc.removeEventListener("focusout", onFocusOut, true);
        });
      }
    }

    function stop() {
      enabled = false;
      clearDwell();
      if (offHover) {
        try { offHover(); } catch (_) {}
        offHover = null;
      }
      while (cleanups.length) {
        var fn = cleanups.pop();
        try { fn(); } catch (_) {}
      }
      if (hostRecord) {
        hostRecord.destroy();
        hostRecord = null;
      }
      barEl = null;
      boundEl = null;
      activeCtx = null;
      currentButtons = [];
      barVisible = false;
      toolbarFocused = false;
      lastPlacement = null;
    }

    return {
      start: start,
      update: applySettings,
      stop: stop,
      hide: hideToolbar,
      revealForContext: revealForContext,
      resolveShortcutTarget: resolveShortcutTarget,
      onKeyDown: onKeyDown,
      setDwellMs: function (ms) {
        dwellMs = typeof ms === "number" && ms >= 0 ? ms : DEFAULT_DWELL_MS;
      },
      isVisible: function () { return barVisible; },
      isEnabled: function () { return enabled; },
      getHost: function () { return hostRecord ? hostRecord.host : null; },
      getBar: function () { return barEl; },
      getButtons: function () { return currentButtons.slice(); },
      getActiveContext: function () { return activeCtx; },
      getLastPlacement: function () { return lastPlacement; }
    };
  }

  var defaultController = null;

  function registerFeature(core) {
    var iyCore = core || (globalThis.IY && globalThis.IY.core);
    if (!iyCore || typeof iyCore.feature !== "function") return null;
    if (!defaultController) defaultController = createController();
    iyCore.feature("mediaToolbar", {
      keys: ["cfg", "ui", "shortcuts"],
      enabled: function (settings) {
        return isToolbarEnabled(settings && settings.cfg, settings && settings.ui);
      },
      start: function (settings) {
        defaultController.start(settings);
      },
      update: function (settings) {
        defaultController.update(settings);
      },
      stop: function () {
        defaultController.stop();
      }
    });
    return defaultController;
  }

  var api = {
    DEFAULT_DWELL_MS: DEFAULT_DWELL_MS,
    STORY_TOP_OFFSET: STORY_TOP_OFFSET,
    TOOLBAR_CSS: TOOLBAR_CSS,
    isToolbarEnabled: isToolbarEnabled,
    isShortcutsEnabled: isShortcutsEnabled,
    letterOf: letterOf,
    readKeyOverrides: readKeyOverrides,
    downloadActionFor: downloadActionFor,
    isTypingEvent: isTypingEvent,
    rectsOverlap: rectsOverlap,
    collectNativeButtonRects: collectNativeButtonRects,
    computeToolbarPlacement: computeToolbarPlacement,
    estimateToolbarSize: estimateToolbarSize,
    findMediaInScope: findMediaInScope,
    findLargestVisibleMedia: findLargestVisibleMedia,
    buildToolbarButtons: buildToolbarButtons,
    createController: createController,
    registerFeature: registerFeature,
    getController: function () { return defaultController; }
  };

  globalThis.IY = globalThis.IY || {};
  globalThis.IY.mediaToolbar = api;

  if (globalThis.IY.core && typeof globalThis.IY.core.feature === "function") {
    registerFeature(globalThis.IY.core);
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
