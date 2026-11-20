(function () {
  "use strict";
  // MAIN world: page scripts run after document_start and may patch built-ins.
  // Capture everything the security-relevant paths rely on once, up front, and
  // use only these copies. RegExp internals (exec/Symbol.*) cannot be captured
  // this way and stay a documented residual.
  const uncurry = Function.prototype.bind.bind(Function.prototype.call);
  const instanceOf = uncurry(Function.prototype[Symbol.hasInstance]);
  const regexExec = uncurry(RegExp.prototype.exec);
  const JSONparse = JSON.parse;
  const decodeUri = decodeURIComponent;
  const hasOwn = Object.hasOwn;
  const isArray = Array.isArray;
  const objectKeys = Object.keys;
  const numberIsFinite = Number.isFinite;
  const URLCtor = URL;
  const strIncludes = uncurry(String.prototype.includes);
  const strIndexOf = uncurry(String.prototype.indexOf);
  const strCharCode = uncurry(String.prototype.charCodeAt);
  const fromCharCode = String.fromCharCode;
  const strStartsWith = uncurry(String.prototype.startsWith);
  const strEndsWith = uncurry(String.prototype.endsWith);
  const strSlice = uncurry(String.prototype.slice);
  const strSplit = uncurry(String.prototype.split);
  const strTrim = uncurry(String.prototype.trim);
  const strLower = uncurry(String.prototype.toLowerCase);
  const strUpper = uncurry(String.prototype.toUpperCase);
  const strReplaceAll = uncurry(String.prototype.replaceAll);
  const strReplace = uncurry(String.prototype.replace);
  const urlGetter = name => uncurry(Object.getOwnPropertyDescriptor(URL.prototype, name).get);
  const urlProtocol = urlGetter("protocol");
  const urlUsername = urlGetter("username");
  const urlPassword = urlGetter("password");
  const urlPort = urlGetter("port");
  const urlHostname = urlGetter("hostname");
  const urlPathname = urlGetter("pathname");
  const urlSearch = urlGetter("search");
  const FRIENDLY_KEY = "fb_api_req_friendly_name=";

  function parseHttpUrl(url) {
    if (typeof url !== "string" || !url) return null;
    try {
      const parsed = new URLCtor(url, "https://www.instagram.com/");
      const proto = urlProtocol(parsed);
      return proto === "https:" || proto === "http:" ? parsed : null;
    } catch (_) { return null; }
  }
  function isPostMethod(method) {
    return method === undefined || (typeof method === "string" && strUpper(method) === "POST");
  }
  function isGraphqlPath(path) {
    return path === "/api/graphql" || strStartsWith(path, "/api/graphql/") ||
      path === "/graphql/query" || strStartsWith(path, "/graphql/query/");
  }
  function isGraphqlUrl(url) {
    const parsed = parseHttpUrl(url);
    return !!parsed && isGraphqlPath(urlPathname(parsed));
  }
  function isStorySeenRestPath(path) {
    const parts = strSplit(path, "/");
    const n = parts.length;
    const len = n > 0 && parts[n - 1] === "" ? n - 1 : n;
    if (parts[1] !== "api" || (parts[2] !== "v1" && parts[2] !== "v2")) return false;
    if (len === 6) return parts[3] === "stories" && parts[4] === "reel" && parts[5] === "seen";
    if (len === 5) return parts[3] === "media" && parts[4] === "seen";
    return false;
  }
  function dmRestThreadFromPath(path) {
    const parts = strSplit(path, "/");
    const n = parts.length;
    const len = n > 0 && parts[n - 1] === "" ? n - 1 : n;
    if (len !== 9) return null;
    return parts[1] === "api" && parts[2] === "v1" && parts[3] === "direct_v2" &&
      parts[4] === "threads" && parts[5].length > 0 && parts[6] === "items" &&
      parts[7].length > 0 && parts[8] === "seen" ? parts[5] : null;
  }
  function matchStoryFriendly(body) {
    let pos = strStartsWith(body, FRIENDLY_KEY) ? 0 : strIndexOf(body, "&" + FRIENDLY_KEY);
    while (pos >= 0) {
      const start = pos + (strCharCode(body, pos) === 38 ? 1 : 0) + FRIENDLY_KEY.length;
      const amp = strIndexOf(body, "&", start);
      const end = amp < 0 ? body.length : amp;
      if (end > start) {
        let name = strSlice(body, start, end);
        if (strIndexOf(name, "%") >= 0) {
          try { name = decodeUri(name); } catch (_) {}
        }
        name = strLower(name);
        if (strIndexOf(name, "seen") >= 0 && (strIndexOf(name, "story") >= 0 ||
            strIndexOf(name, "stories") >= 0 || strIndexOf(name, "reel") >= 0)) return true;
      }
      if (amp < 0) break;
      pos = strIndexOf(body, "&" + FRIENDLY_KEY, amp);
    }
    return false;
  }
  function matchStoryText(text, isQueryEndpoint) {
    if (typeof text !== "string" || !text) return false;
    if (strIncludes(text, "PolarisStoriesV3SeenMutation") ||
        strIncludes(text, "usePolarisStoriesV3SeenMutation") ||
        strIncludes(text, "PolarisStoriesV3SeenDirectMutation") ||
        strIncludes(text, "PolarisAPIReelSeenMutation") ||
        (isQueryEndpoint && strIncludes(text, "viewSeenAt"))) return true;
    return matchStoryFriendly(text);
  }
  // Matches story-seen requests over GraphQL or REST (method POST).
  // Note: ghostStoryMatch(url, body, method) may take a REST seen URL with any body
  // (e.g. FormData, URLSearchParams, string, or null), whereas GraphQL URLs check
  // query parameters and string bodies.
  function ghostStoryMatch(url, body, method) {
    if (typeof url !== "string" || !isPostMethod(method)) return false;
    const parsed = parseHttpUrl(url);
    if (!parsed) return false;
    const path = urlPathname(parsed);
    if (isStorySeenRestPath(path)) return true;
    if (!isGraphqlPath(path)) return false;
    const isQueryEndpoint = path === "/graphql/query" || strStartsWith(path, "/graphql/query/");
    const search = urlSearch(parsed);
    if (search.length > 1 && matchStoryText(strSlice(search, 1), isQueryEndpoint)) return true;
    return matchStoryText(body, isQueryEndpoint);
  }
  function matchDmText(text) {
    if (typeof text !== "string" || !text) return false;
    if (strIncludes(text, "IGDMarkThreadAsRead") ||
        strIncludes(text, "IGDThreadReadStateMutation")) return true;
    let pos = strStartsWith(text, FRIENDLY_KEY) ? 0 : strIndexOf(text, "&" + FRIENDLY_KEY);
    while (pos >= 0) {
      const start = pos + (strCharCode(text, pos) === 38 ? 1 : 0) + FRIENDLY_KEY.length;
      const amp = strIndexOf(text, "&", start);
      const end = amp < 0 ? text.length : amp;
      if (end > start) {
        let name = strSlice(text, start, end);
        if (strIndexOf(name, "%") >= 0) {
          try { name = decodeUri(name); } catch (_) {}
        }
        if (strIncludes(name, "IGDMarkThreadAsRead") ||
            strIncludes(name, "IGDThreadReadStateMutation")) return true;
      }
      if (amp < 0) break;
      pos = strIndexOf(text, "&" + FRIENDLY_KEY, amp);
    }
    return false;
  }
  // Matches DM read-receipt requests over GraphQL or REST (method POST).
  // REST /api/v1/direct_v2/threads/<id>/items/<id>/seen/ matches with any body.
  function ghostDmHttpMatch(url, body, method) {
    if (typeof url !== "string" || !isPostMethod(method)) return false;
    const parsed = parseHttpUrl(url);
    if (!parsed) return false;
    const path = urlPathname(parsed);
    if (dmRestThreadFromPath(path) !== null) return true;
    if (!isGraphqlPath(path)) return false;
    const search = urlSearch(parsed);
    if (search.length > 1 && matchDmText(strSlice(search, 1))) return true;
    return matchDmText(body);
  }
  // Analytics blocking (off by default, adapted from Glassgram): matches Instagram's
  // own logging endpoints on www.instagram.com and graph.instagram.com.
  function analyticsMatch(url) {
    if (typeof url !== "string" || !url) return false;
    try {
      const parsed = new URLCtor(url, "https://www.instagram.com/");
      if (urlProtocol(parsed) !== "https:" || urlUsername(parsed) || urlPassword(parsed) || urlPort(parsed)) return false;
      const host = strLower(urlHostname(parsed));
      const path = urlPathname(parsed);
      if (host === "www.instagram.com") {
        return path === "/ajax/bz" || strStartsWith(path, "/ajax/bz/") ||
          strStartsWith(path, "/ajax/qm/") || strStartsWith(path, "/logging/");
      }
      if (host === "graph.instagram.com") {
        return path === "/logging_client_events" || strStartsWith(path, "/logging_client_events/");
      }
      return false;
    } catch (_) { return false; }
  }
  // Lightspeed/MQTT DM WebSocket endpoints (adapted from Glassgram).
  function lightspeedSocketUrl(url) {
    if (typeof url !== "string" || !url) return false;
    try {
      const parsed = new URLCtor(url);
      if (urlProtocol(parsed) !== "wss:" || urlUsername(parsed) || urlPassword(parsed) || urlPort(parsed)) return false;
      const host = strLower(urlHostname(parsed));
      const path = urlPathname(parsed);
      if (host === "edge-chat.instagram.com") return true;
      if (host === "instagram.com" || strEndsWith(host, ".instagram.com")) {
        return path === "/ws/lightspeed" || strStartsWith(path, "/ws/lightspeed/");
      }
      return false;
    } catch (_) { return false; }
  }
  function wsReadReceipt(text) {
    if (typeof text !== "string" || !strIncludes(text, "last_read_watermark_ts")) return "pass";
    // Only "one label or fewer" matters: two `"label"` keys mean a batched frame.
    return countKey(text, '"label"', 2) >= 2 ? "leak" : "drop";
  }

  // Ghost typing: every protocol name here is inferred [Tahmin], not live-verified.
  // REST: /api/v1/direct_v2/threads/<id>/activity/; WS: edge-chat.instagram.com/chat.
  // Fields: thread_id, action, typing, is_typing, activity_status. Actions/topics:
  // typing, indicate_activity, /typing, /indicate_activity; envelope: topic, payload.
  // Exact allowlists intentionally reject batches, message/reaction/read fields and
  // unknown metadata rather than suppressing a whole mixed operation.
  const TYPING_CAP = 8192;
  function typingHttpThread(url, method) {
    if (typeof url !== "string" || !isPostMethod(method)) return null;
    try {
      const parsed = new URLCtor(url, "https://www.instagram.com/");
      const host = urlHostname(parsed);
      if (urlProtocol(parsed) !== "https:" || urlUsername(parsed) || urlPassword(parsed) || urlPort(parsed) ||
          (host !== "instagram.com" && !strEndsWith(host, ".instagram.com"))) return null;
      const parts = strSplit(urlPathname(parsed), "/");
      if (parts.length !== 7 && !(parts.length === 8 && parts[7] === "")) return null;
      return parts[1] === "api" && parts[2] === "v1" && parts[3] === "direct_v2" &&
        parts[4] === "threads" && validThreadId(parts[5]) && parts[6] === "activity" ? parts[5] : null;
    } catch (_) { return null; }
  }
  function typingSocketUrl(url) {
    if (typeof url !== "string") return false;
    try {
      const parsed = new URLCtor(url);
      return urlProtocol(parsed) === "wss:" && urlHostname(parsed) === "edge-chat.instagram.com" &&
        !urlUsername(parsed) && !urlPassword(parsed) && !urlPort(parsed) && urlPathname(parsed) === "/chat";
    } catch (_) { return false; }
  }
  function typingRecord(node, thread, form) {
    if (!node || typeof node !== "object" || isArray(node)) return false;
    const keys = objectKeys(node);
    if (!keys.length || keys.length > 5) return false;
    let signal = false;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i], value = node[key];
      if (key === "thread_id") {
        if (!validThreadId(value) || (thread && value !== thread)) return false;
      } else if (key === "action") {
        if (value !== "typing" && value !== "indicate_activity") return false;
      } else if (key === "typing" || key === "is_typing") {
        if (typeof value !== "boolean" && !(form && (value === "true" || value === "false"))) return false;
        signal = true;
      } else if (key === "activity_status") {
        if (value !== 0 && value !== 1 && !(form && (value === "0" || value === "1"))) return false;
        signal = true;
      } else return false;
    }
    return signal && (!!thread || hasOwn(node, "thread_id"));
  }
  function parseTypingJson(text) {
    if (typeof text !== "string" || !text.length || text.length > TYPING_CAP) return null;
    try {
      // Reject duplicate keys, including escaped spellings, before JSON.parse can
      // hide an earlier message action. Repeated keys across objects also fail open.
      const seen = { __proto__: null };
      for (let i = 0; i < text.length; i++) {
        if (strCharCode(text, i) !== 34) continue;
        const start = i++;
        for (; i < text.length; i++) {
          const code = strCharCode(text, i);
          if (code === 92) i++;
          else if (code === 34) break;
        }
        let next = i + 1;
        while (isSpaceCode(strCharCode(text, next))) next++;
        if (strCharCode(text, next) !== 58) continue;
        const key = JSONparse(strSlice(text, start, i + 1));
        if (hasOwn(seen, key)) return null;
        seen[key] = true;
      }
      return JSONparse(text);
    } catch (_) { return null; }
  }
  function ghostTypingHttpMatch(url, body, method) {
    const thread = typingHttpThread(url, method);
    if (!thread || typeof body !== "string" || !body.length || body.length > TYPING_CAP) return false;
    const json = parseTypingJson(body);
    if (json !== null) return typingRecord(json, thread, false);
    // Form-encoded fallback; repeated/unknown fields and malformed escapes fail open.
    const parts = strSplit(body, "&"), node = { __proto__: null };
    if (parts.length > 5) return false;
    try {
      for (let i = 0; i < parts.length; i++) {
        const at = strIndexOf(parts[i], "=");
        if (at < 1) return false;
        const key = decodeUri(strReplaceAll(strSlice(parts[i], 0, at), "+", " "));
        const value = decodeUri(strReplaceAll(strSlice(parts[i], at + 1), "+", " "));
        if (hasOwn(node, key)) return false;
        node[key] = value;
      }
      return typingRecord(node, thread, true);
    } catch (_) { return false; }
  }
  function wsTypingFrame(text, topic) {
    if (topic !== undefined && topic !== "/typing" && topic !== "/indicate_activity") return false;
    let node = parseTypingJson(text);
    if (topic === undefined && node && hasOwn(node, "topic")) {
      if (objectKeys(node).length !== 2 || !hasOwn(node, "payload") ||
          (node.topic !== "/typing" && node.topic !== "/indicate_activity")) return false;
      node = typeof node.payload === "string" ? parseTypingJson(node.payload) : node.payload;
    }
    return typingRecord(node, null, false);
  }

  // Thread id extraction for the one-shot "mark as read" allowance. A receipt only
  // passes when exactly one valid thread id is found and it equals the allowed one.
  // Field names below are [Tahmin]: Instagram's internal payload keys are unverified.
  // The body scan is hand written (indexOf + charCodeAt on captured built-ins) so a page
  // that patches RegExp, RegExp.prototype.exec/source or decodeURIComponent cannot steer it.
  const DM_PATH_PREFIX = "/direct/t/";
  const THREAD_FIELD_NEEDLES = ['"thread_id"', '"thread_fbid"', '"thread_key"', '"threadKey"',
    '"threadId"', '"thread_v2_id"', '"thread_igid"'];
  function isDigitCode(c) { return c >= 48 && c <= 57; }
  function isSpaceCode(c) { return c === 32 || (c >= 9 && c <= 13); }
  function hexValue(c) {
    if (c >= 48 && c <= 57) return c - 48;
    if (c >= 65 && c <= 70) return c - 55;
    if (c >= 97 && c <= 102) return c - 87;
    return -1;
  }
  // Counts `"key"\s*:` occurrences, stopping at limit.
  function countKey(text, needle, limit) {
    let count = 0;
    for (let i = strIndexOf(text, needle); i !== -1; i = strIndexOf(text, needle, i + needle.length)) {
      let j = i + needle.length;
      while (isSpaceCode(strCharCode(text, j))) j++;
      if (strCharCode(text, j) === 58 && ++count >= limit) return count;
    }
    return count;
  }
  function validThreadId(id) {
    if (typeof id !== "string") return false;
    const n = id.length;
    if (n < 5 || n > 25) return false;
    for (let i = 0; i < n; i++) if (!isDigitCode(strCharCode(id, i))) return false;
    return true;
  }
  function threadIdFromPath(pathname) {
    if (typeof pathname !== "string") return null;
    let end = pathname.length;
    const q = strIndexOf(pathname, "?");
    const h = strIndexOf(pathname, "#");
    if (q !== -1 && q < end) end = q;
    if (h !== -1 && h < end) end = h;
    let path = strSlice(pathname, 0, end);
    if (!strStartsWith(path, DM_PATH_PREFIX)) return null;
    path = strSlice(path, DM_PATH_PREFIX.length);
    if (strEndsWith(path, "/")) path = strSlice(path, 0, path.length - 1);
    return validThreadId(path) ? path : null;
  }
  // Tolerant, per-occurrence decoding: never throws. "%XX" below 0x80 is decoded; a
  // malformed escape returns null (caller blocks). Then \" becomes ".
  function normalizeBody(text) {
    let out = text;
    if (strIncludes(out, "%22")) {
      let res = "";
      let last = 0;
      for (let i = strIndexOf(out, "%"); i !== -1; i = strIndexOf(out, "%", last)) {
        const hi = hexValue(strCharCode(out, i + 1));
        const lo = hexValue(strCharCode(out, i + 2));
        if (hi < 0 || lo < 0) return null;
        const code = hi * 16 + lo;
        res += strSlice(out, last, i) + (code < 128 ? fromCharCode(code) : strSlice(out, i, i + 3));
        last = i + 3;
      }
      out = res + strSlice(out, last);
    }
    if (strIncludes(out, '\\"')) {
      let res = "";
      let last = 0;
      for (let i = strIndexOf(out, '\\"'); i !== -1; i = strIndexOf(out, '\\"', last)) {
        res += strSlice(out, last, i);
        last = i + 1;
      }
      out = res + strSlice(out, last);
    }
    return out;
  }
  // Single distinct thread id found in a receipt body/frame, else null.
  function dmTextThreadId(text) {
    if (typeof text !== "string" || text.length > 262144) return null;
    const clean = normalizeBody(text);
    if (clean === null) return null;
    let found = null;
    for (let f = 0; f < THREAD_FIELD_NEEDLES.length; f++) {
      const needle = THREAD_FIELD_NEEDLES[f];
      for (let i = strIndexOf(clean, needle); i !== -1; i = strIndexOf(clean, needle, i + needle.length)) {
        let j = i + needle.length;
        while (isSpaceCode(strCharCode(clean, j))) j++;
        if (strCharCode(clean, j) !== 58) continue;
        j++;
        while (isSpaceCode(strCharCode(clean, j))) j++;
        if (strCharCode(clean, j) === 34) j++;
        let k = j;
        while (isDigitCode(strCharCode(clean, k))) k++;
        const len = k - j;
        if (len < 5) continue;
        if (len > 25) return null;
        const id = strSlice(clean, j, k);
        if (found === null) found = id;
        else if (found !== id) return null;
      }
    }
    return found;
  }
  function dmThreadId(url, body) {
    if (typeof url !== "string") return null;
    const parsed = parseHttpUrl(url);
    if (parsed) {
      const rest = dmRestThreadFromPath(urlPathname(parsed));
      if (rest !== null) return validThreadId(rest) ? rest : null;
    }
    return dmTextThreadId(body);
  }

  const RESERVED_LIST = [
    "explore", "direct", "stories", "reels", "reel", "p", "tv", "accounts",
    "about", "legal", "privacy", "safety", "press", "api", "graphql",
    "developer", "challenge", "archive", "your_activity", "settings",
    "notifications", "emails", "web", "oauth", "directory", "topics", "locations",
    "create", "nametag", "session", "login", "signup", "terms", "help", "lite",
    "ads", "business", "threads", "developers", "download", "static"
  ];
  const RESERVED_PATHS = { __proto__: null };
  for (let i = 0; i < RESERVED_LIST.length; i++) RESERVED_PATHS[RESERVED_LIST[i]] = true;
  const AVATAR_MARKER = /"hd_profile_pic_url_info"\s*:\s*\{|"hd_profile_pic_versions"\s*:\s*\[|"profile_pic_url_hd"\s*:\s*"https:/;
  const NESTED_CAP = 1024 * 1024;
  const XSSI = "for (;;);";

  const isAllowedCdn = (typeof module !== "undefined" && module.exports
    ? require("./media.js") : globalThis.IY).isAllowedCdn;

  function isValidUsername(username) {
    if (typeof username !== "string") return false;
    const trimmed = strTrim(username);
    return /^[A-Za-z0-9._]{1,30}$/.test(trimmed) && !/^\.+$/.test(trimmed) &&
      !RESERVED_PATHS[strLower(trimmed)] === true;
  }

  function profileUsernameFromPath(pathname) {
    if (typeof pathname !== "string" || !pathname) return null;
    let clean = pathname;
    if (/^https?:\/\//i.test(clean)) {
      try {
        const parsed = new URLCtor(clean);
        if (!/(?:^|\.)instagram\.com$/i.test(urlHostname(parsed))) return null;
        clean = urlPathname(parsed);
      } catch (_) { return null; }
    }
    clean = strSplit(clean, /[?#]/)[0];
    const match = /^\/([A-Za-z0-9._]{1,30})(?:\/(?:(reels|tagged|saved|channel|guides|followers|following)\/?)?)?$/.exec(clean);
    if (!match) return null;
    return isValidUsername(match[1]) ? match[1] : null;
  }

  function inferUrlDimensions(url) {
    const match = /[/_=-]s(\d{2,5})x(\d{2,5})(?:[/_&?.]|$)/i.exec(url);
    return match ? { width: Number(match[1]), height: Number(match[2]) } : { width: 0, height: 0 };
  }

  function scoreAvatarCandidate(url, rawWidth, rawHeight, hd, priority) {
    if (!isAllowedCdn(url)) return null;
    let width = Number(rawWidth);
    let height = Number(rawHeight);
    if (!(numberIsFinite(width) && width > 0)) width = 0;
    if (!(numberIsFinite(height) && height > 0)) height = 0;
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
    if (!user || typeof user !== "object" || isArray(user)) return null;
    if (!user.hd_profile_pic_url_info && !user.hd_profile_pic_versions &&
        !user.profile_pic_url_hd && !user.hd_profile_pic_info &&
        !user.profile_pic_info && !user.profile_pic_url) {
      if (user.user && typeof user.user === "object") user = user.user;
      else if (user.data && user.data.user && typeof user.data.user === "object") user = user.data.user;
    }
    let best = null;
    const info = user.hd_profile_pic_url_info;
    if (info && typeof info === "object" && !isArray(info)) {
      best = betterAvatar(scoreAvatarCandidate(info.url, info.width, info.height, true, 4), best);
    } else if (typeof info === "string") {
      best = betterAvatar(scoreAvatarCandidate(info, 0, 0, true, 4), best);
    }
    const versions = user.hd_profile_pic_versions;
    if (isArray(versions)) {
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
    const alts = [user.hd_profile_pic_info, user.profile_pic_info];
    for (let ai = 0; ai < alts.length; ai++) {
      const alt = alts[ai];
      if (alt && typeof alt === "object" && !isArray(alt)) {
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

  function hasAvatarMarker(text) {
    return typeof text === "string" && text.length <= NESTED_CAP && AVATAR_MARKER.test(text);
  }

  function hasAvatarBootstrapMarker(text) {
    return typeof text === "string" && text.length <= NESTED_CAP &&
      (strIncludes(text, "hd_profile_pic") || strIncludes(text, "profile_pic_url_hd")) &&
      AVATAR_MARKER.test(strReplace(text, /\\"/g, '"'));
  }

  function extractAvatars(input, fallbackUsername, bootstrap = false) {
    const byUser = { __proto__: null };
    const order = [];
    let budget = 8000;
    const cleanFallback = isValidUsername(fallbackUsername) ? strTrim(fallbackUsername) : null;

    function record(username, cand) {
      if (!isValidUsername(username) || !cand) return;
      const trimmed = strTrim(username);
      const key = strLower(trimmed);
      const prev = byUser[key];
      const area = (cand.width || 0) * (cand.height || 0);
      if (!prev || area > prev.area) {
        if (!prev) order[order.length] = key;
        byUser[key] = { username: trimmed, url: cand.url, width: cand.width, height: cand.height, area, hd: cand.hd };
      }
    }

    function walk(node, depth, allowFallback) {
      if (depth > 18 || --budget < 0) return;
      if (bootstrap && typeof node === "string" && hasAvatarBootstrapMarker(node)) {
        try { walk(JSONparse(node), depth + 1, false); } catch (_) {}
        return;
      }
      if (!node || typeof node !== "object") return;
      if (isArray(node)) {
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
      const keys = objectKeys(node);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const value = node[key];
        if (bootstrap && typeof value === "string" && value.length <= NESTED_CAP && hasAvatarMarker(value)) {
          try { walk(JSONparse(value), depth + 1, allowFallback); } catch (_) {}
        } else if (value && typeof value === "object") {
          const childFallback = allowFallback && (key === "data" || key === "user" || key === "result");
          walk(value, depth + 1, childFallback);
        }
      }
    }

    if (typeof input === "string") {
      if (!hasAvatarMarker(input) && !(bootstrap && hasAvatarBootstrapMarker(input))) return [];
      const body = strStartsWith(input, XSSI) ? strSlice(input, XSSI.length) : input;
      try {
        walk(JSONparse(body), 0, true);
      } catch (_) {
        if (strIncludes(body, "\n")) {
          const lines = strSplit(body, "\n");
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line || !hasAvatarMarker(line)) continue;
            try { walk(JSONparse(line), 0, true); } catch (_) {}
          }
        }
      }
    } else if (input && typeof input === "object") {
      walk(input, 0, true);
    }

    const out = [];
    for (let i = 0; i < order.length; i++) {
      const entry = byUser[order[i]];
      out[out.length] = { username: entry.username, url: entry.url, width: entry.width, height: entry.height, hd: entry.hd };
    }
    return out;
  }

  function buildAvatarMessage(username, url, area = 0) {
    if (!isValidUsername(username) || !isAllowedCdn(url) || !numberIsFinite(area) || area < 0) return null;
    return { type: "iy:avatar", username: strTrim(username), url, area };
  }

  function isValidAvatarMessage(msg) {
    return Boolean(
      msg && typeof msg === "object" && !isArray(msg) &&
      msg.type === "iy:avatar" &&
      isValidUsername(msg.username) &&
      isAllowedCdn(msg.url) && numberIsFinite(msg.area) && msg.area >= 0
    );
  }

  // "Follows you" flag (I2). friendship_status.followed_by and follows_viewer both mean
  // "this profile follows the viewer" [Tahmin: exact Polaris field names]. followed_by_viewer
  // is the opposite direction and is deliberately never read.
  const FOLLOWS_MARKER = /"(?:follows_viewer|followed_by)"\s*:\s*(?:true|false)/;
  function hasFollowsMarker(text) {
    return typeof text === "string" && text.length <= NESTED_CAP && FOLLOWS_MARKER.test(text);
  }
  // Bootstrap <script type="application/json"> text may carry the keys with escaped quotes.
  function hasFollowsBootstrapMarker(text) {
    return typeof text === "string" && text.length <= NESTED_CAP &&
      (strIncludes(text, "follows_viewer") || strIncludes(text, "followed_by")) &&
      FOLLOWS_MARKER.test(strReplace(text, /\\"/g, '"'));
  }
  function pickFollowsYou(user) {
    if (!user || typeof user !== "object" || isArray(user)) return null;
    const status = user.friendship_status;
    if (status && typeof status === "object" && !isArray(status) && typeof status.followed_by === "boolean") return status.followed_by;
    if (typeof user.follows_viewer === "boolean") return user.follows_viewer;
    return null;
  }
  function extractFollows(input, bootstrap = false) {
    const byUser = { __proto__: null };
    const order = [];
    let budget = 8000;
    function walk(node, depth) {
      if (depth > 18 || --budget < 0) return;
      if (bootstrap && typeof node === "string" && hasFollowsBootstrapMarker(node)) {
        try { walk(JSONparse(node), depth + 1); } catch (_) {}
        return;
      }
      if (!node || typeof node !== "object") return;
      if (isArray(node)) {
        for (let i = 0; i < node.length; i++) walk(node[i], depth + 1);
        return;
      }
      if (isValidUsername(node.username)) {
        const flag = pickFollowsYou(node);
        if (flag !== null) {
          const name = strTrim(node.username);
          const key = strLower(name);
          if (!(key in byUser)) order[order.length] = key;
          byUser[key] = { username: name, follows: flag };
        }
      }
      const keys = objectKeys(node);
      for (let i = 0; i < keys.length; i++) {
        const value = node[keys[i]];
        if (value && typeof value === "object") walk(value, depth + 1);
        else if (bootstrap && typeof value === "string" && value.length <= NESTED_CAP && hasFollowsMarker(value)) walk(value, depth + 1);
      }
    }
    if (typeof input === "string") {
      if (!hasFollowsMarker(input) && !(bootstrap && hasFollowsBootstrapMarker(input))) return [];
      const body = strStartsWith(input, XSSI) ? strSlice(input, XSSI.length) : input;
      try { walk(JSONparse(body), 0); } catch (_) {
        if (strIncludes(body, "\n")) {
          const lines = strSplit(body, "\n");
          for (let i = 0; i < lines.length; i++) {
            if (!lines[i] || !hasFollowsMarker(lines[i])) continue;
            try { walk(JSONparse(lines[i]), 0); } catch (_) {}
          }
        }
      }
    } else if (input && typeof input === "object") walk(input, 0);
    const out = [];
    for (let i = 0; i < order.length; i++) out[out.length] = byUser[order[i]];
    return out;
  }
  function buildFollowsMessage(username, follows) {
    if (!isValidUsername(username) || typeof follows !== "boolean") return null;
    return { type: "iy:follows", username: strTrim(username), follows };
  }
  function isValidFollowsMessage(msg) {
    return !!(
      msg && typeof msg === "object" && !isArray(msg) && objectKeys(msg).length === 3 &&
      msg.type === "iy:follows" && isValidUsername(msg.username) && typeof msg.follows === "boolean"
    );
  }

  // Both binary parsers take these references during document_start. Construct views
  // directly so typed-array species hooks never receive a private frame buffer.
  let parserIntrinsics;
  function captureParserIntrinsics() {
    if (parserIntrinsics) return parserIntrinsics;
    const U8 = Uint8Array;
    const BufferCtor = ArrayBuffer;
    const isView = ArrayBuffer.isView;
    const typed = Object.getPrototypeOf(U8.prototype);
    const getter = (proto, name) => uncurry(Object.getOwnPropertyDescriptor(proto, name).get);
    const length = getter(typed, "length");
    const buffer = getter(typed, "buffer");
    const offset = getter(typed, "byteOffset");
    const size = getter(typed, "byteLength");
    const dvBuffer = getter(DataView.prototype, "buffer");
    const dvOffset = getter(DataView.prototype, "byteOffset");
    const dvSize = getter(DataView.prototype, "byteLength");
    const define = Object.defineProperty;
    const setProto = Object.setPrototypeOf;
    const Shared = globalThis.SharedArrayBuffer;
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const decode = uncurry(TextDecoder.prototype.decode);
    function asBytes(value) {
      if (instanceOf(U8, value)) return value;
      if (instanceOf(BufferCtor, value)) return new U8(value);
      if (!isView(value)) return null;
      try { return new U8(buffer(value), offset(value), size(value)); }
      catch (_) { return new U8(dvBuffer(value), dvOffset(value), dvSize(value)); }
    }
    function view(bytes, start, end = length(bytes)) {
      return new U8(buffer(bytes), offset(bytes) + start, end - start);
    }
    function decodeUtf8(bytes) {
      try { return decode(decoder, bytes); }
      catch (_) {
        if (Shared && instanceOf(Shared, buffer(bytes))) {
          try { return decode(decoder, new U8(bytes)); } catch (_) {}
        }
        return null;
      }
    }
    function append(array, value) {
      define(array, array.length, { __proto__: null, value, enumerable: true, writable: true, configurable: true });
    }
    // Lightspeed reserializes parsed records. Strip inherited toJSON hooks.
    function parseData(text) {
      return JSONparse(text, (_, v) => v && typeof v === "object" ? setProto(v, null) : v);
    }
    parserIntrinsics = Object.freeze({ U8, instanceOf, length, view, asBytes, decodeUtf8, append, parseData,
      isAllowedCdn, isArray, objectKeys, own: hasOwn, regexExec, strIndexOf, strCharCode, strStartsWith,
      strEndsWith, strTrimStart: uncurry(String.prototype.trimStart),
      arrayPop: uncurry(Array.prototype.pop), arrayIndexOf: uncurry(Array.prototype.indexOf),
      byteIndexOf: uncurry(typed.indexOf), byteSet: uncurry(typed.set),
      WeakSetCtor: WeakSet, seenAdd: uncurry(WeakSet.prototype.add), seenHas: uncurry(WeakSet.prototype.has),
      integer: Number.isInteger, safeInteger: Number.isSafeInteger, finite: Number.isFinite,
      min: Math.min, floor: Math.floor, parse: JSONparse, stringify: JSON.stringify, setProto });
    return parserIntrinsics;
  }

  const API = { captureParserIntrinsics, isGraphqlUrl, ghostStoryMatch, ghostDmHttpMatch, wsReadReceipt,
    analyticsMatch, lightspeedSocketUrl,
    typingHttpThread, typingSocketUrl, ghostTypingHttpMatch, wsTypingFrame,
    hasFollowsMarker, hasFollowsBootstrapMarker, pickFollowsYou, extractFollows, buildFollowsMessage, isValidFollowsMessage,
    validThreadId, threadIdFromPath, dmTextThreadId, dmThreadId,
    isAllowedCdn, isValidUsername, profileUsernameFromPath, pickAvatar, pickAvatarUrl,
    hasAvatarMarker, hasAvatarBootstrapMarker, extractAvatars,
    buildAvatarMessage, isValidAvatarMessage,
    fakeOkBody: '{"data":{},"status":"ok"}' };
  if (typeof module !== "undefined") module.exports = API; else globalThis.IY = Object.assign(globalThis.IY || {}, API);
})();
