// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
(function () {
  "use strict";

  var MIN_SIZE = 100;
  var MIN_DM_SIZE = 120;
  var MIN_AVATAR_SIZE = 56;
  var MAX_AVATAR_SIZE = 260;
  var DEFAULT_HIDE_DELAY_MS = 180;
  var SHORTCODE_RE = /\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{2,})/;
  var CALL_ROUTE_RE = /^\/(?:direct\/(?:t\/[^/]+\/)?|)(?:call|calls|video_call|videocall|video_chat|rtc)(?:\/|$)/i;
  var CALL_SELECTOR = '[role="dialog"][aria-label*="call" i], [role="dialog"][aria-label*="arama" i], [data-call-id]';

  var RESERVED_ROUTES = new Set([
    "accounts", "explore", "direct", "about", "developer", "legal", "emails",
    "challenge", "stories", "reels", "reel", "p", "tv", "web", "session",
    "privacy", "terms", "press", "api", "graphql", "oauth", "nametag", "lite",
    "your_activity", "notifications", "threads", "directory", "locations",
    "create", "login", "signup", "help", "ads", "business", "static", "download"
  ]);

  var subs = new Set();
  var current = null;
  var pointer = null;
  var frame = 0;
  var hideTimer = 0;
  var hideDelayMs = DEFAULT_HIDE_DELAY_MS;
  var started = false;
  var cleanups = [];
  var lastEvalX = NaN;
  var lastEvalY = NaN;
  var lastEvalTarget = null;
  var hasEvaluatedOnce = false;
  var needsReemit = false;

  function getShadow() {
    var iy = globalThis.IY;
    if (iy && iy.shadow && typeof iy.shadow.isOwnUi === "function") return iy.shadow;
    if (typeof require === "function") {
      try { return require("../ui/shadow.js"); } catch (_) {}
    }
    return null;
  }

  function isOwnUi(node) {
    var sh = getShadow();
    if (sh && typeof sh.isOwnUi === "function") return sh.isOwnUi(node);
    for (var n = node; n; n = n.host || n.parentNode || n.parentElement) {
      if (n && typeof n.className === "string" && /\biy-(?:host|photo|toast|dock-host|keys-host|hoverzoom-host|shadow-host)\b/.test(n.className)) {
        return true;
      }
    }
    return false;
  }

  function isVideoEl(el) {
    if (!el || typeof el !== "object") return false;
    if (typeof HTMLVideoElement !== "undefined" && el instanceof HTMLVideoElement) return true;
    return el.tagName === "VIDEO";
  }

  function isImageEl(el) {
    if (!el || typeof el !== "object") return false;
    if (typeof HTMLImageElement !== "undefined" && el instanceof HTMLImageElement) return true;
    return el.tagName === "IMG";
  }

  function isMediaTag(el) {
    return isImageEl(el) || isVideoEl(el);
  }

  function isEditableField(node) {
    if (!node || typeof node !== "object") return false;
    var el = node.nodeType === 3 ? node.parentElement : node;
    if (!el || isOwnUi(el)) return false;
    var tag = typeof el.tagName === "string" ? el.tagName.toUpperCase() : "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (el.isContentEditable) return true;
    if (typeof el.getAttribute === "function" && el.getAttribute("role") === "textbox") return true;
    if (typeof el.closest === "function" && el.closest('textarea, input, select, [contenteditable="true"], [contenteditable=""], [role="textbox"]')) {
      return true;
    }
    return false;
  }

  function isCommentGif(el) {
    if (!isImageEl(el)) return false;
    if (typeof el.closest === "function" && el.closest("a")) return false;
    var src = el.currentSrc || el.src || (typeof el.getAttribute === "function" ? el.getAttribute("src") : "");
    if (!src || typeof src !== "string") return false;
    try {
      var host = new URL(src, "https://www.instagram.com").hostname.toLowerCase();
      return host === "fbsbx.com" || host.endsWith(".fbsbx.com");
    } catch (_) {
      return src.indexOf("fbsbx.com") !== -1;
    }
  }

  function isCallMedia(el, pathname) {
    var path = typeof pathname === "string" ? pathname : (typeof location !== "undefined" ? location.pathname : "");
    if (CALL_ROUTE_RE.test(path)) return true;
    if (!el) return false;
    if (el.srcObject && typeof el.srcObject.getTracks === "function") return true;
    try {
      if (typeof el.closest === "function" && el.closest(CALL_SELECTOR)) return true;
    } catch (_) {}
    return false;
  }

  function parseRoute(pathname) {
    var path = typeof pathname === "string" ? pathname : (typeof location !== "undefined" ? location.pathname : "/");
    var clean = path.split(/[?#]/)[0];
    var parts = clean.split("/").filter(Boolean);
    var a = parts[0] || "";
    var b = parts[1] || "";
    var c = parts[2] || "";

    if (!a) return { kind: "home" };
    if ((a === "p" || a === "tv") && b) return { kind: "post", shortcode: b };
    if (a === "reel" && b) return { kind: "reel", shortcode: b };
    if (a === "reels") return b ? { kind: "reel", shortcode: b } : { kind: "reels" };
    if (a === "stories") {
      if (b === "highlights" && c) return { kind: "highlight", highlightId: c };
      if (b) return { kind: "stories", username: b, storyId: c || undefined };
    }
    if (a === "explore") return { kind: "explore" };
    if (a === "direct") return { kind: "direct" };
    if (RESERVED_ROUTES.has(a.toLowerCase())) return { kind: "other" };
    if ((b === "p" || b === "reel" || b === "reels" || b === "tv") && c) {
      return { kind: b === "p" || b === "tv" ? "post" : "reel", shortcode: c, username: a };
    }
    if (b === "saved") {
      return { kind: "profile", username: a, saved: parts[3] && /^\d+$/.test(parts[3]) ? parts[3] : "all" };
    }
    return { kind: "profile", username: a };
  }

  function shortcodeFromHref(href) {
    if (typeof href !== "string" || !href) return undefined;
    var m = href.match(SHORTCODE_RE);
    return m ? m[1] : undefined;
  }

  function shortcodeInRoot(root) {
    if (!root || typeof root.querySelector !== "function") return undefined;
    try {
      var timeEl = root.querySelector("a time, time");
      if (timeEl && typeof timeEl.closest === "function") {
        var timeAnchor = timeEl.closest("a");
        var fromTime = shortcodeFromHref(timeAnchor && typeof timeAnchor.getAttribute === "function" ? timeAnchor.getAttribute("href") : null);
        if (fromTime) return fromTime;
      }
    } catch (_) {}
    try {
      if (typeof root.querySelectorAll === "function") {
        var links = root.querySelectorAll('a[href*="/p/"], a[href*="/reel/"], a[href*="/reels/"], a[href*="/tv/"]');
        for (var i = 0; i < links.length; i++) {
          var sc = shortcodeFromHref(typeof links[i].getAttribute === "function" ? links[i].getAttribute("href") : links[i].href);
          if (sc) return sc;
        }
      }
      var link = root.querySelector('a[href*="/p/"], a[href*="/reel/"], a[href*="/reels/"], a[href*="/tv/"]');
      if (link) {
        return shortcodeFromHref(typeof link.getAttribute === "function" ? link.getAttribute("href") : link.href);
      }
    } catch (_) {}
    return undefined;
  }

  function usernameInRoot(root) {
    if (!root || typeof root.querySelectorAll !== "function") return undefined;
    try {
      var links = root.querySelectorAll('a[href^="/"]');
      for (var i = 0; i < links.length; i++) {
        var href = typeof links[i].getAttribute === "function" ? links[i].getAttribute("href") : "";
        if (!href) continue;
        var m = /^\/([A-Za-z0-9._]{1,30})\/?$/.exec(href.split(/[?#]/)[0]);
        if (m && !RESERVED_ROUTES.has(m[1].toLowerCase())) return m[1];
      }
    } catch (_) {}
    return undefined;
  }

  function visibleRect(el) {
    if (!el || typeof el.getBoundingClientRect !== "function") {
      return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 };
    }
    var raw = el.getBoundingClientRect();
    var left = Number(raw.left) || 0;
    var top = Number(raw.top) || 0;
    var right = raw.right !== undefined ? Number(raw.right) : left + (Number(raw.width) || 0);
    var bottom = raw.bottom !== undefined ? Number(raw.bottom) : top + (Number(raw.height) || 0);

    var doc = el.ownerDocument || (typeof document !== "undefined" ? document : null);
    var body = doc && doc.body;
    var docEl = doc && doc.documentElement;

    for (var a = el.parentElement; a && a !== body && a !== docEl; a = a.parentElement) {
      var cs = null;
      try {
        cs = typeof getComputedStyle === "function" ? getComputedStyle(a) : a.style || a.css || null;
      } catch (_) {
        cs = a.style || a.css || null;
      }
      if (!cs) continue;
      if (cs.display === "none" || cs.visibility === "hidden") {
        return { left: left, top: top, right: left, bottom: top, width: 0, height: 0, x: left, y: top };
      }
      var ox = cs.overflowX || cs.overflow || "visible";
      var oy = cs.overflowY || cs.overflow || "visible";
      var clipX = ox !== "visible";
      var clipY = oy !== "visible";
      if ((clipX || clipY) && typeof a.getBoundingClientRect === "function") {
        var r = a.getBoundingClientRect();
        var rLeft = Number(r.left) || 0;
        var rTop = Number(r.top) || 0;
        var rRight = r.right !== undefined ? Number(r.right) : rLeft + (Number(r.width) || 0);
        var rBottom = r.bottom !== undefined ? Number(r.bottom) : rTop + (Number(r.height) || 0);
        if (clipX) {
          left = Math.max(left, rLeft);
          right = Math.min(right, rRight);
        }
        if (clipY) {
          top = Math.max(top, rTop);
          bottom = Math.min(bottom, rBottom);
        }
      }
      if (cs.position === "fixed") break;
    }

    var width = Math.max(0, right - left);
    var height = Math.max(0, bottom - top);
    return {
      left: left,
      top: top,
      right: left + width,
      bottom: top + height,
      width: width,
      height: height,
      x: left,
      y: top
    };
  }

  function pointInRect(rect, x, y) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function sameRect(a, b) {
    if (!a || !b) return false;
    return (
      Math.abs(a.left - b.left) < 1 &&
      Math.abs(a.top - b.top) < 1 &&
      Math.abs(a.width - b.width) < 1 &&
      Math.abs(a.height - b.height) < 1
    );
  }

  function getOpenDialogs(doc) {
    var d = doc || (typeof document !== "undefined" ? document : null);
    if (!d || typeof d.querySelectorAll !== "function") return [];
    var list;
    try {
      list = d.querySelectorAll('div[role="dialog"], [role="dialog"]');
    } catch (_) {
      return [];
    }
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var dlg = list[i];
      if (isOwnUi(dlg)) continue;
      if (typeof dlg.getBoundingClientRect === "function") {
        var r = dlg.getBoundingClientRect();
        if (!(r.width > 0 && r.height > 0)) continue;
      }
      out.push(dlg);
    }
    return out;
  }

  function isOnTopLayer(el, cachedDialogs) {
    if (!el) return false;
    var dialogs = cachedDialogs || getOpenDialogs(el.ownerDocument);
    if (!dialogs.length) return true;
    for (var i = 0; i < dialogs.length; i++) {
      var d = dialogs[i];
      if (d === el || (typeof d.contains === "function" && d.contains(el))) return true;
      // Support simple fake-DOM trees where contains() may not walk deep children.
      for (var p = el.parentElement; p; p = p.parentElement) {
        if (p === d) return true;
      }
    }
    return false;
  }

  function isProfileAvatar(el, route) {
    if (!isImageEl(el)) return false;
    var r = route || parseRoute();
    var inHeader = typeof el.closest === "function" ? !!el.closest("header") : false;
    if (!inHeader) return false;
    if (typeof el.closest === "function") {
      if (el.closest('article, nav, footer, [role="dialog"], div[role="dialog"], [role="navigation"], ul, a[href*="/p/"], a[href*="/reel/"], a[href*="/reels/"]')) {
        return false;
      }
    }
    if (r.kind !== "profile" || !r.username) return false;
    if (typeof el.getBoundingClientRect === "function") {
      var box = el.getBoundingClientRect();
      if (box.width < MIN_AVATAR_SIZE || box.height < MIN_AVATAR_SIZE) return false;
      if (box.width > MAX_AVATAR_SIZE || box.height > MAX_AVATAR_SIZE) return false;
      if (Math.abs(box.width - box.height) > 24) return false;
    }
    return true;
  }

  function isStoryPreview(el, route) {
    var r = route || parseRoute();
    if (r.kind !== "stories" && r.kind !== "highlight") return false;
    if (typeof el.getAttribute === "function" && el.getAttribute("data-story-preview") === "true") return true;
    if (typeof el.closest === "function" && el.closest('[data-story-preview="true"]')) return true;
    if (typeof el.getBoundingClientRect !== "function") return false;
    var vw = (typeof window !== "undefined" && window.innerWidth) || 0;
    if (vw <= 0) return false;
    var box = el.getBoundingClientRect();
    var mid = vw / 2;
    var right = box.right !== undefined ? box.right : box.left + box.width;
    if (box.left > mid) return true;
    if (right < mid) {
      // Allow a bare unpositioned mock (left === 0, width >= 260) only if no centered story exists.
      if (box.left > 0 || box.width < 260) return true;
      var doc = el.ownerDocument || (typeof document !== "undefined" ? document : null);
      if (doc && typeof doc.querySelectorAll === "function") {
        var all = doc.querySelectorAll("video, img");
        for (var i = 0; i < all.length; i++) {
          if (all[i] === el || typeof all[i].getBoundingClientRect !== "function") continue;
          var o = all[i].getBoundingClientRect();
          var oRight = o.right !== undefined ? o.right : o.left + o.width;
          if (o.left <= mid && oRight >= mid && o.width >= MIN_SIZE) return true;
        }
      }
    }
    return false;
  }

  function slideIndexOf(el) {
    try {
      if (!el || typeof el.closest !== "function") return 0;
      var li = el.closest("li");
      if (!li || !li.parentElement) return 0;
      var ul = typeof li.closest === "function" ? li.closest("ul") : li.parentElement;
      if (!ul) return 0;
      var kids = li.parentElement.children || [];
      var idx = 0;
      for (var i = 0; i < kids.length; i++) {
        if (kids[i] === li) return idx;
        if (kids[i].tagName === "LI") idx++;
      }
    } catch (_) {}
    return 0;
  }

  function detectCarouselDom(el) {
    try {
      if (!el || typeof el.closest !== "function") return false;
      var li = el.closest("li");
      if (li && li.parentElement) {
        var kids = li.parentElement.children || [];
        var liCount = 0;
        for (var i = 0; i < kids.length; i++) {
          if (kids[i].tagName === "LI") liCount++;
        }
        if (liCount > 1) return true;
      }
      var scope = el.closest('article, [role="dialog"]');
      if (scope && typeof scope.querySelectorAll === "function") {
        var mediaList = scope.querySelectorAll("ul li img, ul li video");
        if (mediaList && mediaList.length > 1) return true;
      }
    } catch (_) {}
    return false;
  }

  function contextFor(el, routeOverride, rectOverride) {
    if (!el || !isMediaTag(el)) return null;
    var route = routeOverride || parseRoute();
    var mediaType = isVideoEl(el) ? "video" : "image";
    var rect = rectOverride || visibleRect(el);

    if ((route.kind === "stories" || route.kind === "highlight") && isStoryPreview(el, route)) {
      return null;
    }

    if (route.kind === "stories" && route.username) {
      return {
        kind: "story",
        mediaType: mediaType,
        el: el,
        rect: rect,
        username: route.username,
        storyId: route.storyId,
        isCarousel: true,
        slideIndex: 0
      };
    }

    if (route.kind === "highlight" && route.highlightId) {
      return {
        kind: "highlight",
        mediaType: mediaType,
        el: el,
        rect: rect,
        highlightId: route.highlightId,
        reelId: "highlight:" + route.highlightId,
        isCarousel: true,
        slideIndex: 0
      };
    }

    if (isProfileAvatar(el, route)) {
      return {
        kind: "avatar",
        mediaType: "image",
        el: el,
        rect: rect,
        username: route.username,
        isCarousel: false,
        slideIndex: 0
      };
    }

    var isCarousel = detectCarouselDom(el);
    var slideIndex = slideIndexOf(el);

    // Grid thumbnail inside a permalink <a href="/p/..."> or <a href="/reel/...">
    var closestAnchor = typeof el.closest === "function" ? el.closest("a") : null;
    var anchorHref = closestAnchor && (typeof closestAnchor.getAttribute === "function" ? closestAnchor.getAttribute("href") : closestAnchor.href);
    var linkCode = shortcodeFromHref(anchorHref);
    if (linkCode) {
      var isReelLink = typeof anchorHref === "string" && /\/reels?\//.test(anchorHref);
      return {
        kind: isReelLink ? "reel" : "post",
        mediaType: mediaType,
        el: el,
        rect: rect,
        shortcode: linkCode,
        username: route.username,
        isCarousel: isCarousel,
        slideIndex: slideIndex
      };
    }

    var inDialog = typeof el.closest === "function" ? !!el.closest('div[role="dialog"], [role="dialog"]') : false;
    var article = typeof el.closest === "function" ? el.closest("article") : null;
    var doc = el.ownerDocument || (typeof document !== "undefined" ? document : null);
    var hasDialog = doc && typeof doc.querySelector === "function" ? !!doc.querySelector('div[role="dialog"], [role="dialog"]') : false;

    if ((route.kind === "post" || route.kind === "reel") && route.shortcode && (inDialog || !article || !hasDialog)) {
      return {
        kind: route.kind,
        mediaType: mediaType,
        el: el,
        rect: rect,
        shortcode: route.shortcode,
        username: route.username || (article && usernameInRoot(article)),
        isCarousel: isCarousel,
        slideIndex: slideIndex
      };
    }

    if (article) {
      var articleCode = shortcodeInRoot(article);
      var articleUser = usernameInRoot(article);
      if (articleCode) {
        return {
          kind: route.kind === "reels" ? "reel" : "post",
          mediaType: mediaType,
          el: el,
          rect: rect,
          shortcode: articleCode,
          username: articleUser || route.username,
          isCarousel: isCarousel,
          slideIndex: slideIndex
        };
      }
    }

    var dialogEl = typeof el.closest === "function" ? el.closest('div[role="dialog"], [role="dialog"]') : null;
    if (dialogEl) {
      var dialogCode = shortcodeInRoot(dialogEl) || route.shortcode;
      if (dialogCode) {
        return {
          kind: route.kind === "reel" ? "reel" : "post",
          mediaType: mediaType,
          el: el,
          rect: rect,
          shortcode: dialogCode,
          username: usernameInRoot(dialogEl) || route.username,
          isCarousel: isCarousel,
          slideIndex: slideIndex
        };
      }
    }

    if (route.kind === "reels" || route.kind === "reel") {
      return {
        kind: "reel",
        mediaType: mediaType,
        el: el,
        rect: rect,
        shortcode: route.shortcode || shortcodeInRoot(typeof el.closest === "function" ? el.closest("main, section, div") : null),
        username: route.username,
        isCarousel: false,
        slideIndex: 0
      };
    }

    if (route.shortcode) {
      return {
        kind: route.kind === "reel" ? "reel" : "post",
        mediaType: mediaType,
        el: el,
        rect: rect,
        shortcode: route.shortcode,
        username: route.username,
        isCarousel: isCarousel,
        slideIndex: slideIndex
      };
    }

    if (article) {
      return {
        kind: "post",
        mediaType: mediaType,
        el: el,
        rect: rect,
        shortcode: undefined,
        username: usernameInRoot(article),
        isCarousel: isCarousel,
        slideIndex: slideIndex
      };
    }

    return null;
  }

  function isMedia(el, options) {
    if (!isMediaTag(el)) return false;
    if (el.isConnected === false) return false;
    if (isOwnUi(el) || isCommentGif(el)) return false;
    var opts = options || {};
    var route = opts.route || parseRoute(opts.pathname);
    if (isCallMedia(el, opts.pathname)) return false;
    var avatar = isProfileAvatar(el, route);
    if (!avatar && (route.kind === "stories" || route.kind === "highlight") && isStoryPreview(el, route)) {
      return false;
    }
    var minSize = avatar ? MIN_AVATAR_SIZE : (route.kind === "direct" ? MIN_DM_SIZE : MIN_SIZE);
    var rect = opts.rect || visibleRect(el);
    if (rect.width < minSize || rect.height < minSize) return false;
    if (typeof opts.x === "number" && typeof opts.y === "number" && !pointInRect(rect, opts.x, opts.y)) {
      return false;
    }
    if (!isOnTopLayer(el, opts.dialogs)) return false;
    return true;
  }

  function clearHideTimer() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = 0;
    }
  }

  function emit(next) {
    current = next;
    subs.forEach(function (fn) {
      try { fn(next); } catch (_) {}
    });
  }

  function findMediaInStack(stack, x, y, route, dialogs) {
    for (var i = 0; i < stack.length; i++) {
      var el = stack[i];
      if (!isMediaTag(el)) continue;
      if (el.isConnected === false || isOwnUi(el) || isCommentGif(el) || isCallMedia(el)) continue;
      var avatar = isProfileAvatar(el, route);
      if (!avatar && (route.kind === "stories" || route.kind === "highlight") && isStoryPreview(el, route)) continue;
      var minSize = avatar ? MIN_AVATAR_SIZE : (route.kind === "direct" ? MIN_DM_SIZE : MIN_SIZE);
      var rect = visibleRect(el);
      if (rect.width < minSize || rect.height < minSize) continue;
      if (!pointInRect(rect, x, y)) continue;
      if (!isOnTopLayer(el, dialogs)) continue;
      return { el: el, rect: rect };
    }

    // Fallback when an overlay wrapper is returned by elementsFromPoint in a synthetic DOM.
    var limit = Math.min(stack.length, 3);
    var checkedScope = null;
    for (var j = 0; j < limit; j++) {
      var node = stack[j];
      if (!node || isOwnUi(node) || typeof node.closest !== "function") continue;
      var scope = node.closest('article, [role="dialog"], div[role="dialog"], [role="presentation"]');
      if (!scope || scope === checkedScope || typeof scope.querySelectorAll !== "function") continue;
      checkedScope = scope;
      var candidates = scope.querySelectorAll("video, img");
      var best = null;
      var bestArea = Infinity;
      for (var k = 0; k < candidates.length; k++) {
        var cand = candidates[k];
        if (cand.isConnected === false || isOwnUi(cand) || isCommentGif(cand) || isCallMedia(cand)) continue;
        var cRect = visibleRect(cand);
        var cMin = route.kind === "direct" ? MIN_DM_SIZE : MIN_SIZE;
        if (cRect.width < cMin || cRect.height < cMin || !pointInRect(cRect, x, y)) continue;
        if (!isOnTopLayer(cand, dialogs)) continue;
        var area = cRect.width * cRect.height;
        if (area < bestArea || (area === bestArea && isVideoEl(cand))) {
          bestArea = area;
          best = { el: cand, rect: cRect };
        }
      }
      if (best) return best;
    }
    return null;
  }

  function evaluate() {
    frame = 0;
    if (!pointer) return;
    var x = pointer.x;
    var y = pointer.y;
    var target = pointer.target;
    lastEvalX = x;
    lastEvalY = y;
    lastEvalTarget = target;
    hasEvaluatedOnce = true;

    // Early out 1: typing / editable control under pointer.
    if (target && isEditableField(target)) {
      clearHideTimer();
      if (current) emit(null);
      return;
    }

    // Early out 2: pointer is directly on our own floating UI while a target is active.
    if (target && isOwnUi(target) && current && current.el && current.el.isConnected !== false) {
      clearHideTimer();
      return;
    }

    var doc = typeof document !== "undefined" ? document : null;
    if (!doc || typeof doc.elementsFromPoint !== "function") return;
    var stack = doc.elementsFromPoint(x, y) || [];
    if (stack.length > 0 && isOwnUi(stack[0]) && current && current.el && current.el.isConnected !== false) {
      clearHideTimer();
      return;
    }

    var route = parseRoute();
    var dialogs = getOpenDialogs(doc);
    var found = findMediaInStack(stack, x, y, route, dialogs);

    if (found) {
      clearHideTimer();
      var ctx = contextFor(found.el, route, found.rect) || {
        kind: "post",
        mediaType: isVideoEl(found.el) ? "video" : "image",
        el: found.el,
        rect: found.rect,
        isCarousel: false,
        slideIndex: 0
      };
      var elSrc = found.el.currentSrc || found.el.src || (typeof found.el.getAttribute === "function" ? found.el.getAttribute("src") : "") || "";
      ctx.src = elSrc;
      if (
        needsReemit ||
        !current ||
        current.el !== found.el ||
        current.src !== elSrc ||
        !sameRect(found.rect, current.rect) ||
        current.kind !== ctx.kind ||
        current.slideIndex !== ctx.slideIndex ||
        current.isCarousel !== ctx.isCarousel ||
        current.shortcode !== ctx.shortcode ||
        current.storyId !== ctx.storyId ||
        current.highlightId !== ctx.highlightId
      ) {
        needsReemit = false;
        emit(ctx);
      }
      return;
    }

    if (current) {
      if (hideDelayMs <= 0) {
        clearHideTimer();
        emit(null);
      } else if (!hideTimer) {
        hideTimer = setTimeout(function () {
          hideTimer = 0;
          emit(null);
        }, hideDelayMs);
      }
    }
  }

  function queue() {
    if (frame) return;
    if (typeof requestAnimationFrame === "function") {
      var ranSync = false;
      var id = requestAnimationFrame(function () {
        ranSync = true;
        evaluate();
      });
      frame = ranSync ? 0 : (id || 1);
    } else {
      evaluate();
    }
  }

  function onMove(e) {
    if (!e || e.isTrusted === false) return;
    var x = Number(e.clientX);
    var y = Number(e.clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (
      hasEvaluatedOnce &&
      Math.abs(x - lastEvalX) < 1 &&
      Math.abs(y - lastEvalY) < 1 &&
      e.target === lastEvalTarget
    ) {
      return;
    }
    pointer = { x: x, y: y, target: e.target || null };
    queue();
  }

  function onScroll() {
    if (!pointer && !current) return;
    // A removed element must not stay reachable from here (no leak across SPA churn).
    if (pointer && pointer.target && pointer.target.isConnected === false) pointer.target = null;
    if (lastEvalTarget && lastEvalTarget.isConnected === false) lastEvalTarget = null;
    if (current && current.el && current.el.isConnected === false) {
      clearHideTimer();
      emit(null);
      return;
    }
    hasEvaluatedOnce = false;
    needsReemit = true;
  }

  function onResize() {
    if (!pointer && !current) return;
    hasEvaluatedOnce = false;
    needsReemit = true;
    queue();
  }

  function onMouseLeave() {
    pointer = null;
    hasEvaluatedOnce = false;
    clearHideTimer();
    if (frame && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    if (current) emit(null);
  }

  function startListeners() {
    if (started) return;
    var doc = typeof document !== "undefined" ? document : null;
    var win = typeof window !== "undefined" ? window : null;
    if (!doc) return;
    started = true;
    var opts = { passive: true, capture: true };
    if (typeof doc.addEventListener === "function") {
      doc.addEventListener("pointermove", onMove, opts);
      doc.addEventListener("mousemove", onMove, opts);
      cleanups.push(function () {
        doc.removeEventListener("pointermove", onMove, true);
        doc.removeEventListener("mousemove", onMove, true);
      });
    }
    if (win && typeof win.addEventListener === "function") {
      win.addEventListener("scroll", onScroll, opts);
      win.addEventListener("resize", onResize, { passive: true });
      cleanups.push(function () {
        win.removeEventListener("scroll", onScroll, true);
        win.removeEventListener("resize", onResize);
      });
    } else if (typeof doc.addEventListener === "function") {
      doc.addEventListener("scroll", onScroll, opts);
      cleanups.push(function () {
        doc.removeEventListener("scroll", onScroll, true);
      });
    }
    if (doc.documentElement && typeof doc.documentElement.addEventListener === "function") {
      doc.documentElement.addEventListener("mouseleave", onMouseLeave);
      cleanups.push(function () {
        doc.documentElement.removeEventListener("mouseleave", onMouseLeave);
      });
    }
  }

  function stopListeners() {
    if (!started) return;
    started = false;
    while (cleanups.length) {
      var fn = cleanups.pop();
      try { fn(); } catch (_) {}
    }
    if (frame && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(frame);
    }
    frame = 0;
    clearHideTimer();
    pointer = null;
    current = null;
    hasEvaluatedOnce = false;
    lastEvalX = NaN;
    lastEvalY = NaN;
    lastEvalTarget = null;
  }

  function onHover(sub) {
    if (typeof sub !== "function") return function () {};
    if (!started) startListeners();
    subs.add(sub);
    // A subscriber that arrives after the pointer already settled on a media element (the lazy
    // loader replays the first pointer position before the toolbar feature has started) would
    // never hear about it: evaluate() only emits when the hovered target changes.
    if (current && current.el && current.el.isConnected !== false) {
      try { sub(current); } catch (_) {}
    }
    return function () {
      subs.delete(sub);
      if (!subs.size) stopListeners();
    };
  }

  function getHovered() {
    if (current && current.el && current.el.isConnected === false) {
      current = null;
    }
    return current;
  }

  function setHideDelay(ms) {
    hideDelayMs = typeof ms === "number" && ms >= 0 ? ms : DEFAULT_HIDE_DELAY_MS;
  }

  function replay(x, y, target) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    pointer = { x: x, y: y, target: target || null };
    hasEvaluatedOnce = false;
    evaluate();
  }

  function resetHoverState() {
    stopListeners();
    subs.clear();
  }

  var api = {
    MIN_SIZE: MIN_SIZE,
    MIN_DM_SIZE: MIN_DM_SIZE,
    MIN_AVATAR_SIZE: MIN_AVATAR_SIZE,
    onHover: onHover,
    getHovered: getHovered,
    visibleRect: visibleRect,
    sameRect: sameRect,
    pointInRect: pointInRect,
    isMedia: isMedia,
    isMediaTag: isMediaTag,
    isVideoEl: isVideoEl,
    isImageEl: isImageEl,
    isCommentGif: isCommentGif,
    isCallMedia: isCallMedia,
    isProfileAvatar: isProfileAvatar,
    isStoryPreview: isStoryPreview,
    isOnTopLayer: isOnTopLayer,
    parseRoute: parseRoute,
    shortcodeFromHref: shortcodeFromHref,
    shortcodeInRoot: shortcodeInRoot,
    usernameInRoot: usernameInRoot,
    slideIndexOf: slideIndexOf,
    detectCarouselDom: detectCarouselDom,
    contextFor: contextFor,
    evaluate: evaluate,
    replay: replay,
    setHideDelay: setHideDelay,
    reset: resetHoverState
  };

  globalThis.IY = globalThis.IY || {};
  globalThis.IY.hover = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
