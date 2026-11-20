(function () {
  "use strict";
  function pickMedia(item, index = 0) {
    if (item && Array.isArray(item.carousel_media)) item = item.carousel_media[index];
    if (!item || typeof item !== "object") return { error: "no-media" };
    const videos = Array.isArray(item.video_versions) ? item.video_versions : [];
    const video = videos.filter(v => v && typeof v.url === "string" && v.url)
      .reduce((best, v) => !best || Number(v.width) * Number(v.height) > Number(best.width) * Number(best.height) ? v : best, null);
    if (video) return { url: video.url, ext: "mp4", kind: "video" };
    if (item.video_dash_manifest) return { error: "dash-only" };
    const candidates = item.image_versions2 && item.image_versions2.candidates;
    const image = (Array.isArray(candidates) ? candidates : []).filter(v => v && typeof v.url === "string" && v.url)
      .reduce((best, v) => !best || Number(v.width) > Number(best.width) ? v : best, null);
    return image ? { url: image.url, ext: "jpg", kind: "image" } : { error: "no-media" };
  }
  function localStamp(unixSeconds) {
    const date = new Date(unixSeconds * 1000);
    if (Number.isNaN(date.getTime())) return "";
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const time = [date.getHours(), date.getMinutes(), date.getSeconds()]
      .map(value => String(value).padStart(2, "0")).join("-");
    return date.getFullYear() + "-" + (month < 10 ? "0" : "") + month + "-" + (day < 10 ? "0" : "") + day + "_" + time;
  }
  const MP3_ORIGINS = Object.freeze(["https://*.cdninstagram.com/*", "https://*.fbcdn.net/*", "https://lookaside.fbsbx.com/*"]);
  const FILENAME_MAX = 150;
  const WIN_RESERVED = /^(?:con|prn|aux|nul|conin\$|conout\$|(?:com|lpt)[1-9¹²³])$/i;
  const BAD_NAME_CHARS = /[\\/\x00-\x1f\x7f<>:"|?*]/;
  // Windows treats CON.jpg like CON: the part before the first dot decides.
  function isReservedName(name) {
    const stem = String(name).split(".")[0].replace(/[ .]+$/, "");
    return WIN_RESERVED.test(stem);
  }
  // Rewrites a built name into a safe one: no edge dots or spaces, no reserved
  // device name, at most FILENAME_MAX chars with the extension kept.
  function safeFilename(name) {
    let out = String(name).replace(/[\\/\x00-\x1f\x7f<>:"|?*]/g, "_").replace(/^[. ]+|[. ]+$/g, "");
    if (out.length > FILENAME_MAX) {
      const dot = out.lastIndexOf(".");
      const extPart = dot > 0 && out.length - dot <= 10 ? out.slice(dot) : "";
      out = out.slice(0, FILENAME_MAX - extPart.length) + extPart;
      out = out.slice(0, out.length - extPart.length).replace(/[. ]+$/g, "") + extPart;
    }
    if (!out) out = "file";
    if (isReservedName(out)) out = "_" + out;
    return out;
  }
  // Strict check for a name that arrives from elsewhere (service worker).
  function isSafeFilename(name) {
    return typeof name === "string" && name.length > 0 && name.length <= FILENAME_MAX &&
      !/^[. ]|[. ]$/.test(name) && !BAD_NAME_CHARS.test(name) && !isReservedName(name);
  }
  function isSafeDownloadPath(path) {
    if (typeof path !== "string" || path.length > 240) return false;
    const segments = path.split("/");
    return segments.length <= 6 && segments.every(isSafeFilename);
  }
  function buildFilename(username, code, index, ext, isCarousel, takenAt) {
    const suffix = isCarousel ? "_" + (index + 1) : "";
    const stamp = typeof takenAt === "number" && Number.isFinite(takenAt) && takenAt > 0 ? localStamp(takenAt) : "";
    const stem = stamp ? `${username}_${stamp}_${code}${suffix}` : `${username}_${code}${suffix}`;
    return safeFilename(`${stem}.${ext}`.replace(/[^\w.-]/g, "_"));
  }
  function pickAllMedia(item) {
    if (item && Array.isArray(item.carousel_media)) {
      return item.carousel_media.map((child, index) => {
        const picked = pickMedia(child);
        return picked.error ? { error: picked.error, index } : { url: picked.url, ext: picked.ext, kind: picked.kind, index };
      });
    }
    const picked = pickMedia(item);
    return [picked.error ? { error: picked.error, index: 0 } : { url: picked.url, ext: picked.ext, kind: picked.kind, index: 0 }];
  }
  const CdnURL = globalThis.URL;
  const uncurry = Function.prototype.bind.bind(Function.prototype.call);
  const match = uncurry(RegExp.prototype.exec);
  const endsWith = uncurry(String.prototype.endsWith);
  const urlGetter = key => {
    for (let proto = CdnURL?.prototype; proto; proto = Object.getPrototypeOf(proto)) {
      const get = Object.getOwnPropertyDescriptor(proto, key)?.get;
      if (get) return uncurry(get);
    }
  };
  const protocol = urlGetter("protocol"), hostname = urlGetter("hostname");
  const username = urlGetter("username"), password = urlGetter("password"), port = urlGetter("port");

  function isAllowedCdn(url) {
    if (typeof url !== "string" || !hostname || !match(/^https:\/\/[^\s\\]+$/i, url)) return false;
    try {
      const parsed = new CdnURL(url);
      const host = hostname(parsed);
      return protocol(parsed) === "https:" && !username(parsed) && !password(parsed) && !port(parsed) &&
        (endsWith(host, ".cdninstagram.com") || endsWith(host, ".fbcdn.net") ||
          host === "lookaside.fbsbx.com" || host === "media.fbsbx.com");
    } catch (_) { return false; }
  }
  // Direct messages: thread pages only; calls are excluded by the caller.
  function isDmPath(pathname) {
    return typeof pathname === "string" && /^\/direct\//.test(pathname);
  }
  // Avatars, stickers and small reactions stay below 120 px on either side.
  function isDmSized(width, height) {
    return Number(width) >= 120 && Number(height) >= 120;
  }
  function dmExt(kind, url) {
    if (kind === "video") return "mp4";
    try {
      const m = /\.(jpe?g|png|webp)$/i.exec(new URL(url).pathname);
      if (m) return m[1].toLowerCase() === "jpeg" ? "jpg" : m[1].toLowerCase();
    } catch (_) {}
    return "jpg";
  }
  function buildDmFilename(unixSeconds, ext) {
    const stamp = localStamp(unixSeconds);
    const safe = /^[a-z0-9]{2,4}$/i.test(ext) ? ext.toLowerCase() : "jpg";
    return safeFilename("dm_" + (stamp || "unknown") + "." + safe);
  }
  function buildFrameFilename(username, code, index, carousel, takenAt, seconds) {
    const suffix = "_frame_" + Math.max(0, Math.round((Number(seconds) || 0) * 1000)) + "ms.png";
    return safeFilename(buildFilename(username, code, index, "png", carousel, takenAt).slice(0, -4).slice(0, FILENAME_MAX - suffix.length) + suffix);
  }
  function isFramePng(url) {
    return typeof url === "string" && url.length <= 8 * 1024 * 1024 &&
      /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(url);
  }
  function reelWrapped(previous, current, duration) {
    return Number.isFinite(duration) && duration > 0 && previous >= duration - Math.min(1, duration / 4) && current < Math.min(1, duration / 4) && previous - current > duration / 2;
  }

  const RESERVED_PATHS = new Set([
    "explore", "direct", "stories", "reels", "reel", "p", "tv", "accounts",
    "about", "legal", "privacy", "safety", "press", "api", "graphql",
    "developer", "challenge", "archive", "your_activity", "settings",
    "notifications", "emails", "web", "oauth", "directory", "topics", "locations",
    "create", "nametag", "session", "login", "signup", "terms", "help", "lite",
    "ads", "business", "threads", "developers", "download", "static"
  ]);
  const AVATAR_MARKER = /"hd_profile_pic_url_info"\s*:\s*\{|"hd_profile_pic_versions"\s*:\s*\[|"profile_pic_url_hd"\s*:\s*"https:/;
  const NESTED_CAP = 1024 * 1024;
  const XSSI = "for (;;);";

  function isValidUsername(username) {
    if (typeof username !== "string") return false;
    const trimmed = username.trim();
    return /^[A-Za-z0-9._]{1,30}$/.test(trimmed) && !/^\.+$/.test(trimmed) &&
      !RESERVED_PATHS.has(trimmed.toLowerCase());
  }

  function profileUsernameFromPath(pathname) {
    if (typeof pathname !== "string" || !pathname) return null;
    let clean = pathname;
    if (/^https?:\/\//i.test(clean)) {
      try {
        const parsed = new URL(clean);
        if (!/(?:^|\.)instagram\.com$/i.test(parsed.hostname)) return null;
        clean = parsed.pathname;
      } catch (_) { return null; }
    }
    clean = clean.split(/[?#]/)[0];
    const match = /^\/([A-Za-z0-9._]{1,30})(?:\/(?:(reels|tagged|saved|channel|guides|followers|following)\/?)?)?$/.exec(clean);
    if (!match) return null;
    return isValidUsername(match[1]) ? match[1] : null;
  }

  function localDateStamp(value) {
    if (value === undefined || value === null) value = new Date();
    if (typeof value === "string") {
      const cleaned = value.trim().replace(/[^\w-]/g, "_");
      return /^\d{4}-\d{2}-\d{2}$/.test(cleaned) ? cleaned : "";
    }
    let date = null;
    if (value instanceof Date) {
      date = value;
    } else if (typeof value === "number" && Number.isFinite(value) && value > 0 && value < 1e16) {
      date = new Date(value < 1e11 ? value * 1000 : value);
    }
    if (!date || Number.isNaN(date.getTime())) return "";
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return date.getFullYear() + "-" + (month < 10 ? "0" : "") + month + "-" + (day < 10 ? "0" : "") + day;
  }

  function buildAvatarFilename(username, date, ext = "jpg") {
    if (!isValidUsername(username)) return null;
    const cleanExt = typeof ext === "string" && /^[a-z0-9]{2,4}$/i.test(ext) ? ext.toLowerCase() : "jpg";
    const rawUser = typeof username === "string" ? username.trim() : "";
    const safeUser = rawUser.replace(/[^\w.-]/g, "_").replace(/^\.+|\.+$/g, "") || "user";
    const stamp = localDateStamp(date);
    const tail = (stamp ? "_profile_" + stamp : "_profile") + "." + cleanExt;
    const maxUser = Math.max(1, 150 - tail.length);
    return safeFilename((safeUser.slice(0, maxUser) + tail).replace(/[^\w.-]/g, "_"));
  }

  function inferUrlDimensions(url) {
    const match = /[/_=-]s(\d{2,5})x(\d{2,5})(?:[/_&?.]|$)/i.exec(url);
    return match ? { width: Number(match[1]), height: Number(match[2]) } : { width: 0, height: 0 };
  }

  function scoreAvatarCandidate(url, rawWidth, rawHeight, hd, priority) {
    if (!isAllowedCdn(url)) return null;
    let width = Number(rawWidth);
    let height = Number(rawHeight);
    if (!(Number.isFinite(width) && width > 0)) width = 0;
    if (!(Number.isFinite(height) && height > 0)) height = 0;
    if (width === 0 || height === 0) {
      const inferred = inferUrlDimensions(url);
      width = inferred.width;
      height = inferred.height;
    }
    return { url, width, height, area: width * height, hd: !!hd, priority };
  }

  function betterAvatar(cand, best) {
    if (!cand) return best;
    if (!best) return cand;
    if (cand.area !== best.area) return cand.area > best.area ? cand : best;
    if (cand.hd !== best.hd) return cand.hd ? cand : best;
    if (cand.width !== best.width) return cand.width > best.width ? cand : best;
    if (cand.priority !== best.priority) return cand.priority > best.priority ? cand : best;
    return best;
  }

  function pickAvatar(user) {
    if (!user || typeof user !== "object" || Array.isArray(user)) return null;
    if (!user.hd_profile_pic_url_info && !user.hd_profile_pic_versions &&
        !user.profile_pic_url_hd && !user.hd_profile_pic_info &&
        !user.profile_pic_info && !user.profile_pic_url) {
      if (user.user && typeof user.user === "object") user = user.user;
      else if (user.data && user.data.user && typeof user.data.user === "object") user = user.data.user;
    }
    let best = null;
    const info = user.hd_profile_pic_url_info;
    if (info && typeof info === "object" && !Array.isArray(info)) {
      best = betterAvatar(scoreAvatarCandidate(info.url, info.width, info.height, true, 4), best);
    } else if (typeof info === "string") {
      best = betterAvatar(scoreAvatarCandidate(info, 0, 0, true, 4), best);
    }
    const versions = user.hd_profile_pic_versions;
    if (Array.isArray(versions)) {
      for (let i = 0; i < versions.length; i++) {
        const entry = versions[i];
        if (entry && typeof entry === "object") {
          best = betterAvatar(scoreAvatarCandidate(entry.url, entry.width, entry.height, true, 3), best);
        } else if (typeof entry === "string") {
          best = betterAvatar(scoreAvatarCandidate(entry, 0, 0, true, 3), best);
        }
      }
    }
    const hdUrl = user.profile_pic_url_hd;
    if (typeof hdUrl === "string") {
      best = betterAvatar(scoreAvatarCandidate(hdUrl, 0, 0, true, 2), best);
    } else if (hdUrl && typeof hdUrl === "object") {
      best = betterAvatar(scoreAvatarCandidate(hdUrl.url, hdUrl.width, hdUrl.height, true, 2), best);
    }
    for (const alt of [user.hd_profile_pic_info, user.profile_pic_info]) {
      if (alt && typeof alt === "object" && !Array.isArray(alt)) {
        best = betterAvatar(scoreAvatarCandidate(alt.url, alt.width, alt.height, true, 2), best);
      }
    }
    if (typeof user.profile_pic_url === "string") {
      best = betterAvatar(scoreAvatarCandidate(user.profile_pic_url, 0, 0, false, 1), best);
    }
    return best ? { url: best.url, width: best.width, height: best.height, hd: best.hd } : null;
  }

  function pickAvatarUrl(user) {
    const picked = pickAvatar(user);
    return picked ? picked.url : null;
  }

  function pickSrcsetUrl(srcset) {
    if (typeof srcset !== "string" || !srcset.trim()) return null;
    const entries = srcset.split(/,(?=\s|https?:\/\/)/i);
    let best = null;
    for (let i = 0; i < entries.length; i++) {
      const parts = entries[i].trim().split(/\s+/);
      if (parts.length > 2) continue;
      const url = parts[0];
      if (!isAllowedCdn(url)) continue;
      const desc = parts[1] || "";
      let kind = 0;
      let val = 1;
      const wMatch = /^(\d+(?:\.\d+)?)w$/i.exec(desc);
      const xMatch = !wMatch && /^(\d+(?:\.\d+)?)x$/i.exec(desc);
      if (wMatch) {
        kind = 2;
        val = parseFloat(wMatch[1]);
      } else if (xMatch) {
        kind = 1;
        val = parseFloat(xMatch[1]);
      } else {
        if (desc) continue;
        const inferred = inferUrlDimensions(url);
        if (inferred.width > 0) {
          kind = 2;
          val = inferred.width;
        }
      }
      if (!best || kind > best.kind || (kind === best.kind && val > best.val)) {
        best = { url, kind, val };
      }
    }
    return best ? best.url : null;
  }

  function hasAvatarMarker(text) {
    return typeof text === "string" && text.length <= NESTED_CAP && AVATAR_MARKER.test(text);
  }

  function hasAvatarBootstrapMarker(text) {
    return typeof text === "string" && text.length <= NESTED_CAP &&
      (text.includes("hd_profile_pic") || text.includes("profile_pic_url_hd")) &&
      AVATAR_MARKER.test(text.replace(/\\"/g, '"'));
  }

  function extractAvatars(input, fallbackUsername, bootstrap = false) {
    const byUser = new Map();
    let budget = 8000;
    const cleanFallback = isValidUsername(fallbackUsername) ? fallbackUsername.trim() : null;

    function record(username, cand) {
      if (!isValidUsername(username) || !cand) return;
      const trimmed = username.trim();
      const key = trimmed.toLowerCase();
      const prev = byUser.get(key);
      const area = (cand.width || 0) * (cand.height || 0);
      if (!prev || area > prev.area) {
        byUser.set(key, { username: trimmed, url: cand.url, width: cand.width, height: cand.height, area, hd: cand.hd });
      }
    }

    function walk(node, depth, allowFallback) {
      if (depth > 18 || --budget < 0) return;
      if (bootstrap && typeof node === "string" && hasAvatarBootstrapMarker(node)) {
        try { walk(JSON.parse(node), depth + 1, false); } catch (_) {}
        return;
      }
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) walk(node[i], depth + 1, false);
        return;
      }
      if (node.hd_profile_pic_url_info || node.hd_profile_pic_versions ||
          node.profile_pic_url_hd || node.hd_profile_pic_info || node.profile_pic_info) {
        const picked = pickAvatar(node);
        if (picked) {
          const uname = isValidUsername(node.username) ? node.username
            : (node.user && isValidUsername(node.user.username) ? node.user.username
              : (allowFallback ? cleanFallback : null));
          if (uname) record(uname, picked);
        }
      }
      const keys = Object.keys(node);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const value = node[key];
        if (bootstrap && typeof value === "string" && value.length <= NESTED_CAP && hasAvatarMarker(value)) {
          try { walk(JSON.parse(value), depth + 1, allowFallback); } catch (_) {}
        } else if (value && typeof value === "object") {
          const childFallback = allowFallback && (key === "data" || key === "user" || key === "result");
          walk(value, depth + 1, childFallback);
        }
      }
    }

    if (typeof input === "string") {
      if (!hasAvatarMarker(input) && !(bootstrap && hasAvatarBootstrapMarker(input))) return [];
      const body = input.startsWith(XSSI) ? input.slice(XSSI.length) : input;
      try {
        walk(JSON.parse(body), 0, true);
      } catch (_) {
        if (body.includes("\n")) {
          const lines = body.split("\n");
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line || !hasAvatarMarker(line)) continue;
            try { walk(JSON.parse(line), 0, true); } catch (_) {}
          }
        }
      }
    } else if (input && typeof input === "object") {
      walk(input, 0, true);
    }

    return Array.from(byUser.values(), entry => ({
      username: entry.username,
      url: entry.url,
      width: entry.width,
      height: entry.height,
      hd: entry.hd
    }));
  }

  function buildAvatarMessage(username, url, area = 0) {
    if (!isValidUsername(username) || !isAllowedCdn(url) || !Number.isFinite(area) || area < 0) return null;
    return { type: "iy:avatar", username: username.trim(), url, area };
  }

  function isValidAvatarMessage(msg) {
    return Boolean(
      msg && typeof msg === "object" && !Array.isArray(msg) &&
      msg.type === "iy:avatar" &&
      isValidUsername(msg.username) &&
      isAllowedCdn(msg.url) && Number.isFinite(msg.area) && msg.area >= 0
    );
  }

  // "Follows you" flag (I2); ISOLATED copy of the MAIN-world helpers in rules.js.
  // followed_by_viewer is the opposite direction and is never read.
  function pickFollowsYou(user) {
    if (!user || typeof user !== "object" || Array.isArray(user)) return null;
    const status = user.friendship_status;
    if (status && typeof status === "object" && !Array.isArray(status) && typeof status.followed_by === "boolean") return status.followed_by;
    if (typeof user.follows_viewer === "boolean") return user.follows_viewer;
    return null;
  }
  function buildFollowsMessage(username, follows) {
    if (!isValidUsername(username) || typeof follows !== "boolean") return null;
    return { type: "iy:follows", username: username.trim(), follows };
  }
  function isValidFollowsMessage(msg) {
    return Boolean(
      msg && typeof msg === "object" && !Array.isArray(msg) && Object.keys(msg).length === 3 &&
      msg.type === "iy:follows" && isValidUsername(msg.username) && typeof msg.follows === "boolean"
    );
  }
  // Instagram's own "Follows you" label in the header [Tahmin: EN/TR wording].
  const FOLLOWS_LABELS = ["follows you", "seni takip ediyor"];
  function isFollowsYouLabel(text) {
    if (typeof text !== "string" || text.length > 40) return false;
    const clean = text.trim().replace(/\s+/g, " ");
    // Turkish folding ("SENİ" -> "seni") and plain folding ("SENI" -> "seni") are both accepted.
    return FOLLOWS_LABELS.includes(clean.toLocaleLowerCase("tr")) || FOLLOWS_LABELS.includes(clean.toLowerCase());
  }

  const API = {
    pickFollowsYou, buildFollowsMessage, isValidFollowsMessage, isFollowsYouLabel,
    pickMedia, pickAllMedia, buildFilename, safeFilename, isSafeFilename, isSafeDownloadPath, buildFrameFilename, isFramePng, reelWrapped,
    MP3_ORIGINS, isAllowedCdn, isDmPath, isDmSized, dmExt, buildDmFilename,
    isValidUsername, profileUsernameFromPath, buildAvatarFilename,
    pickAvatar, pickAvatarUrl, pickSrcsetUrl,
    hasAvatarMarker, hasAvatarBootstrapMarker, extractAvatars,
    buildAvatarMessage, isValidAvatarMessage
  };
  if (typeof module !== "undefined") module.exports = API; else globalThis.IY = Object.assign(globalThis.IY || {}, API);
})();
