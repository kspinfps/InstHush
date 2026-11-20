// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
(function () {
  "use strict";

  const LIMITS = Object.freeze({
    maxDepth: 6,
    maxFields: 10000,
    maxBytes: 1024 * 1024,
    maxNodes: 50000,
    maxJsonDepth: 32,
    maxMedia: 6,
    maxMediaNodes: 500,
    maxHeaderOffset: 32
  });

  const MAX_PROTO_FIELD_NUM = 536870911; // 2^29 - 1
  const B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const B64_LOOKUP = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64_ALPHABET.length; i++) B64_LOOKUP[B64_ALPHABET.charCodeAt(i)] = i;

  const { U8, asBytes, view, length, decodeUtf8, byteIndexOf, own, parse, integer, safeInteger,
    min, floor, finite, strCharCode, strEndsWith, strStartsWith, strTrimStart, isAllowedCdn,
    arrayIndexOf, append, arrayPop, WeakSetCtor, seenAdd, seenHas, isArray, objectKeys, regexExec
  } = (typeof module !== "undefined" && module.exports ? require("./rules.js") : globalThis.IY).captureParserIntrinsics();
  const number = Number, string = String;

  function resolveLimits(overrides) {
    if (!overrides || typeof overrides !== "object") return LIMITS;
    const pick = (key) => {
      const v = overrides[key];
      return integer(v) && v >= 0 ? v : LIMITS[key];
    };
    return {
      maxDepth: pick("maxDepth"),
      maxFields: pick("maxFields"),
      maxBytes: pick("maxBytes"),
      maxNodes: pick("maxNodes"),
      maxJsonDepth: pick("maxJsonDepth"),
      maxMedia: pick("maxMedia"),
      maxMediaNodes: pick("maxMediaNodes"),
      maxHeaderOffset: pick("maxHeaderOffset")
    };
  }

  function readPbVarint(bytes, at) {
    let value = 0;
    let mul = 1;
    const end = min(length(bytes), at + 10);
    for (let i = at; i < end; i++) {
      const byte = bytes[i];
      value += (byte & 0x7f) * mul;
      if (!(byte & 0x80)) return { value, next: i + 1 };
      mul *= 128;
    }
    return null;
  }

  function tryJson(bytes) {
    if (!length(bytes)) return undefined;
    const first = bytes[0];
    if (first !== 0x7b && first !== 0x5b) return undefined; // '{' or '['
    const text = decodeUtf8(bytes);
    if (text === null) return undefined;
    try {
      return parse(text);
    } catch (_) {
      return undefined;
    }
  }

  function walkProtobuf(bytes, depth, out, state) {
    if (depth > state.maxDepth) return;
    let p = 0;
    while (p < length(bytes)) {
      if (state.fields >= state.maxFields) return;
      const key = readPbVarint(bytes, p);
      if (!key) return;
      state.fields++;
      p = key.next;
      const wire = key.value & 7;
      const fieldNum = floor(key.value / 8);
      if (fieldNum < 1 || fieldNum > MAX_PROTO_FIELD_NUM) return;

      if (wire === 0) {
        const v = readPbVarint(bytes, p);
        if (!v) return;
        p = v.next;
      } else if (wire === 1) {
        if (p + 8 > length(bytes)) return;
        p += 8;
      } else if (wire === 5) {
        if (p + 4 > length(bytes)) return;
        p += 4;
      } else if (wire === 2) {
        const len = readPbVarint(bytes, p);
        if (!len || !safeInteger(len.value) || len.value < 0 || len.next + len.value > length(bytes)) {
          return;
        }
        const sub = view(bytes, len.next, len.next + len.value);
        p = len.next + len.value;
        const json = tryJson(sub);
        if (json !== undefined) {
          append(out, json);
        } else if (length(sub) > 1 && depth < state.maxDepth) {
          walkProtobuf(sub, depth + 1, out, state);
        }
      } else {
        return;
      }
    }
  }

  /**
   * Schema-free protobuf walker that extracts every embedded JSON document, bounded by
   * maxBytes, maxDepth, and maxFields. Returns [] on malformed or oversized input.
   */
  function jsonInProtobuf(input, limits) {
    try {
      const cfg = resolveLimits(limits);
      const bytes = asBytes(input);
      if (!bytes || length(bytes) === 0 || length(bytes) > cfg.maxBytes) return [];
      const out = [];
      const state = { fields: 0, maxFields: cfg.maxFields, maxDepth: cfg.maxDepth };
      walkProtobuf(bytes, 0, out, state);
      return out;
    } catch (_) {
      return [];
    }
  }

  function base64ToBytes(b64, maxBytes) {
    if (typeof b64 !== "string" || !b64.length) return null;
    let clean = b64;
    if (regexExec(/[\t\n\f\r ]/, b64)) {
      clean = "";
      for (let i = 0; i < b64.length; i++) {
        const c = strCharCode(b64, i);
        if (c !== 32 && c !== 9 && c !== 10 && c !== 12 && c !== 13) clean += b64[i];
      }
    }
    if (!clean.length || clean.length % 4 === 1) return null;

    let pad = 0;
    if (strEndsWith(clean, "==")) pad = 2;
    else if (strEndsWith(clean, "=")) pad = 1;
    if (pad > 0 && clean.length % 4 !== 0) return null;

    const dataLen = clean.length - pad;
    const decodedLen = floor((clean.length * 3) / 4) - pad;
    if (decodedLen < 0 || decodedLen > maxBytes) return null;

    const out = new U8(decodedLen);
    let bitBuf = 0;
    let bitCount = 0;
    let outIdx = 0;
    for (let i = 0; i < dataLen; i++) {
      const code = strCharCode(clean, i);
      if (code >= 128) return null;
      const val = B64_LOOKUP[code];
      if (val < 0) return null;
      bitBuf = (bitBuf << 6) | val;
      bitCount += 6;
      if (bitCount >= 8) {
        bitCount -= 8;
        if (outIdx < decodedLen) out[outIdx++] = (bitBuf >> bitCount) & 0xff;
      }
    }
    return out;
  }

  /**
   * Decode a wss://gateway.instagram.com/ws/lightspeed binary frame into embedded JSON docs.
   * Returns [] on keepalives, malformed frames, or inputs exceeding limits.
   */
  function decodeGatewayFrame(input, limits) {
    try {
      const cfg = resolveLimits(limits);
      const frame = asBytes(input);
      if (!frame || length(frame) === 0 || length(frame) > cfg.maxBytes) return [];

      const start = byteIndexOf(frame, 0x7b);
      if (start < 0 || start > cfg.maxHeaderOffset) return [];

      const outerText = decodeUtf8(view(frame, start));
      if (outerText === null) return [];

      let outer;
      try {
        outer = parse(outerText);
      } catch (_) {
        return [];
      }
      if (!outer || typeof outer !== "object") return [];
      if (!own(outer, "payload") || typeof outer.payload !== "string") return [outer];

      const trimmed = strTrimStart(outer.payload);
      if (strStartsWith(trimmed, "{") || strStartsWith(trimmed, "[")) {
        if (trimmed.length > cfg.maxBytes) return [];
        try {
          return [parse(trimmed)];
        } catch (_) {
          return [];
        }
      }

      const bytes = base64ToBytes(outer.payload, cfg.maxBytes);
      return bytes ? jsonInProtobuf(bytes, cfg) : [];
    } catch (_) {
      return [];
    }
  }

  function mediaUrls(content, cfg) {
    if (!content || typeof content !== "object") return [];
    const found = [];
    const seen = new WeakSetCtor();
    const stack = [content];
    let budget = cfg.maxMediaNodes;

    while (stack.length && found.length < cfg.maxMedia && budget-- > 0) {
      const v = arrayPop(stack);
      if (typeof v === "string") {
        if (isAllowedCdn(v) && arrayIndexOf(found, v) === -1) append(found, v);
      } else if (v && typeof v === "object") {
        if (seenHas(seen, v)) continue;
        seenAdd(seen, v);
        if (isArray(v)) {
          for (let i = v.length - 1; i >= 0; i--) append(stack, field(v, i));
        } else {
          const keys = objectKeys(v);
          for (let i = keys.length - 1; i >= 0; i--) {
            const k = keys[i];
            if (!regexExec(/profile_pic/i, k)) append(stack, field(v, k));
          }
        }
      }
    }
    return found;
  }

  const describe = Object.getOwnPropertyDescriptor;
  function field(obj, key) {
    // XHR JSON may already be shared with the page. Read only own data properties.
    const d = obj && typeof obj === "object" && describe(obj, key);
    return d && own(d, "value") ? d.value : undefined;
  }
  function idText(value) {
    return typeof value === "string" ? value : safeInteger(value) ? string(value) : "";
  }
  function parseTimestampMs(raw) {
    if (typeof raw !== "number" && typeof raw !== "string") return 0;
    const n = number(raw);
    return finite(n) && n >= 0 ? n : 0;
  }

  function toMessageEvent(m, cfg) {
    const sender = field(m, "sender");
    const user = field(sender, "user_dict");
    const content = field(m, "content");
    const threadId = idText(field(m, "thread_fbid"));
    const senderId = idText(field(sender, "igid") ?? field(user, "id") ?? field(m, "sender_fbid"));
    if (!threadId || !senderId) return null;
    const text = field(m, "text_body") ?? field(content, "text_body");
    const type = field(m, "content_type") ?? field(content, "__typename");
    const username = field(user, "username");
    const name = field(sender, "name") || field(user, "full_name");
    return {
      threadId, messageId: field(m, "message_id"), senderId,
      text: typeof text === "string" ? text : "",
      timestampMs: parseTimestampMs(field(m, "timestamp_ms")),
      kind: "message", contentType: typeof type === "string" ? type : "UNKNOWN",
      media: mediaUrls(content, cfg),
      ...(typeof username === "string" && username ? { username } : {}),
      ...(typeof name === "string" && name ? { name } : {})
    };
  }

  function toUnsentEvent(o) {
    return {
      threadId: idText(field(o, "thread_fbid")),
      messageId: field(o, "message_id"),
      senderId: idText(field(o, "sender_fbid")),
      text: "", timestampMs: parseTimestampMs(field(o, "timestamp_ms")), kind: "unsent"
    };
  }

  /**
   * Collect DM new-message and unsent events anywhere in a decoded JSON document.
   * Returns plain objects with { threadId, messageId, senderId, text, timestampMs, kind }.
   * Bounded by maxNodes and maxJsonDepth; handles cyclic objects safely.
   */
  function collectDmEvents(root, limits) {
    try {
      if (!root || typeof root !== "object") return [];
      const cfg = resolveLimits(limits);
      const events = [];
      const seen = new WeakSetCtor();
      const stack = [{ node: root, depth: 0 }];
      let budget = cfg.maxNodes;

      while (stack.length && budget-- > 0) {
        const entry = arrayPop(stack);
        const v = entry.node;
        const depth = entry.depth;
        if (!v || typeof v !== "object" || depth > cfg.maxJsonDepth) continue;
        if (seenHas(seen, v)) continue;
        seenAdd(seen, v);

        if (isArray(v)) {
          if (depth < cfg.maxJsonDepth) {
            for (let i = v.length - 1; i >= 0; i--) {
              const x = field(v, i);
              if (x && typeof x === "object") append(stack, { node: x, depth: depth + 1 });
            }
          }
          continue;
        }

        const mid = field(v, "message_id");
        if (field(v, "__typename") === "SlideUQPPDeleteMessage" && typeof mid === "string" && mid) {
          append(events, toUnsentEvent(v));
          continue;
        }

        if (typeof mid === "string" && mid && own(v, "thread_fbid") && own(v, "timestamp_ms")) {
          const msg = toMessageEvent(v, cfg);
          if (msg) append(events, msg);
          continue; // Skip nested replied_to_message copies of older messages.
        }

        if (depth < cfg.maxJsonDepth) {
          const keys = objectKeys(v);
          for (let i = keys.length - 1; i >= 0; i--) {
            const x = field(v, keys[i]);
            if (x && typeof x === "object") append(stack, { node: x, depth: depth + 1 });
          }
        }
      }
      return events;
    } catch (_) {
      return [];
    }
  }

  /**
   * Convenience pipeline: decode a gateway frame and collect all DM events.
   * Returns [] on any malformed or oversized input. Never throws.
   */
  function decodeSlideEvents(input, limits) {
    try {
      const cfg = resolveLimits(limits);
      const docs = decodeGatewayFrame(input, cfg);
      if (!docs.length) return [];
      const out = [];
      for (let i = 0; i < docs.length; i++) {
        const found = collectDmEvents(docs[i], cfg);
        for (let j = 0; j < found.length; j++) append(out, found[j]);
      }
      return out;
    } catch (_) {
      return [];
    }
  }

  const api = Object.freeze({
    LIMITS,
    jsonInProtobuf,
    decodeGatewayFrame,
    collectDmEvents,
    decodeSlideEvents
  });

  globalThis.IY = Object.assign(globalThis.IY || {}, { slide: api });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
