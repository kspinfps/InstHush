// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
// 4-state profile follow status badge (Karşılıklı / Seni takip ediyor / Seni takip etmiyor / Takip etmiyorsun)
// with clickable friendship details modal. Prefers passive data from net.js/bridge.js and Relay before any network call.
(function () {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;
  var PAGE_DATA_WAITS = [0, 1200, 3000];
  var MAX_STATES = 200;

  var FOLLOWING_LABELS = new Set([
    "following", "takiptesin", "siguiendo", "abonné(e)", "abonné", "gefolgt", "segui già", "seguindo", "подписки"
  ]);
  var NOT_FOLLOWING_LABELS = new Set([
    "follow", "takip et", "follow back", "sen de takip et", "seguir", "s'abonner", "suivre", "folgen", "segui", "подписаться"
  ]);

  var BADGE_CSS = `:host {
  display: inline-flex;
  align-self: center;
  flex: none;
  vertical-align: middle;
  margin: 0 8px;
}
.fb-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--iy-border, #39473d);
  background: var(--iy-surface-raised, #252e27);
  color: var(--iy-text, #eaf0e8);
  font: 600 12px/1 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  transition: filter 120ms ease, background-color 120ms ease, opacity 120ms ease;
}
.fb-pill:hover {
  filter: brightness(1.08);
}
:host([data-mode="light"]) .fb-pill:hover {
  filter: brightness(0.95);
}
.fb-pill:focus-visible {
  outline: 2px solid var(--iy-accent, currentColor);
  outline-offset: 2px;
}
.fb-pill--mutual {
  background: #123d25;
  border-color: #216e43;
  color: #9be8ba;
}
:host([data-mode="light"]) .fb-pill--mutual {
  background: #dcf5e5;
  border-color: #9ad8b3;
  color: #0e5a33;
}
.fb-pill--follower {
  background: #10304f;
  border-color: #1f5c94;
  color: #a6d1ff;
}
:host([data-mode="light"]) .fb-pill--follower {
  background: #ddeeff;
  border-color: #9ec8f5;
  color: #0b4d8a;
}
.fb-pill--notback {
  background: #45250f;
  border-color: #82441b;
  color: #ffc499;
}
:host([data-mode="light"]) .fb-pill--notback {
  background: #fde9dc;
  border-color: #f0be9c;
  color: #8a3a08;
}
.fb-pill--none {
  background: var(--iy-surface-raised, #262a30);
  border-color: var(--iy-border, #3b4048);
  color: var(--iy-muted, #c9ced6);
}
:host([data-mode="light"]) .fb-pill--none {
  background: #eef0f3;
  border-color: #d2d6dc;
  color: #3f454d;
}
.fb-pill--unknown {
  background: var(--iy-surface-raised, #252e27);
  border-color: var(--iy-border, #39473d);
  color: var(--iy-text, #eaf0e8);
}
.fb-pill--loading {
  opacity: 0.65;
  cursor: progress;
}
@media (prefers-reduced-motion: reduce) {
  .fb-pill { transition: none !important; }
}
:host([data-motion="off"]) .fb-pill { transition: none !important; }
@media (forced-colors: active) {
  .fb-pill {
    border: 1px solid ButtonText;
    background: ButtonFace;
    color: ButtonText;
  }
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
.fb-backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(8, 12, 10, 0.54);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}
.fb-dialog {
  display: flex;
  flex-direction: column;
  width: min(400px, calc(100vw - 32px));
  max-height: min(640px, calc(100vh - 32px));
  border-radius: 18px;
  border: 1px solid var(--iy-border, #39473d);
  background: var(--iy-surface, #171d19);
  color: var(--iy-text, #eaf0e8);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.42);
  overflow: hidden;
}
.fb-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 16px 14px 20px;
  border-bottom: 1px solid var(--iy-border, #39473d);
}
.fb-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--iy-text, #eaf0e8);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fb-close {
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
.fb-close:hover {
  background: var(--iy-hover, #252e27);
  color: var(--iy-text, #eaf0e8);
}
.fb-close:focus-visible {
  outline: 2px solid var(--iy-accent, #9dceab);
  outline-offset: 2px;
}
.fb-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 20px 20px;
  overflow-y: auto;
}
.fb-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid var(--iy-border, #39473d);
  background: var(--iy-surface-raised, #252e27);
}
.fb-sec-title {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--iy-muted, #acb9ae);
}
.fb-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 0;
  font-size: 14px;
}
.fb-row + .fb-row {
  border-top: 1px solid var(--iy-hairline, rgba(255, 255, 255, 0.08));
}
.fb-val-on {
  color: var(--iy-accent-text, #9dceab);
  font-weight: 600;
}
.fb-val-off {
  color: var(--iy-muted, #acb9ae);
}
.fb-note {
  margin: 0;
  font-size: 13px;
  color: var(--iy-muted, #acb9ae);
}
.fb-empty {
  margin: 0;
  padding: 20px 8px;
  text-align: center;
  color: var(--iy-muted, #acb9ae);
}
.fb-error {
  margin: 0;
  padding: 12px 14px;
  border-radius: 10px;
  border-left: 3px solid var(--iy-accent, #9dceab);
  background: var(--iy-surface-raised, #252e27);
  color: var(--iy-text, #eaf0e8);
  font-size: 13px;
}
@media (prefers-reduced-motion: reduce) {
  .fb-close { transition: none !important; }
}
:host([data-motion="off"]) .fb-close { transition: none !important; }
@media (forced-colors: active) {
  .fb-dialog, .fb-section, .fb-close { border: 1px solid ButtonText; }
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

  function getApi(deps) {
    if (deps && deps.api) return deps.api;
    return (globalThis.IY && globalThis.IY.api) || null;
  }

  function getHeaders(deps) {
    if (deps && deps.headers) return deps.headers;
    if (globalThis.IY && globalThis.IY.headers) return globalThis.IY.headers;
    if (typeof require === "function") {
      try { return require("../core/headers.js"); } catch (_) {}
    }
    return null;
  }

  function getResolve(deps) {
    if (deps && deps.resolve) return deps.resolve;
    if (globalThis.IY && globalThis.IY.resolve) return globalThis.IY.resolve;
    if (typeof require === "function") {
      try { return require("../core/resolve.js"); } catch (_) {}
    }
    return null;
  }

  function getBridge(deps) {
    if (deps && deps.bridge) return deps.bridge;
    return globalThis.IY || null;
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
      for (var i = 0; i < subs.length; i++) out = out.replace("$" + (i + 1), String(subs[i]));
      return out;
    }
    if (typeof subs === "string" || typeof subs === "number") {
      return fallback.replace("$1", String(subs));
    }
    return fallback;
  }

  /**
   * Maps friendship state to one of the 4 profile badge states (+ loading / unknown / omitted).
   * - mutual:    following && followed_by            -> "Karşılıklı"
   * - follower:  !following && followed_by (or null) -> "Seni takip ediyor"
   * - notback:   following && !followed_by (or null) -> "Seni takip etmiyor"
   * - none:      following === false && !followed_by -> "Takip etmiyorsun"
   */
  function describeState(state) {
    if (!state || state === "own" || state === "error") return null;
    if (state === "loading") {
      return {
        text: "…",
        kind: "loading",
        title: t("followBadgeLoading", "Takip durumu kontrol ediliyor")
      };
    }
    if (state === "unknown") {
      return {
        text: t("followBadgeUnknown", "Takip durumu?"),
        kind: "unknown",
        title: t("followBadgeUnknownTitle", "Bu hesabın seni takip edip etmediğini kontrol etmek için tıkla")
      };
    }
    if (typeof state === "object") {
      var following = state.following;
      var followedBy = Boolean(state.followed_by);
      if (following === true && followedBy) {
        return {
          text: t("followBadgeMutual", "Karşılıklı"),
          kind: "mutual",
          title: t("followBadgeMutualTitle", "Birbirinizi takip ediyorsunuz")
        };
      }
      if (followedBy) {
        return {
          text: t("followBadgeFollowsYou", "Seni takip ediyor"),
          kind: "follower",
          title: t("followBadgeFollowsYouTitle", "Bu hesap seni takip ediyor")
        };
      }
      if (following === false) {
        return {
          text: t("followBadgeNotFollowing", "Takip etmiyorsun"),
          kind: "none",
          title: t("followBadgeNotFollowingTitle", "Bu hesabı takip etmiyorsun ve o da seni takip etmiyor")
        };
      }
      return {
        text: t("followBadgeNotFollowingBack", "Seni takip etmiyor"),
        kind: "notback",
        title: t("followBadgeNotFollowingBackTitle", "Bu hesap seni takip etmiyor")
      };
    }
    return null;
  }

  function detailRows(d) {
    var data = d && typeof d === "object" ? d : {};
    var yes = t("followDetailsYes", "Evet");
    var no = t("followDetailsNo", "Hayır");
    var requested = t("followDetailsRequested", "İstek gönderildi");
    var incoming = t("followDetailsIncoming", "Takip etmek istiyor");

    return [
      {
        title: t("followDetailsSectionFollowing", "Takip durumu"),
        rows: [
          [
            t("followDetailsYouFollow", "Sen takip ediyorsun"),
            Boolean(data.following || data.outgoing_request),
            data.following ? yes : requested,
            no
          ],
          [
            t("followDetailsTheyFollow", "Seni takip ediyor"),
            Boolean(data.followed_by || data.incoming_request),
            data.followed_by ? yes : incoming,
            no
          ]
        ]
      },
      {
        title: t("followDetailsSectionSettings", "Bu hesap için ayarların"),
        rows: [
          [t("followDetailsCloseFriend", "Yakın arkadaş"), Boolean(data.is_bestie), yes, no],
          [t("followDetailsFavorite", "Favori"), Boolean(data.is_feed_favorite), yes, no],
          [t("followDetailsMutedPosts", "Gönderiler sessize alındı"), Boolean(data.muting), yes, no],
          [t("followDetailsMutedStories", "Hikâyeler sessize alındı"), Boolean(data.is_muting_reel), yes, no],
          [t("followDetailsMutedNotes", "Notlar sessize alındı"), Boolean(data.is_muting_notes), yes, no],
          [t("followDetailsRestricted", "Kısıtlandı"), Boolean(data.is_restricted), yes, no],
          [t("followDetailsStoryHidden", "Hikâyen bu hesaptan gizlendi"), Boolean(data.is_blocking_reel), yes, no],
          [t("followDetailsBlocked", "Engellendi"), Boolean(data.blocking), yes, no],
          [t("followDetailsSubscribed", "Abone olundu"), Boolean(data.subscribed), yes, no]
        ]
      }
    ];
  }

  function parseProfileRoute(pathname, deps) {
    var path = typeof pathname === "string"
      ? pathname
      : ((deps && deps.location && deps.location.pathname) || (globalThis.location && globalThis.location.pathname) || "/");
    var res = getResolve(deps);
    if (res && typeof res.parseRoute === "function") {
      var parsed = res.parseRoute(path);
      if (parsed && parsed.kind === "profile" && parsed.username) return parsed.username;
      return null;
    }
    var bridge = getBridge(deps);
    if (bridge && typeof bridge.profileUsernameFromPath === "function") {
      return bridge.profileUsernameFromPath(path);
    }
    return null;
  }

  function findProfileHeader(doc) {
    if (!doc || typeof doc.querySelector !== "function") return null;
    return doc.querySelector("main header") || doc.querySelector("header") || null;
  }

  function isOwnProfileHeader(header) {
    if (!header || typeof header.querySelector !== "function") return false;
    try {
      return Boolean(header.querySelector('a[href*="/accounts/edit"]'));
    } catch (_) {
      return false;
    }
  }

  function inferFollowingFromHeader(header, deps) {
    if (!header || typeof header.querySelectorAll !== "function") return null;
    var sh = getShadow(deps);
    var btns;
    try {
      btns = header.querySelectorAll('button, [role="button"]');
    } catch (_) {
      return null;
    }
    for (var i = 0; i < btns.length && i < 30; i++) {
      var b = btns[i];
      if (!b || (sh && typeof sh.isOwnUi === "function" && sh.isOwnUi(b))) continue;
      var rawTxt = typeof b.textContent === "string" ? b.textContent.trim() : "";
      var txt = rawTxt ? (typeof rawTxt.toLocaleLowerCase === "function" ? rawTxt.toLocaleLowerCase("tr") : rawTxt.toLowerCase()) : "";
      if (!txt || txt.length > 32) continue;
      if (FOLLOWING_LABELS.has(txt)) return true;
      if (NOT_FOLLOWING_LABELS.has(txt)) return false;
    }
    return null;
  }

  function usernameAnchor(username, doc) {
    var header = findProfileHeader(doc);
    if (!header || typeof header.querySelectorAll !== "function") return null;
    var target = String(username || "").trim().toLowerCase();
    if (!target) return null;
    var nodes = header.querySelectorAll("h1, h2, span");
    for (var i = 0; i < nodes.length && i < 200; i++) {
      var el = nodes[i];
      if (!el) continue;
      var childCount = typeof el.childElementCount === "number" ? el.childElementCount : (el.children ? el.children.length : 0);
      if (childCount > 0) continue;
      if (typeof el.closest === "function" && el.closest("ul")) continue;
      var text = typeof el.textContent === "string" ? el.textContent.trim().toLowerCase() : "";
      if (text !== target) continue;
      if (typeof el.getBoundingClientRect === "function") {
        var r = el.getBoundingClientRect();
        if (!(r.width > 0)) continue;
      }
      if (typeof el.closest === "function") {
        return el.closest("a") || el.closest("h1, h2") || el;
      }
      return el;
    }
    return null;
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
        if (children[c] && typeof el.appendChild === "function") el.appendChild(children[c]);
      }
    }
    return el;
  }

  function insertAfter(anchor, node) {
    if (!anchor || !node) return false;
    if (typeof anchor.insertAdjacentElement === "function") {
      anchor.insertAdjacentElement("afterend", node);
      return true;
    }
    if (anchor.parentNode && typeof anchor.parentNode.insertBefore === "function") {
      anchor.parentNode.insertBefore(node, anchor.nextSibling || null);
      return true;
    }
    if (anchor.parentNode && typeof anchor.parentNode.appendChild === "function") {
      anchor.parentNode.appendChild(node);
      return true;
    }
    return false;
  }

  function createController(deps) {
    var d = deps || {};
    var waits = Array.isArray(d.waits) ? d.waits : PAGE_DATA_WAITS;
    var active = false;
    var states = new Map();
    var badge = null; // { record, host, key, kind }
    var modalRecord = null;
    var modalCloseFn = null;
    var modalGen = 0;
    var loadGen = 0;
    var pendingTimers = new Set();
    var refreshTimer = 0;
    var lastPath = "";
    var cleanups = [];

    function getDoc() { return d.document || (typeof document !== "undefined" ? document : null); }
    function getLoc() { return d.location || (typeof location !== "undefined" ? location : { pathname: "/" }); }

    function setState(key, value) {
      if (states.has(key)) states.delete(key);
      while (states.size >= MAX_STATES) {
        var oldest = states.keys().next().value;
        if (oldest === undefined) break;
        states.delete(oldest);
      }
      states.set(key, value);
    }

    function sleep(ms) {
      return new Promise(function (resolve) {
        var id = setTimeout(function () {
          pendingTimers.delete(id);
          resolve();
        }, ms);
        pendingTimers.add(id);
      });
    }

    function clearPendingTimers() {
      pendingTimers.forEach(function (id) { clearTimeout(id); });
      pendingTimers.clear();
      if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = 0;
      }
    }

    function applySettingsTheme(settings) {
      var sh = getShadow(d);
      var ui = settings && settings.ui;
      if (!sh || !ui) return;
      if (typeof ui.theme === "string" && typeof sh.setTheme === "function") sh.setTheme(ui.theme);
      if (typeof ui.animations === "boolean" && typeof sh.setMotion === "function") sh.setMotion(ui.animations);
    }

    function removeBadge() {
      if (badge) {
        if (badge.record && typeof badge.record.destroy === "function") badge.record.destroy();
        else if (badge.host && typeof badge.host.remove === "function") badge.host.remove();
        badge = null;
      }
    }

    function closeModal() {
      modalGen++;
      if (typeof modalCloseFn === "function") {
        var fn = modalCloseFn;
        modalCloseFn = null;
        fn();
      } else if (modalRecord) {
        modalRecord.destroy();
        modalRecord = null;
      }
    }

    function getMyUserId() {
      if (typeof d.myUserId === "function") return d.myUserId();
      var hdr = getHeaders(d);
      return hdr && typeof hdr.myUserId === "function" ? hdr.myUserId() : undefined;
    }

    function readBridgeFollows(username) {
      var br = getBridge(d);
      if (br && typeof br.getFollowsYou === "function") {
        var v = br.getFollowsYou(username);
        if (typeof v === "boolean") return v;
      }
      return null;
    }

    /**
     * Passive-only resolution: uses net.js/bridge.js + Relay knownUser without sending any network request.
     */
    async function probePassive(username) {
      var header = findProfileHeader(getDoc());
      if (isOwnProfileHeader(header)) return "own";

      var api = getApi(d);
      var known = null;
      if (api && typeof api.knownUser === "function") {
        try {
          known = await api.knownUser(username);
        } catch (_) {
          known = null;
        }
      }
      var myId = getMyUserId();
      if (known && known.id && myId && String(known.id) === String(myId)) {
        return "own";
      }
      if (known && known.fs && typeof known.fs.followed_by === "boolean") {
        return { following: Boolean(known.fs.following), followed_by: known.fs.followed_by };
      }

      // Fall back to passive capture already collected by net.js -> bridge.js.
      var bridgeFlag = readBridgeFollows(username);
      if (typeof bridgeFlag === "boolean") {
        var headerFollowing = inferFollowingFromHeader(header, d);
        return { following: headerFollowing, followed_by: bridgeFlag };
      }
      return null;
    }

    async function load(username, waitList) {
      var key = String(username || "").trim().toLowerCase();
      if (!key || !active) return;
      var myGen = ++loadGen;
      var prev = states.get(key);
      if (prev === undefined) setState(key, "loading");
      render();

      var schedule = Array.isArray(waitList) ? waitList : waits;
      var resolved = prev && prev !== "loading" ? prev : "unknown";

      for (var i = 0; i < schedule.length; i++) {
        var waitMs = schedule[i];
        if (waitMs > 0) await sleep(waitMs);
        if (!active || myGen !== loadGen) return;
        var currentUser = parseProfileRoute(getLoc().pathname, d);
        if (!currentUser || currentUser.toLowerCase() !== key) return;

        var hit = await probePassive(username);
        if (!active || myGen !== loadGen) return;
        if (hit) {
          resolved = hit;
          // If Relay gave us complete { following: boolean, followed_by: boolean } or "own", stop waiting.
          if (hit === "own" || (typeof hit === "object" && typeof hit.following === "boolean")) {
            break;
          }
          // We already have passive bridge data; show it immediately while allowing Relay to refine on later wait.
          setState(key, resolved);
          render();
        }
      }

      if (!active || myGen !== loadGen) return;
      setState(key, resolved);
      render();
    }

    async function lookUp(username) {
      var key = String(username || "").trim().toLowerCase();
      if (!key || !active) return;
      var myGen = ++loadGen;
      setState(key, "loading");
      render();

      var api = getApi(d);
      if (!api || typeof api.getUserId !== "function" || typeof api.getFriendship !== "function") {
        setState(key, "error");
        render();
        return;
      }

      try {
        var results = await Promise.all([api.getUserId(username), api.getFriendship(username)]);
        if (!active || myGen !== loadGen) return;
        var uid = results[0];
        var rel = results[1];
        var myId = getMyUserId();
        if (uid && myId && String(uid) === String(myId)) {
          setState(key, "own");
        } else {
          setState(key, { following: Boolean(rel && rel.following), followed_by: Boolean(rel && rel.followed_by) });
        }
      } catch (_) {
        if (!active || myGen !== loadGen) return;
        setState(key, "error");
      }
      render();
    }

    async function openDetails(username, opener) {
      var clean = String(username || "").trim();
      if (!clean) return null;
      closeModal();
      var sh = getShadow(d);
      var doc = getDoc();
      if (!sh || !doc) return null;

      var myGen = ++modalGen;
      var titleId = "iy-fb-title-" + myGen;
      var heading = createEl(doc, "h2", {
        id: titleId,
        className: "fb-title",
        textContent: t("followDetailsTitle", "Sen ve @$1", [clean])
      });
      var closeLabel = t("followDetailsClose", "Kapat");
      var closeBtn = createEl(doc, "button", {
        type: "button",
        className: "fb-close",
        title: closeLabel,
        "aria-label": closeLabel
      }, [sh.icon("close", 18)]);

      var loadingEl = createEl(doc, "p", {
        className: "fb-empty",
        textContent: t("followDetailsLoading", "Yükleniyor…")
      });
      var body = createEl(doc, "div", { className: "fb-body" }, [loadingEl]);
      var head = createEl(doc, "div", { className: "fb-head" }, [heading, closeBtn]);
      var dialog = createEl(doc, "div", {
        className: "fb-dialog",
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": titleId
      }, [head, body]);
      var backdrop = createEl(doc, "div", { className: "fb-backdrop" }, [dialog]);

      var rec = sh.createHost({
        document: doc,
        className: "iy-follow-details-modal-host",
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

      var api = getApi(d);
      if (!api || typeof api.getFriendshipDetails !== "function") {
        if (!closed) {
          loadingEl.className = "fb-error";
          loadingEl.textContent = t("followDetailsError", "Takip ayrıntıları yüklenemedi.");
        }
        return { close: doClose, host: rec.host, body: body };
      }

      try {
        var details = await api.getFriendshipDetails(clean);
        if (closed || myGen !== modalGen) return { close: doClose, host: rec.host, body: body };

        // Sync badge with fresh authoritative relationship flags.
        if (details && typeof details === "object" && typeof details.followed_by === "boolean") {
          setState(clean.toLowerCase(), {
            following: Boolean(details.following),
            followed_by: details.followed_by
          });
          if (active) render();
        }

        if (typeof body.replaceChildren === "function") body.replaceChildren();
        else if (Array.isArray(body.children)) body.children.length = 0;

        if (details && details.is_private) {
          body.appendChild(createEl(doc, "p", {
            className: "fb-note",
            textContent: t("followDetailsPrivate", "Gizli hesap")
          }));
        }

        var sections = detailRows(details);
        for (var s = 0; s < sections.length; s++) {
          var sec = sections[s];
          var secKids = [createEl(doc, "h3", { className: "fb-sec-title", textContent: sec.title })];
          for (var r = 0; r < sec.rows.length; r++) {
            var row = sec.rows[r];
            var on = Boolean(row[1]);
            secKids.push(createEl(doc, "div", { className: "fb-row" }, [
              createEl(doc, "span", { textContent: row[0] }),
              createEl(doc, "span", {
                className: on ? "fb-val-on" : "fb-val-off",
                textContent: on ? row[2] : row[3]
              })
            ]));
          }
          body.appendChild(createEl(doc, "section", { className: "fb-section" }, secKids));
        }
      } catch (err) {
        if (closed || myGen !== modalGen) return { close: doClose, host: rec.host, body: body };
        loadingEl.className = "fb-error";
        if (err && err.rateLimited) {
          var mins = Number.isFinite(err.remainingMs) && err.remainingMs > 0 ? Math.ceil(err.remainingMs / 60000) : 30;
          loadingEl.textContent = t("followDetailsRateLimited", "Instagram istekleri geçici olarak sınırladı ($1 dk bekle).", [String(mins)]);
        } else {
          loadingEl.textContent = t("followDetailsError", "Takip ayrıntıları yüklenemedi.");
        }
      }

      return { close: doClose, host: rec.host, body: body };
    }

    function render() {
      if (!active) {
        removeBadge();
        return;
      }
      var doc = getDoc();
      var sh = getShadow(d);
      var username = parseProfileRoute(getLoc().pathname, d);

      if (badge && (!username || badge.key !== username.toLowerCase())) {
        removeBadge();
      }
      if (!username || !doc || !sh) return;

      var key = username.toLowerCase();
      var state = states.get(key);
      if (state === undefined) {
        load(username);
        return;
      }

      var info = describeState(state);
      if (!info) {
        removeBadge();
        return;
      }

      if (badge && badge.host && badge.host.isConnected && badge.key === key && badge.kind === info.kind) {
        return;
      }

      var anchor = usernameAnchor(username, doc);
      if (!anchor) return;

      removeBadge();

      var pill;
      function handleActivate(e) {
        if (e && typeof e.preventDefault === "function") e.preventDefault();
        if (e && typeof e.stopPropagation === "function") e.stopPropagation();
        var cur = states.get(key);
        if (cur === "loading") return;
        if (cur === "unknown") lookUp(username);
        else openDetails(username, pill);
      }

      var tooltip = state === "unknown"
        ? info.title
        : t("followBadgeDetailsHint", "$1 · Ayrıntılar için tıkla", [info.title]);

      pill = createEl(doc, "span", {
        className: "fb-pill fb-pill--" + info.kind,
        title: tooltip,
        role: "button",
        tabindex: "0",
        "aria-label": tooltip,
        "aria-haspopup": state === "unknown" ? "false" : "dialog",
        textContent: info.text
      });
      pill.addEventListener("click", handleActivate);
      pill.addEventListener("keydown", function (e) {
        if (e && (e.key === "Enter" || e.key === " ")) handleActivate(e);
      });

      var rec = sh.createHost({
        document: doc,
        tag: "span",
        className: "iy-follow-badge-host",
        css: BADGE_CSS,
        top: pill
      });

      if (insertAfter(anchor, rec.host)) {
        badge = { record: rec, host: rec.host, key: key, kind: info.kind, pill: pill };
      } else {
        rec.destroy();
      }
    }

    function onRouteChange() {
      if (!active) return;
      var nextPath = getLoc().pathname || "";
      if (nextPath !== lastPath) {
        lastPath = nextPath;
        closeModal();
        clearPendingTimers();
        loadGen++;
      }
      render();
    }

    function onHeaderClick(e) {
      if (!active || !e) return;
      var username = parseProfileRoute(getLoc().pathname, d);
      if (!username) return;
      var target = e.target;
      var sh = getShadow(d);
      if (!target || (sh && typeof sh.isOwnUi === "function" && sh.isOwnUi(target))) return;
      if (typeof target.closest !== "function" || !target.closest('header button, header [role="button"]')) return;

      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(function () {
        refreshTimer = 0;
        if (active) load(username, [0, 1500]);
      }, 1500);
    }

    function start(settings) {
      if (active) return;
      active = true;
      lastPath = getLoc().pathname || "";
      applySettingsTheme(settings);

      var doc = getDoc();
      var core = d.core || (globalThis.IY && globalThis.IY.core);
      var br = getBridge(d);

      if (core && typeof core.route === "function") {
        cleanups.push(core.route(onRouteChange));
      }
      if (core && typeof core.observe === "function") {
        cleanups.push(core.observe(function () { return Boolean(parseProfileRoute(getLoc().pathname, d)); }, render));
      }
      if (br && typeof br.onFollows === "function") {
        cleanups.push(br.onFollows(function (key, follows) {
          if (!active || typeof key !== "string" || typeof follows !== "boolean") return;
          var existing = states.get(key);
          if (existing === "own") return;
          if (existing && typeof existing === "object" && typeof existing.following === "boolean") {
            setState(key, { following: existing.following, followed_by: follows });
          } else {
            var header = findProfileHeader(getDoc());
            var headerFollowing = inferFollowingFromHeader(header, d);
            setState(key, { following: headerFollowing, followed_by: follows });
          }
          var currentUser = parseProfileRoute(getLoc().pathname, d);
          if (currentUser && currentUser.toLowerCase() === key) render();
        }));
      }
      if (doc && typeof doc.addEventListener === "function") {
        doc.addEventListener("click", onHeaderClick, true);
        cleanups.push(function () { doc.removeEventListener("click", onHeaderClick, true); });
      }

      render();
    }

    function update(settings) {
      applySettingsTheme(settings);
      if (active) render();
    }

    function stop() {
      active = false;
      loadGen++;
      clearPendingTimers();
      closeModal();
      removeBadge();
      while (cleanups.length) {
        try { cleanups.pop()(); } catch (_) {}
      }
    }

    return {
      start: start,
      update: update,
      stop: stop,
      render: render,
      onRouteChange: onRouteChange,
      load: load,
      lookUp: lookUp,
      openDetails: openDetails,
      closeModal: closeModal,
      getState: function (username) { return states.get(String(username || "").trim().toLowerCase()); },
      getBadge: function () { return badge; },
      isActive: function () { return active; },
      isModalOpen: function () { return !!modalRecord; },
      getModalHost: function () { return modalRecord && modalRecord.host; }
    };
  }

  var controller = createController();

  if (globalThis.IY && globalThis.IY.core && typeof globalThis.IY.core.feature === "function") {
    globalThis.IY.core.feature("followBadge", {
      keys: ["ui"],
      enabled: function (settings) {
        return !settings.ui || settings.ui.followsBadge !== false;
      },
      start: function (settings) { controller.start(settings); },
      update: function (settings) { controller.update(settings); },
      stop: function () { controller.stop(); }
    });
  }

  var api = {
    BADGE_CSS: BADGE_CSS,
    MODAL_CSS: MODAL_CSS,
    describeState: describeState,
    detailRows: detailRows,
    usernameAnchor: usernameAnchor,
    inferFollowingFromHeader: inferFollowingFromHeader,
    createController: createController,
    openDetails: function (username, opener) { return controller.openDetails(username, opener); },
    getState: function (username) { return controller.getState(username); }
  };

  globalThis.IY = Object.assign(globalThis.IY || {}, { followBadge: api });
  if (isNode) module.exports = api;
})();
