(function () {
  "use strict";

  // Local "time on Instagram" counter + optional break reminder.
  // Counts only while the tab is visible, focused and the user interacted within
  // the last 60 s. Because only the focused window can satisfy that, several
  // Instagram tabs never double count (no lease needed). Data never leaves the
  // device: chrome.storage.local key "usage" = { days: { "YYYY-MM-DD": seconds } }.
  // No observers, no per-frame work: one setInterval (15 s) that runs only while
  // the tab is visible and focused.

  var TICK_MS = 15000;
  var ACTIVE_WINDOW_MS = 60000;
  var MAX_CREDIT_MS = 20000;
  var WRITE_GAP_MS = 30000;
  var KEEP_DAYS = 14;
  var MAX_DAY_SECONDS = 86400;
  var RESET_IDLE_SEC = 300;
  var TOAST_MS = 30000;
  var VALID_BREAKS = [0, 15, 30, 45, 60];
  var DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

  // ---------- pure helpers (exported for tests) ----------

  function pad(n) { return n < 10 ? "0" + n : String(n); }

  function dateKey(ms) {
    var d = new Date(ms);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function shiftKey(ms, days) {
    var d = new Date(ms);
    return dateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime());
  }

  function validDayKey(key) {
    if (typeof key !== "string" || !DAY_RE.test(key)) return false;
    var y = +key.slice(0, 4), m = +key.slice(5, 7), d = +key.slice(8, 10);
    var dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }

  function validSeconds(v) {
    return typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
  }

  // Returns a fresh { key: seconds } map: valid keys only, last 14 local days
  // (today-13 .. today+1 to tolerate timezone changes), values clamped to a day.
  function sanitizeDays(raw, nowMs) {
    var out = {};
    if (!raw || typeof raw !== "object") return out;
    var oldest = shiftKey(nowMs, -(KEEP_DAYS - 1));
    var newest = shiftKey(nowMs, 1);
    Object.keys(raw).forEach(function (key) {
      if (!validDayKey(key) || key < oldest || key > newest) return;
      var v = raw[key];
      if (!validSeconds(v)) return;
      out[key] = Math.min(v, MAX_DAY_SECONDS);
    });
    return out;
  }

  function pruneDays(days, nowMs) { return sanitizeDays(days, nowMs); }

  // Adds whole seconds to a day; returns a new map (input untouched).
  function addSeconds(days, key, sec, nowMs) {
    var out = sanitizeDays(days, nowMs);
    if (!validDayKey(key) || !validSeconds(sec) || sec === 0) return out;
    out[key] = Math.min((out[key] || 0) + sec, MAX_DAY_SECONDS);
    return sanitizeDays(out, nowMs);
  }

  // today = seconds today; week = sum of today and the 6 days before it.
  function summarize(days, nowMs) {
    var clean = sanitizeDays(days, nowMs);
    var today = clean[dateKey(nowMs)] || 0;
    var week = 0;
    for (var i = 0; i < 7; i++) week += clean[shiftKey(nowMs, -i)] || 0;
    return { today: today, week: week };
  }

  // 3720 -> {h:1,m:2}; seconds below a minute give m:0.
  function splitDuration(sec) {
    var s = validSeconds(sec) ? sec : 0;
    return { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60) };
  }

  // "42 dk" / "5 sa" / "5 sa 10 dk". Units are injectable for localisation.
  function formatDuration(sec, units) {
    var hu = (units && units.h) || "sa", mu = (units && units.m) || "dk";
    var p = splitDuration(sec);
    if (p.h > 0) return p.h + " " + hu + (p.m > 0 ? " " + p.m + " " + mu : "");
    return p.m + " " + mu;
  }

  function normalizeBreakMins(v) {
    return typeof v === "number" && VALID_BREAKS.indexOf(v) !== -1 ? v : 0;
  }

  function newReminder() { return { cont: 0, nextAt: 0, mins: 0 }; }

  // Pure state machine. state = { cont, nextAt, mins } (seconds).
  // addSec: active seconds credited now; idleSec: gap since the previous credit.
  // A gap of 5 min or more ends the continuous session. Each threshold crossing
  // fires once; the next threshold is the next multiple of the interval. Enabling
  // or changing the interval mid-session never fires immediately.
  // Returns { state, show, minutes } and never mutates its input.
  function reminderStep(state, mins, addSec, idleSec) {
    var s = { cont: 0, nextAt: 0, mins: 0 };
    if (state && validSeconds(state.cont)) s.cont = state.cont;
    if (state && validSeconds(state.nextAt)) s.nextAt = state.nextAt;
    if (state && validSeconds(state.mins)) s.mins = state.mins;
    var m = normalizeBreakMins(mins);
    var add = validSeconds(addSec) ? addSec : 0;
    if (typeof idleSec === "number" && idleSec >= RESET_IDLE_SEC) { s.cont = 0; s.nextAt = 0; }
    if (m !== s.mins || (m > 0 && s.nextAt === 0)) {
      s.mins = m;
      s.nextAt = m ? (Math.floor(s.cont / (m * 60)) + 1) * m * 60 : 0;
    }
    s.cont += add;
    if (m > 0 && s.cont >= s.nextAt) {
      s.nextAt = (Math.floor(s.cont / (m * 60)) + 1) * m * 60;
      return { state: s, show: true, minutes: Math.floor(s.cont / 60) };
    }
    return { state: s, show: false, minutes: Math.floor(s.cont / 60) };
  }

  var api = {
    dateKey: dateKey, shiftKey: shiftKey, validDayKey: validDayKey, sanitizeDays: sanitizeDays,
    pruneDays: pruneDays, addSeconds: addSeconds, summarize: summarize, splitDuration: splitDuration,
    formatDuration: formatDuration, normalizeBreakMins: normalizeBreakMins, newReminder: newReminder,
    reminderStep: reminderStep,
    constants: { TICK_MS: TICK_MS, ACTIVE_WINDOW_MS: ACTIVE_WINDOW_MS, WRITE_GAP_MS: WRITE_GAP_MS,
      KEEP_DAYS: KEEP_DAYS, RESET_IDLE_SEC: RESET_IDLE_SEC, VALID_BREAKS: VALID_BREAKS }
  };

  // ---------- runtime ----------

  function boot() {
    if (globalThis.__iyTimerInstalled) return;
    globalThis.__iyTimerInstalled = true;

    var ui = { theme: "green", breakMins: 0 };
    var lastActivity = 0;
    var lastTickAt = 0;
    var lastCreditEnd = 0;
    var timer = 0;
    var unsaved = {};       // { "YYYY-MM-DD": seconds not yet written }
    var carryMs = 0;        // sub-second remainder
    var lastWrite = 0;
    var inflight = false;
    var reminder = newReminder();
    var toastHost = null, toastTimer = 0;

    function t(key, fallback, subs) {
      var text = "";
      try { text = chrome.i18n.getMessage(key, subs); } catch (err) {}
      return text || fallback;
    }

    function normalizeUi(value) {
      var r = { theme: "green", breakMins: 0 };
      if (value && typeof value === "object") {
        if (typeof value.theme === "string") r.theme = value.theme;
        r.breakMins = normalizeBreakMins(value.breakMins);
      }
      return r;
    }


    // finalTick: blur/hidden/pagehide already made the tab invisible/unfocused, so the
    // last slice (tick to now) is judged by the last interaction only.
    function isActive(now, finalTick) {
      return (finalTick || (document.visibilityState === "visible" && document.hasFocus())) &&
        lastActivity > 0 && now - lastActivity <= ACTIVE_WINDOW_MS;
    }

    function onActivity() {
      var now = Date.now();
      if (now - lastActivity > 1000) lastActivity = now;
    }

    function credit(now, finalTick) {
      var elapsed = now - lastTickAt;
      lastTickAt = now;
      if (!isActive(now, finalTick)) return;
      if (elapsed < 0) elapsed = 0;
      if (elapsed > MAX_CREDIT_MS) elapsed = MAX_CREDIT_MS;
      carryMs += elapsed;
      var sec = Math.floor(carryMs / 1000);
      carryMs -= sec * 1000;
      var idle = lastCreditEnd ? (now - lastCreditEnd) / 1000 : 0;
      lastCreditEnd = now;
      if (sec > 0) {
        var key = dateKey(now);
        unsaved[key] = (unsaved[key] || 0) + sec;
      }
      var step = reminderStep(reminder, ui.breakMins, sec, idle);
      reminder = step.state;
      if (step.show) showToast(step.minutes);
    }

    function hasUnsaved() { return Object.keys(unsaved).length > 0; }

    function flush(force) {
      if (inflight || !hasUnsaved()) return;
      var now = Date.now();
      if (!force && now - lastWrite < WRITE_GAP_MS) return;
      var batch = unsaved;
      unsaved = {};
      inflight = true;
      lastWrite = now;
      function restore() {
        Object.keys(batch).forEach(function (k) { unsaved[k] = (unsaved[k] || 0) + batch[k]; });
      }
      try {
        chrome.storage.local.get("usage", IY.core.guard("timer", function (data) {
          try {
            if (chrome.runtime.lastError) { inflight = false; restore(); return; }
            var days = sanitizeDays(data && data.usage && data.usage.days, now);
            Object.keys(batch).forEach(function (k) { days = addSeconds(days, k, batch[k], now); });
            chrome.storage.local.set({ usage: { days: days } }, function () {
              inflight = false;
              if (chrome.runtime.lastError) restore();
            });
          } catch (err) { inflight = false; restore(); throw err; }
        }));
      } catch (err) { inflight = false; restore(); throw err; }
    }

    function tick() {
      credit(Date.now());
      flush(false);
    }

    function start() {
      if (timer) return;
      if (document.visibilityState !== "visible" || !document.hasFocus()) return;
      lastTickAt = Date.now();
      timer = setInterval(IY.core.guard("timer", tick), TICK_MS);
    }

    function stop(final) {
      if (!timer) return;
      clearInterval(timer);
      timer = 0;
      if (final) { try { credit(Date.now(), true); flush(false); } catch (err) {} }
    }

    function sync() {
      if (document.visibilityState === "visible" && document.hasFocus()) start();
      else stop(true);
    }

    function onHidden() {
      if (document.visibilityState === "visible") { sync(); return; }
      stop(true);
      flush(true);
    }

    function onPageHide() {
      stop(true);
      flush(true);
    }

    // ---- break toast ----

    function pickMode() {
      try {
        var nodes = [document.body, document.documentElement];
        for (var i = 0; i < nodes.length; i++) {
          if (!nodes[i]) continue;
          var m = getComputedStyle(nodes[i]).backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
          if (m && (m[4] === undefined || parseFloat(m[4]) > 0)) {
            return (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255 < 0.5 ? "dark" : "light";
          }
        }
      } catch (err) {}
      return undefined;
    }

    function dismissToast() {
      clearTimeout(toastTimer);
      toastTimer = 0;
      if (toastHost && toastHost.parentNode) toastHost.parentNode.removeChild(toastHost);
      toastHost = null;
    }

    function showToast(minutes) {
      if (toastHost || !document.documentElement) return;
      var host = document.createElement("div");
      host.className = "iy-timer-host";
      try {
        if (globalThis.IY && typeof globalThis.IY.themeVars === "function") {
          host.style.cssText = globalThis.IY.themeVars(ui.theme, pickMode());
        }
      } catch (err) {}
      var root = host.attachShadow({ mode: "closed" });
      var style = document.createElement("style");
      style.textContent =
        ":host{all:initial;position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:2147483002;pointer-events:none;" +
        "--bg:var(--iy-surface,#171D19);--text:var(--iy-text,#EAF0E8);--muted:var(--iy-muted,#ACB9AE);--border:var(--iy-border,#39473D);--accent:var(--iy-accent,#9DCEAB);--hover:var(--iy-hover,#252E27)}" +
        ".toast{box-sizing:border-box;display:flex;align-items:center;gap:12px;max-width:min(92vw,420px);padding:10px 10px 10px 14px;" +
        "background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:12px;" +
        "font:13px/1.4 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;pointer-events:auto;opacity:0;transition:opacity .2s ease}" +
        ".toast.show{opacity:1}" +
        ".msg{flex:1;min-width:0}" +
        "button{all:unset;box-sizing:border-box;cursor:pointer;padding:6px 10px;border-radius:8px;color:var(--accent);font:inherit;font-weight:600}" +
        "button:hover{background:var(--hover)}" +
        "button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}" +
        "@media (prefers-reduced-motion:reduce){.toast{transition:none}}";
      var box = document.createElement("div");
      box.className = "toast";
      box.setAttribute("role", "status");
      var fallback = minutes + " dk'dır Instagram'dasın. Kısa bir mola vermeyi dene.";
      var text = t("timerBreakToast", fallback, [String(minutes)]);
      if (text !== fallback && text.indexOf("$1") !== -1) text = text.replace("$1", String(minutes));
      var msg = document.createElement("span");
      msg.className = "msg";
      msg.textContent = text;
      var close = document.createElement("button");
      close.type = "button";
      close.textContent = t("timerBreakDismiss", "Kapat");
      close.setAttribute("aria-label", t("timerBreakDismiss", "Kapat"));
      close.addEventListener("click", function (event) { if (event.isTrusted) dismissToast(); });
      box.append(msg, close);
      root.append(style, box);
      document.documentElement.appendChild(host);
      toastHost = host;
      var reduce = false;
      try { reduce = globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (err) {}
      if (reduce) box.classList.add("show");
      else requestAnimationFrame(function () { box.classList.add("show"); });
      toastTimer = setTimeout(dismissToast, TOAST_MS);
    }

    // ---- wiring ----

    var ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "scroll", "touchstart"];
    var activityOpts = { passive: true, capture: true };


    IY.core.feature("timer", {
      startWithDefaults: true,
      enabled: () => true, // Usage accounting is always on, including when break reminders are off.
      start({ ui: value }) {
        ui = normalizeUi(value);
        ACTIVITY_EVENTS.forEach(n => IY.core.listen(window, n, onActivity, activityOpts));
        IY.core.listen(document, "visibilitychange", onHidden);
        IY.core.listen(window, "focus", sync);
        IY.core.listen(window, "blur", sync);
        IY.core.listen(window, "pagehide", onPageHide);
        sync();
      },
      update({ ui: value }) { ui = normalizeUi(value); },
      stop() { onPageHide(); dismissToast(); }
    });
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    globalThis.IY = Object.assign(globalThis.IY || {}, { usage: api });
    // Popup/options pages may load this file for the helpers only.
    if (typeof document !== "undefined" && typeof location !== "undefined" &&
        location.protocol === "https:" && location.hostname === "www.instagram.com") {
      try { boot(); } catch (err) {}
    }
  }
})();
