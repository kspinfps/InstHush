// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
// Unfollowers scan pacing, friendship pagination, snapshot diff ("since last scan"),
// bounded 100-entry history, and formula-safe CSV export via src/lib/csv.js.
(function () {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;
  var csvLib = isNode ? require("../../lib/csv.js") : (globalThis.IY && globalThis.IY.csv) || {};
  var rateLimitLib = isNode ? require("../../lib/rate-limit.js") : (globalThis.IY && globalThis.IY.rateLimit) || {};
  var headersLib = isNode ? require("../core/headers.js") : (globalThis.IY && globalThis.IY.headers) || {};
  var apiLib = isNode ? require("../core/api.js") : (globalThis.IY && globalThis.IY.api) || {};

  var PAGE_SIZE = 50;
  /** Pages read per list before the scan stops as a safety guard (12,500 accounts). */
  var PAGE_SAFETY_LIMIT = 250;
  /** Long safety pause is taken once every this many pages. */
  var PAGES_BEFORE_LONG_PAUSE = 15;
  var DEFAULT_PAGE_DELAY_MS = 1000;
  var DEFAULT_LONG_PAUSE_MS = 10000;
  var MAX_RETRIES = 3;
  var RATE_LIMIT_RETRY_S = 30;
  var NETWORK_RETRY_S = 5;
  var BLOCKED_COOLDOWN_MS = 30 * 60 * 1000;
  /** Maximum history entries kept per account, newest first. */
  var HISTORY_LIMIT = 100;

  var ORDER = Object.freeze(["followers", "following"]);

  var CHANGE_LABELS = Object.freeze({
    lost: "Unfollowed you",
    gained: "New followers",
    unfollowed: "You unfollowed",
    followed: "You followed"
  });

  var CHANGE_LABELS_TR = Object.freeze({
    lost: "Takibi bırakanlar",
    gained: "Yeni takipçiler",
    unfollowed: "Senin takipten çıktıkların",
    followed: "Yeni takip ettiklerin"
  });

  var CHANGE_FILE_NAMES = Object.freeze({
    lost: "unfollowedYou",
    gained: "newFollowers",
    unfollowed: "youUnfollowed",
    followed: "youFollowed"
  });

  var CHANGE_KINDS = Object.freeze(["lost", "gained", "unfollowed", "followed"]);

  function storageKey(uid) { return "unfollowers:" + String(uid); }
  function baseKey(uid) { return "unfollowers:base:" + String(uid); }
  function historyKey(uid) { return "unfollowers:history:" + String(uid); }
  function seenKey(uid) { return "unfollowers:seen:" + String(uid); }
  function keepKey(uid) { return "unfollowers:keep:" + String(uid); }
  function keepMetaKey(uid) { return "unfollowers:keepmeta:" + String(uid); }

  /**
   * Milliseconds to wait between two pages: a 0.3 to 1 s jitter, plus the delay to 1.3 times it.
   */
  function pageDelayMs(delayMs, rnd) {
    var base = Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : DEFAULT_PAGE_DELAY_MS;
    var random = typeof rnd === "function" ? rnd : Math.random;
    return Math.floor(random() * 700) + 300 + Math.floor(random() * (base - base * 0.7)) + base;
  }

  /**
   * Milliseconds of the long pause every N pages: the setting give or take 5 s, never below 0.
   */
  function longPauseMs(pauseMs, rnd) {
    var base = Number.isFinite(pauseMs) && pauseMs >= 0 ? pauseMs : DEFAULT_LONG_PAUSE_MS;
    var random = typeof rnd === "function" ? rnd : Math.random;
    return Math.max(0, Math.floor(base + (random() * 10000 - 5000)));
  }

  /**
   * Seconds to wait before retry `attempt` (1-based).
   */
  function retryWaitS(attempt, rateLimited) {
    var n = Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 1;
    return (rateLimited ? RATE_LIMIT_RETRY_S : NETWORK_RETRY_S) * n;
  }

  function normalizeFriendUser(u) {
    if (!u || typeof u !== "object") return null;
    var rawPk = u.pk !== undefined && u.pk !== null ? u.pk : (u.pk_id !== undefined && u.pk_id !== null ? u.pk_id : u.id);
    var pk = rawPk !== undefined && rawPk !== null ? String(rawPk).trim() : "";
    var username = typeof u.username === "string" ? u.username.trim() : "";
    if (!pk && !username) return null;
    return {
      pk: pk || username.toLowerCase(),
      username: username || pk,
      full_name: typeof u.full_name === "string" ? u.full_name : "",
      profile_pic_url: typeof u.profile_pic_url === "string" ? u.profile_pic_url : "",
      is_verified: Boolean(u.is_verified),
      is_private: Boolean(u.is_private)
    };
  }

  /**
   * Minimal fields stored in snapshots/history. Profile picture URLs expire, so none are kept.
   */
  function mini(u) {
    if (!u || typeof u !== "object") return { pk: "", username: "" };
    var rawPk = u.pk !== undefined && u.pk !== null ? u.pk : (u.pk_id !== undefined && u.pk_id !== null ? u.pk_id : u.id);
    var pk = rawPk !== undefined && rawPk !== null ? String(rawPk).trim() : "";
    var username = typeof u.username === "string" ? u.username.trim() : "";
    var out = {
      pk: pk || username.toLowerCase(),
      username: username || pk
    };
    if (typeof u.full_name === "string" && u.full_name) out.full_name = u.full_name;
    if (u.is_verified) out.is_verified = true;
    return out;
  }

  function snapshot(at, followers, following) {
    var fList = Array.isArray(followers) ? followers : [];
    var gList = Array.isArray(following) ? following : [];
    var cleanFollowers = [];
    var cleanFollowing = [];
    for (var i = 0; i < fList.length; i++) {
      if (!fList[i] || typeof fList[i] !== "object") continue;
      var mf = mini(fList[i]);
      if (mf.pk || mf.username) cleanFollowers.push(mf);
    }
    for (var j = 0; j < gList.length; j++) {
      if (!gList[j] || typeof gList[j] !== "object") continue;
      var mg = mini(gList[j]);
      if (mg.pk || mg.username) cleanFollowing.push(mg);
    }
    return {
      at: Number.isFinite(at) ? at : 0,
      followers: cleanFollowers,
      following: cleanFollowing
    };
  }

  /**
   * Membership by id or by lower-case username: an account only counts as missing when
   * neither matches, so a renamed account or changed id format never flags a real follower.
   */
  function userIndex(users) {
    var ids = new Set();
    var names = new Set();
    var list = Array.isArray(users) ? users : [];
    for (var i = 0; i < list.length; i++) {
      var u = list[i];
      if (!u || typeof u !== "object") continue;
      var rawPk = u.pk !== undefined && u.pk !== null ? u.pk : u.id;
      if (rawPk !== undefined && rawPk !== null && String(rawPk).trim() !== "") {
        ids.add(String(rawPk).trim());
      }
      var name = typeof u.username === "string" ? u.username.trim().toLowerCase() : "";
      if (name) names.add(name);
    }
    return function (u) {
      if (!u || typeof u !== "object") return false;
      var rawPk = u.pk !== undefined && u.pk !== null ? u.pk : u.id;
      var pk = rawPk !== undefined && rawPk !== null ? String(rawPk).trim() : "";
      var name = typeof u.username === "string" ? u.username.trim().toLowerCase() : "";
      return (pk !== "" && ids.has(pk)) || (name !== "" && names.has(name));
    };
  }

  function missingFrom(from, other) {
    var list = Array.isArray(from) ? from : [];
    var has = userIndex(other);
    return list.filter(function (u) { return u && typeof u === "object" && !has(u); });
  }

  /**
   * Diffs two complete scan snapshots. Without a previous scan, records only the counts.
   */
  function diffScans(prev, next) {
    var safeNext = next && typeof next === "object" ? next : { at: 0, followers: [], following: [] };
    var nextFollowers = Array.isArray(safeNext.followers) ? safeNext.followers : [];
    var nextFollowing = Array.isArray(safeNext.following) ? safeNext.following : [];
    var base = {
      at: Number.isFinite(safeNext.at) ? safeNext.at : 0,
      followers: nextFollowers.length,
      following: nextFollowing.length
    };
    if (!prev || typeof prev !== "object") {
      return Object.assign({}, base, {
        lost: [],
        gained: [],
        unfollowed: [],
        followed: []
      });
    }
    var prevFollowers = Array.isArray(prev.followers) ? prev.followers : [];
    var prevFollowing = Array.isArray(prev.following) ? prev.following : [];
    return Object.assign({}, base, {
      prevAt: prev.at,
      lost: missingFrom(prevFollowers, nextFollowers),
      gained: missingFrom(nextFollowers, prevFollowers),
      unfollowed: missingFrom(prevFollowing, nextFollowing),
      followed: missingFrom(nextFollowing, prevFollowing)
    });
  }

  function hasChanges(entry) {
    if (!entry || typeof entry !== "object") return false;
    return Boolean(
      (Array.isArray(entry.lost) && entry.lost.length) ||
      (Array.isArray(entry.gained) && entry.gained.length) ||
      (Array.isArray(entry.unfollowed) && entry.unfollowed.length) ||
      (Array.isArray(entry.followed) && entry.followed.length)
    );
  }

  function addEntry(history, entry, limit) {
    var max = Number.isInteger(limit) && limit > 0 ? limit : HISTORY_LIMIT;
    var list = Array.isArray(history) ? history : [];
    if (!entry || typeof entry !== "object") return list.slice(0, max);
    return [entry].concat(list).slice(0, max);
  }

  function isUnseen(history, seenAt) {
    var list = Array.isArray(history) ? history : [];
    var latest = list[0];
    if (!latest || latest.prevAt === undefined) return false;
    var hasFollowerDelta = Boolean(
      (Array.isArray(latest.lost) && latest.lost.length) ||
      (Array.isArray(latest.gained) && latest.gained.length)
    );
    var seenTs = Number.isFinite(seenAt) ? seenAt : 0;
    return hasFollowerDelta && latest.at > seenTs;
  }

  function newFollowersText(n, locale) {
    var count = Number.isFinite(n) ? n : 0;
    if (typeof locale === "string" && /^tr/i.test(locale.trim())) {
      return count + " yeni takipçi";
    }
    return count + " new follower" + (count === 1 ? "" : "s");
  }

  function unfollowedYouText(n, locale) {
    var count = Number.isFinite(n) ? n : 0;
    if (typeof locale === "string" && /^tr/i.test(locale.trim())) {
      return count + " kişi takibi bıraktı";
    }
    return count + " unfollowed you";
  }

  function csvCell(value) {
    if (csvLib && typeof csvLib.csvCell === "function") {
      return csvLib.csvCell(value);
    }
    var text = value == null ? "" : String(value);
    var guarded = /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
    return '"' + guarded.replace(/"/g, '""') + '"';
  }

  function writeCsv(rows) {
    if (csvLib && typeof csvLib.writeCsv === "function") {
      return csvLib.writeCsv(rows);
    }
    return "\uFEFF" + rows.map(function (row) {
      return Array.from(row, csvCell).join(",");
    }).join("\r\n");
  }

  /**
   * Formats a user list as UTF-8 BOM CSV via src/lib/csv.js.
   */
  function usersCsv(users) {
    var list = Array.isArray(users) ? users : [];
    var rows = [["username", "full_name", "profile_url", "verified", "private"]];
    for (var i = 0; i < list.length; i++) {
      var u = list[i];
      if (!u || typeof u !== "object") continue;
      var uname = typeof u.username === "string" ? u.username : "";
      rows.push([
        uname,
        typeof u.full_name === "string" ? u.full_name : "",
        uname ? "https://www.instagram.com/" + uname + "/" : "",
        u.is_verified ? "yes" : "no",
        u.is_private ? "yes" : "no"
      ]);
    }
    return writeCsv(rows);
  }

  /**
   * Formats scan history changes as UTF-8 BOM CSV via src/lib/csv.js.
   */
  function historyCsv(history, kinds, options) {
    var list = Array.isArray(history) ? history : [];
    var activeKinds = Array.isArray(kinds) && kinds.length ? kinds : CHANGE_KINDS;
    var opts = options && typeof options === "object" ? options : {};
    var labels = opts.locale === "tr" ? CHANGE_LABELS_TR : CHANGE_LABELS;
    var rows = [["scan_date", "change", "username", "full_name", "profile_url"]];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || typeof e !== "object") continue;
      var date = Number.isFinite(e.at) ? new Date(e.at).toISOString() : "";
      for (var k = 0; k < activeKinds.length; k++) {
        var kind = activeKinds[k];
        var users = Array.isArray(e[kind]) ? e[kind] : [];
        for (var uIdx = 0; uIdx < users.length; uIdx++) {
          var u = users[uIdx];
          if (!u || typeof u !== "object") continue;
          var uname = typeof u.username === "string" ? u.username : "";
          rows.push([
            date,
            labels[kind] || CHANGE_LABELS[kind] || kind,
            uname,
            typeof u.full_name === "string" ? u.full_name : "",
            uname ? "https://www.instagram.com/" + uname + "/" : ""
          ]);
        }
      }
    }
    return writeCsv(rows);
  }

  function emptyProgress() {
    return {
      followers: [],
      following: [],
      next: { followers: undefined, following: undefined },
      done: { followers: false, following: false },
      pages: { followers: 0, following: 0 },
      unfollowed: [],
      updatedAt: 0
    };
  }

  function normalizeProgress(raw) {
    if (!raw || typeof raw !== "object") return emptyProgress();
    var followers = Array.isArray(raw.followers) ? raw.followers.map(normalizeFriendUser).filter(Boolean) : [];
    var following = Array.isArray(raw.following) ? raw.following.map(normalizeFriendUser).filter(Boolean) : [];
    var next = raw.next && typeof raw.next === "object" ? {
      followers: typeof raw.next.followers === "string" && raw.next.followers ? raw.next.followers : undefined,
      following: typeof raw.next.following === "string" && raw.next.following ? raw.next.following : undefined
    } : { followers: undefined, following: undefined };
    var done = raw.done && typeof raw.done === "object" ? {
      followers: Boolean(raw.done.followers),
      following: Boolean(raw.done.following)
    } : { followers: false, following: false };
    var pages = raw.pages && typeof raw.pages === "object" ? {
      followers: Number.isInteger(raw.pages.followers) && raw.pages.followers >= 0 ? raw.pages.followers : Math.ceil(followers.length / PAGE_SIZE),
      following: Number.isInteger(raw.pages.following) && raw.pages.following >= 0 ? raw.pages.following : Math.ceil(following.length / PAGE_SIZE)
    } : {
      followers: Math.ceil(followers.length / PAGE_SIZE),
      following: Math.ceil(following.length / PAGE_SIZE)
    };
    var unfollowed = Array.isArray(raw.unfollowed) ? raw.unfollowed.map(function (id) { return String(id); }) : [];
    var updatedAt = Number.isFinite(raw.updatedAt) && raw.updatedAt > 0 ? raw.updatedAt : 0;
    return { followers: followers, following: following, next: next, done: done, pages: pages, unfollowed: unfollowed, updatedAt: updatedAt };
  }

  function isComplete(progress) {
    return Boolean(progress && progress.done && progress.done.followers && progress.done.following);
  }

  function computeSets(progress, history, keepIds, keepMeta) {
    var data = normalizeProgress(progress);
    var gone = new Set(data.unfollowed || []);
    var following = gone.size
      ? data.following.filter(function (u) { return !gone.has(String(u.pk)); })
      : data.following;
    var isFollower = userIndex(data.followers);
    var isFollowing = userIndex(following);
    var notBack = following.filter(function (u) { return !isFollower(u); });
    var fans = data.followers.filter(function (u) { return !isFollowing(u); });

    var histList = Array.isArray(history) ? history : [];
    var latest = histList[0];
    var unfollowedYou = latest && latest.prevAt !== undefined && Array.isArray(latest.lost) ? latest.lost : [];
    var newFollowers = latest && latest.prevAt !== undefined && Array.isArray(latest.gained) ? latest.gained : [];

    var keepSet = keepIds instanceof Set ? keepIds : new Set(Array.isArray(keepIds) ? keepIds.map(String) : []);
    var metaMap = new Map();
    if (keepMeta && typeof keepMeta === "object") {
      var entries = Array.isArray(keepMeta) ? keepMeta : Object.values(keepMeta);
      for (var m = 0; m < entries.length; m++) {
        var mu = normalizeFriendUser(entries[m]);
        if (mu) metaMap.set(String(mu.pk), mu);
      }
    }
    for (var i = 0; i < data.following.length; i++) {
      var fu = data.following[i];
      metaMap.set(String(fu.pk), fu);
    }
    for (var j = 0; j < data.followers.length; j++) {
      var fl = data.followers[j];
      if (!metaMap.has(String(fl.pk))) metaMap.set(String(fl.pk), fl);
    }
    var keepList = [];
    keepSet.forEach(function (id) {
      var cleanId = String(id).trim();
      if (!cleanId) return;
      var known = metaMap.get(cleanId);
      if (known) {
        keepList.push(known);
      } else {
        keepList.push({
          pk: cleanId,
          username: cleanId,
          full_name: "",
          profile_pic_url: "",
          is_verified: false,
          is_private: false
        });
      }
    });

    return {
      notBack: notBack,
      unfollowedYou: unfollowedYou,
      lost: unfollowedYou,
      newFollowers: newFollowers,
      gained: newFollowers,
      keepList: keepList,
      keep: keepList,
      history: histList,
      changes: histList,
      fans: fans,
      followers: data.followers,
      following: following
    };
  }

  /**
   * Fetches one page (count=50) of a user's followers or following list:
   * GET /api/v1/friendships/{userId}/{followers|following}/?count=50&max_id={maxId}
   */
  async function getFriendshipPage(userId, kind, maxId, opts) {
    var uid = String(userId ?? "").trim();
    if (!uid) throw new Error("Invalid userId for getFriendshipPage");
    if (kind !== "followers" && kind !== "following") {
      throw new Error("Invalid friendship list kind: " + String(kind));
    }
    var o = opts && typeof opts === "object" ? opts : {};
    var api = o.api || (globalThis.IY && globalThis.IY.api) || apiLib;
    if (!api || typeof api.igGet !== "function") {
      throw new Error("IY.api.igGet is unavailable");
    }
    var qs = new URLSearchParams({ count: String(PAGE_SIZE) });
    if (maxId !== undefined && maxId !== null && String(maxId) !== "") {
      qs.set("max_id", String(maxId));
    }
    var path = "/api/v1/friendships/" + encodeURIComponent(uid) + "/" + kind + "/?" + qs.toString();
    var data = await api.igGet(path, { signal: o.signal, ownRetry: Boolean(o.ownRetry) });
    var rawUsers = data && Array.isArray(data.users) ? data.users : [];
    var users = [];
    for (var i = 0; i < rawUsers.length; i++) {
      var normalized = normalizeFriendUser(rawUsers[i]);
      if (normalized) users.push(normalized);
    }
    var more = Boolean(
      data &&
      data.next_max_id !== undefined &&
      data.next_max_id !== null &&
      String(data.next_max_id) !== "" &&
      data.has_more !== false &&
      users.length > 0
    );
    return {
      users: users,
      next: more ? String(data.next_max_id) : undefined
    };
  }

  function createStorageHelper(area) {
    var target = area || (globalThis.chrome && globalThis.chrome.storage && globalThis.chrome.storage.local);
    if (!target || typeof target.get !== "function" || typeof target.set !== "function") {
      var mem = Object.create(null);
      return {
        async get(keys) {
          if (typeof keys === "string") return { [keys]: mem[keys] };
          if (Array.isArray(keys)) {
            var out = {};
            for (var i = 0; i < keys.length; i++) out[keys[i]] = mem[keys[i]];
            return out;
          }
          return Object.assign({}, mem);
        },
        async set(obj) { Object.assign(mem, obj); },
        async remove(keys) {
          var list = Array.isArray(keys) ? keys : [keys];
          for (var i = 0; i < list.length; i++) delete mem[list[i]];
        }
      };
    }
    return {
      get: function (keys) {
        return new Promise(function (resolve, reject) {
          try {
            var settled = false;
            var done = function (val) { if (!settled) { settled = true; resolve(val || {}); } };
            var fail = function (err) { if (!settled) { settled = true; reject(err); } };
            var ret = target.get(keys, function (res) {
              var err = globalThis.chrome && globalThis.chrome.runtime && globalThis.chrome.runtime.lastError;
              if (err) fail(new Error(err.message || "storage.get failed"));
              else done(res);
            });
            if (ret && typeof ret.then === "function") ret.then(done, fail);
          } catch (e) { reject(e); }
        });
      },
      set: function (obj) {
        return new Promise(function (resolve, reject) {
          try {
            var settled = false;
            var done = function () { if (!settled) { settled = true; resolve(); } };
            var fail = function (err) { if (!settled) { settled = true; reject(err); } };
            var ret = target.set(obj, function () {
              var err = globalThis.chrome && globalThis.chrome.runtime && globalThis.chrome.runtime.lastError;
              if (err) fail(new Error(err.message || "storage.set failed"));
              else done();
            });
            if (ret && typeof ret.then === "function") ret.then(done, fail);
          } catch (e) { reject(e); }
        });
      },
      remove: function (keys) {
        return new Promise(function (resolve, reject) {
          try {
            if (typeof target.remove !== "function") {
              var patch = {};
              var list = Array.isArray(keys) ? keys : [keys];
              for (var i = 0; i < list.length; i++) patch[list[i]] = undefined;
              target.set(patch, function () { resolve(); });
              return;
            }
            var settled = false;
            var done = function () { if (!settled) { settled = true; resolve(); } };
            var fail = function (err) { if (!settled) { settled = true; reject(err); } };
            var ret = target.remove(keys, function () {
              var err = globalThis.chrome && globalThis.chrome.runtime && globalThis.chrome.runtime.lastError;
              if (err) fail(new Error(err.message || "storage.remove failed"));
              else done();
            });
            if (ret && typeof ret.then === "function") ret.then(done, fail);
          } catch (e) { reject(e); }
        });
      }
    };
  }

  function isRateLimitError(err) {
    if (!err) return false;
    if (err.rateLimited === true) return true;
    if (err.status === 429) return true;
    if (err.code === "rate_limited" || err.code === "challenge") return true;
    if (rateLimitLib && typeof rateLimitLib.isRateLimited === "function") {
      if (rateLimitLib.isRateLimited(err.status || 0, err.body || err.message || "")) return true;
    }
    var msg = typeof err.message === "string" ? err.message : "";
    return /429|rate.?limit|checkpoint|challenge_required|feedback_required|please wait a few minutes/i.test(msg);
  }

  /**
   * Resumable scan runner that paces requests, pauses every N pages, respects src/lib/rate-limit.js
   * cooldown, stops immediately on 429 / checkpoint / feedback_required, and persists snapshots
   * & history (capped at 100 entries) to chrome.storage.local.
   */
  function createScanner(deps) {
    var d = deps || {};
    var storage = createStorageHelper(d.storage);
    var now = typeof d.now === "function" ? d.now : Date.now;
    var random = typeof d.random === "function" ? d.random : Math.random;
    var running = false;
    var cancelled = false;
    var cancelSleep = null;

    function interruptibleSleep(ms) {
      if (typeof d.sleep === "function") return d.sleep(ms);
      if (!(ms > 0)) return Promise.resolve();
      return new Promise(function (resolve) {
        var timer = setTimeout(function () {
          cancelSleep = null;
          resolve();
        }, ms);
        if (timer && typeof timer.unref === "function") timer.unref();
        cancelSleep = function () {
          clearTimeout(timer);
          cancelSleep = null;
          resolve();
        };
      });
    }
    var api = d.api || (globalThis.IY && globalThis.IY.api) || apiLib;
    var cooldown = d.cooldown || (rateLimitLib && typeof rateLimitLib.createCooldown === "function"
      ? rateLimitLib.createCooldown(storage, {
          key: (rateLimitLib && rateLimitLib.STORAGE_KEY) || "iy.rateLimitedUntil",
          baseMs: Number.isSafeInteger(d.cooldownBaseMs) ? d.cooldownBaseMs : BLOCKED_COOLDOWN_MS,
          now: now,
          random: random
        })
      : null);

    var fetchPageFn = typeof d.fetchPage === "function"
      ? d.fetchPage
      : function (uid, kind, cursor, opts) {
          return getFriendshipPage(uid, kind, cursor, Object.assign({ api: api }, opts));
        };

    var delayBaseMs = Number.isFinite(d.pageDelayMs) && d.pageDelayMs >= 0 ? d.pageDelayMs : DEFAULT_PAGE_DELAY_MS;
    var pauseBaseMs = Number.isFinite(d.longPauseMs) && d.longPauseMs >= 0 ? d.longPauseMs : DEFAULT_LONG_PAUSE_MS;
    var pagesBeforePause = Number.isInteger(d.pagesBeforePause) && d.pagesBeforePause > 0
      ? d.pagesBeforePause
      : PAGES_BEFORE_LONG_PAUSE;
    var pageSafetyLimit = Number.isInteger(d.pageSafetyLimit) && d.pageSafetyLimit > 0
      ? d.pageSafetyLimit
      : PAGE_SAFETY_LIMIT;

    async function checkCooldown() {
      if (d.api && typeof d.api.cooldownLeft === "function") {
        var apiLeft = await d.api.cooldownLeft();
        if (apiLeft > 0) return apiLeft;
      }
      if (cooldown && typeof cooldown.remainingMs === "function") {
        var cdLeft = await cooldown.remainingMs();
        if (cdLeft > 0) return cdLeft;
      }
      return 0;
    }

    async function triggerCooldown() {
      var until = 0;
      if (cooldown && typeof cooldown.extend === "function") {
        until = await cooldown.extend(0);
      }
      if (d.api && typeof d.api.startCooldown === "function") {
        try {
          var apiUntil = await d.api.startCooldown(0);
          if (apiUntil > until) until = apiUntil;
        } catch (_) {}
      }
      return until;
    }

    async function loadAccountData(uid) {
      var keys = [storageKey(uid), baseKey(uid), historyKey(uid), seenKey(uid), keepKey(uid), keepMetaKey(uid)];
      var stored = await storage.get(keys);
      return {
        data: normalizeProgress(stored[storageKey(uid)]),
        base: stored[baseKey(uid)],
        history: Array.isArray(stored[historyKey(uid)]) ? stored[historyKey(uid)].slice(0, HISTORY_LIMIT) : [],
        seenAt: Number.isFinite(stored[seenKey(uid)]) ? stored[seenKey(uid)] : undefined,
        keep: Array.isArray(stored[keepKey(uid)]) ? stored[keepKey(uid)].map(String) : [],
        keepMeta: stored[keepMetaKey(uid)] && typeof stored[keepMetaKey(uid)] === "object" ? stored[keepMetaKey(uid)] : {}
      };
    }

    async function scan(uid, hooks) {
      var h = hooks || {};
      var cleanUid = String(uid || (typeof d.myUserId === "function" ? d.myUserId() : (headersLib && typeof headersLib.myUserId === "function" ? headersLib.myUserId() : "")) || "").trim();
      if (!cleanUid) {
        return { status: "error", code: "not_logged_in", error: "Not logged in to Instagram." };
      }
      if (running) {
        return { status: "already_running" };
      }

      var blockedMs = await checkCooldown();
      if (blockedMs > 0) {
        return { status: "rate_limited", code: "rate_limited", remainingMs: blockedMs };
      }

      running = true;
      cancelled = false;

      var state = await loadAccountData(cleanUid);
      var data = state.data;
      var base = state.base;
      var history = state.history;

      if (isComplete(data)) {
        base = snapshot(data.updatedAt || now(), data.followers, data.following);
        await storage.set({ [baseKey(cleanUid)]: base });
        data = emptyProgress();
      }

      var sinceLongPause = 0;

      try {
        for (var kIdx = 0; kIdx < ORDER.length; kIdx++) {
          var kind = ORDER[kIdx];
          var seen = new Set(data[kind].map(function (u) { return String(u.pk); }));

          while (!data.done[kind]) {
            if (cancelled) {
              return { status: "paused", data: data, history: history };
            }

            var cdBeforePage = await checkCooldown();
            if (cdBeforePage > 0) {
              return { status: "rate_limited", code: "rate_limited", remainingMs: cdBeforePage, data: data, history: history };
            }

            var page;
            try {
              page = await fetchPageFn(cleanUid, kind, data.next[kind], { ownRetry: false });
            } catch (err) {
              if (isRateLimitError(err)) {
                await triggerCooldown();
                var rem = await checkCooldown();
                if (typeof h.onRateLimit === "function") h.onRateLimit(err, rem, data);
                return {
                  status: "rate_limited",
                  code: err && err.code === "challenge" ? "challenge" : "rate_limited",
                  remainingMs: rem || BLOCKED_COOLDOWN_MS,
                  error: err && err.message ? err.message : "Rate limited",
                  data: data,
                  history: history
                };
              }
              throw err;
            }

            if (!page || cancelled) {
              return { status: "paused", data: data, history: history };
            }

            var pageUsers = Array.isArray(page.users) ? page.users : [];
            for (var i = 0; i < pageUsers.length; i++) {
              var u = normalizeFriendUser(pageUsers[i]);
              if (!u || seen.has(String(u.pk))) continue;
              seen.add(String(u.pk));
              data[kind].push(u);
            }

            data.next[kind] = page.next;
            data.done[kind] = !page.next;
            data.pages[kind] = (data.pages[kind] || 0) + 1;
            data.updatedAt = now();

            await storage.set({ [storageKey(cleanUid)]: data });
            if (typeof h.onPage === "function") {
              h.onPage({ kind: kind, count: data[kind].length, pages: data.pages[kind], done: data.done[kind], data: data });
            }

            if (data.done[kind]) break;

            if (data.pages[kind] >= pageSafetyLimit) {
              return {
                status: "error",
                code: "safety_limit",
                error: "Safety limit reached (" + (pageSafetyLimit * PAGE_SIZE) + " accounts).",
                data: data,
                history: history
              };
            }

            var waitMs = pageDelayMs(delayBaseMs, random);
            if (typeof h.onWait === "function") h.onWait({ type: "page", ms: waitMs, kind: kind, count: data[kind].length });
            if (waitMs > 0) await interruptibleSleep(waitMs);
            if (cancelled) return { status: "paused", data: data, history: history };

            sinceLongPause++;
            if (sinceLongPause >= pagesBeforePause) {
              sinceLongPause = 0;
              var pauseMs = longPauseMs(pauseBaseMs, random);
              if (typeof h.onWait === "function") h.onWait({ type: "pause", ms: pauseMs, kind: kind, count: data[kind].length });
              if (pauseMs > 0) await interruptibleSleep(pauseMs);
              if (cancelled) return { status: "paused", data: data, history: history };
            }
          }
        }

        if (isComplete(data)) {
          var entry = diffScans(base, snapshot(data.updatedAt || now(), data.followers, data.following));
          history = addEntry(history, entry, HISTORY_LIMIT);
          await storage.set({ [historyKey(cleanUid)]: history });
          await storage.remove(baseKey(cleanUid));
          if (typeof h.onComplete === "function") h.onComplete({ data: data, history: history, entry: entry });
          return { status: "completed", data: data, history: history, entry: entry };
        }

        return { status: "paused", data: data, history: history };
      } catch (err) {
        return {
          status: "error",
          code: (err && err.code) || "scan_error",
          error: (err && err.message) || String(err),
          data: data,
          history: history
        };
      } finally {
        running = false;
      }
    }

    function cancel() {
      cancelled = true;
      if (typeof cancelSleep === "function") cancelSleep();
    }

    return {
      scan: scan,
      cancel: cancel,
      loadAccountData: loadAccountData,
      checkCooldown: checkCooldown,
      isRunning: function () { return running; }
    };
  }

  // Attach getFriendshipPage to IY.api when present so other modules can call IY.api.getFriendshipPage.
  if (globalThis.IY && globalThis.IY.api && typeof globalThis.IY.api.getFriendshipPage !== "function") {
    globalThis.IY.api.getFriendshipPage = getFriendshipPage;
  }

  // Register feature with IY.core.feature (default OFF).
  if (globalThis.IY && globalThis.IY.core && typeof globalThis.IY.core.feature === "function") {
    globalThis.IY.core.feature("unfollowersHistory", {
      keys: ["ui"],
      enabled: function (settings) {
        return Boolean(settings && settings.ui && settings.ui.unfollowers === true);
      },
      start: function () {},
      stop: function () {}
    });
  }

  var exported = {
    PAGE_SIZE: PAGE_SIZE,
    PAGE_SAFETY_LIMIT: PAGE_SAFETY_LIMIT,
    PAGES_BEFORE_LONG_PAUSE: PAGES_BEFORE_LONG_PAUSE,
    DEFAULT_PAGE_DELAY_MS: DEFAULT_PAGE_DELAY_MS,
    DEFAULT_LONG_PAUSE_MS: DEFAULT_LONG_PAUSE_MS,
    MAX_RETRIES: MAX_RETRIES,
    RATE_LIMIT_RETRY_S: RATE_LIMIT_RETRY_S,
    NETWORK_RETRY_S: NETWORK_RETRY_S,
    BLOCKED_COOLDOWN_MS: BLOCKED_COOLDOWN_MS,
    HISTORY_LIMIT: HISTORY_LIMIT,
    ORDER: ORDER,
    CHANGE_LABELS: CHANGE_LABELS,
    CHANGE_LABELS_TR: CHANGE_LABELS_TR,
    CHANGE_FILE_NAMES: CHANGE_FILE_NAMES,
    CHANGE_KINDS: CHANGE_KINDS,
    storageKey: storageKey,
    baseKey: baseKey,
    historyKey: historyKey,
    seenKey: seenKey,
    keepKey: keepKey,
    keepMetaKey: keepMetaKey,
    pageDelayMs: pageDelayMs,
    longPauseMs: longPauseMs,
    retryWaitS: retryWaitS,
    normalizeFriendUser: normalizeFriendUser,
    mini: mini,
    snapshot: snapshot,
    userIndex: userIndex,
    missingFrom: missingFrom,
    diffScans: diffScans,
    hasChanges: hasChanges,
    addEntry: addEntry,
    isUnseen: isUnseen,
    newFollowersText: newFollowersText,
    unfollowedYouText: unfollowedYouText,
    csvCell: csvCell,
    writeCsv: writeCsv,
    usersCsv: usersCsv,
    csv: usersCsv,
    historyCsv: historyCsv,
    emptyProgress: emptyProgress,
    normalizeProgress: normalizeProgress,
    isComplete: isComplete,
    computeSets: computeSets,
    getFriendshipPage: getFriendshipPage,
    isRateLimitError: isRateLimitError,
    createStorageHelper: createStorageHelper,
    createScanner: createScanner
  };

  globalThis.IY = Object.assign(globalThis.IY || {}, { unfollowersHistory: exported });
  if (isNode) module.exports = exported;
})();
