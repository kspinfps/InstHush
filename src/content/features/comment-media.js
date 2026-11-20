// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
// Save GIFs, stickers, and images posted in Instagram comments.
// Adds a native-styled "GIF’i kaydet" / "Save GIF" action in the comment's action line,
// renders filenames via src/lib/filename.js, and cleans up completely when switched off.
(function () {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;

  var ACTION_CLASS = "iy-comment-media";
  var COPY_CLASS = "iy-comment-copy";
  var COMMENT_GIF_HOST = "fbsbx.com";
  var MAX_ROW_WALK = 10;
  var SCAN_THROTTLE_MS = 120;

  var RESERVED_ROUTES = new Set([
    "accounts", "explore", "direct", "about", "developer", "legal", "emails",
    "challenge", "stories", "reels", "reel", "p", "tv", "web", "session",
    "privacy", "terms", "press", "api", "graphql", "oauth", "nametag", "lite",
    "your_activity", "notifications", "threads", "directory", "locations",
    "create", "login", "signup", "help", "ads", "business", "static", "download"
  ]);

  var STRINGS = {
    tr: {
      commentSaveGif: "GIF’i kaydet",
      toastGifSaving: "GIF kaydediliyor.",
      toastGifError: "İndirilemedi."
    },
    en: {
      commentSaveGif: "Save GIF",
      toastGifSaving: "Saving GIF.",
      toastGifError: "Download failed."
    }
  };

  var ownActions = new WeakSet();

  function fallbackText(key, lang) {
    var l = String(lang || "").trim().toLowerCase();
    var table = l.indexOf("en") === 0 ? STRINGS.en : STRINGS.tr;
    return table[key] || STRINGS.tr[key] || STRINGS.en[key] || "";
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

  function getFilenameLib(deps) {
    if (deps && deps.filename) return deps.filename;
    var iy = globalThis.IY;
    if (iy && iy.filename && typeof iy.filename.renderFilename === "function") return iy.filename;
    if (isNode) {
      try { return require("../../lib/filename.js"); } catch (_) {}
    }
    return null;
  }

  function getResolveLib(deps) {
    if (deps && deps.resolve) return deps.resolve;
    var iy = globalThis.IY;
    if (iy && iy.resolve) return iy.resolve;
    if (isNode) {
      try { return require("../core/resolve.js"); } catch (_) {}
    }
    return null;
  }

  function getDownloadLib(deps) {
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

  function isCommentMediaEnabled(cfg, ui) {
    if (ui && typeof ui === "object") {
      if (ui.commentGif === false || ui.commentMedia === false) return false;
    }
    if (cfg && typeof cfg === "object") {
      if (cfg.commentGif === false || cfg.commentMedia === false) return false;
    }
    return true;
  }

  function isImageEl(el) {
    if (!el || typeof el !== "object") return false;
    if (typeof HTMLImageElement !== "undefined" && el instanceof HTMLImageElement) return true;
    return typeof el.tagName === "string" && el.tagName.toUpperCase() === "IMG";
  }

  function hasClass(el, cls) {
    if (!el) return false;
    if (el.classList && typeof el.classList.contains === "function" && el.classList.contains(cls)) {
      return true;
    }
    if (typeof el.className === "string" && el.className) {
      return (" " + el.className + " ").indexOf(" " + cls + " ") !== -1;
    }
    return false;
  }

  function isOwnAction(el) {
    if (!el || typeof el !== "object") return false;
    if (ownActions.has(el)) return true;
    return hasClass(el, ACTION_CLASS) || hasClass(el, COPY_CLASS);
  }

  function getImageSrc(el) {
    if (!el || typeof el !== "object") return "";
    return el.currentSrc || el.src || (typeof el.getAttribute === "function" ? el.getAttribute("src") : "") || "";
  }

  function isAllowedCommentMediaUrl(url, mediaLib) {
    const lib = mediaLib || getMediaLib();
    return !!lib?.isAllowedCdn?.(url);
  }

  function isCommentGif(el) {
    if (!isImageEl(el)) return false;
    if (typeof el.closest === "function" && el.closest("a")) return false;
    var src = getImageSrc(el);
    if (typeof src !== "string" || !src) return false;
    try {
      var parsed = new URL(src, "https://www.instagram.com/");
      if (!isAllowedCommentMediaUrl(src)) return false;
      var host = parsed.hostname.toLowerCase();
      return host === COMMENT_GIF_HOST || host.endsWith("." + COMMENT_GIF_HOST);
    } catch (_) {
      return false;
    }
  }

  function isPostBoundary(el) {
    if (!el || typeof el !== "object") return false;
    var tag = typeof el.tagName === "string" ? el.tagName.toUpperCase() : "";
    if (tag === "ARTICLE" || tag === "MAIN" || tag === "SECTION" || tag === "BODY" || tag === "HTML") {
      return true;
    }
    var role = typeof el.getAttribute === "function" ? el.getAttribute("role") : "";
    return role === "dialog" || role === "main";
  }

  function isCommentMedia(el, mediaLib) {
    if (isCommentGif(el)) return true;
    if (!isImageEl(el)) return false;
    if (typeof el.closest === "function" && el.closest("a, header")) return false;
    var src = getImageSrc(el);
    if (!isAllowedCommentMediaUrl(src, mediaLib)) return false;
    var row = commentRow(el);
    if (!row || typeof row.querySelectorAll !== "function") return false;
    // In a comment with an inline sticker/image, the row has 1 avatar (a img) and 1 comment media img.
    var allImgs = row.querySelectorAll("img");
    var avatarImgs = row.querySelectorAll("a img");
    return avatarImgs.length === 1 && allImgs.length === 2;
  }

  function isEllipsisText(text) {
    return /^(?:…|⋯|\.{3})$/.test(String(text || "").trim());
  }

  function extractText(node) {
    if (!node) return "";
    if (typeof node.textContent === "string" && node.textContent) return node.textContent;
    if (node.nodeType === 3) return node.nodeValue || "";
    var out = "";
    var kids = node.childNodes || node.children || [];
    for (var i = 0; i < kids.length; i++) {
      if (typeof kids[i] === "string") out += kids[i];
      else out += extractText(kids[i]);
    }
    return out;
  }

  /**
   * The "12 likes · Reply · See translation" line: the parent holding the most text-only buttons
   * (no icon, not our own injected actions, not the "…" options menu) in the comment row.
   */
  function actionLineItem(row) {
    if (!row || typeof row.querySelectorAll !== "function") return null;
    var rawButtons = row.querySelectorAll('[role="button"], button');
    var byParent = new Map();

    for (var i = 0; i < rawButtons.length; i++) {
      var b = rawButtons[i];
      if (!b || isOwnAction(b)) continue;
      if (typeof b.querySelector === "function" && b.querySelector("svg, img")) continue;
      var txt = extractText(b).trim();
      if (!txt || isEllipsisText(txt)) continue;
      var parent = b.parentElement || b.parentNode;
      if (!parent) continue;
      var group = byParent.get(parent);
      if (!group) {
        group = [];
        byParent.set(parent, group);
      }
      group.push(b);
    }

    var best = [];
    byParent.forEach(function (group) {
      if (group.length > best.length) best = group;
    });
    return best.length ? best[best.length - 1] : null;
  }

  /**
   * Smallest ancestor holding the whole comment: the commenter's avatar link (`a img`)
   * and the action line (`likes · Reply`). Stops before swallowing a neighbouring comment.
   */
  function commentRow(media) {
    if (!media || typeof media !== "object") return null;
    var cur = media;
    for (var i = 0; i < MAX_ROW_WALK && cur.parentElement; i++) {
      cur = cur.parentElement;
      if (isPostBoundary(cur)) return null;
      if (typeof cur.querySelectorAll !== "function") continue;
      var avatars = cur.querySelectorAll("a img").length;
      if (avatars > 1) return null;
      if (avatars === 1 && actionLineItem(cur)) return cur;
    }
    return null;
  }

  function commenter(row) {
    if (!row || typeof row.querySelectorAll !== "function") return "unknown";
    var links = row.querySelectorAll('a[href^="/"]');
    for (var i = 0; i < links.length; i++) {
      var rawHref = typeof links[i].getAttribute === "function" ? links[i].getAttribute("href") : links[i].href;
      if (typeof rawHref !== "string" || !rawHref) continue;
      var clean = rawHref.split(/[?#]/)[0];
      var parts = clean.split("/").filter(Boolean);
      if (parts.length === 1 && /^[A-Za-z0-9._]{1,30}$/.test(parts[0]) && !RESERVED_ROUTES.has(parts[0].toLowerCase())) {
        return parts[0];
      }
    }
    return "unknown";
  }

  function extFromMediaUrl(url, fallback, deps) {
    var resLib = getResolveLib(deps);
    if (resLib && typeof resLib.extFromUrl === "function") {
      return resLib.extFromUrl(url, fallback || "gif");
    }
    if (typeof url === "string" && url) {
      try {
        var pathname = new URL(url, "https://www.instagram.com/").pathname;
        var m = /\.(gif|webp|jpe?g|png|mp4)(?:$|[?#])/i.exec(pathname);
        if (m) {
          var ext = m[1].toLowerCase();
          return ext === "jpeg" ? "jpg" : ext;
        }
      } catch (_) {}
    }
    return fallback || "gif";
  }

  function extractRootFolder(template, defaultTemplate) {
    var tpl = typeof template === "string" && template.trim() ? template.trim() : defaultTemplate;
    if (typeof tpl !== "string" || tpl.indexOf("/") === -1) return "";
    var clean = tpl.replace(/^\/*[a-z]:/i, "");
    var parts = clean.split("/").filter(function (p) { return p && !/^[. ]+$/.test(p); });
    if (parts.length < 2) return "";
    var first = parts[0];
    if (/\{[a-z]+\}/i.test(first)) return "";
    return first;
  }

  function inRootFolder(subpath, template, defaultTemplate) {
    var root = extractRootFolder(template, defaultTemplate);
    var cleanSub = String(subpath || "").replace(/^\/+/, "");
    return root ? root + "/" + cleanSub : cleanSub;
  }

  function mediaFilename(user, url, options) {
    var opts = options || {};
    var fnLib = getFilenameLib(opts);
    var defaultTpl = (fnLib && fnLib.DEFAULT_TEMPLATE) || "InstHush/{user}/{user}_{date}_{shortcode}_{index}";
    var userTpl = typeof opts.template === "string" && opts.template.trim() ? opts.template.trim() : defaultTpl;
    var cleanUser = typeof user === "string" && user.trim() ? user.trim() : "unknown";
    var ext = extFromMediaUrl(url, "gif", opts);
    var nowSec = Number.isFinite(opts.takenAt) && opts.takenAt > 0
      ? opts.takenAt
      : Math.floor((typeof opts.now === "function" ? opts.now() : Date.now()) / 1000);

    var commentTpl = inRootFolder("Comments/{user}_gif_{date}_{time}", userTpl, defaultTpl);
    if (fnLib && typeof fnLib.renderFilename === "function") {
      return fnLib.renderFilename(commentTpl, {
        user: cleanUser,
        shortcode: "",
        index: 1,
        id: "",
        takenAt: nowSec,
        type: "gif",
        ext: ext
      }, { dateFormat: opts.dateFormat || "YYYY-MM-DD" });
    }
    return "InstHush/Comments/" + cleanUser.replace(/[^\w.-]/g, "_") + "_gif." + ext;
  }

  function replaceDeepestText(node, text) {
    if (!node) return;
    if (!node.children || node.children.length === 0) {
      node.textContent = text;
      return;
    }
    var replaced = false;
    function walk(n) {
      var kids = n && (n.childNodes && n.childNodes.length ? n.childNodes : n.children);
      if (!kids || !kids.length) return;
      for (var i = 0; i < kids.length; i++) {
        var child = kids[i];
        if (!child) continue;
        if (child.nodeType === 3) {
          var nextVal = !replaced ? text : "";
          replaced = true;
          if ("data" in child) child.data = nextVal;
          if ("nodeValue" in child) child.nodeValue = nextVal;
          if ("textContent" in child) child.textContent = nextVal;
        } else if (child.nodeType === 1) {
          if (!child.children || child.children.length === 0) {
            child.textContent = !replaced ? text : "";
            replaced = true;
          } else {
            walk(child);
          }
        }
      }
    }
    walk(node);
    if (!replaced) {
      node.textContent = text;
    }
  }

  function makeCommentAction(template, opts, docOverride) {
    var o = opts || {};
    var text = String(o.text || "GIF’i kaydet");
    var label = String(o.label || text);
    var doc = docOverride || (template && template.ownerDocument) || (typeof document !== "undefined" ? document : null);
    var btn = null;

    if (template && typeof template.cloneNode === "function") {
      btn = template.cloneNode(true);
      replaceDeepestText(btn, text);
    } else if (doc && typeof doc.createElement === "function") {
      btn = doc.createElement(template && template.tagName ? template.tagName.toLowerCase() : "button");
      btn.textContent = text;
    } else {
      throw new Error("Cannot create comment action element");
    }

    ownActions.add(btn);
    if (btn.classList && typeof btn.classList.add === "function") {
      btn.classList.add(ACTION_CLASS);
    } else {
      btn.className = ((btn.className || "") + " " + ACTION_CLASS).trim();
    }

    if (typeof btn.removeAttribute === "function") {
      btn.removeAttribute("aria-describedby");
    }
    if (typeof btn.setAttribute === "function") {
      if (btn.tagName === "BUTTON") btn.setAttribute("type", "button");
      btn.setAttribute("role", "button");
      btn.setAttribute("tabindex", "0");
      btn.setAttribute("aria-label", label);
      btn.setAttribute("title", label);
    }

    var busy = false;
    var activate = function (e) {
      if (e) {
        if (e.isTrusted === false) return;
        if (typeof e.preventDefault === "function") e.preventDefault();
        if (typeof e.stopPropagation === "function") e.stopPropagation();
      }
      if (busy || typeof o.onActivate !== "function") return;
      busy = true;
      Promise.resolve(o.onActivate(e)).finally(function () {
        busy = false;
      });
    };

    if (typeof btn.addEventListener === "function") {
      btn.addEventListener("click", activate);
      btn.addEventListener("keydown", function (e) {
        if (e && (e.key === "Enter" || e.key === " ")) {
          activate(e);
        }
      });
    }

    return btn;
  }

  function insertAfter(anchor, node) {
    if (!anchor || !node) return false;
    if (typeof anchor.insertAdjacentElement === "function") {
      anchor.insertAdjacentElement("afterend", node);
      return true;
    }
    var parent = anchor.parentElement || anchor.parentNode;
    if (parent && typeof parent.insertBefore === "function") {
      parent.insertBefore(node, anchor.nextSibling || null);
      return true;
    }
    if (parent && typeof parent.appendChild === "function") {
      parent.appendChild(node);
      return true;
    }
    if (parent && typeof parent.append === "function") {
      parent.append(node);
      return true;
    }
    return false;
  }

  function createController(deps) {
    var d = deps || {};
    var enabled = false;
    var currentTemplate = "";
    var buttonsByImg = new Map(); // HTMLImageElement -> HTMLElement
    var buttons = new Set();
    var scanTimer = 0;
    var cleanups = [];

    function getDoc() {
      return d.document || (typeof document !== "undefined" ? document : null);
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

    function applySettingsState(settings) {
      var ui = settings && settings.ui;
      var sh = getShadow(d);
      if (ui && typeof ui === "object") {
        if (typeof ui.filenameTemplate === "string") {
          currentTemplate = ui.filenameTemplate;
        }
        if (sh) {
          if (typeof ui.theme === "string" && typeof sh.setTheme === "function") sh.setTheme(ui.theme);
          if (typeof ui.animations === "boolean" && typeof sh.setMotion === "function") sh.setMotion(ui.animations);
        }
      }
    }

    async function saveCommentMedia(img, row) {
      var mediaLib = getMediaLib(d);
      var url = getImageSrc(img);
      if (!isAllowedCommentMediaUrl(url, mediaLib)) {
        notify(t("toastGifError"), 4000);
        return { ok: false, error: "invalid-url" };
      }

      var user = commenter(row);
      var filename = mediaFilename(user, url, {
        template: currentTemplate,
        now: d.now,
        filename: d.filename,
        resolve: d.resolve
      });

      var ok = false;
      try {
        if (typeof d.sendDownload === "function") {
          var customReply = await d.sendDownload({ url: url, filename: filename, user: user, type: "gif" });
          ok = Boolean(customReply && customReply.ok !== false);
        } else {
          var dlLib = getDownloadLib(d);
          if (dlLib && typeof dlLib.createDownloadJob === "function") {
            var job = dlLib.createDownloadJob([{
              url: url,
              filename: filename,
              type: "gif"
            }], {
              mode: "separate",
              isAllowedCdn: function (u) { return isAllowedCommentMediaUrl(u, mediaLib); }
            });
            var res = await job.start();
            ok = Boolean(res && res.ok);
          } else {
            var chromeApi = d.chrome || (typeof chrome !== "undefined" ? chrome : null);
            if (chromeApi && chromeApi.runtime && typeof chromeApi.runtime.sendMessage === "function") {
              ok = await new Promise(function (resolve) {
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
            }
          }
        }
      } catch (_) {
        ok = false;
      }

      notify(ok ? t("toastGifSaving") : t("toastGifError"), ok ? 2800 : 4000);
      return { ok: ok, url: url, filename: filename, user: user };
    }

    function pruneDisconnected() {
      buttons.forEach(function (b) {
        if (!b || b.isConnected === false) buttons.delete(b);
      });
      buttonsByImg.forEach(function (btn, img) {
        if (!img || img.isConnected === false || !btn || btn.isConnected === false) {
          if (btn && btn.isConnected !== false && typeof btn.remove === "function") {
            btn.remove();
          }
          buttons.delete(btn);
          buttonsByImg.delete(img);
        }
      });
    }

    function scan() {
      if (!enabled) return 0;
      pruneDisconnected();
      var doc = getDoc();
      if (!doc || typeof doc.querySelectorAll !== "function") return 0;

      var imgs = doc.querySelectorAll("img");
      var added = 0;
      var labelText = t("commentSaveGif");
      var mediaLib = getMediaLib(d);

      for (var i = 0; i < imgs.length; i++) {
        var img = imgs[i];
        if (!img || img.isConnected === false) continue;
        var existingBtn = buttonsByImg.get(img);
        if (existingBtn && existingBtn.isConnected !== false) continue;
        if (!isCommentMedia(img, mediaLib)) continue;

        var row = commentRow(img);
        var template = row && actionLineItem(row);
        if (!row || !template) continue; // Action line not rendered yet — retry on next scan.

        var btn = makeCommentAction(template, {
          text: labelText,
          label: labelText,
          onActivate: (function (targetImg, targetRow) {
            return function () {
              return saveCommentMedia(targetImg, targetRow);
            };
          })(img, row)
        }, doc);

        insertAfter(template, btn);
        buttons.add(btn);
        buttonsByImg.set(img, btn);
        added++;
      }

      return added;
    }

    function scheduleScan() {
      if (!enabled || scanTimer) return;
      scanTimer = setTimeout(function () {
        scanTimer = 0;
        scan();
      }, SCAN_THROTTLE_MS);
    }

    function start(settings) {
      var s = settings || {};
      if (!isCommentMediaEnabled(s.cfg, s.ui)) return;
      applySettingsState(s);
      if (enabled) return;
      enabled = true;

      var iy = globalThis.IY;
      if (iy && iy.core) {
        if (typeof iy.core.observe === "function") {
          var offObs = iy.core.observe(function () { return true; }, scheduleScan);
          if (typeof offObs === "function") cleanups.push(offObs);
        }
        if (typeof iy.core.route === "function") {
          var offRoute = iy.core.route(function () {
            pruneDisconnected();
            scan();
          });
          if (typeof offRoute === "function") cleanups.push(offRoute);
        }
      }

      scan();
    }

    function update(settings) {
      var s = settings || {};
      applySettingsState(s);
      var shouldEnable = isCommentMediaEnabled(s.cfg, s.ui);
      if (shouldEnable && !enabled) start(s);
      else if (!shouldEnable && enabled) stop();
    }

    function stop() {
      enabled = false;
      if (scanTimer) {
        clearTimeout(scanTimer);
        scanTimer = 0;
      }
      while (cleanups.length) {
        var fn = cleanups.pop();
        try { fn(); } catch (_) {}
      }
      buttons.forEach(function (b) {
        try {
          if (b && typeof b.remove === "function") b.remove();
          else if (b && b.parentNode && typeof b.parentNode.removeChild === "function") b.parentNode.removeChild(b);
        } catch (_) {}
      });
      buttons.clear();
      buttonsByImg.clear();
    }

    return {
      start: start,
      update: update,
      stop: stop,
      scan: scan,
      scheduleScan: scheduleScan,
      saveCommentMedia: saveCommentMedia,
      isEnabled: function () { return enabled; },
      getButtons: function () { return buttons; }
    };
  }

  var defaultController = null;

  function registerFeature(core, deps) {
    var iyCore = core || (globalThis.IY && globalThis.IY.core);
    if (!iyCore || typeof iyCore.feature !== "function") return null;
    if (!defaultController) defaultController = createController(deps);
    iyCore.feature("commentGif", {
      keys: ["cfg", "ui"],
      enabled: function (settings) {
        return isCommentMediaEnabled(settings && settings.cfg, settings && settings.ui);
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
    ACTION_CLASS: ACTION_CLASS,
    COMMENT_GIF_HOST: COMMENT_GIF_HOST,
    STRINGS: STRINGS,
    fallbackText: fallbackText,
    isCommentMediaEnabled: isCommentMediaEnabled,
    isAllowedCommentMediaUrl: isAllowedCommentMediaUrl,
    isCommentGif: isCommentGif,
    isCommentMedia: isCommentMedia,
    actionLineItem: actionLineItem,
    commentRow: commentRow,
    commenter: commenter,
    inRootFolder: inRootFolder,
    mediaFilename: mediaFilename,
    makeCommentAction: makeCommentAction,
    createController: createController,
    registerFeature: registerFeature,
    getController: function () { return defaultController; }
  };

  globalThis.IY = globalThis.IY || {};
  globalThis.IY.commentMedia = api;

  if (globalThis.IY.core && typeof globalThis.IY.core.feature === "function") {
    registerFeature(globalThis.IY.core);
  }

  if (isNode) {
    module.exports = api;
  }
})();
