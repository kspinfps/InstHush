(function () {
  "use strict";
  var RETRY_MS = 2000;

  // One formatter pair per language; construction is the expensive part.
  var formatters = new Map();
  function formattersFor(language) {
    var key = language || "tr";
    var entry = formatters.get(key);
    if (entry === undefined) {
      try {
        entry = {
          short: new Intl.DateTimeFormat(key, { dateStyle: "medium", timeStyle: "short" }),
          full: new Intl.DateTimeFormat(key, { dateStyle: "full", timeStyle: "long" })
        };
      } catch (err) { entry = null; }
      if (formatters.size > 8) formatters.clear();
      formatters.set(key, entry);
    }
    return entry;
  }

  function formatDate(value, language, seconds) {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
      var date = new Date(value);
      if (!Number.isFinite(date.getTime())) return "";
      var entry = formattersFor(language);
      return entry ? (seconds ? entry.full : entry.short).format(date) : "";
    } catch (err) { return ""; }
  }

  // Pure decision helper; lastAdded is null for a node never processed.
  function shouldProcess(enabled, visible, connected, hasSpan, lastAdded, now) {
    return enabled === true && visible === true && connected === true && !hasSpan &&
      (lastAdded == null || now - lastAdded >= RETRY_MS);
  }

  var api = { formatDate: formatDate, shouldProcess: shouldProcess, RETRY_MS: RETRY_MS };
  globalThis.IY = globalThis.IY || {};
  globalThis.IY.dates = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document === "undefined" || typeof chrome === "undefined") return;

  var ATTR = "data-iy-date", STYLE_ID = "iy-dates-style";
  var enabled = false, generation = 0;
  var intersection = null, mutations = null, idle = null;
  var observed = new WeakSet(), visible = new WeakSet(), ownTitle = new WeakSet(), formatted = new WeakMap();
  var pending = new Set();
  var useIdle = typeof requestIdleCallback === "function" && typeof cancelIdleCallback === "function";

  function safe(fn) {
    return IY.core.guard("dates", fn);
  }

  var scheduledGen = 0;
  var guardedProcess = safe(process);
  var drain = safe(function (deadline) {
    if (scheduledGen !== generation) return;
    idle = null;
    var count = 0;
    for (var time of pending) {
      if (count && deadline && !deadline.didTimeout && deadline.timeRemaining() < 1) break;
      pending.delete(time);
      guardedProcess(time);
      if (++count >= 40) break;
    }
    schedule();
  });

  function schedule() {
    if (!enabled || idle !== null || !pending.size) return;
    scheduledGen = generation;
    idle = useIdle ? requestIdleCallback(drain, { timeout: 500 }) : setTimeout(drain, 0);
  }

  function queue(time) {
    if (!enabled) return;
    pending.add(time);
    schedule();
  }

  function unmark(time) {
    time.removeAttribute(ATTR);
    formatted.delete(time);
    if (ownTitle.has(time)) { time.removeAttribute("title"); ownTitle.delete(time); }
  }

  // The date lives in a data attribute on Instagram's own <time>; a stylesheet rule
  // renders it, so no DOM node is ever inserted into React-managed parents.
  function process(time) {
    if (!enabled || !visible.has(time) || !time.isConnected) return;
    var raw = time.getAttribute("datetime");
    var current = time.getAttribute(ATTR);
    if (current !== null && formatted.get(time) === raw) return;
    var language = navigator.language || "tr";
    var text = formatDate(raw, language, false);
    if (!text) { if (current !== null) unmark(time); return; }
    if (!shouldProcess(enabled, true, true, current === text, null, Date.now())) return;
    time.setAttribute(ATTR, text);
    formatted.set(time, raw);
    // Never override a title Instagram set; only manage our own.
    if (time.getAttribute("title") === null || ownTitle.has(time)) {
      time.setAttribute("title", formatDate(raw, language, true));
      ownTitle.add(time);
    }
  }

  function observeTime(time) {
    if (!observed.has(time)) { observed.add(time); intersection.observe(time); }
    else if (visible.has(time)) queue(time);
  }

  function stop() {
    var was = enabled;
    enabled = false;
    generation++;
    if (intersection) intersection.disconnect();
    if (mutations) mutations();
    intersection = mutations = null;
    if (idle !== null) { if (useIdle) cancelIdleCallback(idle); else clearTimeout(idle); }
    idle = null;
    pending.clear();
    (function () {
      if (!was && !document.getElementById(STYLE_ID)) return;
      document.querySelectorAll("time[" + ATTR + "]").forEach(function (time) { unmark(time); });
      var style = document.getElementById(STYLE_ID);
      if (style) style.remove();
    })();
    observed = new WeakSet(); visible = new WeakSet(); ownTitle = new WeakSet(); formatted = new WeakMap();
  }

  function apply(ui) {
    var on = !!ui && ui.exactDates === true;
    if (!on) { stop(); return; }
    if (enabled || !document.body) return;
    try {
      enabled = true;
      if (!document.getElementById(STYLE_ID)) {
        var style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = "time[data-iy-date]::after{content:\" \u00b7 \" attr(data-iy-date);opacity:.75;white-space:nowrap;}";
        (document.head || document.documentElement).appendChild(style);
      }
      intersection = new IntersectionObserver(safe(function (entries) {
        if (!enabled) return;
        for (var i = 0; i < entries.length; i++) {
          var entry = entries[i], target = entry.target;
          if (entry.isIntersecting) {
            visible.add(target);
            if (target.getAttribute(ATTR) === null || formatted.get(target) !== target.getAttribute("datetime")) queue(target);
          } else visible.delete(target);
        }
      }));
      mutations = IY.core.observe(IY.selectors.time, observeTime, time => {
        if (visible.has(time)) queue(time);
      });
      document.body.querySelectorAll(IY.selectors.time).forEach(observeTime);
    } catch (err) { stop(); throw err; }
  }

  IY.core.feature("dates", {
    enabled: ({ ui }) => ui?.exactDates === true,
    start: ({ ui }) => apply(ui), stop
  });
})();
