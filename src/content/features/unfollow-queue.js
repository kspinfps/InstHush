// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
// Slow unfollow queue with mandatory ban-risk warning & confirmation, 45–90 s random pacing,
// 50/day cap, 10-min safety pause every 10 unfollows, keep-list protection, immediate stop
// and 24-hour cooldown on 429/feedback_required/checkpoint, and persisted resume state.
(function () {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;
  var rateLimitLib = isNode ? require("../../lib/rate-limit.js") : (globalThis.IY && globalThis.IY.rateLimit) || {};
  var headersLib = isNode ? require("../core/headers.js") : (globalThis.IY && globalThis.IY.headers) || {};
  var apiLib = isNode ? require("../core/api.js") : (globalThis.IY && globalThis.IY.api) || {};
  var historyLib = isNode ? require("./unfollowers-history.js") : (globalThis.IY && globalThis.IY.unfollowersHistory) || {};
  var shadowLib = isNode ? require("../ui/shadow.js") : (globalThis.IY && globalThis.IY.shadow) || null;

  var MIN_DELAY_MS = 45 * 1000;
  var MAX_DELAY_MS = 90 * 1000;
  var DAILY_CAP = 50;
  var UNFOLLOWS_BEFORE_PAUSE = 10;
  var PAUSE_DURATION_MS = 10 * 60 * 1000;
  var COOLDOWN_24H_MS = 24 * 60 * 60 * 1000;
  var MAX_FAILS_IN_A_ROW = 3;

  var UNFOLLOW_OP = "usePolarisUnfollowMutation";
  var UNFOLLOW_DOC_ID = "27789106940691111";
  var APP_ID_FALLBACK = "936619743392459";
  var ASBD_FALLBACK = "359341";
  var BLOCKED_RE = /feedback_required|checkpoint|challenge_required|action_blocked|try again later|rate limit|please wait a few minutes/i;

  var STRINGS = {
    tr: {
      confirmText: "Otomatik takipten çıkarma Instagram tarafından hesabının kısıtlanmasına ya da banlanmasına yol açabilir. Elle takipten çıkmanı öneriyoruz. Yine de devam etmek istiyor musun?",
      confirmCancel: "Vazgeç",
      confirmStart: "Riski anlıyorum, başlat",
      persistentWarning: "Hesabın için ban riski var, elle takipten çıkmanı öneriyoruz. Otomatik takipten çıkarma Instagram tarafından hesabının kısıtlanmasına ya da banlanmasına yol açabilir.",
      shortWarning: "Hesabın için ban riski var, elle takipten çıkmanı öneriyoruz.",
      dialogTitle: "Takipten çıkma kuyruğunu başlat",
      queueSummary: "Seçilen hesap: $1 · Günlük kalan hak: $2 / $3",
      pacingNote: "Her işlem arasında 45–90 sn rastgele beklenir, her 10 hesapta bir 10 dk güvenlik molası verilir (günlük en fazla 50 hesap). Herhangi bir 429 veya doğrulama uyarısında anında durur ve 24 saat beklemeye geçer.",
      privateNote: "Listedeki gizli hesapları tekrar takip etmek istersen yeni takip isteği göndermen gerekir.",
      statusIdle: "Kuyruk hazır. Günlük kalan hak: $1 / $2",
      statusRunning: "@$1 takipten çıkarılıyor ($2 / $3)…",
      statusWaiting: "$1 / $2 tamamlandı · Sıradaki işlem $3 sn sonra…",
      statusSafetyPause: "Güvenlik molası ($1 kaldı) · $2 / $3 tamamlandı",
      statusDailyCap: "Günlük takipten çıkma sınırına ulaşıldı ($1 / $2). Yarın devam edebilirsin.",
      statusRateLimited: "Instagram işlemi kısıtladı (429 / doğrulama). Kuyruk durduruldu ve 24 saat soğumaya alındı.",
      statusStoppedFails: "Arka arkaya $1 işlem doğrulanamadığı için kuyruk güvenlik amacıyla durduruldu.",
      statusCancelled: "Kuyruk durduruldu ($1 / $2 tamamlandı).",
      statusCompleted: "Kuyruk tamamlandı ($1 / $2 takipten çıkarıldı).",
      statusPausedReload: "Kaydedilmiş kuyruk ($1 / $2 tamamlandı). Kaldığı yerden devam etmeye hazır.",
      btnStartQueue: "Kuyruğu başlat ($1)",
      btnResumeQueue: "Devam et ($1 kaldı)",
      btnCancelQueue: "Kuyruğu durdur",
      btnStopping: "Durduruluyor…"
    },
    en: {
      confirmText: "Automatic unfollowing may cause Instagram to restrict or ban your account. We recommend unfollowing manually. Do you still want to continue?",
      confirmCancel: "Cancel",
      confirmStart: "I understand the risk, start",
      persistentWarning: "Your account could be banned. We recommend unfollowing manually. Automatic unfollowing may cause Instagram to restrict or ban your account.",
      shortWarning: "Your account could be banned. We recommend unfollowing manually.",
      dialogTitle: "Start unfollow queue",
      queueSummary: "Selected accounts: $1 · Remaining daily allowance: $2 / $3",
      pacingNote: "Waits 45–90 s randomly between unfollows, pauses 10 min every 10 accounts (max 50 per day). Stops immediately and cools down for 24 h on any 429 or checkpoint.",
      privateNote: "Private accounts in the list will require a new follow request if you change your mind.",
      statusIdle: "Queue ready. Remaining daily allowance: $1 / $2",
      statusRunning: "Unfollowing @$1 ($2 of $3)…",
      statusWaiting: "Unfollowed $1 of $2 · Next in $3 s…",
      statusSafetyPause: "Safety pause ($1 left) · $2 of $3 unfollowed",
      statusDailyCap: "Daily unfollow limit reached ($1 / $2). Try again tomorrow.",
      statusRateLimited: "Instagram restricted the action (429 / checkpoint). Queue stopped and cooled down for 24 hours.",
      statusStoppedFails: "Stopped after $1 unfollows in a row could not be confirmed.",
      statusCancelled: "Queue stopped ($1 of $2 completed).",
      statusCompleted: "Queue completed ($1 of $2 unfollowed).",
      statusPausedReload: "Saved queue ($1 of $2 completed). Ready to resume.",
      btnStartQueue: "Start queue ($1)",
      btnResumeQueue: "Resume ($1 left)",
      btnCancelQueue: "Cancel queue",
      btnStopping: "Stopping…"
    }
  };

  var QUEUE_CSS = `:host {
  all: initial;
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
[hidden] {
  display: none !important;
}
.uq-box {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid var(--iy-border, #39473d);
  background: var(--iy-surface-raised, #252e27);
  color: var(--iy-text, #eaf0e8);
}
.uq-warning {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--iy-border, #39473d);
  border-left: 3px solid #e0245e;
  background: var(--iy-surface, #171d19);
  color: var(--iy-text, #eaf0e8);
  font-size: 12px;
  line-height: 1.45;
}
.uq-warning-icon {
  flex: none;
  color: #e0245e;
  font-weight: 700;
}
.uq-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}
.uq-status {
  margin: 0;
  font-size: 13px;
  color: var(--iy-text, #eaf0e8);
  font-variant-numeric: tabular-nums;
}
.uq-allowance {
  margin: 0;
  font-size: 12px;
  color: var(--iy-muted, #acb9ae);
  font-variant-numeric: tabular-nums;
}
.uq-progress {
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: var(--iy-surface, #171d19);
  overflow: hidden;
}
.uq-progress-fill {
  height: 100%;
  width: 0%;
  background: var(--iy-accent, #9dceab);
  transition: width 180ms ease;
}
.uq-confirm {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 440px;
  padding: 16px;
  border-radius: 14px;
  border: 1px solid #e0245e;
  background: var(--iy-surface, #171d19);
  color: var(--iy-text, #eaf0e8);
}
.uq-confirm-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}
.uq-confirm-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
}
.uq-confirm-meta {
  margin: 0;
  font-size: 12px;
  color: var(--iy-muted, #acb9ae);
}
.uq-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}
.uq-btn {
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
.uq-btn:hover:not(:disabled) {
  background: var(--iy-hover, #252e27);
}
.uq-btn:disabled {
  opacity: 0.48;
  cursor: default;
}
.uq-btn:focus-visible {
  outline: 2px solid var(--iy-accent, #9dceab);
  outline-offset: 2px;
}
.uq-btn--danger {
  border-color: transparent;
  background: #e0245e;
  color: #ffffff;
}
.uq-btn--danger:hover:not(:disabled) {
  background: #c81e52;
}
.uq-btn--accent {
  border-color: transparent;
  background: var(--iy-accent, #9dceab);
  color: var(--iy-on-accent, #17251c);
}
@media (prefers-reduced-motion: reduce) {
  .uq-progress-fill, .uq-btn { transition: none !important; }
}
:host([data-motion="off"]) .uq-progress-fill,
:host([data-motion="off"]) .uq-btn { transition: none !important; }`;

  function queueStateKey(uid) { return "unfollowQueue:state:" + String(uid); }
  function queueDailyKey(uid) { return "unfollowQueue:daily:" + String(uid); }
  function keepKey(uid) { return "unfollowers:keep:" + String(uid); }
  function scanKey(uid) { return "unfollowers:" + String(uid); }

  function dayKey(ts) {
    var d = new Date(Number.isFinite(ts) ? ts : Date.now());
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  /**
   * Random delay between two unfollows: defaults to 45,000..90,000 ms (45–90 s).
   * Also supports unfollowDelayMs(minMs, rnd) or unfollowDelayMs(minMs, maxMs, rnd).
   */
  function unfollowDelayMs(minOrDelay, maxOrRnd, maybeRnd) {
    var minMs = MIN_DELAY_MS;
    var maxMs = MAX_DELAY_MS;
    var rnd = Math.random;

    if (typeof minOrDelay === "function") {
      rnd = minOrDelay;
    } else if (Number.isFinite(minOrDelay) && minOrDelay >= 0) {
      minMs = minOrDelay;
      if (typeof maxOrRnd === "function") {
        rnd = maxOrRnd;
        maxMs = minMs === MIN_DELAY_MS ? MAX_DELAY_MS : minMs * 2;
      } else if (Number.isFinite(maxOrRnd) && maxOrRnd >= minMs) {
        maxMs = maxOrRnd;
        if (typeof maybeRnd === "function") rnd = maybeRnd;
      } else {
        maxMs = minMs === MIN_DELAY_MS ? MAX_DELAY_MS : minMs * 2;
      }
    }
    var span = Math.max(0, maxMs - minMs);
    return Math.floor(rnd() * span) + minMs;
  }

  /**
   * Rough duration for a queue of `n` unfollows with average wait ((min+max)/2) and 10-min pause every 10.
   */
  function unfollowEtaMs(n, minDelayMs, maxDelayMs, pauseMs, pauseEvery) {
    if (!Number.isFinite(n) || n <= 1) return 0;
    var minD = Number.isFinite(minDelayMs) && minDelayMs >= 0 ? minDelayMs : MIN_DELAY_MS;
    var maxD = Number.isFinite(maxDelayMs) && maxDelayMs >= minD ? maxDelayMs : MAX_DELAY_MS;
    var pause = Number.isFinite(pauseMs) && pauseMs >= 0 ? pauseMs : PAUSE_DURATION_MS;
    var every = Number.isInteger(pauseEvery) && pauseEvery > 0 ? pauseEvery : UNFOLLOWS_BEFORE_PAUSE;
    var waits = n - 1;
    var pauses = Math.floor(waits / every);
    var avgWait = (minD + maxD) / 2;
    return Math.round(waits * avgWait + pauses * pause);
  }

  function formatDuration(ms, locale) {
    var tr = typeof locale === "string" && /^tr/i.test(locale.trim());
    var s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return s + (tr ? " sn" : " s");
    var m = Math.round(s / 60);
    if (m < 60) return m + (tr ? " dk" : " min");
    var h = Math.floor(m / 60);
    var rem = m % 60;
    if (tr) return h + " sa" + (rem ? " " + rem + " dk" : "");
    return h + " h" + (rem ? " " + rem + " min" : "");
  }

  function clock(secondsLeft) {
    var s = Math.max(0, Math.ceil(secondsLeft));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  /** Instagram's checksum of fb_dtsg: "2" and the sum of its char codes. */
  function jazoest(dtsg) {
    var str = String(dtsg || "");
    var sum = 0;
    for (var i = 0; i < str.length; i++) sum += str.charCodeAt(i);
    return "2" + sum;
  }

  function findFriendshipStatus(node, depth) {
    var d = depth || 0;
    if (!node || typeof node !== "object" || d > 8) return undefined;
    var fs = node.friendship_status;
    if (fs && typeof fs === "object") return fs;
    var values = Object.values(node);
    for (var i = 0; i < values.length; i++) {
      var found = findFriendshipStatus(values[i], d + 1);
      if (found) return found;
    }
    return undefined;
  }

  /**
   * Extracts fb_dtsg, lsd, and client_revision from injected tokens, window.require, or document.scripts.
   */
  function extractSessionTokens(deps) {
    var d = deps || {};
    var out = {
      fb_dtsg: d.tokens && d.tokens.fb_dtsg ? String(d.tokens.fb_dtsg) : undefined,
      lsd: d.tokens && d.tokens.lsd ? String(d.tokens.lsd) : undefined,
      rev: d.tokens && d.tokens.rev ? String(d.tokens.rev) : undefined
    };
    var win = d.window !== undefined ? d.window : globalThis.window;
    var doc = d.document !== undefined ? d.document : globalThis.document;

    if ((!out.fb_dtsg || !out.lsd) && win && typeof win.require === "function") {
      try {
        var dtsgMod = win.require("DTSGInitialData");
        if (!out.fb_dtsg && dtsgMod && dtsgMod.token) out.fb_dtsg = String(dtsgMod.token);
        var lsdMod = win.require("LSD");
        if (!out.lsd && lsdMod && lsdMod.token) out.lsd = String(lsdMod.token);
        var siteMod = win.require("SiteData");
        if (!out.rev && siteMod && siteMod.client_revision) out.rev = String(siteMod.client_revision);
      } catch (_) {}
    }

    if ((!out.fb_dtsg || !out.lsd) && doc) {
      var scripts = doc.scripts || (typeof doc.querySelectorAll === "function" ? doc.querySelectorAll("script") : []);
      for (var i = 0; i < scripts.length; i++) {
        var text = (scripts[i] && scripts[i].textContent) || "";
        if (!text || text.indexOf("token") === -1) continue;
        if (!out.fb_dtsg) {
          var m1 =
            /"DTSGInitialData"[,:]\[\],\{"token":"([^"]+)"/.exec(text) ||
            /"DTSGInitialData":\{"token":"([^"]+)"/.exec(text) ||
            /"dtsg":\{"token":"([^"]+)"/.exec(text);
          if (m1 && m1[1]) out.fb_dtsg = m1[1];
        }
        if (!out.lsd) {
          var m2 =
            /"LSD"[,:]\[\],\{"token":"([^"]+)"/.exec(text) ||
            /"LSD":\{"token":"([^"]+)"/.exec(text) ||
            /"lsd":\{"token":"([^"]+)"/.exec(text);
          if (m2 && m2[1]) out.lsd = m2[1];
        }
        if (!out.rev) {
          var m3 = /"client_revision":(\d+)/.exec(text);
          if (m3 && m3[1]) out.rev = m3[1];
        }
        if (out.fb_dtsg && out.lsd) break;
      }
    }
    return out;
  }

  /**
   * Verifies whether `user` is still in the authenticated user's following list:
   * GET /api/v1/friendships/{me}/following/?count=12&query={username}&search_surface=follow_list_page
   */
  async function isStillFollowing(user, deps) {
    var d = deps || {};
    var me = typeof d.myUserId === "function"
      ? d.myUserId()
      : (headersLib && typeof headersLib.myUserId === "function" ? headersLib.myUserId() : undefined);
    if (!me || !user || !user.username) return null;

    var api = d.api || (globalThis.IY && globalThis.IY.api) || apiLib;
    if (!api || typeof api.igGet !== "function") return null;

    var qs = new URLSearchParams({
      count: "12",
      query: String(user.username),
      search_surface: "follow_list_page"
    });
    try {
      var data = await api.igGet("/api/v1/friendships/" + encodeURIComponent(me) + "/following/?" + qs.toString(), { ownRetry: true });
      var list = data && Array.isArray(data.users) ? data.users : [];
      var targetPk = String(user.pk ?? "");
      var targetName = String(user.username).toLowerCase();
      return list.some(function (u) {
        if (!u || typeof u !== "object") return false;
        return (
          String(u.pk ?? "") === targetPk ||
          String(u.pk_id ?? "") === targetPk ||
          (typeof u.username === "string" && u.username.toLowerCase() === targetName)
        );
      });
    } catch (err) {
      if (historyLib.isRateLimitError ? historyLib.isRateLimitError(err) : (err && err.rateLimited)) {
        throw err;
      }
      return null;
    }
  }

  /**
   * Executes the exact unfollow GraphQL mutation Glassgram uses:
   * POST /api/graphql (fb_api_req_friendly_name=usePolarisUnfollowMutation, doc_id=27789106940691111)
   * Never follows anyone.
   */
  async function executeUnfollowMutation(targetUserId, deps) {
    var d = deps || {};
    var id = String(targetUserId ?? "").trim();
    if (!id) return { outcome: "failed", detail: "Missing target_user_id" };

    if (typeof d.unfollowTransport === "function") {
      return d.unfollowTransport(id);
    }

    var fetchFn = d.fetch !== undefined ? d.fetch : globalThis.fetch;
    if (typeof fetchFn !== "function") {
      return { outcome: "failed", detail: "fetch is unavailable" };
    }

    var tokens = extractSessionTokens(d);
    if (!tokens.fb_dtsg || !tokens.lsd) {
      return { outcome: "failed", detail: "Session tokens not found on the page. Reload Instagram." };
    }

    var cookieStr = d.cookie !== undefined
      ? d.cookie
      : (d.document && typeof d.document.cookie === "string" ? d.document.cookie : undefined);
    var readCookie = headersLib && typeof headersLib.readCookie === "function"
      ? function (name) { return headersLib.readCookie(name, cookieStr) || ""; }
      : function (name) {
          var src = typeof cookieStr === "string" ? cookieStr : ((typeof document !== "undefined" && document.cookie) || "");
          var hit = src.split("; ").find(function (c) { return c.indexOf(name + "=") === 0; });
          return hit ? hit.slice(name.length + 1) : "";
        };

    var av = (typeof d.myUserId === "function" && d.myUserId()) || readCookie("ds_user_id");
    var csrf = readCookie("csrftoken");
    var appId = (headersLib && typeof headersLib.getAppId === "function" && headersLib.getAppId()) || APP_ID_FALLBACK;
    var asbd = (headersLib && typeof headersLib.getAsbdId === "function" && headersLib.getAsbdId()) || ASBD_FALLBACK;
    var docId = (d.docId && String(d.docId)) || UNFOLLOW_DOC_ID;

    var vars = {
      target_user_id: id,
      container_module: "profile",
      nav_chain: "PolarisProfilePostsTabRoot:profilePage:1:via_cold_start"
    };

    var params = new URLSearchParams({
      av: String(av || ""),
      __d: "www",
      __user: "0",
      __a: "1",
      __comet_req: "7",
      fb_dtsg: tokens.fb_dtsg,
      jazoest: jazoest(tokens.fb_dtsg),
      lsd: tokens.lsd,
      fb_api_caller_class: "RelayModern",
      fb_api_req_friendly_name: UNFOLLOW_OP,
      variables: JSON.stringify(vars),
      server_timestamps: "true",
      doc_id: docId
    });
    if (tokens.rev) {
      params.set("__rev", tokens.rev);
      params.set("__spin_r", tokens.rev);
    }

    var headers = {
      "content-type": "application/x-www-form-urlencoded",
      "x-csrftoken": csrf,
      "x-fb-friendly-name": UNFOLLOW_OP,
      "x-fb-lsd": tokens.lsd,
      "x-ig-app-id": appId,
      "x-asbd-id": asbd
    };

    var baseUrl = typeof d.baseUrl === "string" ? d.baseUrl : "";
    var res = await fetchFn(baseUrl + "/api/graphql", {
      method: "POST",
      credentials: "include",
      headers: headers,
      body: params.toString()
    });

    var text = "";
    try { text = await res.text(); } catch (_) { text = ""; }
    var cleanText = text.indexOf("for (;;);") === 0 ? text.slice(9) : text;
    var data = null;
    try { data = JSON.parse(cleanText); } catch (_) { data = null; }

    var errText = [
      data && (data.errors || data.error) ? JSON.stringify(data.errors || data.error) : "",
      (data && data.message) || "",
      (data && data.errorSummary) || ""
    ].join(" ").trim();

    var isChallenge = apiLib && typeof apiLib.isChallengeUrl === "function"
      ? (res.redirected && apiLib.isChallengeUrl(res.url))
      : (res.redirected && /\/(challenge|accounts\/suspended)\//.test(String(res.url || "")));

    var isLimited = Boolean(
      res.status === 429 ||
      isChallenge ||
      (data && data.spam === true) ||
      BLOCKED_RE.test(errText) ||
      (rateLimitLib && typeof rateLimitLib.isRateLimited === "function" && rateLimitLib.isRateLimited(res.status, data || cleanText))
    );

    if (isLimited) {
      return { outcome: "blocked", detail: ("HTTP " + res.status + " " + errText).trim() };
    }

    if (!res.ok || !data || data.errors || data.error || data.status === "fail" || !data.data) {
      return {
        outcome: "failed",
        detail: data ? ("HTTP " + res.status + " " + (errText || "no data")) : ("HTTP " + res.status + ", not JSON")
      };
    }

    var fs = findFriendshipStatus(data.data, 0);
    var following = fs ? (fs.following === true || fs.outgoing_request === true) : undefined;
    return { outcome: "ok", following: following, detail: "answered" };
  }

  /**
   * Unfollows `user` and confirms the follow relationship is gone (either via mutation response
   * friendship_status.following === false or via isStillFollowing).
   */
  async function unfollowUser(user, deps) {
    var d = deps || {};
    if (!user || typeof user !== "object" || (!user.pk && !user.username)) {
      return { outcome: "failed", detail: "Invalid user" };
    }
    var r;
    try {
      r = await executeUnfollowMutation(user.pk, d);
    } catch (err) {
      if (historyLib.isRateLimitError && historyLib.isRateLimitError(err)) {
        return { outcome: "blocked", detail: err.message || "Rate limited" };
      }
      return { outcome: "failed", detail: (err && err.message) || String(err) };
    }

    if (!r || r.outcome !== "ok") {
      return { outcome: (r && r.outcome) || "failed", detail: (r && r.detail) || "Failed" };
    }
    if (r.following === true) {
      return { outcome: "failed", detail: "Instagram answered, but still shows you following them." };
    }
    if (r.following === false) {
      return { outcome: "unfollowed", detail: "confirmed" };
    }

    var still;
    try {
      still = await isStillFollowing(user, d);
    } catch (_) {
      return { outcome: "blocked", detail: "Instagram rate-limited the check after the unfollow." };
    }
    if (still === true) return { outcome: "failed", detail: "Still in your following list." };
    if (still === null) return { outcome: "failed", detail: "Instagram answered, but the unfollow could not be confirmed." };
    return { outcome: "unfollowed", detail: "confirmed" };
  }

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
    var table = STRINGS[lang] || STRINGS.tr;
    var raw = table[key] !== undefined ? table[key] : (STRINGS.tr[key] || key);
    for (var j = 0; j < list.length; j++) {
      raw = raw.replace("$" + (j + 1), String(list[j]));
    }
    return raw;
  }

  function createQueueController(deps) {
    var d = deps || {};
    var storage = historyLib.createStorageHelper ? historyLib.createStorageHelper(d.storage) : null;
    var now = typeof d.now === "function" ? d.now : Date.now;
    var random = typeof d.random === "function" ? d.random : Math.random;
    var minDelayMs = Number.isFinite(d.minDelayMs) && d.minDelayMs >= 0 ? d.minDelayMs : MIN_DELAY_MS;
    var maxDelayMs = Number.isFinite(d.maxDelayMs) && d.maxDelayMs >= minDelayMs ? d.maxDelayMs : MAX_DELAY_MS;
    var pauseDurationMs = Number.isFinite(d.pauseDurationMs) && d.pauseDurationMs >= 0 ? d.pauseDurationMs : PAUSE_DURATION_MS;
    var unfollowsBeforePause = Number.isInteger(d.unfollowsBeforePause) && d.unfollowsBeforePause > 0
      ? d.unfollowsBeforePause
      : UNFOLLOWS_BEFORE_PAUSE;
    var dailyCap = Number.isInteger(d.dailyCap) && d.dailyCap > 0 ? d.dailyCap : DAILY_CAP;
    var cooldown24hMs = Number.isSafeInteger(d.cooldownMs) && d.cooldownMs > 0 ? d.cooldownMs : COOLDOWN_24H_MS;

    var cooldown = d.cooldown || (rateLimitLib && typeof rateLimitLib.createCooldown === "function"
      ? rateLimitLib.createCooldown(storage, {
          key: (rateLimitLib && rateLimitLib.STORAGE_KEY) || "iy.rateLimitedUntil",
          baseMs: 30 * 60 * 1000,
          maxMs: Math.max(cooldown24hMs, 4 * 30 * 60 * 1000),
          now: now,
          random: random
        })
      : null);

    var unfollowFn = typeof d.unfollowUser === "function"
      ? d.unfollowUser
      : function (u) { return unfollowUser(u, d); };

    var active = false;
    var running = false;
    var cancelled = false;
    var cancelWait = null;
    var listeners = new Set();

    var state = {
      uid: "",
      status: "idle",
      queue: [],
      selectedIds: [],
      completedIds: [],
      failedIds: [],
      currentIndex: 0,
      unfollowsSincePause: 0,
      failsInARow: 0,
      confirmed: false,
      nextRunAt: 0,
      cooldownUntil: 0,
      stopReason: "",
      updatedAt: 0
    };

    function getUid() {
      if (state.uid) return state.uid;
      if (typeof d.uid === "string" && d.uid.trim()) return d.uid.trim();
      if (typeof d.myUserId === "function") {
        var id = d.myUserId();
        if (id) return String(id).trim();
      }
      if (headersLib && typeof headersLib.myUserId === "function") {
        var hid = headersLib.myUserId();
        if (hid) return String(hid).trim();
      }
      return "default";
    }

    function notify() {
      var snap = getSnapshot();
      listeners.forEach(function (fn) {
        try { fn(snap); } catch (_) {}
      });
    }

    function onChange(fn) {
      if (typeof fn !== "function") return function () {};
      listeners.add(fn);
      return function () { listeners.delete(fn); };
    }

    function interruptibleSleep(ms) {
      if (typeof d.sleep === "function") {
        return d.sleep(ms);
      }
      if (!(ms > 0)) return Promise.resolve();
      return new Promise(function (resolve) {
        var timer = setTimeout(function () {
          cancelWait = null;
          resolve();
        }, ms);
        cancelWait = function () {
          clearTimeout(timer);
          cancelWait = null;
          resolve();
        };
      });
    }

    async function readKeepSet(uid, extraKeep) {
      var cleanUid = uid || getUid();
      var stored = await storage.get(keepKey(cleanUid));
      var raw = stored && stored[keepKey(cleanUid)];
      var set = new Set();
      if (Array.isArray(raw)) {
        for (var i = 0; i < raw.length; i++) {
          var v = String(raw[i] ?? "").trim();
          if (v) {
            set.add(v);
            set.add(v.toLowerCase());
          }
        }
      }
      if (extraKeep) {
        var list = extraKeep instanceof Set ? Array.from(extraKeep) : (Array.isArray(extraKeep) ? extraKeep : []);
        for (var j = 0; j < list.length; j++) {
          var kv = String(list[j] ?? "").trim();
          if (kv) {
            set.add(kv);
            set.add(kv.toLowerCase());
          }
        }
      }
      return set;
    }

    function isKept(user, keepSet) {
      if (!user || !keepSet) return false;
      var pk = String(user.pk ?? user.id ?? "").trim();
      var uname = typeof user.username === "string" ? user.username.trim().toLowerCase() : "";
      return (pk !== "" && (keepSet.has(pk) || keepSet.has(pk.toLowerCase()))) || (uname !== "" && keepSet.has(uname));
    }

    async function getDailyUsage(uid) {
      var cleanUid = uid || getUid();
      var today = dayKey(now());
      var stored = await storage.get(queueDailyKey(cleanUid));
      var record = stored && stored[queueDailyKey(cleanUid)];
      if (!record || typeof record !== "object" || record.day !== today) {
        return { day: today, count: 0, ids: [] };
      }
      var count = Number.isInteger(record.count) && record.count >= 0 ? record.count : 0;
      var ids = Array.isArray(record.ids) ? record.ids.map(String) : [];
      return { day: today, count: Math.max(count, ids.length), ids: ids };
    }

    async function recordDailyUnfollow(uid, targetPk) {
      var cleanUid = uid || getUid();
      var usage = await getDailyUsage(cleanUid);
      var pk = String(targetPk);
      if (usage.ids.indexOf(pk) === -1) usage.ids.push(pk);
      usage.count = Math.max(usage.count + 1, usage.ids.length);
      await storage.set({ [queueDailyKey(cleanUid)]: usage });
      return usage;
    }

    async function recordUnfollowedInScan(uid, targetPk) {
      var cleanUid = uid || getUid();
      var key = scanKey(cleanUid);
      var stored = await storage.get(key);
      var scanData = stored && stored[key];
      if (!scanData || typeof scanData !== "object") return;
      var list = Array.isArray(scanData.unfollowed) ? scanData.unfollowed.map(String) : [];
      var pk = String(targetPk);
      if (list.indexOf(pk) === -1) {
        list.push(pk);
        scanData.unfollowed = list;
        await storage.set({ [key]: scanData });
      }
    }

    async function persistState() {
      var cleanUid = getUid();
      state.uid = cleanUid;
      state.updatedAt = now();
      await storage.set({ [queueStateKey(cleanUid)]: Object.assign({}, state) });
    }

    async function loadState(uid) {
      var cleanUid = uid || getUid();
      state.uid = cleanUid;
      var stored = await storage.get(queueStateKey(cleanUid));
      var saved = stored && stored[queueStateKey(cleanUid)];
      var keepSet = await readKeepSet(cleanUid);
      if (saved && typeof saved === "object") {
        var rawQueue = Array.isArray(saved.queue) ? saved.queue : [];
        var cleanQueue = [];
        for (var i = 0; i < rawQueue.length; i++) {
          var nu = historyLib.normalizeFriendUser ? historyLib.normalizeFriendUser(rawQueue[i]) : rawQueue[i];
          if (nu && !isKept(nu, keepSet)) cleanQueue.push(nu);
        }
        state.queue = cleanQueue;
        state.selectedIds = Array.isArray(saved.selectedIds)
          ? saved.selectedIds.map(String).filter(function (id) { return !keepSet.has(id) && !keepSet.has(id.toLowerCase()); })
          : cleanQueue.map(function (u) { return String(u.pk); });
        state.completedIds = Array.isArray(saved.completedIds) ? saved.completedIds.map(String) : [];
        state.failedIds = Array.isArray(saved.failedIds) ? saved.failedIds.map(String) : [];
        state.currentIndex = Number.isInteger(saved.currentIndex) && saved.currentIndex >= 0 ? saved.currentIndex : 0;
        state.unfollowsSincePause = Number.isInteger(saved.unfollowsSincePause) && saved.unfollowsSincePause >= 0 ? saved.unfollowsSincePause : 0;
        state.failsInARow = Number.isInteger(saved.failsInARow) && saved.failsInARow >= 0 ? saved.failsInARow : 0;
        state.confirmed = Boolean(saved.confirmed);
        state.nextRunAt = Number.isFinite(saved.nextRunAt) ? saved.nextRunAt : 0;
        state.cooldownUntil = Number.isFinite(saved.cooldownUntil) ? saved.cooldownUntil : 0;
        state.stopReason = typeof saved.stopReason === "string" ? saved.stopReason : "";
        state.updatedAt = Number.isFinite(saved.updatedAt) ? saved.updatedAt : 0;
        var prevStatus = typeof saved.status === "string" ? saved.status : "idle";
        // Advance currentIndex past any already-completed items so reload never restarts from zero.
        var doneSet = new Set(state.completedIds);
        while (state.currentIndex < state.queue.length && doneSet.has(String(state.queue[state.currentIndex].pk))) {
          state.currentIndex++;
        }
        if ((prevStatus === "running" || prevStatus === "waiting" || prevStatus === "safety_pause") && state.currentIndex < state.queue.length) {
          state.status = "paused";
        } else {
          state.status = prevStatus;
        }
      }
      notify();
      return getSnapshot();
    }

    function getSnapshot() {
      return {
        uid: state.uid || getUid(),
        status: state.status,
        running: running,
        queue: state.queue.slice(),
        selectedIds: state.selectedIds.slice(),
        completedIds: state.completedIds.slice(),
        failedIds: state.failedIds.slice(),
        currentIndex: state.currentIndex,
        unfollowsSincePause: state.unfollowsSincePause,
        failsInARow: state.failsInARow,
        confirmed: state.confirmed,
        nextRunAt: state.nextRunAt,
        cooldownUntil: state.cooldownUntil,
        stopReason: state.stopReason,
        updatedAt: state.updatedAt,
        total: state.queue.length,
        completed: state.completedIds.length,
        remaining: Math.max(0, state.queue.length - state.currentIndex)
      };
    }

    /**
     * Stages accounts picked by the user into the queue (excluding any keep-list accounts).
     * Staging ALWAYS resets `confirmed = false` so the user must explicitly confirm before starting.
     */
    async function enqueue(accounts, options) {
      if (running) {
        throw new Error("Cannot replace queue while unfollow queue is running");
      }
      var opts = options && typeof options === "object" ? options : {};
      var cleanUid = opts.uid || getUid();
      state.uid = cleanUid;
      var keepSet = await readKeepSet(cleanUid, opts.keep);
      var list = Array.isArray(accounts) ? accounts : [];
      var filtered = [];
      var seen = new Set();

      for (var i = 0; i < list.length; i++) {
        var raw = list[i];
        var u = historyLib.normalizeFriendUser ? historyLib.normalizeFriendUser(raw) : raw;
        if (!u || !u.pk) continue;
        var pk = String(u.pk);
        if (seen.has(pk) || isKept(u, keepSet)) continue;
        seen.add(pk);
        filtered.push(u);
      }

      state.queue = filtered;
      state.selectedIds = filtered.map(function (u) { return String(u.pk); });
      state.completedIds = [];
      state.failedIds = [];
      state.currentIndex = 0;
      state.unfollowsSincePause = 0;
      state.failsInARow = 0;
      state.confirmed = false;
      state.nextRunAt = 0;
      state.stopReason = "";
      state.status = filtered.length ? "confirming" : "idle";

      await persistState();
      notify();
      return getSnapshot();
    }

    /**
     * Removes an account from the queue immediately (e.g. when added to the keep list).
     */
    async function removeAccount(pkOrUsername) {
      var target = String(pkOrUsername ?? "").trim();
      if (!target) return getSnapshot();
      var lower = target.toLowerCase();
      var newQueue = [];
      var newIndex = state.currentIndex;

      for (var i = 0; i < state.queue.length; i++) {
        var u = state.queue[i];
        var match = String(u.pk) === target || (typeof u.username === "string" && u.username.toLowerCase() === lower);
        if (match) {
          if (i < state.currentIndex) newIndex = Math.max(0, newIndex - 1);
          continue;
        }
        newQueue.push(u);
      }
      state.queue = newQueue;
      state.selectedIds = state.selectedIds.filter(function (id) { return id !== target && id.toLowerCase() !== lower; });
      state.currentIndex = Math.min(newIndex, state.queue.length);
      await persistState();
      notify();
      return getSnapshot();
    }

    function confirm() {
      if (!state.queue.length) return false;
      state.confirmed = true;
      notify();
      return true;
    }

    async function checkCooldownLeft() {
      var left = 0;
      if (state.cooldownUntil > now()) {
        left = Math.max(left, state.cooldownUntil - now());
      }
      if (cooldown && typeof cooldown.remainingMs === "function") {
        var cdLeft = await cooldown.remainingMs();
        if (cdLeft > left) left = cdLeft;
      }
      if (d.api && typeof d.api.cooldownLeft === "function") {
        var apiLeft = await d.api.cooldownLeft();
        if (apiLeft > left) left = apiLeft;
      }
      return left;
    }

    async function trigger24hCooldown() {
      var until = now() + cooldown24hMs;
      state.cooldownUntil = until;
      if (cooldown && typeof cooldown.setUntil === "function") {
        await cooldown.setUntil(until);
      }
      if (d.api && typeof d.api.startCooldown === "function") {
        try { await d.api.startCooldown(cooldown24hMs); } catch (_) {}
      }
      return until;
    }

    /**
     * Starts or resumes the unfollow queue.
     * Refuses to start if `state.confirmed !== true` (confirm required before first start).
     */
    async function start(options) {
      var opts = options && typeof options === "object" ? options : {};
      if (opts.confirmed === true) {
        state.confirmed = true;
      }
      if (!state.confirmed) {
        state.status = state.queue.length ? "confirming" : "idle";
        notify();
        return { started: false, status: "confirm_required", reason: "confirm_required", snapshot: getSnapshot() };
      }
      if (running) {
        return { started: false, status: "already_running", snapshot: getSnapshot() };
      }

      var cleanUid = getUid();
      var cdLeft = await checkCooldownLeft();
      if (cdLeft > 0) {
        state.status = "rate_limited";
        state.stopReason = "rate_limited";
        await persistState();
        notify();
        return { started: false, status: "rate_limited", remainingMs: cdLeft, snapshot: getSnapshot() };
      }

      var keepSet = await readKeepSet(cleanUid, opts.keep);
      var selectedSet = new Set(state.selectedIds.map(String));
      var completedSet = new Set(state.completedIds.map(String));

      // Exclude any keep-listed account before starting/resuming.
      state.queue = state.queue.filter(function (u) {
        return u && selectedSet.has(String(u.pk)) && !isKept(u, keepSet);
      });

      while (state.currentIndex < state.queue.length && completedSet.has(String(state.queue[state.currentIndex].pk))) {
        state.currentIndex++;
      }

      if (state.currentIndex >= state.queue.length) {
        state.status = "completed";
        await persistState();
        notify();
        return { started: true, status: "completed", snapshot: getSnapshot() };
      }

      var daily = await getDailyUsage(cleanUid);
      if (daily.count >= dailyCap) {
        state.status = "daily_cap";
        state.stopReason = "daily_cap";
        await persistState();
        notify();
        return { started: false, status: "daily_cap", dailyCount: daily.count, dailyCap: dailyCap, snapshot: getSnapshot() };
      }

      running = true;
      cancelled = false;
      state.status = "running";
      state.stopReason = "";
      await persistState();
      notify();

      try {
        // If resuming while a persisted delay/pause deadline (nextRunAt) is still in the future, honour it first.
        if (state.nextRunAt > now() && !cancelled) {
          var resumeWaitMs = state.nextRunAt - now();
          state.status = "waiting";
          notify();
          await interruptibleSleep(resumeWaitMs);
        }

        while (state.currentIndex < state.queue.length && !cancelled) {
          var liveCooldown = await checkCooldownLeft();
          if (liveCooldown > 0) {
            state.status = "rate_limited";
            state.stopReason = "rate_limited";
            await persistState();
            notify();
            return { started: true, status: "rate_limited", remainingMs: liveCooldown, snapshot: getSnapshot() };
          }

          var liveDaily = await getDailyUsage(cleanUid);
          if (liveDaily.count >= dailyCap) {
            state.status = "daily_cap";
            state.stopReason = "daily_cap";
            await persistState();
            notify();
            return { started: true, status: "daily_cap", dailyCount: liveDaily.count, dailyCap: dailyCap, snapshot: getSnapshot() };
          }

          var user = state.queue[state.currentIndex];
          var liveKeep = await readKeepSet(cleanUid, opts.keep);

          // Never touch accounts outside user's explicit selection or inside keep list.
          if (!user || !selectedSet.has(String(user.pk)) || isKept(user, liveKeep) || completedSet.has(String(user.pk))) {
            state.currentIndex++;
            await persistState();
            notify();
            continue;
          }

          state.status = "running";
          state.nextRunAt = 0;
          notify();

          var res;
          try {
            res = await unfollowFn(user);
          } catch (err) {
            var limited = historyLib.isRateLimitError ? historyLib.isRateLimitError(err) : Boolean(err && err.rateLimited);
            res = { outcome: limited ? "blocked" : "failed", detail: (err && err.message) || "error" };
          }

          var outcome = (res && res.outcome) || "failed";

          if (outcome === "blocked") {
            await trigger24hCooldown();
            state.status = "rate_limited";
            state.stopReason = "rate_limited";
            await persistState();
            notify();
            return { started: true, status: "rate_limited", remainingMs: cooldown24hMs, snapshot: getSnapshot() };
          }

          if (outcome === "unfollowed") {
            var pkStr = String(user.pk);
            completedSet.add(pkStr);
            if (state.completedIds.indexOf(pkStr) === -1) state.completedIds.push(pkStr);
            state.failsInARow = 0;
            state.unfollowsSincePause++;
            state.currentIndex++;
            await recordDailyUnfollow(cleanUid, pkStr);
            await recordUnfollowedInScan(cleanUid, pkStr);
            await persistState();
            notify();
          } else {
            var failPk = String(user.pk);
            if (state.failedIds.indexOf(failPk) === -1) state.failedIds.push(failPk);
            state.failsInARow++;
            state.currentIndex++;
            await persistState();
            notify();

            if (state.failsInARow >= MAX_FAILS_IN_A_ROW) {
              state.status = "stopped";
              state.stopReason = "max_fails";
              await persistState();
              notify();
              return { started: true, status: "stopped", reason: "max_fails", snapshot: getSnapshot() };
            }
          }

          // Check if we reached the end of the queue or the daily cap after this unfollow.
          if (state.currentIndex >= state.queue.length) {
            break;
          }
          var afterDaily = await getDailyUsage(cleanUid);
          if (afterDaily.count >= dailyCap) {
            state.status = "daily_cap";
            state.stopReason = "daily_cap";
            await persistState();
            notify();
            return { started: true, status: "daily_cap", dailyCount: afterDaily.count, dailyCap: dailyCap, snapshot: getSnapshot() };
          }

          if (cancelled) break;

          // Safety pause: 10 minutes after every 10 unfollows.
          if (outcome === "unfollowed" && state.unfollowsSincePause >= unfollowsBeforePause) {
            state.unfollowsSincePause = 0;
            state.status = "safety_pause";
            state.nextRunAt = now() + pauseDurationMs;
            await persistState();
            notify();
            await interruptibleSleep(pauseDurationMs);
            if (cancelled) break;
          } else {
            var delayMs = unfollowDelayMs(minDelayMs, maxDelayMs, random);
            state.status = "waiting";
            state.nextRunAt = now() + delayMs;
            await persistState();
            notify();
            await interruptibleSleep(delayMs);
            if (cancelled) break;
          }
        }

        if (cancelled) {
          state.status = "cancelled";
          state.nextRunAt = 0;
          await persistState();
          notify();
          return { started: true, status: "cancelled", snapshot: getSnapshot() };
        }

        state.status = "completed";
        state.nextRunAt = 0;
        await persistState();
        notify();
        return { started: true, status: "completed", snapshot: getSnapshot() };
      } finally {
        running = false;
        notify();
      }
    }

    async function resume(options) {
      await loadState(options && options.uid);
      if (!state.confirmed) {
        return { started: false, status: "confirm_required", reason: "confirm_required", snapshot: getSnapshot() };
      }
      return start(options);
    }

    async function cancel() {
      cancelled = true;
      if (typeof cancelWait === "function") {
        cancelWait();
      }
      state.status = "cancelled";
      state.nextRunAt = 0;
      await persistState();
      notify();
      return getSnapshot();
    }

    /**
     * Mounts the persistent warning banner, confirm dialog (with default focus on "Vazgeç" / "Cancel"),
     * and queue progress bar into a parent DOM container.
     */
    function mountView(container, viewOpts) {
      var vo = viewOpts || {};
      var doc = vo.document || d.document || (typeof document !== "undefined" ? document : null);
      if (!doc || !container) return null;
      var locale = detectLocale(vo.locale ? vo : d);
      var t = function (k, subs) { return translate(k, subs, locale); };

      function el(tag, className, text) {
        var node = doc.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null && text !== "") node.textContent = String(text);
        return node;
      }

      var root = el("div", "uq-box");

      // Persistent warning above the queue (always visible!).
      var warning = el("div", "uq-warning");
      warning.setAttribute("role", "note");
      var warnIcon = el("span", "uq-warning-icon", "⚠");
      warnIcon.setAttribute("aria-hidden", "true");
      var warnText = el("span", "uq-warning-text", t("persistentWarning"));
      warning.appendChild(warnIcon);
      warning.appendChild(warnText);

      // Confirm dialog box (shown before first start, default focus on "Vazgeç").
      var confirmBox = el("div", "uq-confirm");
      confirmBox.setAttribute("role", "alertdialog");
      confirmBox.setAttribute("aria-modal", "true");
      confirmBox.hidden = true;

      var confirmTitle = el("h3", "uq-confirm-title", t("dialogTitle"));
      var confirmText = el("p", "uq-confirm-text", t("confirmText"));
      var confirmMeta = el("p", "uq-confirm-meta");
      var confirmPacing = el("p", "uq-confirm-meta", t("pacingNote"));
      var confirmPrivate = el("p", "uq-confirm-meta", t("privateNote"));
      confirmPrivate.hidden = true;

      var confirmActions = el("div", "uq-actions");
      var cancelBtn = el("button", "uq-btn uq-btn--cancel", t("confirmCancel"));
      cancelBtn.type = "button";
      var acceptBtn = el("button", "uq-btn uq-btn--danger uq-btn--accept", t("confirmStart"));
      acceptBtn.type = "button";
      confirmActions.appendChild(cancelBtn);
      confirmActions.appendChild(acceptBtn);

      confirmBox.appendChild(confirmTitle);
      confirmBox.appendChild(confirmText);
      confirmBox.appendChild(confirmMeta);
      confirmBox.appendChild(confirmPacing);
      confirmBox.appendChild(confirmPrivate);
      confirmBox.appendChild(confirmActions);

      var statusBar = el("div", "uq-bar");
      var statusText = el("p", "uq-status");
      statusText.setAttribute("aria-live", "polite");
      var allowanceText = el("p", "uq-allowance");
      var actionBtn = el("button", "uq-btn uq-btn--accent");
      actionBtn.type = "button";
      statusBar.appendChild(statusText);
      statusBar.appendChild(actionBtn);

      var progressWrap = el("div", "uq-progress");
      var progressFill = el("div", "uq-progress-fill");
      progressWrap.appendChild(progressFill);

      root.appendChild(warning);
      root.appendChild(confirmBox);
      root.appendChild(statusBar);
      root.appendChild(allowanceText);
      root.appendChild(progressWrap);
      container.appendChild(root);

      function openConfirm(accounts) {
        Promise.resolve().then(async function () {
          if (Array.isArray(accounts)) {
            await enqueue(accounts, { keep: vo.keep });
          }
          if (!state.queue.length) return;
          var daily = await getDailyUsage(getUid());
          var remainingAllowance = Math.max(0, dailyCap - daily.count);
          confirmMeta.textContent = t("queueSummary", [String(state.queue.length), String(remainingAllowance), String(dailyCap)]);
          confirmPrivate.hidden = !state.queue.some(function (u) { return Boolean(u && u.is_private); });
          confirmBox.hidden = false;
          // Default focus stays on "Vazgeç" / "Cancel".
          if (typeof cancelBtn.focus === "function") {
            try { cancelBtn.focus(); } catch (_) {}
          }
        });
      }

      function closeConfirm() {
        confirmBox.hidden = true;
      }

      cancelBtn.addEventListener("click", function () {
        closeConfirm();
        if (state.status === "confirming") {
          state.status = "idle";
          notify();
        }
      });

      acceptBtn.addEventListener("click", function () {
        closeConfirm();
        confirm();
        start({ confirmed: true, keep: vo.keep });
      });

      confirmBox.addEventListener("keydown", function (e) {
        if (e && e.key === "Escape") {
          if (typeof e.preventDefault === "function") e.preventDefault();
          if (typeof e.stopPropagation === "function") e.stopPropagation();
          closeConfirm();
        }
      });

      actionBtn.addEventListener("click", function () {
        if (running) {
          cancel();
        } else if (state.confirmed && state.currentIndex < state.queue.length) {
          start({ confirmed: true, keep: vo.keep });
        } else if (state.queue.length) {
          openConfirm();
        }
      });

      async function renderView() {
        var daily = await getDailyUsage(getUid());
        var remAllow = Math.max(0, dailyCap - daily.count);
        allowanceText.textContent = t("queueSummary", [String(state.queue.length), String(remAllow), String(dailyCap)]);

        var total = state.queue.length;
        var done = state.completedIds.length;
        var pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
        progressFill.style.width = pct + "%";

        if (running) {
          actionBtn.hidden = false;
          actionBtn.textContent = t("btnCancelQueue");
          actionBtn.className = "uq-btn uq-btn--danger";
          var cur = state.queue[state.currentIndex];
          if (state.status === "safety_pause") {
            var leftPauseS = Math.max(0, Math.ceil((state.nextRunAt - now()) / 1000));
            statusText.textContent = t("statusSafetyPause", [clock(leftPauseS), String(done), String(total)]);
          } else if (state.status === "waiting") {
            var leftWaitS = Math.max(0, Math.ceil((state.nextRunAt - now()) / 1000));
            statusText.textContent = t("statusWaiting", [String(done), String(total), String(leftWaitS)]);
          } else {
            statusText.textContent = t("statusRunning", [cur ? cur.username : "", String(state.currentIndex + 1), String(total)]);
          }
        } else {
          if (state.status === "daily_cap") {
            statusText.textContent = t("statusDailyCap", [String(daily.count), String(dailyCap)]);
            actionBtn.hidden = true;
          } else if (state.status === "rate_limited") {
            statusText.textContent = t("statusRateLimited");
            actionBtn.hidden = true;
          } else if (state.status === "stopped" && state.stopReason === "max_fails") {
            statusText.textContent = t("statusStoppedFails", [String(MAX_FAILS_IN_A_ROW)]);
            actionBtn.hidden = !total || state.currentIndex >= total;
            actionBtn.textContent = t("btnResumeQueue", [String(Math.max(0, total - state.currentIndex))]);
            actionBtn.className = "uq-btn uq-btn--accent";
          } else if (state.status === "cancelled") {
            statusText.textContent = t("statusCancelled", [String(done), String(total)]);
            actionBtn.hidden = state.currentIndex >= total;
            actionBtn.textContent = t("btnResumeQueue", [String(Math.max(0, total - state.currentIndex))]);
            actionBtn.className = "uq-btn uq-btn--accent";
          } else if (state.status === "completed") {
            statusText.textContent = t("statusCompleted", [String(done), String(total)]);
            actionBtn.hidden = true;
          } else if (state.status === "paused" && total > 0 && state.currentIndex < total) {
            statusText.textContent = t("statusPausedReload", [String(done), String(total)]);
            actionBtn.hidden = false;
            actionBtn.textContent = t("btnResumeQueue", [String(total - state.currentIndex)]);
            actionBtn.className = "uq-btn uq-btn--accent";
          } else {
            statusText.textContent = t("statusIdle", [String(remAllow), String(dailyCap)]);
            actionBtn.hidden = !total;
            actionBtn.textContent = t("btnStartQueue", [String(total)]);
            actionBtn.className = "uq-btn uq-btn--accent";
          }
        }
      }

      var unsub = onChange(function () { renderView(); });
      renderView();

      return {
        root: root,
        warning: warning,
        confirmBox: confirmBox,
        cancelBtn: cancelBtn,
        acceptBtn: acceptBtn,
        actionBtn: actionBtn,
        statusText: statusText,
        openConfirm: openConfirm,
        closeConfirm: closeConfirm,
        render: renderView,
        destroy: function () {
          unsub();
          if (typeof root.remove === "function") root.remove();
        }
      };
    }

    function featureStart(settings) {
      active = true;
      var sh = d.shadow || shadowLib;
      if (sh && settings && settings.ui) {
        if (typeof settings.ui.theme === "string" && typeof sh.setTheme === "function") sh.setTheme(settings.ui.theme);
        if (typeof settings.ui.animations === "boolean" && typeof sh.setMotion === "function") sh.setMotion(settings.ui.animations);
      }
      loadState();
    }

    function featureUpdate(settings) {
      var sh = d.shadow || shadowLib;
      if (sh && settings && settings.ui) {
        if (typeof settings.ui.theme === "string" && typeof sh.setTheme === "function") sh.setTheme(settings.ui.theme);
        if (typeof settings.ui.animations === "boolean" && typeof sh.setMotion === "function") sh.setMotion(settings.ui.animations);
      }
    }

    function featureStop() {
      active = false;
      if (running) {
        cancel();
      }
    }

    return {
      enqueue: enqueue,
      removeAccount: removeAccount,
      confirm: confirm,
      start: start,
      resume: resume,
      cancel: cancel,
      loadState: loadState,
      getSnapshot: getSnapshot,
      getDailyUsage: getDailyUsage,
      checkCooldownLeft: checkCooldownLeft,
      onChange: onChange,
      mountView: mountView,
      featureStart: featureStart,
      featureUpdate: featureUpdate,
      featureStop: featureStop,
      isActive: function () { return active; },
      isRunning: function () { return running; }
    };
  }

  var defaultController = createQueueController();

  // Register with IY.core.feature (default OFF).
  if (globalThis.IY && globalThis.IY.core && typeof globalThis.IY.core.feature === "function") {
    globalThis.IY.core.feature("unfollowQueue", {
      keys: ["ui"],
      enabled: function (settings) {
        return Boolean(settings && settings.ui && settings.ui.unfollowQueue === true);
      },
      start: function (settings) { defaultController.featureStart(settings); },
      update: function (settings) { defaultController.featureUpdate(settings); },
      stop: function () { defaultController.featureStop(); }
    });
  }

  var exported = {
    MIN_DELAY_MS: MIN_DELAY_MS,
    MAX_DELAY_MS: MAX_DELAY_MS,
    DAILY_CAP: DAILY_CAP,
    UNFOLLOWS_BEFORE_PAUSE: UNFOLLOWS_BEFORE_PAUSE,
    PAUSE_DURATION_MS: PAUSE_DURATION_MS,
    COOLDOWN_24H_MS: COOLDOWN_24H_MS,
    MAX_FAILS_IN_A_ROW: MAX_FAILS_IN_A_ROW,
    UNFOLLOW_OP: UNFOLLOW_OP,
    UNFOLLOW_DOC_ID: UNFOLLOW_DOC_ID,
    STRINGS: STRINGS,
    QUEUE_CSS: QUEUE_CSS,
    queueStateKey: queueStateKey,
    queueDailyKey: queueDailyKey,
    dayKey: dayKey,
    unfollowDelayMs: unfollowDelayMs,
    unfollowEtaMs: unfollowEtaMs,
    formatDuration: formatDuration,
    clock: clock,
    jazoest: jazoest,
    findFriendshipStatus: findFriendshipStatus,
    extractSessionTokens: extractSessionTokens,
    isStillFollowing: isStillFollowing,
    executeUnfollowMutation: executeUnfollowMutation,
    unfollowUser: unfollowUser,
    createQueueController: createQueueController,
    getController: function () { return defaultController; }
  };

  globalThis.IY = Object.assign(globalThis.IY || {}, { unfollowQueue: exported });
  if (isNode) module.exports = exported;
})();
