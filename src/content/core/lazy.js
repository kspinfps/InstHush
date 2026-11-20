// Isolated-world on-demand feature loader and lightweight trigger coordinator.
// Loads feature bundles through the background scripting API on first use (setting ON + trigger/route),
// deduplicates per document, and fails closed with health reporting on injection error.
(function () {
  "use strict";

  const isNode = typeof module !== "undefined" && module.exports;
  const MESSAGE_LOAD = "iy:lazy-load";

  const RESERVED_ROUTES = new Set([
    "accounts", "explore", "direct", "about", "developer", "legal", "emails", "challenge",
    "stories", "reels", "reel", "p", "tv", "web", "session", "privacy", "terms", "press",
    "api", "graphql", "oauth", "nametag", "lite", "your_activity", "notifications", "threads",
    "settings", "archive", "create", "login", "signup", "help", "ads", "business", "static", "download"
  ]);

  const SPONSORED_WORDS = new Set([
    "Sponsored", "Sponsorlu", "Sponsorlu gönderi", "Reklam", "Publicidad", "Sponsorisé",
    "Gesponsert", "Sponsorizzato", "Patrocinado", "Gesponsord", "Реклама", "ממומן",
    "مُموَّل", "ممول", "広告", "광고", "贊助", "赞助"
  ]);

  const OWN_UI_RE = /\biy-(?:host|photo|toast|dock-host|keys-host|hoverzoom-host|media-toolbar-host|zoom-host|shadow-host)\b/;

  // Dependency-ordered file bundles; shared files are deduplicated per document.
  const API_CORE = [
    "src/lib/rate-limit.js",
    "src/content/core/headers.js",
    "src/content/core/resolve.js",
    "src/content/core/api.js"
  ];
  const DL_CORE = ["src/lib/filename.js", "src/lib/zip.js", ...API_CORE, "src/content/core/download.js", "src/content/ui/shadow.js"];
  const ACTIONS_CORE = [...DL_CORE, "src/content/core/hover.js", "src/content/ui/zoom.js", "src/content/core/actions.js"];
  const BUNDLES = Object.freeze({
    settingsSchema: Object.freeze(["src/lib/settings-schema.js"]),
    mediaToolbar: Object.freeze(["src/content/ui/shadow.js", "src/content/core/hover.js", "src/content/features/media-toolbar.js"]),
    actions: Object.freeze(ACTIONS_CORE.slice()),
    contextMenu: Object.freeze([...ACTIONS_CORE, "src/content/features/context-menu.js"]),
    commentMedia: Object.freeze(["src/lib/filename.js", "src/content/ui/shadow.js", "src/content/features/comment-media.js"]),
    followBadge: Object.freeze([...API_CORE, "src/content/ui/shadow.js", "src/content/features/follow-badge.js"]),
    storyDetails: Object.freeze([...API_CORE, "src/content/core/story-extras.js", "src/content/ui/shadow.js", "src/content/features/story-details.js"]),
    storyNoAdvance: Object.freeze(["src/content/core/resolve.js", "src/content/features/story-no-advance.js"]),
    declutter: Object.freeze(["src/content/features/declutter.js"]),
    reelAds: Object.freeze(["src/content/features/reel-ads.js"]),
    noDoubleTap: Object.freeze(["src/content/features/no-double-tap.js"]),
    focusLimit: Object.freeze(["src/lib/focus-budget.js", "src/content/ui/shadow.js", "src/content/features/focus-limit.js"]),
    reelCounter: Object.freeze(["src/lib/focus-budget.js", "src/content/ui/shadow.js", "src/content/features/reel-counter.js"]),
    directLinks: Object.freeze(["src/content/features/direct-links.js"]),
    dmTools: Object.freeze([...DL_CORE, "src/content/features/dm-tools.js"]),
    dmArchive: Object.freeze(["src/page/dm-capture.js", "src/content/ui/shadow.js", "src/content/features/dm-archive.js"]),
    bulkDownload: Object.freeze([
      "src/lib/filename.js", "src/lib/zip.js", "src/lib/csv.js", ...API_CORE,
      "src/content/core/api-pages.js", "src/content/core/download.js", "src/content/ui/shadow.js",
      "src/content/features/bulk-download.js", "src/content/features/profile-tools.js"
    ]),
    unfollowers: Object.freeze([
      "src/lib/csv.js", ...API_CORE, "src/content/ui/shadow.js",
      "src/content/features/unfollowers-history.js", "src/content/features/unfollow-queue.js", "src/content/features/unfollowers.js"
    ]),
    saveSound: Object.freeze([...API_CORE, "src/content/ui/shadow.js", "src/content/features/save-sound.js"]),
    dmread: Object.freeze(["src/content/dmread.js"]),
    comments: Object.freeze(["src/content/comments.js"]),
    focus: Object.freeze(["src/content/focus.js"]),
    hoverzoom: Object.freeze(["src/content/hoverzoom.js"]),
    dates: Object.freeze(["src/content/dates.js"]),
    opbadge: Object.freeze(["src/content/opbadge.js"]),
    seenposts: Object.freeze(["src/content/seenposts.js"]),
    // Health check probe: only the confirmed health tab loads it. It reads the page through the relay (no network).
    health: Object.freeze([...API_CORE, "src/content/health.js"])
  });

  function makeDocId() {
    try {
      if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
        return globalThis.crypto.randomUUID();
      }
    } catch (_) {}
    return "doc_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 12);
  }

  function classifyRoute(pathname) {
    const clean = typeof pathname === "string" ? pathname.split(/[?#]/)[0] : "/";
    const parts = clean.split("/").filter(Boolean);
    const a = parts[0] || "";
    const b = parts[1] || "";
    const c = parts[2] || "";
    if (!a) return { kind: "home" };
    if (a === "p" || a === "tv") return { kind: "post" };
    if (a === "reel" && b) return { kind: "reel" };
    if (a === "reels") return { kind: "reels" };
    if (a === "stories" && b) return { kind: "story" };
    if (a === "explore") return { kind: "explore" };
    if (a === "direct") return { kind: "direct" };
    if (RESERVED_ROUTES.has(a.toLowerCase())) return { kind: "other" };
    if ((b === "p" || b === "tv") && c) return { kind: "post" };
    if ((b === "reel" || b === "reels") && c) return { kind: "reel" };
    if (/^[A-Za-z0-9._]{1,30}$/.test(a) && !/^\.+$/.test(a)) return { kind: "profile", username: a };
    return { kind: "other" };
  }

  function isOwnUi(node) {
    for (let n = node; n && typeof n === "object"; n = n.host || n.parentNode || n.parentElement) {
      if (typeof n.className === "string" && OWN_UI_RE.test(n.className)) return true;
    }
    return false;
  }

  function hasCustomShortcuts(shortcuts) {
    const map = shortcuts && typeof shortcuts === "object" && shortcuts.map;
    if (!map || typeof map !== "object") return false;
    for (const key in map) {
      if (Object.prototype.hasOwnProperty.call(map, key)) return true;
    }
    return false;
  }

  function hasNonAdDeclutter(ui) {
    if (!ui || typeof ui !== "object") return false;
    const f = ui.focusOpts;
    if (f && typeof f === "object" && !Array.isArray(f)) {
      if (f.suggested === true || f.suggestedAccounts === true || f.storyTray === true ||
          f.reelsNav === true || f.exploreNav === true || f.threads === true) {
        return true;
      }
    } else if (ui.focus === true) {
      return true;
    }
    const mute = ui.mute;
    if (mute && typeof mute === "object") {
      if ((Array.isArray(mute.words) && mute.words.length > 0) ||
          (Array.isArray(mute.accounts) && mute.accounts.length > 0)) {
        return true;
      }
    }
    return false;
  }

  function hasFocusCssOpts(ui) {
    if (!ui || typeof ui !== "object") return false;
    const f = ui.focusOpts;
    if (f && typeof f === "object" && !Array.isArray(f)) {
      return f.counts === true || f.suggested === true || f.reelsNav === true ||
        f.exploreNav === true || f.threads === true || f.metaAi === true;
    }
    return ui.focus === true;
  }

  function needsFocusLimit(ui, routeKind) {
    if (!ui || typeof ui !== "object") return false;
    const gs = ui.grayscale === "always" || ui.grayscale === "limited" || ui.grayscale === "limit" ? ui.grayscale : "never";
    const limit = Number(ui.focusLimit);
    const hasLimit = Number.isFinite(limit) && limit > 0;
    if (gs === "always") return true;
    if (!hasLimit && gs === "never") return false;
    return routeKind === "reels" || routeKind === "reel" || routeKind === "explore";
  }

  function isTyping(e, doc) {
    if (!e || e.isComposing) return true;
    const path = typeof e.composedPath === "function" ? e.composedPath() : [e.target];
    const list = doc && doc.activeElement ? path.concat([doc.activeElement]) : path;
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      if (!n || typeof n !== "object") continue;
      const tag = typeof n.tagName === "string" ? n.tagName.toUpperCase() : "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || n.isContentEditable) return true;
      if (typeof n.getAttribute === "function" && n.getAttribute("role") === "textbox") return true;
    }
    return false;
  }

  function articleHasSponsoredLabel(article) {
    if (!article || typeof article.querySelectorAll !== "function") return false;
    const nodes = article.querySelectorAll("span, a");
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (el.childElementCount > 1) continue;
      const text = el.textContent ? el.textContent.trim() : "";
      if (text && SPONSORED_WORDS.has(text)) return true;
    }
    return false;
  }

  function isCommentRowWithMedia(img) {
    if (!img || (typeof img.closest === "function" && img.closest("a"))) return false;
    let cur = img.parentElement;
    for (let d = 0; d < 10 && cur; d++, cur = cur.parentElement) {
      const tag = cur.tagName;
      if (tag === "ARTICLE" || tag === "MAIN" || tag === "SECTION" || tag === "BODY" || tag === "HTML") return false;
      const role = typeof cur.getAttribute === "function" ? cur.getAttribute("role") : "";
      if (role === "dialog" || role === "main") return false;
      if (typeof cur.querySelectorAll !== "function") continue;
      const avatars = cur.querySelectorAll("a img").length;
      if (avatars > 1) return false;
      if (avatars === 1 && cur.querySelector('button, [role="button"]')) return true;
    }
    return false;
  }

  function hasCommentMediaCandidate(root) {
    if (!root || typeof root.querySelectorAll !== "function") return false;
    const gifs = root.querySelectorAll('img[src*="fbsbx.com"]');
    for (let i = 0; i < gifs.length; i++) {
      if (isCommentRowWithMedia(gifs[i])) return true;
    }
    const replyMap = globalThis.IY && globalThis.IY.selectors && globalThis.IY.selectors.reply;
    if (!replyMap) return false;
    const buttons = root.querySelectorAll('button, [role="button"]');
    for (let i = 0; i < buttons.length && i < 120; i++) {
      const text = (buttons[i].textContent || "").trim().toLowerCase();
      if (!text || !Object.hasOwn(replyMap, text)) continue;
      let cur = buttons[i].parentElement;
      for (let d = 0; d < 6 && cur; d++, cur = cur.parentElement) {
        if (cur.tagName === "ARTICLE" || cur.tagName === "MAIN" || cur.tagName === "BODY") break;
        if (typeof cur.querySelectorAll === "function") {
          const imgs = cur.querySelectorAll("img");
          if (imgs.length === 2 && cur.querySelectorAll("a img").length === 1) return true;
        }
      }
    }
    return false;
  }

  function hasOpCommentCandidate(root) {
    if (!root || typeof root.querySelector !== "function") return false;
    if (root.querySelector('ul li h3, ul li time, ol li h3, ol li time, [role="list"] [role="listitem"] h3, [role="list"] [role="listitem"] time')) {
      return true;
    }
    const times = typeof root.querySelectorAll === "function" ? root.querySelectorAll("span > time") : [];
    for (let i = 0; i < times.length; i++) {
      if (typeof times[i].closest !== "function" || !times[i].closest("a")) return true;
    }
    return false;
  }

  function hasReplyControl(root) {
    if (!root || typeof root.querySelectorAll !== "function") return false;
    const replyMap = globalThis.IY && globalThis.IY.selectors && globalThis.IY.selectors.reply;
    if (!replyMap) return false;
    const buttons = root.querySelectorAll('button, [role="button"]');
    for (let i = 0; i < buttons.length && i < 120; i++) {
      const text = (buttons[i].textContent || "").trim().toLowerCase();
      if (text && Object.hasOwn(replyMap, text)) return true;
    }
    return false;
  }

  function createLazyLoader(deps) {
    const d = deps || {};
    const docId = d.docId || makeDocId();
    const loadedFiles = new Set();
    const loadedBundles = new Set();
    const failedBundles = new Set();
    const inflight = new Map();
    let tail = Promise.resolve();

    function getChrome() {
      return d.chrome || (typeof chrome !== "undefined" ? chrome : null);
    }

    function sendMessage(msg) {
      return new Promise((resolve) => {
        const api = getChrome();
        if (!api || !api.runtime || typeof api.runtime.sendMessage !== "function") {
          resolve({ ok: false, error: "runtime-unavailable" });
          return;
        }
        let settled = false;
        const done = (reply) => {
          if (settled) return;
          settled = true;
          const err = api.runtime.lastError;
          if (err) resolve({ ok: false, error: err.message || "send-failed" });
          else resolve(reply && typeof reply === "object" ? reply : { ok: false, error: "empty-reply" });
        };
        try {
          const maybe = api.runtime.sendMessage(msg, done);
          if (maybe && typeof maybe.then === "function") {
            maybe.then(done, () => done({ ok: false, error: "send-failed" }));
          }
        } catch (_) {
          done({ ok: false, error: "send-failed" });
        }
      });
    }

    function reportHealthFailure(name) {
      const api = getChrome();
      if (!api || !api.runtime || typeof api.runtime.sendMessage !== "function") return;
      try {
        const maybe = api.runtime.sendMessage({ type: "iy:health", name, phase: "load" }, () => {
          void api.runtime.lastError;
        });
        if (maybe && typeof maybe.catch === "function") maybe.catch(() => {});
      } catch (_) {}
    }

    function load(bundleName) {
      const files = BUNDLES[bundleName];
      if (!files) return Promise.resolve(false);
      if (loadedBundles.has(bundleName)) return Promise.resolve(true);
      if (failedBundles.has(bundleName)) return Promise.resolve(false);
      if (inflight.has(bundleName)) return inflight.get(bundleName);

      const job = tail.then(async () => {
        if (loadedBundles.has(bundleName)) return true;
        if (failedBundles.has(bundleName)) return false;
        const needed = files.filter(file => !loadedFiles.has(file));
        if (!needed.length) {
          loadedBundles.add(bundleName);
          return true;
        }
        const reply = await sendMessage({ type: MESSAGE_LOAD, docId, files: needed });
        if (!reply || reply.ok !== true) {
          failedBundles.add(bundleName);
          reportHealthFailure(bundleName);
          return false;
        }
        for (let i = 0; i < needed.length; i++) loadedFiles.add(needed[i]);
        loadedBundles.add(bundleName);
        return true;
      }).catch(() => {
        failedBundles.add(bundleName);
        reportHealthFailure(bundleName);
        return false;
      });

      tail = job.then(() => {}, () => {});
      inflight.set(bundleName, job);
      job.then(() => inflight.delete(bundleName), () => inflight.delete(bundleName));
      return job;
    }

    return {
      docId,
      BUNDLES,
      loadedFiles,
      load,
      isLoaded: (name) => loadedBundles.has(name),
      hasFailed: (name) => failedBundles.has(name)
    };
  }

  function installProxies(iy, loader) {
    // Lightweight actions proxy so toolbar buttons and dock actions work before actions.js loads.
    if (!iy.actions) {
      const makeAction = (method) => async function () {
        const args = arguments;
        const ok = await loader.load("actions");
        if (!ok || !iy.actions || iy.actions.__lazy || typeof iy.actions[method] !== "function") {
          return undefined;
        }
        return iy.actions[method].apply(iy.actions, args);
      };
      iy.actions = {
        __lazy: true,
        downloadOne: makeAction("downloadOne"),
        downloadAll: makeAction("downloadAll"),
        openZoom: makeAction("openZoom"),
        copyMediaUrl: makeAction("copyMediaUrl"),
        copyCaption: makeAction("copyCaption"),
        downloadAvatar: makeAction("downloadAvatar"),
        hasMultiple: () => Promise.resolve(false)
      };
    }

    if (!iy.storyDetails) {
      iy.storyDetails = {
        __lazy: true,
        open: async function (arg) {
          const ok = await loader.load("storyDetails");
          if (!ok || !iy.storyDetails || iy.storyDetails.__lazy || typeof iy.storyDetails.open !== "function") {
            return undefined;
          }
          return iy.storyDetails.open(arg);
        }
      };
    }

    if (!iy.dmTools) {
      iy.dmTools = {
        __lazy: true,
        downloadSelected: async function () {
          const ok = await loader.load("dmTools");
          if (!ok || !iy.dmTools || iy.dmTools.__lazy || typeof iy.dmTools.downloadSelected !== "function") {
            return undefined;
          }
          return iy.dmTools.downloadSelected();
        }
      };
    }
  }

  function attachTriggers(iy, loader, env) {
    const doc = (env && env.document) || (typeof document !== "undefined" ? document : null);
    const loc = (env && env.location) || (typeof location !== "undefined" ? location : { pathname: "/" });
    const api = (env && env.chrome) || (typeof chrome !== "undefined" ? chrome : null);
    const core = iy.core;
    if (!core || typeof core.feature !== "function") return null;

    let current = { cfg: undefined, ui: undefined, shortcuts: undefined };
    let hoverAttached = false;
    let ctxAttached = false;
    let commentHoverAttached = false;
    let domObsOff = null;
    let watchAd = false;
    let watchCommentMedia = false;
    let watchComments = false;
    let watchOp = false;
    let lastPointer = null;
    let lastCtx = null;

    function isToolbarOn() {
      const ui = current.ui, cfg = current.cfg;
      return !(ui && ui.mediaToolbar === false) && !(cfg && cfg.mediaToolbar === false);
    }

    function isContextMenuOn() {
      const ui = current.ui, cfg = current.cfg;
      return !(ui && ui.contextMenu === false) && !(cfg && cfg.contextMenu === false);
    }

    function isCommentGifOn() {
      const ui = current.ui, cfg = current.cfg;
      return !(ui && (ui.commentGif === false || ui.commentMedia === false)) &&
        !(cfg && (cfg.commentGif === false || cfg.commentMedia === false));
    }

    function isShortcutsOn() {
      const ui = current.ui;
      return !(ui && (ui.keys === false || ui.shortcuts === false));
    }

    function detachHoverPreTrigger() {
      if (!hoverAttached || !doc) return;
      hoverAttached = false;
      doc.removeEventListener("mousemove", onPrePointerMove, true);
      doc.removeEventListener("focusin", onPreFocusIn, true);
      doc.removeEventListener("keydown", onPreKeyDown, true);
      if (doc.documentElement) doc.documentElement.removeEventListener("mouseleave", onPreLeave);
    }

    function triggerMediaToolbar(reason, extra) {
      if (loader.isLoaded("mediaToolbar") || loader.hasFailed("mediaToolbar")) {
        detachHoverPreTrigger();
        return;
      }
      loader.load("mediaToolbar").then((ok) => {
        detachHoverPreTrigger();
        if (!ok) return;
        if (reason === "pointer" && lastPointer && iy.hover && typeof iy.hover.replay === "function") {
          iy.hover.replay(lastPointer.x, lastPointer.y, lastPointer.target);
        } else if (reason === "keydown" && extra && iy.mediaToolbar && typeof iy.mediaToolbar.getController === "function") {
          const ctrl = iy.mediaToolbar.getController();
          if (ctrl && typeof ctrl.onKeyDown === "function") ctrl.onKeyDown(extra);
        } else if (reason === "focusin" && extra && doc && doc.activeElement === extra) {
          try {
            extra.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
          } catch (_) {}
        }
      });
    }

    function isLikelyMediaTarget(target) {
      if (!target || typeof target !== "object") return false;
      const el = target.nodeType === 3 ? target.parentElement : target;
      if (!el || isOwnUi(el)) return false;
      const tag = typeof el.tagName === "string" ? el.tagName.toUpperCase() : "";
      if (tag === "IMG" || tag === "VIDEO") return true;
      if (typeof el.closest === "function") {
        const container = el.closest('article, [role="dialog"], section, header');
        if (container && typeof container.querySelector === "function" && container.querySelector("img, video")) {
          return true;
        }
      }
      return false;
    }

    function onPrePointerMove(e) {
      if (!e || e.isTrusted === false || !isToolbarOn()) return;
      const x = Number(e.clientX);
      const y = Number(e.clientY);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      lastPointer = { x, y, target: e.target || null };
      if (isLikelyMediaTarget(e.target)) {
        triggerMediaToolbar("pointer");
      }
    }

    function onPreLeave() {
      lastPointer = null;
    }

    function onPreFocusIn(e) {
      if (!e || !isToolbarOn()) return;
      if (isLikelyMediaTarget(e.target)) {
        triggerMediaToolbar("focusin", e.target);
      }
    }

    function onPreKeyDown(e) {
      if (!e || e.isTrusted === false || e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey) return;
      if (!isToolbarOn() || !isShortcutsOn() || isTyping(e, doc)) return;
      const k = typeof e.key === "string" ? e.key.toLowerCase() : "";
      const c = typeof e.code === "string" ? e.code : "";
      const isDefaultKey = (k === "d" || c === "KeyD") ||
        (k === "z" && !e.shiftKey && !e.altKey) ||
        (k === "c" && e.shiftKey && !e.altKey);
      if (!isDefaultKey && !hasCustomShortcuts(current.shortcuts)) return;
      const saved = {
        key: e.key, code: e.code, shiftKey: e.shiftKey, altKey: e.altKey,
        ctrlKey: e.ctrlKey, metaKey: e.metaKey, repeat: false, isTrusted: true,
        isComposing: false, defaultPrevented: false, target: e.target,
        composedPath: () => (typeof e.composedPath === "function" ? e.composedPath() : [e.target]),
        preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}
      };
      triggerMediaToolbar("keydown", saved);
    }

    function syncHoverPreTrigger() {
      if (!doc) return;
      const want = isToolbarOn() && !loader.isLoaded("mediaToolbar") && !loader.hasFailed("mediaToolbar");
      if (want && !hoverAttached) {
        hoverAttached = true;
        doc.addEventListener("mousemove", onPrePointerMove, { capture: true, passive: true });
        doc.addEventListener("focusin", onPreFocusIn, true);
        doc.addEventListener("keydown", onPreKeyDown, true);
        if (doc.documentElement) doc.documentElement.addEventListener("mouseleave", onPreLeave);
      } else if (!want && hoverAttached) {
        detachHoverPreTrigger();
      }
    }

    function detachContextPreTrigger() {
      if (!ctxAttached) return;
      ctxAttached = false;
      if (doc) doc.removeEventListener("contextmenu", onPreContextMenu, true);
      if (api && api.runtime && api.runtime.onMessage && typeof api.runtime.onMessage.removeListener === "function") {
        api.runtime.onMessage.removeListener(onPreContextMessage);
      }
    }

    function onPreContextMenu(e) {
      if (!e || e.isTrusted === false || !isContextMenuOn()) return;
      lastCtx = {
        isTrusted: true,
        clientX: Number(e.clientX),
        clientY: Number(e.clientY),
        button: e.button,
        target: e.target || null
      };
    }

    function onPreContextMessage(msg, sender, sendResponse) {
      if (!msg || typeof msg !== "object") return false;
      if (msg.type !== "iy:context-download" && msg.type !== "contextDownload") return false;
      if (loader.isLoaded("contextMenu")) return false;
      if (!isContextMenuOn()) return false;
      if (!sender || !api?.runtime?.id || sender.id !== api.runtime.id || sender.tab) return false;

      const snapshot = lastCtx;
      loader.load("contextMenu").then((ok) => {
        detachContextPreTrigger();
        if (!ok || !iy.contextMenu) {
          if (typeof sendResponse === "function") sendResponse({ ok: false, error: "load-failed" });
          return;
        }
        const ctrl = typeof iy.contextMenu.getController === "function" ? iy.contextMenu.getController() : null;
        if (snapshot && ctrl && typeof ctrl.onContextMenu === "function") {
          try { ctrl.onContextMenu(snapshot); } catch (_) {}
        }
        return Promise.resolve(iy.contextMenu.contextDownload(msg)).then(
          (res) => { if (typeof sendResponse === "function") sendResponse(res); },
          (err) => { if (typeof sendResponse === "function") sendResponse({ ok: false, error: (err && err.message) || "download-failed" }); }
        );
      });
      return true;
    }

    function syncContextPreTrigger() {
      const want = isContextMenuOn() && !loader.isLoaded("contextMenu") && !loader.hasFailed("contextMenu");
      if (want && !ctxAttached) {
        ctxAttached = true;
        if (doc) doc.addEventListener("contextmenu", onPreContextMenu, { capture: true, passive: true });
        if (api && api.runtime && api.runtime.onMessage && typeof api.runtime.onMessage.addListener === "function") {
          api.runtime.onMessage.addListener(onPreContextMessage);
        }
      } else if (!want && ctxAttached) {
        detachContextPreTrigger();
      }
    }

    function stopDomObserver() {
      if (domObsOff) { try { domObsOff(); } catch (_) {} domObsOff = null; }
    }

    function stopCommentsHover() {
      if (commentHoverAttached && doc) {
        commentHoverAttached = false;
        doc.removeEventListener("pointerover", onPreCommentOver, true);
      }
    }

    function onDomAdded(node) {
      if (!node || typeof node.querySelectorAll !== "function") return;
      if (watchAd) {
        if (loader.isLoaded("declutter") || loader.hasFailed("declutter")) {
          watchAd = false;
        } else {
          let hit = false;
          if (typeof node.matches === "function" && node.matches("article")) {
            hit = articleHasSponsoredLabel(node);
          }
          if (!hit) {
            const articles = node.querySelectorAll("article");
            for (let i = 0; i < articles.length; i++) {
              if (articleHasSponsoredLabel(articles[i])) { hit = true; break; }
            }
          }
          if (hit) {
            watchAd = false;
            loader.load("declutter");
          }
        }
      }
      if (watchCommentMedia) {
        if (loader.isLoaded("commentMedia") || loader.hasFailed("commentMedia")) {
          watchCommentMedia = false;
        } else if (hasCommentMediaCandidate(node)) {
          watchCommentMedia = false;
          loader.load("commentMedia");
        }
      }
      if (watchComments) {
        if (loader.isLoaded("comments") || loader.hasFailed("comments") || globalThis.__iyCommentsInstalled) {
          watchComments = false;
          stopCommentsHover();
        } else if (hasReplyControl(node)) {
          watchComments = false;
          stopCommentsHover();
          loader.load("comments");
        }
      }
      if (watchOp) {
        if (loader.isLoaded("opbadge") || loader.hasFailed("opbadge") || globalThis.__iyOpbadgeInstalled) {
          watchOp = false;
        } else if (hasOpCommentCandidate(node)) {
          watchOp = false;
          loader.load("opbadge");
        }
      }
      if (!watchAd && !watchCommentMedia && !watchComments && !watchOp) {
        stopDomObserver();
      }
    }

    function syncDomObserver() {
      const need = watchAd || watchCommentMedia || watchComments || watchOp;
      if (need && !domObsOff && typeof core.observe === "function") {
        domObsOff = core.observe((node) => !!node, onDomAdded);
      } else if (!need && domObsOff) {
        stopDomObserver();
      }
    }

    function syncDeclutterTrigger() {
      watchAd = false;
      if (loader.isLoaded("declutter") || loader.hasFailed("declutter")) return;
      if (hasNonAdDeclutter(current.ui)) {
        loader.load("declutter");
        return;
      }
      const adsOn = !current.cfg || current.cfg.ads !== false;
      if (!adsOn) return;
      if (doc && typeof doc.querySelectorAll === "function") {
        const articles = doc.querySelectorAll("article");
        for (let i = 0; i < articles.length; i++) {
          if (articleHasSponsoredLabel(articles[i])) {
            loader.load("declutter");
            return;
          }
        }
      }
      watchAd = true;
    }

    function onPreCommentOver(e) {
      if (!e || e.isTrusted === false) return;
      const t = e.target;
      if (!t || typeof t.closest !== "function") return;
      if (t.closest('span[dir="auto"], h1, [data-testid="post-caption"], #photo-caption')) {
        watchComments = false;
        stopCommentsHover();
        syncDomObserver();
        loader.load("comments").then((ok) => {
          if (ok && t && t.isConnected !== false && typeof iy.commentsInspect === "function") {
            try { iy.commentsInspect(t); } catch (_) {}
          }
        });
      }
    }

    function syncCommentsTrigger() {
      watchComments = false;
      const on = !(current.ui && current.ui.commentCopy === false);
      if (!on || loader.isLoaded("comments") || loader.hasFailed("comments") || globalThis.__iyCommentsInstalled) {
        stopCommentsHover();
        return;
      }
      if (doc && hasReplyControl(doc)) {
        stopCommentsHover();
        loader.load("comments");
        return;
      }
      watchComments = true;
      if (!commentHoverAttached && doc) {
        commentHoverAttached = true;
        doc.addEventListener("pointerover", onPreCommentOver, { capture: true, passive: true });
      }
    }

    function syncOpBadgeTrigger() {
      watchOp = false;
      const on = !(current.ui && current.ui.opBadge === false);
      if (!on || loader.isLoaded("opbadge") || loader.hasFailed("opbadge") || globalThis.__iyOpbadgeInstalled) return;
      if (doc && hasOpCommentCandidate(doc)) {
        loader.load("opbadge");
        return;
      }
      watchOp = true;
    }

    function syncCommentMediaTrigger() {
      watchCommentMedia = false;
      if (loader.isLoaded("commentMedia") || loader.hasFailed("commentMedia") || !isCommentGifOn()) return;
      if (doc && hasCommentMediaCandidate(doc)) {
        loader.load("commentMedia");
        return;
      }
      watchCommentMedia = true;
    }

    function evaluate() {
      const ui = current.ui || {};
      const cfg = current.cfg || {};
      const route = classifyRoute(loc.pathname);
      const kind = route.kind;

      // Options-only settings catalogue: load only when custom shortcut overrides exist.
      if (hasCustomShortcuts(current.shortcuts) && !iy.settingsSchema && !loader.isLoaded("settingsSchema")) {
        loader.load("settingsSchema").then((ok) => {
          if (ok && typeof core.republish === "function") core.republish("shortcuts");
        });
      }

      // Setting-gated features that run regardless of route when turned ON (all default OFF).
      if (ui.keepUnsent === true) loader.load("dmArchive");
      if (ui.noDoubleTap === true) loader.load("noDoubleTap");
      if (ui.directLinks === true) loader.load("directLinks");
      if (ui.audioMp3 === true) loader.load("saveSound");
      if (hasFocusCssOpts(ui)) loader.load("focus");
      if (ui.exactDates === true) loader.load("dates");
      if (ui.seenPosts === true) loader.load("seenposts");

      // Route-gated features (setting ON + matching route).
      if (kind === "profile") {
        if (ui.followsBadge !== false) loader.load("followBadge");
        if (ui.bulkProfile === true || ui.bulkSaved === true) loader.load("bulkDownload");
        if (ui.unfollowers === true || ui.unfollowQueue === true) loader.load("unfollowers");
      }
      if (kind === "profile" || kind === "explore") {
        if (ui.hoverZoom === true) loader.load("hoverzoom");
      }
      if (kind === "story") {
        if (ui.storyDetails !== false) loader.load("storyDetails");
        if (ui.storyNoAdvance === true) loader.load("storyNoAdvance");
      }
      if (kind === "reels") {
        if (cfg.ads !== false) loader.load("reelAds");
      }
      if (kind === "reels" || kind === "reel") {
        if (ui.reelCounter === true) loader.load("reelCounter");
      }
      if (kind === "direct") {
        if (cfg.ghostDm !== false) loader.load("dmread");
        if (ui.voiceDownload === true) loader.load("dmTools");
      }
      if (needsFocusLimit(ui, kind)) {
        loader.load("focusLimit");
      }

      // Lightweight event/DOM pre-triggers for default-ON features.
      syncHoverPreTrigger();
      syncContextPreTrigger();
      syncDeclutterTrigger();
      syncCommentMediaTrigger();
      syncCommentsTrigger();
      syncOpBadgeTrigger();
      syncDomObserver();
    }

    core.feature("lazyTriggers", {
      keys: ["cfg", "ui", "shortcuts"],
      enabled: () => true,
      start(settings) {
        current = settings || {};
        if (typeof core.route === "function") {
          core.route(() => {
            lastCtx = null;
            evaluate();
          });
        }
        evaluate();
      },
      update(settings) {
        current = settings || {};
        evaluate();
      },
      stop() {
        detachHoverPreTrigger();
        detachContextPreTrigger();
        watchAd = false;
        watchCommentMedia = false;
        watchComments = false;
        watchOp = false;
        stopDomObserver();
        stopCommentsHover();
      }
    });

    return { evaluate };
  }

  const exported = {
    MESSAGE_LOAD,
    BUNDLES,
    classifyRoute,
    hasCustomShortcuts,
    hasNonAdDeclutter,
    needsFocusLimit,
    articleHasSponsoredLabel,
    hasCommentMediaCandidate,
    createLazyLoader,
    installProxies,
    attachTriggers
  };

  if (isNode) {
    module.exports = exported;
  } else {
    const iy = globalThis.IY = globalThis.IY || {};
    const loader = createLazyLoader();
    installProxies(iy, loader);
    if (iy.core) {
      iy.core.lazy = loader;
      attachTriggers(iy, loader);
      if (typeof iy.core.onHealthTab === "function") iy.core.onHealthTab(() => { loader.load("health"); });
    }
  }
})();
