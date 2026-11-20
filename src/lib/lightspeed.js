// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
(function () {
  "use strict";

  const READ_TASK_LABEL = "21";
  const TYPING_TASK_LABEL = "3";
  const LIGHTSPEED_TOPIC = "/ls_req";
  const SEND_MESSAGE_TOPIC = "/ig_send_message";
  const MAX_MQTT_REMAINING = 268435455; // 128^4 - 1 (MQTT 3.1.1 4-byte varint max)
  const FAST_MATCH_RE = /is_typing|indicate_activity|"label\\?"\s*:\s*\\?"?21|last_read_watermark/;

  const { U8, instanceOf, view, length, asBytes, byteSet, decodeUtf8, append, integer, min, floor, own,
    regexExec, strIndexOf, isArray, parseData, stringify, setProto } = (typeof module !== "undefined" && module.exports ? require("./rules.js") : globalThis.IY).captureParserIntrinsics();
  const encoder = new TextEncoder();
  const encode = Function.prototype.call.bind(TextEncoder.prototype.encode, encoder);

  function readVarint(bytes, at) {
    if (!instanceOf(U8, bytes)) return null;
    const start = at === undefined ? 0 : at;
    if (!integer(start) || start < 0 || start >= length(bytes)) return null;
    let value = 0;
    let mul = 1;
    const end = min(length(bytes), start + 4);
    for (let i = start; i < end; i++) {
      const byte = bytes[i];
      value += (byte & 0x7f) * mul;
      if (!(byte & 0x80)) {
        if (i > start && byte === 0) return null; // Reject overlong varints.
        return { value, next: i + 1 };
      }
      mul *= 128;
    }
    return null;
  }

  function writeVarint(n) {
    if (!integer(n) || n < 0 || n > MAX_MQTT_REMAINING) return null;
    const out = [];
    let rem = n;
    do {
      let byte = rem % 128;
      rem = floor(rem / 128);
      if (rem > 0) byte |= 0x80;
      append(out, byte);
    } while (rem > 0);
    return out;
  }

  function isPlainObject(value) {
    return !!value && typeof value === "object" && !isArray(value);
  }

  function isTypingTask(task) {
    if (!isPlainObject(task)) return false;
    if (task.label !== 3 && task.label !== TYPING_TASK_LABEL) return false;
    if (own(task, "is_typing")) return true;
    const raw = task.payload;
    if (isPlainObject(raw)) return own(raw, "is_typing");
    if (typeof raw === "string" && strIndexOf(raw, "is_typing") !== -1) {
      try {
        const parsed = parseData(raw);
        return isPlainObject(parsed) && own(parsed, "is_typing");
      } catch (_) {
        return false;
      }
    }
    return false;
  }

  function isIndicateActivityPayload(text) {
    if (typeof text !== "string" || strIndexOf(text, "indicate_activity") === -1) return false;
    try {
      const parsed = parseData(text);
      return isPlainObject(parsed) && parsed.action === "indicate_activity";
    } catch (_) {
      return false;
    }
  }

  /**
   * Filter a Lightspeed JSON request string.
   * Returns the original string unchanged, a rewritten JSON string, or null to drop.
   * Never throws on malformed or non-string input.
   */
  function filterLightspeedRequest(json, filter) {
    try {
      if (typeof json !== "string") return json;
      if (!filter || (!filter.typing && !filter.seen)) return json;
      if (!regexExec(FAST_MATCH_RE, json)) return json;

      let req;
      try {
        req = parseData(json);
      } catch (_) {
        return json;
      }
      if (!isPlainObject(req)) return json;

      // DGW / send_message style standalone typing activity payload.
      if (filter.typing && req.action === "indicate_activity") return null;

      if (typeof req.payload !== "string") return json;
      let inner;
      try {
        inner = parseData(req.payload);
      } catch (_) {
        return json;
      }
      if (!isPlainObject(inner)) return json;

      // Single task-like payload (Lightspeed type 4 typing indicator).
      if (filter.typing && strIndexOf(req.payload, "is_typing") !== -1 && !isArray(inner.tasks)) {
        return null;
      }

      // Batched tasks array (Lightspeed type 3): strip only targeted tasks.
      if (isArray(inner.tasks)) {
        const kept = setProto([], null);
        for (let i = 0; i < inner.tasks.length; i++) {
          const task = inner.tasks[i];
          if (isPlainObject(task) && ((filter.seen && (task.label === 21 || task.label === READ_TASK_LABEL)) ||
              (filter.typing && isTypingTask(task)))) continue;
          append(kept, task);
        }
        if (kept.length === inner.tasks.length) return json;
        if (kept.length === 0) return null;
        inner.tasks = kept;
        req.payload = stringify(inner);
        return stringify(req);
      }

      return json;
    } catch (_) {
      return json;
    }
  }

  /**
   * Parse a single complete MQTT 3.1.1 PUBLISH frame.
   * Returns null for non-PUBLISH packets, malformed/truncated frames, or QoS 3.
   */
  function parseMqttPublish(bytes) {
    try {
      if (!instanceOf(U8, bytes) || length(bytes) < 4) return null;
      const flags = bytes[0];
      if ((flags >> 4) !== 3) return null; // Not PUBLISH
      const qos = (flags >> 1) & 3;
      if (qos === 3) return null; // Reserved / malformed QoS

      const len = readVarint(bytes, 1);
      if (!len || len.next + len.value !== length(bytes)) return null;

      const headerStart = len.next;
      if (headerStart + 2 > length(bytes)) return null;
      const topicLen = (bytes[headerStart] << 8) | bytes[headerStart + 1];
      if (topicLen === 0) return null;

      const topicStart = headerStart + 2;
      const topicEnd = topicStart + topicLen;
      const headerEnd = topicEnd + (qos > 0 ? 2 : 0);
      if (headerEnd > length(bytes)) return null;

      const topic = decodeUtf8(view(bytes, topicStart, topicEnd));
      if (topic === null) return null;

      const packetId = qos > 0 ? ((bytes[topicEnd] << 8) | bytes[topicEnd + 1]) : null;
      return {
        flags,
        qos,
        dup: !!(flags & 0x08),
        retain: !!(flags & 0x01),
        topic,
        packetId,
        header: view(bytes, headerStart, headerEnd),
        payloadBytes: view(bytes, headerEnd)
      };
    } catch (_) {
      return null;
    }
  }

  /**
   * Re-encode an MQTT PUBLISH frame from its fixed-header byte, variable header, and payload bytes.
   */
  function encodeMqttPublish(flags, header, payloadBytes) {
    try {
      if (!integer(flags) || (flags >> 4) !== 3) return null;
      if (!instanceOf(U8, header) || !instanceOf(U8, payloadBytes)) return null;
      const rest = length(header) + length(payloadBytes);
      const lenBytes = writeVarint(rest);
      if (!lenBytes) return null;
      const out = new U8(1 + lenBytes.length + rest);
      out[0] = flags & 0xff;
      byteSet(out, lenBytes, 1);
      byteSet(out, header, 1 + lenBytes.length);
      byteSet(out, payloadBytes, 1 + lenBytes.length + length(header));
      return out;
    } catch (_) {
      return null;
    }
  }

  /**
   * Filter an MQTT PUBLISH frame on /ls_req or /ig_send_message.
   * Returns original bytes unchanged, newly encoded bytes, or null to drop.
   * QoS 2 frames are never dropped because their 4-step handshake cannot be faked locally.
   * Never throws on malformed or unknown input.
   */
  function filterMqttFrame(bytes, filter) {
    try {
      if (!instanceOf(U8, bytes) || !length(bytes)) return bytes;
      if (!filter || (!filter.typing && !filter.seen)) return bytes;

      const frame = parseMqttPublish(bytes);
      if (!frame) return bytes;

      if (frame.topic === SEND_MESSAGE_TOPIC) {
        if (!filter.typing) return bytes;
        const text = decodeUtf8(frame.payloadBytes);
        if (text !== null && isIndicateActivityPayload(text)) {
          return frame.qos === 2 ? bytes : null;
        }
        return bytes;
      }

      if (frame.topic !== LIGHTSPEED_TOPIC) return bytes;

      const payload = decodeUtf8(frame.payloadBytes);
      if (payload === null) return bytes;

      const filtered = filterLightspeedRequest(payload, filter);
      if (filtered === null) return frame.qos === 2 ? bytes : null;
      if (filtered === payload) return bytes;

      const encoded = encodeMqttPublish(frame.flags, frame.header, encode(filtered));
      return encoded || bytes;
    } catch (_) {
      return bytes;
    }
  }

  /**
   * Build the MQTT QoS-1 PUBACK (0x40 0x02 <pktIdHi> <pktIdLo>) for a QoS-1 PUBLISH frame.
   * Returns null for non-QoS-1 or malformed frames. Never throws.
   */
  function mqttPubAck(bytes) {
    try {
      const frame = parseMqttPublish(bytes);
      if (!frame || frame.qos !== 1 || frame.packetId === null) return null;
      const ack = new U8(4);
      ack[0] = 0x40;
      ack[1] = 2;
      ack[2] = frame.packetId >> 8;
      ack[3] = frame.packetId & 0xff;
      return ack;
    } catch (_) {
      return null;
    }
  }

  /**
   * Helper for MqttBypassDGWClient send/sendAndForget/publish typing-indicator checks.
   * Accepts a string, Uint8Array, or ArrayBuffer. Never throws.
   */
  function isDgwTypingPayload(value) {
    try {
      let text = null;
      if (typeof value === "string") {
        text = value;
      } else {
        const bytes = asBytes(value);
        if (bytes) text = decodeUtf8(bytes);
      }
      return typeof text === "string" && strIndexOf(text, '"indicate_activity"') !== -1;
    } catch (_) {
      return false;
    }
  }

  const api = Object.freeze({
    READ_TASK_LABEL,
    TYPING_TASK_LABEL,
    LIGHTSPEED_TOPIC,
    SEND_MESSAGE_TOPIC,
    readVarint,
    writeVarint,
    parseMqttPublish,
    encodeMqttPublish,
    filterLightspeedRequest,
    filterMqttFrame,
    mqttPubAck,
    isDgwTypingPayload
  });

  globalThis.IY = Object.assign(globalThis.IY || {}, { lightspeed: api });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
