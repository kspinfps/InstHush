// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
// MAIN-world Relay store reader for zero-network Instagram media/story/user lookups.
// Communicates with ISOLATED content scripts exclusively over a private MessageChannel.
(function () {
  "use strict";

  const uncurry = Function.prototype.bind.bind(Function.prototype.call);
  const objectKeys = Object.keys;
  const objectEntries = Object.entries;
  const hasOwn = Object.hasOwn;
  const isArray = Array.isArray;
  const SetCtor = Set;
  const dateNow = Date.now;
  const str = String;
  const strLower = uncurry(String.prototype.toLowerCase);
  const regexExec = uncurry(RegExp.prototype.exec);
  const strSlice = uncurry(String.prototype.slice);
  const strStartsWith = uncurry(String.prototype.startsWith);

  const create = Object.create;

  const MAX_DEPTH = 6;
  const STICKER_DEPTH = 6;
  const MAX_TRIES = 20;
  const RELAY_RETRY_MS = 1000;

  const MEDIA_FIELDS = [
    "pk",
    "id",
    "code",
    "media_type",
    "taken_at",
    "video_duration",
    "video_dash_manifest",
    "has_audio",
    "product_type",
    "original_width",
    "original_height",
    "image_versions2",
    "video_versions"
  ];

  const STORY_FIELDS = [
    "reel_mentions",
    "story_bloks_stickers",
    "story_feed_media",
    "story_hashtags",
    "story_link_stickers",
    "story_locations",
    "story_music_stickers",
    "music_metadata"
  ];

  function fieldName(key) {
    const suffix = regexExec(/[({]/, key);
    return suffix ? strSlice(key, 0, suffix.index) : key;
  }

  function denormalize(src, value, depth = MAX_DEPTH, path = new SetCtor()) {
    // Strip functions so results always survive structured cloning over MessagePort.
    if (typeof value === "function") return undefined;
    if (value == null || typeof value !== "object") return value;
    if (isArray(value)) {
      const arr = new Array(value.length);
      for (let i = 0; i < value.length; i++) arr[i] = denormalize(src, value[i], depth, path);
      return arr;
    }

    const link = (id) => {
      if (typeof id !== "string" || depth <= 0 || path.has(id)) return null;
      const rec = src.get(id);
      if (!rec) return null;
      path.add(id);
      const out = denormalize(src, rec, depth - 1, path);
      path.delete(id);
      return out;
    };

    if (hasOwn(value, "__ref")) return link(value.__ref);
    if (isArray(value.__refs)) {
      const list = new Array(value.__refs.length);
      for (let i = 0; i < value.__refs.length; i++) list[i] = link(value.__refs[i]);
      return list;
    }

    const self = typeof value.__id === "string" && !path.has(value.__id) ? value.__id : undefined;
    if (self) path.add(self);

    const out = create(null);
    const entries = objectEntries(value);
    for (let i = 0; i < entries.length; i++) {
      const k = entries[i][0];
      const v = entries[i][1];
      if (k === "__id" || k === "__typename") continue;
      const name = fieldName(k);
      if (name === "__proto__" || name === "constructor" || name === "prototype") continue;
      if (name !== k && hasOwn(value, name)) continue;
      const d = denormalize(src, v, depth, path);
      if (d !== undefined) out[name] = d;
    }
    if (self) path.delete(self);
    return out;
  }

  function field(rec, name) {
    if (hasOwn(rec, name)) return rec[name];
    const keys = objectKeys(rec);
    for (let i = 0; i < keys.length; i++) {
      if (fieldName(keys[i]) === name) return rec[keys[i]];
    }
    return undefined;
  }

  function linked(src, value) {
    if (!value || typeof value !== "object") return [];
    const out = [];
    if (isArray(value.__refs)) {
      for (let i = 0; i < value.__refs.length; i++) {
        const id = value.__refs[i];
        if (typeof id === "string") {
          const rec = src.get(id);
          if (rec) out.push(rec);
        }
      }
      return out;
    }
    if (typeof value.__ref === "string") {
      const rec = src.get(value.__ref);
      if (rec) out.push(rec);
    }
    return out;
  }

  function resolveOne(src, value) {
    if (!value || typeof value !== "object") return null;
    if (typeof value.__ref === "string") return src.get(value.__ref) || null;
    return value;
  }

  function pickAudioMetadata(src, rec) {
    const out = {};
    const clips = resolveOne(src, field(rec, "clips_metadata"));
    if (clips) {
      const picked = {};
      const musicInfo = resolveOne(src, field(clips, "music_info"));
      const asset = musicInfo && resolveOne(src, field(musicInfo, "music_asset_info"));
      if (asset && typeof asset.progressive_download_url === "string") {
        picked.music_info = {
          music_asset_info: {
            progressive_download_url: asset.progressive_download_url,
            title: typeof asset.title === "string" ? asset.title : undefined,
            display_artist: typeof asset.display_artist === "string" ? asset.display_artist : undefined
          }
        };
      }
      const orig = resolveOne(src, field(clips, "original_sound_info"));
      if (orig && typeof orig.progressive_download_url === "string") {
        picked.original_sound_info = {
          progressive_download_url: orig.progressive_download_url,
          original_audio_title: typeof orig.original_audio_title === "string" ? orig.original_audio_title : undefined
        };
      }
      if (picked.music_info || picked.original_sound_info) out.clips_metadata = picked;
    }

    const musicMeta = resolveOne(src, field(rec, "music_metadata"));
    if (musicMeta) {
      const picked = {};
      const musicInfo = resolveOne(src, field(musicMeta, "music_info"));
      const asset = musicInfo && resolveOne(src, field(musicInfo, "music_asset_info"));
      if (asset && typeof asset.progressive_download_url === "string") {
        picked.music_info = {
          music_asset_info: {
            progressive_download_url: asset.progressive_download_url,
            title: typeof asset.title === "string" ? asset.title : undefined,
            display_artist: typeof asset.display_artist === "string" ? asset.display_artist : undefined
          }
        };
      }
      const orig = resolveOne(src, field(musicMeta, "original_sound_info"));
      if (orig && typeof orig.progressive_download_url === "string") {
        picked.original_sound_info = {
          progressive_download_url: orig.progressive_download_url
        };
      }
      if (picked.music_info || picked.original_sound_info) out.music_metadata = picked;
    }
    return out;
  }

  function hasMediaFields(rec) {
    return !!(
      field(rec, "image_versions2") ||
      field(rec, "carousel_media") ||
      field(rec, "video_versions") ||
      field(rec, "video_dash_manifest")
    );
  }

  function mediaRichness(rec) {
    let score = 0;
    if (field(rec, "carousel_media")) score += 4;
    if (field(rec, "video_versions")) score += 3;
    if (field(rec, "video_dash_manifest")) score += 2;
    if (field(rec, "image_versions2")) score += 1;
    if (field(rec, "caption")) score += 1;
    return score;
  }

  function pickMedia(src, rec, story = false, depth = 0) {
    const out = {};
    for (let i = 0; i < MEDIA_FIELDS.length; i++) {
      const name = MEDIA_FIELDS[i];
      const v = field(rec, name);
      if (v !== undefined) {
        const d = denormalize(src, v, 3);
        if (d !== undefined) out[name] = d;
      }
    }

    const audioMeta = pickAudioMetadata(src, rec);
    if (audioMeta.clips_metadata) out.clips_metadata = audioMeta.clips_metadata;
    if (audioMeta.music_metadata) out.music_metadata = audioMeta.music_metadata;

    for (const name of ["user", "owner"]) {
      const u = linked(src, field(rec, name))[0];
      if (u) {
        out[name] = {
          username: typeof u.username === "string" ? u.username : undefined,
          pk: u.pk !== undefined ? u.pk : u.id
        };
      }
    }

    const caption = linked(src, field(rec, "caption"))[0];
    if (caption && typeof caption.text === "string") {
      out.caption = { text: caption.text };
    }

    if (depth < 2) {
      const children = linked(src, field(rec, "carousel_media"));
      if (children.length) {
        const list = new Array(children.length);
        for (let i = 0; i < children.length; i++) {
          list[i] = pickMedia(src, children[i], false, depth + 1);
        }
        out.carousel_media = list;
      }
    }

    if (story) {
      for (let i = 0; i < STORY_FIELDS.length; i++) {
        const name = STORY_FIELDS[i];
        const v = field(rec, name);
        if (v !== undefined) {
          const d = denormalize(src, v, STICKER_DEPTH);
          if (d !== undefined) out[name] = d;
        }
      }
    }
    return out;
  }

  function findBest(src, match, scoreFn) {
    const ids = src.getRecordIDs();
    let best = null;
    let bestScore = -1;
    for (let i = 0; i < ids.length; i++) {
      const r = src.get(ids[i]);
      if (!r || !match(r)) continue;
      if (!scoreFn) return r;
      const sc = scoreFn(r);
      if (sc > bestScore) {
        best = r;
        bestScore = sc;
      }
    }
    return best;
  }

  function findMedia(src, code) {
    if (typeof code !== "string" || !code) return null;
    const rec = findBest(src, (r) => r.code === code && hasMediaFields(r), mediaRichness);
    return rec ? pickMedia(src, rec, false) : null;
  }

  function baseNumericId(value) {
    if (value === undefined || value === null) return "";
    return str(value).split("_")[0];
  }

  function findMediaById(src, id) {
    const clean = baseNumericId(id);
    if (!clean) return null;
    const rec = findBest(
      src,
      (r) => (baseNumericId(r.pk) === clean || baseNumericId(r.id) === clean) && hasMediaFields(r),
      mediaRichness
    );
    return rec ? pickMedia(src, rec, false) : null;
  }

  function findReel(src, reelId) {
    const clean = str(reelId ?? "");
    if (!clean) return null;
    const rec = findBest(src, (r) => {
      if (str(r.id) !== clean) return false;
      const itemsField = field(r, "items");
      return !!(itemsField && typeof itemsField === "object");
    });
    if (!rec) return null;
    const rawItems = linked(src, field(rec, "items"));
    if (!rawItems.length) return null;
    const items = new Array(rawItems.length);
    for (let i = 0; i < rawItems.length; i++) items[i] = pickMedia(src, rawItems[i], true);
    const owner = linked(src, field(rec, "user"))[0];
    return {
      items,
      user: owner && typeof owner.username === "string" ? { username: owner.username } : undefined
    };
  }

  function formatUser(src, rec) {
    const hd = denormalize(src, field(rec, "hd_profile_pic_url_info"), 2);
    const fs = denormalize(src, field(rec, "friendship_status"), 2);
    const out = {
      id: str(rec.pk ?? rec.id),
      username: typeof rec.username === "string" ? rec.username : undefined,
      full_name: typeof rec.full_name === "string" ? rec.full_name : undefined,
      profile_pic_url: typeof rec.profile_pic_url === "string" ? rec.profile_pic_url : undefined,
      hd: hd && typeof hd === "object" && typeof hd.url === "string" ? hd : undefined,
      fs: fs && typeof fs === "object" && typeof fs.followed_by === "boolean"
        ? { following: !!fs.following, followed_by: fs.followed_by }
        : undefined
    };
    return out;
  }

  function userRichness(rec) {
    let score = 0;
    if (field(rec, "hd_profile_pic_url_info")) score += 4;
    if (field(rec, "friendship_status")) score += 2;
    if (typeof rec.profile_pic_url === "string") score += 1;
    return score;
  }

  function findUser(src, username) {
    if (typeof username !== "string" || !username) return null;
    const name = strLower(username);
    const rec = findBest(
      src,
      (r) => typeof r.username === "string" && strLower(r.username) === name && !!(r.pk || r.id),
      userRichness
    );
    return rec ? formatUser(src, rec) : null;
  }

  function findUserById(src, id) {
    const clean = baseNumericId(id);
    if (!clean) return null;
    const rec = findBest(
      src,
      (r) => typeof r.username === "string" && (baseNumericId(r.pk) === clean || baseNumericId(r.id) === clean),
      userRichness
    );
    return rec ? formatUser(src, rec) : null;
  }

  function createRelayLookup(options = {}) {
    const doc = options.document !== undefined ? options.document : globalThis.document;
    const now = typeof options.now === "function" ? options.now : dateNow;
    const retryMs = Number.isFinite(options.retryMs) ? options.retryMs : RELAY_RETRY_MS;

    let fiberKey;
    let relaySource;
    let relayRetryAt = 0;

    function fiberOf(el) {
      if (!el || typeof el !== "object") return undefined;
      if (fiberKey && hasOwn(el, fiberKey)) return el[fiberKey];
      const keys = objectKeys(el);
      for (let i = 0; i < keys.length; i++) {
        if (strStartsWith(keys[i], "__reactFiber$")) {
          fiberKey = keys[i];
          return el[fiberKey];
        }
      }
      return undefined;
    }

    function sourceAbove(el) {
      let f = fiberOf(el);
      for (let i = 0; i < 2000 && f; i++, f = f.return) {
        const props = f.memoizedProps;
        const env = props && (props.environment || (props.value && props.value.environment));
        if (env && typeof env.getStore === "function") {
          const store = env.getStore();
          if (store && typeof store.getSource === "function") {
            const src = store.getSource();
            if (src && typeof src.get === "function" && typeof src.getRecordIDs === "function") return src;
          }
        }
      }
      return undefined;
    }

    function findRelaySource() {
      if (!doc || typeof doc.querySelector !== "function") return undefined;
      for (const sel of ["main div", 'div[role="main"] div']) {
        const el = doc.querySelector(sel);
        const src = el && sourceAbove(el);
        if (src) return src;
      }
      if (typeof doc.querySelectorAll !== "function") return undefined;
      let tries = 0;
      const divs = doc.querySelectorAll("div");
      for (let i = 0; i < divs.length; i++) {
        if (!fiberOf(divs[i])) continue;
        const src = sourceAbove(divs[i]);
        if (src || ++tries >= MAX_TRIES) return src;
      }
      return undefined;
    }

    function getRelaySource() {
      if (!relaySource && now() >= relayRetryAt) {
        relaySource = findRelaySource();
        if (!relaySource) relayRetryAt = now() + retryMs;
      }
      return relaySource;
    }

    function fromStore(read) {
      const src = getRelaySource();
      if (!src) return null;
      try {
        return read(src);
      } catch (_) {
        relaySource = undefined;
        return null;
      }
    }

    function reset() {
      relaySource = undefined;
      fiberKey = undefined;
      relayRetryAt = 0;
    }

    return { fiberOf, sourceAbove, findRelaySource, getRelaySource, fromStore, reset };
  }

  function createOps(lookup) {
    return {
      getMedia(args) {
        return lookup.fromStore((src) => findMedia(src, str(args?.code ?? "")));
      },
      getMediaById(args) {
        return lookup.fromStore((src) => findMediaById(src, str(args?.id ?? "")));
      },
      getReel(args) {
        return lookup.fromStore((src) => findReel(src, str(args?.id ?? "")));
      },
      getUser(args) {
        return lookup.fromStore((src) => findUser(src, str(args?.username ?? "")));
      },
      getUserById(args) {
        return lookup.fromStore((src) => findUserById(src, str(args?.id ?? "")));
      },
      health() {
        return { relay: !!lookup.getRelaySource() };
      }
    };
  }

  function createRelayHandler(lookup = createRelayLookup()) {
    const ops = createOps(lookup);
    return function handleRequest(msg) {
      const id = msg.id;
      const type = "iy:relay-res";
      if (!hasOwn(ops, msg.op)) return { type, id, ok: false, error: "Unknown op" };
      try { return { type, id, ok: true, result: ops[msg.op](msg.args || {}) }; }
      catch (_) { return { type, id, ok: false, error: "Relay lookup failed" }; }
    };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      denormalize,
      findMedia,
      findMediaById,
      findReel,
      findUser,
      findUserById,
      createRelayLookup,
      createOps,
      createRelayHandler
    };
  } else {
    // net.js takes this handler into its closure before page scripts run.
    globalThis.IY.relayRequest = createRelayHandler();
  }
})();
