(function () {
  "use strict";

  // Pure copy of rules.js isValidUsername: rules.js is not loaded by the popup.
  const reserved = new Set([
    "explore", "direct", "stories", "reels", "reel", "p", "tv", "accounts",
    "about", "legal", "privacy", "safety", "press", "api", "graphql",
    "developer", "challenge", "archive", "your_activity", "settings",
    "notifications", "emails", "web", "oauth", "directory", "topics", "locations",
    "create", "nametag", "session", "login", "signup", "terms", "help", "lite",
    "ads", "business", "threads", "developers", "download", "static"
  ]);
  const forbidden = new Set(["__proto__", "constructor", "prototype"]);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const record = value => !!value && typeof value === "object" && !Array.isArray(value);
  const timestamp = value => Number.isSafeInteger(value) && value >= 0;

  function username(value) {
    if (typeof value !== "string") return "";
    const clean = value.trim().toLowerCase();
    if (!/^[a-z0-9._]{1,30}$/.test(clean) || /^\.+$/.test(clean) ||
        reserved.has(clean) || forbidden.has(clean)) return "";
    return clean;
  }

  // Keep stored/manual order. Only add() prepends; sorting here would undo move().
  function normalize(raw) {
    const result = { v: 1, items: [] };
    if (!record(raw) || !own(raw, "v") || raw.v !== 1 ||
        !own(raw, "items") || !Array.isArray(raw.items)) return result;
    const seen = new Set();
    for (let i = 0; i < raw.items.length && result.items.length < 50; i++) {
      if (!own(raw.items, i)) continue;
      const item = raw.items[i];
      if (!record(item) || !own(item, "u") || !own(item, "t")) continue;
      const u = username(item.u);
      if (!u || !timestamp(item.t) || seen.has(u)) continue;
      seen.add(u);
      result.items.push({ u, t: item.t });
    }
    return result;
  }

  function add(list, value, now) {
    const result = normalize(list), u = username(value);
    if (!u || !timestamp(now) || result.items.some(item => item.u === u)) return result;
    result.items.unshift({ u, t: now });
    result.items.length = Math.min(result.items.length, 50);
    return result;
  }

  function remove(list, value) {
    const result = normalize(list), u = username(value);
    result.items = result.items.filter(item => item.u !== u);
    return result;
  }

  function has(list, value) {
    const u = username(value);
    return !!u && normalize(list).items.some(item => item.u === u);
  }

  function move(list, value, delta) {
    const result = normalize(list), u = username(value);
    const index = result.items.findIndex(item => item.u === u);
    if (index < 0 || !Number.isSafeInteger(delta)) return result;
    const target = Math.max(0, Math.min(result.items.length - 1, index + delta));
    const item = result.items.splice(index, 1)[0];
    result.items.splice(target, 0, item);
    return result;
  }

  async function load() {
    try {
      const stored = await chrome.storage.local.get("favorites");
      return normalize(stored && own(stored, "favorites") ? stored.favorites : null);
    } catch (_) { return normalize(null); }
  }

  async function save(list) {
    try {
      await chrome.storage.local.set({ favorites: normalize(list) });
      return true;
    } catch (_) { return false; }
  }

  const api = { normalize, add, remove, has, move, load, save };
  globalThis.IY = Object.assign(globalThis.IY || {}, { favorites: api });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
