// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
// Copyright jewdev
(function () {
  "use strict";

  const FOCUS_KEY = "ige.focus";
  const REELS_KEY = "ige.reels";
  const MINUTE_MS = 60_000;
  const EXTRA_MS = 5 * MINUTE_MS;
  const MAX_SEEN = 1000;

  function dayKey(date = new Date()) {
    const pad = value => String(value).padStart(2, "0");
    return `${String(date.getFullYear()).padStart(4, "0")}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function duration(value) {
    return Number.isFinite(value) && value > 0 ? Math.min(value, Number.MAX_SAFE_INTEGER) : 0;
  }

  function isToday(stored, day) {
    return stored && typeof stored === "object" && !Array.isArray(stored) && stored.day === day;
  }

  function today(stored, day = dayKey()) {
    if (!isToday(stored, day)) return { day, usedMs: 0, extraMs: 0 };
    return { day, usedMs: duration(stored.usedMs), extraMs: duration(stored.extraMs) };
  }

  function addUsage(stored, day, elapsedMs) {
    const usage = today(stored, day);
    usage.usedMs = duration(usage.usedMs + duration(elapsedMs));
    return usage;
  }

  function addExtra(stored, day, ms = EXTRA_MS) {
    const usage = today(stored, day);
    usage.extraMs = duration(usage.extraMs + duration(ms));
    return usage;
  }

  function remainingMs(usage, limitMin, day = usage?.day) {
    const { usedMs, extraMs } = today(usage, day);
    return Math.max(0, duration(duration(limitMin) * MINUTE_MS + extraMs) - usedMs);
  }

  function validReelId(id) {
    return typeof id === "string" && /^[A-Za-z0-9_-]+$/.test(id);
  }

  function reelTally(stored, day = dayKey()) {
    const seen = new Set();
    if (!isToday(stored, day)) return { day, count: 0, seen: [] };
    if (Array.isArray(stored.seen)) {
      for (const id of stored.seen) {
        if (!validReelId(id)) continue;
        seen.delete(id);
        seen.add(id);
      }
    }
    const count = Number.isSafeInteger(stored.count) && stored.count >= 0 ? stored.count : 0;
    return { day, count: Math.max(count, seen.size), seen: [...seen].slice(-MAX_SEEN) };
  }

  function addReel(stored, day, id) {
    const tally = reelTally(stored, day);
    if (!validReelId(id) || tally.seen.includes(id)) return tally;
    tally.count = Math.min(tally.count + 1, Number.MAX_SAFE_INTEGER);
    tally.seen.push(id);
    if (tally.seen.length > MAX_SEEN) tally.seen.shift();
    return tally;
  }

  function isLimitedPath(pathname) {
    return typeof pathname === "string" && /^\/(?:reels|explore)(?:\/|$)/.test(pathname);
  }

  function formatLeft(ms) {
    const seconds = Math.ceil(duration(ms) / 1000);
    if (seconds < 60) return `${seconds} s`;
    const minutes = Math.ceil(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} h ${rest} min` : `${hours} h`;
  }

  const api = {
    FOCUS_KEY, REELS_KEY, EXTRA_MS, MAX_SEEN, dayKey, today, addUsage, addExtra,
    remainingMs, reelTally, addReel, isLimitedPath, formatLeft
  };
  globalThis.IY = Object.assign(globalThis.IY || {}, { focusBudget: api });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
