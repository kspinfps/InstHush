(function () {
  "use strict";
  // Bounded local settings; kept identical to the MAIN-world normalizer.
  const normalizeMute = (function () {
  const uncurry = Function.prototype.bind.bind(Function.prototype.call);
  const isArray = Array.isArray;
  const strTrim = uncurry(String.prototype.trim);
  const strLower = uncurry(String.prototype.toLowerCase);
  const strLocaleLower = uncurry(String.prototype.toLocaleLowerCase);
  const strSlice = uncurry(String.prototype.slice);
  const strIncludes = uncurry(String.prototype.includes);
  const regexExec = uncurry(RegExp.prototype.exec);
  function muteEntry(value, account) {
    if (typeof value !== "string" || value.length > 102) return "";
    let clean = strTrim(value);
    if (account && clean[0] === "@") clean = strSlice(clean, 1);
    if (!clean || clean.length > 50) return "";
    if (account) {
      if (!regexExec(/^[A-Za-z0-9_](?:[A-Za-z0-9_.]{0,28}[A-Za-z0-9_])?$/, clean) || strIncludes(clean, "..")) return "";
      return strLower(clean);
    }
    return strLocaleLower(clean, "tr");
  }
  function normalizeMute(value) {
    const result = { words: [], accounts: [] };
    if (!value || typeof value !== "object" || isArray(value)) return result;
    for (let k = 0, names = ["words", "accounts"]; k < names.length; k++) {
      const key = names[k], list = value[key], out = result[key];
      if (!isArray(list)) continue;
      for (let i = 0; i < list.length && i < 100; i++) {
        const clean = muteEntry(list[i], key === "accounts");
        if (!clean) continue;
        let duplicate = false;
        for (let j = 0; j < out.length; j++) if (out[j] === clean) duplicate = true;
        if (!duplicate) out[out.length] = clean;
      }
    }
    return result;
  }
    return normalizeMute;
  })();
  const defaults = { video: true, ads: true, ghostStory: true, ghostDm: true };
  const keys = ["ads", "story", "dm", "leak", "error"];
  const stats = { ads: 0, story: 0, dm: 0, leak: 0, error: 0, last: { ads: 0, story: 0, dm: 0 } };
  let ready = false;
  let dirty = false;
  let timer = null;
  let cfgRevision = 0;
  let uiRevision = 0;
  let lastUi;
  let port = null;
  let acknowledged = false;
  const offers = new Set();
  let retry = null;
  let attempts = 0;
  let lastCfg = { ...defaults, ghostTyping: false, blockAnalytics: false, suggested: false, noReels: false, mute: { words: [], accounts: [] } };
  const avatars = new Map();
  const avatarListeners = new Set();
  const routeListeners = new Set();
  const dmUsedListeners = new Set();
  const MAX_AVATARS = 200;
  const earlyAvatars = [];
  function validCdn(url) {
    return globalThis.IY && typeof globalThis.IY.isAllowedCdn === "function" && globalThis.IY.isAllowedCdn(url);
  }
  function validUsername(username) {
    return globalThis.IY && typeof globalThis.IY.isValidUsername === "function" && globalThis.IY.isValidUsername(username);
  }
  function drainAvatars() {
    if (!globalThis.IY || typeof globalThis.IY.isAllowedCdn !== "function") return;
    for (const entry of earlyAvatars.splice(0)) storeAvatar(entry.username, entry.url, entry.area);
  }
  function storeAvatar(username, url, area = 0) {
    if (!validUsername(username) || !validCdn(url) || !Number.isFinite(area) || area < 0) return false;
    const cleanUser = username.trim();
    const key = cleanUser.toLowerCase();
    const previous = avatars.get(key);
    if (previous && previous.area >= area) return false;
    if (!avatars.has(key) && avatars.size >= MAX_AVATARS) {
      const oldest = avatars.keys().next().value;
      if (oldest !== undefined) avatars.delete(oldest);
    }
    const entry = Object.freeze({ username: cleanUser, url, area });
    avatars.set(key, entry);
    for (const fn of avatarListeners) {
      try { fn(entry); } catch (_) {}
    }
    return true;
  }
  // "Follows you" flags (I2): bounded, validated like avatars, never leave this closure.
  const followsMap = new Map();
  const followsListeners = new Set();
  const earlyFollows = [];
  function followsValid(msg) {
    return !!globalThis.IY && typeof globalThis.IY.isValidFollowsMessage === "function" && globalThis.IY.isValidFollowsMessage(msg);
  }
  function drainFollows() {
    if (!globalThis.IY || typeof globalThis.IY.isValidFollowsMessage !== "function") return;
    for (const entry of earlyFollows.splice(0)) storeFollows(entry);
  }
  function storeFollows(msg) {
    if (!followsValid(msg)) return false;
    const key = msg.username.trim().toLowerCase();
    if (followsMap.get(key) === msg.follows) return false;
    if (!followsMap.has(key) && followsMap.size >= MAX_AVATARS) {
      const oldest = followsMap.keys().next().value;
      if (oldest !== undefined) followsMap.delete(oldest);
    }
    followsMap.set(key, msg.follows);
    for (const fn of followsListeners) { try { fn(key, msg.follows); } catch (_) {} }
    return true;
  }
  const profileRequests = new Map();
  let nextProfileRequest = 0;
  const relayRequests = new Map();
  let nextRelayId = 0;
  const avatarApi = {
    requestRelay(op, args, timeoutMs, signal) {
      if (!acknowledged || !port || signal.aborted) return Promise.reject(new Error("Relay unavailable"));
      return new Promise((resolve, reject) => {
        const id = ++nextRelayId;
        const finish = reply => {
          relayRequests.delete(id);
          clearTimeout(timer);
          signal.removeEventListener("abort", abort);
          if (reply?.ok === true) resolve(reply.result);
          else reject(new Error(reply?.error || "Relay unavailable"));
        };
        const abort = () => finish(null);
        const timer = setTimeout(abort, timeoutMs);
        relayRequests.set(id, finish);
        signal.addEventListener("abort", abort, { once: true });
        try { port.postMessage({ type: "iy:relay-req", id, op, args }); } catch (_) { abort(); }
      });
    },
    sendDmArchive(value) {
      if (!acknowledged || !port) return false;
      try { port.postMessage(value); return true; } catch (_) { return false; }
    },
    getProfileQuery(username, { signal } = {}) {
      if (!port || !acknowledged || lastUi?.bulkProfile !== true || signal?.aborted) return null;
      return new Promise(resolve => {
        const id = ++nextProfileRequest;
        const finish = query => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", abort);
          profileRequests.delete(id);
          resolve(query);
        };
        const abort = () => finish(null);
        const timer = setTimeout(abort, 1200);
        profileRequests.set(id, finish);
        signal?.addEventListener("abort", abort, { once: true });
        try { port.postMessage({ type: "iy:profile-query", id, username }); } catch (_) { abort(); }
      });
    },
    getFollowsYou(username) {
      drainFollows();
      if (typeof username !== "string" || !username.trim()) return null;
      const value = followsMap.get(username.trim().toLowerCase());
      return typeof value === "boolean" ? value : null;
    },
    onFollows(fn) {
      drainFollows();
      if (typeof fn !== "function") return function () {};
      followsListeners.add(fn);
      return function () { followsListeners.delete(fn); };
    },
    onRoute(fn) {
      if (typeof fn !== "function") return function () {};
      routeListeners.add(fn);
      return function () { routeListeners.delete(fn); };
    },
    getAvatar(username) {
      drainAvatars();
      if (typeof username !== "string" || !username.trim()) return null;
      const entry = avatars.get(username.trim().toLowerCase());
      return entry ? entry.url : null;
    },
    setAvatar(username, url, area) {
      return storeAvatar(username, url, area);
    },
    // One-shot DM read allowance for one thread (ISOLATED -> MAIN, private channel only).
    // Returns false when the channel is not ready or the id is not a plain numeric thread id.
    allowDmRead(id, ms) {
      if (typeof id !== "string" || !/^[0-9]{5,25}$/.test(id) || !port) return false;
      try { port.postMessage({ type: "iy:dmallow", id, ms: Number.isFinite(ms) ? ms : 10000 }); return true; }
      catch (_) { return false; }
    },
    cancelDmRead() {
      if (!port) return false;
      try { port.postMessage({ type: "iy:dmcancel" }); return true; } catch (_) { return false; }
    },
    onDmUsed(fn) {
      if (typeof fn !== "function") return function () {};
      dmUsedListeners.add(fn);
      return function () { dmUsedListeners.delete(fn); };
    },
    onAvatar(fn) {
      drainAvatars();
      if (typeof fn !== "function") return function () {};
      avatarListeners.add(fn);
      return function () { avatarListeners.delete(fn); };
    }
  };
  // This namespace is ISOLATED; the map never leaves this closure.
  const namespace = globalThis.IY || {};
  for (const [name, value] of Object.entries(avatarApi)) {
    Object.defineProperty(namespace, name, { value, enumerable: true });
  }
  Object.defineProperty(globalThis, "IY", { value: namespace, writable: true });
  function offerChannel() {
    if (acknowledged) return;
    const channel = new MessageChannel();
    offers.add(channel.port1);
    channel.port1.addEventListener("message", function (event) {
      if (acknowledged && port !== channel.port1) return;
      try {
        const value = event.data;
        if (value && value.type === "iy:ack") {
          acknowledged = true;
          port = channel.port1;
          for (const offered of offers) if (offered !== port) offered.close();
          offers.clear();
          clearTimeout(retry);
          retry = null;
          if (ready || uiRevision > 0) port.postMessage(lastCfg);
          if (lastUi?.bulkProfile === true) port.postMessage({ type: "iy:profile-config", enabled: true });
          globalThis.IY.dmArchive?.reconnect();
          return;
        }
        if (!acknowledged || port !== channel.port1) return;
        if (value?.type === "iy:relay-res") {
          relayRequests.get(value.id)?.(value);
          return;
        }
        if (value?.type === "iy:profile-result") {
          profileRequests.get(value.id)?.(lastUi?.bulkProfile === true ? value.query : null);
          return;
        }
        if (value?.type === "iy:dmarchive-events" || value?.type === "iy:dmarchive-rows") {
          globalThis.IY.dmArchive?.accept(value);
          return;
        }
        if (value && value.type === "iy:route") {
          for (const fn of routeListeners) { try { fn(); } catch (_) {} }
          return;
        }
        if (value && value.type === "iy:dmused") {
          for (const fn of dmUsedListeners) { try { fn(); } catch (_) {} }
          return;
        }
        if (value && value.type === "iy:follows") {
          if (typeof globalThis.IY.isValidFollowsMessage !== "function") {
            if (earlyFollows.length < MAX_AVATARS) earlyFollows.push(value);
          } else storeFollows(value);
          return;
        }
        if (value && value.type === "iy:avatar") {
          if (typeof globalThis.IY.isAllowedCdn !== "function") {
            if (earlyAvatars.length < MAX_AVATARS) earlyAvatars.push({ username: value.username, url: value.url, area: value.area });
          } else storeAvatar(value.username, value.url, value.area);
          return;
        }
        if (!value || !keys.includes(value.k) || !Number.isSafeInteger(value.n) || value.n <= 0 || value.n > 1000) return;
        stats[value.k] += value.n;
        if (Object.hasOwn(stats.last, value.k)) stats.last[value.k] = Date.now();
        dirty = true;
        schedule();
      } catch (_) { /* Ignore malformed diagnostics. */ }
    });
    channel.port1.start();
    window.postMessage({ type: "iy:channel" }, location.origin, [channel.port2]);
    if (++attempts < 4) retry = setTimeout(offerChannel, 150);
    else retry = null;
  }
  offerChannel();
  function sync(value, ui = lastUi) {
    const cfg = { ...defaults };
    for (const key of Object.keys(defaults)) {
      if (value && typeof value[key] === "boolean") cfg[key] = value[key];
    }
    if (port && (ui?.bulkProfile === true) !== (lastUi?.bulkProfile === true)) {
      port.postMessage({ type: "iy:profile-config", enabled: ui?.bulkProfile === true });
      if (!ui?.bulkProfile) for (const finish of profileRequests.values()) finish(null);
    }
    lastUi = ui;
    cfg.blockAnalytics = ui?.blockAnalytics === true;
    cfg.ghostTyping = !!ui && ui.ghostTyping === true;
    const opts = ui && ui.focusOpts;
    cfg.suggested = opts && typeof opts === "object" && !Array.isArray(opts) ? opts.suggested === true : !!ui && ui.focus === true;
    cfg.noReels = !!opts && typeof opts === "object" && !Array.isArray(opts) && opts.noReels === true;
    cfg.mute = normalizeMute(ui && ui.mute);
    lastCfg = cfg;
    if (ready || uiRevision > 0) {
      if (port) port.postMessage(cfg);
      else for (const offered of offers) offered.postMessage(cfg);
    }
  }
  window.addEventListener("pageshow", function (event) {
    if (!event.persisted) return;
    const revision = cfgRevision;
    const uiBefore = uiRevision;
    chrome.storage.local.get(["cfg", "ui"], function (saved) {
      if (!chrome.runtime.lastError) sync(revision === cfgRevision ? saved && saved.cfg : lastCfg,
        uiBefore === uiRevision ? saved && saved.ui : lastUi);
    });
  });
  function schedule() {
    if (!ready || !dirty || timer !== null) return;
    timer = setTimeout(function () {
      timer = null;
      dirty = false;
      // Flush only this tab's deltas onto the stored totals, so several open
      // Instagram tabs add up instead of overwriting each other.
      const delta = { ...stats, last: { ...stats.last } };
      for (const key of keys) stats[key] = 0;
      function restore() {
        for (const key of keys) stats[key] += delta[key];
        dirty = true;
      }
      try {
        chrome.storage.local.get("stats", function (saved) {
          if (chrome.runtime.lastError) { restore(); return; }
          const base = (saved && saved.stats) || {};
          const next = { last: {} };
          for (const key of keys) {
            const prev = Number.isSafeInteger(base[key]) && base[key] >= 0 ? base[key] : 0;
            next[key] = Math.min(Number.MAX_SAFE_INTEGER, prev + delta[key]);
          }
          for (const key of Object.keys(stats.last)) {
            const prev = base.last && Number.isFinite(base.last[key]) ? base.last[key] : 0;
            next.last[key] = Math.max(prev, delta.last[key]);
          }
          chrome.storage.local.set({ stats: next }, function () {
            if (chrome.runtime.lastError) restore();
          });
        });
      } catch (_) { restore(); }
    }, 2000);
  }
  globalThis.IY.core.onStorage(function (changes, area) {
    if (area === "local" && changes.cfg) {
      cfgRevision++;
      sync(changes.cfg.newValue);
    }
    if (area === "local" && changes.ui) {
      uiRevision++;
      sync(lastCfg, changes.ui.newValue);
    }
  });
  const revision = cfgRevision;
  const uiBefore = uiRevision;
  try {
    // `stats` here holds only this tab's unsaved deltas; totals live in storage.
    chrome.storage.local.get(["cfg", "ui"], function (saved) {
      const failed = chrome.runtime.lastError;
      ready = true;
      if (!failed && saved) sync(revision === cfgRevision ? saved.cfg : lastCfg,
        uiBefore === uiRevision ? saved.ui : lastUi);
      else sync(lastCfg, lastUi);
      schedule();
    });
  } catch (_) { ready = true; sync(lastCfg, lastUi); schedule(); }
})();
