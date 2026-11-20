(function () {
  "use strict";

  const STORAGE_KEY = "iy.rateLimitedUntil";
  const DEFAULT_BASE_MS = 30 * 60 * 1000;
  const DEFAULT_MAX_MS = 4 * DEFAULT_BASE_MS;
  const waitMessage = /\bplease wait a few minutes\b/i;
  const limitCode = /^(?:checkpoint_required|challenge_required|feedback_required)$/i;
  const pendingWrites = new WeakMap();

  function isRateLimited(status, body) {
    if (status === 429) return true;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch (_) { /* Also accept plain text. */ }
    }
    if (typeof body === "string") return waitMessage.test(body) || limitCode.test(body.trim());
    if (!body || typeof body !== "object") return false;

    const errors = Array.isArray(body.errors) ? body.errors : [];
    for (const item of [body, body.error, ...errors]) {
      if (!item) continue;
      if ([item, item.message, item.error_type, item.error, item.code, item.status].some(value =>
        typeof value === "string" && (limitCode.test(value.trim()) || waitMessage.test(value)))) return true;
      if ((status === 401 || status === 403) && (item.checkpoint || item.checkpoint_url || item.challenge ||
          item.challenge_url || item.checkpoint_required === true || item.challenge_required === true)) return true;
    }
    return false;
  }

  function createCooldown(storage, {
    key = STORAGE_KEY, baseMs = DEFAULT_BASE_MS, maxMs = DEFAULT_MAX_MS, now = Date.now, random = Math.random
  } = {}) {
    if (!Number.isSafeInteger(baseMs) || baseMs <= 0 || !Number.isSafeInteger(maxMs) || maxMs < baseMs) {
      throw new RangeError("Cooldown requires positive integer delays with maxMs at least baseMs");
    }

    async function readUntil() {
      const stored = await storage.get(key);
      const until = stored?.[key];
      return Number.isSafeInteger(until) && until > 0 ? until : 0;
    }

    async function getUntil() {
      await pendingWrites.get(storage);
      return readUntil();
    }

    async function remainingMs() {
      return Math.max(0, (await getUntil()) - now());
    }

    async function setUntil(until) {
      if (!Number.isSafeInteger(until) || until < 0) throw new RangeError("Invalid cooldown timestamp");
      const previous = pendingWrites.get(storage);
      const write = (async () => {
        await previous;
        const current = await readUntil();
        if (until <= current) return current;
        await storage.set({ [key]: until });
        return until;
      })();
      // Serialize read/extend/write operations from helpers sharing this storage object.
      pendingWrites.set(storage, write.catch(() => {}));
      return write;
    }

    async function extend(attempt = 0) {
      if (!Number.isSafeInteger(attempt) || attempt < 0) throw new RangeError("Invalid cooldown attempt");
      const delay = Math.min(maxMs, baseMs * 2 ** attempt);
      const jitter = Math.floor(Math.min(maxMs - delay, delay / 4) * random());
      return setUntil(now() + delay + jitter);
    }

    return { getUntil, remainingMs, setUntil, extend };
  }

  const api = { STORAGE_KEY, isRateLimited, createCooldown };
  globalThis.IY = Object.assign(globalThis.IY || {}, { rateLimit: api });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
