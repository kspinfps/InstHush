// Opt-in settings sync through the browser account (chrome.storage.sync, also in Firefox).
// Off by default. Only catalogue entries marked syncable travel, plus validated key
// bindings: never lists, messages, scans, counters, history, consents or the switch itself.
// Conflict rule: the newest write wins. One record, "iy.settings", keeps the cloud copy
// small (one item, well under the 8 KiB per-item quota) and easy to remove.
(function () {
  "use strict";

  const SYNC_KEY = "iy.settings";
  const STATE_KEY = "syncState";
  const PAYLOAD_VERSION = 1;
  const MAX_BYTES = 7600;
  const DEBOUNCE_MS = 1500;
  const WATCHED = ["cfg", "ui", "shortcuts"];

  function schema() {
    const iy = globalThis.IY;
    if (iy && iy.settingsSchema) return iy.settingsSchema;
    if (typeof module !== "undefined" && module.exports && typeof require === "function") return require("./settings-schema.js");
    throw new Error("settings-schema missing");
  }
  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function normalizeState(raw) {
    const state = isPlainObject(raw) ? raw : {};
    return {
      on: state.on === true,
      device: typeof state.device === "string" && /^[a-f0-9]{16}$/.test(state.device) ? state.device : "",
      sig: typeof state.sig === "string" ? state.sig : "",
      at: Number.isSafeInteger(state.at) && state.at > 0 ? state.at : 0,
      status: ["off", "pending", "synced", "error"].indexOf(state.status) !== -1 ? state.status : (state.on === true ? "pending" : "off"),
      error: typeof state.error === "string" ? state.error.slice(0, 40) : "",
      checkedAt: Number.isSafeInteger(state.checkedAt) && state.checkedAt > 0 ? state.checkedAt : 0
    };
  }

  function newDevice(random) {
    let out = "";
    for (let i = 0; i < 16; i++) out += Math.floor((random || Math.random)() * 16).toString(16);
    return out;
  }

  // { path: value } for the syncable preferences of a local store, normalised.
  function collect(store) {
    const s = schema();
    const values = {};
    for (const entry of s.ENTRIES) {
      if (!entry.syncable || entry.planned || !entry.path) continue;
      if (entry.type === "bindings") values[entry.path] = s.normalizeShortcuts(store && store.shortcuts);
      else values[entry.path] = s.read(store, entry.id);
    }
    return values;
  }

  // Stable text of the values, used to skip echo writes.
  function signature(values) {
    const keys = Object.keys(values || {}).sort();
    return JSON.stringify(keys.map(key => [key, values[key]]));
  }

  function buildPayload(values, at, device) {
    return { v: PAYLOAD_VERSION, at, device, values };
  }

  // Validates a cloud record. Unknown paths are dropped; known ones are normalised.
  function parsePayload(raw) {
    if (!isPlainObject(raw) || raw.v !== PAYLOAD_VERSION || !Number.isSafeInteger(raw.at) || raw.at <= 0 ||
        typeof raw.device !== "string" || !isPlainObject(raw.values)) return null;
    const s = schema();
    const values = {};
    for (const entry of s.ENTRIES) {
      if (!entry.syncable || entry.planned || !entry.path || !Object.prototype.hasOwnProperty.call(raw.values, entry.path)) continue;
      const value = raw.values[entry.path];
      if (entry.type === "bindings") values[entry.path] = s.normalizeShortcuts(value);
      else values[entry.path] = s.normalizeValue(entry, value);
    }
    return { at: raw.at, device: raw.device.slice(0, 16), values };
  }

  // Local storage patch that applies cloud values and keeps everything else as stored.
  function applyValues(store, values) {
    const s = schema();
    let working = Object.assign({}, isPlainObject(store) ? store : {});
    const out = {};
    for (const path of Object.keys(values || {})) {
      const entry = s.get(path);
      if (!entry || !entry.syncable || entry.planned) continue;
      const change = s.patch(working, entry.id, values[path]);
      if (!change) continue;
      Object.assign(out, change);
      working = Object.assign({}, working, change);
    }
    return out;
  }

  // Paths whose values differ, for the first-enable choice.
  function diff(a, b) {
    const keys = new Set(Object.keys(a || {}).concat(Object.keys(b || {})));
    return Array.from(keys).filter(key => JSON.stringify(a && a[key]) !== JSON.stringify(b && b[key]));
  }

  // First enable on this device: push when the account has nothing (or the same), ask otherwise.
  function firstEnable(localValues, remote) {
    if (!remote) return { action: "push", diff: [] };
    const changed = diff(localValues, remote.values);
    return changed.length ? { action: "ask", diff: changed } : { action: "adopt", diff: [] };
  }

  // Background decisions once sync is on.
  function shouldPull(state, remote, localSig) {
    if (!state.on || !remote) return false;
    if (remote.device === state.device) return false;
    if (remote.at <= state.at) return false;
    return signature(remote.values) !== localSig;
  }
  function shouldPush(state, localSig) {
    return state.on && localSig !== state.sig;
  }

  // ------------------------------------------------------------------ storage adapters
  function promisify(area) {
    function call(method, arg) {
      return new Promise((resolve, reject) => {
        try {
          const result = area[method](arg, value => {
            const error = globalThis.chrome && chrome.runtime && chrome.runtime.lastError;
            if (error) reject(new Error(error.message || "storage"));
            else resolve(value || {});
          });
          if (result && typeof result.then === "function") result.then(resolve, reject);
        } catch (error) { reject(error); }
      });
    }
    return {
      get: key => call("get", key),
      set: value => call("set", value),
      remove: key => call("remove", key)
    };
  }
  function adapters(chromeLike) {
    const storage = chromeLike && chromeLike.storage;
    if (!storage || !storage.local || !storage.sync) return null;
    return { local: promisify(storage.local), sync: promisify(storage.sync) };
  }

  function errorCode(error) {
    const text = String(error && error.message || "");
    if (/quota|max_write|too many/i.test(text)) return "quota";
    if (/sync|disabled|unavailable/i.test(text)) return "unavailable";
    return "write";
  }

  async function readLocal(ctx) {
    return ctx.local.get(WATCHED.concat(STATE_KEY));
  }
  async function readRemote(ctx) {
    const data = await ctx.sync.get(SYNC_KEY);
    return parsePayload(data && data[SYNC_KEY]);
  }

  async function writeState(ctx, state, extra) {
    await ctx.local.set(Object.assign({}, extra || {}, { [STATE_KEY]: state }));
    return state;
  }

  // Pushes this device's values and records what was sent. The record carries the time of
  // the local edit (when known), so "newest write wins" compares edits, not upload times.
  async function push(ctx, store, state, editedAt) {
    const values = collect(store);
    const sig = signature(values);
    const at = Math.max(editedAt > 0 ? editedAt : ctx.now(), state.at + 1);
    const payload = buildPayload(values, at, state.device);
    if (JSON.stringify(payload).length > MAX_BYTES) {
      return writeState(ctx, Object.assign({}, state, { status: "error", error: "quota", checkedAt: ctx.now() }));
    }
    await ctx.sync.set({ [SYNC_KEY]: payload });
    return writeState(ctx, Object.assign({}, state, { sig, at, status: "synced", error: "", checkedAt: ctx.now() }));
  }

  // Applies a newer cloud copy; the recorded signature comes from the stored result so the
  // following local change event is recognised as our own and not pushed back.
  async function pull(ctx, store, state, remote) {
    const change = applyValues(store, remote.values);
    const next = Object.assign({}, store, change);
    const sig = signature(collect(next));
    const nextState = Object.assign({}, state, { sig, at: remote.at, status: "synced", error: "", checkedAt: ctx.now() });
    await writeState(ctx, nextState, change);
    return nextState;
  }

  // One full pass: pull a newer cloud copy, otherwise push unsent local changes.
  // options.editedAt: when this device last changed a synced value without pushing it yet;
  // a later local edit beats an older cloud copy.
  async function reconcile(ctx, options) {
    const editedAt = options && options.editedAt > 0 ? options.editedAt : 0;
    const store = await readLocal(ctx);
    let state = normalizeState(store[STATE_KEY]);
    if (!state.on) return state;
    if (!state.device) state = Object.assign({}, state, { device: newDevice(ctx.random) });
    try {
      const remote = await readRemote(ctx);
      const localSig = signature(collect(store));
      const dirty = localSig !== state.sig;
      if (shouldPull(state, remote, localSig) && !(dirty && editedAt > remote.at)) return await pull(ctx, store, state, remote);
      if (remote && remote.device !== state.device && remote.at > state.at && signature(remote.values) === localSig) {
        return await writeState(ctx, Object.assign({}, state, { sig: localSig, at: remote.at, status: "synced", error: "", checkedAt: ctx.now() }));
      }
      if (shouldPush(state, localSig) || !remote || (options && options.force)) return await push(ctx, store, state, editedAt);
      if (state.status !== "synced" || state.error) {
        return await writeState(ctx, Object.assign({}, state, { status: "synced", error: "", checkedAt: ctx.now() }));
      }
      return state;
    } catch (error) {
      return writeState(ctx, Object.assign({}, state, { status: "error", error: errorCode(error), checkedAt: ctx.now() })).catch(() => state);
    }
  }

  // Settings page: switch on. Returns { needsChoice, diff } when both copies exist and differ;
  // call again with choice "local" or "remote".
  async function enable(ctx, choice) {
    const store = await readLocal(ctx);
    const previous = normalizeState(store[STATE_KEY]);
    const device = previous.device || newDevice(ctx.random);
    const base = Object.assign({}, previous, { on: true, device, status: "pending", error: "" });
    let remote;
    try { remote = await readRemote(ctx); }
    catch (error) {
      return { ok: false, error: errorCode(error) };
    }
    const values = collect(store);
    const plan = firstEnable(values, remote);
    try {
      if (plan.action === "ask" && choice !== "local" && choice !== "remote") return { ok: false, needsChoice: true, diff: plan.diff, remote };
      if (plan.action === "adopt") {
        const state = await writeState(ctx, Object.assign({}, base, { sig: signature(values), at: remote.at, status: "synced", checkedAt: ctx.now() }));
        return { ok: true, state };
      }
      if (plan.action === "ask" && choice === "remote") {
        const state = await pull(ctx, store, base, remote);
        return { ok: true, state };
      }
      const state = await push(ctx, store, Object.assign({}, base, { at: Math.max(base.at, remote ? remote.at : 0) }));
      return { ok: state.status === "synced", state, error: state.error };
    } catch (error) {
      await writeState(ctx, Object.assign({}, base, { status: "error", error: errorCode(error), checkedAt: ctx.now() })).catch(() => {});
      return { ok: false, error: errorCode(error) };
    }
  }

  // Switch off: this device stops reading and writing, keeps its preferences, and the
  // InstHush record is removed from the browser account.
  async function disable(ctx) {
    const store = await ctx.local.get(STATE_KEY);
    const state = normalizeState(store[STATE_KEY]);
    await writeState(ctx, Object.assign({}, state, { on: false, status: "off", error: "", sig: "", at: 0 }));
    try { await ctx.sync.remove(SYNC_KEY); return { ok: true }; }
    catch (error) { return { ok: false, error: errorCode(error) }; }
  }

  // Long-lived listener (background). Inert while the switch is off.
  function createEngine(options) {
    const ctx = Object.assign({ now: Date.now, random: Math.random, setTimeout, clearTimeout }, options);
    let timer = 0, running = Promise.resolve(), on = false, stopped = false, editedAt = 0;
    function queue(task) {
      running = running.then(task, task).catch(() => {});
      return running;
    }
    // Runs a pass with the pending local edit time, then forgets it.
    function pass() {
      return queue(() => {
        const at = editedAt;
        editedAt = 0;
        return reconcile(ctx, { editedAt: at });
      });
    }
    function schedule() {
      editedAt = ctx.now();
      if (timer) ctx.clearTimeout(timer);
      timer = ctx.setTimeout(() => { timer = 0; pass(); }, DEBOUNCE_MS);
    }
    function onChanged(changes, area) {
      if (stopped || !changes) return;
      if (area === "local" && changes[STATE_KEY]) {
        const before = normalizeState(changes[STATE_KEY].oldValue);
        const after = normalizeState(changes[STATE_KEY].newValue);
        on = after.on;
        // Only switching on starts a pass here; our own status writes do not.
        // (Retry runs reconcile() directly from the Settings page.)
        if (after.on && !before.on) pass();
        if (!after.on) { if (timer) ctx.clearTimeout(timer); timer = 0; editedAt = 0; }
        return;
      }
      if (!on) return;
      if (area === "local" && WATCHED.some(key => changes[key])) schedule();
      else if (area === "sync" && changes[SYNC_KEY]) {
        const remote = parsePayload(changes[SYNC_KEY].newValue);
        if (remote) {
          // A pending local push is decided now against the incoming copy.
          if (timer) { ctx.clearTimeout(timer); timer = 0; }
          pass();
        }
      }
    }
    function start() {
      return queue(async () => {
        const store = await ctx.local.get(STATE_KEY);
        on = normalizeState(store[STATE_KEY]).on;
        if (on) await reconcile(ctx);
      });
    }
    function stop() {
      stopped = true;
      if (timer) ctx.clearTimeout(timer);
      timer = 0;
    }
    return { start, stop, onChanged, flush: pass, idle: () => running };
  }

  // Background entry point. Does nothing where storage.sync does not exist.
  function install(chromeLike) {
    const io = adapters(chromeLike);
    if (!io || !chromeLike.storage.onChanged) return null;
    const engine = createEngine(io);
    chromeLike.storage.onChanged.addListener(engine.onChanged);
    engine.start();
    return engine;
  }

  const api = Object.freeze({
    SYNC_KEY, STATE_KEY, PAYLOAD_VERSION, MAX_BYTES, DEBOUNCE_MS,
    normalizeState, collect, signature, buildPayload, parsePayload, applyValues, diff, firstEnable,
    shouldPull, shouldPush, adapters, reconcile, enable, disable, createEngine, install
  });
  globalThis.IY = Object.assign(globalThis.IY || {}, { sync: api });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
