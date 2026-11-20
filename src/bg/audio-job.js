// Adapted from Glassgram's src/background/index.ts, GPL-3.0-only.
(() => {
  "use strict";
  const PAGE = "src/offscreen/audio.html";
  const PERMISSION_PAGE = "src/offscreen/mp3-permission.html";
  const PERMISSION_TIMEOUT_MS = 120000;
  const MAX_SOURCES = 4;
  const ERRORS = new Set([
    "busy", "disabled", "permission", "source", "fetch", "size",
    "decode", "silent", "encoder", "download", "unavailable", "invalid-filename"
  ]);

  function filename(lib, template, meta = {}) {
    const text = value => {
      if (typeof value === "string") return value.slice(0, 200);
      if (typeof value === "number" && Number.isFinite(value)) return String(value);
      return "";
    };
    template = text(template) || lib.DEFAULT_TEMPLATE;
    const index = Number.isSafeInteger(meta.index) && meta.index >= 0 ? meta.index : 0;
    const data = {
      user: text(meta.user) || "unknown", shortcode: text(meta.shortcode) || text(meta.id),
      id: text(meta.id), index: index + (template === lib.LEGACY_TEMPLATE ? 0 : 1),
      isCarousel: meta.isCarousel === true, type: "audio", ext: "mp3",
      takenAt: Number.isFinite(meta.takenAt) && meta.takenAt > 0 ? meta.takenAt : undefined
    };
    const path = lib.renderFilename(template, data);
    return /\.mp3$/i.test(path) ? path : lib.renderFilename(template + ".{ext}", data);
  }

  function install(api, iy) {
    const { runtime, downloads, offscreen } = api;
    const origins = { origins: iy.MP3_ORIGINS };
    const pageUrl = runtime.getURL(PAGE);
    const permPageUrl = runtime.getURL(PERMISSION_PAGE);
    const blobPrefix = "blob:" + runtime.getURL("");
    const pending = new Map();
    let local, restored = false, current, permWait = null;
    let tail = Promise.resolve();
    function serialize(fn) {
      const result = tail.then(fn);
      tail = result.catch(() => {});
      return result;
    }
    function forwardProgress(tabId, progress) {
      if (!Number.isInteger(tabId) || !api.tabs || typeof api.tabs.sendMessage !== "function") return;
      try {
        const res = api.tabs.sendMessage(tabId, {
          type: "iy:save-sound-progress",
          stage: progress?.stage,
          percent: Number.isFinite(progress?.percent) ? progress.percent : undefined
        });
        if (res && typeof res.catch === "function") res.catch(() => {});
      } catch (_) {}
    }
    async function hasPermission() {
      try { return (await api.permissions?.contains?.(origins)) === true; }
      catch (_) { return false; }
    }
    function closeAsk(ask) {
      if (!ask) return;
      try {
        if (Number.isInteger(ask.windowId) && api.windows?.remove) {
          Promise.resolve(api.windows.remove(ask.windowId)).catch(() => {});
        } else if (Number.isInteger(ask.tabId) && api.tabs?.remove) {
          Promise.resolve(api.tabs.remove(ask.tabId)).catch(() => {});
        }
      } catch (_) {}
    }
    function focusAsk(ask) {
      if (!ask) return;
      try {
        if (Number.isInteger(ask.windowId) && api.windows?.update) {
          Promise.resolve(api.windows.update(ask.windowId, { focused: true })).catch(() => {});
        } else if (Number.isInteger(ask.tabId) && api.tabs?.update) {
          Promise.resolve(api.tabs.update(ask.tabId, { active: true })).catch(() => {});
        }
      } catch (_) {}
    }
    async function requestPermissionViaPage(job) {
      if (!api.permissions || typeof api.permissions.contains !== "function") return false;
      const canWin = typeof api.windows?.create === "function";
      const canTab = typeof api.tabs?.create === "function";
      if (!canWin && !canTab) return false;
      forwardProgress(job.tabId, { stage: "permission" });
      return new Promise(async resolve => {
        let done = false;
        let timer = null;
        const ask = { windowId: null, tabId: null, settle: null };
        // A window can close right after the grant, before the grant message arrives.
        const closedByUser = () => { hasPermission().then(settle); };
        const onWindowRemoved = id => {
          if (ask.windowId !== null && id === ask.windowId) closedByUser();
        };
        const onTabRemoved = id => {
          if (ask.tabId !== null && id === ask.tabId) closedByUser();
        };
        const onPermAdded = () => {
          hasPermission().then(ok => { if (ok) settle(true); });
        };
        function cleanup() {
          if (timer !== null) { clearTimeout(timer); timer = null; }
          try { api.windows?.onRemoved?.removeListener?.(onWindowRemoved); } catch (_) {}
          try { api.tabs?.onRemoved?.removeListener?.(onTabRemoved); } catch (_) {}
          try { api.permissions?.onAdded?.removeListener?.(onPermAdded); } catch (_) {}
          if (permWait === ask) permWait = null;
        }
        function settle(granted, shouldClose = false) {
          if (done) return;
          done = true;
          cleanup();
          if (shouldClose) closeAsk(ask);
          resolve(granted === true);
        }
        ask.settle = settle;
        permWait = ask;
        try { api.windows?.onRemoved?.addListener?.(onWindowRemoved); } catch (_) {}
        try { api.tabs?.onRemoved?.addListener?.(onTabRemoved); } catch (_) {}
        try { api.permissions?.onAdded?.addListener?.(onPermAdded); } catch (_) {}
        timer = setTimeout(() => settle(false, true), PERMISSION_TIMEOUT_MS);
        try {
          if (canWin) {
            const win = await api.windows.create({
              url: permPageUrl, type: "popup", width: 440, height: 320, focused: true
            });
            if (done) { closeAsk({ windowId: win?.id }); return; }
            if (Number.isInteger(win?.id)) ask.windowId = win.id;
            else if (Number.isInteger(win?.tabs?.[0]?.id)) ask.tabId = win.tabs[0].id;
            else { settle(false); return; }
          } else {
            const tab = await api.tabs.create({ url: permPageUrl, active: true });
            if (done) { closeAsk({ tabId: tab?.id }); return; }
            if (Number.isInteger(tab?.id)) ask.tabId = tab.id;
            else { settle(false); return; }
          }
        } catch (_) {
          if (canWin && canTab && !done) {
            try {
              const tab = await api.tabs.create({ url: permPageUrl, active: true });
              if (done) { closeAsk({ tabId: tab?.id }); return; }
              if (Number.isInteger(tab?.id)) { ask.tabId = tab.id; return; }
            } catch (_) {}
          }
          settle(false);
        }
      });
    }

    async function message(op, fields) {
      const result = await runtime.sendMessage({ type: "iy:audio-host", op, ...fields });
      if (!result?.ok) throw new Error(result?.error || "unavailable");
      return result;
    }
    async function documentState() {
      if (runtime.getContexts) {
        const docs = await runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
        if (docs.some(doc => doc.documentUrl === pageUrl)) return "audio";
        return docs.length ? "other" : "none";
      }
      // Chromium 109–115 predates runtime.getContexts.
      const windows = await globalThis.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (windows.some(client => client.url === pageUrl)) return "audio";
      return await offscreen.hasDocument?.() ? "other" : "none";
    }
    async function closeIfIdle() {
      if (offscreen && !pending.size && await documentState() === "audio") await offscreen.closeDocument();
    }
    async function release(url) {
      if (offscreen) await message("release", { url });
      else local.release(url);
    }
    // A worker can be replaced while its offscreen page still owns a download.
    // Recover from the live page and the download manager without storing media URLs.
    async function restore() {
      if (restored || !offscreen) return;
      pending.clear();
      if (await documentState() === "audio") {
        const { urls } = await message("recover");
        for (const url of urls) {
          const [item] = await downloads.search({ url, state: "in_progress" });
          if (item) pending.set(item.id, url);
          else await release(url);
        }
        await closeIfIdle();
      }
      restored = true;
    }
    async function open() {
      if (!offscreen) {
        local ||= iy.audio.createHost();
      } else {
        // Chromium permits one document per profile. A different feature may own it.
        const state = await documentState();
        if (state === "audio") return;
        if (state === "other") throw new Error("busy");
        await offscreen.createDocument({
          url: PAGE, reasons: ["BLOBS"], justification: "Convert the selected video's sound to an MP3 download."
        });
      }
    }
    async function finish(id) {
      const url = pending.get(id);
      if (url) {
        await release(url);
        pending.delete(id);
        await closeIfIdle();
      }
    }

    async function run(msg, job) {
      const check = () => { if (job.cancelled) throw new Error("disabled"); };
      const rawSources = [
        ...(Array.isArray(msg.audioUrls) ? msg.audioUrls : []),
        msg.audioUrl,
        msg.videoUrl
      ];
      const sources = [...new Set(rawSources.filter(url => iy.isAllowedCdn(url)))].slice(0, MAX_SOURCES);
      if (!sources.length) throw new Error("source");
      const { ui } = await api.storage.local.get("ui");
      if (ui?.audioMp3 !== true) throw new Error("disabled");
      check();
      let granted = await hasPermission();
      if (!granted && msg.askPermission !== false) {
        const asked = await requestPermissionViaPage(job);
        check();
        if (asked) granted = await hasPermission();
      }
      if (!granted) throw new Error("permission");
      check();
      const path = filename(iy.filename, ui.filenameTemplate, msg.meta);
      if (!iy.isSafeDownloadPath(path)) throw new Error("invalid-filename");
      await restore();
      let url;
      try {
        await open();
        check();
        job.building = true;
        const onProgress = progress => forwardProgress(job.tabId, progress);
        url = offscreen ? (await message("build", { sources, duration: msg.duration })).url :
          await local.build(sources, msg.duration, onProgress);
        job.building = false;
        check();
        if (typeof url !== "string" || !url.startsWith(blobPrefix)) throw new Error("source");
        const id = await downloads.download({ url, filename: path, conflictAction: "uniquify", saveAs: false });
        if (!Number.isInteger(id)) throw new Error("download");
        pending.set(id, url);
        url = null; // The terminal download event now owns cleanup.
        if (job.cancelled) {
          await downloads.cancel(id);
          check();
        }
        return { ok: true, id };
      } finally {
        job.building = false;
        await job.cancelling;
        try { if (url) await release(url); }
        finally { await closeIfIdle(); }
      }
    }

    api.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.ui || changes.ui.newValue?.audioMp3 === true) return;
      if (changes.ui.oldValue?.audioMp3 === true) {
        Promise.resolve().then(() => api.permissions?.remove(origins)).catch(() => {});
      }
      if (permWait) permWait.settle(false, true);
      if (!current) return;
      current.cancelled = true;
      if (current.building) {
        if (offscreen) current.cancelling = message("cancel").catch(() => {});
        else local.cancel();
      }
    });
    function terminal(id) {
      serialize(async () => { await restore(); await finish(id); }).catch(() => { restored = false; });
    }
    downloads.onChanged.addListener(delta => {
      if (["complete", "interrupted"].includes(delta.state?.current)) terminal(delta.id);
    });
    downloads.onErased?.addListener(terminal);
    runtime.onMessage.addListener((msg, sender, reply) => {
      if (msg?.type === "iy:audio-active") {
        if (sender?.id === runtime.id && !sender.tab) reply({ ok: true });
        return false;
      }
      if (msg?.type === "iy:audio-progress") {
        if (sender?.id === runtime.id && !sender.tab && sender.url === pageUrl && current) {
          forwardProgress(current.tabId, msg);
        }
        return false;
      }
      // The permission page pings while it waits so Chromium does not stop this worker
      // (and drop the pending conversion) during the browser's own permission dialog.
      if (msg?.type === "iy:mp3-permission-ping") {
        reply({ ok: sender?.id === runtime.id && sender.url === permPageUrl });
        return false;
      }
      if (msg?.type === "iy:mp3-permission-done") {
        if (sender?.id === runtime.id && sender.url === permPageUrl && permWait) {
          permWait.settle(msg.granted === true, true);
        }
        reply({ ok: true });
        return false;
      }
      if (msg?.type !== "iy:save-sound") return false;
      if (!sender || sender.id !== runtime.id || sender.frameId !== 0 || !Number.isInteger(sender.tab?.id) ||
          !sender.url?.startsWith("https://www.instagram.com/")) {
        reply({ ok: false, error: "source" });
        return false;
      }
      if (current) {
        if (permWait) focusAsk(permWait);
        reply({ ok: false, error: "busy" });
        return false;
      }
      const job = current = { cancelled: false, building: false, tabId: sender.tab.id };
      serialize(() => run(msg, job)).catch(error => ({
        ok: false, error: job.cancelled ? "disabled" : ERRORS.has(error.message) ? error.message : "failed"
      })).then(result => { current = null; reply(result); });
      return true;
    });
    if (offscreen) serialize(restore).catch(() => { restored = false; });
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { install, filename };
  else install(globalThis.browser || globalThis.chrome, globalThis.IY);
})();
