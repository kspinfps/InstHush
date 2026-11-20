// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
// Daily unique reel counter ("Bugün N reel"): deduped by reel ID per local calendar day via
// src/lib/focus-budget.js and anchored to the active reel video without layout thrash.
(function () {
  "use strict";

  var VIDEO_LOOKUP_MS = 200;
  var MIN_VIDEO_SIZE = 120;
  var BADGE_OFFSET_X = 12;
  var BADGE_OFFSET_Y = 12;

  var RESERVED_FIRST_SEGMENTS = new Set([
    "accounts", "explore", "direct", "about", "developer", "legal", "emails", "challenge",
    "stories", "p", "tv", "web", "session", "privacy", "terms", "press", "api", "graphql",
    "oauth", "nametag", "lite", "your_activity", "notifications", "threads", "settings",
    "archive", "create", "login", "signup", "help", "ads", "business", "static"
  ]);

  var MESSAGES = {
    tr: {
      reelCounterBadge: "Bugün $1 reel",
      reelCounterBadgeOne: "Bugün $1 reel",
      reelCounterAria: "Bugün $1 reel"
    },
    en: {
      reelCounterBadge: "$1 reels today",
      reelCounterBadgeOne: "$1 reel today",
      reelCounterAria: "Reel $1 today"
    }
  };

  var REEL_COUNTER_CSS = `:host {
  all: initial;
  position: fixed;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  z-index: 2147482999;
  pointer-events: none;
  font: 600 12px/1.2 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
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
.iy-reels, .ige-reels {
  position: fixed;
  top: 0;
  left: 0;
  display: inline-flex;
  align-items: baseline;
  gap: 0;
  padding: 5px 11px;
  border-radius: 999px;
  border: 1px solid var(--iy-hairline, #FFFFFF1F);
  background: var(--iy-glass, #171D19EB);
  color: var(--iy-text, #EAF0E8);
  box-shadow: 0 2px 4px #00000026, 0 8px 24px #00000033;
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  pointer-events: none;
  user-select: none;
  -webkit-user-select: none;
  white-space: nowrap;
  visibility: hidden;
  will-change: transform;
}
.iy-reels__prefix, .iy-reels__label, .ige-reels__label {
  font-size: 12px;
  font-weight: 600;
  opacity: 0.88;
  white-space: pre;
}
.iy-reels__num, .ige-reels__num {
  display: inline-block;
  font-size: 15px;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
  color: var(--iy-accent, #9DCEAB);
}
.iy-reels.is-bump .iy-reels__num {
  animation: iy-reels-bump-a 320ms cubic-bezier(0.2, 0.9, 0.3, 1);
}
.iy-reels.is-bump.is-bump-alt .iy-reels__num {
  animation: iy-reels-bump-b 320ms cubic-bezier(0.2, 0.9, 0.3, 1);
}
@keyframes iy-reels-bump-a {
  40% { transform: scale(1.32); }
}
@keyframes iy-reels-bump-b {
  40% { transform: scale(1.32); }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
  }
}
:host([data-motion="off"]) *, :host([data-motion="off"]) *::before, :host([data-motion="off"]) *::after,
[data-motion="off"], [data-motion="off"] *, [data-motion="off"] *::before, [data-motion="off"] *::after {
  animation: none !important;
  transition: none !important;
}
@media (forced-colors: active) {
  .iy-reels {
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

  function normalizeSettings(raw) {
    var s = raw && typeof raw === "object" ? raw : {};
    var ui = s.ui && typeof s.ui === "object" && !Array.isArray(s.ui) ? s.ui : s;
    var enabled = ui.reelCounter === true || s["focus.reelCounter"] === true;
    var theme = typeof ui.theme === "string" && ui.theme ? ui.theme : (typeof s["ui.theme"] === "string" ? s["ui.theme"] : "green");
    var animations = ui.animations !== undefined ? ui.animations !== false : (s["ui.animations"] !== undefined ? s["ui.animations"] !== false : true);
    return {
      enabled: enabled,
      theme: theme,
      animations: animations
    };
  }

  function isEnabled(settings, deps) {
    if (isHealthTab(deps, settings)) return false;
    return normalizeSettings(settings).enabled;
  }

  function validReelId(id) {
    return typeof id === "string" && /^[A-Za-z0-9_-]+$/.test(id);
  }

  function cleanPathname(pathname) {
    if (typeof pathname !== "string") return "";
    return pathname.split(/[?#]/)[0];
  }

  function isReelRoute(pathname) {
    var clean = cleanPathname(pathname);
    if (!clean) return false;
    var parts = clean.split("/").filter(Boolean);
    var a = parts[0];
    var b = parts[1];
    var c = parts[2];
    if (!a) return false;
    if (a === "reels") return !b || validReelId(b);
    if (a === "reel") return Boolean(b && validReelId(b));
    if (!RESERVED_FIRST_SEGMENTS.has(a.toLowerCase()) && (b === "reel" || b === "reels") && c && validReelId(c)) {
      return true;
    }
    return false;
  }

  function extractReelCodeFromPath(pathname) {
    var clean = cleanPathname(pathname);
    if (!clean) return undefined;
    var parts = clean.split("/").filter(Boolean);
    var a = parts[0];
    var b = parts[1];
    var c = parts[2];
    if (!a) return undefined;
    if ((a === "reels" || a === "reel") && b && validReelId(b)) return b;
    if (!RESERVED_FIRST_SEGMENTS.has(a.toLowerCase()) && (b === "reel" || b === "reels") && c && validReelId(c)) {
      return c;
    }
    return undefined;
  }

  function extractReelCodeFromVideoDom(video, doc) {
    if (!video) return undefined;
    var stopAt = doc && (doc.body || doc.documentElement);
    var cur = video.parentElement || video.parentNode;
    for (var depth = 0; cur && cur !== stopAt && depth < 8; depth++, cur = cur.parentElement || cur.parentNode) {
      if (typeof cur.querySelectorAll !== "function") continue;
      var links = cur.querySelectorAll('a[href*="/reel/"], a[href*="/reels/"]') || [];
      for (var i = 0; i < links.length; i++) {
        var href = links[i] && typeof links[i].getAttribute === "function"
          ? links[i].getAttribute("href")
          : (links[i] && links[i].href);
        if (typeof href !== "string" || !href) continue;
        var m = /\/(?:reel|reels)\/([A-Za-z0-9_-]+)(?:\/|$|[?#])/.exec(href);
        if (m && validReelId(m[1])) return m[1];
      }
    }
    return undefined;
  }

  function nearestVideo(doc, win) {
    if (!doc || typeof doc.querySelectorAll !== "function") return undefined;
    var viewportHeight = Number(win && win.innerHeight) > 0
      ? Number(win.innerHeight)
      : (typeof innerHeight === "number" && innerHeight > 0 ? innerHeight : 800);
    var mid = viewportHeight / 2;
    var videos = doc.querySelectorAll("video") || [];
    var best;
    var bestDist = Infinity;

    for (var i = 0; i < videos.length; i++) {
      var v = videos[i];
      if (!v || v.isConnected === false || typeof v.getBoundingClientRect !== "function") continue;
      var r = v.getBoundingClientRect();
      if (!r || r.width < MIN_VIDEO_SIZE || r.height < MIN_VIDEO_SIZE) continue;
      var bottom = r.bottom !== undefined ? r.bottom : r.top + r.height;
      if (bottom <= 0 || r.top >= viewportHeight) continue;
      var dist = Math.abs(r.top + r.height / 2 - mid);
      if (dist < bestDist) {
        best = v;
        bestDist = dist;
      }
    }
    return best;
  }

  function formatBadgeParts(count, locale, deps, chromeApi, doc) {
    var lang = locale || detectLocale(deps, chromeApi, doc);
    var n = Number.isFinite(Number(count)) && Number(count) >= 0 ? Math.floor(Number(count)) : 0;
    var token = "\u0000";
    var key = n === 1 ? "reelCounterBadgeOne" : "reelCounterBadge";
    var template = "";

    try {
      if (chromeApi && chromeApi.i18n && typeof chromeApi.i18n.getMessage === "function") {
        var fromI18n = chromeApi.i18n.getMessage(key, [token]) || chromeApi.i18n.getMessage("reelCounterBadge", [token]);
        if (typeof fromI18n === "string" && fromI18n) {
          template = fromI18n.replace("$1", token);
        }
      }
    } catch (_) {}

    if (!template) {
      var table = MESSAGES[lang] || MESSAGES.tr;
      var raw = table[key] || table.reelCounterBadge || MESSAGES.tr.reelCounterBadge;
      template = raw.replace("$1", token);
    }

    var idx = template.indexOf(token);
    var prefix = idx >= 0 ? template.slice(0, idx) : "";
    var suffix = idx >= 0 ? template.slice(idx + token.length) : (" " + template);
    var numStr = String(n);
    var text = prefix + numStr + suffix;

    var aria = text;
    try {
      if (chromeApi && chromeApi.i18n && typeof chromeApi.i18n.getMessage === "function") {
        var ariaMsg = chromeApi.i18n.getMessage("reelCounterAria", [numStr]);
        if (typeof ariaMsg === "string" && ariaMsg) {
          aria = ariaMsg.replace("$1", numStr);
        }
      }
    } catch (_) {}
    if (aria === text && lang === "en" && (!chromeApi || !chromeApi.i18n || !chromeApi.i18n.getMessage("reelCounterAria", [numStr]))) {
      aria = MESSAGES.en.reelCounterAria.replace("$1", numStr);
    }

    return {
      prefix: prefix,
      num: numStr,
      suffix: suffix,
      text: text,
      aria: aria
    };
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

  function createController(deps) {
    var d = deps || {};
    var budget = getBudgetApi(d);
    var shadow = getShadowApi(d);
    var themes = getThemesApi(d);

    var active = false;
    var generation = 0;
    var cfg = normalizeSettings({});
    var tally = budget.reelTally(undefined, currentDayKey());
    var sessionCodes = [];
    var currentCode;
    var cachedVideo;
    var videoAt = 0;
    var frameId = 0;
    var bumpParity = false;
    var lastX = null;
    var lastY = null;
    var lastVisible = false;

    var opRunning = false;
    var opQueue = [];
    var cleanups = [];

    var hostRecord = null;
    var badgeEl = null;
    var prefixEl = null;
    var numEl = null;
    var labelEl = null;

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

    function raf(fn) {
      if (typeof d.requestAnimationFrame === "function") return d.requestAnimationFrame(fn);
      if (typeof requestAnimationFrame === "function") return requestAnimationFrame(fn);
      return setTimeout(fn, 16);
    }

    function caf(id) {
      if (!id) return;
      if (typeof d.cancelAnimationFrame === "function") { d.cancelAnimationFrame(id); return; }
      if (typeof cancelAnimationFrame === "function") { cancelAnimationFrame(id); return; }
      clearTimeout(id);
    }

    function isVisible() {
      var doc = getDoc();
      if (!doc) return true;
      if (typeof doc.visibilityState === "string") return doc.visibilityState === "visible";
      return !doc.hidden;
    }

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

    function checkDayRollover() {
      var day = currentDayKey();
      if (tally.day !== day) {
        tally = budget.reelTally(undefined, day);
        sessionCodes = [];
        currentCode = undefined;
      }
      return day;
    }

    function rememberSessionCode(code) {
      if (!validReelId(code)) return;
      if (sessionCodes.indexOf(code) === -1) {
        sessionCodes.push(code);
        if (sessionCodes.length > budget.MAX_SEEN) sessionCodes.shift();
      }
    }

    function mergeWithSession(stored, day) {
      var next = budget.reelTally(stored, day);
      for (var i = 0; i < sessionCodes.length; i++) {
        next = budget.addReel(next, day, sessionCodes[i]);
      }
      return next;
    }

    function reelVideo() {
      var now = nowPerf();
      if (cachedVideo && cachedVideo.isConnected !== false && now - videoAt < VIDEO_LOOKUP_MS) {
        return cachedVideo;
      }
      videoAt = now;
      cachedVideo = nearestVideo(getDoc(), getWin());
      return cachedVideo;
    }

    function resolveReelCode(video) {
      var loc = getLoc();
      var pathname = loc && loc.pathname;
      if (!isReelRoute(pathname)) return undefined;
      var fromPath = extractReelCodeFromPath(pathname);
      if (fromPath) return fromPath;
      return extractReelCodeFromVideoDom(video, getDoc());
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

      badgeEl = doc.createElement("div");
      badgeEl.className = "iy-reels ige-reels";
      badgeEl.setAttribute("role", "status");
      badgeEl.setAttribute("aria-live", "off");

      prefixEl = doc.createElement("span");
      prefixEl.className = "iy-reels__prefix";

      numEl = doc.createElement("span");
      numEl.className = "iy-reels__num ige-reels__num";

      labelEl = doc.createElement("span");
      labelEl.className = "iy-reels__label ige-reels__label";

      badgeEl.appendChild(prefixEl);
      badgeEl.appendChild(numEl);
      badgeEl.appendChild(labelEl);

      if (shadow && typeof shadow.createHost === "function") {
        hostRecord = shadow.createHost({
          document: doc,
          tag: "div",
          className: "iy-reel-counter-host iy-shadow-host",
          baseCss: false,
          css: REEL_COUNTER_CSS,
          top: badgeEl,
          theme: cfg.theme,
          stopPropagation: false,
          mount: true
        });
      } else {
        var host = doc.createElement("div");
        host.className = "iy-reel-counter-host iy-shadow-host";
        var root = typeof host.attachShadow === "function" ? host.attachShadow({ mode: "closed" }) : host;
        var styleEl = doc.createElement("style");
        styleEl.textContent = REEL_COUNTER_CSS;
        if (typeof root.appendChild === "function") {
          root.appendChild(styleEl);
          root.appendChild(badgeEl);
        } else if (typeof root.append === "function") {
          root.append(styleEl, badgeEl);
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

      lastX = null;
      lastY = null;
      lastVisible = false;
      applyLook();
      updateBadgeText();
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
      if (badgeEl && typeof badgeEl.setAttribute === "function") {
        badgeEl.setAttribute("data-motion", cfg.animations ? "on" : "off");
      }
    }

    function destroyHost() {
      if (hostRecord) {
        try { hostRecord.destroy(); } catch (_) {}
      }
      hostRecord = null;
      badgeEl = null;
      prefixEl = null;
      numEl = null;
      labelEl = null;
      lastX = null;
      lastY = null;
      lastVisible = false;
    }

    function updateBadgeText() {
      if (!badgeEl || !numEl || !labelEl || !prefixEl) return;
      var doc = getDoc();
      var chromeApi = getChrome();
      var lang = detectLocale(d, chromeApi, doc);
      var parts = formatBadgeParts(tally.count, lang, d, chromeApi, doc);

      if (prefixEl.textContent !== parts.prefix) prefixEl.textContent = parts.prefix;
      prefixEl.hidden = !parts.prefix;
      if (numEl.textContent !== parts.num) numEl.textContent = parts.num;
      if (labelEl.textContent !== parts.suffix) labelEl.textContent = parts.suffix;
      badgeEl.setAttribute("aria-label", parts.aria);
    }

    function bumpBadge() {
      updateBadgeText();
      if (!badgeEl || !badgeEl.classList) return;
      // Zero forced layout reflow: toggle alternating CSS animation classes instead of reading offsetWidth.
      bumpParity = !bumpParity;
      badgeEl.classList.add("is-bump");
      badgeEl.classList.toggle("is-bump-alt", bumpParity);
    }

    function hideBadge() {
      if (badgeEl && lastVisible) {
        badgeEl.style.visibility = "hidden";
        lastVisible = false;
      }
    }

    function countReel(code) {
      if (!active || isHealthTab(d) || !validReelId(code)) return Promise.resolve(tally);
      var day = checkDayRollover();
      var prevCount = tally.count;
      rememberSessionCode(code);
      tally = budget.addReel(tally, day, code);
      if (tally.count !== prevCount) {
        bumpBadge();
      } else {
        updateBadgeText();
      }

      var chromeApi = getChrome();
      return enqueueOp(function (done) {
        if (isHealthTab(d)) {
          done();
          return;
        }
        readLocal(chromeApi, budget.REELS_KEY, function (_err, data) {
          var todayKey = checkDayRollover();
          var stored = data && data[budget.REELS_KEY];
          var merged = mergeWithSession(stored, todayKey);
          tally = budget.addReel(merged, todayKey, code);
          updateBadgeText();
          writeLocal(chromeApi, { [budget.REELS_KEY]: tally }, function () {
            updateBadgeText();
            done();
          });
        });
      });
    }

    function place() {
      frameId = 0;
      if (!active || isHealthTab(d)) {
        hideBadge();
        return;
      }
      var loc = getLoc();
      if (!isReelRoute(loc && loc.pathname)) {
        currentCode = undefined;
        hideBadge();
        return;
      }
      if (!isVisible()) {
        hideBadge();
        return;
      }

      checkDayRollover();
      var v = reelVideo();
      var code = resolveReelCode(v);
      if (!v || !code) {
        hideBadge();
        frameId = raf(place);
        return;
      }

      ensureHost();
      if (code !== currentCode) {
        currentCode = code;
        countReel(code);
      } else {
        updateBadgeText();
      }

      if (badgeEl) {
        var r = v.getBoundingClientRect();
        var x = Math.round(Math.max(Number(r.left) || 0, 0) + BADGE_OFFSET_X);
        var y = Math.round(Math.max(Number(r.top) || 0, 0) + BADGE_OFFSET_Y);
        if (x !== lastX || y !== lastY) {
          lastX = x;
          lastY = y;
          badgeEl.style.transform = "translate(" + x + "px, " + y + "px)";
        }
        if (!lastVisible) {
          badgeEl.style.visibility = "visible";
          lastVisible = true;
        }
      }

      frameId = raf(place);
    }

    function stopLoop() {
      if (frameId) {
        caf(frameId);
        frameId = 0;
      }
    }

    function watch() {
      if (!active || isHealthTab(d)) {
        stopLoop();
        hideBadge();
        return;
      }
      videoAt = 0;
      var loc = getLoc();
      var onReel = isReelRoute(loc && loc.pathname);
      if (!onReel) {
        stopLoop();
        currentCode = undefined;
        hideBadge();
        return;
      }
      if (!isVisible()) {
        stopLoop();
        hideBadge();
        return;
      }
      if (!frameId) {
        frameId = raf(place);
      }
    }

    function onStorageChange(changes, area) {
      if (!active || area !== "local" || !changes || !(budget.REELS_KEY in changes)) return;
      var day = checkDayRollover();
      tally = mergeWithSession(changes[budget.REELS_KEY].newValue, day);
      updateBadgeText();
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
        updateBadgeText();
        watch();
        return;
      }

      active = true;
      activeControllers.add(controllerApi);
      var gen = ++generation;
      var day = currentDayKey();
      tally = budget.reelTally(tally, day);
      currentCode = undefined;
      cachedVideo = undefined;
      videoAt = 0;

      var core = getCore();
      var doc = getDoc();
      var chromeApi = getChrome();

      if (core && typeof core.route === "function") {
        cleanups.push(core.route(watch));
      }
      if (core && typeof core.onStorage === "function") {
        cleanups.push(core.onStorage(onStorageChange));
      } else if (chromeApi && chromeApi.storage && chromeApi.storage.onChanged && typeof chromeApi.storage.onChanged.addListener === "function") {
        chromeApi.storage.onChanged.addListener(onStorageChange);
        cleanups.push(function () {
          try { chromeApi.storage.onChanged.removeListener(onStorageChange); } catch (_) {}
        });
      }

      if (doc) attachListener(doc, "visibilitychange", watch);

      enqueueOp(function (done) {
        readLocal(chromeApi, budget.REELS_KEY, function (_err, data) {
          if (!active || gen !== generation || isHealthTab(d)) {
            done();
            return;
          }
          var todayKey = checkDayRollover();
          var stored = data && data[budget.REELS_KEY];
          tally = mergeWithSession(stored, todayKey);
          updateBadgeText();
          done();
        });
      });

      watch();
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
      updateBadgeText();
      watch();
    }

    function stop() {
      active = false;
      activeControllers.delete(controllerApi);
      generation++;
      stopLoop();
      while (cleanups.length) {
        var fn = cleanups.pop();
        try { fn(); } catch (_) {}
      }
      currentCode = undefined;
      cachedVideo = undefined;
      videoAt = 0;
      destroyHost();
    }

    var controllerApi = {
      start: start,
      update: update,
      stop: stop,
      watch: watch,
      place: place,
      countReel: countReel,
      onStorageChange: onStorageChange,
      isActive: function () { return active; },
      isRunning: function () { return frameId !== 0; },
      isBadgeVisible: function () { return Boolean(badgeEl && lastVisible); },
      getCount: function () {
        checkDayRollover();
        return tally.count;
      },
      getTally: function () {
        checkDayRollover();
        return { day: tally.day, count: tally.count, seen: tally.seen.slice() };
      },
      getFormattedCount: function (locale) {
        var lang = locale || detectLocale(d, getChrome(), getDoc());
        return formatBadgeParts(tally.count, lang, d, getChrome(), getDoc()).text;
      },
      getCurrentCode: function () { return currentCode; },
      getElements: function () {
        return {
          host: hostRecord ? hostRecord.host : null,
          root: hostRecord ? hostRecord.root : null,
          badge: badgeEl,
          prefix: prefixEl,
          num: numEl,
          label: labelEl
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
    iyCore.feature("reelCounter", {
      keys: ["ui"],
      enabled: function (settings) { return isEnabled(settings); },
      start: function (settings) { defaultController.start(settings); },
      update: function (settings) { defaultController.update(settings); },
      stop: function () { defaultController.stop(); }
    });
    return defaultController;
  }

  var api = {
    VIDEO_LOOKUP_MS: VIDEO_LOOKUP_MS,
    MIN_VIDEO_SIZE: MIN_VIDEO_SIZE,
    BADGE_OFFSET_X: BADGE_OFFSET_X,
    BADGE_OFFSET_Y: BADGE_OFFSET_Y,
    MESSAGES: MESSAGES,
    REEL_COUNTER_CSS: REEL_COUNTER_CSS,
    normalizeSettings: normalizeSettings,
    isEnabled: isEnabled,
    isHealthTab: isHealthTab,
    setHealthTab: setHealthTab,
    isReelRoute: isReelRoute,
    extractReelCodeFromPath: extractReelCodeFromPath,
    extractReelCodeFromVideoDom: extractReelCodeFromVideoDom,
    nearestVideo: nearestVideo,
    formatBadgeParts: formatBadgeParts,
    createController: createController,
    registerFeature: registerFeature,
    getController: function () { return defaultController; }
  };

  globalThis.IY = globalThis.IY || {};
  globalThis.IY.reelCounter = api;
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
