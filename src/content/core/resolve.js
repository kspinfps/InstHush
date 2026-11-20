// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
// Best-quality media resolution, DASH/clips audio extraction, CDN file-key matching,
// and DOM-to-post/carousel/story/highlight target resolution.
(function () {
  "use strict";

  const mediaLib = typeof module !== "undefined" && module.exports
    ? require("../../lib/media.js")
    : (globalThis.IY || {});

  const SHORTCODE_RE = /\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,})/;
  const EXT_RE = /\.(jpe?g|png|webp|heic|mp4|m4v|mov|m4a|mp3|aac|ogg|opus|gif)(?:$|[?#])/i;
  const HEX_OE_RE = /^[0-9a-f]{1,10}$/i;

  const RESERVED_ROUTES = new Set([
    "accounts", "explore", "direct", "about", "developer", "legal", "emails", "challenge",
    "stories", "reels", "reel", "p", "tv", "web", "session", "privacy", "terms", "press",
    "api", "graphql", "oauth", "nametag", "lite", "your_activity", "notifications", "threads",
    "settings", "archive", "create", "login", "signup", "help", "ads", "business", "static"
  ]);

  function isAllowedUrl(url) {
    return mediaLib.isAllowedCdn?.(url) === true;
  }

  function toDim(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  }

  function pickBest(candidates) {
    if (!Array.isArray(candidates) || !candidates.length) return undefined;
    let best;
    let bestArea = -1;
    let bestWidth = -1;
    let bestBandwidth = -1;

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      if (!c || typeof c !== "object" || !isAllowedUrl(c.url)) continue;
      const w = toDim(c.width);
      const h = toDim(c.height);
      const area = w * h;
      const bw = Number.isFinite(Number(c.bandwidth)) ? Number(c.bandwidth) : 0;
      if (
        !best ||
        area > bestArea ||
        (area === bestArea && w > bestWidth) ||
        (area === bestArea && w === bestWidth && bw > bestBandwidth)
      ) {
        best = c;
        bestArea = area;
        bestWidth = w;
        bestBandwidth = bw;
      }
    }
    return best;
  }

  function extFromUrl(url, fallback = "jpg") {
    if (typeof url === "string" && url) {
      try {
        const pathname = new URL(url, "https://www.instagram.com/").pathname;
        const m = EXT_RE.exec(pathname);
        if (m) {
          const ext = m[1].toLowerCase();
          return ext === "jpeg" ? "jpg" : ext;
        }
      } catch (_) {}
    }
    return fallback;
  }

  function cdnFileKey(url, baseUrl) {
    if (typeof url !== "string" || !url) return "";
    const trimmed = url.trim();
    if (!trimmed || /^(?:blob|data|javascript):/i.test(trimmed)) return "";
    try {
      const base = baseUrl || (globalThis.location && globalThis.location.href) || "https://www.instagram.com/";
      const parsed = new URL(trimmed, base);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
      const segments = parsed.pathname.split("/").filter(Boolean);
      const last = segments.length ? segments[segments.length - 1] : "";
      return last.replace(/\.[a-z0-9]+$/i, "");
    } catch (_) {
      return "";
    }
  }

  function linksExpireAt(urls) {
    if (!Array.isArray(urls)) return undefined;
    let first;
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      if (typeof url !== "string" || !url) continue;
      let oe = null;
      try {
        oe = new URL(url).searchParams.get("oe");
      } catch (_) {
        continue;
      }
      if (!oe || !HEX_OE_RE.test(oe)) continue;
      const at = parseInt(oe, 16) * 1000;
      if (Number.isFinite(at) && (first === undefined || at < first)) first = at;
    }
    return first;
  }

  function decodeXmlEntities(str) {
    if (typeof str !== "string" || !str.includes("&")) return str;
    return str.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (full, entity) => {
      const lower = entity.toLowerCase();
      if (lower === "amp") return "&";
      if (lower === "lt") return "<";
      if (lower === "gt") return ">";
      if (lower === "quot") return '"';
      if (lower === "apos") return "'";
      if (lower.startsWith("#x")) {
        const code = parseInt(lower.slice(2), 16);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : full;
      }
      if (lower.startsWith("#")) {
        const code = parseInt(lower.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : full;
      }
      return full;
    });
  }

  function readAttr(tagAttrs, name) {
    const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i");
    const m = re.exec(tagAttrs);
    return m ? (m[1] !== undefined ? m[1] : m[2]) : "";
  }

  const AUDIO_CODEC_RE = /^(?:mp4a|opus|vorbis|flac|mp3|ac-3|ec-3)\b/i;

  function extractBaseUrl(block) {
    const start = block.search(/<BaseURL\b[^>]*>/i);
    if (start < 0) return "";
    const openEnd = block.indexOf(">", start);
    if (openEnd < 0) return "";
    const close = block.slice(openEnd + 1).search(/<\/BaseURL\s*>/i);
    if (close < 0) return "";
    let raw = block.slice(openEnd + 1, openEnd + 1 + close).trim();
    if (raw.startsWith("<![CDATA[") && raw.endsWith("]]>")) {
      raw = raw.slice(9, -3).trim();
    }
    return decodeXmlEntities(raw).trim();
  }

  function isSegmentedPrefix(url, blockLower) {
    if (!url) return true;
    try {
      const pathname = new URL(url).pathname;
      if (pathname.endsWith("/") && (blockLower.includes("<segmenttemplate") || blockLower.includes("<segmentlist"))) {
        return true;
      }
    } catch (_) {
      return true;
    }
    return false;
  }

  function audioCodecRank(codecs, mime) {
    const c = (codecs || "").toLowerCase();
    const m = (mime || "").toLowerCase();
    if (c.startsWith("mp4a.40.2") || c.startsWith("mp4a.40.5")) return 3;
    if (c.startsWith("mp4a") || m === "audio/mp4" || m === "audio/mpeg") return 2;
    if (c.startsWith("opus") || c.startsWith("vorbis") || m === "audio/webm" || m === "audio/ogg") return 2;
    if (c.startsWith("ac-3") || c.startsWith("ec-3")) return 0;
    return 1;
  }

  function extractDashAudioCandidates(manifest) {
    if (typeof manifest !== "string" || manifest.length < 20 || manifest.length > 512 * 1024) return [];
    const lower = manifest.toLowerCase();
    if (!lower.includes("baseurl")) return [];

    const found = [];

    function consider(url, bandwidth, codecs, mime, blockLower) {
      if (!isAllowedUrl(url) || isSegmentedPrefix(url, blockLower)) return;
      const bw = Number.isFinite(bandwidth) && bandwidth > 0 ? bandwidth : 0;
      found.push({
        url,
        ext: extFromUrl(url, mime === "audio/webm" ? "webm" : "m4a"),
        bandwidth: bw,
        rank: audioCodecRank(codecs, mime)
      });
    }

    // Walk <AdaptationSet ...>...</AdaptationSet> blocks linearly (no backtracking).
    let cursor = 0;
    while (cursor < manifest.length) {
      const openIdx = lower.indexOf("<adaptationset", cursor);
      if (openIdx < 0) break;
      const openEnd = manifest.indexOf(">", openIdx);
      if (openEnd < 0) break;
      const closeIdx = lower.indexOf("</adaptationset>", openEnd);
      if (closeIdx < 0) break;

      const setAttrs = manifest.slice(openIdx, openEnd);
      const setBody = manifest.slice(openEnd + 1, closeIdx);
      const setBodyLower = lower.slice(openEnd + 1, closeIdx);
      const setContentType = readAttr(setAttrs, "contentType").toLowerCase();
      const setMimeType = readAttr(setAttrs, "mimeType").toLowerCase();
      const setCodecs = readAttr(setAttrs, "codecs").toLowerCase();
      const setIsVideo = setContentType === "video" || setMimeType.startsWith("video/");
      const setIsAudio = setContentType === "audio" || setMimeType.startsWith("audio/");

      let repPos = 0;
      let foundRep = false;
      while (repPos < setBody.length) {
        const repOpen = setBodyLower.indexOf("<representation", repPos);
        if (repOpen < 0) break;
        const repOpenEnd = setBody.indexOf(">", repOpen);
        if (repOpenEnd < 0) break;
        const repClose = setBodyLower.indexOf("</representation>", repOpenEnd);
        if (repClose < 0) break;
        foundRep = true;

        const repAttrs = setBody.slice(repOpen, repOpenEnd);
        const repContentType = readAttr(repAttrs, "contentType").toLowerCase();
        const repMime = readAttr(repAttrs, "mimeType").toLowerCase();
        const repCodecs = readAttr(repAttrs, "codecs").toLowerCase() || setCodecs;
        const repIsVideo = repContentType === "video" || repMime.startsWith("video/") ||
          Boolean(readAttr(repAttrs, "width")) || Boolean(readAttr(repAttrs, "height"));
        const repIsAudio = setIsAudio || repContentType === "audio" || repMime.startsWith("audio/") ||
          (!setIsVideo && !repIsVideo && AUDIO_CODEC_RE.test(repCodecs));

        if (repIsAudio && !repIsVideo) {
          const repBody = setBody.slice(repOpenEnd + 1, repClose);
          const repBodyLower = setBodyLower.slice(repOpenEnd + 1, repClose);
          const url = extractBaseUrl(repBody);
          const bw = Number(readAttr(repAttrs, "bandwidth"));
          if (url) consider(url, bw, repCodecs, repMime || setMimeType, repBodyLower);
        }
        repPos = repClose + 17;
      }

      if (setIsAudio && !foundRep) {
        const url = extractBaseUrl(setBody);
        if (url) consider(url, 0, setCodecs, setMimeType, setBodyLower);
      }

      cursor = closeIdx + 16;
    }

    found.sort((a, b) => (b.rank - a.rank) || (b.bandwidth - a.bandwidth));
    const unique = [];
    const seen = new Set();
    for (let i = 0; i < found.length; i++) {
      if (seen.has(found[i].url)) continue;
      seen.add(found[i].url);
      unique.push({ url: found[i].url, ext: found[i].ext, bandwidth: found[i].bandwidth });
    }
    return unique;
  }

  function extractAudioFromDash(manifest) {
    return extractDashAudioCandidates(manifest)[0];
  }

  function extractDashManifest(raw) {
    if (!raw || typeof raw !== "object") return "";
    if (typeof raw.video_dash_manifest === "string" && raw.video_dash_manifest) return raw.video_dash_manifest;
    if (raw.dash_info && typeof raw.dash_info.video_dash_manifest === "string" && raw.dash_info.video_dash_manifest) {
      return raw.dash_info.video_dash_manifest;
    }
    if (typeof raw.dash_manifest === "string" && raw.dash_manifest) return raw.dash_manifest;
    return "";
  }

  function extractAudioUrls(raw) {
    if (!raw || typeof raw !== "object") return [];
    const out = [];
    const seen = new Set();

    function push(entry) {
      if (!entry || !isAllowedUrl(entry.url) || seen.has(entry.url)) return;
      seen.add(entry.url);
      out.push(entry);
    }

    const dashManifest = extractDashManifest(raw);
    if (dashManifest) {
      const dashCandidates = extractDashAudioCandidates(dashManifest);
      for (let i = 0; i < dashCandidates.length && i < 2; i++) push(dashCandidates[i]);
    }

    const candidates = [
      raw.clips_metadata && raw.clips_metadata.original_sound_info && raw.clips_metadata.original_sound_info.progressive_download_url,
      raw.clips_metadata && raw.clips_metadata.music_info && raw.clips_metadata.music_info.music_asset_info && raw.clips_metadata.music_info.music_asset_info.progressive_download_url,
      raw.music_metadata && raw.music_metadata.original_sound_info && raw.music_metadata.original_sound_info.progressive_download_url,
      raw.music_metadata && raw.music_metadata.music_info && raw.music_metadata.music_info.music_asset_info && raw.music_metadata.music_info.music_asset_info.progressive_download_url,
      raw.audio_url,
      raw.audio_src,
      raw.attachment_cdn_url
    ];

    for (let i = 0; i < candidates.length; i++) {
      const url = candidates[i];
      if (typeof url === "string" && isAllowedUrl(url)) {
        push({ url, ext: extFromUrl(url, "m4a") });
      }
    }
    return out;
  }

  function extractAudioUrl(raw) {
    return extractAudioUrls(raw)[0];
  }

  function extractDuration(raw) {
    if (!raw || typeof raw !== "object") return undefined;
    const direct = Number(raw.video_duration !== undefined ? raw.video_duration : raw.duration);
    if (Number.isFinite(direct) && direct > 0) return direct;
    const ms = Number(raw.playable_duration_in_ms);
    if (Number.isFinite(ms) && ms > 0) return ms / 1000;
    return undefined;
  }

  function collectImageCandidates(raw) {
    const out = [];
    const restCandidates = raw.image_versions2 && raw.image_versions2.candidates;
    if (Array.isArray(restCandidates)) {
      for (let i = 0; i < restCandidates.length; i++) {
        const c = restCandidates[i];
        if (c && typeof c.url === "string" && c.url) out.push(c);
      }
    }
    if (Array.isArray(raw.display_resources)) {
      for (let i = 0; i < raw.display_resources.length; i++) {
        const r = raw.display_resources[i];
        if (r && typeof r.src === "string" && r.src) {
          out.push({ url: r.src, width: r.config_width, height: r.config_height });
        }
      }
    }
    if (typeof raw.display_url === "string" && raw.display_url) {
      out.push({
        url: raw.display_url,
        width: raw.dimensions && raw.dimensions.width,
        height: raw.dimensions && raw.dimensions.height
      });
    }
    return out;
  }

  function collectVideoCandidates(raw) {
    const out = [];
    if (Array.isArray(raw.video_versions)) {
      for (let i = 0; i < raw.video_versions.length; i++) {
        const v = raw.video_versions[i];
        if (v && typeof v.url === "string" && v.url) out.push(v);
      }
    }
    if (typeof raw.video_url === "string" && raw.video_url) {
      out.push({
        url: raw.video_url,
        width: (raw.dimensions && raw.dimensions.width) || raw.original_width,
        height: (raw.dimensions && raw.dimensions.height) || raw.original_height
      });
    }
    return out;
  }

  function resolveItem(raw) {
    if (!raw || typeof raw !== "object") return undefined;
    const rawId = raw.pk !== undefined && raw.pk !== null ? raw.pk : (raw.id !== undefined && raw.id !== null ? raw.id : "");
    const id = String(rawId).split("_")[0];
    const duration = extractDuration(raw);
    const audioList = extractAudioUrls(raw);
    const audio = audioList[0];
    const audioUrls = audioList.length ? audioList.map((a) => a.url) : undefined;
    const dashManifest = extractDashManifest(raw);
    const bestImage = pickBest(collectImageCandidates(raw));
    const bestVideo = pickBest(collectVideoCandidates(raw));
    const isVideo = raw.media_type === 2 || raw.is_video === true || Boolean(bestVideo);

    if (isVideo && bestVideo) {
      return {
        id,
        type: "video",
        url: bestVideo.url,
        width: toDim(bestVideo.width),
        height: toDim(bestVideo.height),
        ext: extFromUrl(bestVideo.url, "mp4"),
        cdnKey: cdnFileKey(bestVideo.url),
        duration,
        audioUrl: audio ? audio.url : undefined,
        audioUrls,
        audioExt: audio ? audio.ext : undefined,
        posterUrl: bestImage ? bestImage.url : undefined,
        dashOnly: false
      };
    }

    if (isVideo && dashManifest) {
      if (bestImage) {
        return {
          id,
          type: "video",
          url: bestImage.url,
          width: toDim(bestImage.width),
          height: toDim(bestImage.height),
          ext: extFromUrl(bestImage.url, "jpg"),
          cdnKey: cdnFileKey(bestImage.url),
          duration,
          audioUrl: audio ? audio.url : undefined,
          audioUrls,
          audioExt: audio ? audio.ext : undefined,
          posterUrl: bestImage.url,
          dashOnly: true
        };
      }
      if (audio) {
        return {
          id,
          type: "video",
          url: audio.url,
          width: 0,
          height: 0,
          ext: audio.ext,
          cdnKey: cdnFileKey(audio.url),
          duration,
          audioUrl: audio.url,
          audioUrls,
          audioExt: audio.ext,
          posterUrl: undefined,
          dashOnly: true
        };
      }
      return undefined;
    }

    if (bestImage) {
      return {
        id,
        type: "image",
        url: bestImage.url,
        width: toDim(bestImage.width),
        height: toDim(bestImage.height),
        ext: extFromUrl(bestImage.url, "jpg"),
        cdnKey: cdnFileKey(bestImage.url),
        duration: undefined,
        audioUrl: audio ? audio.url : undefined,
        audioUrls,
        audioExt: audio ? audio.ext : undefined,
        posterUrl: undefined,
        dashOnly: false
      };
    }

    if (audio) {
      return {
        id,
        type: "audio",
        url: audio.url,
        width: 0,
        height: 0,
        ext: audio.ext,
        cdnKey: cdnFileKey(audio.url),
        duration,
        audioUrl: audio.url,
        audioUrls,
        audioExt: audio.ext,
        posterUrl: undefined,
        dashOnly: false
      };
    }

    return undefined;
  }

  function extractCaption(raw) {
    if (!raw || typeof raw !== "object") return "";
    if (raw.caption && typeof raw.caption.text === "string") return raw.caption.text;
    if (typeof raw.caption === "string") return raw.caption;
    const edges = raw.edge_media_to_caption && raw.edge_media_to_caption.edges;
    if (Array.isArray(edges) && edges[0] && edges[0].node && typeof edges[0].node.text === "string") {
      return edges[0].node.text;
    }
    return "";
  }

  function extractCarouselChildren(raw) {
    if (!raw || typeof raw !== "object") return [];
    if (Array.isArray(raw.carousel_media) && raw.carousel_media.length) return raw.carousel_media;
    const edges = raw.edge_sidecar_to_children && raw.edge_sidecar_to_children.edges;
    if (Array.isArray(edges) && edges.length) {
      const nodes = [];
      for (let i = 0; i < edges.length; i++) {
        if (edges[i] && edges[i].node && typeof edges[i].node === "object") nodes.push(edges[i].node);
      }
      return nodes;
    }
    return [];
  }

  function normalizeMedia(input, fallbackShortcode = "") {
    let raw = input;
    if (raw && typeof raw === "object" && !raw.pk && !raw.code && !raw.image_versions2 && !raw.video_versions && !raw.carousel_media) {
      if (raw.xdt_shortcode_media && typeof raw.xdt_shortcode_media === "object") raw = raw.xdt_shortcode_media;
      else if (raw.shortcode_media && typeof raw.shortcode_media === "object") raw = raw.shortcode_media;
      else if (raw.data && raw.data.xdt_shortcode_media && typeof raw.data.xdt_shortcode_media === "object") raw = raw.data.xdt_shortcode_media;
      else if (raw.data && raw.data.shortcode_media && typeof raw.data.shortcode_media === "object") raw = raw.data.shortcode_media;
    }

    if (!raw || typeof raw !== "object") {
      return {
        id: "",
        shortcode: typeof fallbackShortcode === "string" ? fallbackShortcode : "",
        username: "unknown",
        takenAt: 0,
        caption: "",
        items: [],
        isCarousel: false,
        expiresAt: undefined
      };
    }

    const carouselChildren = extractCarouselChildren(raw);
    const sources = carouselChildren.length ? carouselChildren : [raw];
    const items = [];
    for (let i = 0; i < sources.length; i++) {
      const item = resolveItem(sources[i]);
      if (item) items.push(item);
    }

    const rawId = raw.pk !== undefined && raw.pk !== null ? raw.pk : (raw.id !== undefined && raw.id !== null ? raw.id : "");
    const takenRaw = Number(raw.taken_at !== undefined ? raw.taken_at : raw.taken_at_timestamp);
    const takenAt = Number.isFinite(takenRaw) && takenRaw > 0 ? takenRaw : 0;
    const username =
      (raw.user && typeof raw.user.username === "string" && raw.user.username) ||
      (raw.owner && typeof raw.owner.username === "string" && raw.owner.username) ||
      "unknown";
    const shortcode =
      (typeof raw.code === "string" && raw.code) ||
      (typeof raw.shortcode === "string" && raw.shortcode) ||
      (typeof fallbackShortcode === "string" ? fallbackShortcode : "");

    return {
      id: String(rawId).split("_")[0],
      shortcode,
      username,
      takenAt,
      caption: extractCaption(raw),
      items,
      isCarousel: carouselChildren.length > 1 || raw.media_type === 8,
      expiresAt: linksExpireAt(items.map((it) => it.url))
    };
  }

  function normalizeReel(reel) {
    if (!reel || typeof reel !== "object" || !Array.isArray(reel.items)) return [];
    const owner = reel.user && typeof reel.user.username === "string" ? reel.user.username : "";
    const out = [];
    for (let i = 0; i < reel.items.length; i++) {
      const post = normalizeMedia(reel.items[i]);
      if (owner && post.username === "unknown") post.username = owner;
      if (!post.shortcode) post.shortcode = post.id;
      post.isStory = true;
      out.push(post);
    }
    return out;
  }

  function parseRoute(pathname) {
    if (typeof pathname !== "string") return { kind: "other" };
    const clean = pathname.split(/[?#]/)[0];
    const parts = clean.split("/").filter(Boolean);
    const a = parts[0];
    const b = parts[1];
    const c = parts[2];
    if (!a) return { kind: "home" };
    if (a === "p" || a === "tv") return { kind: "post", shortcode: b };
    if (a === "reel" && b) return { kind: "reel", shortcode: b };
    if (a === "reels") return b ? { kind: "reel", shortcode: b } : { kind: "reels" };
    if (a === "stories") {
      if (b === "highlights" && c) return { kind: "highlight", highlightId: c };
      if (b) return { kind: "stories", username: b, storyId: c };
      return { kind: "other" };
    }
    if (a === "explore") return { kind: "explore" };
    if (a === "direct") return { kind: "direct" };
    if (RESERVED_ROUTES.has(a.toLowerCase())) return { kind: "other" };
    if ((b === "p" || b === "reel") && c) {
      return { kind: b === "p" ? "post" : "reel", shortcode: c, username: a };
    }
    if (b === "saved") {
      const collection = parts[3] && /^\d+$/.test(parts[3]) ? parts[3] : "all";
      return { kind: "profile", username: a, saved: collection };
    }
    return { kind: "profile", username: a };
  }

  function shortcodeFromHref(href) {
    if (typeof href !== "string") return undefined;
    const m = SHORTCODE_RE.exec(href);
    return m ? m[1] : undefined;
  }

  function shortcodeInRoot(root) {
    if (!root || typeof root.querySelector !== "function") return undefined;
    const time = root.querySelector("a time");
    const timeLink = time && typeof time.closest === "function" ? time.closest("a") : null;
    const fromTime = shortcodeFromHref(timeLink && timeLink.getAttribute("href"));
    if (fromTime) return fromTime;
    if (typeof root.querySelectorAll === "function") {
      const links = root.querySelectorAll('a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]');
      for (let i = 0; i < links.length; i++) {
        const sc = shortcodeFromHref(links[i].getAttribute("href"));
        if (sc) return sc;
      }
    }
    return undefined;
  }

  function isStoryPreview(el, win) {
    if (!el || typeof el.getBoundingClientRect !== "function") return false;
    const targetWin = win || globalThis.window || globalThis;
    const width = Number(targetWin && targetWin.innerWidth);
    if (!Number.isFinite(width) || width <= 0) return false;
    const r = el.getBoundingClientRect();
    const mid = width / 2;
    return r.right < mid || r.left > mid;
  }

  function isImageElement(el) {
    if (!el || typeof el !== "object") return false;
    if (typeof HTMLImageElement === "function" && el instanceof HTMLImageElement) return true;
    return typeof el.tagName === "string" && el.tagName.toUpperCase() === "IMG";
  }

  function contextFor(el, options = {}) {
    if (!el || typeof el !== "object") return null;
    const pathname = options.pathname !== undefined
      ? options.pathname
      : (globalThis.location && globalThis.location.pathname) || "/";
    const doc = options.document !== undefined ? options.document : globalThis.document;
    const win = options.window !== undefined ? options.window : globalThis.window;
    const api = options.api || (globalThis.IY && globalThis.IY.api);
    const route = parseRoute(pathname);

    if ((route.kind === "stories" || route.kind === "highlight") && isStoryPreview(el, win)) return null;

    if (route.kind === "stories" && route.username) {
      const username = route.username;
      return {
        kind: "story",
        el,
        username,
        storyId: route.storyId,
        reelId: (offline) => {
          if (typeof options.getUserId === "function") return options.getUserId(username, { offline });
          if (api && typeof api.getUserId === "function") return api.getUserId(username, { offline });
          return Promise.reject(new Error("API getUserId not available"));
        }
      };
    }

    if (route.kind === "highlight" && route.highlightId) {
      const id = "highlight:" + route.highlightId;
      return {
        kind: "story",
        el,
        highlightId: route.highlightId,
        reelId: async () => id
      };
    }

    const closest = typeof el.closest === "function" ? (sel) => el.closest(sel) : () => null;
    const dialogSel = 'div[role="dialog"], [role="dialog"]';

    if (route.kind === "profile" && route.username && isImageElement(el) && closest("header") && !closest(dialogSel)) {
      return { kind: "avatar", el, username: route.username };
    }

    const anchor = closest("a");
    const linkCode = shortcodeFromHref(anchor && typeof anchor.getAttribute === "function" ? anchor.getAttribute("href") : null);
    if (linkCode) return { kind: "post", el, shortcode: linkCode };

    const inDialog = !!closest(dialogSel);
    const hasDialog = !!(doc && typeof doc.querySelector === "function" && doc.querySelector(dialogSel));
    if ((route.kind === "post" || route.kind === "reel") && route.shortcode && (inDialog || !closest("article") || !hasDialog)) {
      return { kind: "post", el, shortcode: route.shortcode };
    }

    const article = closest("article");
    const fromArticle = article && shortcodeInRoot(article);
    if (fromArticle) return { kind: "post", el, shortcode: fromArticle };

    if (route.shortcode) return { kind: "post", el, shortcode: route.shortcode };
    return null;
  }

  function matchIndex(items, el) {
    if (!Array.isArray(items) || !items.length || !el || typeof el !== "object") return -1;

    if (isImageElement(el)) {
      const key = cdnFileKey(el.currentSrc || el.src);
      if (!key) return -1;
      const direct = items.findIndex((it) => it && (it.cdnKey || cdnFileKey(it.url)) === key);
      if (direct >= 0) return direct;
      return items.findIndex((it) => it && it.posterUrl && cdnFileKey(it.posterUrl) === key);
    }

    const src = el.currentSrc || el.src || "";
    if (src && !src.startsWith("blob:")) {
      const key = cdnFileKey(src);
      if (key) {
        const direct = items.findIndex((it) => it && it.type === "video" && (it.cdnKey || cdnFileKey(it.url)) === key);
        if (direct >= 0) return direct;
      }
    }

    if (typeof el.poster === "string" && el.poster) {
      const posterKey = cdnFileKey(el.poster);
      if (posterKey) {
        const byPoster = items.findIndex((it) => it && it.type === "video" && it.posterUrl && cdnFileKey(it.posterUrl) === posterKey);
        if (byPoster >= 0) return byPoster;
      }
    }

    const videos = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i] && items[i].type === "video") videos.push({ item: items[i], index: i });
    }
    if (videos.length === 1) return videos[0].index;

    const dur = Number(el.duration);
    if (Number.isFinite(dur) && dur > 0) {
      let best = -1;
      let bestDiff = 1.5;
      for (let i = 0; i < videos.length; i++) {
        const itemDur = Number(videos[i].item.duration);
        if (!Number.isFinite(itemDur) || itemDur <= 0) continue;
        const diff = Math.abs(itemDur - dur);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = videos[i].index;
        }
      }
      if (best >= 0) return best;
    }

    return videos.length ? videos[0].index : -1;
  }

  async function resolveTarget(ctx, options = {}) {
    const offline = typeof options === "boolean" ? options : Boolean(options && options.offline);
    const api = (typeof options === "object" && options && options.api) || (globalThis.IY && globalThis.IY.api);
    if (!ctx || typeof ctx !== "object") throw new TypeError("Missing MediaContext");
    if (!api) throw new Error("API module not available");

    if (ctx.kind === "post") {
      const post = await api.getPostByShortcode(ctx.shortcode, { offline });
      const idx = matchIndex(post.items, ctx.el);
      return { post, index: idx < 0 && post.items.length === 1 ? 0 : idx };
    }

    if (ctx.kind === "story") {
      const reelId = await ctx.reelId(offline);
      const tray = await api.getReelItems(reelId, { offline });
      if (!tray.length) throw new Error("No stories found");
      let i = ctx.storyId ? tray.findIndex((p) => p.id === String(ctx.storyId)) : -1;
      if (i < 0) {
        const withItems = [];
        for (let at = 0; at < tray.length; at++) {
          if (tray[at] && tray[at].items && tray[at].items[0]) {
            withItems.push({ item: tray[at].items[0], at });
          }
        }
        const j = matchIndex(withItems.map((x) => x.item), ctx.el);
        i = j < 0 ? -1 : withItems[j].at;
      }
      if (i < 0 && tray.length > 1) {
        throw new Error("Could not determine which story is showing");
      }
      return { post: tray[Math.max(0, i)], index: 0, tray };
    }

    throw new Error("Avatar targets are handled by profile picture lookup");
  }

  const api = {
    pickBest,
    extFromUrl,
    cdnFileKey,
    linksExpireAt,
    decodeXmlEntities,
    extractAudioFromDash,
    extractAudioUrls,
    extractAudioUrl,
    extractDuration,
    resolveItem,
    normalizeMedia,
    normalizeReel,
    parseRoute,
    shortcodeFromHref,
    shortcodeInRoot,
    isStoryPreview,
    contextFor,
    matchIndex,
    resolveTarget
  };

  globalThis.IY = Object.assign(globalThis.IY || {}, { resolve: api });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
