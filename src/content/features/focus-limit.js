// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
// Daily time budget for Reels (/reels/*) and Explore (/explore/*): themed countdown pill,
// optional grayscale veil, and blocking card at the limit with "+5 dk" and "Ana sayfaya dön".
(function () {
  "use strict";

  var TICK_MS = 1000;
  var FLUSH_MS = 5000;
  var MAX_TICK_MS = 3000;
  var LOW_TIME_MS = 60000;
  var DEFAULT_PRESET_MIN = 30;
  var MAX_LIMIT_MIN = 1440;

  var MESSAGES = {
    tr: {
      focusLimitPill: "Bugün $1 kaldı",
      focusLimitTitle: "Bugünkü süren doldu",
      focusLimitBody: "Bugün Reels ve Keşfet’te $1 geçirdin. Gece yarısı sıfırlanır.",
      focusLimitMore: "+5 dk",
      focusLimitHome: "Ana sayfaya dön",
      unitSec: "sn",
      unitMin: "dk",
      unitHour: "sa"
    },
    en: {
      focusLimitPill: "$1 left today",
      focusLimitTitle: "That’s your time for today",
      focusLimitBody: "You’ve spent your $1 on Reels and Explore today. It resets at midnight.",
      focusLimitMore: "+5 min",
      focusLimitHome: "Back to Home",
      unitSec: "s",
      unitMin: "min",
      unitHour: "h"
    }
  };

  var FOCUS_LIMIT_CSS = `:host {
  all: initial;
  position: fixed;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  z-index: 2147483000;
  pointer-events: none;
  font: 500 14px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--iy-text, #EAF0E8);
  -webkit-font-smoothing: antialiased;
  color-scheme: dark;
}
:host([data-mode="light"]) {
  color-scheme: light;
}
*, *::before, *::after {
  box-sizing: border-box;
}
[hidden] {
  display: none !important;
}
.iy-focus-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  font: inherit;
  color: var(--iy-text, #EAF0E8);
}
.iy-focus-veil, .ige-focus-veil {
  position: fixed;
  inset: 0;
  pointer-events: none;
  -webkit-backdrop-filter: grayscale(1);
  backdrop-filter: grayscale(1);
  z-index: 1;
}
.iy-focus-pill, .ige-focus-pill {
  position: fixed;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  z-index: 2;
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid var(--iy-hairline, #FFFFFF1F);
  background: var(--iy-glass, #171D19EB);
  color: var(--iy-text, #EAF0E8);
  box-shadow: 0 2px 4px #00000026, 0 8px 24px #00000033;
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  pointer-events: none;
  transition: background-color 220ms cubic-bezier(0.2, 0, 0, 1), color 220ms cubic-bezier(0.2, 0, 0, 1), border-color 220ms cubic-bezier(0.2, 0, 0, 1);
}
.iy-focus-pill.is-low, .ige-focus-pill.is-low {
  border-color: var(--iy-accent, #9DCEAB);
  background: var(--iy-accent, #9DCEAB);
  color: var(--iy-on-accent, #17251C);
}
.iy-focus-block, .ige-focus-block {
  position: fixed;
  inset: 0;
  z-index: 3;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgb(8 10 20 / 0.62);
  -webkit-backdrop-filter: blur(18px) grayscale(1);
  backdrop-filter: blur(18px) grayscale(1);
  pointer-events: auto;
  opacity: 0;
  transition: opacity 220ms cubic-bezier(0.2, 0, 0, 1);
}
.iy-focus-block.is-in, .ige-focus-block.is-in {
  opacity: 1;
}
.iy-focus-card, .ige-focus-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(420px, calc(100vw - 32px));
  max-width: 440px;
  padding: 20px;
  border-radius: 18px;
  border: 1px solid var(--iy-border, #39473D);
  background: var(--iy-surface, #171D19);
  color: var(--iy-text, #EAF0E8);
  box-shadow: 0 12px 40px rgb(0 0 0 / 0.45);
  text-align: center;
}
.iy-focus-card h2, .ige-focus-card h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--iy-text, #EAF0E8);
}
.iy-focus-card p, .ige-focus-card p {
  margin: 0;
  font-size: 14px;
  line-height: 1.45;
  color: var(--iy-muted, #ACB9AE);
}
.iy-focus-actions, .ige-focus-actions {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 4px;
}
.iy-focus-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 0 16px;
  border-radius: 10px;
  border: 1px solid var(--iy-border, #39473D);
  background: var(--iy-surface-raised, #252E27);
  color: var(--iy-text, #EAF0E8);
  font: 600 14px/1 inherit;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: background-color 120ms cubic-bezier(0.2, 0, 0, 1), color 120ms cubic-bezier(0.2, 0, 0, 1), filter 120ms cubic-bezier(0.2, 0, 0, 1);
}
.iy-focus-btn:hover:not(:disabled) {
  background: var(--iy-hover, #252E27);
}
.iy-focus-btn--primary {
  border-color: transparent;
  background: var(--iy-accent, #9DCEAB);
  color: var(--iy-on-accent, #17251C);
}
.iy-focus-btn--primary:hover:not(:disabled) {
  background: var(--iy-accent, #9DCEAB);
  filter: brightness(1.06);
}
.iy-focus-btn:focus-visible {
  outline: 2px solid var(--iy-accent, #9DCEAB);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition: none !important;
    animation: none !important;
  }
}
:host([data-motion="off"]) *, :host([data-motion="off"]) *::before, :host([data-motion="off"]) *::after,
[data-motion="off"], [data-motion="off"] *, [data-motion="off"] *::before, [data-motion="off"] *::after {
  transition: none !important;
  animation: none !important;
}
@media (forced-colors: active) {
  .iy-focus-pill, .iy-focus-card, .iy-focus-btn {
    border: 1px solid ButtonText;
  }
}`;

  var moduleHealthTab = false;
  var activeControllers = new Set();

  function getBudgetApi(deps) {
    if (deps && deps.focusBudget) return deps.focusBudget;
    var iy = globalThis.IY;
    if (iy && iy.focusBudget) return iy.focusBudget;
    if (typeof require === "function") {
      try { return require("../../lib/focus-budget.js"); } catch (_) {}
    }
    throw new Error("focus-budget module is required");
  }

  function getShadowApi(deps) {
    if (deps && deps.shadow) return deps.shadow;
    var iy = globalThis.IY;
    if (iy && iy.shadow) return iy.shadow;
    if (typeof require === "function") {
      try { return require("../ui/shadow.js"); } catch (_) {}
    }
    return null;
  }

  function getThemesApi(deps) {
    if (deps && deps.themes) return deps.themes;
    var iy = globalThis.IY;
    if (iy && typeof iy.themeVars === "function") return iy;
    if (typeof require === "function") {
      try { return require("../../lib/themes.js"); } catch (_) {}
    }
    return null;
  }

  function isHealthTab(deps, settings) {
    if (moduleHealthTab) return true;
    if (deps && (deps.isHealthTab === true || (typeof deps.isHealthTab === "function" && deps.isHealthTab()))) return true;
    if (settings && (settings.isHealthTab === true || (settings.ui && settings.ui.isHealthTab === true))) return true;
    var iy = globalThis.IY;
    if (!iy) return false;
    if (iy.isHealthTab === true || (typeof iy.isHealthTab === "function" && iy.isHealthTab())) return true;
    if (iy.core && (iy.core.isHealthTab === true || (typeof iy.core.isHealthTab === "function" && iy.core.isHealthTab()))) return true;
    if (iy.health && (iy.health.isHealthTab === true || (typeof iy.health.isHealthTab === "function" && iy.health.isHealthTab()))) return true;
    return false;
  }

  function detectLocale(deps, chromeApi, doc) {
    if (deps && typeof deps.locale === "string" && deps.locale) {
      return /^en/i.test(deps.locale.trim()) ? "en" : "tr";
    }
    try {
      if (chromeApi && chromeApi.i18n && typeof chromeApi.i18n.getUILanguage === "function") {
        var uiLang = chromeApi.i18n.getUILanguage();
        if (typeof uiLang === "string" && uiLang) return /^en/i.test(uiLang.trim()) ? "en" : "tr";
      }
    } catch (_) {}
    try {
      var htmlLang = doc && doc.documentElement && doc.documentElement.lang;
      if (typeof htmlLang === "string" && htmlLang) return /^en/i.test(htmlLang.trim()) ? "en" : "tr";
    } catch (_) {}
    return "tr";
  }

  function translate(key, subs, deps, chromeApi, doc) {
    var list = Array.isArray(subs) ? subs : (subs !== undefined && subs !== null ? [String(subs)] : []);
    try {
      if (chromeApi && chromeApi.i18n && typeof chromeApi.i18n.getMessage === "function") {
        var msg = chromeApi.i18n.getMessage(key, list);
        if (typeof msg === "string" && msg) {
          for (var i = 0; i < list.length; i++) {
            msg = msg.replace("$" + (i + 1), String(list[i]));
          }
          return msg;
        }
      }
    } catch (_) {}
    var lang = detectLocale(deps, chromeApi, doc);
    var table = MESSAGES[lang] || MESSAGES.tr;
    var raw = table[key] !== undefined ? table[key] : (MESSAGES.tr[key] || key);
    for (var j = 0; j < list.length; j++) {
      raw = raw.replace("$" + (j + 1), String(list[j]));
    }
    return raw;
  }

  function formatDurationLeft(ms, locale, budgetApi) {
    var budget = budgetApi || getBudgetApi();
    var base = budget.formatLeft(ms);
    var lang = typeof locale === "string" && /^en/i.test(locale) ? "en" : "tr";
    if (lang === "en") return base;
    return base
      .replace(/\bmin\b/g, MESSAGES.tr.unitMin)
      .replace(/\bh\b/g, MESSAGES.tr.unitHour)
      .replace(/\bs\b/g, MESSAGES.tr.unitSec);
  }

  function normalizeSettings(raw) {
    var s = raw && typeof raw === "object" ? raw : {};
    var ui = s.ui && typeof s.ui === "object" && !Array.isArray(s.ui) ? s.ui : s;

    var theme = typeof ui.theme === "string" && ui.theme ? ui.theme : (typeof s["ui.theme"] === "string" ? s["ui.theme"] : "green");
    var animations = ui.animations !== undefined ? ui.animations !== false : (s["ui.animations"] !== undefined ? s["ui.animations"] !== false : true);

    var explicitEnabled = ui.focusEnabled !== undefined ? ui.focusEnabled : s["focus.enabled"];
    var rawLimit = ui.focusLimit !== undefined ? ui.focusLimit
      : (ui.dailyLimit !== undefined ? ui.dailyLimit : s["focus.limit"]);
    var numLimit = Number(rawLimit);
    var limitMin = 0;
    if (explicitEnabled === false) {
      limitMin = 0;
    } else if (Number.isFinite(numLimit) && numLimit > 0) {
      limitMin = Math.min(MAX_LIMIT_MIN, numLimit);
    } else if (explicitEnabled === true) {
      limitMin = DEFAULT_PRESET_MIN;
    }

    var rawTimer = ui.focusTimer !== undefined ? ui.focusTimer
      : (ui.timeRemaining !== undefined ? ui.timeRemaining : s["focus.timer"]);
    var showTimer = limitMin > 0 && rawTimer !== false;

    var rawGray = ui.grayscale !== undefined ? ui.grayscale
      : (ui.focusGrayscale !== undefined ? ui.focusGrayscale : s["focus.grayscale"]);
    var rawAfter = ui.grayscaleAfter !== undefined ? ui.grayscaleAfter : ui.grayscaleMins;
    var grayscale = "never";
    var grayscaleAfterMin = 0;

    if (typeof rawGray === "number" && Number.isFinite(rawGray) && rawGray > 0) {
      grayscale = "after";
      grayscaleAfterMin = Math.min(MAX_LIMIT_MIN, rawGray);
    } else if (rawGray === true || rawGray === "always") {
      grayscale = "always";
    } else if (rawGray === "limited" || rawGray === "reels-explore") {
      grayscale = "limited";
    } else if (rawGray === "limit" || rawGray === "expired" || rawGray === "when-expired" || rawGray === "timeout") {
      grayscale = "limit";
    } else if (typeof rawGray === "string" && /^\d+(?:\.\d+)?$/.test(rawGray.trim()) && Number(rawGray) > 0) {
      grayscale = "after";
      grayscaleAfterMin = Math.min(MAX_LIMIT_MIN, Number(rawGray));
    }

    if (Number.isFinite(Number(rawAfter)) && Number(rawAfter) > 0) {
      grayscaleAfterMin = Math.min(MAX_LIMIT_MIN, Number(rawAfter));
      if (grayscale === "never" || grayscale === "limited") {
        grayscale = "after";
      }
    }

    return {
      theme: theme,
      animations: animations,
      limitMin: limitMin,
      showTimer: showTimer,
      grayscale: grayscale,
      grayscaleAfterMin: grayscaleAfterMin
    };
  }

  function isEnabled(settings, deps) {
    if (isHealthTab(deps, settings)) return false;
    var cfg = normalizeSettings(settings);
    return cfg.limitMin > 0 || cfg.grayscale !== "never";
  }

  function shouldShowGrayscale(cfg, onLimited, usedTotalMs, remaining) {
    if (!cfg || cfg.grayscale === "never") return false;
    if (cfg.grayscale === "always") return true;
    if (!onLimited) return false;
    if (cfg.grayscale === "limited") return true;
    if (cfg.grayscale === "limit") return cfg.limitMin > 0 && remaining <= 0;
    if (cfg.grayscale === "after") {
      var thresholdMs = cfg.grayscaleAfterMin * 60000;
      if (thresholdMs > 0 && usedTotalMs >= thresholdMs) return true;
      return cfg.limitMin > 0 && remaining <= 0;
    }
    return false;
  }

  function readLocal(chromeApi, key, cb) {
    try {
      var area = chromeApi && chromeApi.storage && chromeApi.storage.local;
      if (!area || typeof area.get !== "function") {
        cb(null, {});
        return;
      }
      var settled = false;
      var done = function (val) {
        if (settled) return;
        settled = true;
        if (chromeApi.runtime && chromeApi.runtime.lastError) {
          cb(new Error(chromeApi.runtime.lastError.message || "storage.get failed"), {});
          return;
        }
        cb(null, val && typeof val === "object" ? val : {});
      };
      var ret = area.get(key, done);
      if (!settled && ret && typeof ret.then === "function") {
        ret.then(done, function (err) {
          if (!settled) {
            settled = true;
            cb(err || new Error("storage.get failed"), {});
          }
        });
      }
    } catch (err) {
      cb(err, {});
    }
  }

  function writeLocal(chromeApi, payload, cb) {
    try {
      var area = chromeApi && chromeApi.storage && chromeApi.storage.local;
      if (!area || typeof area.set !== "function") {
        cb(null);
        return;
      }
      var settled = false;
      var done = function () {
        if (settled) return;
        settled = true;
        if (chromeApi.runtime && chromeApi.runtime.lastError) {
          cb(new Error(chromeApi.runtime.lastError.message || "storage.set failed"));
          return;
        }
        cb(null);
      };
      var ret = area.set(payload, done);
      if (!settled && ret && typeof ret.then === "function") {
        ret.then(done, function (err) {
          if (!settled) {
            settled = true;
            cb(err || new Error("storage.set failed"));
          }
        });
      }
    } catch (err) {
      cb(err);
    }
  }

  function cleanPathname(pathname) {
    if (typeof pathname !== "string") return "";
    return pathname.split(/[?#]/)[0];
  }

  function createController(deps) {
    var d = deps || {};
    var budget = getBudgetApi(d);
    var shadow = getShadowApi(d);
    var themes = getThemesApi(d);

    var active = false;
    var generation = 0;
    var cfg = normalizeSettings({});
    var usage = budget.today(undefined, currentDayKey());
    var unsaved = 0;
    var inflightMs = 0;
    var lastTick = 0;
    var lastFlush = 0;
    var timerId = 0;
    var opRunning = false;
    var opQueue = [];
    var cleanups = [];

    function enqueueOp(task) {
      return new Promise(function (resolve) {
        opQueue.push(function (next) {
          task(function () {
            resolve();
            next();
          });
        });
        drainOps();
      });
    }

    function drainOps() {
      if (opRunning) return;
      while (opQueue.length > 0 && !opRunning) {
        var job = opQueue.shift();
        opRunning = true;
        var finishedSync = false;
        var asyncPending = false;
        job(function () {
          if (!asyncPending) {
            finishedSync = true;
          } else {
            opRunning = false;
            drainOps();
          }
        });
        if (finishedSync) {
          opRunning = false;
        } else {
          asyncPending = true;
        }
      }
    }

    var hostRecord = null;
    var layerEl = null;
    var veilEl = null;
    var pillEl = null;
    var blockEl = null;
    var blockTitleEl = null;
    var blockDescEl = null;
    var moreBtnEl = null;
    var homeBtnEl = null;
    var blockLimitRendered = -1;

    function getDoc() { return d.document || (typeof document !== "undefined" ? document : null); }
    function getWin() { return d.window || (typeof window !== "undefined" ? window : null); }
    function getLoc() {
      if (d.location) return d.location;
      var doc = getDoc();
      if (doc && doc.location) return doc.location;
      return typeof location !== "undefined" ? location : { pathname: "/", href: "" };
    }
    function getChrome() { return d.chrome || (typeof chrome !== "undefined" ? chrome : null); }
    function getCore() { return d.core || (globalThis.IY && globalThis.IY.core) || null; }

    function nowPerf() {
      if (typeof d.now === "function") return d.now();
      if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now();
      return Date.now();
    }

    function nowEpoch() {
      if (typeof d.nowEpoch === "function") return d.nowEpoch();
      if (typeof d.Date === "function" && typeof d.Date.now === "function") return d.Date.now();
      return Date.now();
    }

    function currentDayKey() {
      if (typeof d.dayKey === "function") return d.dayKey();
      if (typeof d.Date === "function") return budget.dayKey(new d.Date(nowEpoch()));
      return budget.dayKey(new Date(nowEpoch()));
    }

    function setInt(fn, ms) {
      if (typeof d.setInterval === "function") return d.setInterval(fn, ms);
      return setInterval(fn, ms);
    }

    function clearInt(id) {
      if (!id) return;
      if (typeof d.clearInterval === "function") { d.clearInterval(id); return; }
      clearInterval(id);
    }

    function raf(fn) {
      if (typeof d.requestAnimationFrame === "function") return d.requestAnimationFrame(fn);
      if (typeof requestAnimationFrame === "function") return requestAnimationFrame(fn);
      fn();
      return 0;
    }

    function isVisible() {
      var doc = getDoc();
      if (!doc) return true;
      if (typeof doc.visibilityState === "string") return doc.visibilityState === "visible";
      return !doc.hidden;
    }

    function onLimitedRoute() {
      var loc = getLoc();
      return budget.isLimitedPath(cleanPathname(loc && loc.pathname));
    }

    function totalUsedMs() {
      var day = currentDayKey();
      var base = usage && usage.day === day ? usage.usedMs : 0;
      return base + unsaved + inflightMs;
    }

    function remainingTimeMs() {
      var day = currentDayKey();
      var current = budget.today(usage, day);
      return budget.remainingMs(
        { day: day, usedMs: current.usedMs + unsaved + inflightMs, extraMs: current.extraMs },
        cfg.limitMin,
        day
      );
    }

    function watching() {
      if (!active || isHealthTab(d) || !isVisible() || !onLimitedRoute()) return false;
      if (cfg.limitMin > 0) return remainingTimeMs() > 0;
      return cfg.grayscale === "after" && cfg.grayscaleAfterMin > 0;
    }

    function isNodeInOwnUi(node) {
      if (!node) return false;
      if (hostRecord && (node === hostRecord.host || node === hostRecord.root)) return true;
      if (shadow && typeof shadow.isOwnUi === "function" && shadow.isOwnUi(node)) return true;
      for (var n = node; n; n = n.host || n.parentNode || n.parentElement) {
        if (hostRecord && (n === hostRecord.host || n === hostRecord.root)) return true;
        if (n && typeof n.className === "string" && /\biy-(?:focus|dock|timer|toast|host|shadow)/.test(n.className)) return true;
      }
      return false;
    }

    function ensureHost() {
      var doc = getDoc();
      if (!doc || typeof doc.createElement !== "function") return null;
      if (hostRecord && hostRecord.host) {
        var parent = doc.body || doc.documentElement;
        if (parent && hostRecord.host.parentNode !== parent && hostRecord.host.parentElement !== parent) {
          if (typeof parent.appendChild === "function") parent.appendChild(hostRecord.host);
          else if (typeof parent.append === "function") parent.append(hostRecord.host);
        }
        return hostRecord;
      }

      layerEl = doc.createElement("div");
      layerEl.className = "iy-focus-layer ige-layer";

      if (shadow && typeof shadow.createHost === "function") {
        hostRecord = shadow.createHost({
          document: doc,
          tag: "div",
          className: "iy-focus-limit-host iy-shadow-host",
          baseCss: false,
          css: FOCUS_LIMIT_CSS,
          top: layerEl,
          theme: cfg.theme,
          stopPropagation: true,
          mount: true
        });
      } else {
        var host = doc.createElement("div");
        host.className = "iy-focus-limit-host iy-shadow-host";
        var root = typeof host.attachShadow === "function" ? host.attachShadow({ mode: "closed" }) : host;
        var styleEl = doc.createElement("style");
        styleEl.textContent = FOCUS_LIMIT_CSS;
        if (typeof root.appendChild === "function") {
          root.appendChild(styleEl);
          root.appendChild(layerEl);
        } else if (typeof root.append === "function") {
          root.append(styleEl, layerEl);
        }
        var targetParent = doc.body || doc.documentElement;
        if (targetParent) {
          if (typeof targetParent.appendChild === "function") targetParent.appendChild(host);
          else if (typeof targetParent.append === "function") targetParent.append(host);
        }
        hostRecord = {
          host: host,
          root: root,
          styleEl: styleEl,
          updateTheme: function (themeName) {
            if (themes && typeof themes.themeVars === "function" && host.style) {
              host.style.cssText = themes.themeVars(themeName || cfg.theme);
            }
            if (typeof host.setAttribute === "function") {
              host.setAttribute("data-theme", themeName || cfg.theme);
              host.setAttribute("data-motion", cfg.animations ? "on" : "off");
            }
          },
          destroy: function () {
            if (typeof host.remove === "function") host.remove();
            else if (host.parentNode && typeof host.parentNode.removeChild === "function") host.parentNode.removeChild(host);
          }
        };
      }
      applyLook();
      return hostRecord;
    }

    function applyLook() {
      if (shadow) {
        if (typeof shadow.setTheme === "function") shadow.setTheme(cfg.theme);
        if (typeof shadow.setMotion === "function") shadow.setMotion(cfg.animations);
      }
      if (hostRecord && typeof hostRecord.updateTheme === "function") {
        hostRecord.updateTheme(cfg.theme);
      }
      if (hostRecord && hostRecord.host && typeof hostRecord.host.setAttribute === "function") {
        hostRecord.host.setAttribute("data-motion", cfg.animations ? "on" : "off");
      }
      if (layerEl && typeof layerEl.setAttribute === "function") {
        layerEl.setAttribute("data-motion", cfg.animations ? "on" : "off");
      }
    }

    function destroyHost() {
      if (hostRecord) {
        try { hostRecord.destroy(); } catch (_) {}
      }
      hostRecord = null;
      layerEl = null;
      veilEl = null;
      pillEl = null;
      blockEl = null;
      blockTitleEl = null;
      blockDescEl = null;
      moreBtnEl = null;
      homeBtnEl = null;
      blockLimitRendered = -1;
    }

    function pauseVideos() {
      var doc = getDoc();
      if (!doc || typeof doc.querySelectorAll !== "function") return;
      var videos = doc.querySelectorAll("video") || [];
      for (var i = 0; i < videos.length; i++) {
        var v = videos[i];
        if (v && !v.paused && typeof v.pause === "function") {
          try { v.pause(); } catch (_) {}
        }
      }
    }

    function goHome() {
      var doc = getDoc();
      var loc = getLoc();
      if (doc && typeof doc.querySelectorAll === "function") {
        var links = doc.querySelectorAll('a[href="/"]') || [];
        for (var i = 0; i < links.length; i++) {
          var a = links[i];
          if (!a) continue;
          var rect = typeof a.getBoundingClientRect === "function" ? a.getBoundingClientRect() : { width: 1 };
          if (rect && rect.width > 0 && typeof a.click === "function") {
            a.click();
            return;
          }
        }
      }
      if (loc && typeof loc.assign === "function") {
        loc.assign("/");
      } else if (loc) {
        loc.pathname = "/";
        loc.href = "/";
      }
    }

    function flush() {
      if (!unsaved || isHealthTab(d)) {
        if (isHealthTab(d)) {
          unsaved = 0;
          inflightMs = 0;
        }
        return enqueueOp(function (done) { done(); });
      }
      var ms = unsaved;
      unsaved = 0;
      inflightMs += ms;
      lastFlush = nowEpoch();
      var chromeApi = getChrome();
      return enqueueOp(function (done) {
        if (isHealthTab(d)) {
          inflightMs = Math.max(0, inflightMs - ms);
          done();
          return;
        }
        readLocal(chromeApi, budget.FOCUS_KEY, function (readErr, data) {
          if (readErr) {
            inflightMs = Math.max(0, inflightMs - ms);
            unsaved += ms;
            done();
            return;
          }
          var day = currentDayKey();
          var stored = data && data[budget.FOCUS_KEY];
          var next = budget.addUsage(stored, day, ms);
          inflightMs = Math.max(0, inflightMs - ms);
          usage = next;
          writeLocal(chromeApi, { [budget.FOCUS_KEY]: next }, function (writeErr) {
            if (writeErr) {
              usage = budget.today(stored, day);
              unsaved += ms;
            }
            done();
          });
        });
      });
    }

    function moreTime() {
      if (isHealthTab(d)) return Promise.resolve();
      var pending = unsaved;
      unsaved = 0;
      inflightMs += pending;
      lastFlush = nowEpoch();
      var chromeApi = getChrome();
      return enqueueOp(function (done) {
        readLocal(chromeApi, budget.FOCUS_KEY, function (_readErr, data) {
          var todayKey = currentDayKey();
          var stored = data && data[budget.FOCUS_KEY];
          var base = stored !== undefined ? stored : usage;
          var withUsage = pending > 0 ? budget.addUsage(base, todayKey, pending) : budget.today(base, todayKey);
          var next = budget.addExtra(withUsage, todayKey);
          inflightMs = Math.max(0, inflightMs - pending);
          usage = next;
          if (active) render();
          writeLocal(chromeApi, { [budget.FOCUS_KEY]: next }, function () {
            if (active) render();
            done();
          });
        });
      });
    }

    function buildBlockScreen(doc) {
      var chromeApi = getChrome();
      var lang = detectLocale(d, chromeApi, doc);
      var block = doc.createElement("div");
      block.className = "iy-focus-block ige-focus-block";
      block.setAttribute("role", "dialog");
      block.setAttribute("aria-modal", "true");
      block.setAttribute("aria-labelledby", "iy-focus-limit-title");
      block.setAttribute("aria-describedby", "iy-focus-limit-desc");
      block.addEventListener("wheel", function (e) {
        if (e && typeof e.preventDefault === "function") e.preventDefault();
      });

      var card = doc.createElement("div");
      card.className = "iy-focus-card ige-focus-card";

      var title = doc.createElement("h2");
      title.id = "iy-focus-limit-title";
      title.textContent = translate("focusLimitTitle", [], d, chromeApi, doc);

      var desc = doc.createElement("p");
      desc.id = "iy-focus-limit-desc";
      var formattedLimit = formatDurationLeft(cfg.limitMin * 60000, lang, budget);
      desc.textContent = translate("focusLimitBody", [formattedLimit], d, chromeApi, doc);

      var actions = doc.createElement("div");
      actions.className = "iy-focus-actions ige-focus-actions";

      var moreBtn = doc.createElement("button");
      moreBtn.type = "button";
      moreBtn.className = "iy-focus-btn iy-focus-btn--ghost ige-btn ige-btn--ghost";
      moreBtn.setAttribute("data-action", "more");
      moreBtn.textContent = translate("focusLimitMore", [], d, chromeApi, doc);
      moreBtn.addEventListener("click", function (e) {
        if (e && typeof e.preventDefault === "function") e.preventDefault();
        if (e && typeof e.stopPropagation === "function") e.stopPropagation();
        moreTime();
      });

      var homeBtn = doc.createElement("button");
      homeBtn.type = "button";
      homeBtn.className = "iy-focus-btn iy-focus-btn--primary ige-btn ige-btn--primary";
      homeBtn.setAttribute("data-action", "home");
      homeBtn.textContent = translate("focusLimitHome", [], d, chromeApi, doc);
      homeBtn.addEventListener("click", function (e) {
        if (e && typeof e.preventDefault === "function") e.preventDefault();
        if (e && typeof e.stopPropagation === "function") e.stopPropagation();
        goHome();
      });

      actions.appendChild(moreBtn);
      actions.appendChild(homeBtn);
      card.appendChild(title);
      card.appendChild(desc);
      card.appendChild(actions);
      block.appendChild(card);

      blockTitleEl = title;
      blockDescEl = desc;
      moreBtnEl = moreBtn;
      homeBtnEl = homeBtn;
      blockLimitRendered = cfg.limitMin;

      raf(function () {
        if (block.classList && typeof block.classList.add === "function") {
          block.classList.add("is-in");
        }
        if (typeof homeBtn.focus === "function") {
          try { homeBtn.focus(); } catch (_) {}
        }
      });

      return block;
    }

    function updateBlockCopy(doc) {
      if (!blockEl || !blockTitleEl || !blockDescEl || !moreBtnEl || !homeBtnEl) return;
      var chromeApi = getChrome();
      var lang = detectLocale(d, chromeApi, doc);
      blockTitleEl.textContent = translate("focusLimitTitle", [], d, chromeApi, doc);
      var formattedLimit = formatDurationLeft(cfg.limitMin * 60000, lang, budget);
      blockDescEl.textContent = translate("focusLimitBody", [formattedLimit], d, chromeApi, doc);
      moreBtnEl.textContent = translate("focusLimitMore", [], d, chromeApi, doc);
      homeBtnEl.textContent = translate("focusLimitHome", [], d, chromeApi, doc);
      blockLimitRendered = cfg.limitMin;
    }

    function removeChildNode(node) {
      if (!node) return;
      if (typeof node.remove === "function") node.remove();
      else if (node.parentNode && typeof node.parentNode.removeChild === "function") node.parentNode.removeChild(node);
    }

    function render() {
      if (!active || isHealthTab(d)) {
        destroyHost();
        return;
      }
      var doc = getDoc();
      if (!doc) return;

      var day = currentDayKey();
      if (usage.day !== day) {
        usage = budget.today(undefined, day);
        unsaved = 0;
        inflightMs = 0;
      }

      var onLimited = onLimitedRoute();
      var remaining = remainingTimeMs();
      var usedTotal = totalUsedMs();
      var showVeil = shouldShowGrayscale(cfg, onLimited, usedTotal, remaining);
      var showBlock = onLimited && cfg.limitMin > 0 && remaining <= 0;
      var showPill = onLimited && !showBlock && cfg.limitMin > 0 && cfg.showTimer;

      if (!showVeil && !showBlock && !showPill) {
        if (veilEl) { removeChildNode(veilEl); veilEl = null; }
        if (pillEl) { removeChildNode(pillEl); pillEl = null; }
        if (blockEl) { removeChildNode(blockEl); blockEl = null; blockLimitRendered = -1; }
        return;
      }

      ensureHost();
      if (!layerEl) return;

      if (showVeil) {
        if (!veilEl) {
          veilEl = doc.createElement("div");
          veilEl.className = "iy-focus-veil ige-focus-veil";
          veilEl.setAttribute("aria-hidden", "true");
          if (typeof layerEl.prepend === "function") layerEl.prepend(veilEl);
          else layerEl.appendChild(veilEl);
        }
      } else if (veilEl) {
        removeChildNode(veilEl);
        veilEl = null;
      }

      if (showBlock) {
        if (!blockEl) {
          blockEl = buildBlockScreen(doc);
          layerEl.appendChild(blockEl);
        } else if (blockLimitRendered !== cfg.limitMin) {
          updateBlockCopy(doc);
        }
        pauseVideos();
      } else if (blockEl) {
        removeChildNode(blockEl);
        blockEl = null;
        blockTitleEl = null;
        blockDescEl = null;
        moreBtnEl = null;
        homeBtnEl = null;
        blockLimitRendered = -1;
      }

      if (showPill) {
        var chromeApi = getChrome();
        var lang = detectLocale(d, chromeApi, doc);
        if (!pillEl) {
          pillEl = doc.createElement("div");
          pillEl.className = "iy-focus-pill ige-focus-pill";
          pillEl.setAttribute("role", "timer");
          pillEl.setAttribute("aria-live", "off");
          layerEl.appendChild(pillEl);
        }
        var timeStr = formatDurationLeft(remaining, lang, budget);
        var text = translate("focusLimitPill", [timeStr], d, chromeApi, doc);
        if (pillEl.textContent !== text) pillEl.textContent = text;
        var isLow = remaining < LOW_TIME_MS;
        if (pillEl.classList && typeof pillEl.classList.toggle === "function") {
          pillEl.classList.toggle("is-low", isLow);
        }
        pillEl.setAttribute("data-low", isLow ? "true" : "false");
      } else if (pillEl) {
        removeChildNode(pillEl);
        pillEl = null;
      }
    }

    function tick() {
      if (!active || isHealthTab(d)) return;
      var now = nowPerf();
      var dt = now - lastTick;
      lastTick = now;

      var day = currentDayKey();
      if (usage.day !== day) {
        usage = budget.today(undefined, day);
        unsaved = 0;
        inflightMs = 0;
      }

      if (watching() && dt > 0 && dt <= MAX_TICK_MS) {
        unsaved += dt;
      }
      if (unsaved > 0 && nowEpoch() - lastFlush >= FLUSH_MS) {
        flush();
      }
      render();
    }

    function onKey(e) {
      if (!active || !blockEl || !e) return;
      if (e.key === "Tab" && moreBtnEl && homeBtnEl) {
        var rootActive = hostRecord && hostRecord.root && hostRecord.root.activeElement;
        if (e.shiftKey) {
          if (rootActive === moreBtnEl || !rootActive) {
            if (typeof e.preventDefault === "function") e.preventDefault();
            if (typeof homeBtnEl.focus === "function") homeBtnEl.focus();
            return;
          }
        } else if (rootActive === homeBtnEl || !rootActive) {
          if (typeof e.preventDefault === "function") e.preventDefault();
          if (typeof moreBtnEl.focus === "function") moreBtnEl.focus();
          return;
        }
      }
      if (isNodeInOwnUi(e.target)) return;
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
      if (typeof e.stopPropagation === "function") e.stopPropagation();
      if (typeof e.preventDefault === "function") e.preventDefault();
    }

    function shouldRunTimer() {
      if (!active || isHealthTab(d) || !isVisible() || !onLimitedRoute()) return false;
      return cfg.limitMin > 0 || (cfg.grayscale === "after" && cfg.grayscaleAfterMin > 0);
    }

    function syncTimer() {
      if (shouldRunTimer()) {
        if (!timerId) {
          lastTick = nowPerf();
          timerId = setInt(tick, TICK_MS);
        }
      } else if (timerId) {
        clearInt(timerId);
        timerId = 0;
      }
    }

    function onVisibilityChange() {
      if (!active) return;
      if (!isVisible()) {
        flush();
      }
      lastTick = nowPerf();
      syncTimer();
      render();
    }

    function onPageHide() {
      if (!active) return;
      flush();
    }

    function onRouteChange() {
      if (!active) return;
      lastTick = nowPerf();
      syncTimer();
      render();
    }

    function onStorageChange(changes, area) {
      if (!active || area !== "local" || !changes || !(budget.FOCUS_KEY in changes)) return;
      usage = budget.today(changes[budget.FOCUS_KEY].newValue, currentDayKey());
      render();
    }

    function attachListener(target, type, fn, opts) {
      if (!target || typeof target.addEventListener !== "function") return;
      var core = getCore();
      if (core && typeof core.listen === "function") {
        cleanups.push(core.listen(target, type, fn, opts));
      } else {
        target.addEventListener(type, fn, opts);
        cleanups.push(function () {
          try { target.removeEventListener(type, fn, opts); } catch (_) {}
        });
      }
    }

    function start(settings) {
      if (!isEnabled(settings, d)) {
        stop();
        return;
      }
      cfg = normalizeSettings(settings);
      if (active) {
        applyLook();
        render();
        return;
      }
      active = true;
      activeControllers.add(controllerApi);
      var gen = ++generation;
      var day = currentDayKey();
      usage = budget.today(usage, day);
      lastTick = nowPerf();
      lastFlush = nowEpoch();

      var core = getCore();
      var doc = getDoc();
      var win = getWin();
      var chromeApi = getChrome();

      cleanups.push(function () {
        clearInt(timerId);
        timerId = 0;
      });
      syncTimer();

      if (core && typeof core.route === "function") {
        cleanups.push(core.route(onRouteChange));
      }
      if (core && typeof core.onStorage === "function") {
        cleanups.push(core.onStorage(onStorageChange));
      } else if (chromeApi && chromeApi.storage && chromeApi.storage.onChanged && typeof chromeApi.storage.onChanged.addListener === "function") {
        chromeApi.storage.onChanged.addListener(onStorageChange);
        cleanups.push(function () {
          try { chromeApi.storage.onChanged.removeListener(onStorageChange); } catch (_) {}
        });
      }

      if (doc) attachListener(doc, "visibilitychange", onVisibilityChange);
      if (win) {
        attachListener(win, "pagehide", onPageHide);
        attachListener(win, "keydown", onKey, true);
      }

      render();

      enqueueOp(function (done) {
        readLocal(chromeApi, budget.FOCUS_KEY, function (_err, data) {
          if (!active || gen !== generation || isHealthTab(d)) {
            done();
            return;
          }
          var todayKey = currentDayKey();
          var stored = budget.today(data && data[budget.FOCUS_KEY], todayKey);
          var current = budget.today(usage, todayKey);
          usage = {
            day: todayKey,
            usedMs: Math.max(stored.usedMs, current.usedMs),
            extraMs: Math.max(stored.extraMs, current.extraMs)
          };
          render();
          done();
        });
      });
    }

    function update(settings) {
      if (!isEnabled(settings, d)) {
        stop();
        return;
      }
      cfg = normalizeSettings(settings);
      if (!active) {
        start(settings);
        return;
      }
      applyLook();
      syncTimer();
      if (blockEl) updateBlockCopy(getDoc());
      render();
    }

    function stop() {
      var wasActive = active;
      active = false;
      activeControllers.delete(controllerApi);
      generation++;
      if (wasActive && unsaved > 0 && !isHealthTab(d)) {
        flush();
      } else {
        unsaved = 0;
      }
      while (cleanups.length) {
        var fn = cleanups.pop();
        try { fn(); } catch (_) {}
      }
      destroyHost();
    }

    var controllerApi = {
      start: start,
      update: update,
      stop: stop,
      tick: tick,
      render: render,
      flush: flush,
      moreTime: moreTime,
      goHome: goHome,
      onKey: onKey,
      onRouteChange: onRouteChange,
      onVisibilityChange: onVisibilityChange,
      onStorageChange: onStorageChange,
      isActive: function () { return active; },
      isBlocked: function () { return Boolean(blockEl); },
      isPillVisible: function () { return Boolean(pillEl); },
      isVeilVisible: function () { return Boolean(veilEl); },
      getRemainingMs: remainingTimeMs,
      getFormattedRemaining: function (locale) {
        var lang = locale || detectLocale(d, getChrome(), getDoc());
        return formatDurationLeft(remainingTimeMs(), lang, budget);
      },
      getUsage: function () {
        var day = currentDayKey();
        var cur = budget.today(usage, day);
        return { day: day, usedMs: cur.usedMs + unsaved + inflightMs, extraMs: cur.extraMs };
      },
      getSettings: function () { return Object.assign({}, cfg); },
      getElements: function () {
        return {
          host: hostRecord ? hostRecord.host : null,
          root: hostRecord ? hostRecord.root : null,
          layer: layerEl,
          veil: veilEl,
          pill: pillEl,
          block: blockEl,
          moreBtn: moreBtnEl,
          homeBtn: homeBtnEl
        };
      }
    };
    return controllerApi;
  }

  var defaultController = null;

  function setHealthTab(flag) {
    moduleHealthTab = flag === true;
    if (moduleHealthTab) {
      activeControllers.forEach(function (ctrl) {
        try { ctrl.stop(); } catch (_) {}
      });
    }
    return moduleHealthTab;
  }

  function registerFeature(core) {
    var iyCore = core || (globalThis.IY && globalThis.IY.core);
    if (!iyCore || typeof iyCore.feature !== "function") return null;
    if (!defaultController) defaultController = createController();
    iyCore.feature("focusLimit", {
      keys: ["ui"],
      enabled: function (settings) { return isEnabled(settings); },
      start: function (settings) { defaultController.start(settings); },
      update: function (settings) { defaultController.update(settings); },
      stop: function () { defaultController.stop(); }
    });
    return defaultController;
  }

  var api = {
    TICK_MS: TICK_MS,
    FLUSH_MS: FLUSH_MS,
    MAX_TICK_MS: MAX_TICK_MS,
    LOW_TIME_MS: LOW_TIME_MS,
    DEFAULT_PRESET_MIN: DEFAULT_PRESET_MIN,
    MESSAGES: MESSAGES,
    FOCUS_LIMIT_CSS: FOCUS_LIMIT_CSS,
    normalizeSettings: normalizeSettings,
    isEnabled: isEnabled,
    isHealthTab: isHealthTab,
    setHealthTab: setHealthTab,
    shouldShowGrayscale: shouldShowGrayscale,
    formatDurationLeft: formatDurationLeft,
    createController: createController,
    registerFeature: registerFeature,
    getController: function () { return defaultController; }
  };

  globalThis.IY = globalThis.IY || {};
  globalThis.IY.focusLimit = api;
  if (typeof globalThis.IY.setHealthTab !== "function") {
    globalThis.IY.setHealthTab = function (flag) {
      globalThis.IY.isHealthTab = flag === true;
      if (globalThis.IY.focusLimit && typeof globalThis.IY.focusLimit.setHealthTab === "function") {
        globalThis.IY.focusLimit.setHealthTab(flag);
      }
      if (globalThis.IY.reelCounter && typeof globalThis.IY.reelCounter.setHealthTab === "function") {
        globalThis.IY.reelCounter.setHealthTab(flag);
      }
      return globalThis.IY.isHealthTab;
    };
  }
  if (globalThis.IY.core && typeof globalThis.IY.core.feature === "function") {
    registerFeature(globalThis.IY.core);
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
