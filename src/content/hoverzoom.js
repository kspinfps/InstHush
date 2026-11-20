(function () {
  "use strict";

  // Hover preview (option ui.hoverZoom, default off). On profile / explore / saved /
  // tagged / search grids, resting the pointer on a post thumbnail for ~350 ms shows a
  // larger copy of the image the page already loaded: the biggest candidate of that
  // thumbnail's own srcset. No Instagram API call, no observers, no rAF loop. Listeners
  // exist only while the option is on: one capturing passive pointerover + pointerout
  // pair plus hide triggers. The preview element is created once and reused.

  var DELAY_MS = 350;
  var GAP = 16;
  var MARGIN = 8;
  var MAX_FRACTION = 0.7;
  var MIN_SIDE = 48;
  var MIN_THUMB = 60;

  var RESERVED = {
    accounts: 1, direct: 1, stories: 1, reels: 1, reel: 1, p: 1, tv: 1, about: 1, legal: 1,
    directory: 1, web: 1, challenge: 1, emails: 1, session: 1, developer: 1, privacy: 1,
    nametag: 1, oauth: 1, create: 1, notifications: 1, your_activity: 1, api: 1, graphql: 1
  };

  // ---------- pure helpers (exported for tests) ----------

  // Grid pages only: explore, explore search/tags/locations, a profile, its tagged and
  // saved tabs. Feed (/), reels, stories, DMs, single post pages and the profile reels
  // tab are not eligible.
  function eligiblePath(pathname) {
    if (typeof pathname !== "string" || pathname.charAt(0) !== "/") return false;
    var seg = pathname.split("/").filter(function (s) { return s !== ""; });
    if (!seg.length) return false;
    var first = seg[0].toLowerCase();
    if (first === "explore") {
      if (seg.length === 1) return true;
      var second = seg[1].toLowerCase();
      return second === "search" || second === "tags" || second === "locations";
    }
    if (RESERVED[first] === 1) return false;
    if (seg.length === 1) return true;
    var tab = seg[1].toLowerCase();
    if (tab === "tagged") return seg.length === 2;
    if (tab === "saved") return seg.length <= 4;
    return false;
  }

  // Post / reel permalink as used by grid thumbnails: /p/CODE/, /user/p/CODE/, /reel/CODE/.
  function isPostHref(href) {
    if (typeof href !== "string") return false;
    var path = href.replace(/^https?:\/\/[^/]+/i, "").split(/[?#]/)[0];
    return /^\/(?:[^/]+\/)?(?:p|reel|tv)\/[A-Za-z0-9_-]+\/?$/.test(path);
  }

  // srcset parser tolerant of commas inside URLs. Returns [{url, size}] where size is
  // the w value, or the x value times 1000 so both kinds sort on one axis.
  function parseSrcset(srcset) {
    var out = [];
    if (typeof srcset !== "string") return out;
    var i = 0, n = srcset.length;
    while (i < n) {
      while (i < n && /[\s,]/.test(srcset.charAt(i))) i++;
      if (i >= n) break;
      var start = i;
      while (i < n && !/\s/.test(srcset.charAt(i))) i++;
      var url = srcset.slice(start, i);
      var trailing = url.match(/,+$/);
      var desc = "";
      if (trailing) url = url.slice(0, url.length - trailing[0].length);
      else {
        var ds = i;
        while (i < n && srcset.charAt(i) !== ",") i++;
        desc = srcset.slice(ds, i).trim();
      }
      if (!url) continue;
      var size = 0, m = desc.match(/^(\d+(?:\.\d+)?)([wx])$/i);
      if (m) size = m[2].toLowerCase() === "w" ? parseFloat(m[1]) : parseFloat(m[1]) * 1000;
      out.push({ url: url, size: size });
    }
    return out;
  }

  // Same allow-list as isAllowedCdn in src/lib/media.js (that file is not loaded with
  // this script, so this is a local copy; tests/hoverzoom.test.js keeps them in sync):
  // https only, no credentials, no port, Instagram / Facebook CDN hosts. Stricter than
  // media.js in one way: the authority may only hold [a-z0-9.-], so no URL() parsing.
  // Returns the lowercase host, or "" when the URL is not allowed.
  function hostOf(url) {
    var m = typeof url === "string" && url.match(/^https:\/\/([^/?#]*)/i);
    if (!m) return "";
    var h = m[1].toLowerCase();
    if (!/^[a-z0-9.-]+$/.test(h)) return "";
    var ok = h === "lookaside.fbsbx.com" || /\.cdninstagram\.com$/.test(h) || /\.fbcdn\.net$/.test(h);
    return ok ? h : "";
  }

  // Largest srcset candidate served from an allowed CDN host, the same host as the
  // loaded image when that one is allowed. Falls back to currentSrc, then src. Returns
  // "" when nothing passes the allow-list.
  function pickLargest(srcset, currentSrc, src) {
    var base = currentSrc || src || "";
    var host = hostOf(base);
    var best = null;
    parseSrcset(srcset).forEach(function (c) {
      var h = hostOf(c.url);
      if (!h) return;
      if (host && h !== host) return;
      if (!best || c.size > best.size) best = c;
    });
    if (best) return best.url;
    return host ? base : "";
  }

  // Scale (nw, nh) to fit maxW x maxH and never beyond capW wide. Rounded, >= 1.
  function fitSize(nw, nh, maxW, maxH, capW) {
    if (!(nw > 0) || !(nh > 0)) return { w: 0, h: 0 };
    var s = Math.min(maxW / nw, maxH / nh, capW > 0 ? capW / nw : Infinity);
    if (!(s > 0)) return { w: 0, h: 0 };
    return { w: Math.max(1, Math.round(nw * s)), h: Math.max(1, Math.round(nh * s)) };
  }

  // Beside the pointer, never over it. Right side first, flips left near the right
  // edge, and when neither side is wide enough the image shrinks (aspect kept) to the
  // roomier side. Vertically centred on the pointer and clamped to the viewport.
  // Returns {left, top, width, height, side} or null when it would be too small.
  function placePreview(pointer, size, viewport) {
    var w = size.w, h = size.h;
    if (!(w > 0) || !(h > 0)) return null;
    var vw = viewport.w, vh = viewport.h;
    var maxH = vh - 2 * MARGIN;
    if (h > maxH) { w = Math.round(w * maxH / h); h = maxH; }
    var spaceR = vw - pointer.x - GAP - MARGIN;
    var spaceL = pointer.x - GAP - MARGIN;
    var side;
    if (w <= spaceR) side = "right";
    else if (w <= spaceL) side = "left";
    else {
      side = spaceR >= spaceL ? "right" : "left";
      var room = Math.max(side === "right" ? spaceR : spaceL, 0);
      h = Math.round(h * room / w);
      w = Math.floor(room);
    }
    if (w < MIN_SIDE || h < MIN_SIDE) return null;
    var left = side === "right" ? pointer.x + GAP : pointer.x - GAP - w;
    var top = Math.min(Math.max(pointer.y - h / 2, MARGIN), vh - h - MARGIN);
    return { left: Math.round(left), top: Math.round(top), width: w, height: h, side: side };
  }

  // Instagram's own overlay icons carry aria-labels. [Tahmin] wording per locale.
  function classifyLabels(labels) {
    var kind = "";
    (labels || []).forEach(function (raw) {
      var s = String(raw || "").toLowerCase();
      if (/clip|reel|video|klip/.test(s)) kind = "video";
      else if (!kind && /carousel|album|gallery|galeri|çoklu|coklu|multiple|sidecar|karusel|carrusel/.test(s)) kind = "carousel";
    });
    return kind;
  }

  var api = {
    eligiblePath: eligiblePath, isPostHref: isPostHref, parseSrcset: parseSrcset,
    hostOf: hostOf, pickLargest: pickLargest, fitSize: fitSize, placePreview: placePreview,
    classifyLabels: classifyLabels,
    constants: { DELAY_MS: DELAY_MS, GAP: GAP, MARGIN: MARGIN, MAX_FRACTION: MAX_FRACTION }
  };

  // ---------- runtime ----------

  function boot() {
    if (globalThis.__iyHoverZoomInstalled) return;
    globalThis.__iyHoverZoomInstalled = true;

    var enabled = false, theme = "green";
    var timer = 0, seq = 0, pending = null, current = null;
    var host = null, box = null, img = null, badge = null;
    var docOpts = { passive: true, capture: true };

    function t(key, fallback) {
      var text = "";
      try { text = chrome.i18n.getMessage(key); } catch (err) {}
      return text || fallback;
    }

    function pageMode() {
      try {
        var nodes = [document.body, document.documentElement];
        for (var i = 0; i < nodes.length; i++) {
          if (!nodes[i]) continue;
          var m = getComputedStyle(nodes[i]).backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
          if (m && (m[4] === undefined || parseFloat(m[4]) > 0)) {
            return (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255 < 0.5 ? "dark" : "light";
          }
        }
      } catch (err) {}
      return undefined;
    }

    function ensure() {
      if (host) return true;
      if (!document.documentElement) return false;
      host = document.createElement("div");
      host.className = "iy-hoverzoom-host";
      host.style.display = "none";
      var root = host.attachShadow({ mode: "closed" });
      var style = document.createElement("style");
      style.textContent =
        ":host{all:initial;position:fixed;left:0;top:0;z-index:2147483001;pointer-events:none;" +
        "--bg:var(--iy-surface,#171D19);--text:var(--iy-text,#EAF0E8);--border:var(--iy-border,#39473D)}" +
        ".box{position:fixed;box-sizing:border-box;overflow:hidden;background:var(--bg);border:1px solid var(--border);" +
        "border-radius:6px;pointer-events:none;animation:in .12s ease-out}" +
        "img{display:block;width:100%;height:100%;object-fit:contain}" +
        ".badge{position:absolute;right:6px;bottom:6px;padding:2px 6px;border:1px solid var(--border);border-radius:4px;" +
        "background:var(--bg);color:var(--text);font:600 11px/1.3 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}" +
        ".badge[hidden]{display:none}" +
        "@keyframes in{from{opacity:0}to{opacity:1}}" +
        "@media (prefers-reduced-motion:reduce){.box{animation:none}}";
      box = document.createElement("div");
      box.className = "box";
      box.setAttribute("aria-hidden", "true");
      img = document.createElement("img");
      img.alt = "";
      img.decoding = "async";
      badge = document.createElement("span");
      badge.className = "badge";
      badge.hidden = true;
      box.append(img, badge);
      root.append(style, box);
      document.documentElement.appendChild(host);
      img.addEventListener("load", IY.core.bind(finish));
      img.addEventListener("error", function () { hide(); });
      return true;
    }

    function hide() {
      if (timer) { clearTimeout(timer); timer = 0; }
      seq++;
      pending = null;
      current = null;
      if (host) host.style.display = "none";
      if (enabled && !eligiblePath(location.pathname)) syncHideListeners(false);
    }

    function dialogOpen() {
      try { return !!document.querySelector("[role=dialog]"); } catch (err) { return false; }
    }

    // Image ready: size it from natural dimensions, place it, reveal it.
    function finish() {
      if (!pending) return;
      var p = pending;
      if (!p.anchor.isConnected || dialogOpen()) { hide(); return; }
      var nw = img.naturalWidth, nh = img.naturalHeight;
      if (!(nw > 0) || !(nh > 0)) { hide(); return; }
      var vw = window.innerWidth, vh = window.innerHeight;
      var size = fitSize(nw, nh, vw * MAX_FRACTION, vh * MAX_FRACTION, Math.max(nw, p.thumbW * 2));
      var spot = placePreview({ x: p.x, y: p.y }, size, { w: vw, h: vh });
      if (!spot) { hide(); return; }
      try {
        if (globalThis.IY && typeof globalThis.IY.themeVars === "function") {
          host.style.cssText = globalThis.IY.themeVars(theme, pageMode());
        }
      } catch (err) {}
      host.style.display = "block";
      box.style.left = spot.left + "px";
      box.style.top = spot.top + "px";
      box.style.width = spot.width + "px";
      box.style.height = spot.height + "px";
      if (p.kind) {
        badge.textContent = p.kind === "video" ? t("hoverZoomBadgeVideo", "Video") : t("hoverZoomBadgeCarousel", "Galeri");
        badge.hidden = false;
      } else badge.hidden = true;
    }

    function show(anchor, x, y) {
      if (!enabled || !anchor.isConnected || dialogOpen()) return;
      var thumb = anchor.querySelector("img");
      if (!thumb) return;
      var rect = thumb.getBoundingClientRect();
      if (rect.width < MIN_THUMB) return;
      var url = pickLargest(thumb.getAttribute("srcset"), thumb.currentSrc, thumb.src);
      if (!url || !ensure()) return;
      var labels = [];
      try {
        var icons = anchor.querySelectorAll("svg[aria-label]");
        for (var i = 0; i < icons.length; i++) labels.push(icons[i].getAttribute("aria-label"));
      } catch (err) {}
      var mine = ++seq;
      pending = { anchor: anchor, x: x, y: y, thumbW: rect.width, kind: classifyLabels(labels), seq: mine };
      current = anchor;
      if (img.getAttribute("src") !== url) img.src = url;
      else if (img.complete && img.naturalWidth > 0) finish();
    }

    function anchorFor(target) {
      if (!target || typeof target.closest !== "function") return null;
      var a = target.closest("a[href]");
      if (!a || !isPostHref(a.getAttribute("href"))) return null;
      if (a.closest("article,[role=dialog]")) return null;
      return a;
    }

    function onOver(event) {
      if (!event.isTrusted || event.pointerType === "touch" || event.buttons) return;
      try {
        if (!eligiblePath(location.pathname)) { if (current || timer) hide(); else syncHideListeners(false); return; }
        syncHideListeners(true);
        var a = anchorFor(event.target);
        if (!a) { if (current || timer) hide(); return; }
        if (a === current) return;
        hide();
        current = a;
        var x = event.clientX, y = event.clientY;
        timer = setTimeout(IY.core.bind(function () {
          timer = 0;
          try { show(a, x, y); } catch (err) { hide(); throw err; }
        }), DELAY_MS);
      } catch (err) { hide(); throw err; }
    }

    function onOut(event) {
      if (!current) return;
      var to = event.relatedTarget;
      if (to && typeof current.contains === "function" && current.contains(to)) return;
      hide();
    }

    function onKey(event) { if (event.key === "Escape") hide(); }
    function onAny() { if (current || timer) hide(); }

    var HIDE_EVENTS = ["scroll", "wheel", "pointerdown"];
    var hideCleanups = [];

    function syncHideListeners(on) {
      if (on) {
        if (hideCleanups.length) return;
        HIDE_EVENTS.forEach(function (n) { hideCleanups.push(IY.core.listen(window, n, onAny, docOpts)); });
        hideCleanups.push(IY.core.listen(window, "keydown", onKey, docOpts));
        hideCleanups.push(IY.core.listen(window, "blur", onAny));
      } else if (hideCleanups.length) {
        for (var i = 0; i < hideCleanups.length; i++) hideCleanups[i]();
        hideCleanups = [];
      }
    }

    function addListeners() {
      IY.core.listen(document, "pointerover", onOver, docOpts);
      IY.core.listen(document, "pointerout", onOut, docOpts);
      if (eligiblePath(location.pathname)) syncHideListeners(true);
    }



    function apply(ui) {
      var on = !!ui && typeof ui === "object" && ui.hoverZoom === true;
      theme = ui && typeof ui.theme === "string" ? ui.theme : "green";
      if (on === enabled) return;
      enabled = on;
      if (on) addListeners();
      else { hide(); syncHideListeners(false); }
    }

    IY.core.feature("hoverzoom", {
      enabled: ({ ui }) => ui?.hoverZoom === true,
      start: ({ ui }) => apply(ui), update: ({ ui }) => apply(ui),
      stop() {
        apply(null);
        if (host) host.remove();
        host = box = img = badge = null;
      }
    });
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    globalThis.IY = Object.assign(globalThis.IY || {}, { hoverZoom: api });
    if (typeof document !== "undefined" && typeof location !== "undefined" &&
        location.protocol === "https:" && location.hostname === "www.instagram.com") {
      try { boot(); } catch (err) {}
    }
  }
})();
