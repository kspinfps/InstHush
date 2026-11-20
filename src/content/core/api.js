// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
// Instagram media, story, highlight, and user lookup engine:
// Relay-store-first via src/page/relay.js, REST/GraphQL fallback,
// shared 30-minute rate-limit cooldown via src/lib/rate-limit.js, and bounded LRU caches.
(function () {
  "use strict";

  const isNode = typeof module !== "undefined" && module.exports;
  const shortcodeLib = isNode ? require("../../lib/shortcode.js") : (globalThis.IY || {});
  const rateLimitLib = isNode ? require("../../lib/rate-limit.js") : (globalThis.IY && globalThis.IY.rateLimit) || {};
  const mediaLib = isNode ? require("../../lib/media.js") : (globalThis.IY || {});
  const headersLib = isNode ? require("./headers.js") : (globalThis.IY && globalThis.IY.headers) || {};
  const resolveLib = isNode ? require("./resolve.js") : (globalThis.IY && globalThis.IY.resolve) || {};

  const DEFAULT_CACHE_SIZE = 200;
  const LINK_MARGIN_MS = 10 * 60 * 1000;
  const NO_EXPIRY_TTL_MS = 60 * 60 * 1000;
  const REEL_TTL_MS = 2 * 60 * 1000;
  const USER_TTL_MS = 10 * 60 * 1000;
  const COOLDOWN_BASE_MS = 30 * 60 * 1000;
  const RELAY_TIMEOUT_MS = 3000;
  const XSSI_PREFIX = "for (;;);";

  class ApiError extends Error {
    constructor(message, status = 0, options = {}) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.rateLimited = Boolean(options.rateLimited);
      this.code = typeof options.code === "string" ? options.code : "api_error";
      if (Number.isFinite(options.remainingMs) && options.remainingMs > 0) {
        this.remainingMs = options.remainingMs;
      }
    }
  }

  function isChallengeUrl(url) {
    if (typeof url !== "string" || !url) return false;
    try {
      return /^\/(challenge|accounts\/suspended)\//.test(new URL(url, "https://www.instagram.com/").pathname);
    } catch (_) {
      return false;
    }
  }

  function createLruCache(maxSize = DEFAULT_CACHE_SIZE, now = Date.now) {
    const cap = Number.isInteger(maxSize) && maxSize > 0 ? maxSize : DEFAULT_CACHE_SIZE;
    const map = new Map();

    function get(key) {
      const entry = map.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt !== undefined && now() >= entry.expiresAt) {
        map.delete(key);
        return undefined;
      }
      // Refresh recency (LRU -> MRU).
      map.delete(key);
      map.set(key, entry);
      return entry.value;
    }

    function set(key, value, expiresAt) {
      if (map.has(key)) map.delete(key);
      while (map.size >= cap) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        map.delete(oldest);
      }
      map.set(key, { value, expiresAt });
    }

    function has(key) {
      const entry = map.get(key);
      if (!entry) return false;
      if (entry.expiresAt !== undefined && now() >= entry.expiresAt) {
        map.delete(key);
        return false;
      }
      return true;
    }

    return {
      get,
      set,
      has,
      delete: (key) => map.delete(key),
      clear: () => map.clear(),
      get size() { return map.size; },
      get maxSize() { return cap; }
    };
  }

  function createStorageAdapter(area) {
    const target = area || (globalThis.chrome && globalThis.chrome.storage && globalThis.chrome.storage.local);
    if (!target || typeof target.get !== "function" || typeof target.set !== "function") {
      const mem = Object.create(null);
      return {
        async get(key) { return { [key]: mem[key] }; },
        async set(obj) { Object.assign(mem, obj); }
      };
    }
    return {
      get(key) {
        return new Promise((resolve, reject) => {
          try {
            let settled = false;
            const done = (val) => { if (!settled) { settled = true; resolve(val || {}); } };
            const fail = (err) => { if (!settled) { settled = true; reject(err); } };
            const maybePromise = target.get(key, (res) => {
              const err = globalThis.chrome && globalThis.chrome.runtime && globalThis.chrome.runtime.lastError;
              if (err) fail(new Error(err.message || "storage get failed"));
              else done(res);
            });
            if (maybePromise && typeof maybePromise.then === "function") {
              maybePromise.then(done, fail);
            }
          } catch (err) {
            reject(err);
          }
        });
      },
      set(obj) {
        return new Promise((resolve, reject) => {
          try {
            let settled = false;
            const done = () => { if (!settled) { settled = true; resolve(); } };
            const fail = (err) => { if (!settled) { settled = true; reject(err); } };
            const maybePromise = target.set(obj, () => {
              const err = globalThis.chrome && globalThis.chrome.runtime && globalThis.chrome.runtime.lastError;
              if (err) fail(new Error(err.message || "storage set failed"));
              else done();
            });
            if (maybePromise && typeof maybePromise.then === "function") {
              maybePromise.then(done, fail);
            }
          } catch (err) {
            reject(err);
          }
        });
      }
    };
  }

  function createRelayClient(options = {}) {
    const controller = new AbortController();
    const bridge = options.bridge || globalThis.IY;
    async function request(op, args = {}, timeoutMs = options.timeoutMs || RELAY_TIMEOUT_MS) {
      if (!bridge?.requestRelay || controller.signal.aborted) throw new Error("Relay unavailable");
      return bridge.requestRelay(op, args, timeoutMs, controller.signal);
    }
    return {
      request,
      requestSafe(op, args, fallback = null, timeoutMs) {
        return request(op, args, timeoutMs).catch(() => fallback);
      },
      close() { controller.abort(); }
    };
  }

  function hasRawMedia(m) {
    return Boolean(
      m && typeof m === "object" &&
      (m.image_versions2 || m.carousel_media || m.video_versions || m.video_dash_manifest ||
        m.display_url || m.display_resources || m.video_url || m.edge_sidecar_to_children)
    );
  }

  function parseOpts(optsOrOffline, fullArg) {
    if (typeof optsOrOffline === "boolean") {
      return { offline: optsOrOffline, full: Boolean(fullArg) };
    }
    const o = optsOrOffline && typeof optsOrOffline === "object" ? optsOrOffline : {};
    return {
      offline: Boolean(o.offline),
      full: Boolean(o.full !== undefined ? o.full : fullArg),
      signal: o.signal,
      skipCache: Boolean(o.skipCache),
      ownRetry: Boolean(o.ownRetry)
    };
  }

  function createApi(deps = {}) {
    const now = typeof deps.now === "function" ? deps.now : Date.now;
    const random = typeof deps.random === "function" ? deps.random : Math.random;
    const fetchFn = deps.fetch !== undefined ? deps.fetch : globalThis.fetch;
    const baseUrl = typeof deps.baseUrl === "string" ? deps.baseUrl : "";
    const getHeaders = typeof deps.headers === "function"
      ? deps.headers
      : () => (typeof headersLib.buildPageHeaders === "function" ? headersLib.buildPageHeaders() : {});
    const doc = deps.document !== undefined ? deps.document : globalThis.document;
    const maxCacheSize = Number.isInteger(deps.maxCacheSize) && deps.maxCacheSize > 0
      ? deps.maxCacheSize
      : DEFAULT_CACHE_SIZE;

    const storage = deps.storage || createStorageAdapter();
    const cooldown = rateLimitLib.createCooldown(storage, {
      key: rateLimitLib.STORAGE_KEY || "iy.rateLimitedUntil",
      baseMs: Number.isSafeInteger(deps.cooldownBaseMs) ? deps.cooldownBaseMs : COOLDOWN_BASE_MS,
      now,
      random
    });

    let relayClient = null;
    let customRelay = typeof deps.relay === "function" ? deps.relay : null;

    function setRelayTransport(fn) {
      customRelay = typeof fn === "function" ? fn : null;
    }

    async function relayRequest(op, args = {}, timeoutMs = RELAY_TIMEOUT_MS) {
      if (customRelay) return customRelay(op, args, timeoutMs);
      if (!relayClient) relayClient = createRelayClient({ bridge: deps.bridge, timeoutMs });
      return relayClient.request(op, args, timeoutMs);
    }

    async function relaySafe(op, args = {}, fallback = null, timeoutMs = RELAY_TIMEOUT_MS) {
      try {
        const res = await relayRequest(op, args, timeoutMs);
        return res === undefined ? fallback : res;
      } catch (_) {
        return fallback;
      }
    }

    const postCache = createLruCache(maxCacheSize, now);
    const userIdCache = createLruCache(maxCacheSize, now);
    const userCache = createLruCache(maxCacheSize, now);
    const reelCache = createLruCache(Math.min(maxCacheSize, 50), now);

    const inflightPosts = new Map();
    const inflightUserIds = new Map();
    const inflightReels = new Map();

    function computePostExpiry(post) {
      const urls = post && Array.isArray(post.items) ? post.items.map((it) => it.url) : [];
      const at = typeof resolveLib.linksExpireAt === "function" ? resolveLib.linksExpireAt(urls) : undefined;
      return at === undefined ? now() + NO_EXPIRY_TTL_MS : at - LINK_MARGIN_MS;
    }

    function linksFresh(post) {
      const urls = post && Array.isArray(post.items) ? post.items.map((it) => it.url) : [];
      const at = typeof resolveLib.linksExpireAt === "function" ? resolveLib.linksExpireAt(urls) : undefined;
      return at === undefined || at - LINK_MARGIN_MS > now();
    }

    async function cooldownLeft() {
      return cooldown.remainingMs();
    }

    async function startCooldown(attemptOrMs = 0) {
      if (Number.isSafeInteger(attemptOrMs) && attemptOrMs >= 1000) {
        return cooldown.setUntil(now() + attemptOrMs);
      }
      return cooldown.extend(Number.isSafeInteger(attemptOrMs) && attemptOrMs >= 0 ? attemptOrMs : 0);
    }

    async function assertNotCoolingDown() {
      const left = await cooldown.remainingMs();
      if (left > 0) {
        const mins = Math.ceil(left / 60000);
        throw new ApiError(
          `Instagram rate-limited requests recently. Requests are paused for ${mins} more min.`,
          429,
          { rateLimited: true, code: "rate_limited", remainingMs: left }
        );
      }
    }

    async function parseResponse(res, opts = {}) {
      if (res.status === 429) {
        if (!opts.ownRetry) await cooldown.extend(0);
        throw new ApiError("Instagram is rate-limiting requests.", 429, { rateLimited: true, code: "rate_limited" });
      }
      if (res.redirected && isChallengeUrl(res.url)) {
        if (!opts.ownRetry) await cooldown.extend(0);
        throw new ApiError("Instagram requires an account verification check.", res.status || 403, { rateLimited: true, code: "challenge" });
      }
      if (res.status === 401) {
        throw new ApiError("Instagram refused the request. Make sure you are logged in.", 401, { code: "unauthorized" });
      }

      const rawText = await res.text();
      const text = rawText.startsWith(XSSI_PREFIX) ? rawText.slice(XSSI_PREFIX.length) : rawText;

      let json;
      try {
        json = JSON.parse(text);
      } catch (_) {
        if (rateLimitLib.isRateLimited && rateLimitLib.isRateLimited(res.status, text)) {
          if (!opts.ownRetry) await cooldown.extend(0);
          throw new ApiError("Instagram is rate-limiting requests.", res.status || 429, { rateLimited: true, code: "rate_limited" });
        }
        throw new ApiError(
          res.redirected ? "Not logged in to Instagram." : `Unexpected response (${res.status})`,
          res.status,
          { code: res.redirected ? "unauthorized" : "invalid_response" }
        );
      }

      const limited = Boolean(
        (json && json.spam === true) ||
        (rateLimitLib.isRateLimited && rateLimitLib.isRateLimited(res.status, json))
      );
      if (limited) {
        if (!opts.ownRetry) await cooldown.extend(0);
        const msg = (json && typeof json.message === "string" && json.message) || "Instagram rate-limited the request.";
        throw new ApiError(`Instagram blocked the request: ${msg}`, res.status || 429, { rateLimited: true, code: "rate_limited" });
      }

      if (!res.ok || (json && json.status === "fail")) {
        const msg = (json && typeof json.message === "string" && json.message) || `Request failed (${res.status})`;
        throw new ApiError(msg, res.status, { code: res.status === 404 ? "not_found" : "api_error" });
      }

      return json;
    }

    async function igGet(path, opts = {}) {
      if (typeof fetchFn !== "function") throw new ApiError("fetch is unavailable", 0, { code: "network" });
      await assertNotCoolingDown();
      const init = {
        credentials: "include",
        headers: getHeaders()
      };
      if (opts.signal) init.signal = opts.signal;
      const res = await fetchFn(baseUrl + path, init);
      return parseResponse(res, opts);
    }

    async function igGraphql(params, opts = {}) {
      if (typeof fetchFn !== "function") throw new ApiError("fetch is unavailable", 0, { code: "network" });
      await assertNotCoolingDown();
      const variables = typeof params.variables === "string" ? params.variables : JSON.stringify(params.variables || {});
      let res;
      if (params.queryHash) {
        const qs = new URLSearchParams({ query_hash: String(params.queryHash), variables });
        const init = { credentials: "include", headers: getHeaders() };
        if (opts.signal) init.signal = opts.signal;
        res = await fetchFn(baseUrl + "/graphql/query/?" + qs.toString(), init);
      } else {
        const body = new URLSearchParams();
        if (params.docId) body.set("doc_id", String(params.docId));
        body.set("variables", variables);
        if (params.friendlyName) body.set("fb_api_req_friendly_name", String(params.friendlyName));
        if (params.fbDtsg) body.set("fb_dtsg", String(params.fbDtsg));
        if (params.lsd) body.set("lsd", String(params.lsd));
        const hdrs = Object.assign({}, getHeaders(), { "Content-Type": "application/x-www-form-urlencoded" });
        if (params.lsd) hdrs["X-FB-LSD"] = String(params.lsd);
        if (params.friendlyName) hdrs["X-FB-Friendly-Name"] = String(params.friendlyName);
        const init = { method: "POST", credentials: "include", headers: hdrs, body: body.toString() };
        if (opts.signal) init.signal = opts.signal;
        res = await fetchFn(baseUrl + "/api/graphql", init);
      }
      const json = await parseResponse(res, opts);
      if (Array.isArray(json.errors) && json.errors.length && !json.data) {
        const msg = (json.errors[0] && json.errors[0].message) || "GraphQL error";
        throw new ApiError(msg, res.status || 400, { code: "graphql_error" });
      }
      return json;
    }

    function rememberPost(post) {
      const exp = computePostExpiry(post);
      if (post.shortcode) postCache.set("code:" + post.shortcode, post, exp);
      if (post.id) postCache.set("id:" + post.id, post, exp);
    }

    async function tryRelayPostByCode(shortcode) {
      const raw = await relaySafe("getMedia", { code: shortcode }, null);
      if (!hasRawMedia(raw)) return null;
      const post = resolveLib.normalizeMedia(raw, shortcode);
      if (!post.items.length || !linksFresh(post)) return null;
      return post;
    }

    async function tryRelayPostById(id) {
      const raw = await relaySafe("getMediaById", { id }, null);
      if (!hasRawMedia(raw)) return null;
      const post = resolveLib.normalizeMedia(raw);
      if (!post.items.length || !linksFresh(post)) return null;
      return post;
    }

    function dedupe(map, key, load) {
      const existing = map.get(key);
      if (existing) return existing;
      const p = Promise.resolve().then(load);
      map.set(key, p);
      p.then(() => map.delete(key), () => map.delete(key));
      return p;
    }

    async function getPostByShortcode(shortcode, optsOrOffline = {}) {
      if (typeof shortcode !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(shortcode)) {
        throw new ApiError("Invalid shortcode", 400, { code: "invalid_input" });
      }
      const opts = parseOpts(optsOrOffline);
      const cacheKey = "code:" + shortcode;

      if (!opts.skipCache) {
        const hit = postCache.get(cacheKey);
        if (hit && linksFresh(hit)) return hit;
      }

      if (opts.offline) {
        const known = await tryRelayPostByCode(shortcode);
        if (!known) throw new ApiError("Not loaded by Instagram yet", 0, { code: "not_loaded" });
        rememberPost(known);
        return known;
      }

      return dedupe(inflightPosts, cacheKey, async () => {
        const known = await tryRelayPostByCode(shortcode);
        if (known) {
          rememberPost(known);
          return known;
        }

        const pk = shortcodeLib.shortcodeToPk(shortcode);
        let raw = null;
        try {
          const data = await igGet(`/api/v1/media/${encodeURIComponent(pk)}/info/`, opts);
          raw = data && Array.isArray(data.items) ? data.items[0] : null;
        } catch (err) {
          if (err instanceof ApiError && (err.rateLimited || err.status === 401)) throw err;
          if (typeof deps.graphqlFallback === "function") {
            const gql = await deps.graphqlFallback("post", { shortcode, pk }, { igGraphql, signal: opts.signal });
            raw = (gql && (gql.xdt_shortcode_media || gql.shortcode_media || (gql.data && (gql.data.xdt_shortcode_media || gql.data.shortcode_media)))) || gql;
          } else {
            throw err;
          }
        }
        if (!raw) throw new ApiError("Post not found", 404, { code: "not_found" });
        const post = resolveLib.normalizeMedia(raw, shortcode);
        rememberPost(post);
        return post;
      });
    }

    async function getMediaById(mediaId, optsOrOffline = {}) {
      const cleanId = String(mediaId ?? "").split("_")[0];
      if (!/^\d+$/.test(cleanId)) {
        throw new ApiError("Invalid media id", 400, { code: "invalid_input" });
      }
      const opts = parseOpts(optsOrOffline);
      const cacheKey = "id:" + cleanId;

      if (!opts.skipCache) {
        const hit = postCache.get(cacheKey);
        if (hit && linksFresh(hit)) return hit;
      }

      if (opts.offline) {
        const known = await tryRelayPostById(cleanId);
        if (!known) throw new ApiError("Not loaded by Instagram yet", 0, { code: "not_loaded" });
        rememberPost(known);
        return known;
      }

      return dedupe(inflightPosts, cacheKey, async () => {
        const known = await tryRelayPostById(cleanId);
        if (known) {
          rememberPost(known);
          return known;
        }

        const data = await igGet(`/api/v1/media/${encodeURIComponent(cleanId)}/info/`, opts);
        const raw = data && Array.isArray(data.items) ? data.items[0] : null;
        if (!raw) throw new ApiError("Media not found", 404, { code: "not_found" });
        const post = resolveLib.normalizeMedia(raw);
        rememberPost(post);
        return post;
      });
    }

    async function knownUser(username) {
      if (typeof username !== "string" || !username.trim()) return null;
      const user = await relaySafe("getUser", { username: username.trim() }, null);
      if (!user || typeof user !== "object") return null;
      return { ...user, hd: mediaLib.isAllowedCdn(user.hd?.url) ? user.hd : undefined,
        profile_pic_url: mediaLib.isAllowedCdn(user.profile_pic_url) ? user.profile_pic_url : undefined };
    }

    async function getUserId(username, optsOrOffline = {}) {
      if (typeof username !== "string" || !username.trim()) {
        throw new ApiError("Invalid username", 400, { code: "invalid_input" });
      }
      const clean = username.trim();
      const key = clean.toLowerCase();
      const opts = parseOpts(optsOrOffline);

      if (!opts.skipCache) {
        const hit = userIdCache.get(key);
        if (hit) return hit;
      }

      if (opts.offline) {
        const known = await knownUser(clean);
        if (!known || !known.id) throw new ApiError("Not loaded by Instagram yet", 0, { code: "not_loaded" });
        userIdCache.set(key, String(known.id), now() + USER_TTL_MS);
        return String(known.id);
      }

      return dedupe(inflightUserIds, key, async () => {
        const known = await knownUser(clean);
        if (known && known.id) {
          userIdCache.set(key, String(known.id), now() + USER_TTL_MS);
          return String(known.id);
        }

        try {
          const data = await igGet(`/web/search/topsearch/?query=${encodeURIComponent(clean)}`, opts);
          const list = Array.isArray(data && data.users) ? data.users : [];
          const hit = list.find((u) => u && u.user && typeof u.user.username === "string" && u.user.username.toLowerCase() === key);
          if (hit && (hit.user.pk || hit.user.pk_id)) {
            const id = String(hit.user.pk !== undefined ? hit.user.pk : hit.user.pk_id);
            userIdCache.set(key, id, now() + USER_TTL_MS);
            return id;
          }
        } catch (err) {
          if (err instanceof ApiError && (err.rateLimited || err.status === 401)) throw err;
        }

        const profile = await igGet(`/api/v1/users/web_profile_info/?username=${encodeURIComponent(clean)}`, opts);
        const userObj = profile && profile.data && profile.data.user;
        const id = userObj && (userObj.id || userObj.pk);
        if (!id) throw new ApiError("User not found", 404, { code: "not_found" });
        userIdCache.set(key, String(id), now() + USER_TTL_MS);
        return String(id);
      });
    }

    function normalizeUserObject(raw, fallbackUsername, fallbackId) {
      const u = raw && typeof raw === "object" ? raw : {};
      const picked = typeof mediaLib.pickAvatar === "function" ? mediaLib.pickAvatar(u) : null;
      const hd = picked && picked.hd
        ? { url: picked.url, width: picked.width, height: picked.height }
        : (mediaLib.isAllowedCdn(u.hd_profile_pic_url_info?.url)
          ? {
              url: u.hd_profile_pic_url_info.url,
              width: Number(u.hd_profile_pic_url_info.width) || 0,
              height: Number(u.hd_profile_pic_url_info.height) || 0
            }
          : undefined);
      const fsRaw = u.friendship_status;
      const fs = fsRaw && typeof fsRaw === "object" && typeof fsRaw.followed_by === "boolean"
        ? { following: !!fsRaw.following, followed_by: fsRaw.followed_by }
        : (typeof u.follows_viewer === "boolean"
          ? { following: !!u.followed_by_viewer, followed_by: u.follows_viewer }
          : undefined);
      return {
        id: String(u.id || u.pk || fallbackId || ""),
        username: typeof u.username === "string" ? u.username : (fallbackUsername || ""),
        fullName: typeof u.full_name === "string" ? u.full_name : "",
        isPrivate: typeof u.is_private === "boolean" ? u.is_private : undefined,
        mediaCount: Number.isFinite(Number(u.media_count))
          ? Number(u.media_count)
          : (u.edge_owner_to_timeline_media && Number.isFinite(Number(u.edge_owner_to_timeline_media.count))
            ? Number(u.edge_owner_to_timeline_media.count)
            : undefined),
        hd,
        profilePicUrl: (picked && picked.url) || (mediaLib.isAllowedCdn(u.profile_pic_url) ? u.profile_pic_url : undefined),
        fs
      };
    }

    async function getUser(username, optsOrOffline = {}) {
      if (typeof username !== "string" || !username.trim()) {
        throw new ApiError("Invalid username", 400, { code: "invalid_input" });
      }
      const clean = username.trim();
      const key = clean.toLowerCase();
      const opts = parseOpts(optsOrOffline);

      if (!opts.skipCache && !opts.full) {
        const hit = userCache.get(key);
        if (hit) return hit;
      }

      const known = await knownUser(clean);
      if (known && known.id) {
        userIdCache.set(key, String(known.id), now() + USER_TTL_MS);
        const relayUser = {
          id: String(known.id),
          username: known.username || clean,
          fullName: known.full_name || "",
          isPrivate: undefined,
          mediaCount: undefined,
          hd: known.hd && known.hd.url ? known.hd : undefined,
          profilePicUrl: known.profile_pic_url || (known.hd && known.hd.url) || undefined,
          fs: known.fs
        };
        if (opts.offline || (!opts.full && relayUser.hd)) {
          userCache.set(key, relayUser, now() + USER_TTL_MS);
          return relayUser;
        }
      } else if (opts.offline) {
        throw new ApiError("Not loaded by Instagram yet", 0, { code: "not_loaded" });
      }

      const id = (known && known.id) ? String(known.id) : await getUserId(clean, opts);
      await assertNotCoolingDown();

      // Optional Relay GraphQL replay if wired.
      try {
        const gqlUser = await relayRequest("profileInfo", { id }, RELAY_TIMEOUT_MS);
        if (gqlUser && typeof gqlUser === "object") {
          const normalized = normalizeUserObject(gqlUser, clean, id);
          userCache.set(key, normalized, now() + USER_TTL_MS);
          return normalized;
        }
      } catch (err) {
        if (err && err.message === "RATE_LIMITED") {
          await cooldown.extend(0);
          throw new ApiError("Instagram is rate-limiting requests.", 429, { rateLimited: true, code: "rate_limited" });
        }
      }

      const info = await igGet(`/api/v1/users/${encodeURIComponent(id)}/info/`, opts);
      const rawUser = info && info.user;
      if (!rawUser) throw new ApiError("User not found", 404, { code: "not_found" });
      const normalized = normalizeUserObject(rawUser, clean, id);
      userCache.set(key, normalized, now() + USER_TTL_MS);
      return normalized;
    }

    function headerAvatarUrl() {
      if (!doc || typeof doc.querySelector !== "function") return undefined;
      const img = doc.querySelector("main header img, header img");
      const url = img && (img.currentSrc || img.src);
      return mediaLib.isAllowedCdn(url) ? url : undefined;
    }

    async function getHdProfilePic(username, optsOrOffline = {}) {
      const opts = parseOpts(optsOrOffline);
      const known = await knownUser(username);
      if (known && known.hd && known.hd.url) {
        return { url: known.hd.url, width: known.hd.width || 0, height: known.hd.height || 0, userId: String(known.id) };
      }
      if (opts.offline) throw new ApiError("Not loaded by Instagram yet", 0, { code: "not_loaded" });

      const userId = await getUserId(username, opts);
      try {
        const profile = await getUser(username, { ...opts, full: true });
        if (profile.hd && profile.hd.url) {
          return { url: profile.hd.url, width: profile.hd.width || 0, height: profile.hd.height || 0, userId };
        }
      } catch (err) {
        if (err instanceof ApiError && (err.rateLimited || err.status === 401)) throw err;
      }

      const fallback = headerAvatarUrl();
      if (fallback) return { url: fallback, width: 150, height: 150, userId };
      throw new ApiError("Could not load the profile picture", 404, { code: "not_found" });
    }

    async function getFriendship(username, opts = {}) {
      const id = await getUserId(username, opts);
      const r = await igGet(`/api/v1/friendships/show/${encodeURIComponent(id)}/`, opts);
      return { following: !!r.following, followed_by: !!r.followed_by };
    }

    async function getFriendshipDetails(username, opts = {}) {
      const id = await getUserId(username, opts);
      return igGet(`/api/v1/friendships/show/${encodeURIComponent(id)}/`, opts);
    }

    async function fetchReelRest(reelId, opts) {
      const data = await igGet(`/api/v1/feed/reels_media/?reel_ids=${encodeURIComponent(reelId)}`, opts);
      const reel =
        (data && data.reels && data.reels[reelId]) ||
        (data && Array.isArray(data.reels_media) && data.reels_media.find((r) => r && String(r.id) === reelId)) ||
        (data && Array.isArray(data.reels_media) && data.reels_media[0]);
      return resolveLib.normalizeReel(reel);
    }

    async function getReelItems(reelId, optsOrOffline = {}, fullArg = false) {
      const cleanId = String(reelId ?? "").trim();
      if (!cleanId) throw new ApiError("Invalid reel id", 400, { code: "invalid_input" });
      const opts = parseOpts(optsOrOffline, fullArg);

      if (!opts.skipCache) {
        const hit = reelCache.get(cleanId);
        if (hit && (hit.full || !opts.full)) return hit.items;
      }

      if (opts.offline) {
        if (opts.full) throw new ApiError("Not loaded by Instagram yet", 0, { code: "not_loaded" });
        const known = await relaySafe("getReel", { id: cleanId }, null);
        if (!known || !Array.isArray(known.items) || !known.items.length) {
          throw new ApiError("Not loaded by Instagram yet", 0, { code: "not_loaded" });
        }
        const items = resolveLib.normalizeReel(known);
        reelCache.set(cleanId, { items, full: false }, now() + REEL_TTL_MS);
        return items;
      }

      const inflightKey = cleanId + (opts.full ? ":full" : "");
      return dedupe(inflightReels, inflightKey, async () => {
        if (!opts.full) {
          const known = await relaySafe("getReel", { id: cleanId }, null);
          if (known && Array.isArray(known.items) && known.items.length) {
            const items = resolveLib.normalizeReel(known);
            reelCache.set(cleanId, { items, full: false }, now() + REEL_TTL_MS);
            return items;
          }
        }
        const items = await fetchReelRest(cleanId, opts);
        reelCache.set(cleanId, { items, full: Boolean(opts.full) }, now() + REEL_TTL_MS);
        return items;
      });
    }

    // Raw reel straight from Instagram's own Relay store (zero network). Unlike
    // getReelItems it keeps the sticker fields (mentions, hashtags, links, music), which
    // normalizeReel drops. Instagram's story viewer already loaded this through its own
    // GraphQL gallery query, so this works even when the REST reels_media endpoint is
    // refused. Returns null when the store does not hold the reel.
    async function getReelRaw(reelId) {
      const cleanId = String(reelId ?? "").trim();
      if (!cleanId) return null;
      const known = await relaySafe("getReel", { id: cleanId }, null);
      if (!known || !Array.isArray(known.items) || !known.items.length) return null;
      return known;
    }

    async function getStoryItems(userIdOrUsername, optsOrOffline = {}) {
      const raw = String(userIdOrUsername ?? "").trim();
      if (!raw) throw new ApiError("Invalid story target", 400, { code: "invalid_input" });
      const reelId = /^\d+$/.test(raw) ? raw : await getUserId(raw, optsOrOffline);
      return getReelItems(reelId, optsOrOffline);
    }

    async function getHighlightItems(highlightId, optsOrOffline = {}) {
      const raw = String(highlightId ?? "").trim();
      const digits = raw.startsWith("highlight:") ? raw.slice("highlight:".length) : raw;
      if (!/^\d+$/.test(digits)) {
        throw new ApiError("Invalid highlight id", 400, { code: "invalid_input" });
      }
      return getReelItems("highlight:" + digits, optsOrOffline);
    }

    function clearCache() {
      postCache.clear();
      userIdCache.clear();
      userCache.clear();
      reelCache.clear();
    }

    function cacheStats() {
      return {
        posts: postCache.size,
        userIds: userIdCache.size,
        users: userCache.size,
        reels: reelCache.size,
        maxSize: maxCacheSize
      };
    }

    function destroy() {
      if (relayClient) {
        relayClient.close();
        relayClient = null;
      }
      clearCache();
    }

    return {
      ApiError,
      igGet,
      igGraphql,
      cooldownLeft,
      startCooldown,
      setRelayTransport,
      getPostByShortcode,
      getMediaById,
      getReelItems,
      getReelRaw,
      getStoryItems,
      getHighlightItems,
      knownUser,
      getUserId,
      getUser,
      getHdProfilePic,
      getFriendship,
      getFriendshipDetails,
      clearCache,
      cacheStats,
      destroy
    };
  }

  const defaultApi = createApi();
  const exported = Object.assign({
    ApiError,
    isChallengeUrl,
    createLruCache,
    createStorageAdapter,
    createRelayClient,
    createApi
  }, defaultApi);

  globalThis.IY = Object.assign(globalThis.IY || {}, { api: exported });
  if (isNode) module.exports = exported;
})();
