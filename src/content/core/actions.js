// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
(function () {
  "use strict";

  var zipForSets = true;

  function getShadow() {
    var iy = globalThis.IY;
    if (iy && iy.shadow) return iy.shadow;
    if (typeof require === "function") {
      try { return require("../ui/shadow.js"); } catch (_) {}
    }
    return null;
  }

  function getZoom() {
    var iy = globalThis.IY;
    if (iy && iy.zoom && typeof iy.zoom.open === "function") return iy.zoom;
    if (typeof require === "function") {
      try { return require("../ui/zoom.js"); } catch (_) {}
    }
    return null;
  }

  function getHover() {
    var iy = globalThis.IY;
    if (iy && iy.hover) return iy.hover;
    if (typeof require === "function") {
      try { return require("./hover.js"); } catch (_) {}
    }
    return null;
  }

  function t(key, fallback, substitutions) {
    try {
      if (typeof chrome !== "undefined" && chrome && chrome.i18n && typeof chrome.i18n.getMessage === "function") {
        var msg = chrome.i18n.getMessage(key, substitutions);
        if (msg) return msg;
      }
    } catch (_) {}
    return fallback;
  }

  function notify(message, ms) {
    var sh = getShadow();
    if (sh && typeof sh.showToast === "function") {
      sh.showToast(message, ms);
    }
    return message;
  }

  function cdnFileKey(url) {
    if (typeof url !== "string" || !url) return "";
    try {
      var last = new URL(url, "https://www.instagram.com").pathname.split("/").pop() || "";
      return last.replace(/\.[a-z0-9]+$/i, "");
    } catch (_) {
      var clean = url.split(/[?#]/)[0].split("/").pop() || "";
      return clean.replace(/\.[a-z0-9]+$/i, "");
    }
  }

  function normalizeItem(raw) {
    if (!raw || typeof raw !== "object") return null;
    var url = typeof raw.url === "string" ? raw.url : "";
    if (!url) return null;
    var type = raw.type === "video" || raw.kind === "video" ? "video" : "image";
    var out = {
      url: url,
      type: type,
      width: Number(raw.width) || 0,
      height: Number(raw.height) || 0
    };
    if (typeof raw.audioUrl === "string" && raw.audioUrl) out.audioUrl = raw.audioUrl;
    if (raw.id !== undefined) out.id = raw.id;
    if (raw.ext !== undefined) out.ext = raw.ext;
    if (raw.duration !== undefined) out.duration = raw.duration;
    return out;
  }

  function normalizeMediaResponse(res, target) {
    if (!res || typeof res !== "object") {
      throw new Error("Empty media response");
    }
    var rawItems = Array.isArray(res.items)
      ? res.items
      : (res.post && Array.isArray(res.post.items) ? res.post.items : (res.url ? [res] : []));
    var items = [];
    for (var i = 0; i < rawItems.length; i++) {
      var norm = normalizeItem(rawItems[i]);
      if (norm) items.push(norm);
    }
    var post = res.post || res;
    var owner = res.owner !== undefined
      ? res.owner
      : (post.username || (post.user && post.user.username) || (target && target.username) || "");
    var shortcode = res.shortcode !== undefined
      ? res.shortcode
      : (post.shortcode || post.code || (target && target.shortcode) || "");
    var caption = typeof res.caption === "string"
      ? res.caption
      : (res.caption && typeof res.caption.text === "string"
          ? res.caption.text
          : (typeof post.caption === "string" ? post.caption : ""));
    var takenAt = Number.isFinite(res.takenAt)
      ? res.takenAt
      : (Number.isFinite(post.takenAt) ? post.takenAt : (Number.isFinite(post.taken_at) ? post.taken_at : 0));

    return {
      items: items,
      owner: owner,
      shortcode: shortcode,
      caption: caption,
      takenAt: takenAt,
      index: Number.isInteger(res.index) ? res.index : undefined
    };
  }

  // Single adapter point for API & download modules so the integrator can adjust method names in one place.
  var defaultAdapter = {
    media: async function (target, options) {
      var iy = globalThis.IY || {};
      var apiMod = iy.api;
      var resolveMod = iy.resolve;

      if (apiMod && typeof apiMod.media === "function") {
        var direct = await apiMod.media(target, options);
        return normalizeMediaResponse(direct, target);
      }

      if (resolveMod && typeof resolveMod.resolveTarget === "function" && (!target || target.kind !== "avatar")) {
        // Hover contexts distinguish reels and highlights for presentation. The resolver
        // accepts posts and stories, with a deferred reel ID for a story tray.
        var ctx = target;
        if (target.kind === "reel") ctx = Object.assign({}, target, { kind: "post" });
        if (target.kind === "highlight" || (target.kind === "story" && typeof target.reelId !== "function")) {
          ctx = Object.assign({}, target, { kind: "story", reelId: function (offline) {
            if (typeof target.reelId === "function") return target.reelId(offline);
            return target.reelId || (target.highlightId ? "highlight:" + target.highlightId :
              apiMod.getUserId(target.username, { offline: offline }));
          } });
        }
        var offline = !!(options && options.offline);
        // An unidentified frame in a highlight can still belong to a known tray.
        // Reading the whole tray should not depend on matching that frame.
        var resolved;
        if (ctx.kind === "story" && options?.all && apiMod?.getReelItems) {
          var stories = await apiMod.getReelItems(await ctx.reelId(offline), { offline: offline });
          resolved = { tray: stories, post: stories?.find(function (post) { return post.id === ctx.storyId; }) || stories?.[0] };
        } else resolved = await resolveMod.resolveTarget(ctx, offline);
        if (options && options.all && Array.isArray(resolved.tray) && resolved.tray.length) {
          var trayItems = [];
          for (var ti = 0; ti < resolved.tray.length; ti++) {
            var tp = resolved.tray[ti];
            if (tp && Array.isArray(tp.items)) {
              for (var tj = 0; tj < tp.items.length; tj++) trayItems.push(tp.items[tj]);
            }
          }
          return normalizeMediaResponse({
            items: trayItems,
            owner: resolved.post && resolved.post.username,
            shortcode: resolved.post && resolved.post.shortcode,
            caption: resolved.post && resolved.post.caption,
            takenAt: resolved.post && resolved.post.takenAt
          }, target);
        }
        return normalizeMediaResponse(resolved, target);
      }

      if (apiMod) {
        if (target && target.kind === "avatar" && typeof apiMod.getHdProfilePic === "function") {
          var pic = await apiMod.getHdProfilePic(target.username);
          return normalizeMediaResponse({
            items: [{ url: pic.url, type: "image", width: pic.width || 0, height: pic.height || 0, id: pic.userId }],
            owner: target.username,
            shortcode: "profile_picture",
            caption: "",
            takenAt: Math.floor(Date.now() / 1000)
          }, target);
        }
        if (target && (target.kind === "story" || target.kind === "highlight") && typeof apiMod.getReelItems === "function") {
          var reelId = target.reelId || (target.highlightId ? "highlight:" + target.highlightId : target.username);
          if (typeof reelId === "function") reelId = await reelId(!!(options && options.offline));
          var tray = await apiMod.getReelItems(reelId, !!(options && options.offline));
          var flat = [];
          for (var si = 0; si < (tray || []).length; si++) {
            if (tray[si] && Array.isArray(tray[si].items)) {
              for (var sj = 0; sj < tray[si].items.length; sj++) flat.push(tray[si].items[sj]);
            }
          }
          var firstStory = (tray && tray[0]) || {};
          return normalizeMediaResponse({
            items: flat,
            owner: firstStory.username || target.username,
            shortcode: firstStory.shortcode || target.storyId || "",
            caption: firstStory.caption || "",
            takenAt: firstStory.takenAt || 0
          }, target);
        }
        if (target && target.shortcode && typeof apiMod.getPostByShortcode === "function") {
          var post = await apiMod.getPostByShortcode(target.shortcode, !!(options && options.offline));
          return normalizeMediaResponse(post, target);
        }
      }

      throw new Error("IY.api.media is not available");
    },

    download: async function (payload) {
      var iy = globalThis.IY || {};
      var dlMod = iy.download;

      if (dlMod && typeof dlMod.run === "function") {
        return await dlMod.run(payload);
      }
      if (dlMod && typeof dlMod.dispatch === "function") {
        var ownerName = typeof (payload.meta && payload.meta.owner) === "string"
          ? payload.meta.owner
          : (payload.meta && payload.meta.owner && payload.meta.owner.username) || "instagram";
        var base = ownerName + "_" + ((payload.meta && payload.meta.shortcode) || "media");
        return await dlMod.dispatch(payload.items, base, payload);
      }
      throw new Error("IY.download.run is not available");
    }
  };

  var adapter = {
    media: defaultAdapter.media,
    download: defaultAdapter.download
  };

  function setAdapter(custom) {
    if (!custom || typeof custom !== "object") return adapter;
    if (typeof custom.media === "function") adapter.media = custom.media;
    if (typeof custom.download === "function") adapter.download = custom.download;
    return adapter;
  }

  function resetAdapter() {
    adapter.media = defaultAdapter.media;
    adapter.download = defaultAdapter.download;
    return adapter;
  }

  function normalizeTarget(target) {
    if (!target) return { kind: "post", el: null };
    if (typeof target === "string") {
      if (target.charAt(0) === "@") {
        return { kind: "avatar", username: target.slice(1), el: null };
      }
      return { kind: "post", shortcode: target, el: null };
    }
    var hv = getHover();
    var isDomEl = typeof target.tagName === "string" ||
      (hv && typeof hv.isMediaTag === "function" && hv.isMediaTag(target));
    if (isDomEl) {
      var ctx = hv && typeof hv.contextFor === "function" ? hv.contextFor(target) : null;
      if (ctx) return ctx;
      return {
        kind: "post",
        mediaType: target.tagName === "VIDEO" ? "video" : "image",
        el: target
      };
    }
    if (typeof target === "object") {
      if (!target.kind && target.el && hv && typeof hv.contextFor === "function") {
        var inferred = hv.contextFor(target.el);
        if (inferred) return Object.assign({}, inferred, target);
      }
      return Object.assign({ kind: "post", el: null }, target);
    }
    return { kind: "post", el: null };
  }

  function pickItemIndex(media, target) {
    var items = (media && media.items) || [];
    if (!items.length) return -1;
    if (Number.isInteger(media.index) && media.index >= 0 && media.index < items.length) {
      return media.index;
    }
    if (target && Number.isInteger(target.index) && target.index >= 0 && target.index < items.length) {
      return target.index;
    }

    var el = target && target.el;
    if (el) {
      var iy = globalThis.IY || {};
      if (iy.resolve && typeof iy.resolve.matchIndex === "function") {
        var resolvedIdx = iy.resolve.matchIndex(items, el);
        if (resolvedIdx >= 0 && resolvedIdx < items.length) return resolvedIdx;
      }
      var src = el.currentSrc || el.src || (typeof el.getAttribute === "function" ? el.getAttribute("src") : "");
      if (src && src.indexOf("blob:") !== 0) {
        var key = cdnFileKey(src);
        if (key) {
          for (var i = 0; i < items.length; i++) {
            if (cdnFileKey(items[i].url) === key) return i;
          }
        }
      }
      if (target && target.storyId) {
        for (var s = 0; s < items.length; s++) {
          if (items[s].id !== undefined && String(items[s].id) === String(target.storyId)) return s;
        }
      }
      if (target && Number.isInteger(target.slideIndex) && target.slideIndex >= 0 && target.slideIndex < items.length) {
        return target.slideIndex;
      }
      var hv = getHover();
      if (hv && typeof hv.detectCarouselDom === "function" && hv.detectCarouselDom(el)) {
        var domIdx = hv.slideIndexOf(el);
        if (domIdx >= 0 && domIdx < items.length) return domIdx;
      }
      var isVid = (hv && hv.isVideoEl(el)) || el.tagName === "VIDEO";
      if (isVid && Number.isFinite(el.duration) && el.duration > 0) {
        var best = -1;
        var bestDiff = 1.5;
        for (var v = 0; v < items.length; v++) {
          if (items[v].type === "video" && Number.isFinite(items[v].duration)) {
            var diff = Math.abs(items[v].duration - el.duration);
            if (diff < bestDiff) {
              bestDiff = diff;
              best = v;
            }
          }
        }
        if (best >= 0) return best;
      }
    }

    return 0;
  }

  function ownerUsername(owner, target) {
    if (typeof owner === "string" && owner) return owner;
    if (owner && typeof owner === "object" && typeof owner.username === "string") return owner.username;
    if (target && typeof target.username === "string") return target.username;
    return "";
  }

  async function writeClipboard(text) {
    if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return true;
    }
    var doc = typeof document !== "undefined" ? document : null;
    if (doc && typeof doc.execCommand === "function" && typeof doc.createElement === "function" && doc.body) {
      var ta = doc.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      doc.body.appendChild(ta);
      if (typeof ta.select === "function") ta.select();
      var ok = doc.execCommand("copy");
      if (typeof ta.remove === "function") ta.remove();
      if (ok) return true;
    }
    throw new Error("Clipboard unavailable");
  }

  function resolveZipFlag(itemCount, options) {
    if (options && typeof options.zip === "boolean") return options.zip;
    if (itemCount <= 1) return false;
    var iy = globalThis.IY || {};
    var ui = iy.settings && iy.settings.ui;
    if (ui && typeof ui.zip === "boolean") return ui.zip;
    if (ui && typeof ui.downloadFormat === "string") return ui.downloadFormat !== "files";
    return zipForSets;
  }

  function setZipForSets(enabled) {
    zipForSets = !!enabled;
  }

  async function downloadOne(target, options) {
    var normTarget = normalizeTarget(target);
    try {
      var media = await adapter.media(normTarget, options);
      var index = pickItemIndex(media, normTarget);
      var item = media.items[index];
      if (!item || !item.url) {
        throw new Error(t("toastError", "İndirilemedi."));
      }
      var meta = {
        owner: media.owner,
        shortcode: media.shortcode,
        caption: media.caption,
        takenAt: media.takenAt,
        index: index,
        total: media.items.length,
        kind: normTarget.kind
      };
      var res = await adapter.download({
        items: [item],
        mode: "one",
        zip: false,
        meta: meta
      });
      if (!options || !options.silent) {
        notify(t("toastStarted", "İndirme başladı."));
      }
      return { ok: true, mode: "one", zip: false, items: [item], meta: meta, result: res };
    } catch (err) {
      if (!options || !options.silent) {
        notify((err && err.message) || t("toastError", "İndirilemedi."), 4000);
      }
      throw err;
    }
  }

  async function downloadAll(target, options) {
    var normTarget = normalizeTarget(target);
    try {
      var media = await adapter.media(normTarget, Object.assign({ all: true }, options));
      if (!media.items || !media.items.length) {
        throw new Error(t("toastError", "İndirilemedi."));
      }
      var useZip = resolveZipFlag(media.items.length, options);
      var meta = {
        owner: media.owner,
        shortcode: media.shortcode,
        caption: media.caption,
        takenAt: media.takenAt,
        total: media.items.length,
        kind: normTarget.kind
      };
      var itemsCopy = media.items.slice();
      var res = await adapter.download({
        items: itemsCopy,
        mode: "all",
        zip: Boolean(useZip),
        meta: meta
      });
      if (!options || !options.silent) {
        var count = itemsCopy.length;
        notify(
          count > 1
            ? t("toastStartedAll", count + " dosya indiriliyor.", [String(count)])
            : t("toastStarted", "İndirme başladı.")
        );
      }
      return { ok: true, mode: "all", zip: Boolean(useZip), items: itemsCopy, meta: meta, result: res };
    } catch (err) {
      if (!options || !options.silent) {
        notify((err && err.message) || t("toastError", "İndirilemedi."), 4000);
      }
      throw err;
    }
  }

  async function openZoom(target, options) {
    var normTarget = normalizeTarget(target);
    try {
      var media = await adapter.media(normTarget, options);
      var index = pickItemIndex(media, normTarget);
      var item = media.items[index];
      if (!item || !item.url) {
        throw new Error(t("toastError", "İndirilemedi."));
      }
      if (item.type === "video") {
        if (!options || !options.silent) {
          notify(t("toastZoomPhotoOnly", "Yalnızca fotoğraflar yakınlaştırılabilir."));
        }
        return null;
      }
      var user = ownerUsername(media.owner, normTarget);
      var total = media.items.length;
      var caption = (user ? "@" + user : "") + (total > 1 ? (user ? " · " : "") + (index + 1) + "/" + total : "");
      var zoomMod = getZoom();
      if (!zoomMod || typeof zoomMod.open !== "function") {
        throw new Error("Zoom viewer is not available");
      }
      return zoomMod.open({
        src: item.url,
        width: item.width,
        height: item.height,
        caption: caption,
        opener: options && options.opener,
        onDownload: function () {
          return downloadOne(Object.assign({}, normTarget, { index: index }), options);
        },
        onCopy: function () {
          return copyMediaUrl(Object.assign({}, normTarget, { index: index }), options);
        }
      });
    } catch (err) {
      if (!options || !options.silent) {
        notify((err && err.message) || t("toastError", "İndirilemedi."), 4000);
      }
      throw err;
    }
  }

  async function copyMediaUrl(target, options) {
    var normTarget = normalizeTarget(target);
    try {
      var media = await adapter.media(normTarget, options);
      var index = pickItemIndex(media, normTarget);
      var item = media.items[index];
      if (!item || !item.url) {
        throw new Error(t("toastError", "İndirilemedi."));
      }
      await writeClipboard(item.url);
      if (!options || !options.silent) {
        notify(t("toastUrlCopied", "Medya adresi kopyalandı."), 2000);
      }
      return item.url;
    } catch (err) {
      if (!options || !options.silent) {
        notify((err && err.message) || t("toastClipboardError", "Panoya kopyalanamadı."), 4000);
      }
      throw err;
    }
  }

  async function copyCaption(target, options) {
    var normTarget = normalizeTarget(target);
    try {
      var media = await adapter.media(normTarget, options);
      var caption = typeof media.caption === "string" ? media.caption : "";
      if (!caption.trim()) {
        if (!options || !options.silent) {
          notify(t("toastNoCaption", "Bu gönderide açıklama yok."), 2200);
        }
        return "";
      }
      await writeClipboard(caption);
      if (!options || !options.silent) {
        notify(t("toastCaptionCopied", "Açıklama kopyalandı."), 2000);
      }
      return caption;
    } catch (err) {
      if (!options || !options.silent) {
        notify((err && err.message) || t("toastClipboardError", "Panoya kopyalanamadı."), 4000);
      }
      throw err;
    }
  }

  async function hasMultiple(target, options) {
    var normTarget = normalizeTarget(target);
    if (normTarget.kind === "avatar") return false;
    try {
      var media = await adapter.media(normTarget, Object.assign({ offline: true, all: true }, options));
      return Array.isArray(media.items) && media.items.length > 1;
    } catch (_) {
      return normTarget.kind === "post" && !!normTarget.isCarousel;
    }
  }

  function avatarTarget(usernameOrTarget) {
    if (typeof usernameOrTarget === "string") {
      return { kind: "avatar", username: usernameOrTarget.replace(/^@/, ""), el: null };
    }
    return Object.assign({}, normalizeTarget(usernameOrTarget), { kind: "avatar" });
  }

  function zoomAvatar(usernameOrTarget, options) {
    return openZoom(avatarTarget(usernameOrTarget), options);
  }

  function downloadAvatar(usernameOrTarget, options) {
    return downloadOne(avatarTarget(usernameOrTarget), options);
  }

  function copyAvatarUrl(usernameOrTarget, options) {
    return copyMediaUrl(avatarTarget(usernameOrTarget), options);
  }

  var api = {
    adapter: adapter,
    setAdapter: setAdapter,
    resetAdapter: resetAdapter,
    normalizeTarget: normalizeTarget,
    normalizeMediaResponse: normalizeMediaResponse,
    pickItemIndex: pickItemIndex,
    cdnFileKey: cdnFileKey,
    setZipForSets: setZipForSets,
    downloadOne: downloadOne,
    downloadCurrent: downloadOne,
    downloadAll: downloadAll,
    openZoom: openZoom,
    zoomMedia: openZoom,
    copyMediaUrl: copyMediaUrl,
    copyCaption: copyCaption,
    hasMultiple: hasMultiple,
    zoomAvatar: zoomAvatar,
    downloadAvatar: downloadAvatar,
    copyAvatarUrl: copyAvatarUrl
  };

  globalThis.IY = globalThis.IY || {};
  globalThis.IY.actions = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
