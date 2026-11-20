// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
// Resumable unfollowers scanner UI: themed closed-ShadowRoot modal from profile/dock,
// Follow lists, comparison tabs, keep list and history,
// search, formula-safe CSV export, keep list management, and unfollow queue integration.
(function () {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;
  var historyLib = isNode ? require("./unfollowers-history.js") : (globalThis.IY && globalThis.IY.unfollowersHistory) || {};
  var queueLib = isNode ? require("./unfollow-queue.js") : (globalThis.IY && globalThis.IY.unfollowQueue) || {};
  var headersLib = isNode ? require("../core/headers.js") : (globalThis.IY && globalThis.IY.headers) || {};
  var resolveLib = isNode ? require("../core/resolve.js") : (globalThis.IY && globalThis.IY.resolve) || {};
  var shadowLib = isNode ? require("../ui/shadow.js") : (globalThis.IY && globalThis.IY.shadow) || null;

  var MAX_ROWS = 500;

  var TAB_DEFS = Object.freeze([
    { id: "notBack", key: "unfTabNotBack", tr: "Geri takip etmeyenler", en: "Doesn't follow back" },
    { id: "unfollowedYou", key: "unfTabUnfollowedYou", tr: "Takibi bırakanlar", en: "Unfollowed you" },
    { id: "newFollowers", key: "unfTabNewFollowers", tr: "Yeni takipçiler", en: "New followers" },
    { id: "keepList", key: "unfTabKeepList", tr: "Koruma listesi", en: "Keep list" },
    { id: "history", key: "unfTabHistory", tr: "Geçmiş", en: "History" },
    { id: "followers", tr: "Takipçiler", en: "Followers" },
    { id: "following", tr: "Takip edilenler", en: "Following" }
  ]);

  var TAB_ALIASES = Object.freeze({
    notBack: "notBack",
    unfollowedYou: "unfollowedYou",
    lost: "unfollowedYou",
    newFollowers: "newFollowers",
    gained: "newFollowers",
    keepList: "keepList",
    keep: "keepList",
    history: "history",
    changes: "history", followers: "followers", following: "following"
  });

  var PICK_TABS = Object.freeze(["notBack", "unfollowedYou"]);

  var MESSAGES = {
    tr: {
      unfTitle: "Takibi bırakanları kontrol et",
      unfTrigger: "Takibi bırakanlar",
      unfClose: "Kapat",
      unfScan: "Tara",
      unfRescan: "Yeniden tara",
      unfResume: "Taramaya devam et",
      unfPause: "Duraklat",
      unfExportCsv: "CSV dışa aktar",
      unfQueueBtn: "Takipten çıkma kuyruğu ($1)",
      unfSearchPlaceholder: "Kullanıcı adı veya isim ara",
      unfSearchLabel: "Ara",
      unfSelectAll: "Tümünü seç ($1)",
      unfSelectAllShown: "Gösterilenleri seç ($1)",
      unfClearSelection: "Seçimi temizle",
      unfSelectedCount: "$1 seçildi",
      unfKeptCount: "$1 korumada",
      unfKeepBtn: "Koru",
      unfKeptBtn: "Korunuyor",
      unfKeepTip: "Koru: bu hesap hiçbir zaman takipten çıkma kuyruğuna alınmaz",
      unfKeptTip: "Korumada: takipten çıkma kuyruğuna alınmaz. Kaldırmak için tıkla.",
      unfNotScanned: "Henüz tarama yapılmadı.",
      unfLastScan: "Son tarama: $1 · $2 takipçi · $3 takip edilen",
      unfPartialScan: "Yarım kalan tarama: $1 · $2 takipçi · $3 takip edilen",
      unfLoadingFollowers: "Takipçiler yükleniyor… $1",
      unfLoadingFollowing: "Takip edilenler yükleniyor… $1",
      unfSafetyPause: "Güvenlik molası, $1 sn… ($2 hesap okundu)",
      unfRateLimited: "Instagram istekleri geçici olarak sınırladı ($1 dk bekle). İlerleme kaydedildi.",
      unfLoginRequired: "Önce Instagram'a giriş yapmalısın.",
      unfEmptyBeforeScan: "Takipçilerini ve takip ettiklerini yüklemek için Tara'ya bas.",
      unfEmptyList: "Burada kimse yok.",
      unfEmptyHistory: "Değişiklikler ikinci tam taramadan itibaren burada görünür. Her tarama bir öncekiyle karşılaştırılır.",
      unfEmptyKeep: "Koruma listen boş. Listelerdeki 'Koru' düğmesiyle veya yukarıdan hesap ekleyebilirsin.",
      unfKeepAddPlaceholder: "@kullanıcıadı ekle",
      unfKeepAddBtn: "Ekle",
      unfShowingFirst: "İlk $1 kayıt gösteriliyor (toplam $2). Geri kalanı için arama yap veya CSV dışa aktar.",
      unfSinceScan: "$1 tarihli taramadan bu yana",
      unfNoChangesSince: "$1 tarihli taramadan bu yana değişiklik yok",
      unfNewBadge: "Yeni",
      unfFirstScanRow: "İlk tarama: $1 takipçi · $2 takip edilen",
      unfHistoryRowHead: "$1 takipçi ($2) · $3 takip edilen ($4)",
      unfNoChangesEntry: "Önceki taramadan bu yana değişiklik yok.",
      unfShowAllChanges: "Tüm değişiklikleri göster"
    },
    en: {
      unfTitle: "Unfollowers checker",
      unfTrigger: "Unfollowers",
      unfClose: "Close",
      unfScan: "Scan",
      unfRescan: "Rescan",
      unfResume: "Resume scan",
      unfPause: "Pause",
      unfExportCsv: "Export CSV",
      unfQueueBtn: "Unfollow queue ($1)",
      unfSearchPlaceholder: "Search username or name",
      unfSearchLabel: "Search",
      unfSelectAll: "Select all ($1)",
      unfSelectAllShown: "Select all shown ($1)",
      unfClearSelection: "Clear selection",
      unfSelectedCount: "$1 selected",
      unfKeptCount: "$1 kept",
      unfKeepBtn: "Keep",
      unfKeptBtn: "Kept",
      unfKeepTip: "Keep: never select this account for unfollowing",
      unfKeptTip: "Kept: never selected for unfollowing. Click to allow it again.",
      unfNotScanned: "Not scanned yet.",
      unfLastScan: "Last scan: $1 · $2 followers · $3 following",
      unfPartialScan: "Partial scan: $1 · $2 followers · $3 following",
      unfLoadingFollowers: "Loading followers… $1",
      unfLoadingFollowing: "Loading following… $1",
      unfSafetyPause: "Safety pause, $1 s… ($2 loaded so far)",
      unfRateLimited: "Instagram rate-limited requests recently (wait $1 min). Progress saved.",
      unfLoginRequired: "Log in to Instagram first.",
      unfEmptyBeforeScan: "Press Scan to load your followers and following.",
      unfEmptyList: "Nobody here.",
      unfEmptyHistory: "Changes show up here from your second full scan on. Each scan is compared with the one before it.",
      unfEmptyKeep: "Your keep list is empty. Use the 'Keep' button on any account or add a username above.",
      unfKeepAddPlaceholder: "Add @username",
      unfKeepAddBtn: "Add",
      unfShowingFirst: "Showing $1 of $2. Use search or export CSV for the rest.",
      unfSinceScan: "Since your scan on $1",
      unfNoChangesSince: "No changes since your scan on $1",
      unfNewBadge: "New",
      unfFirstScanRow: "First scan: $1 followers · $2 following",
      unfHistoryRowHead: "$1 followers ($2) · $3 following ($4)",
      unfNoChangesEntry: "No changes since the scan before.",
      unfShowAllChanges: "Show all changes"
    }
  };

  var TRIGGER_CSS = `:host {
  position: static;
  align-self: center;
  margin-inline-start: 6px;
  display: inline-flex;
  pointer-events: auto;
  font: 600 12px/1 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--iy-text, #eaf0e8);
}
.unf-trigger {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--iy-hairline, rgba(255, 255, 255, 0.14));
  background: var(--iy-glass, #171d19eb);
  color: var(--iy-text, #eaf0e8);
  white-space: nowrap;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  font: inherit;
  cursor: pointer;
  transition: transform 120ms ease, background-color 120ms ease;
}
.unf-trigger:hover {
  background: var(--iy-surface-raised, #252e27);
}
.unf-trigger:focus-visible {
  outline: 2px solid var(--iy-accent, #9dceab);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .unf-trigger { transition: none !important; }
}
:host([data-motion="off"]) .unf-trigger { transition: none !important; }`;

  var MODAL_CSS = `:host {
  position: fixed;
  inset: 0;
  z-index: 2147483645;
  display: block;
  pointer-events: auto;
  font: 500 13px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--iy-text, #eaf0e8);
  -webkit-font-smoothing: antialiased;
  color-scheme: dark;
}
:host([data-mode="light"]) {
  color-scheme: light;
}
*, *::before, *::after {
  box-sizing: border-box;
}
[hidden], .is-hidden {
  display: none !important;
}
.unf-backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(8, 12, 10, 0.58);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}
.unf-dialog {
  display: flex;
  flex-direction: column;
  width: min(620px, calc(100vw - 32px));
  max-height: min(740px, calc(100vh - 32px));
  border-radius: 18px;
  border: 1px solid var(--iy-border, #39473d);
  background: var(--iy-surface, #171d19);
  color: var(--iy-text, #eaf0e8);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.48);
  overflow: hidden;
}
.unf-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 14px 20px;
  border-bottom: 1px solid var(--iy-border, #39473d);
}
.unf-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--iy-text, #eaf0e8);
}
.unf-close {
  appearance: none;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--iy-muted, #acb9ae);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.unf-close:hover {
  background: var(--iy-hover, #252e27);
  color: var(--iy-text, #eaf0e8);
}
.unf-close:focus-visible, .unf-btn:focus-visible, .unf-tab:focus-visible, .unf-input:focus-visible, .unf-chip:focus-visible {
  outline: 2px solid var(--iy-accent, #9dceab);
  outline-offset: 2px;
}
.unf-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 20px;
  overflow-y: auto;
}
.unf-status {
  margin: 0;
  font-size: 13px;
  color: var(--iy-muted, #acb9ae);
  font-variant-numeric: tabular-nums;
}
.unf-summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid var(--iy-border, #39473d);
  background: var(--iy-surface-raised, #252e27);
}
.unf-summary.is-new {
  border-color: var(--iy-accent, #9dceab);
}
.unf-summary-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-weight: 600;
}
.unf-new-pill {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--iy-accent, #9dceab);
  color: var(--iy-on-accent, #17251c);
  font-size: 11px;
  font-weight: 700;
}
.unf-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.unf-chip {
  appearance: none;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--iy-border, #39473d);
  background: var(--iy-surface, #171d19);
  color: var(--iy-text, #eaf0e8);
  font: 600 12px/1 inherit;
  cursor: pointer;
}
.unf-chip:disabled {
  opacity: 0.5;
  cursor: default;
}
.unf-tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
}
.unf-tab {
  appearance: none;
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--iy-border, #39473d);
  background: var(--iy-surface-raised, #252e27);
  color: var(--iy-text, #eaf0e8);
  font: 600 12px/1 inherit;
  cursor: pointer;
}
.unf-tab.is-active {
  border-color: transparent;
  background: var(--iy-accent, #9dceab);
  color: var(--iy-on-accent, #17251c);
}
.unf-badge {
  font-variant-numeric: tabular-nums;
  opacity: 0.85;
}
.unf-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--iy-accent, #9dceab);
}
.unf-input {
  width: 100%;
  min-height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--iy-border, #39473d);
  background: var(--iy-surface-raised, #252e27);
  color: var(--iy-text, #eaf0e8);
  font: inherit;
}
.unf-keep-form {
  display: flex;
  gap: 8px;
}
.unf-pickbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: var(--iy-muted, #acb9ae);
}
.unf-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 200px;
  max-height: 340px;
  overflow-y: auto;
}
.unf-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 10px;
}
.unf-row:hover {
  background: var(--iy-surface-raised, #252e27);
}
.unf-row.is-kept .unf-user {
  opacity: 0.65;
}
.unf-check {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--iy-accent, #9dceab);
  cursor: pointer;
}
.unf-user {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  color: inherit;
  text-decoration: none;
}
.unf-avatar, .unf-initial {
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--iy-surface-raised, #252e27);
  border: 1px solid var(--iy-border, #39473d);
}
.unf-initial {
  display: grid;
  place-items: center;
  font-weight: 700;
  color: var(--iy-accent-text, #9dceab);
}
.unf-names {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.unf-names strong {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.unf-names span {
  font-size: 12px;
  color: var(--iy-muted, #acb9ae);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.unf-empty {
  margin: 0;
  padding: 24px 8px;
  text-align: center;
  color: var(--iy-muted, #acb9ae);
}
.unf-hist-head {
  margin: 10px 4px 2px;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.unf-hist-group {
  margin: 6px 4px 2px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--iy-muted, #acb9ae);
}
.unf-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--iy-border, #39473d);
}
.unf-btn {
  appearance: none;
  min-height: 40px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid var(--iy-border, #39473d);
  background: var(--iy-surface-raised, #252e27);
  color: var(--iy-text, #eaf0e8);
  font: 600 13px/1 inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.unf-btn--sm {
  min-height: 30px;
  padding: 0 10px;
  border-radius: 8px;
  font-size: 12px;
}
.unf-btn--primary {
  border-color: transparent;
  background: var(--iy-accent, #9dceab);
  color: var(--iy-on-accent, #17251c);
}
.unf-btn--danger {
  border-color: transparent;
  background: #e0245e;
  color: #ffffff;
}
.unf-btn.is-active {
  border-color: var(--iy-accent, #9dceab);
  color: var(--iy-accent-text, #9dceab);
}
.unf-btn:disabled {
  opacity: 0.48;
  cursor: default;
}
` + (queueLib.QUEUE_CSS || "");

  function detectLocale(deps) {
    if (deps && typeof deps.locale === "string" && deps.locale) {
      return /^en/i.test(deps.locale.trim()) ? "en" : "tr";
    }
    try {
      if (typeof chrome !== "undefined" && chrome && chrome.i18n && typeof chrome.i18n.getUILanguage === "function") {
        var lang = chrome.i18n.getUILanguage();
        if (typeof lang === "string" && lang) return /^en/i.test(lang.trim()) ? "en" : "tr";
      }
    } catch (_) {}
    return "tr";
  }

  function translate(key, subs, locale) {
    var lang = locale === "en" ? "en" : "tr";
    var list = Array.isArray(subs) ? subs : (subs !== undefined && subs !== null ? [String(subs)] : []);
    try {
      if (typeof chrome !== "undefined" && chrome && chrome.i18n && typeof chrome.i18n.getMessage === "function") {
        var msg = chrome.i18n.getMessage(key, list);
        if (msg) {
          for (var i = 0; i < list.length; i++) msg = msg.replace("$" + (i + 1), String(list[i]));
          return msg;
        }
      }
    } catch (_) {}
    var table = MESSAGES[lang] || MESSAGES.tr;
    var raw = table[key] !== undefined ? table[key] : (MESSAGES.tr[key] || key);
    for (var j = 0; j < list.length; j++) {
      raw = raw.replace("$" + (j + 1), String(list[j]));
    }
    return raw;
  }

  function normalizeTab(tabId) {
    var id = String(tabId || "notBack").trim();
    return Object.prototype.hasOwnProperty.call(TAB_ALIASES, id) ? TAB_ALIASES[id] : "notBack";
  }

  function signed(n) {
    return n > 0 ? "+" + n : (n < 0 ? "−" + (-n) : "±0");
  }

  function saveCsvFile(doc, rootContainer, filename, csvText, deps) {
    var d = deps || {};
    var text = typeof csvText === "string" ? csvText : "";
    var withBom = text.indexOf("\uFEFF") === 0 ? text : "\uFEFF" + text;
    if (typeof d.onExportCsv === "function") {
      d.onExportCsv(filename, withBom);
    }
    var URLCtor = (d.URL || globalThis.URL);
    var BlobCtor = (d.Blob || globalThis.Blob);
    if (!doc || !URLCtor || typeof URLCtor.createObjectURL !== "function" || typeof BlobCtor !== "function") {
      return { filename: filename, content: withBom };
    }
    var blob = new BlobCtor([withBom], { type: "text/csv;charset=utf-8" });
    var url = URLCtor.createObjectURL(blob);
    var a = doc.createElement("a");
    a.setAttribute("href", url);
    a.setAttribute("download", filename);
    a.hidden = true;
    // Append for a moment inside our shadow root so Firefox triggers the download reliably without touching IG's DOM.
    if (rootContainer && typeof rootContainer.appendChild === "function") {
      rootContainer.appendChild(a);
    }
    if (typeof a.click === "function") a.click();
    if (typeof a.remove === "function") a.remove();
    var revokeTimer = setTimeout(function () {
      try { URLCtor.revokeObjectURL(url); } catch (_) {}
    }, 5000);
    if (revokeTimer && typeof revokeTimer.unref === "function") revokeTimer.unref();
    return { filename: filename, content: withBom, url: url };
  }

  function createController(deps) {
    var d = deps || {};
    var storage = historyLib.createStorageHelper ? historyLib.createStorageHelper(d.storage) : null;
    var scanner = d.scanner || (historyLib.createScanner ? historyLib.createScanner(Object.assign({}, d, { storage: storage })) : null);
    var queueCtrl = d.queueController || (queueLib.createQueueController ? queueLib.createQueueController(Object.assign({}, d, { storage: storage })) : null);

    var active = false;
    var triggerRecord = null;
    var boundHeader = null, countStyle = null;
    var modalGeneration = 0;
    var modalRecord = null;
    var modalApi = null;
    var cleanups = [];

    function getDoc() { return d.document || (typeof document !== "undefined" ? document : null); }
    function getLoc() { return d.location || (typeof location !== "undefined" ? location : { pathname: "/" }); }
    function getShadow() { return d.shadow || shadowLib || (globalThis.IY && globalThis.IY.shadow); }

    function getMyUserId() {
      if (typeof d.myUserId === "function") return d.myUserId();
      if (headersLib && typeof headersLib.myUserId === "function") return headersLib.myUserId();
      return undefined;
    }

    function applyTheme(settings) {
      var sh = getShadow();
      var ui = settings && settings.ui;
      if (!sh || !ui) return;
      if (typeof ui.theme === "string" && typeof sh.setTheme === "function") sh.setTheme(ui.theme);
      if (typeof ui.animations === "boolean" && typeof sh.setMotion === "function") sh.setMotion(ui.animations);
    }

    function isProfileRoute() {
      var path = (getLoc() && getLoc().pathname) || "/";
      if (resolveLib && typeof resolveLib.parseRoute === "function") {
        var r = resolveLib.parseRoute(path);
        return Boolean(r && r.kind === "profile" && r.username);
      }
      var parts = path.split(/[?#]/)[0].split("/").filter(Boolean);
      return parts.length === 1 && !/^(explore|reels|direct|stories|accounts|p|tv)$/i.test(parts[0]);
    }

    function removeTrigger() {
      if (boundHeader) {
        boundHeader.removeEventListener("click", onCountClick, true);
        boundHeader.removeAttribute("data-iy-unfollowers");
      }
      if (countStyle) countStyle.remove();
      boundHeader = countStyle = null;
      if (triggerRecord) {
        triggerRecord.destroy();
        triggerRecord = null;
      }
    }

    function onCountClick(e) {
      if (!active || e.defaultPrevented || e.button > 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      var link = e.target.closest?.("a[href]");
      var match = link && /^\/([\w.]+)\/(followers|following)\/?$/.exec(link.pathname || "");
      if (!match || getLoc().pathname.split("/")[1] !== match[1] || !getMyUserId()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      openModal(link, match[2]);
    }

    function renderTrigger() {
      if (!active || !isProfileRoute()) {
        removeTrigger();
        return;
      }
      var doc = getDoc();
      var sh = getShadow();
      if (!doc || !sh) return;
      var header = doc.querySelector('main header, [role="main"] header');
      var heading = header?.querySelector('h1, h2, [role="heading"]');
      if (!heading) { removeTrigger(); return; }
      var icon = header.querySelector('[aria-label*="Settings" i], [aria-label*="Options" i], [aria-label*="Ayar" i], [aria-label*="Seçenek" i]');
      var gear = icon?.closest('button, a, [role="button"]');
      var anchor = gear || heading.closest('a, button') || heading;
      if (gear) {
        // Keep wrappers around the gear inside their original button group.
        while (anchor.parentElement !== header && !anchor.parentElement.contains(heading)) anchor = anchor.parentElement;
      }
      var ownProfile = !!header.querySelector('a[href^="/accounts/edit"], [aria-label*="Settings" i], [aria-label*="Ayar" i]');
      if (triggerRecord?.host.isConnected && anchor.nextElementSibling === triggerRecord.host && !!boundHeader === ownProfile) return;
      removeTrigger();

      var locale = detectLocale(d);
      var btn = doc.createElement("button");
      btn.type = "button";
      btn.className = "unf-trigger";
      btn.textContent = translate("unfTrigger", [], locale);
      btn.addEventListener("click", function (e) {
        if (e && typeof e.stopPropagation === "function") e.stopPropagation();
        openModal(btn, "unfollowedYou");
      });

      triggerRecord = sh.createHost({
        document: doc,
        className: "iy-unfollowers-trigger-host",
        css: TRIGGER_CSS,
        top: btn,
        parent: anchor.parentElement
      });
      anchor.after(triggerRecord.host);
      if (ownProfile) {
        boundHeader = header;
        boundHeader.setAttribute("data-iy-unfollowers", "");
        boundHeader.addEventListener("click", onCountClick, true);
        countStyle = doc.createElement("style");
        countStyle.textContent = '[data-iy-unfollowers] a:is([href$="/followers/"], [href$="/following/"], [href$="/followers"], [href$="/following"]):hover { text-decoration: underline; text-decoration-color: color-mix(in srgb, currentColor 45%, transparent); text-underline-offset: 3px; }';
        header.appendChild(countStyle);
      }
    }

    function closeModal() {
      modalGeneration++;
      if (modalApi && typeof modalApi.close === "function") {
        var fn = modalApi.close;
        modalApi = null;
        fn();
      } else if (modalRecord) {
        modalRecord.destroy();
        modalRecord = null;
      }
    }

    async function openModal(opener, initialTab) {
      closeModal();
      var generation = modalGeneration;
      var doc = getDoc();
      var sh = getShadow();
      if (!doc || !sh) return null;

      var locale = detectLocale(d);
      var t = function (key, subs) { return translate(key, subs, locale); };
      var uid = getMyUserId();
      if (!uid) {
        if (sh && typeof sh.showToast === "function") sh.showToast(t("unfLoginRequired"));
        return null;
      }

      var tab = normalizeTab(initialTab);
      var query = "";
      var kindFilter = null;
      var scanning = false;
      var lastExport = null;

      var loaded = await scanner.loadAccountData(uid);
      if (generation !== modalGeneration) return null;
      var data = loaded.data;
      var history = loaded.history;
      var seenAt = loaded.seenAt;
      var keep = new Set(loaded.keep);
      var keepMeta = Object.assign({}, loaded.keepMeta);
      var selected = new Set();

      function el(tag, className, text) {
        var node = doc.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null && text !== "") node.textContent = String(text);
        return node;
      }

      var titleId = "iy-unf-title";
      var heading = el("h2", "unf-title", t("unfTitle"));
      heading.id = titleId;
      var closeBtn = el("button", "unf-close", "×");
      closeBtn.type = "button";
      closeBtn.title = t("unfClose");
      closeBtn.setAttribute("aria-label", t("unfClose"));
      var head = el("div", "unf-head");
      head.appendChild(heading);
      head.appendChild(closeBtn);

      var statusEl = el("p", "unf-status");
      statusEl.setAttribute("aria-live", "polite");

      var summaryEl = el("div", "unf-summary");
      summaryEl.hidden = true;

      var tabsEl = el("div", "unf-tabs");
      tabsEl.setAttribute("role", "tablist");

      var searchInput = el("input", "unf-input");
      searchInput.type = "search";
      searchInput.placeholder = t("unfSearchPlaceholder");
      searchInput.setAttribute("aria-label", t("unfSearchLabel"));

      // Keep list quick-add form (shown on keepList tab).
      var keepForm = el("div", "unf-keep-form");
      keepForm.hidden = true;
      var keepInput = el("input", "unf-input");
      keepInput.type = "text";
      keepInput.placeholder = t("unfKeepAddPlaceholder");
      keepInput.setAttribute("aria-label", t("unfKeepAddPlaceholder"));
      var keepAddBtn = el("button", "unf-btn unf-btn--sm", t("unfKeepAddBtn"));
      keepAddBtn.type = "button";
      keepForm.appendChild(keepInput);
      keepForm.appendChild(keepAddBtn);

      var pickBar = el("div", "unf-pickbar");
      var pickAllBtn = el("button", "unf-btn unf-btn--sm");
      pickAllBtn.type = "button";
      var pickCount = el("span", "unf-pickcount");
      pickCount.setAttribute("aria-live", "polite");
      pickBar.appendChild(pickAllBtn);
      pickBar.appendChild(pickCount);

      var queueContainer = el("div", "unf-queue-mount");
      var queueView = queueCtrl ? queueCtrl.mountView(queueContainer, { document: doc, locale: locale, keep: keep }) : null;

      var listEl = el("div", "unf-list");

      var body = el("div", "unf-body");
      body.appendChild(statusEl);
      body.appendChild(summaryEl);
      body.appendChild(tabsEl);
      body.appendChild(searchInput);
      body.appendChild(keepForm);
      body.appendChild(pickBar);
      body.appendChild(queueContainer);
      body.appendChild(listEl);

      var exportBtn = el("button", "unf-btn", t("unfExportCsv"));
      exportBtn.type = "button";
      var queueBtn = el("button", "unf-btn unf-btn--danger is-hidden");
      queueBtn.type = "button";
      var runBtn = el("button", "unf-btn unf-btn--primary", t("unfScan"));
      runBtn.type = "button";

      var footer = el("div", "unf-footer");
      footer.appendChild(exportBtn);
      footer.appendChild(queueBtn);
      footer.appendChild(runBtn);

      var dialog = el("div", "unf-dialog");
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-labelledby", titleId);
      dialog.appendChild(head);
      dialog.appendChild(body);
      dialog.appendChild(footer);

      var backdrop = el("div", "unf-backdrop");
      backdrop.appendChild(dialog);

      var rec = sh.createHost({
        document: doc,
        className: "iy-unfollowers-modal-host",
        css: MODAL_CSS,
        top: backdrop,
        mount: true
      });
      modalRecord = rec;

      function currentSets() {
        return historyLib.computeSets(data, history, keep, keepMeta);
      }

      function matchesQuery(q) {
        var low = String(q || "").trim().toLowerCase();
        return function (u) {
          if (!low) return true;
          var uname = (u && typeof u.username === "string" ? u.username : "").toLowerCase();
          var fname = (u && typeof u.full_name === "string" ? u.full_name : "").toLowerCase();
          return uname.indexOf(low) !== -1 || fname.indexOf(low) !== -1;
        };
      }

      function markSeen() {
        var latest = history[0];
        if (!latest || latest.at === seenAt) return;
        seenAt = latest.at;
        storage.set({ [historyLib.seenKey(uid)]: seenAt });
      }

      async function toggleKeep(user) {
        if (!user || !user.pk) return;
        var pk = String(user.pk);
        if (keep.has(pk)) {
          keep.delete(pk);
          delete keepMeta[pk];
        } else {
          keep.add(pk);
          keepMeta[pk] = {
            pk: pk,
            username: user.username || pk,
            full_name: user.full_name || "",
            is_verified: Boolean(user.is_verified),
            is_private: Boolean(user.is_private)
          };
          selected.delete(pk);
          if (queueCtrl) await queueCtrl.removeAccount(pk);
        }
        await storage.set({
          [historyLib.keepKey(uid)]: Array.from(keep),
          [historyLib.keepMetaKey(uid)]: keepMeta
        });
        render();
      }

      async function addKeepByUsername(rawInput) {
        var clean = String(rawInput || "").trim().replace(/^@+/, "").trim();
        if (!clean) return false;
        var low = clean.toLowerCase();
        var known = data.following.find(function (u) { return u.username && u.username.toLowerCase() === low; }) ||
                    data.followers.find(function (u) { return u.username && u.username.toLowerCase() === low; });
        var userObj = known || { pk: low, username: clean, full_name: "" };
        var pk = String(userObj.pk);
        keep.add(pk);
        keepMeta[pk] = {
          pk: pk,
          username: userObj.username || clean,
          full_name: userObj.full_name || "",
          is_verified: Boolean(userObj.is_verified),
          is_private: Boolean(userObj.is_private)
        };
        selected.delete(pk);
        if (queueCtrl) await queueCtrl.removeAccount(pk);
        await storage.set({
          [historyLib.keepKey(uid)]: Array.from(keep),
          [historyLib.keepMetaKey(uid)]: keepMeta
        });
        render();
        return true;
      }

      function makeUserLink(u) {
        var link = el("a", "unf-user");
        var uname = (u && u.username) || String((u && u.pk) || "");
        link.setAttribute("href", "https://www.instagram.com/" + uname + "/");
        link.setAttribute("target", "_blank");
        link.setAttribute("rel", "noopener");
        if (u && u.profile_pic_url) {
          var img = el("img", "unf-avatar");
          img.setAttribute("src", u.profile_pic_url);
          img.setAttribute("alt", "");
          img.setAttribute("loading", "lazy");
          link.appendChild(img);
        } else {
          var init = el("span", "unf-initial", (uname[0] || "?").toUpperCase());
          init.setAttribute("aria-hidden", "true");
          link.appendChild(init);
        }
        var names = el("span", "unf-names");
        var strong = el("strong", "", uname + (u && u.is_verified ? " ✓" : ""));
        var full = el("span", "", (u && u.full_name) || "");
        names.appendChild(strong);
        names.appendChild(full);
        link.appendChild(names);
        return link;
      }

      function makeRow(u, allowPick) {
        var pk = String(u.pk);
        var kept = keep.has(pk);
        var row = el("div", "unf-row" + (kept ? " is-kept" : ""));

        if (allowPick) {
          var box = el("input", "unf-check");
          box.type = "checkbox";
          box.checked = selected.has(pk) && !kept;
          box.disabled = kept || (queueCtrl && queueCtrl.isRunning());
          box.setAttribute("aria-label", "Select " + (u.username || pk));
          box.addEventListener("change", function () {
            if (box.checked && !keep.has(pk)) selected.add(pk);
            else selected.delete(pk);
            syncPickBar();
          });
          row.appendChild(box);
        }

        row.appendChild(makeUserLink(u));

        var keepBtn = el("button", "unf-btn unf-btn--sm unf-keep-btn" + (kept ? " is-active" : ""), kept ? t("unfKeptBtn") : t("unfKeepBtn"));
        keepBtn.type = "button";
        keepBtn.setAttribute("aria-pressed", String(kept));
        keepBtn.title = kept ? t("unfKeptTip") : t("unfKeepTip");
        keepBtn.disabled = Boolean(queueCtrl && queueCtrl.isRunning());
        keepBtn.addEventListener("click", function () {
          toggleKeep(u);
        });
        row.appendChild(keepBtn);
        return row;
      }

      function pickableUsers() {
        if (PICK_TABS.indexOf(tab) === -1) return [];
        var all = currentSets();
        var followingIdx = historyLib.userIndex(all.following);
        var source = tab === "notBack"
          ? all.notBack
          : all.unfollowedYou.filter(function (u) { return followingIdx(u); });
        return source.filter(matchesQuery(query)).filter(function (u) { return !keep.has(String(u.pk)); });
      }

      function syncPickBar() {
        var canPickTab = PICK_TABS.indexOf(tab) !== -1 && (data.updatedAt > 0 || history.length > 0);
        pickBar.hidden = !canPickTab;
        var can = pickableUsers();
        var allPicked = can.length > 0 && can.every(function (u) { return selected.has(String(u.pk)); });
        pickAllBtn.textContent = allPicked
          ? t("unfClearSelection")
          : t(query ? "unfSelectAllShown" : "unfSelectAll", [String(can.length)]);
        pickAllBtn.disabled = !can.length || Boolean(queueCtrl && queueCtrl.isRunning());

        var parts = [];
        if (selected.size) parts.push(t("unfSelectedCount", [String(selected.size)]));
        if (keep.size) parts.push(t("unfKeptCount", [String(keep.size)]));
        pickCount.textContent = parts.join(" · ");

        queueBtn.textContent = t("unfQueueBtn", [String(selected.size)]);
        queueBtn.classList.toggle("is-hidden", selected.size === 0);
        queueBtn.disabled = scanning || Boolean(queueCtrl && queueCtrl.isRunning());
      }

      function renderSummary() {
        var latest = history[0];
        if (!latest || latest.prevAt === undefined) {
          summaryEl.hidden = true;
          return;
        }
        summaryEl.hidden = false;
        var fresh = historyLib.isUnseen(history, seenAt);
        summaryEl.classList.toggle("is-new", fresh);
        var since = new Date(latest.prevAt).toLocaleDateString();

        var headP = el("p", "unf-summary-head", t(historyLib.hasChanges(latest) ? "unfSinceScan" : "unfNoChangesSince", [since]));
        if (fresh) {
          headP.appendChild(el("span", "unf-new-pill", t("unfNewBadge")));
        }

        var children = [headP];
        if (historyLib.hasChanges(latest)) {
          var chips = el("div", "unf-chips");
          var lostChip = el("button", "unf-chip", historyLib.unfollowedYouText(latest.lost.length, locale));
          lostChip.type = "button";
          lostChip.disabled = !latest.lost.length;
          lostChip.addEventListener("click", function () {
            tab = "unfollowedYou";
            markSeen();
            render();
          });

          var gainedChip = el("button", "unf-chip", historyLib.newFollowersText(latest.gained.length, locale));
          gainedChip.type = "button";
          gainedChip.disabled = !latest.gained.length;
          gainedChip.addEventListener("click", function () {
            tab = "newFollowers";
            markSeen();
            render();
          });

          chips.appendChild(lostChip);
          chips.appendChild(gainedChip);
          children.push(chips);
        }
        summaryEl.replaceChildren.apply(summaryEl, children);
      }

      function renderHistoryList() {
        if (!history.length) {
          return [el("p", "unf-empty", t("unfEmptyHistory"))];
        }
        var out = [];
        var labels = locale === "tr" ? historyLib.CHANGE_LABELS_TR : historyLib.CHANGE_LABELS;
        var kinds = kindFilter ? [kindFilter] : historyLib.CHANGE_KINDS;
        var entries = kindFilter ? history.slice(0, 1) : history;
        var filterFn = matchesQuery(query);
        var rows = 0;

        for (var i = 0; i < entries.length; i++) {
          var e = entries[i];
          var when = new Date(e.at).toLocaleString();
          if (e.prevAt === undefined) {
            if (!query && !kindFilter) {
              var firstHead = el("p", "unf-hist-head");
              firstHead.appendChild(el("strong", "", when));
              firstHead.appendChild(doc.createTextNode(" · " + t("unfFirstScanRow", [String(e.followers), String(e.following)])));
              out.push(firstHead);
            }
            continue;
          }
          var groups = [];
          for (var k = 0; k < kinds.length; k++) {
            var kind = kinds[k];
            var matched = (Array.isArray(e[kind]) ? e[kind] : []).filter(filterFn);
            if (matched.length) groups.push({ kind: kind, users: matched });
          }
          if ((query || kindFilter) && !groups.length) continue;

          var hRow = el("p", "unf-hist-head");
          hRow.appendChild(el("strong", "", when));
          var fDelta = signed((e.gained ? e.gained.length : 0) - (e.lost ? e.lost.length : 0));
          var gDelta = signed((e.followed ? e.followed.length : 0) - (e.unfollowed ? e.unfollowed.length : 0));
          hRow.appendChild(doc.createTextNode(" · " + t("unfHistoryRowHead", [String(e.followers), fDelta, String(e.following), gDelta])));
          out.push(hRow);

          if (!historyLib.hasChanges(e)) {
            out.push(el("p", "unf-status", t("unfNoChangesEntry")));
          }

          for (var g = 0; g < groups.length; g++) {
            var grp = groups[g];
            out.push(el("p", "unf-hist-group", (labels[grp.kind] || grp.kind) + " (" + grp.users.length + ")"));
            for (var uIdx = 0; uIdx < grp.users.length; uIdx++) {
              if (rows++ >= MAX_ROWS) {
                out.push(el("p", "unf-empty", t("unfShowingFirst", [String(MAX_ROWS), String(rows)])));
                return out;
              }
              out.push(makeRow(grp.users[uIdx], false));
            }
          }
        }
        if (!out.length) {
          out.push(el("p", "unf-empty", t("unfEmptyList")));
        }
        return out;
      }

      function render() {
        var all = currentSets();
        renderSummary();

        var tabCounts = {
          notBack: all.notBack.length,
          unfollowedYou: all.unfollowedYou.length,
          newFollowers: all.newFollowers.length,
          keepList: all.keepList.length,
          followers: all.followers.length,
          following: all.following.length,
          history: history.length
        };

        var unseen = historyLib.isUnseen(history, seenAt);
        var tabNodes = TAB_DEFS.map(function (def) {
          var activeTab = def.id === tab;
          var btn = el("button", "unf-tab" + (activeTab ? " is-active" : ""));
          btn.type = "button";
          btn.setAttribute("role", "tab");
          btn.setAttribute("aria-selected", String(activeTab));
          btn.dataset.tab = def.id;
          var labelText = locale === "en" ? def.en : def.tr;
          btn.appendChild(el("span", "", labelText));
          btn.appendChild(el("span", "unf-badge", String(tabCounts[def.id] || 0)));
          if ((def.id === "unfollowedYou" || def.id === "history") && unseen) {
            var dot = el("span", "unf-dot");
            dot.setAttribute("aria-hidden", "true");
            btn.appendChild(dot);
          }
          btn.addEventListener("click", function () {
            tab = def.id;
            kindFilter = null;
            if (tab === "history" || tab === "unfollowedYou" || tab === "newFollowers") {
              markSeen();
            }
            render();
          });
          return btn;
        });
        tabsEl.replaceChildren.apply(tabsEl, tabNodes);

        keepForm.hidden = tab !== "keepList";

        if (tab === "history") {
          var histNodes = renderHistoryList();
          listEl.replaceChildren.apply(listEl, histNodes);
          exportBtn.disabled = !history.some(historyLib.hasChanges);
        } else {
          var rawList = all[tab] || [];
          var filtered = rawList.filter(matchesQuery(query));
          var allowPick = PICK_TABS.indexOf(tab) !== -1;
          var rowNodes = [];
          if (filtered.length) {
            var slice = filtered.slice(0, MAX_ROWS);
            for (var i = 0; i < slice.length; i++) {
              rowNodes.push(makeRow(slice[i], allowPick));
            }
            if (filtered.length > MAX_ROWS) {
              rowNodes.push(el("p", "unf-empty", t("unfShowingFirst", [String(MAX_ROWS), String(filtered.length)])));
            }
          } else {
            var emptyText = tab === "keepList"
              ? t("unfEmptyKeep")
              : (data.updatedAt || history.length ? t("unfEmptyList") : t("unfEmptyBeforeScan"));
            rowNodes.push(el("p", "unf-empty", emptyText));
          }
          listEl.replaceChildren.apply(listEl, rowNodes);
          exportBtn.disabled = !rawList.length;
        }

        if (!scanning) {
          var complete = historyLib.isComplete(data);
          statusEl.textContent = data.updatedAt
            ? t(complete ? "unfLastScan" : "unfPartialScan", [
                new Date(data.updatedAt).toLocaleString(),
                String(data.followers.length),
                String(all.following.length)
              ])
            : t("unfNotScanned");
          runBtn.textContent = complete ? t("unfRescan") : (data.updatedAt ? t("unfResume") : t("unfScan"));
        }

        syncPickBar();
      }

      async function handleScanClick() {
        if (scanning) {
          scanner.cancel();
          return;
        }
        scanning = true;
        runBtn.textContent = t("unfPause");
        var res = await scanner.scan(uid, {
          onPage: function (info) {
            data = info.data;
            statusEl.textContent = t(info.kind === "followers" ? "unfLoadingFollowers" : "unfLoadingFollowing", [String(info.count)]);
            render();
          },
          onWait: function (w) {
            if (w.type === "pause") {
              statusEl.textContent = t("unfSafetyPause", [String(Math.ceil(w.ms / 1000)), String(w.count)]);
            }
          }
        });
        scanning = false;
        if (res && res.data) data = res.data;
        if (res && res.history) history = res.history;
        if (res && res.status === "rate_limited") {
          var mins = Math.max(1, Math.ceil((res.remainingMs || 1800000) / 60000));
          statusEl.textContent = t("unfRateLimited", [String(mins)]);
        } else {
          render();
        }
        return res;
      }

      function handleExportClick() {
        var day = new Date().toISOString().slice(0, 10);
        var all = currentSets();
        var fname;
        var content;
        if (tab === "history") {
          fname = "instagram_history_" + day + ".csv";
          content = historyLib.historyCsv(history, kindFilter ? [kindFilter] : historyLib.CHANGE_KINDS, { locale: locale });
        } else {
          fname = "instagram_" + tab + "_" + day + ".csv";
          content = historyLib.usersCsv(all[tab] || []);
        }
        lastExport = saveCsvFile(doc, rec.root, fname, content, d);
        return lastExport;
      }

      async function handleQueueClick() {
        var all = currentSets();
        var pool = all.following.concat(all.unfollowedYou);
        var seen = new Set();
        var chosen = [];
        for (var i = 0; i < pool.length; i++) {
          var u = pool[i];
          var pk = String(u.pk);
          if (!selected.has(pk) || keep.has(pk) || seen.has(pk)) continue;
          seen.add(pk);
          chosen.push(u);
        }
        if (!chosen.length || !queueView) return;
        queueView.openConfirm(chosen);
      }

      pickAllBtn.addEventListener("click", function () {
        var can = pickableUsers();
        var allPicked = can.length > 0 && can.every(function (u) { return selected.has(String(u.pk)); });
        for (var i = 0; i < can.length; i++) {
          var pk = String(can[i].pk);
          if (allPicked) selected.delete(pk);
          else if (!keep.has(pk)) selected.add(pk);
        }
        render();
      });

      keepAddBtn.addEventListener("click", function () {
        var val = keepInput.value;
        if (val && val.trim()) {
          keepInput.value = "";
          addKeepByUsername(val);
        }
      });

      searchInput.addEventListener("input", function () {
        query = searchInput.value || "";
        render();
      });

      runBtn.addEventListener("click", handleScanClick);
      exportBtn.addEventListener("click", handleExportClick);
      queueBtn.addEventListener("click", handleQueueClick);

      var unsubQueue = queueCtrl ? queueCtrl.onChange(function (snap) {
        if (Array.isArray(snap.completedIds) && snap.completedIds.length) {
          var unfollowedSet = new Set(data.unfollowed || []);
          var changed = false;
          for (var i = 0; i < snap.completedIds.length; i++) {
            var cid = String(snap.completedIds[i]);
            selected.delete(cid);
            if (!unfollowedSet.has(cid)) {
              unfollowedSet.add(cid);
              changed = true;
            }
          }
          if (changed) {
            data.unfollowed = Array.from(unfollowedSet);
          }
        }
        render();
      }) : function () {};

      var closed = false;
      function doClose() {
        if (closed) return;
        closed = true;
        if (scanning) scanner.cancel();
        unsubQueue();
        if (queueView) queueView.destroy();
        if (doc && typeof doc.removeEventListener === "function") {
          doc.removeEventListener("keydown", onKeyDown, true);
        }
        rec.destroy();
        if (modalRecord === rec) modalRecord = null;
        if (modalApi && modalApi.close === doClose) modalApi = null;
        if (opener && opener.isConnected !== false && typeof opener.focus === "function") {
          try { opener.focus({ preventScroll: true }); } catch (_) {}
        }
      }

      function focusables() {
        if (!dialog || typeof dialog.querySelectorAll !== "function") return [closeBtn];
        var list = Array.from(dialog.querySelectorAll("button:not(:disabled), input:not(:disabled), a[href]")).filter(function (n) {
          return !n.hidden && (!n.classList || !n.classList.contains("is-hidden"));
        });
        return list.length ? list : [closeBtn];
      }

      function onKeyDown(e) {
        if (closed || !e) return;
        if (e.key === "Escape") {
          if (queueView && !queueView.confirmBox.hidden) {
            queueView.closeConfirm();
            return;
          }
          if (typeof e.preventDefault === "function") e.preventDefault();
          if (typeof e.stopPropagation === "function") e.stopPropagation();
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

      closeBtn.addEventListener("click", doClose);
      backdrop.addEventListener("click", function (e) {
        if (e && e.target === backdrop) doClose();
      });
      if (doc && typeof doc.addEventListener === "function") {
        doc.addEventListener("keydown", onKeyDown, true);
      }

      render();

      modalApi = {
        host: rec.host,
        root: rec.root,
        dialog: dialog,
        statusEl: statusEl,
        summaryEl: summaryEl,
        tabsEl: tabsEl,
        searchInput: searchInput,
        listEl: listEl,
        runBtn: runBtn,
        exportBtn: exportBtn,
        queueBtn: queueBtn,
        pickAllBtn: pickAllBtn,
        queueView: queueView,
        close: doClose,
        scan: handleScanClick,
        exportCsv: handleExportClick,
        setTab: function (nextTab) {
          tab = normalizeTab(nextTab);
          if (tab === "history" || tab === "unfollowedYou" || tab === "newFollowers") markSeen();
          render();
          return tab;
        },
        getTab: function () { return tab; },
        setSearch: function (q) {
          query = String(q || "");
          searchInput.value = query;
          render();
        },
        toggleKeep: toggleKeep,
        addKeepByUsername: addKeepByUsername,
        selectAccount: function (pk) {
          var id = String(pk);
          if (keep.has(id)) return false;
          selected.add(id);
          render();
          return true;
        },
        getSelected: function () { return Array.from(selected); },
        getKeep: function () { return Array.from(keep); },
        getSets: currentSets,
        getLastExport: function () { return lastExport; }
      };

      return modalApi;
    }

    function start(settings) {
      if (active) return;
      active = true;
      applyTheme(settings);
      var core = d.core || (globalThis.IY && globalThis.IY.core);
      if (core && typeof core.route === "function") {
        cleanups.push(core.route(function () { closeModal(); renderTrigger(); }));
      }
      if (core && typeof core.observe === "function") {
        cleanups.push(core.observe(function (node) {
          return isProfileRoute() && (node.closest("header") || (!triggerRecord?.host.isConnected && node.querySelector("header")));
        }, renderTrigger));
      }
      renderTrigger();
    }

    function update(settings) {
      applyTheme(settings);
      if (active) renderTrigger();
    }

    function stop() {
      active = false;
      closeModal();
      removeTrigger();
      while (cleanups.length) {
        try { cleanups.pop()(); } catch (_) {}
      }
    }

    return {
      start: start,
      update: update,
      stop: stop,
      open: openModal,
      close: closeModal,
      renderTrigger: renderTrigger,
      getModal: function () { return modalApi; },
      getTriggerHost: function () { return triggerRecord && triggerRecord.host; },
      isActive: function () { return active; }
    };
  }

  var defaultController = createController();

  // Register with IY.core.feature (default OFF).
  if (globalThis.IY && globalThis.IY.core && typeof globalThis.IY.core.feature === "function") {
    globalThis.IY.core.feature("unfollowers", {
      keys: ["ui"],
      enabled: function (settings) {
        return Boolean(settings && settings.ui && settings.ui.unfollowers === true);
      },
      start: function (settings) { defaultController.start(settings); },
      update: function (settings) { defaultController.update(settings); },
      stop: function () { defaultController.stop(); }
    });
  }

  var exported = {
    TAB_DEFS: TAB_DEFS,
    PICK_TABS: PICK_TABS,
    MAX_ROWS: MAX_ROWS,
    MESSAGES: MESSAGES,
    TRIGGER_CSS: TRIGGER_CSS,
    MODAL_CSS: MODAL_CSS,
    normalizeTab: normalizeTab,
    csv: historyLib.usersCsv,
    usersCsv: historyLib.usersCsv,
    historyCsv: historyLib.historyCsv,
    createController: createController,
    open: function (opener) { return defaultController.open(opener); },
    close: function () { return defaultController.close(); },
    getController: function () { return defaultController; }
  };

  globalThis.IY = Object.assign(globalThis.IY || {}, { unfollowers: exported });
  if (isNode) module.exports = exported;
})();
