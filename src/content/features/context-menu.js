// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
// Content-script side of the "InstHush ile indir" right-click context menu entry.
// Records the media element under the right-click point (reusing src/content/core/hover.js)
// even when covered by Instagram's transparent overlay divs, and answers the background's download request.
(function () {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;

  var MESSAGE_CONTEXT_DOWNLOAD = "iy:context-download";
  var LEGACY_MESSAGE_CONTEXT_DOWNLOAD = "contextDownload";

  var STRINGS = {
    tr: {
      toastNoMediaUnderCursor: "İmlecin altında indirilecek Instagram medyası bulunamadı.",
      toastStarted: "İndirme başladı.",
      toastError: "İndirilemedi."
    },
    en: {
      toastNoMediaUnderCursor: "No Instagram media found under the cursor.",
      toastStarted: "Download started.",
      toastError: "Download failed."
    }
  };

  function fallbackText(key, lang) {
    var l = String(lang || "").trim().toLowerCase();
    var table = l.indexOf("en") === 0 ? STRINGS.en : STRINGS.tr;
    return table[key] || STRINGS.tr[key] || STRINGS.en[key] || "";
  }

  function getHover(deps) {
    if (deps && deps.hover) return deps.hover;
    var iy = globalThis.IY;
    if (iy && iy.hover) return iy.hover;
    if (isNode) {
      try { return require("../core/hover.js"); } catch (_) {}
    }
    return null;
  }

  function getActions(deps) {
    if (deps && deps.actions) return deps.actions;
    var iy = globalThis.IY;
    if (iy && iy.actions) return iy.actions;
    if (isNode) {
      try { return require("../core/actions.js"); } catch (_) {}
    }
    return null;
  }

  function getShadow(deps) {
    if (deps && deps.shadow) return deps.shadow;
    var iy = globalThis.IY;
    if (iy && iy.shadow) return iy.shadow;
    if (isNode) {
      try { return require("../ui/shadow.js"); } catch (_) {}
    }
    return null;
  }

  function getDownload(deps) {
    if (deps && deps.download) return deps.download;
    var iy = globalThis.IY;
    if (iy && iy.download) return iy.download;
    if (isNode) {
      try { return require("../core/download.js"); } catch (_) {}
    }
    return null;
  }

  function getMediaLib(deps) {
    if (deps && deps.media) return deps.media;
    var iy = globalThis.IY;
    if (iy && typeof iy.isAllowedCdn === "function") return iy;
    if (isNode) {
      try { return require("../../lib/media.js"); } catch (_) {}
    }
    return iy || null;
  }

  function getFilenameLib(deps) {
    if (deps && deps.filename) return deps.filename;
    var iy = globalThis.IY;
    if (iy && iy.filename) return iy.filename;
    if (isNode) {
      try { return require("../../lib/filename.js"); } catch (_) {}
    }
    return null;
  }

  function isContextMenuEnabled(cfg, ui) {
    if (ui && typeof ui === "object" && ui.contextMenu === false) return false;
    if (cfg && typeof cfg === "object" && cfg.contextMenu === false) return false;
    return true;
  }

  function isAllowedDirectMediaUrl(url, mediaLib) {
    const lib = mediaLib || getMediaLib();
    return !!lib?.isAllowedCdn?.(url);
  }

  function extFromDirectUrl(url, fallback) {
    if (typeof url === "string" && url) {
      try {
        var pathname = new URL(url, "https://www.instagram.com/").pathname;
        var m = /\.(jpe?g|png|webp|gif|mp4|m4v|mov|m4a)(?:$|[?#])/i.exec(pathname);
        if (m) {
          var ext = m[1].toLowerCase();
          return ext === "jpeg" ? "jpg" : ext;
        }
      } catch (_) {}
    }
    return fallback || "jpg";
  }

  function findMediaAtPoint(x, y, doc, hv, pathname) {
    if (!doc || typeof doc.elementsFromPoint !== "function" || !hv) return null;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    var route = typeof hv.parseRoute === "function" ? hv.parseRoute(pathname) : { kind: "other" };
    var stack = doc.elementsFromPoint(x, y) || [];

    // 1. Direct media element in the hit stack (checks size, overflow clipping, top layer, non-call, non-own-UI).
    for (var i = 0; i < stack.length; i++) {
      var el = stack[i];
      if (!el || el.isConnected === false) continue;
      if (typeof hv.isMedia === "function" && hv.isMedia(el, { x: x, y: y, route: route, pathname: pathname })) {
        return el;
      }
      // Also allow right-clicking a comment GIF on the top layer.
      if (typeof hv.isCommentGif === "function" && hv.isCommentGif(el)) {
        if (typeof hv.isOnTopLayer !== "function" || hv.isOnTopLayer(el)) {
          return el;
        }
      }
    }

    // 2. Transparent overlay wrapper above a post, dialog, story, or profile header.
    var limit = Math.min(stack.length, 4);
    var checkedScope = null;
    for (var j = 0; j < limit; j++) {
      var node = stack[j];
      if (!node || typeof node.closest !== "function") continue;
      var scope = node.closest('article, [role="dialog"], div[role="dialog"], [role="presentation"], header, main');
      if (!scope || scope === checkedScope || typeof scope.querySelectorAll !== "function") continue;
      checkedScope = scope;
      var candidates = scope.querySelectorAll("video, img");
      var best = null;
      var bestArea = Infinity;
      for (var k = 0; k < candidates.length; k++) {
        var cand = candidates[k];
        if (!cand || cand.isConnected === false) continue;
        if (typeof hv.isMedia === "function" && hv.isMedia(cand, { x: x, y: y, route: route, pathname: pathname })) {
          var rect = typeof hv.visibleRect === "function" ? hv.visibleRect(cand) : cand.getBoundingClientRect();
          var area = (rect.width || 0) * (rect.height || 0);
          var isVid = typeof hv.isVideoEl === "function" ? hv.isVideoEl(cand) : cand.tagName === "VIDEO";
          if (area < bestArea || (area === bestArea && isVid)) {
            bestArea = area;
            best = cand;
          }
        }
      }
      if (best) return best;
    }

    return null;
  }

  function findMediaForElement(targetEl, doc, hv, pathname) {
    if (!targetEl || !hv) return null;
    var route = typeof hv.parseRoute === "function" ? hv.parseRoute(pathname) : { kind: "other" };
    if (typeof hv.isMedia === "function" && hv.isMedia(targetEl, { route: route, pathname: pathname })) {
      return targetEl;
    }
    if (typeof hv.isCommentGif === "function" && hv.isCommentGif(targetEl)) {
      if (typeof hv.isOnTopLayer !== "function" || hv.isOnTopLayer(targetEl)) return targetEl;
    }
    if (typeof targetEl.closest === "function") {
      var scope = targetEl.closest('article, [role="dialog"], div[role="dialog"], header');
      if (scope && typeof scope.querySelectorAll === "function") {
        var list = scope.querySelectorAll("video, img");
        for (var i = 0; i < list.length; i++) {
          var cand = list[i];
          if (typeof hv.isMedia === "function" && hv.isMedia(cand, { route: route, pathname: pathname })) {
            return cand;
          }
        }
      }
    }
    return null;
  }

  function createController(deps) {
    var d = deps || {};
    var enabled = false;
    var lastTarget = null;
    var cleanups = [];

    function getDoc() {
      return d.document || (typeof document !== "undefined" ? document : null);
    }

    function getLoc() {
      return d.location || (typeof location !== "undefined" ? location : { pathname: "/", href: "" });
    }

    function getNavLang() {
      if (d.lang) return d.lang;
      if (typeof navigator !== "undefined" && navigator && navigator.language) return navigator.language;
      var doc = getDoc();
      if (doc && doc.documentElement && typeof doc.documentElement.lang === "string" && doc.documentElement.lang) {
        return doc.documentElement.lang;
      }
      return "tr";
    }

    function t(key) {
      try {
        var chromeApi = d.chrome || (typeof chrome !== "undefined" ? chrome : null);
        if (chromeApi && chromeApi.i18n && typeof chromeApi.i18n.getMessage === "function") {
          var msg = chromeApi.i18n.getMessage(key);
          if (msg) return msg;
        }
      } catch (_) {}
      return fallbackText(key, getNavLang());
    }

    function notify(message, ms) {
      var sh = getShadow(d);
      if (sh && typeof sh.showToast === "function") {
        sh.showToast(message, ms);
      }
      return message;
    }

    function applyTheme(settings) {
      var sh = getShadow(d);
      var ui = settings && settings.ui;
      if (!sh || !ui) return;
      if (typeof ui.theme === "string" && typeof sh.setTheme === "function") sh.setTheme(ui.theme);
      if (typeof ui.animations === "boolean" && typeof sh.setMotion === "function") sh.setMotion(ui.animations);
    }

    function onContextMenu(e) {
      if (!enabled || !e || e.isTrusted === false) return;
      var hv = getHover(d);
      var doc = getDoc();
      if (!hv || !doc) return;

      var pathname = getLoc().pathname;
      var x = Number(e.clientX);
      var y = Number(e.clientY);
      var hasCoords = Number.isFinite(x) && Number.isFinite(y) && !(x === 0 && y === 0 && e.button === 0);
      var media = null;

      if (hasCoords) {
        media = findMediaAtPoint(x, y, doc, hv, pathname);
      }
      if (!media && e.target) {
        media = findMediaForElement(e.target, doc, hv, pathname);
      }
      lastTarget = media || null;
    }

    function classifyElement(el) {
      if (!el || el.isConnected === false) return null;
      var hv = getHover(d);
      var pathname = getLoc().pathname;
      var route = hv && typeof hv.parseRoute === "function" ? hv.parseRoute(pathname) : { kind: "other" };

      if (hv && typeof hv.isCommentGif === "function" && hv.isCommentGif(el)) {
        var gifUrl = el.currentSrc || el.src || (typeof el.getAttribute === "function" ? el.getAttribute("src") : "");
        if (gifUrl) return { kind: "commentGif", el: el, url: gifUrl };
      }

      var ctx = hv && typeof hv.contextFor === "function" ? hv.contextFor(el, route) : null;
      if (ctx) {
        // An <article> without a shortcode cannot be looked up via shortcode API unless it has one.
        if ((ctx.kind === "post" || ctx.kind === "reel") && !ctx.shortcode) {
          var directSrc = el.currentSrc || el.src || (typeof el.getAttribute === "function" ? el.getAttribute("src") : "");
          if (route.kind === "direct" && directSrc) {
            return {
              kind: "dmMedia",
              el: el,
              mediaType: (hv && hv.isVideoEl && hv.isVideoEl(el)) || el.tagName === "VIDEO" ? "video" : "image",
              url: directSrc
            };
          }
          return null;
        }
        return ctx;
      }

      if (route.kind === "direct") {
        var dmSrc = el.currentSrc || el.src || (typeof el.getAttribute === "function" ? el.getAttribute("src") : "");
        if (dmSrc) {
          return {
            kind: "dmMedia",
            el: el,
            mediaType: (hv && hv.isVideoEl && hv.isVideoEl(el)) || el.tagName === "VIDEO" ? "video" : "image",
            url: dmSrc
          };
        }
      }
      return null;
    }

    function resolveFromMessageHint(msg) {
      if (!msg || typeof msg !== "object") return null;
      var hv = getHover(d);
      var doc = getDoc();
      var pathname = getLoc().pathname;
      var route = hv && typeof hv.parseRoute === "function" ? hv.parseRoute(pathname) : { kind: "other" };

      if (typeof msg.srcUrl === "string" && msg.srcUrl && doc && typeof doc.querySelectorAll === "function") {
        var nodes = doc.querySelectorAll("video, img");
        for (var i = 0; i < nodes.length; i++) {
          var cand = nodes[i];
          if (!cand || cand.isConnected === false) continue;
          var src = cand.currentSrc || cand.src || (typeof cand.getAttribute === "function" ? cand.getAttribute("src") : "");
          if (src === msg.srcUrl) {
            if (!hv || typeof hv.isOnTopLayer !== "function" || hv.isOnTopLayer(cand)) {
              var found = classifyElement(cand);
              if (found) return found;
            }
          }
        }
      }

      if (typeof msg.linkUrl === "string" && msg.linkUrl && hv && typeof hv.shortcodeFromHref === "function") {
        var sc = hv.shortcodeFromHref(msg.linkUrl);
        if (sc) {
          var isReel = /\/reels?\//.test(msg.linkUrl);
          return { kind: isReel ? "reel" : "post", shortcode: sc, el: null, username: route.username };
        }
      }
      return null;
    }

    async function downloadDirectUrl(url, filename) {
      var mediaLib = getMediaLib(d);
      if (!isAllowedDirectMediaUrl(url, mediaLib)) {
        notify(t("toastError"), 4000);
        return { ok: false, error: "invalid-url" };
      }

      if (typeof d.sendDownload === "function") {
        var customRes = await d.sendDownload({ url: url, filename: filename });
        var customOk = Boolean(customRes && customRes.ok !== false);
        notify(customOk ? t("toastStarted") : t("toastError"), customOk ? 2800 : 4000);
        return { ok: customOk };
      }

      var dlMod = getDownload(d);
      if (dlMod && typeof dlMod.createDownloadJob === "function") {
        var job = dlMod.createDownloadJob([{ url: url, filename: filename }], {
          mode: "separate",
          isAllowedCdn: function (u) { return isAllowedDirectMediaUrl(u, mediaLib); }
        });
        var res = await job.start();
        notify(res && res.ok ? t("toastStarted") : t("toastError"), res && res.ok ? 2800 : 4000);
        return { ok: Boolean(res && res.ok), result: res };
      }

      var chromeApi = d.chrome || (typeof chrome !== "undefined" ? chrome : null);
      if (chromeApi && chromeApi.runtime && typeof chromeApi.runtime.sendMessage === "function") {
        var ok = await new Promise(function (resolve) {
          try {
            var settled = false;
            var finish = function (reply) {
              if (settled) return;
              settled = true;
              var err = chromeApi.runtime && chromeApi.runtime.lastError;
              resolve(!err && Boolean(reply && reply.ok === true));
            };
            var p = chromeApi.runtime.sendMessage({ type: "iy:download", url: url, filename: filename }, finish);
            if (p && typeof p.then === "function") {
              p.then(finish, function () { finish({ ok: false }); });
            }
          } catch (_) {
            resolve(false);
          }
        });
        notify(ok ? t("toastStarted") : t("toastError"), ok ? 2800 : 4000);
        return { ok: ok };
      }

      notify(t("toastError"), 4000);
      return { ok: false, error: "runtime-unavailable" };
    }

    async function contextDownload(msg) {
      var hv = getHover(d);
      var actMod = getActions(d);

      var targetEl = (lastTarget && lastTarget.isConnected !== false) ? lastTarget : null;
      lastTarget = null;

      if (!targetEl && hv && typeof hv.getHovered === "function") {
        var hovered = hv.getHovered();
        if (hovered && hovered.el && hovered.el.isConnected !== false) {
          targetEl = hovered.el;
        }
      }

      var ctx = targetEl ? classifyElement(targetEl) : null;
      if (!ctx) {
        ctx = resolveFromMessageHint(msg);
      }

      if (!ctx) {
        notify(t("toastNoMediaUnderCursor"), 3600);
        return { ok: false, error: "no-media" };
      }

      if (ctx.kind === "dmMedia") {
        var mediaLib = getMediaLib(d);
        var ext = mediaLib && typeof mediaLib.dmExt === "function"
          ? mediaLib.dmExt(ctx.mediaType, ctx.url)
          : extFromDirectUrl(ctx.url, ctx.mediaType === "video" ? "mp4" : "jpg");
        var dmName = mediaLib && typeof mediaLib.buildDmFilename === "function"
          ? mediaLib.buildDmFilename(Math.floor(Date.now() / 1000), ext)
          : "dm_" + Date.now() + "." + ext;
        return await downloadDirectUrl(ctx.url, dmName);
      }

      if (ctx.kind === "commentGif") {
        var fnLib = getFilenameLib(d);
        var gifExt = extFromDirectUrl(ctx.url, "gif");
        var gifName = fnLib && typeof fnLib.renderFilename === "function"
          ? fnLib.renderFilename("InstHush/Comments/{user}_gif_{date}_{time}", {
              user: "comment",
              shortcode: "",
              index: 1,
              id: "",
              takenAt: Math.floor(Date.now() / 1000),
              type: "gif",
              ext: gifExt
            })
          : "comment_gif_" + Date.now() + "." + gifExt;
        return await downloadDirectUrl(ctx.url, gifName);
      }

      if (!actMod) {
        notify(t("toastError"), 4000);
        return { ok: false, error: "actions-unavailable" };
      }

      try {
        if (ctx.kind === "avatar" && typeof actMod.downloadAvatar === "function") {
          var avRes = await actMod.downloadAvatar(ctx.username || ctx);
          return { ok: true, kind: "avatar", result: avRes };
        }
        var res = await actMod.downloadOne(ctx);
        return { ok: true, kind: ctx.kind, result: res };
      } catch (err) {
        return { ok: false, error: (err && err.message) || "download-failed" };
      }
    }

    function onRuntimeMessage(msg, sender, sendResponse) {
      if (!enabled || !msg || typeof msg !== "object") return false;
      if (msg.type !== MESSAGE_CONTEXT_DOWNLOAD && msg.type !== LEGACY_MESSAGE_CONTEXT_DOWNLOAD) {
        return false;
      }
      var chromeApi = d.chrome || (typeof chrome !== "undefined" ? chrome : null);
      if (!sender || !chromeApi?.runtime?.id || sender.id !== chromeApi.runtime.id || sender.tab) {
        return false;
      }
      Promise.resolve(contextDownload(msg)).then(
        function (res) {
          if (typeof sendResponse === "function") sendResponse(res);
        },
        function (err) {
          if (typeof sendResponse === "function") {
            sendResponse({ ok: false, error: (err && err.message) || "download-failed" });
          }
        }
      );
      return true;
    }

    function onRouteChange() {
      lastTarget = null;
    }

    function start(settings) {
      var s = settings || {};
      if (!isContextMenuEnabled(s.cfg, s.ui)) return;
      applyTheme(s);
      if (enabled) return;
      enabled = true;

      var doc = getDoc();
      if (doc && typeof doc.addEventListener === "function") {
        doc.addEventListener("contextmenu", onContextMenu, true);
        cleanups.push(function () {
          doc.removeEventListener("contextmenu", onContextMenu, true);
        });
      }

      var chromeApi = d.chrome || (typeof chrome !== "undefined" ? chrome : null);
      if (chromeApi && chromeApi.runtime && chromeApi.runtime.onMessage &&
          typeof chromeApi.runtime.onMessage.addListener === "function") {
        chromeApi.runtime.onMessage.addListener(onRuntimeMessage);
        cleanups.push(function () {
          if (chromeApi.runtime.onMessage && typeof chromeApi.runtime.onMessage.removeListener === "function") {
            chromeApi.runtime.onMessage.removeListener(onRuntimeMessage);
          }
        });
      }

      var iy = globalThis.IY;
      if (iy && iy.core && typeof iy.core.route === "function") {
        var offRoute = iy.core.route(onRouteChange);
        if (typeof offRoute === "function") cleanups.push(offRoute);
      }
    }

    function update(settings) {
      var s = settings || {};
      applyTheme(s);
      var shouldEnable = isContextMenuEnabled(s.cfg, s.ui);
      if (shouldEnable && !enabled) start(s);
      else if (!shouldEnable && enabled) stop();
    }

    function stop() {
      enabled = false;
      lastTarget = null;
      while (cleanups.length) {
        var fn = cleanups.pop();
        try { fn(); } catch (_) {}
      }
    }

    return {
      start: start,
      update: update,
      stop: stop,
      contextDownload: contextDownload,
      onContextMenu: onContextMenu,
      onRuntimeMessage: onRuntimeMessage,
      isEnabled: function () { return enabled; },
      getLastTarget: function () { return lastTarget; },
      setLastTarget: function (el) { lastTarget = el || null; }
    };
  }

  var defaultController = null;

  function registerFeature(core, deps) {
    var iyCore = core || (globalThis.IY && globalThis.IY.core);
    if (!iyCore || typeof iyCore.feature !== "function") return null;
    if (!defaultController) defaultController = createController(deps);
    iyCore.feature("contextMenu", {
      keys: ["cfg", "ui"],
      enabled: function (settings) {
        return isContextMenuEnabled(settings && settings.cfg, settings && settings.ui);
      },
      start: function (settings) {
        defaultController.start(settings);
      },
      update: function (settings) {
        defaultController.update(settings);
      },
      stop: function () {
        defaultController.stop();
      }
    });
    return defaultController;
  }

  var api = {
    MESSAGE_CONTEXT_DOWNLOAD: MESSAGE_CONTEXT_DOWNLOAD,
    LEGACY_MESSAGE_CONTEXT_DOWNLOAD: LEGACY_MESSAGE_CONTEXT_DOWNLOAD,
    STRINGS: STRINGS,
    fallbackText: fallbackText,
    isContextMenuEnabled: isContextMenuEnabled,
    findMediaAtPoint: findMediaAtPoint,
    findMediaForElement: findMediaForElement,
    createController: createController,
    registerFeature: registerFeature,
    contextDownload: function (msg) {
      if (!defaultController) defaultController = createController();
      return defaultController.contextDownload(msg);
    },
    getController: function () { return defaultController; }
  };

  globalThis.IY = globalThis.IY || {};
  globalThis.IY.contextMenu = api;

  if (globalThis.IY.core && typeof globalThis.IY.core.feature === "function") {
    registerFeature(globalThis.IY.core);
  }

  if (isNode) {
    module.exports = api;
  }
})();
