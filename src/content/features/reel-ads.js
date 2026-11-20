// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
// Skips sponsored/ad reels on /reels/ in the current scroll direction without skipping loops.
(function () {
  "use strict";

  const CHECK_DELAYS = Object.freeze([150, 700, 1500]);
  const MAX_CONSECUTIVE_SKIPS = 3;
  const SKIP_COOLDOWN_MS = 4000;

  const REEL_AD_WORDS = Object.freeze([
    "Ad",
    "Sponsored",
    "Reklam",
    "Sponsorlu",
    "Anzeige",
    "Publicité",
    "Sponsorisé",
    "Anuncio",
    "Publicidad",
    "Annuncio",
    "Sponsorizzato",
    "Anúncio",
    "Patrocinado",
    "Advertentie",
    "Gesponsord",
    "Реклама",
    "מודעה",
    "ממומן",
    "إعلان",
    "مُموَّل",
    "ممول",
    "広告",
    "광고",
    "廣告",
    "广告",
    "贊助",
    "赞助"
  ]);

  function getWordSet() {
    const iy = globalThis.IY;
    const extra = iy && iy.selectors && (iy.selectors.reelAdWords || iy.selectors.REEL_AD_WORDS);
    const set = new Set(REEL_AD_WORDS);
    if (Array.isArray(extra)) {
      for (let i = 0; i < extra.length; i++) {
        if (typeof extra[i] === "string" && extra[i]) set.add(extra[i]);
      }
    }
    return set;
  }

  function isAdsEnabled(settings) {
    const cfg = settings && settings.cfg;
    return !cfg || typeof cfg !== "object" || cfg.ads !== false;
  }

  function isReelsPath(pathname) {
    if (typeof pathname !== "string") return false;
    const clean = pathname.split(/[?#]/)[0];
    return clean === "/reels" || clean.startsWith("/reels/");
  }

  function getStyleFn(win) {
    if (win && typeof win.getComputedStyle === "function") return el => win.getComputedStyle(el);
    if (typeof getComputedStyle === "function") return el => getComputedStyle(el);
    return null;
  }

  function reelList(doc, win) {
    if (!doc || typeof doc.querySelectorAll !== "function") return null;
    const videos = doc.querySelectorAll("main video");
    const getStyle = getStyleFn(win);
    for (let i = 0; i < videos.length; i++) {
      for (let el = videos[i].parentElement; el && el !== doc.body && el !== doc.documentElement; el = el.parentElement) {
        const cs = getStyle ? getStyle(el) : (el.style || el.css || null);
        if (cs && /(auto|scroll)/.test(cs.overflowY || "") && el.scrollHeight > el.clientHeight) return el;
      }
    }
    return null;
  }

  function currentReel(list) {
    if (!list || typeof list.getBoundingClientRect !== "function") return undefined;
    const top = list.getBoundingClientRect().top;
    const kids = list.children || [];
    for (let i = 0; i < kids.length; i++) {
      const c = kids[i];
      if (!c || typeof c.getBoundingClientRect !== "function") continue;
      const r = c.getBoundingClientRect();
      if (r.height > 200 && Math.abs(r.top - top) < r.height / 2) return c;
    }
    return undefined;
  }

  function isAdReel(reel, wordSet) {
    if (!reel || typeof reel.querySelectorAll !== "function") return false;
    const words = wordSet || getWordSet();
    const spans = reel.querySelectorAll("span");
    for (let i = 0; i < spans.length; i++) {
      const el = spans[i];
      if (el.childElementCount !== 0) continue;
      if (typeof el.closest === "function" && el.closest("h1")) continue;
      const text = el.textContent ? el.textContent.trim() : "";
      if (text && words.has(text)) return true;
    }
    return false;
  }

  function createController(deps) {
    const d = deps || {};
    let active = false;
    let generation = 0;
    let lastTop = null;
    let down = true;
    let lastSkipDir = 0;
    let consecutiveSkips = 0;
    let timers = [];
    let observeTimer = 0;
    let activeList = null;
    let skipped = new WeakMap();
    let offRoute = null;
    let offObserve = null;
    let offScroll = null;

    function getDoc() {
      return d.document || (typeof document !== "undefined" ? document : null);
    }

    function getWin() {
      return d.window || (typeof window !== "undefined" ? window : null);
    }

    function getCore() {
      return d.core || (globalThis.IY && globalThis.IY.core) || null;
    }

    function currentPath() {
      const doc = getDoc();
      const loc = (doc && doc.location) || (typeof location !== "undefined" ? location : null);
      return loc && typeof loc.pathname === "string" ? loc.pathname : "";
    }

    function clearTimers() {
      for (let i = 0; i < timers.length; i++) clearTimeout(timers[i]);
      timers = [];
      if (observeTimer) { clearTimeout(observeTimer); observeTimer = 0; }
    }

    function scrollBehavior() {
      const win = getWin();
      try {
        if (win && typeof win.matchMedia === "function" && win.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          return "instant";
        }
      } catch (_) {}
      return "smooth";
    }

    function onScroll(e) {
      if (!active || !activeList || !e || e.target !== activeList) return;
      if (lastTop !== null && activeList.scrollTop !== lastTop) {
        down = activeList.scrollTop > lastTop;
      }
      lastTop = activeList.scrollTop;
    }

    function check() {
      if (!active || !isReelsPath(currentPath())) return;
      const doc = getDoc();
      const win = getWin();
      const list = reelList(doc, win);
      if (!list) return;
      activeList = list;

      if (lastTop !== null && list.scrollTop !== lastTop) {
        down = list.scrollTop > lastTop;
      }
      lastTop = list.scrollTop;

      const reel = currentReel(list);
      if (!reel) return;

      if (!isAdReel(reel)) {
        consecutiveSkips = 0;
        lastSkipDir = 0;
        return;
      }

      const now = Date.now();
      const prevSkipAt = skipped.get(reel);
      if (prevSkipAt && now - prevSkipAt < SKIP_COOLDOWN_MS) return;
      if (consecutiveSkips >= MAX_CONSECUTIVE_SKIPS) return;

      // Determine direction without bouncing back at the top after an upward skip.
      let dir;
      if (!down) {
        if (list.scrollTop >= list.clientHeight / 2) {
          dir = -1;
        } else {
          if (lastSkipDir === -1) return;
          dir = 1;
        }
      } else {
        dir = 1;
      }

      if (dir === 1 && list.scrollTop + list.clientHeight >= list.scrollHeight - 1) return;
      if (dir === -1 && list.scrollTop <= 1) return;

      skipped.set(reel, now);
      consecutiveSkips++;
      lastSkipDir = dir;

      if (typeof list.scrollBy === "function") {
        list.scrollBy({ top: dir * list.clientHeight, behavior: scrollBehavior() });
      } else {
        list.scrollTop = Math.max(0, Math.min(list.scrollHeight - list.clientHeight, list.scrollTop + dir * list.clientHeight));
      }
    }

    function scheduleRouteChecks() {
      if (!active) return;
      clearTimers();
      if (!isReelsPath(currentPath())) {
        consecutiveSkips = 0;
        lastSkipDir = 0;
        return;
      }
      const gen = generation;
      const core = getCore();
      const run = () => {
        if (!active || gen !== generation) return;
        check();
      };
      const wrapped = core && typeof core.bind === "function" ? core.bind(run) : run;
      timers = CHECK_DELAYS.map(ms => setTimeout(wrapped, ms));
    }

    function onDomNode() {
      if (!active || observeTimer || !isReelsPath(currentPath())) return;
      const gen = generation;
      const core = getCore();
      const run = () => {
        observeTimer = 0;
        if (!active || gen !== generation) return;
        check();
      };
      const wrapped = core && typeof core.bind === "function" ? core.bind(run) : run;
      observeTimer = setTimeout(wrapped, 150);
    }

    function start(settings) {
      if (!isAdsEnabled(settings)) { stop(); return; }
      if (active) return;
      active = true;
      generation++;
      lastTop = null;
      down = true;
      lastSkipDir = 0;
      consecutiveSkips = 0;
      activeList = null;
      skipped = new WeakMap();

      const core = getCore();
      const doc = getDoc();
      if (core) {
        if (typeof core.route === "function") {
          offRoute = core.route(scheduleRouteChecks);
        }
        if (typeof core.observe === "function") {
          offObserve = core.observe(() => active && isReelsPath(currentPath()), onDomNode);
        }
        if (doc && typeof core.listen === "function") {
          offScroll = core.listen(doc, "scroll", onScroll, { capture: true, passive: true });
        }
      }
      scheduleRouteChecks();
    }

    function update(settings) {
      if (!isAdsEnabled(settings)) stop();
      else if (!active) start(settings);
    }

    function stop() {
      if (!active && !timers.length && !observeTimer) return;
      active = false;
      generation++;
      clearTimers();
      if (offRoute) { try { offRoute(); } catch (_) {} offRoute = null; }
      if (offObserve) { try { offObserve(); } catch (_) {} offObserve = null; }
      if (offScroll) { try { offScroll(); } catch (_) {} offScroll = null; }
      lastTop = null;
      down = true;
      lastSkipDir = 0;
      consecutiveSkips = 0;
      activeList = null;
      skipped = new WeakMap();
    }

    return {
      start,
      update,
      stop,
      check,
      isActive: () => active
    };
  }

  let defaultController = null;

  function registerFeature(core) {
    const iyCore = core || (globalThis.IY && globalThis.IY.core);
    if (!iyCore || typeof iyCore.feature !== "function") return null;
    if (!defaultController) defaultController = createController();
    iyCore.feature("reelAds", {
      keys: ["cfg"],
      enabled: isAdsEnabled,
      start: settings => defaultController.start(settings),
      update: settings => defaultController.update(settings),
      stop: () => defaultController.stop()
    });
    return defaultController;
  }

  const api = {
    REEL_AD_WORDS,
    CHECK_DELAYS,
    MAX_CONSECUTIVE_SKIPS,
    SKIP_COOLDOWN_MS,
    isAdsEnabled,
    isReelsPath,
    reelList,
    currentReel,
    isAdReel,
    createController,
    registerFeature,
    getController: () => defaultController
  };

  globalThis.IY = globalThis.IY || {};
  globalThis.IY.reelAds = api;
  if (globalThis.IY.core && typeof globalThis.IY.core.feature === "function") {
    registerFeature(globalThis.IY.core);
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
