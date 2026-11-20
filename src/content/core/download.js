// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
// DownloadJob engine: single item, carousel, or story tray as separate files or store-only ZIP
// (via src/lib/zip.js), rendered with src/lib/filename.js templates, with progress & cancel.
(function () {
  "use strict";

  const isNode = typeof module !== "undefined" && module.exports;
  const mediaLib = isNode ? require("../../lib/media.js") : (globalThis.IY || {});
  const filenameLib = isNode ? require("../../lib/filename.js") : (globalThis.IY && globalThis.IY.filename) || {};
  const zipLib = isNode ? require("../../lib/zip.js") : (globalThis.IY && globalThis.IY.zip) || {};

  const MESSAGE_DOWNLOAD = "iy:download";
  const MESSAGE_DOWNLOAD_ZIP = "iy:download-zip";
  const DEFAULT_PART_BYTES = 512 * 1024 * 1024;
  const DEFAULT_CONCURRENCY = 4;
  const DEFAULT_REVOKE_DELAY_MS = 60 * 1000;

  const MAX_ENTRY_BYTES = 128 * 1024 * 1024;

  async function readZipEntry(res, allowCdn) {
    if (res.redirected || !mediaLib.isAllowedCdn(res.url) || !allowCdn?.(res.url) || /^\s*text\/(?:html|plain)\s*(?:;|$)/i.test(res.headers.get("content-type")) ||
        Number(res.headers.get("content-length")) > MAX_ENTRY_BYTES) {
      await res.body?.cancel();
      throw new Error("invalid-media-response");
    }
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_ENTRY_BYTES) {
          await reader.cancel();
          throw new Error("entry-too-large");
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  }

  let jobSeq = 0;

  // Content scripts cannot call runtime.getBrowserInfo; the extension URL scheme tells the browsers apart.
  function firefoxExtension() {
    try {
      const runtime = globalThis.chrome && globalThis.chrome.runtime;
      return !!runtime && typeof runtime.getURL === "function" && String(runtime.getURL("")).indexOf("moz-extension:") === 0;
    } catch (_) { return false; }
  }

  function defaultSendMessage(msg) {
    return new Promise((resolve) => {
      try {
        const runtime = globalThis.chrome && globalThis.chrome.runtime;
        if (!runtime || typeof runtime.sendMessage !== "function") {
          resolve({ ok: false, error: "runtime-unavailable" });
          return;
        }
        let settled = false;
        const done = (reply) => {
          if (settled) return;
          settled = true;
          const err = runtime.lastError;
          if (err) resolve({ ok: false, error: err.message || "send-failed" });
          else resolve(reply && typeof reply === "object" ? reply : { ok: false, error: "empty-reply" });
        };
        const maybePromise = runtime.sendMessage(msg, done);
        if (maybePromise && typeof maybePromise.then === "function") {
          maybePromise.then(done, (err) => done({ ok: false, error: (err && err.message) || "send-failed" }));
        }
      } catch (err) {
        resolve({ ok: false, error: (err && err.message) || "send-failed" });
      }
    });
  }

  function basename(path) {
    if (typeof path !== "string") return "file";
    const slash = path.lastIndexOf("/");
    return slash >= 0 ? path.slice(slash + 1) || "file" : path || "file";
  }

  function dirname(path) {
    if (typeof path !== "string") return "";
    const slash = path.lastIndexOf("/");
    return slash >= 0 ? path.slice(0, slash) : "";
  }

  function entryFilename(post, item, itemIndex, options = {}) {
    const template = options.template !== undefined ? options.template : filenameLib.DEFAULT_TEMPLATE;
    const dateFormat = options.dateFormat || "YYYY-MM-DD";
    const isLegacy = template === filenameLib.LEGACY_TEMPLATE;
    const isCarousel = options.isCarousel !== undefined
      ? Boolean(options.isCarousel)
      : Boolean(post && (post.isCarousel || (Array.isArray(post.items) && post.items.length > 1)));
    const idx = Number.isInteger(itemIndex) && itemIndex >= 0 ? itemIndex : 0;
    const audioOnly = Boolean(options.audioOnly);

    return filenameLib.renderFilename(template, {
      user: (post && post.username) || "unknown",
      shortcode: (post && (post.shortcode || post.id)) || "",
      index: isLegacy ? idx : idx + 1,
      type: audioOnly ? "audio" : ((item && item.type) || "image"),
      id: (item && item.id) || (post && post.id) || "",
      ext: audioOnly ? ((item && item.audioExt) || "m4a") : ((item && item.ext) || "jpg"),
      takenAt: post && Number.isFinite(post.takenAt) && post.takenAt > 0 ? post.takenAt : undefined,
      isCarousel
    }, { dateFormat });
  }

  function buildEntriesForPost(post, options = {}) {
    if (!post || !Array.isArray(post.items) || !post.items.length) return [];
    const allowCdn = typeof options.isAllowedCdn === "function" ? options.isAllowedCdn : mediaLib.isAllowedCdn;
    const audioOnly = Boolean(options.audioOnly);

    let indices;
    if (Array.isArray(options.indices)) {
      indices = options.indices;
    } else if (Number.isInteger(options.index)) {
      indices = [options.index];
    } else {
      indices = post.items.map((_, i) => i);
    }

    const entries = [];
    for (let k = 0; k < indices.length; k++) {
      const i = indices[k];
      const item = post.items[i];
      if (!item || typeof item !== "object") continue;
      const url = audioOnly ? item.audioUrl : item.url;
      if (!url || (typeof allowCdn === "function" && !allowCdn(url))) continue;
      entries.push({
        url,
        filename: entryFilename(post, item, i, { ...options, audioOnly }),
        date: post.takenAt > 0 ? new Date(post.takenAt * 1000) : undefined,
        id: item.id || post.id || "",
        type: audioOnly ? "audio" : (item.type || "image"),
        index: i
      });
    }
    return entries;
  }

  function buildEntriesForTray(tray, options = {}) {
    if (!Array.isArray(tray) || !tray.length) return [];
    const allowCdn = typeof options.isAllowedCdn === "function" ? options.isAllowedCdn : mediaLib.isAllowedCdn;
    const entries = [];
    for (let i = 0; i < tray.length; i++) {
      const post = tray[i];
      const item = post && Array.isArray(post.items) ? post.items[0] : null;
      if (!item || !item.url) continue;
      if (typeof allowCdn === "function" && !allowCdn(item.url)) continue;
      entries.push({
        url: item.url,
        filename: entryFilename(post, item, i, { ...options, isCarousel: tray.length > 1 }),
        date: post.takenAt > 0 ? new Date(post.takenAt * 1000) : undefined,
        id: item.id || post.id || "",
        type: item.type || "image",
        index: i
      });
    }
    return entries;
  }

  function buildZipFilename(entries, baseName, partIndex = 0, partCount = 1) {
    const first = Array.isArray(entries) && entries[0] ? entries[0].filename : "";
    const dir = dirname(first);
    const stem = (typeof baseName === "string" && baseName.trim() ? baseName.trim() : "download").replace(/\.zip$/i, "");
    const suffix = partCount > 1 ? `_part${partIndex + 1}` : "";
    const template = dir ? `${dir}/{shortcode}.{ext}` : "{shortcode}.{ext}";
    return filenameLib.renderFilename(template, { shortcode: stem + suffix, ext: "zip" });
  }

  function profilePicFilename(username, userId, ext = "jpg", options = {}) {
    const template = options.template !== undefined ? options.template : filenameLib.DEFAULT_TEMPLATE;
    const dateFormat = options.dateFormat || "YYYY-MM-DD";
    const isLegacy = template === filenameLib.LEGACY_TEMPLATE;
    return filenameLib.renderFilename(template, {
      user: username || "unknown",
      shortcode: "profile_picture",
      index: isLegacy ? 0 : 1,
      id: userId || "",
      takenAt: Math.floor(Date.now() / 1000),
      type: "image",
      ext,
      isCarousel: false
    }, { dateFormat });
  }

  class DownloadJob {
    constructor(entries, options = {}) {
      this.id = `dl_${++jobSeq}_${Date.now()}`;
      this._entries = Array.isArray(entries) ? entries.slice() : [];
      this._options = options && typeof options === "object" ? options : {};
      this._mode = this._options.mode === "zip" ? "zip" : "separate";
      this._forceZip = Boolean(this._options.forceZip);
      this._zipName = typeof this._options.zipName === "string" && this._options.zipName.trim()
        ? this._options.zipName.trim()
        : "download";
      this._partBytes = Number.isFinite(this._options.partBytes) && this._options.partBytes >= 1
        ? Math.floor(this._options.partBytes)
        : DEFAULT_PART_BYTES;
      this._concurrency = Number.isInteger(this._options.concurrency)
        ? Math.min(8, Math.max(1, this._options.concurrency))
        : DEFAULT_CONCURRENCY;
      this._revokeDelayMs = Number.isFinite(this._options.revokeDelayMs) && this._options.revokeDelayMs >= 0
        ? this._options.revokeDelayMs
        : DEFAULT_REVOKE_DELAY_MS;
      this._onProgress = typeof this._options.onProgress === "function" ? this._options.onProgress : null;
      this._sendMessage = typeof this._options.sendMessage === "function" ? this._options.sendMessage : defaultSendMessage;
      // Bound on purpose: this._fetch(...) would otherwise call the native fetch with the job as
      // "this" and the browser throws "Illegal invocation" on every ZIP read.
      this._fetch = this._options.fetch !== undefined
        ? this._options.fetch
        : (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : undefined);
      this._isAllowedCdn = typeof this._options.isAllowedCdn === "function" ? this._options.isAllowedCdn : mediaLib.isAllowedCdn;
      this._createZip = typeof this._options.createZip === "function" ? this._options.createZip : zipLib.createZip;
      this._createObjectURL = typeof this._options.createObjectURL === "function"
        ? this._options.createObjectURL
        : (typeof URL !== "undefined" && typeof URL.createObjectURL === "function" ? (b) => URL.createObjectURL(b) : null);
      this._revokeObjectURL = typeof this._options.revokeObjectURL === "function"
        ? this._options.revokeObjectURL
        : (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function" ? (u) => URL.revokeObjectURL(u) : null);

      this.status = "pending";
      this._cancelled = false;
      this._abort = null;
      this._promise = null;
      this._objectUrls = new Set();
      this._revokeTimers = new Set();
      this._progress = {
        jobId: this.id,
        status: "pending",
        mode: this._mode,
        completed: 0,
        total: this._entries.length,
        failed: 0,
        skipped: 0,
        bytesLoaded: 0,
        currentFilename: "",
        partIndex: 0,
        partCount: 0
      };
    }

    get isCancelled() {
      return this._cancelled;
    }

    getProgress() {
      return { ...this._progress };
    }

    _emit(patch = {}) {
      Object.assign(this._progress, patch);
      this.status = this._progress.status;
      if (this._onProgress) {
        try { this._onProgress({ ...this._progress }); } catch (_) {}
      }
    }

    _revokeUrl(url) {
      if (!url || !this._objectUrls.has(url)) return;
      this._objectUrls.delete(url);
      if (this._revokeObjectURL) {
        try { this._revokeObjectURL(url); } catch (_) {}
      }
    }

    _cleanupUrls() {
      for (const timer of this._revokeTimers) clearTimeout(timer);
      this._revokeTimers.clear();
      for (const url of [...this._objectUrls]) this._revokeUrl(url);
    }

    cancel() {
      if (this._cancelled) return;
      this._cancelled = true;
      if (this._abort) {
        try { this._abort.abort(); } catch (_) {}
      }
      if (this.status === "pending" || this.status === "running" || this.status === "zipping" || this.status === "downloading") {
        this._cleanupUrls();
        this._emit({ status: "cancelled" });
      }
    }

    start() {
      if (!this._promise) {
        this._promise = this._run();
      }
      return this._promise;
    }

    async _run() {
      if (this._cancelled) {
        this._emit({ status: "cancelled" });
        return {
          ok: false,
          cancelled: true,
          code: "cancelled",
          mode: this._mode,
          count: 0,
          failed: 0,
          skipped: 0,
          filenames: [],
          ids: [],
          errors: []
        };
      }

      if (!this._entries.length) {
        this._emit({ status: "failed" });
        return {
          ok: false,
          cancelled: false,
          code: "empty",
          error: "Nothing to download",
          mode: this._mode,
          count: 0,
          failed: 0,
          skipped: 0,
          filenames: [],
          ids: [],
          errors: ["Nothing to download"]
        };
      }

      const valid = [];
      const errors = [];
      let skipped = 0;
      for (let i = 0; i < this._entries.length; i++) {
        const entry = this._entries[i];
        if (!entry || typeof entry.url !== "string" || !entry.url ||
            (typeof this._isAllowedCdn === "function" && !this._isAllowedCdn(entry.url))) {
          skipped++;
          errors.push("invalid-url");
          continue;
        }
        const filename = typeof entry.filename === "string" && entry.filename.trim()
          ? entry.filename.trim()
          : `file_${i + 1}`;
        valid.push({ ...entry, filename });
      }

      if (!valid.length) {
        this._emit({ status: "failed", skipped });
        return {
          ok: false,
          cancelled: false,
          code: "invalid_url",
          error: "No valid CDN URLs to download",
          mode: this._mode,
          count: 0,
          failed: 0,
          skipped,
          filenames: [],
          ids: [],
          errors
        };
      }

      const useZip = this._mode === "zip" && (valid.length > 1 || this._forceZip);
      this._emit({ status: "running", mode: useZip ? "zip" : "separate", total: valid.length, skipped });

      if (useZip) return this._runZip(valid, skipped, errors);
      return this._runSeparate(valid, skipped, errors);
    }

    async _runSeparate(valid, skipped, errors) {
      const filenames = [];
      const ids = [];
      let count = 0;
      let failed = 0;

      for (let i = 0; i < valid.length; i++) {
        if (this._cancelled) {
          this._emit({ status: "cancelled" });
          return {
            ok: false,
            cancelled: true,
            code: "cancelled",
            mode: "separate",
            count,
            failed,
            skipped,
            filenames,
            ids,
            errors
          };
        }

        const entry = valid[i];
        this._emit({ status: "downloading", currentFilename: entry.filename });
        const reply = await this._sendMessage({
          type: MESSAGE_DOWNLOAD,
          url: entry.url,
          filename: entry.filename
        });

        if (reply && reply.ok === true) {
          count++;
          filenames.push(entry.filename);
          if (reply.id !== undefined) ids.push(reply.id);
        } else {
          failed++;
          errors.push((reply && reply.error) || "download-failed");
        }
        this._emit({ completed: count + failed, failed });
      }

      if (this._cancelled) {
        this._emit({ status: "cancelled" });
        return { ok: false, cancelled: true, code: "cancelled", mode: "separate", count, failed, skipped, filenames, ids, errors };
      }

      const ok = count > 0;
      this._emit({ status: ok ? "completed" : "failed" });
      return {
        ok,
        cancelled: false,
        code: ok ? "ok" : "download_failed",
        error: ok ? undefined : (errors[0] || "Download failed"),
        mode: "separate",
        count,
        failed,
        skipped,
        filenames,
        ids,
        errors
      };
    }

    async _runZip(valid, skipped, errors) {
      if (typeof this._fetch !== "function") {
        this._emit({ status: "failed" });
        return {
          ok: false,
          cancelled: false,
          code: "network",
          error: "fetch is unavailable for ZIP download",
          mode: "zip",
          count: 0,
          failed: valid.length,
          skipped,
          filenames: [],
          zipNames: [],
          ids: [],
          errors: [...errors, "fetch-unavailable"]
        };
      }

      this._abort = new AbortController();
      const signal = this._abort.signal;
      const results = new Array(valid.length);
      let nextIdx = 0;
      let completed = 0;
      let failed = 0;
      let bytesLoaded = 0;

      const worker = async () => {
        while (nextIdx < valid.length && !this._cancelled && !signal.aborted) {
          const i = nextIdx++;
          const entry = valid[i];
          try {
            if (!mediaLib.isAllowedCdn(entry.url)) throw new Error("invalid-url");
            const res = await this._fetch(entry.url, {
              credentials: "omit",
              redirect: "error",
              referrerPolicy: "no-referrer",
              signal
            });
            if (!res || !res.ok) {
              throw new Error(`HTTP ${res ? res.status : 0}`);
            }
            const bytes = await readZipEntry(res, this._isAllowedCdn);
            if (this._cancelled || signal.aborted) return;
            results[i] = {
              name: basename(entry.filename),
              bytes,
              date: entry.date,
              originalFilename: entry.filename
            };
            bytesLoaded += bytes.byteLength;
          } catch (err) {
            if (this._cancelled || signal.aborted) return;
            failed++;
            errors.push((err && err.message) || "fetch-failed");
          }
          completed++;
          this._emit({
            status: "running",
            completed,
            failed,
            bytesLoaded,
            currentFilename: entry.filename
          });
        }
      };

      const workerCount = Math.min(this._concurrency, valid.length);
      await Promise.all(Array.from({ length: workerCount }, worker));

      if (this._cancelled || signal.aborted) {
        this._emit({ status: "cancelled" });
        return {
          ok: false,
          cancelled: true,
          code: "cancelled",
          mode: "zip",
          count: 0,
          failed,
          skipped,
          filenames: [],
          zipNames: [],
          ids: [],
          errors
        };
      }

      const fetched = results.filter(Boolean);
      if (!fetched.length) {
        this._emit({ status: "failed" });
        return {
          ok: false,
          cancelled: false,
          code: "fetch_failed",
          error: "Could not fetch any media",
          mode: "zip",
          count: 0,
          failed,
          skipped,
          filenames: [],
          zipNames: [],
          ids: [],
          errors
        };
      }

      // Split into parts so no single archive exceeds partBytes.
      const parts = [];
      let currentPart = [];
      let currentBytes = 0;
      for (let i = 0; i < fetched.length; i++) {
        const item = fetched[i];
        if (currentPart.length > 0 && currentBytes + item.bytes.byteLength > this._partBytes) {
          parts.push(currentPart);
          currentPart = [];
          currentBytes = 0;
        }
        currentPart.push(item);
        currentBytes += item.bytes.byteLength;
      }
      if (currentPart.length) parts.push(currentPart);

      const partCount = parts.length;
      const zipNames = [];
      const filenames = fetched.map((f) => f.originalFilename);
      const ids = [];
      let dispatchedParts = 0;
      let packedCount = 0;

      for (let p = 0; p < partCount; p++) {
        if (this._cancelled) {
          this._cleanupUrls();
          this._emit({ status: "cancelled" });
          return {
            ok: false,
            cancelled: true,
            code: "cancelled",
            mode: "zip",
            count: packedCount,
            failed,
            skipped,
            filenames,
            zipNames,
            ids,
            errors
          };
        }

        const partEntries = parts[p];
        const zipFilename = buildZipFilename(valid, this._zipName, p, partCount);
        this._emit({ status: "zipping", currentFilename: zipFilename, partIndex: p + 1, partCount });

        let archive;
        try {
          archive = this._createZip(partEntries.map((e) => ({ name: e.name, bytes: e.bytes, date: e.date })));
        } catch (err) {
          this._cleanupUrls();
          const msgText = (err && err.message) || "ZIP creation failed";
          errors.push(msgText);
          this._emit({ status: "failed" });
          return {
            ok: false,
            cancelled: false,
            code: "zip_failed",
            error: msgText,
            mode: "zip",
            count: packedCount,
            failed,
            skipped,
            filenames,
            zipNames,
            ids,
            errors
          };
        }
        let blobUrl = null;
        // Firefox downloads only extension-origin Blob URLs: send the bytes and let the
        // background page make the URL. Chromium sends a page-origin Blob URL instead.
        if (!firefoxExtension() && this._createObjectURL && typeof Blob === "function") {
          blobUrl = this._createObjectURL(archive instanceof Blob ? archive : new Blob([archive], { type: "application/zip" }));
          this._objectUrls.add(blobUrl);
        }

        this._emit({ status: "downloading", currentFilename: zipFilename, partIndex: p + 1, partCount });
        const msg = {
          type: MESSAGE_DOWNLOAD_ZIP,
          filename: zipFilename,
          count: partEntries.length,
          size: archive instanceof Uint8Array ? archive.byteLength : (archive && archive.size) || 0,
          partIndex: p,
          partCount
        };
        if (blobUrl) msg.url = blobUrl;
        else msg.blob = archive;

        const reply = await this._sendMessage(msg);
        if (reply && reply.ok === true) {
          dispatchedParts++;
          packedCount += partEntries.length;
          zipNames.push(zipFilename);
          if (reply.id !== undefined) ids.push(reply.id);
          if (blobUrl && this._revokeDelayMs > 0) {
            const urlToRevoke = blobUrl;
            const timer = setTimeout(() => {
              this._revokeTimers.delete(timer);
              this._revokeUrl(urlToRevoke);
            }, this._revokeDelayMs);
            if (timer && typeof timer.unref === "function") timer.unref();
            this._revokeTimers.add(timer);
          }
        } else {
          if (blobUrl) this._revokeUrl(blobUrl);
          errors.push((reply && reply.error) || "zip-download-failed");
        }
      }

      const ok = dispatchedParts > 0;
      this._emit({ status: ok ? "completed" : "failed" });
      return {
        ok,
        cancelled: false,
        code: ok ? "ok" : "download_failed",
        error: ok ? undefined : (errors[0] || "ZIP download failed"),
        mode: "zip",
        count: packedCount,
        failed,
        skipped,
        filenames,
        zipNames,
        ids,
        errors,
        cleanup: () => this._cleanupUrls()
      };
    }
  }

  function createDownloadJob(entries, options = {}) {
    return new DownloadJob(entries, options);
  }

  function downloadItem(post, index = 0, options = {}) {
    const entries = buildEntriesForPost(post, { ...options, index });
    const baseName = `${(post && post.username) || "media"}_${(post && (post.shortcode || post.id)) || "item"}`;
    const job = new DownloadJob(entries, { ...options, mode: "separate", zipName: options.zipName || baseName });
    job.start();
    return job;
  }

  function downloadPost(post, options = {}) {
    const entries = buildEntriesForPost(post, options);
    const baseName = `${(post && post.username) || "media"}_${(post && (post.shortcode || post.id)) || "post"}`;
    const job = new DownloadJob(entries, { ...options, zipName: options.zipName || baseName });
    job.start();
    return job;
  }

  function downloadTray(tray, options = {}) {
    const entries = buildEntriesForTray(tray, options);
    const owner = Array.isArray(tray) && tray[0] && tray[0].username ? tray[0].username : "stories";
    const job = new DownloadJob(entries, { ...options, zipName: options.zipName || `${owner}_stories` });
    job.start();
    return job;
  }

  // The user's filename template and set format, read once per user action (no standing listener).
  function readUi() {
    return new Promise((resolve) => {
      try {
        const chromeApi = globalThis.chrome;
        const area = chromeApi && chromeApi.storage && chromeApi.storage.local;
        if (!area || typeof area.get !== "function") { resolve({}); return; }
        let settled = false;
        const done = (data) => {
          if (settled) return;
          settled = true;
          try { void (chromeApi.runtime && chromeApi.runtime.lastError); } catch (_) {}
          const ui = data && data.ui;
          resolve(ui && typeof ui === "object" && !Array.isArray(ui) ? ui : {});
        };
        const pending = area.get("ui", done);
        if (pending && typeof pending.then === "function") pending.then(done, () => done(null));
      } catch (_) { resolve({}); }
    });
  }

  // IY.actions adapter (media toolbar, full-size viewer, right-click menu): one download per user
  // action. payload: { items, mode: "one" | "all", zip, meta: { owner, shortcode, takenAt, index, total } }.
  // A set goes into one ZIP unless the user picked separate files; if the ZIP cannot be built
  // (for example a CDN refuses the page's read), the same files are sent one by one instead.
  async function run(payload, options = {}) {
    const items = payload && Array.isArray(payload.items)
      ? payload.items.filter((item) => item && typeof item === "object" && typeof item.url === "string" && item.url)
      : [];
    if (!items.length) throw new Error("no-media");
    const meta = (payload && payload.meta) || {};
    const ui = options.ui && typeof options.ui === "object" ? options.ui : await readUi();
    const template = typeof ui.filenameTemplate === "string" && ui.filenameTemplate.trim()
      ? ui.filenameTemplate.trim() : filenameLib.DEFAULT_TEMPLATE;
    const owner = typeof meta.owner === "string" ? meta.owner
      : (meta.owner && typeof meta.owner.username === "string" ? meta.owner.username : "");
    const one = payload.mode === "one";
    const total = Number.isInteger(meta.total) && meta.total > 0 ? meta.total : items.length;
    const takenAt = Number(meta.takenAt);
    const post = {
      username: owner || "unknown",
      shortcode: typeof meta.shortcode === "string" ? meta.shortcode : "",
      id: String(items[0].id || ""),
      takenAt: Number.isFinite(takenAt) && takenAt > 0 ? takenAt : 0,
      items,
      isCarousel: total > 1
    };
    const allowCdn = typeof options.isAllowedCdn === "function" ? options.isAllowedCdn : mediaLib.isAllowedCdn;
    const entries = [];
    for (let k = 0; k < items.length; k++) {
      const item = items[k];
      const index = one && Number.isInteger(meta.index) && meta.index >= 0 ? meta.index : k;
      if (typeof allowCdn === "function" && !allowCdn(item.url)) continue;
      entries.push({
        url: item.url,
        filename: entryFilename(post, item, index, { template, isCarousel: total > 1 }),
        date: post.takenAt > 0 ? new Date(post.takenAt * 1000) : undefined,
        id: item.id || "",
        type: item.type || "image",
        index
      });
    }
    if (!entries.length) throw new Error("no-media");
    const zip = !one && entries.length > 1 && ui.downloadFormat !== "files";
    const zipName = (owner || "media") + "_" + (post.shortcode || post.id || "media");
    const jobOptions = Object.assign({}, options.job || {}, { zipName });
    let result = await new DownloadJob(entries, Object.assign({}, jobOptions, { mode: zip ? "zip" : "separate" })).start();
    if (zip && result && !result.ok && !result.cancelled) {
      // Keep why the ZIP failed so a silent switch to separate files can be told apart from a
      // real "separate files" choice.
      const zipFailure = result.error || (result.errors && result.errors[0]) || result.code || "zip-failed";
      result = await new DownloadJob(entries, Object.assign({}, jobOptions, { mode: "separate" })).start();
      if (result) result.zipFallback = String(zipFailure);
    }
    if (!result || !result.ok) throw new Error((result && result.error) || "download-failed");
    return result;
  }

  const api = {
    MESSAGE_DOWNLOAD,
    MESSAGE_DOWNLOAD_ZIP,
    run,
    DEFAULT_PART_BYTES,
    DownloadJob,
    entryFilename,
    buildEntriesForPost,
    buildEntriesForTray,
    buildZipFilename,
    profilePicFilename,
    createDownloadJob,
    downloadItem,
    downloadPost,
    downloadTray
  };

  globalThis.IY = Object.assign(globalThis.IY || {}, { download: api });
  if (isNode) module.exports = api;
})();
