// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
(function () {
  "use strict";

  const iy = globalThis.IY ||= {};
  const node = typeof module !== "undefined" && module.exports;
  if (!node && iy.dmArchive) {
    iy.dmArchive.mountUi?.();
    return;
  }
  const protocol = node ? require("../../page/dm-capture.js") : iy.dmCapture;
  if (!protocol) return;

  const { accountId, accountFromCookie, threadFromPath, messageId, normalizeEvent, time } = protocol;
  const KEY = "iy.dmArchive.v1";
  const STORAGE_MESSAGE = "iy:dmarchive-local";
  const MAX_PER_THREAD = 500;
  const MAX_CANDIDATES = 1200;
  const MAX_PENDING = 200;
  const MAX_ARCHIVED = 1500;
  const MAX_BYTES = 1536 * 1024;
  const RETENTION = 30 * 86400000;
  const MATCH_WINDOW = 2 * 60000;
  const CAPTURE_LAG = 5 * 60000;
  const encoder = new TextEncoder();

  const STRINGS = {
    tr: {
      setKeepUnsent: "Geri alınan mesajları sakla",
      setKeepUnsentDesc: "Geri alınan mesajları 30 güne kadar yalnızca bu cihazda saklar. Sohbetten temizleyebilirsin.",
      dmArchiveTitle: "Geri alınanlar",
      dmArchiveMark: "Geri alındı",
      dmArchiveEmpty: "Bu sohbette saklanan geri alınmış mesaj yok.",
      dmArchiveMedia: "Medya eklentisi",
      dmArchiveClose: "Kapat",
      dmArchiveClear: "Temizle",
      dmArchiveConfirm: "Bu sohbetin arşivi silinsin mi?",
      dmArchiveCancel: "Vazgeç",
      dmArchiveJson: "JSON olarak kaydet",
      dmArchiveTxt: "TXT olarak kaydet",
      dmArchiveError: "Arşiv işlemi tamamlanamadı.",
      dmArchiveLoading: "Arşiv yükleniyor…"
    },
    en: {
      setKeepUnsent: "Keep unsent messages",
      setKeepUnsentDesc: "Stores unsent messages on this device for up to 30 days. You can clear them from the chat.",
      dmArchiveTitle: "Unsent messages",
      dmArchiveMark: "Unsent",
      dmArchiveEmpty: "There are no archived unsent messages in this chat.",
      dmArchiveMedia: "Media attachment",
      dmArchiveClose: "Close",
      dmArchiveClear: "Clear",
      dmArchiveConfirm: "Clear this chat’s archive?",
      dmArchiveCancel: "Cancel",
      dmArchiveJson: "Save as JSON",
      dmArchiveTxt: "Save as TXT",
      dmArchiveError: "Could not complete the archive action.",
      dmArchiveLoading: "Loading archive…"
    }
  };

  function invoke(api, target, method, ...args) {
    return new Promise((resolve, reject) => {
      function done(value) {
        if (api.runtime?.lastError) reject(new Error("DM archive browser API failed"));
        else resolve(value);
      }
      try {
        const result = target[method](...args, done);
        if (result?.then) result.then(resolve, reject);
      } catch (error) { reject(error); }
    });
  }

  const pair = (thread, mid) => thread + ":" + mid;

  function createBuffer(owner, now = Date.now) {
    const candidates = new Map();
    const pending = new Map();
    const matched = new Map();
    const cutoffs = new Map();
    const counts = new Map();

    function forget(key) {
      const previous = candidates.get(key);
      if (!previous) return;
      const thread = previous.record.threadId;
      candidates.delete(key);
      if (counts.get(thread) === 1) counts.delete(thread);
      else counts.set(thread, counts.get(thread) - 1);
    }

    function bound(map, limit) {
      while (map.size > limit) map.delete(map.keys().next().value);
    }

    function clear(thread, at) {
      cutoffs.set(thread, Math.max(cutoffs.get(thread) || 0, at));
      bound(cutoffs, MAX_ARCHIVED);
      for (const [key, entry] of candidates) {
        if (entry.record.threadId === thread && entry.firstObservedAt <= at) forget(key);
      }
      for (const [key, entry] of pending) {
        if (entry.threadId === thread && entry.at <= at) pending.delete(key);
      }
    }

    function ingest(records, source, observedAt) {
      const clock = now();
      if (!time(observedAt) || observedAt < clock - CAPTURE_LAG || observedAt > clock + 1000 ||
          (source !== "http" && source !== "socket") || !Array.isArray(records) ||
          records.length > protocol.MAX_EVENTS) return [];
      for (const [key, entry] of pending) if (entry.at <= clock - MATCH_WINDOW) pending.delete(key);
      for (const [key, entry] of candidates) if (entry.observedAt <= clock - RETENTION) forget(key);
      const out = [];
      function match(key, entry, at) {
        forget(key);
        pending.delete(key);
        matched.set(key, at);
        bound(matched, MAX_ARCHIVED);
        out.push({ ...entry.record, unsentAt: at });
      }
      for (const value of records) {
        const record = normalizeEvent(value);
        if (!record || observedAt <= (cutoffs.get(record.threadId) || 0)) continue;
        const key = pair(record.threadId, record.messageId);
        if (matched.has(key)) continue;
        if (record.kind === "unsent") {
          if (source !== "socket" || observedAt <= clock - MATCH_WINDOW) continue;
          const entry = candidates.get(key);
          if (entry && entry.firstObservedAt <= observedAt) match(key, entry, observedAt);
          else if (!pending.has(key)) pending.set(key, { threadId: record.threadId, at: observedAt });
          bound(pending, MAX_PENDING);
          continue;
        }
        if (record.senderId === owner) continue;
        const removal = pending.get(key);
        if (removal) {
          if (observedAt <= removal.at) match(key, { record }, removal.at);
          continue;
        }
        const previous = candidates.get(key);
        if (previous && previous.record.senderId !== record.senderId) continue;
        if (previous) {
          // A late HTTP snapshot can fill gaps in a live record. An older snapshot cannot replace it.
          const older = previous.source === source ? previous.observedAt > observedAt : previous.source === "socket";
          const best = older ? previous.record : record;
          const fallback = older ? record : previous.record;
          candidates.set(key, {
            record: { ...best, text: best.text || fallback.text, media: best.media.length ? best.media : fallback.media,
              timestampMs: best.timestampMs || fallback.timestampMs },
            source: older ? previous.source : source,
            observedAt: older ? previous.observedAt : observedAt,
            firstObservedAt: Math.min(observedAt, previous.firstObservedAt)
          });
          continue;
        }
        candidates.set(key, { record, source, observedAt, firstObservedAt: observedAt });
        const thread = record.threadId;
        counts.set(thread, (counts.get(thread) || 0) + 1);
        if (counts.get(thread) > MAX_PER_THREAD) {
          for (const [oldKey, entry] of candidates) {
            if (entry.record.threadId === thread) { forget(oldKey); break; }
          }
        }
        if (candidates.size > MAX_CANDIDATES) forget(candidates.keys().next().value);
      }
      return out;
    }

    return { ingest, clear };
  }

  function normalizeSaved(value, clock) {
    if (value?.kind !== "message" || !time(value.unsentAt) || value.unsentAt <= clock - RETENTION ||
        value.unsentAt > clock + 1000) return null;
    const account = accountId(value.account);
    const record = normalizeEvent(value);
    return account && record && record.senderId !== account ? { ...record, account, unsentAt: value.unsentAt } : null;
  }

  function cleanState(value, clock) {
    const records = [];
    const clears = [];
    if (!value || value.version !== 1) return { version: 1, records, clears };
    if (Array.isArray(value.records)) {
      for (const entry of value.records.slice(0, MAX_ARCHIVED)) {
        const record = normalizeSaved(entry, clock);
        if (record) records.push(record);
      }
    }
    if (Array.isArray(value.clears)) {
      for (const entry of value.clears.slice(0, MAX_ARCHIVED)) {
        const account = accountId(entry?.account);
        const threadId = accountId(entry?.threadId);
        if (account && threadId && time(entry.at) && entry.at > clock - CAPTURE_LAG && entry.at <= clock + 1000) {
          clears.push({ account, threadId, at: entry.at });
        }
      }
    }
    return { version: 1, records, clears };
  }

  function boundState(state) {
    const counts = new Map();
    const seen = new Set();
    const records = [];
    state.records.sort((a, b) => b.unsentAt - a.unsentAt);
    // Count serialized UTF-8 bytes as storage.local does, including JSON escaping.
    let bytes = encoder.encode(KEY + JSON.stringify({ ...state, records: [] })).length;
    for (const record of state.records) {
      const thread = pair(record.account, record.threadId);
      const key = pair(thread, record.messageId);
      const count = counts.get(thread) || 0;
      if (count >= MAX_PER_THREAD || seen.has(key)) continue;
      const size = encoder.encode(JSON.stringify(record)).length + 1;
      if (records.length >= MAX_ARCHIVED || bytes + size > MAX_BYTES) break;
      bytes += size;
      counts.set(thread, count + 1);
      seen.add(key);
      records.push(record);
    }
    state.records = records;
  }

  function makeWriter(api, now = Date.now) {
    const local = api.storage.local;
    let queue = Promise.resolve();
    function handle(message) {
      const run = queue.then(async () => {
        const action = message?.action;
        const account = accountId(message?.account);
        const threadId = accountId(message?.threadId);
        if (action !== "prune" && (!account || !["append", "read", "clear"].includes(action) ||
            (action !== "append" && !threadId))) return { ok: false };
        if (action === "append" && (!Array.isArray(message.records) || message.records.length > protocol.MAX_EVENTS)) {
          return { ok: false };
        }
        const saved = await invoke(api, local, "get", [KEY, "ui"]);
        if (action !== "prune" && saved.ui?.keepUnsent !== true) return { ok: false };
        const clock = now();
        const original = saved[KEY];
        const state = cleanState(original, clock);
        const cutoffMap = new Map(state.clears.map(entry => [pair(entry.account, entry.threadId), entry.at]));
        let changed = !!original && (original.version !== 1 || original.records?.length !== state.records.length ||
          original.clears?.length !== state.clears.length);
        if (action === "clear") {
          const prefix = pair(account, threadId);
          state.clears = [{ account, threadId, at: clock }, ...state.clears.filter(entry =>
            pair(entry.account, entry.threadId) !== prefix)].slice(0, MAX_ARCHIVED);
          state.records = state.records.filter(record => record.account !== account || record.threadId !== threadId);
          changed = true;
        }
        if (action === "append") {
          const existing = new Set(state.records.map(record => pair(pair(record.account, record.threadId), record.messageId)));
          for (const value of message.records) {
            const record = normalizeSaved({ ...value, account }, clock);
            if (!record || record.unsentAt < clock - CAPTURE_LAG) continue;
            const thread = pair(account, record.threadId);
            const key = pair(thread, record.messageId);
            if (existing.has(key) || record.unsentAt <= (cutoffMap.get(thread) || 0)) continue;
            existing.add(key);
            state.records.push(record);
            changed = true;
          }
        }
        if (changed) {
          boundState(state);
          if (state.records.length || state.clears.length) await invoke(api, local, "set", { [KEY]: state });
          else await invoke(api, local, "remove", KEY);
        }
        if (action === "read") {
          return { ok: true, records: state.records.filter(r => r.account === account && r.threadId === threadId),
            clears: state.clears.filter(c => c.account === account) };
        }
        return { ok: true };
      });
      queue = run.catch(() => {});
      return run;
    }
    return { handle };
  }

  function registerWriter(api) {
    const writer = makeWriter(api);
    const prune = () => { writer.handle({ action: "prune" }).catch(() => {}); };
    api.runtime.onStartup?.addListener(prune);
    api.runtime.onInstalled?.addListener(prune);
    api.runtime.onMessage.addListener((value, sender, reply) => {
      if (value?.type !== STORAGE_MESSAGE || sender?.id !== api.runtime.id ||
          !Number.isInteger(sender.tab?.id) || sender.frameId !== 0) return;
      try { if (new URL(sender.url).origin !== "https://www.instagram.com") return; } catch (_) { return; }
      if (value.action === "prune") return;
      writer.handle(value).then(reply, () => reply({ ok: false }));
      return true;
    });
  }

  function planGhosts(records, rows) {
    const known = new Set(rows.map(row => row.messageId));
    const timed = rows.filter(row => row.timestampMs > 0);
    if (!timed.length) return [];
    const ascending = timed[0].timestampMs <= timed.at(-1).timestampMs;
    const oldest = Math.min(...timed.map(row => row.timestampMs));
    const sorted = records.filter(record => record.timestampMs >= oldest && !known.has(record.messageId))
      .sort((a, b) => (ascending ? 1 : -1) * (a.timestampMs - b.timestampMs) ||
        a.unsentAt - b.unsentAt || a.messageId.localeCompare(b.messageId));
    const placements = [];
    let cursor = 0;
    for (const record of sorted) {
      while (cursor < timed.length && (ascending ? timed[cursor].timestampMs <= record.timestampMs :
        timed[cursor].timestampMs >= record.timestampMs)) cursor++;
      placements.push({ record, before: timed[cursor]?.element || null });
    }
    return placements;
  }

  function serialize(records, thread, format) {
    if (format === "json") {
      const messages = records.map(({ messageId, senderId, text, media, timestampMs, unsentAt }) => ({
        messageId, senderId, text, media, timestampMs, unsentAt
      }));
      return JSON.stringify({ threadId: thread, messages }, null, 2) + "\n";
    }
    return records.map(record => [
      new Date(record.unsentAt).toISOString(), record.text, ...record.media
    ].filter(Boolean).join("\n")).join("\n\n") + "\n";
  }

  const GHOST_CSS = `:host{display:block;overflow-anchor:none;padding:3px 8px 3px 44px}
    .bubble{display:inline-block;box-sizing:border-box;max-width:min(100%,400px);padding:6px 10px;
    border:1px solid var(--iy-hairline,#77847b);border-radius:13px;color:var(--iy-text,#eaf0e8);
    background:var(--iy-glass,#202622);font:13px/1.4 system-ui;overflow-wrap:anywhere;white-space:pre-wrap}
    small{display:block;font-size:11px;color:var(--iy-accent,#9dceab)}`;
  const LIST_CSS = `:host{position:fixed;inset:auto 16px 16px auto;z-index:2147483640}
    .trigger,dialog{border:1px solid var(--iy-hairline,#77847b);background:var(--iy-surface-raised,#252e27);
    color:var(--iy-text,#eaf0e8);border-radius:12px}
    .trigger{padding:0 10px} dialog{box-sizing:border-box;width:min(32rem,calc(100% - 24px));
    padding:16px;font:14px/1.4 system-ui}
    dialog::backdrop{background:#0008}
    header,footer,.confirm{display:flex;align-items:center;flex-wrap:wrap;gap:6px}
    header{justify-content:space-between;flex-wrap:nowrap} h2{margin:0;font-size:1.05rem}
    ol{list-style:none;margin:10px 0;padding:0;max-height:50vh;overflow:auto;overscroll-behavior:contain}
    li{border-top:1px solid var(--iy-hairline,#77847b);padding:8px 0;overflow-wrap:anywhere;white-space:pre-wrap}
    details{margin-block:4px} summary{cursor:pointer} code{display:block;font-size:11px}
    time{display:block;font-size:11px;color:var(--iy-accent,#9dceab)}
    .status{margin:8px 0} footer button,.confirm button{padding:0 8px}
    @media(max-width:480px){:host{inset:auto 8px 8px auto}}`;

  function makeHost(ui, doc, top, css, theme, includeBase = false) {
    const host = doc.createElement("div");
    const root = host.attachShadow({ mode: "closed" });
    const style = doc.createElement("style");
    style.textContent = includeBase ? ui.BASE_CSS + "\n" + css : css;
    root.append(style, top);
    for (const type of ["click", "dblclick", "pointerdown", "pointerup", "mousedown", "mouseup"]) {
      root.addEventListener(type, event => event.stopPropagation());
    }
    ui.addHost(host);
    const updateTheme = name => ui.applyThemeToHost(host, name || ui.getTheme(), undefined, top);
    updateTheme(theme);
    return { host, updateTheme, destroy: () => host.remove() };
  }

  function createController(options) {
    const { doc, win, api, core, shadow, send } = options;
    const now = options.now || Date.now;
    const getAccount = options.getAccount || (() => accountFromCookie(doc.cookie));
    const localCall = options.localCall || (value => invoke(api, api.runtime, "sendMessage", { type: STORAGE_MESSAGE, ...value }));
    let enabled = false;
    let uiReady = false;
    let account = null;
    let buffer;
    let eventName;
    let threadId = null;
    let theme;
    let clockTimer;
    let scanTimer;
    let requestId = 0;
    let request;
    let activeRead = 0;
    let lastClearAt = 0;
    let records = [];
    const ghosts = new Map();
    let rows = [];
    let verifiedList;
    let listFloor = Infinity;
    let lastRowIds = new Set();
    let listObserver;
    let view;
    let storageError = false;
    let loading = false;
    let running = false;
    const staged = new Map();
    const MAX_RETRIES = 3;
    let failures = 0;
    let retryTimer;
    let stopRoute;
    let stopObserve;
    let stopStorage;

    function t(key) {
      return api.i18n?.getMessage(key) || STRINGS[/^en\b/i.test(win.navigator.language) ? "en" : "tr"][key];
    }

    function matches(accountAtStart, threadAtStart = threadId) {
      return enabled && !!account && account === accountAtStart && account === getAccount() && threadId === threadAtStart &&
        threadId === threadFromPath(win.location.pathname);
    }

    function tellPage() {
      send({ type: "iy:dmarchive-config", account, found: account ? eventName : "" });
    }

    function dropGhosts() {
      for (const entry of ghosts.values()) entry.destroy();
      ghosts.clear();
    }

    function detachList() {
      listObserver?.disconnect();
      listObserver = null;
      verifiedList = null;
      listFloor = Infinity;
      lastRowIds.clear();
      rows = [];
      dropGhosts();
    }

    function resetThread() {
      activeRead++;
      lastClearAt = 0;
      clearTimeout(scanTimer);
      scanTimer = null;
      request = null;
      records = [];
      loading = false;
      storageError = false;
      detachList();
      if (view?.dialog.open) view.dialog.close();
      view?.host.destroy();
      view = null;
    }

    function syncIdentity() {
      if (!enabled) return false;
      const next = getAccount();
      const thread = next ? threadFromPath(win.location.pathname) : null;
      if (next === account && thread === threadId) return false;
      resetThread();
      if (next !== account) {
        account = next;
        buffer = next && createBuffer(next, now);
        staged.clear();
        failures = 0;
        clearTimeout(retryTimer);
        retryTimer = null;
        tellPage();
      }
      threadId = thread;
      if (thread) {
        refresh();
        showTrigger();
        queueScan();
      }
      return true;
    }

    function applyClears(values) {
      for (const c of Array.isArray(values) ? values.slice(0, MAX_ARCHIVED) : []) {
        if (c?.account !== account || !accountId(c.threadId) || !time(c.at) || c.at > now() + 1000) continue;
        buffer?.clear(c.threadId, c.at);
        if (c.threadId === threadId) lastClearAt = Math.max(lastClearAt, c.at);
        for (const [key, entry] of staged) {
          if (entry.threadId === c.threadId && entry.unsentAt <= c.at) staged.delete(key);
        }
      }
    }

    async function refresh() {
      if (!account || !threadId) return;
      const owner = account;
      const thread = threadId;
      const id = ++activeRead;
      loading = true;
      try {
        const reply = await localCall({ action: "read", account: owner, threadId: thread });
        if (id !== activeRead || !matches(owner, thread)) return;
        if (!reply?.ok) throw new Error("Archive read failed");
        applyClears(reply.clears);
        const clock = now();
        records = (Array.isArray(reply.records) ? reply.records.slice(0, MAX_PER_THREAD) : [])
          .map(record => normalizeSaved(record, clock)).filter(record => record?.account === owner &&
            record.threadId === thread && record.unsentAt > lastClearAt);
        storageError = false;
      } catch (_) {
        if (id === activeRead && matches(owner, thread)) storageError = true;
      } finally {
        if (id === activeRead && matches(owner, thread)) {
          loading = false;
          renderList();
          renderGhosts();
          queueScan();
        }
      }
    }

    async function flush() {
      if (running || !account || !staged.size || !enabled) return;
      running = true;
      const owner = account;
      const batch = [...staged.entries()].slice(0, protocol.MAX_EVENTS);
      const sourceBuffer = buffer;
      try {
        const reply = await localCall({ action: "append", account: owner, records: batch.map(([, value]) => value) });
        if (!reply?.ok) throw new Error("Archive write failed");
        if (buffer === sourceBuffer) {
          for (const [key, value] of batch) if (staged.get(key) === value) staged.delete(key);
          failures = 0;
          if (batch.some(([, value]) => value.threadId === threadId)) refresh();
        }
      } catch (_) {
        if (buffer === sourceBuffer && ++failures <= MAX_RETRIES) {
          retryTimer = setTimeout(() => { retryTimer = null; flush(); }, 1000 * failures);
        } else if (buffer === sourceBuffer) {
          staged.clear();
          failures = 0;
          storageError = true;
          renderList();
        }
      } finally {
        running = false;
        if (!retryTimer && staged.size && enabled) flush();
      }
    }

    function accept(value) {
      if (!enabled || !value) return;
      syncIdentity();
      if (!account || value.account !== account) return;
      if (value.type === "iy:dmarchive-rows") {
        receiveRows(value);
        return;
      }
      if (value.type !== "iy:dmarchive-events") return;
      const fresh = buffer.ingest(value.records, value.source, value.observedAt);
      for (const record of fresh) {
        staged.set(pair(record.threadId, record.messageId), record);
        if (staged.size > MAX_PENDING) staged.delete(staged.keys().next().value);
      }
      if (!retryTimer) flush();
    }

    function handleFound(event) {
      if (!request || !matches(account, request.thread) || typeof event.detail !== "string") return;
      const match = /^(\d{1,16}):(\d{1,3})$/.exec(event.detail);
      const index = match ? +match[2] : -1;
      if (!match || +match[1] !== request.id || index >= protocol.MAX_ROWS || event.target?.nodeType !== 1) return;
      request.elements[index] = event.target;
      event.stopImmediatePropagation();
    }

    function receiveRows(value) {
      if (!request || request.id !== value.requestId || request.thread !== value.threadId ||
          !matches(account, value.threadId)) return;
      const elements = request.elements;
      request = null;
      if (!Array.isArray(value.rows) || value.rows.length > protocol.MAX_ROWS) return;
      const next = [];
      let parent;
      for (let i = 0; i < value.rows.length; i++) {
        const el = elements[i];
        const row = value.rows[i];
        if (!el?.isConnected || !el.parentElement || !messageId(row?.messageId)) continue;
        parent ||= el.parentElement;
        if (el.parentElement !== parent) continue;
        next.push({ element: el, messageId: row.messageId, timestampMs: time(row.timestampMs) });
      }
      if (parent && parent !== verifiedList) {
        detachList();
        verifiedList = parent;
        if (win.MutationObserver) {
          listObserver = new win.MutationObserver(queueScan);
          listObserver.observe(parent, { subtree: true, childList: true, characterData: true,
            attributes: true, attributeFilter: ["data-igd-message-actions-hidden"] });
        }
      }
      rows = next;
      if (next.length) {
        const timestamps = next.map(row => row.timestampMs).filter(Boolean);
        listFloor = Math.min(...timestamps);
        lastRowIds = new Set(next.map(row => row.messageId));
      }
      if (!parent && (!verifiedList?.isConnected || verifiedList.querySelector("[data-igd-message-actions-hidden]"))) detachList();
      renderGhosts();
    }

    function queueScan() {
      if (!uiReady || !enabled || !threadId || scanTimer) return;
      scanTimer = setTimeout(() => {
        scanTimer = null;
        if (!matches(account)) return;
        const id = ++requestId;
        request = { id, thread: threadId, elements: [] };
        send({ type: "iy:dmarchive-scan", threadId, requestId: id });
      }, 180);
    }

    function renderGhosts() {
      if (!uiReady || !matches(account) || !verifiedList?.isConnected) return;
      if (!records.length) { dropGhosts(); return; }
      const ui = shadow();
      if (!ui) return;
      const current = rows.filter(row => row.element.parentElement === verifiedList);
      const unexpired = liveRecords();
      const wanted = new Set();
      const placements = current.length ? planGhosts(unexpired, current) :
        unexpired.filter(record => record.timestampMs >= listFloor || lastRowIds.has(record.messageId))
          .sort((a, b) => a.timestampMs - b.timestampMs).map(record => ({ record, before: null }));
      for (const { record, before } of placements) {
        wanted.add(record.messageId);
        let ghost = ghosts.get(record.messageId);
        if (!ghost) {
          const bubble = ui.h("div", { class: "bubble", text: record.text || t("dmArchiveMedia") });
          bubble.append(ui.h("small", { text: t("dmArchiveMark") }));
          ghost = makeHost(ui, doc, bubble, GHOST_CSS, theme);
          ghosts.set(record.messageId, ghost);
        }
      }
      for (const [id, ghost] of ghosts) {
        if (!wanted.has(id)) { ghost.destroy(); ghosts.delete(id); }
      }
      // Work backwards so already correctly placed adjacent ghosts stay in place.
      let next = null;
      let rightAnchor;
      for (let i = placements.length - 1; i >= 0; i--) {
        const { record, before } = placements[i];
        if (before !== rightAnchor) next = before;
        const host = ghosts.get(record.messageId).host;
        if (host.parentElement !== verifiedList || host.nextSibling !== next) verifiedList.insertBefore(host, next);
        next = host;
        rightAnchor = before;
      }
    }

    function liveRecords() {
      const cutoff = Math.max(lastClearAt, now() - RETENTION);
      return records.filter(record => record.unsentAt > cutoff);
    }

    function saveFile(format) {
      if (!view?.dialog.open || !matches(account)) return;
      const items = liveRecords();
      if (!items.length) return;
      const content = serialize(items, threadId, format);
      const type = format === "json" ? "application/json" : "text/plain";
      try {
        const url = win.URL.createObjectURL(new win.Blob([content], { type: type + ";charset=utf-8" }));
        try {
          const a = doc.createElement("a");
          a.href = url;
          a.download = "InstHush-unsent-" + threadId + "." + format;
          a.hidden = true;
          view.dialog.append(a);
          try { a.click(); } finally { a.remove(); }
        } finally { setTimeout(() => win.URL.revokeObjectURL(url), 30000); }
      } catch (_) { storageError = true; renderList(); }
    }

    async function clearThread(activeView) {
      const owner = account;
      const thread = threadId;
      if (!matches(owner, thread) || activeView.busy) return;
      activeView.busy = true;
      renderList();
      try {
        const reply = await localCall({ action: "clear", account: owner, threadId: thread });
        if (!reply?.ok) throw new Error("Archive clear failed");
        if (view !== activeView || !matches(owner, thread)) return;
        activeView.confirm.hidden = true;
        await refresh();
      } catch (_) {
        if (view === activeView && matches(owner, thread)) storageError = true;
      } finally {
        activeView.busy = false;
        if (view === activeView && matches(owner, thread)) renderList();
      }
    }

    function showTrigger() {
      const ui = uiReady && shadow();
      if (!ui || !threadId || view) return;
      const button = (key, activate) => ui.h("button", { type: "button", class: "iy-btn chip", text: t(key),
        onclick: event => { if (event.isTrusted && matches(account)) activate(); } });
      const title = ui.h("h2", { id: "iy-dm-archive-title", text: t("dmArchiveTitle") });
      const dialog = ui.h("dialog", { "aria-labelledby": title.id });
      const status = ui.h("p", { class: "status", role: "status" });
      const list = ui.h("ol");
      const close = button("dmArchiveClose", () => dialog.close());
      const json = button("dmArchiveJson", () => saveFile("json"));
      const txt = button("dmArchiveTxt", () => saveFile("txt"));
      const clear = button("dmArchiveClear", () => {
        confirm.hidden = false;
        cancel.focus();
      });
      const cancel = button("dmArchiveCancel", () => { confirm.hidden = true; clear.focus(); });
      const remove = button("dmArchiveClear", () => clearThread(view));
      const confirm = ui.h("div", { class: "confirm", hidden: true },
        ui.h("span", { text: t("dmArchiveConfirm") }), cancel, remove);
      const trigger = button("dmArchiveTitle", () => {
        if (!dialog.open) dialog.showModal();
        close.focus();
        renderList();
        refresh();
      });
      trigger.classList.add("trigger");
      trigger.setAttribute("aria-haspopup", "dialog");
      dialog.append(ui.h("header", null, title, close), status, list, ui.h("footer", null, json, txt, clear), confirm);
      dialog.addEventListener("close", () => { confirm.hidden = true; });
      dialog.addEventListener("keydown", event => event.stopPropagation());
      const host = makeHost(ui, doc, ui.h("div", null, trigger, dialog), LIST_CSS, theme, true);
      doc.documentElement.append(host.host);
      view = { host, dialog, list, status, json, txt, clear, remove, confirm, busy: false, displayed: [] };
    }

    function renderList() {
      if (!view?.dialog.open || !matches(account)) return;
      const ui = shadow();
      const items = liveRecords();
      view.status.textContent = storageError ? t("dmArchiveError") :
        loading && !items.length ? t("dmArchiveLoading") : items.length ? "" : t("dmArchiveEmpty");
      view.status.hidden = !view.status.textContent;
      if (items.length !== view.displayed.length || items.some((record, i) =>
        record.messageId !== view.displayed[i].messageId || record.unsentAt !== view.displayed[i].unsentAt)) {
        view.list.replaceChildren(...items.map(record => ui.h("li", null,
          ui.h("time", { datetime: new Date(record.unsentAt).toISOString(),
            text: new Date(record.unsentAt).toLocaleString(win.navigator.language) }),
          record.text ? ui.h("span", { text: record.text }) : null,
          record.media.length ? ui.h("details", null, ui.h("summary", { text: t("dmArchiveMedia") }),
            ...record.media.map(url => ui.h("code", { text: url }))) : null)));
        view.displayed = items;
      }
      view.list.hidden = !items.length;
      view.json.disabled = view.txt.disabled = !items.length || view.busy;
      view.clear.disabled = view.remove.disabled = !items.length || view.busy;
    }

    function mountUi() {
      if (!shadow() || !core.route || !core.observe) return;
      uiReady = true;
      if (!enabled || stopRoute) return;
      stopRoute = core.route(syncIdentity);
      stopObserve = core.observe("[data-igd-message-actions-hidden]", queueScan);
      syncIdentity();
      showTrigger();
      queueScan();
    }

    function onWake() {
      if (!syncIdentity() && threadId) {
        showTrigger();
        refresh();
      }
    }

    function start(settings) {
      if (enabled || settings?.ui?.keepUnsent !== true) return;
      enabled = true;
      theme = settings.ui.theme;
      eventName = "iy-dm-" + win.crypto.randomUUID();
      doc.addEventListener(eventName, handleFound, true);
      win.addEventListener("focus", onWake);
      win.addEventListener("pageshow", onWake);
      doc.addEventListener("visibilitychange", onWake);
      stopStorage = core.onStorage((changes, area) => {
        if (area !== "local" || !changes[KEY]) return;
        syncIdentity();
        applyClears(changes[KEY].newValue?.clears);
        if (threadId) {
          renderList();
          renderGhosts();
          refresh();
        }
      });
      clockTimer = setInterval(onWake, 60000);
      syncIdentity();
      if (uiReady) mountUi();
    }

    function update(settings) {
      if (theme === settings.ui?.theme) return;
      theme = settings.ui?.theme;
      view?.host.updateTheme(theme);
      for (const ghost of ghosts.values()) ghost.updateTheme(theme);
    }

    function stop() {
      if (!enabled) return;
      enabled = false;
      account = null;
      tellPage();
      threadId = null;
      buffer = null;
      staged.clear();
      failures = 0;
      clearTimeout(retryTimer);
      retryTimer = null;
      clearInterval(clockTimer);
      doc.removeEventListener(eventName, handleFound, true);
      win.removeEventListener("focus", onWake);
      win.removeEventListener("pageshow", onWake);
      doc.removeEventListener("visibilitychange", onWake);
      stopStorage?.();
      stopRoute?.();
      stopObserve?.();
      stopStorage = stopRoute = stopObserve = null;
      resetThread();
    }

    function reconnect() {
      tellPage();
      queueScan();
    }

    return { start, stop, update, mountUi, accept, reconnect };
  }

  const api = { KEY, MAX_PER_THREAD, MAX_ARCHIVED, MAX_BYTES, RETENTION, STRINGS, makeWriter,
    registerWriter, createBuffer, planGhosts, serialize, createController };
  if (node) module.exports = api;
  else {
    iy.dmArchive = api;
    if (iy.core && typeof document !== "undefined") {
      const controller = createController({ doc: document, win: window, api: chrome, core: iy.core,
        shadow: () => iy.shadow, send: value => iy.sendDmArchive?.(value) });
      Object.assign(api, { mountUi: controller.mountUi, accept: controller.accept, reconnect: controller.reconnect });
      iy.core.feature("keepUnsent", { enabled: settings => settings.ui?.keepUnsent === true,
        start: controller.start, stop: controller.stop, update: controller.update });
      if (iy.shadow) controller.mountUi();
    }
  }
})();
