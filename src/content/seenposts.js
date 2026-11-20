(function () {
  "use strict";

  const CAP = 3000, DWELL_MS = 1500, WRITE_MS = 10000, BATCH_CAP = 40;
  const ATTR = "data-iy-seen", STYLE_ID = "iy-seenposts-style";
  const selectors = typeof module !== "undefined" && module.exports ? require("./core/selectors.js") : IY.selectors;
  const CSS = "article[data-iy-seen] { opacity: .45; transition: opacity .15s; } article[data-iy-seen]:hover, article[data-iy-seen]:focus-within { opacity: 1; }";

  function validShortcode(value) {
    return typeof value === "string" && value.length >= 5 && value.length <= 64 && !/[^A-Za-z0-9_-]/.test(value);
  }

  function shortcodeFromHref(href) {
    const match = typeof href === "string" && /^\/(?:p|reel)\/([^/?#]+)\/?(?:[?#].*)?$/.exec(href);
    return match && match[0] === href && validShortcode(match[1]) ? match[1] : null;
  }

  function normalizeIds(value) {
    const ids = new Set();
    if (value && value.v === 1 && Array.isArray(value.ids)) {
      for (const id of value.ids) {
        if (!validShortcode(id)) continue;
        ids.delete(id);
        ids.add(id);
        if (ids.size > CAP) ids.delete(ids.values().next().value);
      }
    }
    return Array.from(ids);
  }

  function shouldDim(id, previous) {
    return validShortcode(id) && previous.has(id);
  }

  function homeRoute(pathname) { return pathname === "/"; }
  function visibleEnough(intersecting, ratio) { return intersecting === true && Number.isFinite(ratio) && ratio >= 0.6 && ratio <= 1; }
  function dwellComplete(since, now) { return since !== null && now - since >= DWELL_MS; }

  // [Tahmin] Feed articles contain a relative /p/ or /reel/ permalink.
  // Do not mistake links inside a nested article or a post dialog for feed items.
  function shortcodeFromArticle(article) {
    for (const anchor of article.querySelectorAll(selectors.permalink)) {
      if (anchor.closest("article") !== article) continue;
      const code = shortcodeFromHref(anchor.getAttribute("href"));
      if (code) return code;
    }
    return null;
  }

  function createController(env) {
    const doc = env.document;
    let wanted = false, active = false, loaded = false, suspended = false;
    let hidden = doc.visibilityState === "hidden";
    let previous = new Set(), ids = new Set(), current = new Set();
    let intersection = null, mutations = null, idle = null, writeTimer = null;
    let observed = new WeakSet(), timers = new WeakMap();
    const liveTimers = new Set(), pending = new Set();
    let generation = 0, clearRevision = 0, dirty = false;
    let writing = false, flushAfterWrite = false, removeAfterWrite = false, lastWrite = -Infinity;

    function onHome() { return homeRoute(env.pathname()); }
    function cancelWrite() {
      if (writeTimer !== null) env.clearTimeout(writeTimer);
      writeTimer = null;
    }
    // Pending IDs keep their batch timer after leaving Home; only disabling,
    // clearing or the pagehide flush cancel it.
    function scheduleWrite() {
      if (!wanted || suspended || !dirty || writing || writeTimer !== null) return;
      writeTimer = env.setTimeout(function () {
        writeTimer = null;
        flush(false);
      }, Math.max(WRITE_MS, lastWrite + WRITE_MS - env.now()));
    }
    function flush(force) {
      if (!wanted || !dirty) return;
      if (writing) { if (force) flushAfterWrite = true; return; }
      cancelWrite();
      const version = clearRevision;
      const value = { v: 1, ids: Array.from(ids) };
      dirty = false;
      writing = true;
      lastWrite = env.now();
      env.write(value, function (error) {
        writing = false;
        if (version === clearRevision && error) dirty = true;
        if (removeAfterWrite) {
          removeAfterWrite = false;
          env.remove(function () {});
        }
        if (flushAfterWrite) {
          flushAfterWrite = false;
          flush(true);
          return;
        }
        scheduleWrite();
      });
    }
    function remember(id) {
      if (current.has(id)) return;
      current.add(id);
      ids.delete(id);
      ids.add(id);
      if (ids.size > CAP) ids.delete(ids.values().next().value);
      dirty = true;
      scheduleWrite();
    }
    function clearTimer(article) {
      const state = timers.get(article);
      if (!state) return;
      env.clearTimeout(state.timer);
      liveTimers.delete(state.timer);
      timers.delete(article);
    }
    function mark(article) {
      if (!article.isConnected || article.closest(selectors.dialog)) {
        if (article.getAttribute(ATTR) !== null) article.removeAttribute(ATTR);
        return null;
      }
      const id = shortcodeFromArticle(article), marked = article.getAttribute(ATTR) !== null;
      // Observer entries repeat per threshold; touch the attribute only when its state changes.
      if (shouldDim(id, previous)) { if (!marked) article.setAttribute(ATTR, ""); }
      else if (marked) article.removeAttribute(ATTR);
      return id;
    }
    function process(article) {
      if (!active || !article.isConnected) return;
      mark(article);
      if (!observed.has(article)) { observed.add(article); intersection.observe(article); }
    }
    function schedule() {
      if (!active || idle !== null || !pending.size) return;
      const version = generation;
      idle = env.schedule(function (deadline) {
        if (version !== generation) return;
        idle = null;
        if (!onHome()) { route(); return; }
        let count = 0;
        for (const article of pending) {
          if (count && deadline && !deadline.didTimeout && deadline.timeRemaining() < 1) break;
          pending.delete(article);
          process(article);
          if (++count >= BATCH_CAP) break;
        }
        schedule();
      });
    }
    function enqueue(article) { pending.add(article); schedule(); }
    function collect(root) {
      if (!active || !root || root.nodeType !== 1) return;
      if (root.matches(selectors.article)) pending.add(root);
      root.querySelectorAll(selectors.article).forEach(article => pending.add(article));
      schedule();
    }
    function unmarkAll() {
      doc.querySelectorAll("article[" + ATTR + "]").forEach(article => article.removeAttribute(ATTR));
    }
    function clearDwell() {
      liveTimers.forEach(timer => env.clearTimeout(timer));
      liveTimers.clear();
      timers = new WeakMap();
    }
    function stopFeed() {
      active = false;
      generation++;
      if (mutations) { mutations(); mutations = null; }
      if (intersection) intersection.disconnect();
      intersection = null;
      if (idle !== null) env.cancel(idle);
      idle = null;
      pending.clear();
      clearDwell();
      observed = new WeakSet();
      unmarkAll();
      const style = doc.getElementById(STYLE_ID);
      if (style) style.remove();
    }
    function entriesChanged(entries) {
      if (!active) return;
      if (!onHome()) { route(); return; }
      for (const entry of entries) {
        const article = entry.target;
        const ok = !hidden && article.isConnected && visibleEnough(entry.isIntersecting, entry.intersectionRatio);
        if (!ok && !previous.size && article.getAttribute(ATTR) === null) {
          clearTimer(article);
          continue;
        }
        const id = mark(article);
        const old = timers.get(article);
        if (old && old.id !== id) clearTimer(article);
        if (!ok || !id) {
          clearTimer(article);
          continue;
        }
        if (current.has(id) || timers.has(article)) continue;
        const version = generation, since = env.now();
        const state = { id, since, timer: null };
        state.timer = env.setTimeout(function () {
          liveTimers.delete(state.timer);
          if (timers.get(article) !== state) return;
          timers.delete(article);
          if (!active || hidden || version !== generation || !onHome() || !article.isConnected ||
              article.closest(selectors.dialog) || shortcodeFromArticle(article) !== id ||
              !dwellComplete(since, env.now())) return;
          remember(id);
        }, DWELL_MS);
        timers.set(article, state);
        liveTimers.add(state.timer);
      }
    }
    function route() {
      if (!wanted || !loaded || suspended || !onHome()) {
        if (active) stopFeed();
        return;
      }
      if (active) return;
      try {
        intersection = new env.IntersectionObserver(env.guard(entriesChanged), { threshold: [0, 0.6, 1] });
        mutations = env.observe(enqueue);
        const style = doc.createElement("style");
        style.id = STYLE_ID;
        style.textContent = CSS;
        (doc.head || doc.documentElement).appendChild(style);
        active = true;
        collect(doc.body || doc.documentElement);
        scheduleWrite();
      } catch (err) { stopFeed(); throw err; }
    }
    function apply(ui) {
      wanted = !!ui && ui.seenPosts === true;
      if (!wanted) {
        flushAfterWrite = false;
        cancelWrite();
        stopFeed();
        return;
      }
      if (!loaded) return;
      route();
      scheduleWrite();
    }
    function reset() {
      clearRevision++;
      if (writing) removeAfterWrite = true;
      ids.clear();
      previous.clear();
      current.clear();
      dirty = false;
      flushAfterWrite = false;
      cancelWrite();
      clearDwell();
      unmarkAll();
    }
    function clear() {
      reset();
      // Explicit clearing also works with the option off. Never persist on disable.
      if (writing) removeAfterWrite = true;
      else env.remove(function () {});
    }
    function storageChanged(changes, area) {
      if (area !== "local") return;
      if (changes.seenPosts) {
        const value = changes.seenPosts.newValue;
        if (!value || (value.v === 1 && Array.isArray(value.ids) && !value.ids.length)) reset();
        else if (loaded) merge(normalizeIds(value));
      }
    }
    // Another tab (or this tab's own write echo) stored a list. Keep its IDs and
    // append IDs only this tab knows, so concurrent tabs do not clobber each other.
    // The previous-session dimming snapshot never grows here.
    function merge(incoming) {
      const known = new Set(incoming), local = Array.from(ids).filter(id => !known.has(id));
      ids = new Set(normalizeIds({ v: 1, ids: incoming.concat(local) }));
      if (local.length) { dirty = true; scheduleWrite(); }
    }
    function start() {
      const initialClear = clearRevision;
      env.read(function (data, error) {
        if (loaded) return;
        loaded = true;
        if (!error && initialClear === clearRevision) {
          ids = new Set(normalizeIds(data && data.seenPosts));
          previous = new Set(ids); // Immutable session snapshot, except explicit clear.
        }
        env.guard(route)();
      });
    }
    function visibilityChanged() {
      const wasHidden = hidden;
      hidden = doc.visibilityState === "hidden";
      if (!active || wasHidden === hidden) return;
      // Hiding only cancels dwell intervals; style, attributes, observers and the
      // write batch stay. Returning re-observes the feed once so posts already on
      // screen start a fresh, complete interval.
      clearDwell();
      if (hidden) return;
      intersection.disconnect();
      observed = new WeakSet();
      collect(doc.body || doc.documentElement);
    }
    function pagehide() {
      suspended = true;
      flush(true); // Lifecycle flush is the sole exception to the ten-second batch window.
      stopFeed();
    }
    function pageshow() { suspended = false; route(); scheduleWrite(); }
    return { start, apply, clear, storageChanged, route, visibilityChanged, pagehide, pageshow };
  }

  const api = { validShortcode, shortcodeFromHref, shortcodeFromArticle, normalizeIds,
    shouldDim, homeRoute, visibleEnough, dwellComplete, createController,
    CAP, DWELL_MS, WRITE_MS, BATCH_CAP, CSS };
  globalThis.IY = globalThis.IY || {};
  globalThis.IY.seenposts = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document === "undefined" || typeof chrome === "undefined" || globalThis.__iySeenpostsInstalled) return;
  globalThis.__iySeenpostsInstalled = true;

  // Callback APIs match the other ISOLATED content scripts. Catch thrown errors
  // and rejected promises too, so storage loss never interrupts in-memory tracking.
  function storageCall(method, value, done) {
    let settled = false;
    function finish(result, error) {
      if (settled) return;
      settled = true;
      done(result, error);
    }
    try {
      const result = chrome.storage.local[method](value, function (data) {
        finish(data, !!(chrome.runtime && chrome.runtime.lastError));
      });
      if (result && typeof result.catch === "function") result.catch(() => finish(undefined, true));
    } catch (_) { finish(undefined, true); }
  }
  const useIdle = typeof requestIdleCallback === "function" && typeof cancelIdleCallback === "function";
  const controller = createController({
    document, IntersectionObserver: globalThis.IntersectionObserver,
    guard: fn => IY.core.guard("seenposts", fn),
    observe: cb => IY.core.observe(selectors.article, cb),
    pathname: () => location.pathname, now: () => performance.now(),
    setTimeout: (fn, delay) => setTimeout(fn, delay), clearTimeout: timer => clearTimeout(timer),
    schedule(fn) {
      const run = IY.core.guard("seenposts", fn);
      return useIdle ? requestIdleCallback(run, { timeout: 500 }) : setTimeout(run, 0);
    },
    cancel: timer => useIdle ? cancelIdleCallback(timer) : clearTimeout(timer),
    read: done => storageCall("get", "seenPosts", done),
    write: (value, done) => storageCall("set", { seenPosts: value }, (_, error) => done(error)),
    remove: done => storageCall("remove", "seenPosts", (_, error) => done(error))
  });
  api.clear = controller.clear;
  IY.core.onStorage((changes, area) => {
    if (changes.seenPosts) controller.storageChanged({ seenPosts: changes.seenPosts }, area);
  });
  // Snapshot the previous session even when the option is initially off.
  controller.start();
  IY.core.feature("seenposts", {
    enabled: ({ ui }) => ui?.seenPosts === true,
    start({ ui }) {
      controller.visibilityChanged();
      controller.pageshow();
      IY.core.listen(globalThis, "pagehide", controller.pagehide);
      IY.core.listen(globalThis, "pageshow", controller.pageshow);
      IY.core.listen(document, "visibilitychange", controller.visibilityChanged);
      IY.core.route(controller.route);
      controller.apply(ui);
    },
    stop() { controller.apply(null); }
  });
})();
