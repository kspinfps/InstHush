// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
(function () {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";
  var KNOWN_HOST_CLASSES = [
    "iy-host",
    "iy-photo",
    "iy-toast",
    "iy-dock-host",
    "iy-keys-host",
    "iy-hoverzoom-host",
    "iy-shadow-host"
  ];

  var hosts = new WeakSet();
  var activeRecords = new Set();
  var currentTheme = "black";
  var currentMode = "";
  var currentMotion = true;
  var toastRecord = null;
  var toastMsgEl = null;
  var toastTimer = 0;

  var ICONS = {
    download: [
      "M12 4.75v9.5",
      "M8.25 10.5 12 14.25 15.75 10.5",
      "M5 19.25h14"
    ],
    downloadAll: [
      "M12 3.25v7.5",
      "M8.75 7.75 12 11l3.25-3.25",
      "M4.75 14.25h14.5v4.25a1.25 1.25 0 0 1-1.25 1.25H6a1.25 1.25 0 0 1-1.25-1.25z",
      "M8.25 17h.01",
      "M12 17h.01"
    ],
    zoom: [
      "M10.5 4.75a5.75 5.75 0 1 0 0 11.5 5.75 5.75 0 0 0 0-11.5z",
      "M14.75 14.75 19.25 19.25",
      "M10.5 8v5",
      "M8 10.5h5"
    ],
    link: [
      "M10 13a4.5 4.5 0 0 0 6.36 0l2.39-2.39a4.5 4.5 0 0 0-6.36-6.36L11 5.64",
      "M14 11a4.5 4.5 0 0 0-6.36 0L5.25 13.39a4.5 4.5 0 0 0 6.36 6.36L13 18.36"
    ],
    caption: [
      "M4.75 6.75h14.5",
      "M4.75 12h14.5",
      "M4.75 17.25h9.5"
    ],
    reset: [
      "M4.75 9V5.75a1 1 0 0 1 1-1H9",
      "M15 4.75h3.25a1 1 0 0 1 1 1V9",
      "M19.25 15v3.25a1 1 0 0 1-1 1H15",
      "M9 19.25H5.75a1 1 0 0 1-1-1V15"
    ],
    close: [
      "M17.25 6.75 6.75 17.25",
      "M6.75 6.75l10.5 10.5"
    ],
    open: [
      "M14 4.75h5.25V10",
      "M19.25 4.75 10.5 13.5",
      "M18.25 13.75v4.5a1 1 0 0 1-1 1H5.75a1 1 0 0 1-1-1V6.75a1 1 0 0 1 1-1h4.5"
    ],
    at: [
      "M12 8.25a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5z",
      "M15.75 8.25v4.5a2.5 2.5 0 0 0 5 0V12a8.75 8.75 0 1 0-3.4 6.92"
    ]
  };

  var BASE_CSS = `:host {
  all: initial;
  font: 500 12px/1 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--iy-text, #eaf0e8);
  letter-spacing: normal;
  text-transform: none;
  writing-mode: horizontal-tb;
  -webkit-font-smoothing: antialiased;
  color-scheme: dark;
  --iy-radius-sm: 6px;
  --iy-radius-md: 10px;
  --iy-radius-lg: 18px;
  --iy-ease-out: cubic-bezier(0.2, 0, 0, 1);
}
:host([data-mode="light"]) {
  color-scheme: light;
}
*, *::before, *::after {
  box-sizing: border-box;
}
[hidden], .is-hidden {
  display: none !important;
}
.iy-bar, .iy-toolbar {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border-radius: 12px;
  border: 1px solid var(--iy-hairline, rgb(var(--iy-ink, 255 255 255) / 0.12));
  background: var(--iy-glass, var(--iy-surface-a, #171d19eb));
  color: var(--iy-text, #eaf0e8);
  box-shadow: 0 2px 4px #00000026, 0 8px 24px #00000033, inset 0 1px 0 rgb(var(--iy-ink, 255 255 255) / 0.0588);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  user-select: none;
  -webkit-user-select: none;
  pointer-events: auto;
}
.btn, .iy-btn, .chip, .iy-chip {
  appearance: none;
  box-sizing: border-box;
  min-width: 32px;
  height: 32px;
  margin: 0;
  padding: 0 6px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: background-color 120ms cubic-bezier(0.2, 0, 0, 1), color 120ms cubic-bezier(0.2, 0, 0, 1), transform 140ms cubic-bezier(0.2, 0, 0, 1);
}
.btn.icon, .iy-btn.icon {
  width: 32px;
  padding: 0;
}
.chip, .iy-chip {
  min-width: 48px;
  padding: 0 8px;
  background: rgb(var(--iy-ink, 255 255 255) / 0.0392);
  box-shadow: inset 0 0 0 1px rgb(var(--iy-ink, 255 255 255) / 0.1216);
}
.btn:hover:not(:disabled), .iy-btn:hover:not(:disabled), .chip:hover:not(:disabled), .iy-chip:hover:not(:disabled) {
  background: rgb(var(--iy-ink, 255 255 255) / 0.14);
}
.btn.is-on, .iy-btn.is-on, .chip.is-on, .iy-chip.is-on {
  background: var(--iy-accent-soft, #9dceab26);
  color: var(--iy-accent, #9dceab);
}
.btn:active:not(:disabled), .iy-btn:active:not(:disabled), .chip:active:not(:disabled), .iy-chip:active:not(:disabled) {
  transform: scale(0.96);
}
.btn:disabled, .iy-btn:disabled, .chip:disabled, .iy-chip:disabled {
  opacity: 0.48;
  cursor: default;
}
button:focus-visible, .btn:focus-visible, .iy-btn:focus-visible, .chip:focus-visible, .iy-chip:focus-visible {
  outline: 2px solid var(--iy-accent, #9dceab);
  outline-offset: 2px;
}
svg {
  display: block;
  width: 18px;
  height: 18px;
  pointer-events: none;
  flex: none;
}
svg[hidden] {
  display: none;
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
  }
  .btn:active:not(:disabled), .iy-btn:active:not(:disabled), .chip:active:not(:disabled), .iy-chip:active:not(:disabled) {
    transform: none !important;
  }
}
:host([data-motion="off"]) *, :host([data-motion="off"]) *::before, :host([data-motion="off"]) *::after,
[data-motion="off"], [data-motion="off"] *, [data-motion="off"] *::before, [data-motion="off"] *::after {
  animation: none !important;
  transition: none !important;
}
:host([data-motion="off"]) .btn:active, :host([data-motion="off"]) .iy-btn:active,
[data-motion="off"] .btn:active, [data-motion="off"] .iy-btn:active {
  transform: none !important;
}
@media (forced-colors: active) {
  .iy-bar, .iy-toolbar, .btn, .iy-btn {
    border: 1px solid ButtonText;
  }
}`;

  var TOAST_CSS = `:host {
  position: fixed;
  z-index: 2147483002;
  left: 16px;
  right: 16px;
  bottom: 20px;
  display: flex;
  justify-content: center;
  pointer-events: none;
  font: 500 13px/1.35 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--iy-text, #eaf0e8);
  letter-spacing: normal;
}
.msg {
  max-width: 420px;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid var(--iy-hairline, rgb(var(--iy-ink, 255 255 255) / 0.12));
  background: var(--iy-glass, var(--iy-surface-a, #171d19eb));
  color: inherit;
  font: inherit;
  box-shadow: 0 2px 4px #00000026, 0 8px 24px #00000033, inset 0 1px 0 rgb(var(--iy-ink, 255 255 255) / 0.0392);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 160ms cubic-bezier(0.2, 0, 0, 1), transform 160ms cubic-bezier(0.2, 0, 0, 1);
}
:host(.iy-on) .msg, .msg.is-on {
  opacity: 1;
  transform: translateY(0);
}
@media (prefers-reduced-motion: reduce) {
  .msg, :host(.iy-on) .msg, .msg.is-on {
    transition: none !important;
    transform: none !important;
  }
}`;

  function getThemesApi() {
    var iy = globalThis.IY;
    if (iy && typeof iy.themeVars === "function" && iy.THEMES) return iy;
    if (typeof require === "function") {
      try {
        var loaded = require("../../lib/themes.js");
        if (loaded && typeof loaded.themeVars === "function") return loaded;
      } catch (_) {}
    }
    return iy || null;
  }

  function resolveThemeKey(name) {
    var api = getThemesApi();
    if (api && typeof api.resolveThemeName === "function") return api.resolveThemeName(name);
    if (typeof name !== "string") return "black";
    var k = name.trim().toLowerCase();
    var map = {
      green: "green", yesil: "green", "yeşil": "green",
      black: "black", siyah: "black",
      white: "white", beyaz: "white",
      pink: "pink", pembe: "pink",
      purple: "purple", mor: "purple",
      ocean: "ocean", okyanus: "ocean"
    };
    return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : "black";
  }

  function detectMode(themeKey, explicitMode) {
    if (themeKey === "black") return "dark";
    if (themeKey === "white") return "light";
    if (explicitMode === "light" || explicitMode === "dark") return explicitMode;
    if (explicitMode === "media") return "dark";
    if (currentMode === "light" || currentMode === "dark") return currentMode;
    try {
      var doc = typeof document !== "undefined" ? document : null;
      if (doc && typeof getComputedStyle === "function") {
        var nodes = [doc.body, doc.documentElement];
        for (var i = 0; i < nodes.length; i++) {
          if (!nodes[i]) continue;
          var bg = getComputedStyle(nodes[i]).backgroundColor;
          var m = bg && bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
          if (m && (m[4] === undefined || parseFloat(m[4]) > 0)) {
            var lum = (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255;
            return lum < 0.5 ? "dark" : "light";
          }
        }
      }
      if (doc && doc.documentElement && doc.documentElement.classList &&
          typeof doc.documentElement.classList.contains === "function" &&
          doc.documentElement.classList.contains("__fb-dark-mode")) {
        return "dark";
      }
      var mm = (typeof window !== "undefined" && window && typeof window.matchMedia === "function" && window.matchMedia) ||
        (typeof globalThis.matchMedia === "function" && globalThis.matchMedia);
      if (mm && mm("(prefers-color-scheme: light)").matches) {
        return "light";
      }
    } catch (_) {}
    return "dark";
  }

  function prefersReducedMotion() {
    try {
      var mm = (typeof window !== "undefined" && window && typeof window.matchMedia === "function" && window.matchMedia) ||
        (typeof globalThis.matchMedia === "function" && globalThis.matchMedia);
      if (mm && mm("(prefers-reduced-motion: reduce)").matches) {
        return true;
      }
    } catch (_) {}
    return false;
  }

  function isMotionEnabled() {
    return currentMotion && !prefersReducedMotion();
  }

  function hexToInk(hex) {
    if (typeof hex !== "string" || !/^#[0-9a-f]{6}$/i.test(hex)) return "255 255 255";
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return (r * 0.299 + g * 0.587 + b * 0.114) > 128 ? "255 255 255" : r + " " + g + " " + b;
  }

  function computeThemeVarsMap(themeName, mode) {
    var key = resolveThemeKey(themeName || currentTheme);
    var resolvedMode = detectMode(key, mode);
    var api = getThemesApi();
    var map = Object.create(null);
    var cssString = "";

    if (api && typeof api.themeVars === "function") {
      cssString = api.themeVars(key, resolvedMode);
      var pairs = cssString.split(";");
      for (var i = 0; i < pairs.length; i++) {
        var part = pairs[i].trim();
        if (!part) continue;
        var colon = part.indexOf(":");
        if (colon > 0) {
          var prop = part.slice(0, colon).trim();
          var val = part.slice(colon + 1).trim();
          map[prop] = val;
        }
      }
    }

    var themes = api && api.THEMES;
    var entry = (themes && themes[key]) || (themes && themes.black) || null;
    var palette = entry ? (entry[resolvedMode] || entry.dark || entry) : null;
    var accent = map["--iy-accent"] || (palette && palette.accent) || "#9DCEAB";
    var surface = map["--iy-surface"] || (palette && palette.surface) || "#171D19";
    var surfaceRaised = map["--iy-surface-raised"] || (palette && palette.surfaceRaised) || "#252E27";
    var text = map["--iy-text"] || (palette && palette.text) || "#EAF0E8";
    var glass = map["--iy-glass"] || (palette && palette.glass) || (surface + "EB");
    var hairline = map["--iy-hairline"] || (palette && palette.hairline) || "#FFFFFF1F";

    map["--iy-accent"] = accent;
    map["--iy-accent-soft"] = /^#[0-9a-f]{6}$/i.test(accent) ? accent + "26" : accent;
    map["--iy-surface"] = surface;
    map["--iy-surface-a"] = /^#[0-9a-f]{6}$/i.test(surface) ? surface + "eb" : glass;
    map["--iy-surface-raised"] = surfaceRaised;
    map["--iy-text"] = text;
    map["--iy-glass"] = glass;
    map["--iy-hairline"] = hairline;
    map["--iy-ink"] = hexToInk(text);

    return {
      key: key,
      mode: resolvedMode,
      map: map,
      cssText: Object.keys(map).map(function (k) { return k + ":" + map[k]; }).join(";") + ";"
    };
  }

  function applyThemeToHost(host, themeName, mode, topEl) {
    if (!host) return null;
    var info = computeThemeVarsMap(themeName, mode);
    var style = host.style || (host.style = {});
    var keys = Object.keys(info.map);

    if (typeof style.setProperty === "function") {
      for (var i = 0; i < keys.length; i++) {
        style.setProperty(keys[i], info.map[keys[i]]);
      }
    } else {
      for (var j = 0; j < keys.length; j++) {
        style[keys[j]] = info.map[keys[j]];
      }
    }

    // Preserve any non-theme inline properties in style.cssText for fake-DOM tests without real setProperty.
    var needsCssText = typeof style.setProperty !== "function" ||
      (typeof style.getPropertyValue === "function" ? !style.getPropertyValue("--iy-accent") : true);
    if (needsCssText) {
      var existing = typeof style.cssText === "string" ? style.cssText : "";
      var kept = [];
      if (existing) {
        var parts = existing.split(";");
        for (var p = 0; p < parts.length; p++) {
          var seg = parts[p].trim();
          if (seg && seg.indexOf("--iy-") !== 0) kept.push(seg);
        }
      }
      var suffix = kept.length ? kept.join(";") + ";" : "";
      try {
        if (typeof style.setProperty !== "function" || !existing || existing.indexOf("--iy-") === 0) {
          style.cssText = info.cssText + suffix;
        }
      } catch (_) {}
    }

    var motionState = isMotionEnabled() ? "on" : "off";
    if (typeof host.setAttribute === "function") {
      host.setAttribute("data-theme", info.key);
      host.setAttribute("data-mode", info.mode);
      host.setAttribute("data-motion", motionState);
    }
    if (topEl && typeof topEl.setAttribute === "function") {
      topEl.setAttribute("data-theme", info.key);
      topEl.setAttribute("data-mode", info.mode);
      topEl.setAttribute("data-motion", motionState);
    }
    return info;
  }

  function addHost(el) {
    if (el && (typeof el === "object" || typeof el === "function")) {
      hosts.add(el);
    }
    return el;
  }

  function isOwnUi(node) {
    for (var n = node; n; n = n.host || n.parentNode || n.parentElement) {
      if (typeof n !== "object") break;
      if (hosts.has(n)) return true;
      if (typeof n.className === "string" && n.className) {
        for (var i = 0; i < KNOWN_HOST_CLASSES.length; i++) {
          if (n.className.indexOf(KNOWN_HOST_CLASSES[i]) !== -1) return true;
        }
      }
    }
    return false;
  }

  function pruneAndRefresh() {
    activeRecords.forEach(function (rec) {
      if (rec.host && rec.host.isConnected) rec.wasConnected = true;
      if (rec.wasConnected && rec.host && rec.host.isConnected === false) {
        activeRecords.delete(rec);
        return;
      }
      applyThemeToHost(rec.host, rec.theme || currentTheme, rec.mode || currentMode, rec.top);
    });
  }

  function setTheme(themeName, mode) {
    if (typeof themeName === "string" && themeName) {
      currentTheme = resolveThemeKey(themeName);
    }
    if (mode === "light" || mode === "dark" || mode === "media" || mode === "") {
      currentMode = mode === "media" ? "dark" : mode;
    }
    pruneAndRefresh();
    return currentTheme;
  }

  function setMotion(enabled) {
    currentMotion = enabled !== false;
    pruneAndRefresh();
    return currentMotion;
  }

  function getTheme() {
    return currentTheme;
  }

  function stopInside(root) {
    if (!root || typeof root.addEventListener !== "function") return;
    function stop(e) {
      try {
        if (e && typeof e.stopPropagation === "function") e.stopPropagation();
      } catch (_) {}
    }
    root.addEventListener("pointerdown", stop);
    root.addEventListener("click", stop);
    root.addEventListener("dblclick", stop);
  }

  function mountParent(doc) {
    var d = doc || (typeof document !== "undefined" ? document : null);
    if (!d) return null;
    return d.fullscreenElement || d.documentElement || d.body || null;
  }

  function placeHost(node, targetParent) {
    if (!node) return null;
    var parent = targetParent || mountParent(node.ownerDocument);
    if (parent && node.parentNode !== parent && node.parentElement !== parent) {
      if (typeof parent.appendChild === "function") parent.appendChild(node);
      else if (typeof parent.append === "function") parent.append(node);
    }
    return node;
  }

  function createHost(options) {
    var opts = options || {};
    var doc = opts.document || (typeof document !== "undefined" ? document : null);
    if (!doc || typeof doc.createElement !== "function") {
      throw new Error("Document is required to create a shadow host");
    }
    var tag = opts.tag || "div";
    var host = doc.createElement(tag);
    if (opts.className) host.className = opts.className;
    var root = typeof host.attachShadow === "function"
      ? host.attachShadow({ mode: "closed" })
      : host;
    // A real ShadowRoot already has a read-only `host` (assigning it throws in strict mode);
    // only the no-shadow fallback (the host itself, or a test double) needs the link.
    if (root && typeof root === "object" && root.host !== host) {
      try { root.host = host; } catch (_) {}
    }

    var styleEl = doc.createElement("style");
    var customCss = typeof opts.css === "string" ? opts.css : "";
    var includeBase = opts.baseCss !== false;
    styleEl.textContent = (includeBase ? BASE_CSS + (customCss ? "\n" + customCss : "") : customCss);
    if (typeof root.appendChild === "function") root.appendChild(styleEl);
    else if (typeof root.append === "function") root.append(styleEl);

    var top = opts.top || opts.content || null;
    if (top) {
      if (typeof root.appendChild === "function") root.appendChild(top);
      else if (typeof root.append === "function") root.append(top);
    }

    if (opts.stopPropagation !== false) {
      stopInside(root);
    }

    addHost(host);
    var rec = {
      host: host,
      root: root,
      styleEl: styleEl,
      top: top,
      theme: opts.theme ? resolveThemeKey(opts.theme) : "",
      mode: opts.mode || "",
      wasConnected: !!host.isConnected
    };
    activeRecords.add(rec);
    applyThemeToHost(host, rec.theme || currentTheme, rec.mode || currentMode, top);

    if (opts.parent) {
      placeHost(host, opts.parent);
      rec.wasConnected = true;
    } else if (opts.mount === true) {
      placeHost(host);
      rec.wasConnected = true;
    }

    return {
      host: host,
      root: root,
      styleEl: styleEl,
      updateTheme: function (nextTheme, nextMode) {
        if (typeof nextTheme === "string" && nextTheme) rec.theme = resolveThemeKey(nextTheme);
        if (typeof nextMode === "string") rec.mode = nextMode;
        return applyThemeToHost(host, rec.theme || currentTheme, rec.mode || currentMode, rec.top);
      },
      setCss: function (nextCss) {
        styleEl.textContent = (includeBase ? BASE_CSS + (nextCss ? "\n" + nextCss : "") : (nextCss || ""));
      },
      mount: function (parent) {
        placeHost(host, parent);
        rec.wasConnected = true;
        return host;
      },
      destroy: function () {
        activeRecords.delete(rec);
        try {
          if (typeof host.remove === "function") host.remove();
          else if (host.parentNode && typeof host.parentNode.removeChild === "function") host.parentNode.removeChild(host);
        } catch (_) {}
      }
    };
  }

  function shadowHost(tag, top, hostCss, options) {
    var created = createHost(Object.assign({}, options, {
      tag: tag || "div",
      top: top || null,
      css: hostCss || ""
    }));
    return created.host;
  }

  function h(tag, props) {
    var doc = typeof document !== "undefined" ? document : null;
    var el = doc.createElement(tag || "div");
    var attrs = props || {};
    var keys = Object.keys(attrs);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === "class" || k === "className") el.className = String(v);
      else if (k === "text" || k === "textContent") el.textContent = String(v);
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.indexOf("on") === 0 && typeof v === "function") {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === "dataset" && typeof v === "object") {
        if (!el.dataset) el.dataset = {};
        Object.assign(el.dataset, v);
      } else if (k === "hidden") {
        el.hidden = !!v;
        if (v && typeof el.setAttribute === "function") el.setAttribute("hidden", "");
      } else if (typeof el.setAttribute === "function") {
        el.setAttribute(k, String(v));
      } else {
        el[k] = v;
      }
    }
    for (var c = 2; c < arguments.length; c++) {
      var child = arguments[c];
      if (child === null || child === undefined || child === false) continue;
      if (typeof child === "string" || typeof child === "number") {
        if (!el.children || !el.children.length) el.textContent = (el.textContent || "") + String(child);
        else if (doc && typeof doc.createTextNode === "function") {
          var tn = doc.createTextNode(String(child));
          if (typeof el.appendChild === "function") el.appendChild(tn);
        }
      } else if (typeof el.appendChild === "function") {
        el.appendChild(child);
      } else if (typeof el.append === "function") {
        el.append(child);
      }
    }
    return el;
  }

  function icon(pathOrName, size) {
    var doc = typeof document !== "undefined" ? document : null;
    var dim = String(size || 18);
    var svg = doc && typeof doc.createElementNS === "function"
      ? doc.createElementNS(SVG_NS, "svg")
      : doc.createElement("svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", dim);
    svg.setAttribute("height", dim);
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.5");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");

    var paths = Array.isArray(pathOrName)
      ? pathOrName
      : (Object.prototype.hasOwnProperty.call(ICONS, pathOrName) ? ICONS[pathOrName] : [String(pathOrName || "")]);

    for (var i = 0; i < paths.length; i++) {
      var p = doc && typeof doc.createElementNS === "function"
        ? doc.createElementNS(SVG_NS, "path")
        : doc.createElement("path");
      p.setAttribute("d", paths[i]);
      if (typeof svg.appendChild === "function") svg.appendChild(p);
      else if (typeof svg.append === "function") svg.append(p);
    }
    return svg;
  }

  function iconButton(iconName, label, onClick, extraClass) {
    var cls = ("btn iy-btn icon" + (extraClass ? " " + extraClass : "")).trim();
    var btn = h("button", {
      type: "button",
      className: cls,
      title: label,
      "aria-label": label
    }, icon(iconName));
    if (typeof onClick === "function") {
      btn.addEventListener("click", function (e) {
        try {
          if (e && typeof e.preventDefault === "function") e.preventDefault();
          if (e && typeof e.stopPropagation === "function") e.stopPropagation();
        } catch (_) {}
        onClick(e);
      });
    }
    return btn;
  }

  function showToast(text, ms) {
    if (!text || typeof document === "undefined" || !document) return null;
    var duration = typeof ms === "number" ? ms : 2800;
    try {
      if (!toastRecord || (toastRecord.wasConnected && toastRecord.host.isConnected === false)) {
        toastMsgEl = h("div", { className: "msg", role: "status", "aria-live": "polite" });
        toastRecord = createHost({
          className: "iy-toast",
          baseCss: false,
          css: TOAST_CSS,
          top: toastMsgEl,
          mode: "media",
          mount: true
        });
      } else {
        placeHost(toastRecord.host);
      }
      toastMsgEl.textContent = String(text);
      toastMsgEl.classList.add("is-on");
      if (toastRecord.host.classList && typeof toastRecord.host.classList.add === "function") {
        toastRecord.host.classList.add("iy-on");
      }
      if (toastTimer) clearTimeout(toastTimer);
      if (duration > 0 && typeof setTimeout === "function") {
        toastTimer = setTimeout(function () {
          toastTimer = 0;
          try {
            if (toastMsgEl && toastMsgEl.classList) toastMsgEl.classList.remove("is-on");
            if (toastRecord && toastRecord.host && toastRecord.host.classList) {
              toastRecord.host.classList.remove("iy-on");
            }
          } catch (_) {}
        }, duration);
      }
      return {
        host: toastRecord.host,
        messageEl: toastMsgEl,
        update: function (nextText) {
          if (toastMsgEl) toastMsgEl.textContent = String(nextText);
        },
        close: function () {
          if (toastTimer) {
            clearTimeout(toastTimer);
            toastTimer = 0;
          }
          if (toastMsgEl && toastMsgEl.classList) toastMsgEl.classList.remove("is-on");
          if (toastRecord && toastRecord.host && toastRecord.host.classList) {
            toastRecord.host.classList.remove("iy-on");
          }
        }
      };
    } catch (_) {
      return null;
    }
  }

  var api = {
    ICONS: ICONS,
    BASE_CSS: BASE_CSS,
    TOAST_CSS: TOAST_CSS,
    addHost: addHost,
    isOwnUi: isOwnUi,
    createHost: createHost,
    shadowHost: shadowHost,
    placeHost: placeHost,
    setTheme: setTheme,
    getTheme: getTheme,
    setMotion: setMotion,
    isMotionEnabled: isMotionEnabled,
    prefersReducedMotion: prefersReducedMotion,
    detectMode: detectMode,
    resolveThemeKey: resolveThemeKey,
    computeThemeVarsMap: computeThemeVarsMap,
    applyThemeToHost: applyThemeToHost,
    refreshThemes: pruneAndRefresh,
    h: h,
    icon: icon,
    iconButton: iconButton,
    showToast: showToast
  };

  globalThis.IY = globalThis.IY || {};
  globalThis.IY.shadow = api;
  globalThis.IY.ui = Object.assign(globalThis.IY.ui || {}, api);
  globalThis.IY.dmArchive?.mountUi?.();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
