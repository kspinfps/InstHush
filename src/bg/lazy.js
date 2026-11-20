// On-demand isolated-world script loader for InstHush features.
// Deduplicates per (tabId, docId), serializes concurrent requests, enforces a static file allowlist,
// and works identically in Chromium MV3 and Firefox 128+ MV3 via scripting.executeScript.
(function () {
  "use strict";

  const isNode = typeof module !== "undefined" && module.exports;
  const MESSAGE_LOAD = "iy:lazy-load";
  const DOC_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
  const MAX_FILES_PER_REQUEST = 24;
  const ORIGIN_PREFIX = "https://www.instagram.com/";

  const ALLOWED_FILES = Object.freeze(new Set([
    "src/lib/settings-schema.js",
    "src/lib/filename.js",
    "src/lib/rate-limit.js",
    "src/lib/zip.js",
    "src/lib/csv.js",
    "src/lib/focus-budget.js",
    "src/page/dm-capture.js",
    "src/content/core/headers.js",
    "src/content/core/resolve.js",
    "src/content/core/api.js",
    "src/content/core/api-pages.js",
    "src/content/core/download.js",
    "src/content/core/story-extras.js",
    "src/content/ui/shadow.js",
    "src/content/core/hover.js",
    "src/content/ui/zoom.js",
    "src/content/core/actions.js",
    "src/content/features/dm-archive.js",
    "src/content/features/media-toolbar.js",
    "src/content/features/context-menu.js",
    "src/content/features/dm-tools.js",
    "src/content/features/comment-media.js",
    "src/content/features/follow-badge.js",
    "src/content/features/story-details.js",
    "src/content/features/story-no-advance.js",
    "src/content/features/declutter.js",
    "src/content/features/reel-ads.js",
    "src/content/features/no-double-tap.js",
    "src/content/features/focus-limit.js",
    "src/content/features/reel-counter.js",
    "src/content/features/direct-links.js",
    "src/content/features/bulk-download.js",
    "src/content/features/profile-tools.js",
    "src/content/features/unfollowers-history.js",
    "src/content/features/unfollow-queue.js",
    "src/content/features/unfollowers.js",
    "src/content/features/save-sound.js",
    "src/content/dmread.js",
    "src/content/comments.js",
    "src/content/focus.js",
    "src/content/hoverzoom.js",
    "src/content/dates.js",
    "src/content/opbadge.js",
    "src/content/seenposts.js",
    "src/content/health.js"
  ]));

  function sanitizeFiles(raw) {
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_FILES_PER_REQUEST) return null;
    const out = [];
    const seen = new Set();
    for (let i = 0; i < raw.length; i++) {
      const file = raw[i];
      if (typeof file !== "string" || !ALLOWED_FILES.has(file)) return null;
      if (!seen.has(file)) {
        seen.add(file);
        out.push(file);
      }
    }
    return out.length ? out : null;
  }

  function runExecuteScript(api, tabId, files, world) {
    return new Promise((resolve, reject) => {
      if (!api.scripting || typeof api.scripting.executeScript !== "function") {
        reject(new Error("scripting-unavailable"));
        return;
      }
      const details = {
        target: { tabId, frameIds: [0] },
        files,
        world: world || "ISOLATED"
      };
      let settled = false;
      const done = (result) => {
        if (settled) return;
        settled = true;
        const err = api.runtime && api.runtime.lastError;
        if (err) reject(new Error(err.message || "inject-failed"));
        else resolve(result);
      };
      const fail = (err) => {
        if (settled) return;
        settled = true;
        reject(err instanceof Error ? err : new Error(String(err || "inject-failed")));
      };
      try {
        // MV3 executeScript returns a Promise when no callback is passed (Chromium & Firefox 128+).
        if (api.scripting.executeScript.length >= 2) {
          const maybe = api.scripting.executeScript(details, done);
          if (maybe && typeof maybe.then === "function") maybe.then(done, fail);
        } else {
          const maybe = api.scripting.executeScript(details);
          if (maybe && typeof maybe.then === "function") maybe.then(done, fail);
          else done(maybe);
        }
      } catch (err) {
        fail(err);
      }
    });
  }

  function install(chromeApi) {
    const api = chromeApi || (typeof browser !== "undefined" ? browser : (typeof chrome !== "undefined" ? chrome : null));
    if (!api || !api.runtime || !api.runtime.onMessage || typeof api.runtime.onMessage.addListener !== "function") {
      return null;
    }

    // tabId -> { docId: string, loaded: Set<string>, tail: Promise<void> }
    const tabs = new Map();

    function getState(tabId, docId) {
      let state = tabs.get(tabId);
      if (!state || state.docId !== docId) {
        state = { docId, loaded: new Set(), tail: Promise.resolve() };
        tabs.set(tabId, state);
      }
      return state;
    }

    function onTabRemoved(tabId) {
      tabs.delete(tabId);
    }

    function onMessage(msg, sender, sendResponse) {
      if (!msg || msg.type !== MESSAGE_LOAD) return false;
      const tabId = sender && sender.tab && sender.tab.id;
      const senderUrl = (sender && sender.url) || (sender && sender.tab && sender.tab.url) || "";
      if (!sender || sender.id !== api.runtime.id || !Number.isInteger(tabId) || tabId < 0 ||
          (sender.frameId !== undefined && sender.frameId !== 0) ||
          typeof senderUrl !== "string" || !senderUrl.startsWith(ORIGIN_PREFIX)) {
        sendResponse({ ok: false, error: "invalid-sender" });
        return false;
      }
      if (typeof msg.docId !== "string" || !DOC_ID_RE.test(msg.docId)) {
        sendResponse({ ok: false, error: "invalid-doc" });
        return false;
      }
      const files = sanitizeFiles(msg.files);
      if (!files) {
        sendResponse({ ok: false, error: "invalid-files" });
        return false;
      }

      const docId = msg.docId;
      const state = getState(tabId, docId);
      const task = state.tail.then(async () => {
        if (tabs.get(tabId) !== state) return { ok: false, error: "stale-doc" };
        const needed = files.filter(file => !state.loaded.has(file));
        if (!needed.length) return { ok: true, injected: [] };
        await runExecuteScript(api, tabId, needed, "ISOLATED");
        if (tabs.get(tabId) === state) {
          for (let i = 0; i < needed.length; i++) state.loaded.add(needed[i]);
        }
        return { ok: true, injected: needed };
      });
      state.tail = task.then(() => {}, () => {});

      task.then(
        (result) => {
          try { sendResponse(result); } catch (_) {}
        },
        () => {
          try { sendResponse({ ok: false, error: "inject-failed" }); } catch (_) {}
        }
      );
      return true;
    }

    api.runtime.onMessage.addListener(onMessage);
    if (api.tabs && api.tabs.onRemoved && typeof api.tabs.onRemoved.addListener === "function") {
      api.tabs.onRemoved.addListener(onTabRemoved);
    }

    return {
      tabs,
      onMessage,
      onTabRemoved,
      destroy() {
        if (api.runtime.onMessage && typeof api.runtime.onMessage.removeListener === "function") {
          api.runtime.onMessage.removeListener(onMessage);
        }
        if (api.tabs && api.tabs.onRemoved && typeof api.tabs.onRemoved.removeListener === "function") {
          api.tabs.onRemoved.removeListener(onTabRemoved);
        }
        tabs.clear();
      }
    };
  }

  const exported = {
    MESSAGE_LOAD,
    ALLOWED_FILES,
    sanitizeFiles,
    install,
    instance: null
  };

  globalThis.IY = globalThis.IY || {};
  globalThis.IY.bgLazy = exported;

  if (isNode) {
    module.exports = exported;
  } else {
    exported.instance = install();
  }
})();
