// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
// Story details "@" trigger button and InstHush-themed modal listing mentions
// (including hidden ones), hashtags, locations, links, music, and shared posts.
(function () {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;
  var STORY_HEADER_OFFSET = 64;
  var STORY_INSET = 10;

  var BTN_CSS = `:host {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 2147483000;
  width: 0;
  height: 0;
  pointer-events: none;
}
.sd-wrap {
  position: fixed;
  top: 64px;
  left: 10px;
  display: inline-flex;
  align-items: center;
  padding: 3px;
  border-radius: 10px;
  border: 1px solid var(--iy-hairline, rgb(var(--iy-ink, 255 255 255) / 0.12));
  background: var(--iy-glass, var(--iy-surface-a, #171d19eb));
  color: var(--iy-text, #eaf0e8);
  box-shadow: 0 2px 4px #00000026, 0 8px 24px #00000033, inset 0 1px 0 rgb(var(--iy-ink, 255 255 255) / 0.0588);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  pointer-events: auto;
  user-select: none;
  -webkit-user-select: none;
  opacity: 0;
  visibility: hidden;
  transform: scale(0.95);
  transition: opacity 120ms cubic-bezier(0.2, 0, 0, 1), transform 120ms cubic-bezier(0.2, 0, 0, 1), visibility 0s 120ms;
}
.sd-wrap.is-visible {
  opacity: 1;
  visibility: visible;
  transform: none;
  transition-delay: 0s;
}
.sd-btn {
  position: relative;
  min-width: 32px;
  height: 32px;
  padding: 0 6px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: 600 12px/1 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
}
.sd-btn:hover {
  background: rgb(var(--iy-ink, 255 255 255) / 0.14);
}
.sd-btn:focus-visible {
  outline: 2px solid var(--iy-accent, #9dceab);
  outline-offset: 2px;
}
.sd-count {
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--iy-accent, #9dceab);
  color: var(--iy-on-accent, #17251c);
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.sd-count[hidden] {
  display: none;
}
@media (prefers-reduced-motion: reduce) {
  .sd-wrap, .sd-wrap.is-visible { transition: none !important; transform: none !important; }
}
:host([data-motion="off"]) .sd-wrap,
:host([data-motion="off"]) .sd-wrap.is-visible { transition: none !important; transform: none !important; }
@media (forced-colors: active) {
  .sd-wrap, .sd-btn { border: 1px solid ButtonText; }
}`;

  var MODAL_CSS = `:host {
  position: fixed;
  inset: 0;
  z-index: 2147483645;
  display: block;
  pointer-events: auto;
  font: 500 14px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--iy-text, #eaf0e8);
}
.sd-backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(8, 12, 10, 0.54);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}
.sd-dialog {
  display: flex;
  flex-direction: column;
  width: min(440px, calc(100vw - 32px));
  max-height: min(680px, calc(100vh - 32px));
  border-radius: 18px;
  border: 1px solid var(--iy-border, #39473d);
  background: var(--iy-surface, #171d19);
  color: var(--iy-text, #eaf0e8);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.42);
  overflow: hidden;
}
.sd-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 16px 14px 20px;
  border-bottom: 1px solid var(--iy-border, #39473d);
}
.sd-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--iy-text, #eaf0e8);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sd-close {
  appearance: none;
  flex: none;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--iy-muted, #acb9ae);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease;
}
.sd-close:hover {
  background: var(--iy-hover, #252e27);
  color: var(--iy-text, #eaf0e8);
}
.sd-close:focus-visible {
  outline: 2px solid var(--iy-accent, #9dceab);
  outline-offset: 2px;
}
.sd-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 20px 20px;
  overflow-y: auto;
}
.sd-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--iy-border, #39473d);
  background: var(--iy-surface-raised, #252e27);
}
.sd-sec-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 2px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--iy-muted, #acb9ae);
}
.sd-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--iy-surface, #171d19);
  border: 1px solid var(--iy-border, #39473d);
  color: var(--iy-text, #eaf0e8);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.sd-note {
  margin: 0 0 4px;
  font-size: 12px;
  color: var(--iy-muted, #acb9ae);
}
.sd-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 10px;
  color: var(--iy-text, #eaf0e8);
  text-decoration: none;
  transition: background-color 120ms ease;
}
a.sd-row:hover {
  background: var(--iy-hover, #252e27);
}
a.sd-row:focus-visible, a.sd-user:focus-visible {
  outline: 2px solid var(--iy-accent, #9dceab);
  outline-offset: 2px;
}
.sd-link {
  color: var(--iy-accent-text, #9dceab);
  font-weight: 600;
  word-break: break-all;
}
.sd-muted {
  color: var(--iy-muted, #acb9ae);
  font-size: 12px;
}
.sd-user {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 10px;
  color: var(--iy-text, #eaf0e8);
  text-decoration: none;
  transition: background-color 120ms ease;
}
.sd-user:hover {
  background: var(--iy-hover, #252e27);
}
.sd-avatar {
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--iy-surface, #171d19);
  border: 1px solid var(--iy-border, #39473d);
}
.sd-initial {
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--iy-surface, #171d19);
  border: 1px solid var(--iy-border, #39473d);
  color: var(--iy-accent-text, #9dceab);
  font-weight: 700;
  font-size: 14px;
}
.sd-names {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1 1 auto;
}
.sd-names strong {
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sd-names span {
  font-size: 12px;
  color: var(--iy-muted, #acb9ae);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sd-pill {
  flex: none;
  margin-left: auto;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--iy-accent, #9dceab);
  color: var(--iy-on-accent, #17251c);
  font-size: 11px;
  font-weight: 700;
}
.sd-empty {
  margin: 0;
  padding: 20px 8px;
  text-align: center;
  color: var(--iy-muted, #acb9ae);
  font-size: 14px;
}
.sd-error {
  margin: 0;
  padding: 12px 14px;
  border-radius: 10px;
  border-left: 3px solid var(--iy-accent, #9dceab);
  background: var(--iy-surface-raised, #252e27);
  color: var(--iy-text, #eaf0e8);
  font-size: 13px;
}
@media (prefers-reduced-motion: reduce) {
  .sd-close, .sd-row, .sd-user { transition: none !important; }
}
:host([data-motion="off"]) .sd-close,
:host([data-motion="off"]) .sd-row,
:host([data-motion="off"]) .sd-user { transition: none !important; }
@media (forced-colors: active) {
  .sd-dialog, .sd-section, .sd-close, .sd-pill { border: 1px solid ButtonText; }
}`;

  function getShadow(deps) {
    if (deps && deps.shadow) return deps.shadow;
    var iy = globalThis.IY;
    if (iy && iy.shadow && typeof iy.shadow.createHost === "function") return iy.shadow;
    if (typeof require === "function") {
      try { return require("../ui/shadow.js"); } catch (_) {}
    }
    return null;
  }

  function getExtrasLib(deps) {
    if (deps && deps.storyExtras) return deps.storyExtras;
    var iy = globalThis.IY;
    if (iy && iy.storyExtras) return iy.storyExtras;
    if (typeof require === "function") {
      try { return require("../core/story-extras.js"); } catch (_) {}
    }
    return null;
  }

  function getResolveLib(deps) {
    if (deps && deps.resolve) return deps.resolve;
    var iy = globalThis.IY;
    if (iy && iy.resolve) return iy.resolve;
    if (typeof require === "function") {
      try { return require("../core/resolve.js"); } catch (_) {}
    }
    return null;
  }

  function t(key, fallback, subs) {
    try {
      if (typeof chrome !== "undefined" && chrome && chrome.i18n && typeof chrome.i18n.getMessage === "function") {
        var msg = chrome.i18n.getMessage(key, subs);
        if (msg) return msg;
      }
    } catch (_) {}
    if (Array.isArray(subs) && subs.length) {
      var out = fallback;
      for (var i = 0; i < subs.length; i++) {
        out = out.replace("$" + (i + 1), String(subs[i]));
      }
      return out;
    }
    if (typeof subs === "string" || typeof subs === "number") {
      return fallback.replace("$1", String(subs));
    }
    return fallback;
  }

  function isStoryRoute(route) {
    return !!(route && (route.kind === "stories" || route.kind === "highlight"));
  }

  function parseCurrentRoute(pathname, deps) {
    var path = typeof pathname === "string"
      ? pathname
      : ((deps && deps.location && deps.location.pathname) || (globalThis.location && globalThis.location.pathname) || "/");
    var res = getResolveLib(deps);
    if (res && typeof res.parseRoute === "function") return res.parseRoute(path);
    var parts = path.split(/[?#]/)[0].split("/").filter(Boolean);
    if (parts[0] === "stories") {
      if (parts[1] === "highlights" && parts[2]) return { kind: "highlight", highlightId: parts[2] };
      if (parts[1]) return { kind: "stories", username: parts[1], storyId: parts[2] };
    }
    return { kind: "other" };
  }

  function findActiveStoryMedia(doc, win, deps) {
    var d = doc || (typeof document !== "undefined" ? document : null);
    var w = win || (typeof window !== "undefined" ? window : null);
    if (!d || typeof d.querySelectorAll !== "function") return null;
    var sh = getShadow(deps);
    var res = getResolveLib(deps);
    var vw = (w && Number(w.innerWidth)) || 1024;
    var vh = (w && Number(w.innerHeight)) || 768;

    var nodes;
    try {
      nodes = d.querySelectorAll("section video, section img, main video, main img, video, img");
    } catch (_) {
      return null;
    }
    var best = null;
    var bestScore = 0;
    for (var i = 0; i < nodes.length && i < 120; i++) {
      var el = nodes[i];
      if (!el || el.isConnected === false) continue;
      if (sh && typeof sh.isOwnUi === "function" && sh.isOwnUi(el)) continue;
      if (typeof el.getBoundingClientRect !== "function") continue;
      if (res && typeof res.isStoryPreview === "function" && res.isStoryPreview(el, w)) continue;
      var r = el.getBoundingClientRect();
      if (!(r.width >= 160 && r.height >= 240)) continue;
      if (r.right < vw / 2 || r.left > vw / 2) continue;
      if (r.bottom <= 0 || r.top >= vh) continue;
      var isVid = typeof el.tagName === "string" && el.tagName.toUpperCase() === "VIDEO";
      var score = r.width * r.height + (isVid ? 1 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  function createEl(doc, tag, props, children) {
    var el = doc.createElement(tag);
    if (props) {
      var keys = Object.keys(props);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var v = props[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === "className") el.className = String(v);
        else if (k === "textContent") el.textContent = String(v);
        else if (typeof el.setAttribute === "function") el.setAttribute(k, String(v));
        else el[k] = v;
      }
    }
    if (Array.isArray(children)) {
      for (var c = 0; c < children.length; c++) {
        var child = children[c];
        if (!child) continue;
        if (typeof child === "string") {
          if (typeof doc.createTextNode === "function") el.appendChild(doc.createTextNode(child));
          else el.textContent = (el.textContent || "") + child;
        } else if (typeof el.appendChild === "function") {
          el.appendChild(child);
        }
      }
    }
    return el;
  }

  function safeExternalAnchor(doc, href, children, extraClass) {
    return createEl(doc, "a", {
      className: extraClass || "sd-row",
      href: href,
      target: "_blank",
      rel: "noopener noreferrer"
    }, children);
  }

  function buildSection(doc, title, count, rows) {
    if (!count || !rows || !rows.length) return null;
    var heading = createEl(doc, "h3", { className: "sd-sec-head" }, [
      createEl(doc, "span", { textContent: title }),
      createEl(doc, "span", { className: "sd-badge", textContent: String(count) })
    ]);
    return createEl(doc, "section", { className: "sd-section" }, [heading].concat(rows));
  }

  function renderExtrasBody(doc, container, rawExtras, deps) {
    var exLib = getExtrasLib(deps);
    var e = exLib && typeof exLib.extractStoryExtras === "function"
      ? exLib.extractStoryExtras({ extras: rawExtras })
      : (rawExtras || { mentions: [], hashtags: [], locations: [], links: [], music: [], sharedPosts: [] });

    var sections = [];

    // 1. Mentions (including hidden ones)
    if (e.mentions.length) {
      var hiddenCount = 0;
      for (var i = 0; i < e.mentions.length; i++) if (e.mentions[i].hidden) hiddenCount++;
      var mentionRows = [];
      if (hiddenCount > 0) {
        mentionRows.push(createEl(doc, "p", {
          className: "sd-note",
          textContent: t("storyDetailsHiddenNote", "$1 gizli (çok küçük, gizli işaretli veya kadraj dışında).", [String(hiddenCount)])
        }));
      }
      for (var m = 0; m < e.mentions.length; m++) {
        var u = e.mentions[m];
        var avatar = u.picUrl
          ? createEl(doc, "img", { className: "sd-avatar", src: u.picUrl, alt: "", loading: "lazy" })
          : createEl(doc, "span", { className: "sd-initial", "aria-hidden": "true", textContent: u.username.charAt(0).toUpperCase() });
        var nameKids = [createEl(doc, "strong", { textContent: "@" + u.username })];
        if (u.fullName) nameKids.push(createEl(doc, "span", { textContent: u.fullName }));
        var rowKids = [avatar, createEl(doc, "span", { className: "sd-names" }, nameKids)];
        if (u.hidden) {
          rowKids.push(createEl(doc, "span", {
            className: "sd-pill",
            title: t("storyDetailsHiddenTip", "Hikâyede görünür değil"),
            textContent: t("storyDetailsHiddenPill", "gizli")
          }));
        }
        mentionRows.push(safeExternalAnchor(doc, "/" + encodeURIComponent(u.username) + "/", rowKids, "sd-user"));
      }
      var mSec = buildSection(doc, t("storyDetailsMentions", "Bahsetmeler"), e.mentions.length, mentionRows);
      if (mSec) sections.push(mSec);
    }

    // 2. Hashtags
    if (e.hashtags.length) {
      var tagRows = [];
      for (var h = 0; h < e.hashtags.length; h++) {
        var tag = e.hashtags[h];
        tagRows.push(safeExternalAnchor(doc, "/explore/tags/" + encodeURIComponent(tag) + "/", [
          createEl(doc, "span", { className: "sd-link", textContent: "#" + tag })
        ]));
      }
      var hSec = buildSection(doc, t("storyDetailsHashtags", "Etiketler"), e.hashtags.length, tagRows);
      if (hSec) sections.push(hSec);
    }

    // 3. Locations
    if (e.locations.length) {
      var locRows = [];
      for (var l = 0; l < e.locations.length; l++) {
        var loc = e.locations[l];
        var locHref = loc.id ? "/explore/locations/" + encodeURIComponent(loc.id) + "/" : "/explore/";
        locRows.push(safeExternalAnchor(doc, locHref, [
          createEl(doc, "span", { textContent: loc.name })
        ]));
      }
      var lSec = buildSection(doc, t("storyDetailsLocations", "Konum"), e.locations.length, locRows);
      if (lSec) sections.push(lSec);
    }

    // 4. Links (strictly http/https only, rel=noopener noreferrer, never auto-opened)
    if (e.links.length) {
      var linkRows = [];
      for (var k = 0; k < e.links.length; k++) {
        var lnk = e.links[k];
        var safeUrl = exLib && typeof exLib.sanitizeExternalUrl === "function" ? exLib.sanitizeExternalUrl(lnk.url) : "";
        if (!safeUrl) continue;
        var linkKids = [createEl(doc, "span", { className: "sd-link", textContent: lnk.display || safeUrl })];
        if (lnk.title && lnk.title !== "Visit Link") {
          linkKids.push(createEl(doc, "span", { className: "sd-muted", textContent: lnk.title }));
        }
        linkRows.push(safeExternalAnchor(doc, safeUrl, linkKids));
      }
      if (linkRows.length) {
        var linkSec = buildSection(doc, t("storyDetailsLinks", "Bağlantılar"), linkRows.length, linkRows);
        if (linkSec) sections.push(linkSec);
      }
    }

    // 5. Music
    if (e.music.length) {
      var musicRows = [];
      for (var mu = 0; mu < e.music.length; mu++) {
        var trk = e.music[mu];
        var muKids = [createEl(doc, "strong", { textContent: trk.title })];
        if (trk.artist) muKids.push(createEl(doc, "span", { className: "sd-muted", textContent: trk.artist }));
        musicRows.push(createEl(doc, "div", { className: "sd-row" }, muKids));
      }
      var muSec = buildSection(doc, t("storyDetailsMusic", "Müzik"), e.music.length, musicRows);
      if (muSec) sections.push(muSec);
    }

    // 6. Shared posts / reels
    if (e.sharedPosts.length) {
      var postRows = [];
      for (var p = 0; p < e.sharedPosts.length; p++) {
        var sp = e.sharedPosts[p];
        var pHref = "/" + (sp.isReel ? "reel" : "p") + "/" + encodeURIComponent(sp.code) + "/";
        var label = (sp.isReel ? t("storyDetailsReelLabel", "Reels") : t("storyDetailsPostLabel", "Gönderi")) + " " + sp.code;
        postRows.push(safeExternalAnchor(doc, pHref, [
          createEl(doc, "span", { className: "sd-link", textContent: label })
        ]));
      }
      var pSec = buildSection(doc, t("storyDetailsSharedPosts", "Paylaşılan gönderiler"), e.sharedPosts.length, postRows);
      if (pSec) sections.push(pSec);
    }

    if (typeof container.replaceChildren === "function") container.replaceChildren();
    else if (Array.isArray(container.children)) container.children.length = 0;

    if (!sections.length) {
      container.appendChild(createEl(doc, "p", {
        className: "sd-empty",
        textContent: t("storyDetailsEmpty", "Bu hikâyede bahsetme, etiket, bağlantı veya müzik yok.")
      }));
    } else {
      for (var s = 0; s < sections.length; s++) container.appendChild(sections[s]);
    }
    return sections.length;
  }

  function formatErrorMessage(err) {
    if (err && err.rateLimited) {
      var mins = Number.isFinite(err.remainingMs) && err.remainingMs > 0
        ? Math.ceil(err.remainingMs / 60000)
        : 30;
      return t("storyDetailsRateLimited", "Instagram istekleri geçici olarak sınırladı ($1 dk bekle).", [String(mins)]);
    }
    return t("storyDetailsError", "Hikâye ayrıntıları yüklenemedi.");
  }

  function createController(deps) {
    var d = deps || {};
    var active = false;
    var openGen = 0;
    var probeGen = 0;
    var btnRecord = null;
    var btnWrap = null;
    var triggerBtn = null;
    var countBadge = null;
    var modalRecord = null;
    var modalCloseFn = null;
    var activeEl = null;
    var lastStoryKey = "";
    var rafId = 0;
    var cleanups = [];

    function getDoc() { return d.document || (typeof document !== "undefined" ? document : null); }
    function getWin() { return d.window || (typeof window !== "undefined" ? window : null); }
    function getLoc() { return d.location || (typeof location !== "undefined" ? location : { pathname: "/", href: "" }); }

    function applySettingsTheme(settings) {
      var sh = getShadow(d);
      var ui = settings && settings.ui;
      if (!sh || !ui) return;
      if (typeof ui.theme === "string" && typeof sh.setTheme === "function") sh.setTheme(ui.theme);
      if (typeof ui.animations === "boolean" && typeof sh.setMotion === "function") sh.setMotion(ui.animations);
    }

    function closeModal() {
      openGen++;
      if (typeof modalCloseFn === "function") {
        var fn = modalCloseFn;
        modalCloseFn = null;
        fn();
      } else if (modalRecord) {
        modalRecord.destroy();
        modalRecord = null;
      }
    }

    function updateBadgeCount(count, mentionsCount) {
      if (!triggerBtn || !countBadge) return;
      var total = Number(count) || 0;
      var mentions = Number(mentionsCount) || 0;
      var shown = mentions > 0 ? mentions : total;
      if (shown > 0) {
        countBadge.textContent = String(shown);
        countBadge.hidden = false;
        if (typeof countBadge.removeAttribute === "function") countBadge.removeAttribute("hidden");
        triggerBtn.title = t("storyDetailsBtnCount", "Hikâye ayrıntıları ($1)", [String(total)]);
        triggerBtn.setAttribute("aria-label", triggerBtn.title);
      } else {
        countBadge.textContent = "";
        countBadge.hidden = true;
        if (typeof countBadge.setAttribute === "function") countBadge.setAttribute("hidden", "");
        var baseLabel = t("storyDetailsBtn", "Hikâye ayrıntıları");
        triggerBtn.title = baseLabel;
        triggerBtn.setAttribute("aria-label", baseLabel);
      }
    }

    function ensureButton() {
      if (btnRecord && triggerBtn) return true;
      var sh = getShadow(d);
      var doc = getDoc();
      if (!sh || !doc) return false;

      var baseLabel = t("storyDetailsBtn", "Hikâye ayrıntıları");
      countBadge = createEl(doc, "span", { className: "sd-count", hidden: "hidden" });
      countBadge.hidden = true;
      triggerBtn = createEl(doc, "button", {
        type: "button",
        className: "sd-btn",
        title: baseLabel,
        "aria-label": baseLabel,
        "aria-haspopup": "dialog"
      }, [sh.icon("at", 16), countBadge]);

      triggerBtn.addEventListener("click", function (e) {
        try {
          if (e && typeof e.preventDefault === "function") e.preventDefault();
          if (e && typeof e.stopPropagation === "function") e.stopPropagation();
        } catch (_) {}
        openForCurrentStory({ opener: triggerBtn });
      });

      btnWrap = createEl(doc, "div", { className: "sd-wrap" }, [triggerBtn]);
      btnRecord = sh.createHost({
        document: doc,
        className: "iy-story-details-btn-host",
        css: BTN_CSS,
        top: btnWrap,
        mode: "media",
        mount: true
      });
      return true;
    }

    function setButtonVisible(vis) {
      if (!btnWrap) return;
      if (btnWrap.classList && typeof btnWrap.classList.toggle === "function") {
        btnWrap.classList.toggle("is-visible", !!vis);
      }
      btnWrap.setAttribute("aria-hidden", vis ? "false" : "true");
    }

    function placeButton() {
      if (!active) { setButtonVisible(false); return; }
      var doc = getDoc();
      var win = getWin();
      var route = parseCurrentRoute(getLoc().pathname, d);
      if (!isStoryRoute(route)) {
        activeEl = null;
        setButtonVisible(false);
        return;
      }
      var media = (activeEl && activeEl.isConnected !== false) ? activeEl : findActiveStoryMedia(doc, win, d);
      if (!media || typeof media.getBoundingClientRect !== "function") {
        setButtonVisible(false);
        return;
      }
      activeEl = media;
      if (!ensureButton()) return;

      var r = media.getBoundingClientRect();
      var vw = (win && Number(win.innerWidth)) || 1024;
      var vh = (win && Number(win.innerHeight)) || 768;
      if (!(r.width > 80 && r.height > 120) || r.bottom <= 0 || r.top >= vh) {
        setButtonVisible(false);
        return;
      }
      var left = Math.max(STORY_INSET, Math.min(vw - 64, Math.round(r.left + STORY_INSET)));
      var top = Math.max(STORY_INSET, Math.min(vh - 52, Math.round(r.top + STORY_HEADER_OFFSET)));
      btnWrap.style.left = left + "px";
      btnWrap.style.top = top + "px";
      setButtonVisible(true);
    }

    function buildCurrentTarget(override) {
      var route = parseCurrentRoute(getLoc().pathname, d);
      var media = (override && override.el) || activeEl || findActiveStoryMedia(getDoc(), getWin(), d);
      var target = Object.assign({
        username: route.username,
        storyId: route.storyId,
        highlightId: route.highlightId,
        el: media
      }, override || {});
      return target;
    }

    function probeOfflineCount() {
      var exLib = getExtrasLib(d);
      if (!exLib || typeof exLib.fetchStoryExtras !== "function") return;
      var route = parseCurrentRoute(getLoc().pathname, d);
      if (!isStoryRoute(route)) return;
      var gen = ++probeGen;
      var target = buildCurrentTarget();
      Promise.resolve(exLib.fetchStoryExtras(target, { offline: true })).then(function (res) {
        if (!active || gen !== probeGen) return;
        if (res && res.extras) {
          updateBadgeCount(res.count, res.extras.mentions ? res.extras.mentions.length : 0);
        } else {
          updateBadgeCount(0, 0);
        }
      }).catch(function () {});
    }

    function openModalUI(titleText, opener) {
      closeModal();
      var sh = getShadow(d);
      var doc = getDoc();
      if (!sh || !doc) return null;

      var titleId = "iy-sd-title-" + (++openGen);
      var heading = createEl(doc, "h2", { id: titleId, className: "sd-title", textContent: titleText });
      var closeLabel = t("storyDetailsClose", "Kapat");
      var closeBtn = createEl(doc, "button", {
        type: "button",
        className: "sd-close",
        title: closeLabel,
        "aria-label": closeLabel
      }, [sh.icon("close", 18)]);

      var body = createEl(doc, "div", { className: "sd-body" });
      var head = createEl(doc, "div", { className: "sd-head" }, [heading, closeBtn]);
      var dialog = createEl(doc, "div", {
        className: "sd-dialog",
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": titleId
      }, [head, body]);
      var backdrop = createEl(doc, "div", { className: "sd-backdrop" }, [dialog]);

      var rec = sh.createHost({
        document: doc,
        className: "iy-story-details-modal-host",
        css: MODAL_CSS,
        top: backdrop,
        mount: true
      });
      modalRecord = rec;

      var closed = false;
      function doClose() {
        if (closed) return;
        closed = true;
        if (doc && typeof doc.removeEventListener === "function") {
          doc.removeEventListener("keydown", onKeyDown, true);
        }
        rec.destroy();
        if (modalRecord === rec) modalRecord = null;
        if (modalCloseFn === doClose) modalCloseFn = null;
        if (opener && opener.isConnected !== false && typeof opener.focus === "function") {
          try { opener.focus({ preventScroll: true }); } catch (_) {}
        }
      }
      modalCloseFn = doClose;

      function focusables() {
        if (!dialog || typeof dialog.querySelectorAll !== "function") return [closeBtn];
        var list = Array.from(dialog.querySelectorAll('button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'));
        return list.length ? list : [closeBtn];
      }

      function onKeyDown(e) {
        if (closed || !e) return;
        if (e.key === "Escape") {
          if (typeof e.preventDefault === "function") e.preventDefault();
          if (typeof e.stopPropagation === "function") e.stopPropagation();
          if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
          doClose();
          return;
        }
        if (e.key === "Tab") {
          var items = focusables();
          if (!items.length) return;
          var activeNode = (rec.root && rec.root.activeElement) || (doc && doc.activeElement);
          var idx = items.indexOf(activeNode);
          var nextIdx = idx < 0 ? 0 : (idx + (e.shiftKey ? -1 : 1) + items.length) % items.length;
          if (typeof e.preventDefault === "function") e.preventDefault();
          if (typeof e.stopPropagation === "function") e.stopPropagation();
          if (items[nextIdx] && typeof items[nextIdx].focus === "function") {
            try { items[nextIdx].focus({ preventScroll: true }); } catch (_) {}
          }
        }
      }

      closeBtn.addEventListener("click", function (e) {
        try {
          if (e && typeof e.preventDefault === "function") e.preventDefault();
          if (e && typeof e.stopPropagation === "function") e.stopPropagation();
        } catch (_) {}
        doClose();
      });

      backdrop.addEventListener("click", function (e) {
        if (e && e.target === backdrop) doClose();
      });

      if (doc && typeof doc.addEventListener === "function") {
        doc.addEventListener("keydown", onKeyDown, true);
      }
      if (typeof closeBtn.focus === "function") {
        try { closeBtn.focus({ preventScroll: true }); } catch (_) {}
      }

      return {
        gen: openGen,
        host: rec.host,
        root: rec.root,
        dialog: dialog,
        heading: heading,
        body: body,
        closeBtn: closeBtn,
        close: doClose,
        isClosed: function () { return closed; }
      };
    }

    function modalHeadingFor(username) {
      if (username && username !== "unknown") {
        return t("storyDetailsTitleUser", "@$1 hikâye ayrıntıları", [username]);
      }
      return t("storyDetailsTitle", "Hikâye ayrıntıları");
    }

    async function openForCurrentStory(targetOrOpts) {
      var opts = targetOrOpts && typeof targetOrOpts === "object" ? targetOrOpts : {};
      var target = buildCurrentTarget(opts);
      var doc = getDoc();
      var modal = openModalUI(modalHeadingFor(target.username), opts.opener || triggerBtn);
      if (!modal) return null;
      var myGen = modal.gen;

      // Immediate render if pre-extracted extras or raw story item were supplied directly.
      var exLib = getExtrasLib(d);
      if (opts.extras || opts.raw || (opts.post && opts.post.extras)) {
        var direct = opts.extras
          ? opts.extras
          : (exLib ? exLib.extractStoryExtras(opts.raw || opts.post) : null);
        if (direct && !modal.isClosed()) {
          renderExtrasBody(doc, modal.body, direct, d);
          var c = exLib ? exLib.extrasCount(direct) : 0;
          updateBadgeCount(c, direct.mentions ? direct.mentions.length : 0);
        }
        return modal;
      }

      modal.body.appendChild(createEl(doc, "p", {
        className: "sd-empty",
        textContent: t("storyDetailsLoading", "Yükleniyor…")
      }));

      if (!exLib || typeof exLib.fetchStoryExtras !== "function") {
        if (!modal.isClosed()) {
          if (typeof modal.body.replaceChildren === "function") modal.body.replaceChildren();
          modal.body.appendChild(createEl(doc, "p", {
            className: "sd-error",
            textContent: t("storyDetailsError", "Hikâye ayrıntıları yüklenemedi.")
          }));
        }
        return modal;
      }

      try {
        var res = await exLib.fetchStoryExtras(target, { offline: false, requireAvatars: true });
        if (modal.isClosed() || myGen !== openGen) return modal;
        if (res && res.username) {
          modal.heading.textContent = modalHeadingFor(res.username);
        }
        var extras = (res && res.extras) || exLib.emptyExtras();
        renderExtrasBody(doc, modal.body, extras, d);
        updateBadgeCount(res ? res.count : 0, extras.mentions ? extras.mentions.length : 0);
      } catch (err) {
        if (modal.isClosed() || myGen !== openGen) return modal;
        if (typeof modal.body.replaceChildren === "function") modal.body.replaceChildren();
        else if (Array.isArray(modal.body.children)) modal.body.children.length = 0;
        modal.body.appendChild(createEl(doc, "p", {
          className: "sd-error",
          textContent: formatErrorMessage(err)
        }));
      }
      return modal;
    }

    function sync() {
      if (!active) return;
      var route = parseCurrentRoute(getLoc().pathname, d);
      var key = route.kind + ":" + (route.username || "") + ":" + (route.storyId || "") + ":" + (route.highlightId || "");
      if (key !== lastStoryKey) {
        lastStoryKey = key;
        activeEl = null;
        closeModal();
        updateBadgeCount(0, 0);
        if (isStoryRoute(route)) probeOfflineCount();
      }
      placeButton();
    }

    function schedulePlace() {
      if (!active || rafId) return;
      var raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : function (fn) { return setTimeout(fn, 16); };
      rafId = raf(function () {
        rafId = 0;
        placeButton();
      });
    }

    function start(settings) {
      if (active) return;
      active = true;
      lastStoryKey = "";
      applySettingsTheme(settings);

      var win = getWin();
      var doc = getDoc();
      var core = d.core || (globalThis.IY && globalThis.IY.core);

      if (core && typeof core.route === "function") {
        cleanups.push(core.route(sync));
      }
      if (core && typeof core.observe === "function") {
        cleanups.push(core.observe(function () { return isStoryRoute(parseCurrentRoute(getLoc().pathname, d)); }, schedulePlace));
      }
      if (win && typeof win.addEventListener === "function") {
        win.addEventListener("resize", schedulePlace, { passive: true });
        cleanups.push(function () { win.removeEventListener("resize", schedulePlace); });
      }
      if (doc && typeof doc.addEventListener === "function") {
        doc.addEventListener("scroll", schedulePlace, { capture: true, passive: true });
        cleanups.push(function () { doc.removeEventListener("scroll", schedulePlace, true); });
      }

      sync();
    }

    function update(settings) {
      applySettingsTheme(settings);
      if (active) sync();
    }

    function stop() {
      active = false;
      probeGen++;
      closeModal();
      if (rafId) {
        if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(rafId);
        else clearTimeout(rafId);
        rafId = 0;
      }
      while (cleanups.length) {
        try { cleanups.pop()(); } catch (_) {}
      }
      if (btnRecord) {
        btnRecord.destroy();
        btnRecord = null;
      }
      btnWrap = null;
      triggerBtn = null;
      countBadge = null;
      activeEl = null;
      lastStoryKey = "";
    }

    return {
      start: start,
      update: update,
      stop: stop,
      sync: sync,
      open: openForCurrentStory,
      close: closeModal,
      isActive: function () { return active; },
      isModalOpen: function () { return !!modalRecord; },
      getButton: function () { return triggerBtn; },
      getButtonHost: function () { return btnRecord && btnRecord.host; },
      getModalHost: function () { return modalRecord && modalRecord.host; }
    };
  }

  var controller = createController();

  if (globalThis.IY && globalThis.IY.core && typeof globalThis.IY.core.feature === "function") {
    globalThis.IY.core.feature("storyDetails", {
      keys: ["ui"],
      enabled: function (settings) {
        return !settings.ui || settings.ui.storyDetails !== false;
      },
      start: function (settings) { controller.start(settings); },
      update: function (settings) { controller.update(settings); },
      stop: function () { controller.stop(); }
    });
  }

  var api = {
    BTN_CSS: BTN_CSS,
    MODAL_CSS: MODAL_CSS,
    createController: createController,
    renderExtrasBody: renderExtrasBody,
    buildSection: buildSection,
    findActiveStoryMedia: findActiveStoryMedia,
    open: function (targetOrOpts) { return controller.open(targetOrOpts); },
    close: function () { return controller.close(); }
  };

  globalThis.IY = Object.assign(globalThis.IY || {}, { storyDetails: api });
  if (isNode) module.exports = api;
})();
