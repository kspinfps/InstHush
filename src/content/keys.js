(function () {
  "use strict";
  var enabled = false, theme = "green";
  var host = null, closeButton = null, previousFocus = null;
  var lastPost = null, lastPostPath = "", lastPostUntil = 0;
  var shortcuts = [
    ["J / K", "keysPosts"], ["? (Shift+/)", "keysHelp"],
    ["Alt+G", "keysDock"], ["Alt+Shift+G", "keysGhosts"],
    ["Shift + . / Shift + ,", "popupSpeed"], ["← / →", "popupSeek"],
    ["L", "popupLoop"], ["P", "popupPip"], ["D", "keysDownloadPost", "Download current post / visible slide"],
    ["Shift+D", "keysDownloadPostAll", "Download all slides of current post"], ["Shift+X", "videoCapture"],
    ["M", "keysMute"], ["↑ / ↓", "scVolume"], ["S", "scHold"],
    [", / .", "scFrame"], ["Z / Shift+Z", "scZoom"],
    ["+ / = / Numpad+", "toolZoomIn"], ["- / Numpad-", "toolZoomOut"],
    ["0 / Numpad0", "scReset"], ["R", "scRotate"], ["C", "scFill"],
    ["A", "scAb"], ["F", "scFullscreen"], ["Esc", "keysClose"]
  ];
  function t(key, fallback) { return chrome.i18n.getMessage(key) || fallback || key; }
  // Key bindings from Settings: stored overrides only. An action without an override keeps its
  // v1.8 matcher (produced character, Turkish F safe); an override matches only its new chord.
  var overrides = {}, bindingIds = ["feed.next", "feed.prev", "help"];
  // Help rows backed by catalogue shortcuts; other rows (aliases, Esc) stay as written above.
  var helpRowIds = { keysPosts: ["feed.next", "feed.prev"], keysHelp: ["help"], keysDock: ["dock.toggle"], keysGhosts: ["ghost.toggle"],
    popupSpeed: ["player.speedUp", "player.speedDown"], popupSeek: ["player.back", "player.forward"], popupLoop: ["player.loop"],
    popupPip: ["player.pip"], keysDownloadPost: ["media.download"], keysDownloadPostAll: ["media.downloadAll"], videoCapture: ["player.capture"],
    keysMute: ["player.mute"], scVolume: ["player.volumeUp", "player.volumeDown"], scHold: ["player.hold"],
    scFrame: ["player.frameBack", "player.frameForward"], scZoom: ["player.zoomIn", "player.zoomOut"], scReset: ["player.reset"],
    scRotate: ["player.rotate"], scFill: ["player.fill"], scAb: ["player.ab"], scFullscreen: ["player.fullscreen"] };
  function schema() { return globalThis.IY && IY.settingsSchema; }
  function readShortcuts(raw) {
    var api = schema();
    overrides = {};
    if (!api || typeof api.normalizeShortcuts !== "function") return;
    try { overrides = api.normalizeShortcuts(raw).map; } catch (err) { overrides = {}; }
  }
  function overridden(id) { return Object.prototype.hasOwnProperty.call(overrides, id); }
  // Logical chord of a keydown; letters of non-Latin layouts fall back to the physical key.
  function eventChord(event) {
    var api = schema();
    if (!api || typeof api.chordFromEvent !== "function") return null;
    var key = event.key;
    if (typeof key === "string" && key.length === 1 && /\p{L}/u.test(key) && !/\p{Script=Latin}/u.test(key) &&
        typeof event.code === "string" && /^Key[A-Z]$/.test(event.code)) key = event.code.slice(3).toLowerCase();
    return api.chordFromEvent({ key: key, code: event.code, ctrlKey: !!event.ctrlKey, altKey: !!event.altKey, shiftKey: !!event.shiftKey,
      metaKey: !!event.metaKey, isComposing: false, repeat: false, keyCode: 0 });
  }
  // "feed.next" | "feed.prev" | "help" | "" for a keydown.
  function actionFor(event) {
    var chord = null;
    for (var i = 0; i < bindingIds.length; i++) {
      var id = bindingIds[i];
      if (!overridden(id) || overrides[id] === "") continue;
      if (chord === null) chord = eventChord(event) || "";
      if (chord && overrides[id] === chord) return id;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return "";
    // Only the produced character counts: event.code "Slash" is Shift+. on Turkish Q keyboards.
    if (event.key === "?" && !overridden("help")) return "help";
    var letter = typeof event.key === "string" ? event.key.toLowerCase() : "";
    if (!event.shiftKey && letter === "j" && !overridden("feed.next")) return "feed.next";
    if (!event.shiftKey && letter === "k" && !overridden("feed.prev")) return "feed.prev";
    return "";
  }
  // Help text for one row: the written default, or the user's chords where they differ.
  function rowKeys(row) {
    var ids = helpRowIds[row[1]];
    var api = schema();
    if (!ids || !api || typeof api.effectiveShortcuts !== "function" || !ids.some(overridden)) return row[0];
    var effective = api.effectiveShortcuts({ v: 1, map: overrides }, true);
    var lang = (chrome.i18n.getUILanguage && chrome.i18n.getUILanguage()) || "tr";
    return ids.map(function (id) { return effective[id] ? api.formatChord(effective[id], lang) : "—"; }).join(" / ");
  }
  function typing(event) {
    if (event.isComposing) return true;
    var path = typeof event.composedPath === "function" ? event.composedPath() : [event.target];
    return path.concat([document.activeElement]).some(function (node) {
      return node instanceof Element && (node.matches("input,textarea,select,[role=textbox]") || node.isContentEditable);
    });
  }
  function pageMode() {
    var nodes = [document.body, document.documentElement];
    for (var i = 0; i < nodes.length; i++) {
      if (!nodes[i]) continue;
      var bg = getComputedStyle(nodes[i]).backgroundColor;
      var m = bg && bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (m && (m[4] === undefined || parseFloat(m[4]) > 0)) {
        return (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255 < 0.5 ? "dark" : "light";
      }
    }
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  function paint() {
    if (host && globalThis.IY && IY.themeVars) host.style.cssText = IY.themeVars(theme, pageMode());
  }
  function close() {
    if (!host) return;
    host.remove(); host = null; closeButton = null;
    if (previousFocus && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }
  function el(tag, text) {
    var node = document.createElement(tag);
    if (text) node.textContent = text;
    return node;
  }
  function open() {
    previousFocus = document.activeElement;
    while (previousFocus && previousFocus.shadowRoot && previousFocus.shadowRoot.activeElement) previousFocus = previousFocus.shadowRoot.activeElement;
    host = el("div"); host.className = "iy-keys-host";
    var root = host.attachShadow({ mode: "closed" });
    var style = el("style");
    style.textContent = ':host{all:initial;position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;color:var(--iy-text);font:13px/1.4 system-ui,sans-serif}*{box-sizing:border-box}.backdrop{position:absolute;inset:0;background:var(--iy-hairline)}section{position:relative;width:min(440px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;padding:20px;border:1px solid var(--iy-border);border-radius:10px;background:var(--iy-surface)}h2{font-size:16px;margin:0 0 12px}p{color:var(--iy-muted)}dl{display:grid;grid-template-columns:max-content 1fr;gap:7px 14px;margin:16px 0}dt,dd{margin:0}kbd{font:12px system-ui;padding:2px 5px;border:1px solid var(--iy-border);border-radius:4px;background:var(--iy-surface-raised)}button{font:inherit;padding:6px 12px;color:var(--iy-on-accent);background:var(--iy-accent);border:0;border-radius:4px}button:focus-visible{outline:2px solid var(--iy-accent-text);outline-offset:3px}';
    var backdrop = el("div"); backdrop.className = "backdrop";
    backdrop.addEventListener("click", close);
    var panel = el("section");
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "keys-title");
    var title = el("h2", t("keysTitle")); title.id = "keys-title";
    var list = el("dl");
    shortcuts.forEach(function (row) {
      var key = el("dt"); key.appendChild(el("kbd", rowKeys(row)));
      list.append(key, el("dd", t(row[1], row[2])));
    });
    closeButton = el("button", t("keysClose")); closeButton.type = "button";
    closeButton.addEventListener("click", close);
    panel.append(title, el("p", t("keysContext")), list, closeButton);
    root.append(style, backdrop, panel); paint(); document.documentElement.appendChild(host);
    closeButton.focus({ preventScroll: true });
  }
  function visible(node) {
    var r = node.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(node).visibility !== "hidden";
  }
  // force: the dock's download rows ask even while ui.keys is off.
  function currentPost(force) {
    if ((!enabled && force !== true) || host || /^\/(direct|stories|reels?)(\/|$)/.test(location.pathname)) return null;
    if (lastPostPath !== location.pathname || Date.now() >= lastPostUntil || (lastPost && !lastPost.isConnected)) lastPost = null;
    var dialogs = Array.from(document.querySelectorAll(IY.selectors.dialog)).filter(visible);
    var scope = dialogs.length ? dialogs[dialogs.length - 1] : document;
    if (lastPost && scope === document && visible(lastPost)) return lastPost;
    var best = null, bestArea = 0;
    scope.querySelectorAll(IY.selectors.article).forEach(function (post) {
      if (!visible(post)) return;
      var r = post.getBoundingClientRect();
      var area = Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0)) *
        Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
      if (area > bestArea) { best = post; bestArea = area; }
    });
    return best;
  }
  // Shared only inside the content scripts' ISOLATED-world namespace. video.js
  // remains the sole owner of D / Shift+D and of the download/feedback path.
  if (globalThis.IY) IY.feedKeys = { currentPost: currentPost, typing: typing };
  function navigate(direction) {
    if (/^\/(direct|stories|reels)(\/|$)/.test(location.pathname)) return false;
    var dialogs = Array.from(document.querySelectorAll(IY.selectors.dialog)).filter(visible);
    if (dialogs.length) {
      var dialog = dialogs[dialogs.length - 1];
      if (!dialog.querySelector("article")) return false;
      // Label-based post navigation; never activate a carousel control inside an article.
      var labels = direction > 0 ? IY.selectors.nextPost : IY.selectors.previousPost;
      var controls = dialog.querySelectorAll('button,[role="button"]');
      for (var i = 0; i < controls.length; i++) {
        var button = controls[i];
        var icon = button.querySelector("[aria-label]");
        var label = button.getAttribute("aria-label") || (icon && icon.getAttribute("aria-label"));
        if (labels.indexOf(label) !== -1 && !button.closest("article") && !button.disabled && button.getAttribute("aria-disabled") !== "true" && visible(button)) {
          lastPost = null;
          button.click(); return true;
        }
      }
      return false;
    }
    var offset = 0;
    document.querySelectorAll('header,[role="banner"]').forEach(function (node) {
      var r = node.getBoundingClientRect(), position = getComputedStyle(node).position;
      if ((position === "fixed" || position === "sticky") && r.top <= 0 && r.bottom > 0 && r.height < window.innerHeight / 3 && visible(node)) offset = Math.max(offset, r.bottom);
    });
    var posts = Array.from(document.querySelectorAll(IY.selectors.article)).filter(visible).map(function (node) {
      return { node: node, top: node.getBoundingClientRect().top };
    }).sort(function (a, b) { return a.top - b.top; });
    if (!posts.length) return false;
    var current = 0;
    for (var n = 1; n < posts.length; n++) {
      if (Math.abs(posts[n].top - offset) < Math.abs(posts[current].top - offset)) current = n;
    }
    var target = posts[current + direction];
    if (!target) return false;
    window.scrollTo({ top: Math.max(0, window.scrollY + target.top - offset), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    lastPost = target.node; lastPostPath = location.pathname;
    // Preserve an offscreen target only while our smooth scroll is settling.
    lastPostUntil = Date.now() + 1500;
    return true;
  }
  function forgetPost() { lastPost = null; }
  function onKey(event) {
    if (!enabled || event.defaultPrevented || !event.isTrusted || /^\/direct(\/|$)/.test(location.pathname) || typing(event)) return;
    var action = actionFor(event);
    // Modified keys belong to the page unless the user bound that chord here.
    if (!action && (event.ctrlKey || event.metaKey || event.altKey)) return;
    if ([" ", "Spacebar", "PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown"].indexOf(event.key) !== -1) forgetPost();
    var help = action === "help";
    if (host) {
      paint();
      // The focused close button lives in a closed shadow root and never sees a swallowed
      // key, so Enter/Space close the (modal) dialog here instead.
      if (event.key === "Escape" || (help && !event.repeat) || ((event.key === "Enter" || event.key === " " || event.key === "Spacebar") && !event.repeat)) close();
      else if (event.key === "Tab") closeButton.focus({ preventScroll: true });
      else { event.stopImmediatePropagation(); return; }
    } else if (help && !event.repeat) open();
    else if (!event.repeat && (action === "feed.next" || action === "feed.prev")) {
      if (!navigate(action === "feed.next" ? 1 : -1)) return;
    } else return;
    event.preventDefault(); event.stopImmediatePropagation();
  }
  function apply({ ui, shortcuts }) {
    theme = ui && ui.theme || "green";
    readShortcuts(shortcuts);
    paint();
  }
  IY.core.feature("keys", {
    keys: ["ui", "shortcuts"],
    enabled: ({ ui }) => ui?.keys !== false,
    start(settings) {
      enabled = true;
      apply(settings);
      for (const event of ["wheel", "touchmove"]) IY.core.listen(document.documentElement, event, forgetPost, { capture: true, passive: true });
      IY.core.listen(window, "keydown", onKey, true);
      IY.core.listen(window.matchMedia("(prefers-color-scheme: dark)"), "change", paint);
    },
    update: apply,
    stop() { enabled = false; forgetPost(); close(); }
  });
})();
