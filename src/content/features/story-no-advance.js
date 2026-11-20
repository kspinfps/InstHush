// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
// Stops Instagram stories from auto-advancing by pausing shortly before the end of each item.
// Coordinates cleanly with InstHush's existing ui.storyPause ("pause on open") in src/content/video.js.
(function () {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;

  var STOP_BEFORE_MS = 250;
  var STOP_AT = 0.985;
  var SAMPLE_MS = 100;
  var RETRY_MS = 150;
  var MAX_RETRIES = 6;

  var STORY_PAUSE_LABELS = new Set([
    "pause", "duraklat", "durdur", "pausar", "pausieren", "metti in pausa",
    "mettre en pause", "pauzeren", "пауза", "השהיה"
  ]);
  var STORY_PLAY_LABELS = new Set([
    "play", "oynat", "devam et", "reproducir", "abspielen", "lire",
    "riproduci", "afspelen", "воспроизвести", "הפעלה"
  ]);

  function getResolve(deps) {
    if (deps && deps.resolve) return deps.resolve;
    if (globalThis.IY && globalThis.IY.resolve) return globalThis.IY.resolve;
    if (typeof require === "function") {
      try { return require("../core/resolve.js"); } catch (_) {}
    }
    return null;
  }

  function isStoryPath(pathname, deps) {
    if (typeof pathname !== "string") return false;
    var res = getResolve(deps);
    if (res && typeof res.parseRoute === "function") {
      var r = res.parseRoute(pathname);
      return r.kind === "stories" || r.kind === "highlight";
    }
    return /^\/stories\/[^/]+/.test(pathname);
  }

  function normalizeLabel(raw) {
    if (typeof raw !== "string") return "";
    var trimmed = raw.trim();
    if (!trimmed) return "";
    return typeof trimmed.toLocaleLowerCase === "function" ? trimmed.toLocaleLowerCase("tr") : trimmed.toLowerCase();
  }

  function classifyToggleLabel(label) {
    var clean = normalizeLabel(label);
    if (!clean) return null;
    if (STORY_PAUSE_LABELS.has(clean)) return "playing";
    if (STORY_PLAY_LABELS.has(clean)) return "paused";
    return null;
  }

  function clamp01(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.min(1, Math.max(0, value));
  }

  /**
   * Parses CSS computed `transform` into `{ m11, m41 }` without requiring DOMMatrixReadOnly
   * (works in Chromium, Firefox, and Node tests).
   */
  function parseTransformMatrix(transformStr) {
    if (typeof transformStr !== "string" || !transformStr || transformStr === "none") {
      return { m11: 1, m41: 0 };
    }
    if (typeof globalThis.DOMMatrixReadOnly === "function") {
      try {
        var mat = new globalThis.DOMMatrixReadOnly(transformStr);
        if (Number.isFinite(mat.m11) && Number.isFinite(mat.m41)) {
          return { m11: mat.m11, m41: mat.m41 };
        }
      } catch (_) {}
    }
    var m2d = /^matrix\(\s*([^,]+),\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*([^,]+),\s*[^)]+\)$/.exec(transformStr.trim());
    if (m2d) {
      var a = Number(m2d[1]);
      var tx = Number(m2d[2]);
      if (Number.isFinite(a) && Number.isFinite(tx)) return { m11: a, m41: tx };
    }
    var m3d = /^matrix3d\(([^)]+)\)$/.exec(transformStr.trim());
    if (m3d) {
      var parts = m3d[1].split(",").map(function (s) { return Number(s.trim()); });
      if (parts.length === 16 && Number.isFinite(parts[0]) && Number.isFinite(parts[12])) {
        return { m11: parts[0], m41: parts[12] };
      }
    }
    return { m11: 1, m41: 0 };
  }

  /**
   * Reads 0..1 progress from a story progress bar fill element.
   * Supports both translateX(-100%..0) and scaleX(0..1) progress bars.
   */
  function progressOf(fill, getStyleFn) {
    if (!fill || typeof fill.getBoundingClientRect !== "function") return null;
    var rect = fill.getBoundingClientRect();
    var w = Number(rect && rect.width);
    if (!Number.isFinite(w) || w <= 0) return null;
    var readStyle = typeof getStyleFn === "function"
      ? getStyleFn
      : (typeof globalThis.getComputedStyle === "function" ? globalThis.getComputedStyle : null);
    if (!readStyle) return null;
    var computed = readStyle(fill);
    var transform = computed && typeof computed.transform === "string" ? computed.transform : "none";
    if (transform === "none") return 1;
    var mat = parseTransformMatrix(transform);
    if (mat.m41 < 0) return clamp01(1 + mat.m41 / w);
    if (mat.m11 >= 0 && mat.m11 < 0.9999 && Math.abs(mat.m41) < 0.01) return clamp01(mat.m11);
    return clamp01(1 + mat.m41 / w);
  }

  function findToggle(doc) {
    var d = doc || (typeof document !== "undefined" ? document : null);
    if (!d || typeof d.querySelectorAll !== "function") return null;

    var selectors = ["svg[aria-label]", 'button[aria-label], [role="button"][aria-label]'];
    for (var s = 0; s < selectors.length; s++) {
      var nodes;
      try {
        nodes = d.querySelectorAll(selectors[s]);
      } catch (_) {
        continue;
      }
      for (var i = 0; i < nodes.length && i < 60; i++) {
        var node = nodes[i];
        var label = node && typeof node.getAttribute === "function" ? node.getAttribute("aria-label") : "";
        var state = classifyToggleLabel(label);
        if (!state) continue;
        var btn = typeof node.closest === "function" ? node.closest('[role="button"], button') : node;
        if (!btn) btn = node;
        if (typeof btn.getBoundingClientRect === "function") {
          var r = btn.getBoundingClientRect();
          if (!(r && r.width > 0)) continue;
        }
        return { btn: btn, state: state };
      }
    }
    return null;
  }

  function findFill(near, doc, getStyleFn) {
    var d = doc || (typeof document !== "undefined" ? document : null);
    var readStyle = typeof getStyleFn === "function"
      ? getStyleFn
      : (typeof globalThis.getComputedStyle === "function" ? globalThis.getComputedStyle : null);
    if (!near || !readStyle) return null;

    var body = d && d.body;
    var hops = 0;
    for (var a = near.parentElement; a && a !== body && hops < 20; a = a.parentElement, hops++) {
      if (typeof a.querySelectorAll !== "function") continue;
      var fills;
      try {
        fills = a.querySelectorAll('div[style*="translateX"], div[style*="scaleX"]');
      } catch (_) {
        continue;
      }
      for (var i = 0; i < fills.length; i++) {
        var fill = fills[i];
        var bar = fill && fill.parentElement;
        if (!bar || typeof bar.getBoundingClientRect !== "function") continue;
        var r = bar.getBoundingClientRect();
        if (r.height > 0 && r.height <= 8) {
          var cs = readStyle(bar);
          var ov = cs && (cs.overflow || cs.overflowX);
          if (ov === "hidden" || ov === "clip") return fill;
        }
      }
    }
    return null;
  }

  function findVideoFallback(doc, win, deps) {
    var d = doc || (typeof document !== "undefined" ? document : null);
    var w = win || (typeof window !== "undefined" ? window : null);
    if (!d || typeof d.querySelectorAll !== "function") return null;
    var res = getResolve(deps);
    var videos;
    try {
      videos = d.querySelectorAll("video");
    } catch (_) {
      return null;
    }
    var best = null;
    var bestArea = 0;
    for (var i = 0; i < videos.length && i < 20; i++) {
      var v = videos[i];
      if (!v || !Number.isFinite(v.duration) || v.duration <= 0.5) continue;
      if (res && typeof res.isStoryPreview === "function" && res.isStoryPreview(v, w)) continue;
      if (typeof v.getBoundingClientRect === "function") {
        var r = v.getBoundingClientRect();
        if (!(r.width >= 160 && r.height >= 240)) continue;
        var area = r.width * r.height;
        if (area > bestArea) {
          bestArea = area;
          best = v;
        }
      } else if (!best) {
        best = v;
      }
    }
    if (!best) return null;
    var cur = Number(best.currentTime) || 0;
    var dur = Number(best.duration);
    return {
      fill: best,
      p: clamp01(cur / dur),
      msLeftHint: Math.max(0, (dur - cur) * 1000)
    };
  }

  function createState() {
    return {
      anchor: null,
      rate: 0,
      held: null
    };
  }

  /**
   * Pure state machine step.
   * Returns: "none" | "pause" | "resume"
   *
   * Coordination with ui.storyPause (src/content/video.js):
   * - When storyPauseOn is false, moving off a held story resumes playback on the next story
   *   (because Instagram keeps the viewer paused across slide changes).
   * - When storyPauseOn is true, moving off a held story leaves the next story paused so we
   *   never fight video.js's start-of-story pause!
   */
  function stepState(state, sample) {
    if (!state || !sample || !sample.fill || sample.p === null || sample.p === undefined) {
      return "none";
    }
    var fill = sample.fill;
    var href = sample.href || "";
    var p = sample.p;
    var now = Number(sample.now) || 0;
    var toggleState = sample.toggleState;
    var storyPauseOn = Boolean(sample.storyPauseOn);
    var msLeftHint = sample.msLeftHint;

    if (state.held && (state.held.fill !== fill || state.held.href !== href || p < 0.5)) {
      var shouldResume = Boolean(
        state.held.confirmed &&
        !state.held.released &&
        toggleState === "paused" &&
        !storyPauseOn
      );
      state.held = null;
      state.anchor = null;
      state.rate = 0;
      return shouldResume ? "resume" : "none";
    }

    if (state.held) {
      if (toggleState === "paused") {
        state.held.confirmed = true;
      } else if (state.held.confirmed) {
        // User pressed Play on our held story -> let it finish and advance naturally.
        state.held.released = true;
      } else if (now - state.held.clickedAt > RETRY_MS && state.held.retries < MAX_RETRIES) {
        state.held.clickedAt = now;
        state.held.retries += 1;
        return "pause";
      }
      return "none";
    }

    if (!state.anchor || state.anchor.fill !== fill || p < state.anchor.p) {
      state.anchor = { fill: fill, p: p, t: now };
      state.rate = 0;
    } else if (now - state.anchor.t >= SAMPLE_MS) {
      if (p > state.anchor.p) {
        state.rate = (p - state.anchor.p) / (now - state.anchor.t);
      }
      state.anchor = { fill: fill, p: p, t: now };
    }

    if (toggleState !== "playing") return "none";

    var msLeftFromRate = state.rate > 0 ? (1 - p) / state.rate : Infinity;
    var msLeft = Number.isFinite(msLeftHint) && msLeftHint >= 0
      ? Math.min(msLeftFromRate, msLeftHint)
      : msLeftFromRate;

    if (msLeft <= STOP_BEFORE_MS || p >= STOP_AT) {
      state.held = {
        fill: fill,
        href: href,
        confirmed: false,
        released: false,
        clickedAt: now,
        retries: 0
      };
      return "pause";
    }

    return "none";
  }

  function createController(deps) {
    var d = deps || {};
    var active = false;
    var storyPauseOn = false;
    var frame = 0;
    var state = createState();
    var cleanups = [];

    function getDoc() { return d.document || (typeof document !== "undefined" ? document : null); }
    function getWin() { return d.window || (typeof window !== "undefined" ? window : null); }
    function getLoc() { return d.location || (typeof location !== "undefined" ? location : { pathname: "/", href: "" }); }
    function getNow() {
      if (typeof d.now === "function") return d.now();
      if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now();
      return Date.now();
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

    function stopLoop() {
      if (frame) {
        caf(frame);
        frame = 0;
      }
      state = createState();
    }

    function tickOnce() {
      var doc = getDoc();
      var win = getWin();
      var loc = getLoc();
      if (!active || (doc && doc.hidden) || !isStoryPath(loc.pathname, d)) return "none";

      var toggle = findToggle(doc);
      if (!toggle) return "none";

      var fill = findFill(toggle.btn, doc, d.getComputedStyle);
      var p = fill ? progressOf(fill, d.getComputedStyle) : null;
      var msLeftHint;

      if (!fill || p === null) {
        var vidFallback = findVideoFallback(doc, win, d);
        if (vidFallback) {
          fill = vidFallback.fill;
          p = vidFallback.p;
          msLeftHint = vidFallback.msLeftHint;
        }
      }
      if (!fill || p === null) return "none";

      var action = stepState(state, {
        fill: fill,
        href: loc.href || loc.pathname,
        p: p,
        now: getNow(),
        toggleState: toggle.state,
        storyPauseOn: storyPauseOn,
        msLeftHint: msLeftHint
      });

      if (action === "pause" || action === "resume") {
        if (typeof toggle.btn.click === "function") toggle.btn.click();
      }
      return action;
    }

    function tick() {
      frame = 0;
      var doc = getDoc();
      if (!active || (doc && doc.hidden) || !isStoryPath(getLoc().pathname, d)) {
        state = createState();
        return;
      }
      frame = raf(tick);
      tickOnce();
    }

    function sync() {
      var doc = getDoc();
      var want = active && !(doc && doc.hidden) && isStoryPath(getLoc().pathname, d);
      if (want && !frame) {
        frame = raf(tick);
      } else if (!want && frame) {
        stopLoop();
      }
    }

    function applySettings(settings) {
      storyPauseOn = Boolean(settings && settings.ui && settings.ui.storyPause === true);
    }

    function start(settings) {
      if (active) return;
      active = true;
      applySettings(settings);

      var doc = getDoc();
      var core = d.core || (globalThis.IY && globalThis.IY.core);

      if (core && typeof core.route === "function") {
        cleanups.push(core.route(sync));
      }
      if (doc && typeof doc.addEventListener === "function") {
        doc.addEventListener("visibilitychange", sync);
        cleanups.push(function () { doc.removeEventListener("visibilitychange", sync); });
      }
      sync();
    }

    function update(settings) {
      applySettings(settings);
      sync();
    }

    function stop() {
      active = false;
      stopLoop();
      while (cleanups.length) {
        try { cleanups.pop()(); } catch (_) {}
      }
    }

    return {
      start: start,
      update: update,
      stop: stop,
      sync: sync,
      tickOnce: tickOnce,
      isActive: function () { return active; },
      isRunning: function () { return frame !== 0; },
      isHolding: function () { return Boolean(state.held); },
      isStoryPauseOn: function () { return storyPauseOn; },
      getState: function () { return state; }
    };
  }

  var controller = createController();

  if (globalThis.IY && globalThis.IY.core && typeof globalThis.IY.core.feature === "function") {
    globalThis.IY.core.feature("storyNoAdvance", {
      keys: ["ui"],
      enabled: function (settings) {
        return Boolean(settings && settings.ui && settings.ui.storyNoAdvance === true);
      },
      start: function (settings) { controller.start(settings); },
      update: function (settings) { controller.update(settings); },
      stop: function () { controller.stop(); }
    });
  }

  var api = {
    STOP_BEFORE_MS: STOP_BEFORE_MS,
    STOP_AT: STOP_AT,
    SAMPLE_MS: SAMPLE_MS,
    RETRY_MS: RETRY_MS,
    MAX_RETRIES: MAX_RETRIES,
    classifyToggleLabel: classifyToggleLabel,
    parseTransformMatrix: parseTransformMatrix,
    progressOf: progressOf,
    findToggle: findToggle,
    findFill: findFill,
    createState: createState,
    stepState: stepState,
    createController: createController,
    isHolding: function () { return controller.isHolding(); }
  };

  globalThis.IY = Object.assign(globalThis.IY || {}, { storyNoAdvance: api });
  if (isNode) module.exports = api;
})();
