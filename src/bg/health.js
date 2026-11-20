// Health check runner (background). One run at a time: it opens one background tab, walks it through
// the six pages of IY.health.STEPS, asks the probe in that tab (src/content/health.js) what it found,
// then closes the tab. Nothing here clicks, opens a story or a chat, or sends Instagram a request:
// the pages just load as they would for the user.
// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only. Copyright jewdev.
(function () {
  "use strict";

  const ORIGIN = "https://www.instagram.com";
  const MARKER = "#iy-health";
  const RUN_KEY = "iy.health.run";
  const REPORT_KEY = "healthReport";
  const OWN_IDS = new Set(["page", "relay", "cooldown", "session", "error", "errors", "tab", "stopped"]);
  const DAY = 86400000;

  const sleepDefault = ms => new Promise(resolve => setTimeout(resolve, ms));
  const timeoutError = () => Object.assign(new Error("timeout"), { timeout: true });
  function withTimeout(promise, ms) {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(timeoutError()), ms); })])
      .finally(() => clearTimeout(timer));
  }
  // Works with callback style (Chromium) and promise style (Firefox) APIs.
  function call(fn, ...args) {
    return new Promise((resolve, reject) => {
      let result;
      try {
        result = fn(...args, value => {
          const error = globalThis.chrome && chrome.runtime && chrome.runtime.lastError;
          if (error) reject(new Error(error.message || "api")); else resolve(value);
        });
      } catch (error) { reject(error); return; }
      if (result && typeof result.then === "function") result.then(resolve, reject);
    });
  }

  // Only the six fixed Instagram pages. Stories and chats are never opened.
  function safeUrl(url) {
    let parsed;
    try { parsed = new URL(url); } catch (_) { return false; }
    if (parsed.origin !== ORIGIN) return false;
    return !/^\/(?:stories(?:\/|$)|direct\/t(?:\/|$))/.test(parsed.pathname);
  }
  function isLoginPage(url) {
    try { return /^\/(?:accounts\/(?:login|emailsignup)|challenge)(?:\/|$)/.test(new URL(url).pathname); } catch (_) { return false; }
  }

  function install(api, options) {
    const opts = options || {};
    const lib = opts.lib || (globalThis.IY && globalThis.IY.health);
    if (!api || !api.runtime || !api.runtime.onMessage || !api.tabs || !lib) return null;
    const now = opts.now || Date.now;
    const sleep = opts.sleep || sleepDefault;
    const loadMs = opts.loadMs || 20000;
    const askMs = opts.askMs || 10000;
    const replyMs = opts.replyMs || 25000;
    const totalMs = opts.totalMs || 150000;
    const session = api.storage && api.storage.session;
    const local = api.storage && api.storage.local;
    let current = null;

    async function setRun(value) {
      if (!session) return;
      try { await call(value ? session.set.bind(session) : session.remove.bind(session), value ? { [RUN_KEY]: value } : RUN_KEY); } catch (_) {}
    }

    async function ownChecks() {
      let stored = {};
      try { stored = (await call(local.get.bind(local), "health")).health || {}; } catch (_) {}
      const out = [];
      for (const name of Object.keys(stored)) {
        const entry = stored[name];
        const count = Number(entry && entry.count);
        if (!/^[a-z][a-z0-9_-]{0,39}$/i.test(name) || !(count > 0)) continue;
        const recent = Number(entry.last) > now() - 3 * DAY;
        out.push({ id: "error", label: "Feature errors", status: recent ? "fail" : "warn", n: Math.min(count, 9999),
          detail: "Stopped after repeated errors.", affects: [name] });
      }
      if (!out.length) out.push({ id: "errors", label: "Feature errors", status: "pass", detail: "No feature errors recorded." });
      return out;
    }

    function waitLoaded(tabId) {
      return new Promise(resolve => {
        const done = () => { api.tabs.onUpdated.removeListener(onUpdated); clearTimeout(timer); resolve(); };
        const onUpdated = (id, info) => { if (id === tabId && info && info.status === "complete") done(); };
        const timer = setTimeout(done, loadMs);
        api.tabs.onUpdated.addListener(onUpdated);
      });
    }

    async function ask(tabId, step) {
      const end = now() + askMs;
      for (;;) {
        try { return await withTimeout(call(api.tabs.sendMessage.bind(api.tabs), tabId, { type: "iy:health-run", step }), replyMs); }
        catch (error) {
          if (error && error.timeout) return undefined;
          if (now() > end) return undefined;
          await sleep(500);
        }
      }
    }

    async function run() {
      const startedAt = now();
      // Claim the slot before any await, so a second request sees the run.
      const state = { tabId: undefined, closed: false, unsafe: false };
      current = state;
      const checks = await ownChecks();
      let loggedOut = false, finished = false;
      const onRemoved = id => { if (id === state.tabId) state.closed = true; };
      // Instagram may redirect a page to a story or a chat: leave at once.
      const onNav = (id, info) => {
        if (id !== state.tabId || !info || !info.url || safeUrl(info.url) || info.url === "about:blank") return;
        state.unsafe = true;
        try { call(api.tabs.update.bind(api.tabs), id, { url: "about:blank" }).catch(() => {}); } catch (_) {}
      };
      api.tabs.onRemoved.addListener(onRemoved);
      api.tabs.onUpdated.addListener(onNav);
      const keepAlive = setInterval(() => { try { call(api.runtime.getPlatformInfo.bind(api.runtime)).catch(() => {}); } catch (_) {} }, 20000);
      let next = {};
      try {
        const tab = await call(api.tabs.create.bind(api.tabs), { url: "about:blank", active: false });
        state.tabId = tab && tab.id;
        if (!Number.isInteger(state.tabId)) throw new Error("no tab");
        // The page that opens the tab is never muted; this one is, so a reel can never be heard.
        try { await call(api.tabs.update.bind(api.tabs), state.tabId, { muted: true }); } catch (_) {}
        await setRun({ tabId: state.tabId, at: startedAt });
        for (let i = 0; i < lib.STEPS.length; i++) {
          const step = lib.STEPS[i];
          if (state.closed || state.unsafe || now() - startedAt > totalMs) break;
          const url = lib.stepUrl(step, next);
          if (!url || !safeUrl(url)) {
            checks.push({ id: step + "-step", label: "Page", status: "skip", group: lib.STEP_LABELS[step],
              detail: step === "post" ? "Home had no post to open." : "Home had no profile to open." });
            continue;
          }
          await setRun({ tabId: state.tabId, at: startedAt, step, index: i + 1, total: lib.STEPS.length });
          const loaded = waitLoaded(state.tabId);
          await call(api.tabs.update.bind(api.tabs), state.tabId, { url: url + MARKER });
          await loaded;
          if (state.closed) break;
          let at = "";
          try { at = (await call(api.tabs.get.bind(api.tabs), state.tabId)).url || ""; } catch (_) {}
          if (isLoginPage(at)) {
            loggedOut = true;
            checks.push({ id: "session", label: "Logged in", status: "fail", detail: "Not logged in to Instagram in this browser.", affects: ["Most features"] });
            break;
          }
          const reply = state.unsafe ? undefined : await ask(state.tabId, step);
          if (state.closed) break;
          if (!reply || reply.error || !Array.isArray(reply.checks)) {
            checks.push({ id: step + "-step", label: "Page", status: "fail", group: lib.STEP_LABELS[step],
              detail: "InstHush did not answer on this page.", affects: ["Everything on this page"] });
            if (step === "home") break;
            continue;
          }
          for (const check of reply.checks) {
            if (!check || typeof check !== "object") continue;
            const entry = Object.assign({}, check);
            if (!OWN_IDS.has(entry.id)) entry.group = lib.STEP_LABELS[step];
            checks.push(entry);
          }
          if (step === "home") {
            next = reply.next && typeof reply.next === "object" ? reply.next : {};
          }
        }
        finished = !state.closed && !state.unsafe && !loggedOut;
      } catch (_) {
        checks.push({ id: "tab", label: "Instagram tab", status: "fail", detail: "Could not open a tab for the check.", affects: ["The health check"] });
      } finally {
        clearInterval(keepAlive);
        api.tabs.onRemoved.removeListener(onRemoved);
        api.tabs.onUpdated.removeListener(onNav);
        if (Number.isInteger(state.tabId) && !state.closed) { try { await call(api.tabs.remove.bind(api.tabs), state.tabId); } catch (_) {} }
        await setRun(null);
        current = null;
      }
      if (finished) {
        checks.push({ id: "stories-viewer", label: "Story viewer", status: "skip", group: "Stories",
          detail: "Not opened, because its owner would see a view. Open a story yourself to try it." });
      }
      if (state.closed) checks.push({ id: "stopped", label: "Check stopped", status: "warn", detail: "The Instagram tab was closed before every page was checked." });
      if (state.unsafe) checks.push({ id: "stopped", label: "Check stopped", status: "warn", detail: "Instagram redirected to a story or chat. The check left that page at once." });
      let version = "";
      try { version = api.runtime.getManifest().version; } catch (_) {}
      const report = { version, page: "full check", at: now(), checks, loggedOut };
      if (local) { try { await call(local.set.bind(local), { [REPORT_KEY]: report }); } catch (_) {} }
      return report;
    }

    function fromOptions(sender) {
      let base = "";
      try { base = api.runtime.getURL("src/options/"); } catch (_) {}
      return !!sender && sender.id === api.runtime.id && !!base && typeof sender.url === "string" && sender.url.startsWith(base);
    }

    function onMessage(msg, sender, sendResponse) {
      if (!msg || typeof msg !== "object") return false;
      if (msg.type === "iy:health-run") {
        if (!fromOptions(sender)) { sendResponse({ ok: false, error: "invalid-sender" }); return false; }
        if (current) { sendResponse({ ok: false, error: "busy" }); return false; }
        run().then(report => sendResponse({ ok: true, report }), () => sendResponse({ ok: false, error: "failed" }));
        return true;
      }
      if (msg.type === "iy:health-tab") {
        const tabId = sender && sender.tab && sender.tab.id;
        const ok = !!sender && sender.id === api.runtime.id && (sender.frameId === undefined || sender.frameId === 0) &&
          typeof sender.url === "string" && sender.url.startsWith(ORIGIN + "/");
        sendResponse({ ok, health: ok && !!current && Number.isInteger(tabId) && current.tabId === tabId });
        return false;
      }
      return false;
    }

    // A worker that restarted mid-run left a tab behind: close it.
    async function recover() {
      if (!session) return;
      try {
        const stored = (await call(session.get.bind(session), RUN_KEY))[RUN_KEY];
        if (stored && Number.isInteger(stored.tabId) && !current) await call(api.tabs.remove.bind(api.tabs), stored.tabId).catch(() => {});
        if (stored && !current) await setRun(null);
      } catch (_) {}
    }

    api.runtime.onMessage.addListener(onMessage);
    recover();
    return { run, onMessage, recover, get busy() { return !!current; } };
  }

  const exported = { install, safeUrl, isLoginPage, MARKER, RUN_KEY, REPORT_KEY };
  globalThis.IY = Object.assign(globalThis.IY || {}, { bgHealth: exported });
  if (typeof module !== "undefined" && module.exports) module.exports = exported;
})();
