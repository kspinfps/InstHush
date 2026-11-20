(function () {
  "use strict";
  const iy = globalThis.IY = globalThis.IY || {};
  if (iy.core) return;

  const features = new Map(), listeners = new Set();
  const settings = Object.create(null), requested = new Set();
  const watched = new Set(["cfg", "ui"]);
  let owner = null;

  // Health check tab: the background opens it with the #iy-health marker and confirms it by tab id.
  // Until confirmed (or refused) the features below stay parked, so a hand-made link cannot switch
  // anything off for good. Those features count usage or ask Instagram for data of their own.
  const HEALTH_OFF = new Set(["timer", "seenposts", "focusLimit", "reelCounter", "feedmode", "followBadge",
    "storyDetails", "storyNoAdvance", "bulkDownload", "unfollowers", "unfollowQueue", "unfollowersHistory",
    "saveSound", "keepUnsent", "voiceDownload"]);
  const healthWaiters = [];
  let healthState = "no";
  try { if (location.hash === "#iy-health") healthState = "pending"; } catch (_) {}

  function stop(entry) {
    if (!entry.active) return;
    entry.active = false;
    invoke(entry, entry.definition.stop, [], undefined, "stop");
    for (const dispose of [...entry.resources]) invoke(entry, dispose);
  }

  function failure(entry, phase) {
    const now = Date.now();
    entry.failures = entry.failures.filter(time => now - time < 60000);
    entry.failures.push(now);
    if (entry.failures.length < 3 || entry.disabled) return;
    entry.disabled = true;
    stop(entry);
    // One background writer merges failures across tabs. Raw errors can contain page data.
    try {
      chrome.runtime.sendMessage({ type: "iy:health", name: entry.name, phase }, () => { void chrome.runtime.lastError; });
    } catch (_) {}
  }

  function settle(entry, result, phase) {
    const generation = entry.generation;
    Promise.resolve(result).catch(() => {
      if (generation !== entry.generation) return;
      failure(entry, phase);
      if (phase === "start") stop(entry);
    });
    return result;
  }

  function invoke(entry, fn, args, receiver, phase = "callback") {
    if (!fn) return;
    const previous = owner;
    owner = entry;
    try {
      const result = args && args.length ? fn.apply(receiver, args) : fn.call(receiver);
      return result && typeof result.then === "function" ? settle(entry, result, phase) : result;
    } catch (_) {
      failure(entry, phase);
      if (phase === "start") stop(entry);
    }
    finally { owner = previous; }
  }

  function invoke0(entry, fn, receiver) {
    const previous = owner;
    owner = entry;
    try {
      const result = fn.call(receiver);
      return result && typeof result.then === "function" ? settle(entry, result, "callback") : result;
    } catch (_) {
      failure(entry, "callback");
    }
    finally { owner = previous; }
  }

  function invoke1(entry, fn, arg, receiver) {
    const previous = owner;
    owner = entry;
    try {
      const result = fn.call(receiver, arg);
      return result && typeof result.then === "function" ? settle(entry, result, "callback") : result;
    } catch (_) {
      failure(entry, "callback");
    }
    finally { owner = previous; }
  }

  function guard(name, fn) {
    if (!fn) return function () {};
    let entry;
    return function (a, b) {
      if (!entry) entry = features.get(name);
      if (!entry || !entry.active || entry.disabled) return;
      const n = arguments.length;
      if (n === 1) return invoke1(entry, fn, a, this);
      if (n === 0) return invoke0(entry, fn, this);
      const args = new Array(n);
      for (let i = 0; i < n; i++) args[i] = arguments[i];
      return invoke(entry, fn, args, this);
    };
  }

  function cleanup(fn) {
    const entry = owner;
    let live = true;
    function dispose() {
      if (!live) return;
      live = false;
      if (entry) entry.resources.delete(dispose);
      fn();
    }
    if (entry) entry.resources.add(dispose);
    return dispose;
  }

  function bind(fn) {
    if (!fn) return function () {};
    if (owner) {
      const entry = owner, generation = entry.generation;
      return function (a, b) {
        if (!entry.active || entry.generation !== generation || entry.disabled) return;
        const n = arguments.length;
        if (n === 1) return invoke1(entry, fn, a, this);
        if (n === 0) return invoke0(entry, fn, this);
        const args = new Array(n);
        for (let i = 0; i < n; i++) args[i] = arguments[i];
        return invoke(entry, fn, args, this);
      };
    }
    return function (a, b) {
      try {
        const n = arguments.length;
        if (n === 1) return fn.call(this, a);
        if (n === 0) return fn.call(this);
        if (n === 2) return fn.call(this, a, b);
        const args = new Array(n);
        for (let i = 0; i < n; i++) args[i] = arguments[i];
        return fn.apply(this, args);
      } catch (_) {}
    };
  }

  function listen(target, type, fn, options) {
    let callback;
    if (owner) {
      const entry = owner, generation = entry.generation;
      callback = function (event) {
        if (entry.active && entry.generation === generation && !entry.disabled) {
          invoke1(entry, fn, event, this);
        }
      };
    } else {
      callback = function (event) { try { fn.call(this, event); } catch (_) {} };
    }
    target.addEventListener(type, callback, options);
    return cleanup(() => target.removeEventListener(type, callback, options));
  }

  function reconcile(entry, changed = []) {
    const def = entry.definition;
    if (healthState !== "no" && HEALTH_OFF.has(entry.name)) return;
    if (entry.disabled || (!def.startWithDefaults && !entry.keys.every(key => Object.hasOwn(settings, key)))) return;
    const on = def.enabled ? invoke(entry, def.enabled, [settings]) :
      settings.ui && settings.ui[entry.name] === true;
    if (!on) { stop(entry); return; }
    if (entry.active) { invoke(entry, def.update, [settings, changed]); return; }
    entry.active = true;
    entry.generation++;
    invoke(entry, def.start, [settings], undefined, "start");
  }

  function publish(keys) {
    for (const entry of features.values()) {
      if (entry.keys.some(key => keys.includes(key))) reconcile(entry, keys);
    }
  }

  let storage;
  try {
    storage = chrome.storage.local;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes) return;
      const keys = Object.keys(changes).filter(key => watched.has(key));
      for (const key of keys) settings[key] = changes[key].newValue;
      publish(keys);
      for (const fn of listeners) fn(changes, area);
    });
  } catch (_) { storage = null; }

  function feature(name, definition) {
    if (features.has(name)) return;
    const keys = definition.keys || ["ui"];
    keys.forEach(key => watched.add(key));
    const entry = { name, keys, definition, active: false, generation: 0, disabled: false, failures: [], resources: new Set() };
    features.set(name, entry);
    if (!keys.length || keys.every(key => Object.hasOwn(settings, key))) { reconcile(entry); return; }
    if (definition.startWithDefaults) reconcile(entry);
    const missing = keys.filter(key => !requested.has(key) && !Object.hasOwn(settings, key));
    if (!storage || !missing.length) return;
    missing.forEach(key => requested.add(key));
    try {
      const pending = storage.get(missing.length === 1 ? missing[0] : missing, data => {
        if (chrome.runtime && chrome.runtime.lastError) {
          missing.forEach(key => requested.delete(key));
          return;
        }
        const fresh = missing.filter(key => !Object.hasOwn(settings, key));
        for (const key of fresh) settings[key] = data && data[key];
        publish(fresh);
      });
      if (pending?.catch) pending.catch(() => missing.forEach(key => requested.delete(key)));
    } catch (_) { missing.forEach(key => requested.delete(key)); }
  }

  function onStorage(fn) {
    const callback = bind(fn);
    listeners.add(callback);
    return cleanup(() => listeners.delete(callback));
  }

  function republish(key) {
    if (!Object.hasOwn(settings, key)) return;
    publish([key]);
    const changes = { [key]: { newValue: settings[key] } };
    for (const fn of listeners) fn(changes, "local");
  }

  function isHealthTab() { return healthState !== "no"; }
  function onHealthTab(fn) {
    if (typeof fn !== "function") return;
    if (healthState === "yes") { try { fn(); } catch (_) {} } else if (healthState === "pending") healthWaiters.push(fn);
  }
  function settleHealth(yes) {
    if (healthState !== "pending") return;
    healthState = yes ? "yes" : "no";
    if (yes) { for (const fn of healthWaiters.splice(0)) { try { fn(); } catch (_) {} } return; }
    healthWaiters.length = 0;
    for (const entry of features.values()) if (HEALTH_OFF.has(entry.name)) reconcile(entry);
  }

  iy.core = { feature, onStorage, listen, bind, guard, cleanup, republish, isHealthTab, onHealthTab };
  if (healthState === "pending") {
    try {
      chrome.runtime.sendMessage({ type: "iy:health-tab" }, reply => {
        void chrome.runtime.lastError;
        settleHealth(!!reply && reply.ok === true && reply.health === true);
      });
    } catch (_) { settleHealth(false); }
  }
})();
