// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
// Pure extraction of story mentions (including hidden stickers), hashtags, locations,
// link stickers, music, and shared posts, plus cached fetching through IY.api.
(function () {
  "use strict";

  const isNode = typeof module !== "undefined" && module.exports;
  const mediaLib = isNode ? require("../../lib/media.js") : (globalThis.IY || {});
  const resolveLib = isNode ? require("./resolve.js") : ((globalThis.IY && globalThis.IY.resolve) || {});

  const REEL_CACHE_MAX = 50;
  const REEL_TTL_MS = 2 * 60 * 1000;
  const REST_FAIL_TTL_MS = 60 * 1000;
  const USERNAME_RE = /^[A-Za-z0-9_](?:[A-Za-z0-9_.]{0,28}[A-Za-z0-9_])?$/;
  const SHORTCODE_RE = /^[A-Za-z0-9_-]{4,64}$/;
  const DIGITS_RE = /^\d{1,30}$/;

  function emptyExtras() {
    return {
      mentions: [],
      hashtags: [],
      locations: [],
      links: [],
      music: [],
      sharedPosts: []
    };
  }

  function finiteNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  /**
   * Hidden sticker check (geometry is normalised to 0..1 of the story frame).
   * Hidden = explicitly flagged hidden, too small to notice, or placed outside the frame.
   */
  function isHiddenSticker(sticker) {
    if (!sticker || typeof sticker !== "object") return false;
    if (sticker.is_hidden === true || sticker.is_hidden === 1 || sticker.is_hidden === "1") return true;
    const x = finiteNumber(sticker.x, 0.5);
    const y = finiteNumber(sticker.y, 0.5);
    const width = finiteNumber(sticker.width, 1);
    const height = finiteNumber(sticker.height, 1);
    if (width <= 0 || height <= 0 || width * height < 0.002) return true;
    return x < -0.02 || x > 1.02 || y < -0.02 || y > 1.02;
  }

  function sanitizeUsername(raw) {
    if (typeof raw !== "string") return "";
    let name = raw.trim();
    if (name.startsWith("@")) name = name.slice(1).trim();
    if (!name || name.includes("..")) return "";
    if (typeof mediaLib.isValidUsername === "function") {
      return mediaLib.isValidUsername(name) ? name : "";
    }
    return USERNAME_RE.test(name) ? name : "";
  }

  function sanitizeShortcode(raw) {
    if (typeof raw !== "string") return "";
    const code = raw.trim();
    return SHORTCODE_RE.test(code) ? code : "";
  }

  function sanitizeLocationId(raw) {
    if (raw === undefined || raw === null) return "";
    const str = String(raw).trim();
    return DIGITS_RE.test(str) ? str : "";
  }

  function sanitizeExternalUrl(raw) {
    if (typeof raw !== "string") return "";
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length > 2048 || /[\x00-\x1f\x7f]/.test(trimmed)) return "";
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
      return parsed.href;
    } catch (_) {
      return "";
    }
  }

  function sanitizePicUrl(raw) {
    if (typeof raw !== "string" || !raw.trim()) return "";
    const trimmed = raw.trim();
    if (typeof mediaLib.isAllowedCdn === "function") {
      return mediaLib.isAllowedCdn(trimmed) ? trimmed : "";
    }
    try {
      const parsed = new URL(trimmed);
      return parsed.protocol === "https:" ? parsed.href : "";
    } catch (_) {
      return "";
    }
  }

  function hasRawStoryFields(obj) {
    if (!obj || typeof obj !== "object") return false;
    return Boolean(
      Array.isArray(obj.reel_mentions) ||
      Array.isArray(obj.story_bloks_stickers) ||
      Array.isArray(obj.story_hashtags) ||
      Array.isArray(obj.story_locations) ||
      Array.isArray(obj.story_link_stickers) ||
      Array.isArray(obj.story_music_stickers) ||
      Array.isArray(obj.story_feed_media) ||
      obj.music_metadata ||
      obj.clips_metadata
    );
  }

  function cloneExistingExtras(ex) {
    const out = emptyExtras();
    if (!ex || typeof ex !== "object") return out;
    if (Array.isArray(ex.mentions)) {
      for (let i = 0; i < ex.mentions.length; i++) {
        const m = ex.mentions[i];
        if (!m || typeof m !== "object") continue;
        const username = sanitizeUsername(m.username);
        if (!username) continue;
        out.mentions.push({
          username,
          fullName: typeof m.fullName === "string" ? m.fullName : "",
          picUrl: sanitizePicUrl(m.picUrl),
          hidden: Boolean(m.hidden)
        });
      }
    }
    if (Array.isArray(ex.hashtags)) {
      const seen = new Set();
      for (let i = 0; i < ex.hashtags.length; i++) {
        if (typeof ex.hashtags[i] !== "string") continue;
        const tag = ex.hashtags[i].trim().replace(/^#+/, "");
        if (!tag) continue;
        const low = tag.toLowerCase();
        if (seen.has(low)) continue;
        seen.add(low);
        out.hashtags.push(tag);
      }
    }
    if (Array.isArray(ex.locations)) {
      for (let i = 0; i < ex.locations.length; i++) {
        const l = ex.locations[i];
        if (!l || typeof l !== "object" || typeof l.name !== "string" || !l.name.trim()) continue;
        out.locations.push({ name: l.name.trim(), id: sanitizeLocationId(l.id) });
      }
    }
    if (Array.isArray(ex.links)) {
      for (let i = 0; i < ex.links.length; i++) {
        const l = ex.links[i];
        if (!l || typeof l !== "object") continue;
        const url = sanitizeExternalUrl(l.url);
        if (!url) continue;
        out.links.push({
          url,
          display: typeof l.display === "string" && l.display.trim() ? l.display.trim() : url,
          title: typeof l.title === "string" ? l.title.trim() : ""
        });
      }
    }
    if (Array.isArray(ex.music)) {
      for (let i = 0; i < ex.music.length; i++) {
        const m = ex.music[i];
        if (!m || typeof m !== "object" || typeof m.title !== "string" || !m.title.trim()) continue;
        out.music.push({
          title: m.title.trim(),
          artist: typeof m.artist === "string" ? m.artist.trim() : ""
        });
      }
    }
    if (Array.isArray(ex.sharedPosts)) {
      for (let i = 0; i < ex.sharedPosts.length; i++) {
        const p = ex.sharedPosts[i];
        if (!p || typeof p !== "object") continue;
        const code = sanitizeShortcode(p.code);
        if (!code) continue;
        out.sharedPosts.push({ code, isReel: Boolean(p.isReel) });
      }
    }
    return out;
  }

  /**
   * Pure extraction of story extras from a raw Instagram story item (Relay or REST)
   * or a ResolvedPost that already carries `.extras`.
   */
  function extractStoryExtras(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyExtras();
    if (raw.extras && typeof raw.extras === "object" && !hasRawStoryFields(raw)) {
      return cloneExistingExtras(raw.extras);
    }

    const mentionsMap = new Map();
    function addMention(user, sticker) {
      if (!user || typeof user !== "object") return;
      const username = sanitizeUsername(user.username);
      if (!username) return;
      const key = username.toLowerCase();
      const hidden = isHiddenSticker(sticker);
      const fullName = typeof user.full_name === "string" ? user.full_name.trim() : "";
      const picUrl = sanitizePicUrl(user.profile_pic_url);
      const prev = mentionsMap.get(key);
      // Visible wins if the same account is mentioned twice; keep richer name/avatar.
      mentionsMap.set(key, {
        username: prev ? prev.username : username,
        fullName: fullName || (prev ? prev.fullName : ""),
        picUrl: picUrl || (prev ? prev.picUrl : ""),
        hidden: prev ? prev.hidden && hidden : hidden
      });
    }

    if (Array.isArray(raw.story_bloks_stickers)) {
      for (let i = 0; i < raw.story_bloks_stickers.length; i++) {
        const s = raw.story_bloks_stickers[i];
        const mention = s && s.bloks_sticker && s.bloks_sticker.sticker_data && s.bloks_sticker.sticker_data.ig_mention;
        if (mention) addMention(mention, s);
      }
    }
    if (Array.isArray(raw.reel_mentions)) {
      for (let i = 0; i < raw.reel_mentions.length; i++) {
        const s = raw.reel_mentions[i];
        if (s && s.user) addMention(s.user, s);
      }
    }

    const hashtags = [];
    const seenTags = new Set();
    if (Array.isArray(raw.story_hashtags)) {
      for (let i = 0; i < raw.story_hashtags.length; i++) {
        const h = raw.story_hashtags[i];
        const rawName = h && h.hashtag && typeof h.hashtag.name === "string" ? h.hashtag.name : "";
        const tag = rawName.trim().replace(/^#+/, "");
        if (!tag) continue;
        const low = tag.toLowerCase();
        if (seenTags.has(low)) continue;
        seenTags.add(low);
        hashtags.push(tag);
      }
    }

    const locations = [];
    const seenLocs = new Set();
    if (Array.isArray(raw.story_locations)) {
      for (let i = 0; i < raw.story_locations.length; i++) {
        const l = raw.story_locations[i];
        const loc = l && l.location;
        const name = loc && typeof loc.name === "string" ? loc.name.trim() : "";
        if (!name) continue;
        const id = sanitizeLocationId(loc.pk !== undefined ? loc.pk : (loc.id !== undefined ? loc.id : loc.facebook_places_id));
        const key = id || name.toLowerCase();
        if (seenLocs.has(key)) continue;
        seenLocs.add(key);
        locations.push({ name, id });
      }
    }

    const links = [];
    const seenLinks = new Set();
    if (Array.isArray(raw.story_link_stickers)) {
      for (let i = 0; i < raw.story_link_stickers.length; i++) {
        const l = raw.story_link_stickers[i];
        const sl = l && l.story_link;
        if (!sl || typeof sl !== "object") continue;
        const url = sanitizeExternalUrl(sl.url);
        if (!url || seenLinks.has(url)) continue;
        seenLinks.add(url);
        const display = typeof sl.display_url === "string" && sl.display_url.trim() ? sl.display_url.trim() : url;
        const title = typeof sl.link_title === "string" ? sl.link_title.trim() : "";
        links.push({ url, display, title });
      }
    }

    const music = [];
    const seenMusic = new Set();
    function addMusicAsset(asset) {
      if (!asset || typeof asset !== "object") return;
      const title = typeof asset.title === "string" ? asset.title.trim() : "";
      if (!title) return;
      const artist = typeof asset.display_artist === "string" ? asset.display_artist.trim() : "";
      const key = title.toLowerCase() + "\0" + artist.toLowerCase();
      if (seenMusic.has(key)) return;
      seenMusic.add(key);
      music.push({ title, artist });
    }
    if (Array.isArray(raw.story_music_stickers)) {
      for (let i = 0; i < raw.story_music_stickers.length; i++) {
        const m = raw.story_music_stickers[i];
        if (m && m.music_asset_info) addMusicAsset(m.music_asset_info);
      }
    }
    if (raw.music_metadata && raw.music_metadata.music_info && raw.music_metadata.music_info.music_asset_info) {
      addMusicAsset(raw.music_metadata.music_info.music_asset_info);
    }
    if (raw.clips_metadata && raw.clips_metadata.music_info && raw.clips_metadata.music_info.music_asset_info) {
      addMusicAsset(raw.clips_metadata.music_info.music_asset_info);
    }

    const sharedPosts = [];
    const seenPosts = new Set();
    if (Array.isArray(raw.story_feed_media)) {
      for (let i = 0; i < raw.story_feed_media.length; i++) {
        const f = raw.story_feed_media[i];
        if (!f || typeof f !== "object") continue;
        const code = sanitizeShortcode(f.media_code);
        if (!code || seenPosts.has(code)) continue;
        seenPosts.add(code);
        sharedPosts.push({ code, isReel: f.product_type === "clips" });
      }
    }

    return {
      mentions: Array.from(mentionsMap.values()),
      hashtags,
      locations,
      links,
      music,
      sharedPosts
    };
  }

  function extrasCount(extras) {
    if (!extras || typeof extras !== "object") return 0;
    return (
      (Array.isArray(extras.mentions) ? extras.mentions.length : 0) +
      (Array.isArray(extras.hashtags) ? extras.hashtags.length : 0) +
      (Array.isArray(extras.locations) ? extras.locations.length : 0) +
      (Array.isArray(extras.links) ? extras.links.length : 0) +
      (Array.isArray(extras.music) ? extras.music.length : 0) +
      (Array.isArray(extras.sharedPosts) ? extras.sharedPosts.length : 0)
    );
  }

  function hasExtras(extras) {
    return extrasCount(extras) > 0;
  }

  function hiddenMentionsCount(extras) {
    if (!extras || !Array.isArray(extras.mentions)) return 0;
    let count = 0;
    for (let i = 0; i < extras.mentions.length; i++) {
      if (extras.mentions[i] && extras.mentions[i].hidden) count++;
    }
    return count;
  }

  function cdnKeyOf(url) {
    if (typeof resolveLib.cdnFileKey === "function") return resolveLib.cdnFileKey(url);
    if (typeof url !== "string" || !url) return "";
    if (/^(?:blob|data|javascript):/i.test(url.trim())) return "";
    try {
      const segs = new URL(url, "https://www.instagram.com/").pathname.split("/").filter(Boolean);
      const last = segs.length ? segs[segs.length - 1] : "";
      return last.replace(/\.[a-z0-9]+$/i, "");
    } catch (_) {
      return "";
    }
  }

  function extractItemCdnKeys(raw) {
    const keys = [];
    const seen = new Set();
    function add(url) {
      const k = cdnKeyOf(url);
      if (k && !seen.has(k)) {
        seen.add(k);
        keys.push(k);
      }
    }
    if (!raw || typeof raw !== "object") return keys;
    const imgs = raw.image_versions2 && raw.image_versions2.candidates;
    if (Array.isArray(imgs)) {
      for (let i = 0; i < imgs.length; i++) if (imgs[i]) add(imgs[i].url);
    }
    if (Array.isArray(raw.video_versions)) {
      for (let i = 0; i < raw.video_versions.length; i++) if (raw.video_versions[i]) add(raw.video_versions[i].url);
    }
    if (typeof raw.display_url === "string") add(raw.display_url);
    if (typeof raw.video_url === "string") add(raw.video_url);
    return keys;
  }

  function baseId(rawId) {
    if (rawId === undefined || rawId === null) return "";
    return String(rawId).split("_")[0];
  }

  function normalizeReelExtras(reel) {
    if (!reel || typeof reel !== "object" || !Array.isArray(reel.items)) return [];
    const reelOwner = reel.user && typeof reel.user.username === "string" ? reel.user.username : "";
    const out = [];
    for (let i = 0; i < reel.items.length; i++) {
      const raw = reel.items[i];
      if (!raw || typeof raw !== "object") continue;
      const id = baseId(raw.pk !== undefined ? raw.pk : raw.id);
      const username = (raw.user && typeof raw.user.username === "string" && raw.user.username) || reelOwner || "unknown";
      const extras = extractStoryExtras(raw);
      const dur = Number(raw.video_duration !== undefined ? raw.video_duration : raw.duration);
      out.push({
        id,
        shortcode: typeof raw.code === "string" && raw.code ? raw.code : id,
        username,
        extras,
        count: extrasCount(extras),
        cdnKeys: extractItemCdnKeys(raw),
        duration: Number.isFinite(dur) && dur > 0 ? dur : undefined,
        isVideo: raw.media_type === 2 || raw.is_video === true || (Array.isArray(raw.video_versions) && raw.video_versions.length > 0)
      });
    }
    return out;
  }

  function matchStoryExtra(items, target) {
    if (!Array.isArray(items) || !items.length) return null;
    const t = target && typeof target === "object" ? target : {};

    if (t.storyId !== undefined && t.storyId !== null && String(t.storyId).trim()) {
      const wanted = baseId(t.storyId);
      const byId = items.find((it) => it && it.id === wanted);
      if (byId) return byId;
    }

    const el = t.el;
    if (el && typeof el === "object") {
      const src = el.currentSrc || el.src || "";
      const key = cdnKeyOf(src);
      if (key) {
        const bySrc = items.find((it) => it && Array.isArray(it.cdnKeys) && it.cdnKeys.includes(key));
        if (bySrc) return bySrc;
      }
      const posterKey = cdnKeyOf(el.poster || "");
      if (posterKey) {
        const byPoster = items.find((it) => it && Array.isArray(it.cdnKeys) && it.cdnKeys.includes(posterKey));
        if (byPoster) return byPoster;
      }
      const isVideo = typeof el.tagName === "string" && el.tagName.toUpperCase() === "VIDEO";
      if (isVideo) {
        const videos = items.filter((it) => it && it.isVideo);
        if (videos.length === 1) return videos[0];
        const dur = Number(el.duration);
        if (Number.isFinite(dur) && dur > 0) {
          let best = null;
          let bestDiff = 1.5;
          for (let i = 0; i < videos.length; i++) {
            const vDur = videos[i].duration;
            if (!Number.isFinite(vDur) || vDur <= 0) continue;
            const diff = Math.abs(vDur - dur);
            if (diff < bestDiff) {
              bestDiff = diff;
              best = videos[i];
            }
          }
          if (best) return best;
        }
      }
    }

    if (Number.isInteger(t.index) && t.index >= 0 && t.index < items.length) {
      return items[t.index];
    }
    if (items.length === 1) return items[0];
    return null;
  }

  function createCache(maxSize, now) {
    const map = new Map();
    const cap = Number.isInteger(maxSize) && maxSize > 0 ? maxSize : REEL_CACHE_MAX;
    return {
      get(key) {
        const entry = map.get(key);
        if (!entry) return undefined;
        if (entry.expiresAt !== undefined && now() >= entry.expiresAt) {
          map.delete(key);
          return undefined;
        }
        map.delete(key);
        map.set(key, entry);
        return entry.value;
      },
      set(key, value, expiresAt) {
        if (map.has(key)) map.delete(key);
        while (map.size >= cap) {
          const oldest = map.keys().next().value;
          if (oldest === undefined) break;
          map.delete(oldest);
        }
        map.set(key, { value, expiresAt });
      },
      clear() {
        map.clear();
      },
      get size() {
        return map.size;
      }
    };
  }

  function resolveApi(deps) {
    if (deps && deps.api) return deps.api;
    return (globalThis.IY && globalThis.IY.api) || null;
  }

  function createStoryExtrasFetcher(deps = {}) {
    const now = typeof deps.now === "function" ? deps.now : Date.now;
    const ttlMs = Number.isFinite(deps.ttlMs) && deps.ttlMs > 0 ? deps.ttlMs : REEL_TTL_MS;
    const cache = createCache(deps.maxCacheSize || REEL_CACHE_MAX, now);
    const inflight = new Map();
    const restFailures = new Map();

    // Reads the raw reel from the Relay store through IY.api (no network request).
    async function readRelayReel(reelId) {
      const api = resolveApi(deps);
      if (!api) return null;
      try {
        if (typeof api.getReelRaw === "function") {
          const raw = await api.getReelRaw(reelId);
          const items = raw ? normalizeReelExtras(raw) : [];
          if (items.length) return items;
        }
      } catch (_) {
        /* not loaded in Relay yet */
      }
      return null;
    }

    async function resolveReelId(targetOrId, opts = {}) {
      if (typeof targetOrId === "string" || typeof targetOrId === "number") {
        const raw = String(targetOrId).trim();
        if (!raw) throw new Error("Missing reel identifier");
        if (raw.startsWith("highlight:") || DIGITS_RE.test(raw)) return raw;
        const api = resolveApi(deps);
        if (!api || typeof api.getUserId !== "function") throw new Error("API getUserId unavailable");
        return api.getUserId(raw, { offline: Boolean(opts.offline), signal: opts.signal });
      }
      if (!targetOrId || typeof targetOrId !== "object") {
        throw new Error("Invalid story target");
      }
      if (targetOrId.highlightId) {
        const raw = String(targetOrId.highlightId).trim();
        const digits = raw.startsWith("highlight:") ? raw.slice("highlight:".length) : raw;
        if (!DIGITS_RE.test(digits)) throw new Error("Invalid highlight id");
        return "highlight:" + digits;
      }
      if (typeof targetOrId.reelId === "function") {
        const res = await targetOrId.reelId(Boolean(opts.offline));
        return String(res || "").trim();
      }
      if (typeof targetOrId.reelId === "string" && targetOrId.reelId.trim()) {
        return targetOrId.reelId.trim();
      }
      if (typeof targetOrId.username === "string" && targetOrId.username.trim()) {
        const api = resolveApi(deps);
        if (!api || typeof api.getUserId !== "function") throw new Error("API getUserId unavailable");
        return api.getUserId(targetOrId.username.trim(), { offline: Boolean(opts.offline), signal: opts.signal });
      }
      throw new Error("Missing story reelId or username");
    }

    function getCachedReelExtras(reelId) {
      if (!reelId) return null;
      return cache.get(String(reelId).trim()) || null;
    }

    async function fetchReelExtras(targetOrId, opts = {}) {
      const offline = Boolean(opts && opts.offline);
      const skipCache = Boolean(opts && opts.skipCache);
      let reelId;
      try {
        reelId = await resolveReelId(targetOrId, { offline, signal: opts && opts.signal });
      } catch (err) {
        if (offline) return null;
        throw err;
      }
      if (!reelId) {
        if (offline) return null;
        throw new Error("Empty reel id");
      }

      if (!skipCache) {
        const hit = cache.get(reelId);
        if (hit) return hit;
      }

      // Zero-network source first: Instagram's own Relay store already holds the reel the
      // story viewer loaded (PolarisStoriesV3ReelPageGalleryQuery), sticker fields included.
      const fromStore = await readRelayReel(reelId);
      if (fromStore) {
        cache.set(reelId, fromStore, now() + ttlMs);
        return fromStore;
      }
      if (offline) return null;

      const existing = inflight.get(reelId);
      if (existing) return existing;

      // REST is the last resort: live it answers 500 for reels_media, so a failure is
      // remembered for a short time instead of re-sent on every open. A rate-limit cooldown inside
      // igGet still applies on top of this.
      const failed = restFailures.get(reelId);
      if (failed) {
        if (now() < failed.until) throw failed.err;
        restFailures.delete(reelId);
      }

      const api = resolveApi(deps);
      if (!api || typeof api.igGet !== "function") {
        throw new Error("IY.api.igGet is unavailable");
      }

      const promise = (async () => {
        let data;
        try {
          data = await api.igGet(`/api/v1/feed/reels_media/?reel_ids=${encodeURIComponent(reelId)}`, {
            signal: opts && opts.signal
          });
        } catch (err) {
          if (!(opts && opts.signal && opts.signal.aborted)) {
            restFailures.set(reelId, { err, until: now() + REST_FAIL_TTL_MS });
            if (restFailures.size > REEL_CACHE_MAX) restFailures.delete(restFailures.keys().next().value);
          }
          throw err;
        }
        const reel =
          (data && data.reels && data.reels[reelId]) ||
          (data && Array.isArray(data.reels_media) && data.reels_media.find((r) => r && String(r.id) === reelId)) ||
          (data && Array.isArray(data.reels_media) && data.reels_media[0]);
        const items = normalizeReelExtras(reel);
        cache.set(reelId, items, now() + ttlMs);
        return items;
      })();

      inflight.set(reelId, promise);
      promise.then(() => inflight.delete(reelId), () => inflight.delete(reelId));
      return promise;
    }

    async function fetchStoryExtras(target, opts = {}) {
      const t = target && typeof target === "object" ? target : {};
      if (t.raw && typeof t.raw === "object") {
        const extras = extractStoryExtras(t.raw);
        const id = baseId(t.raw.pk !== undefined ? t.raw.pk : t.raw.id);
        const username = (t.raw.user && t.raw.user.username) || t.username || "unknown";
        return { id, shortcode: t.raw.code || id, username, extras, count: extrasCount(extras), fromCache: true };
      }
      if (t.post && typeof t.post === "object" && t.post.extras) {
        const extras = extractStoryExtras(t.post);
        const needsAvatars = Boolean(opts && opts.requireAvatars) && extras.mentions.some((m) => !m.picUrl);
        if (!needsAvatars || (opts && opts.offline)) {
          return {
            id: baseId(t.post.id),
            shortcode: t.post.shortcode || baseId(t.post.id),
            username: t.post.username || t.username || "unknown",
            extras,
            count: extrasCount(extras),
            fromCache: true
          };
        }
      }

      const items = await fetchReelExtras(t, opts);
      if (!items || !items.length) return null;
      const matched = matchStoryExtra(items, t);
      if (!matched) return null;
      return {
        id: matched.id,
        shortcode: matched.shortcode,
        username: matched.username || t.username || "unknown",
        extras: matched.extras,
        count: matched.count,
        fromCache: Boolean(opts && opts.offline)
      };
    }

    function clearCache() {
      cache.clear();
      inflight.clear();
      restFailures.clear();
    }

    return {
      fetchReelExtras,
      fetchStoryExtras,
      getCachedReelExtras,
      clearCache
    };
  }

  const defaultFetcher = createStoryExtrasFetcher();

  const api = Object.assign({
    emptyExtras,
    isHiddenSticker,
    sanitizeUsername,
    sanitizeShortcode,
    sanitizeLocationId,
    sanitizeExternalUrl,
    sanitizePicUrl,
    extractStoryExtras,
    extrasCount,
    hasExtras,
    hiddenMentionsCount,
    extractItemCdnKeys,
    normalizeReelExtras,
    matchStoryExtra,
    createStoryExtrasFetcher
  }, defaultFetcher);

  globalThis.IY = Object.assign(globalThis.IY || {}, { storyExtras: api });
  if (isNode) module.exports = api;
})();
