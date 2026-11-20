// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
(function () {
  "use strict";

  const iy = globalThis.IY ||= {};
  const node = typeof module !== "undefined" && module.exports;
  const slide = node ? require("../lib/slide.js") : iy.slide;
  const lightspeed = node ? require("../lib/lightspeed.js") : iy.lightspeed;
  const MAX_BODY = 1024 * 1024;
  const MAX_EVENTS = 128;
  const MAX_ROWS = 300;
  const MAX_TEXT = 4096;
  const MAX_MEDIA = 3;
  const OWN = Object.hasOwn;
  const safeInt = Number.isSafeInteger;
  const isArray = Array.isArray;
  const parse = JSON.parse;
  const keys = Object.keys;
  const uncurry = Function.prototype.bind.bind(Function.prototype.call);
  const instanceOf = uncurry(Function.prototype[Symbol.hasInstance]);
  const exec = uncurry(RegExp.prototype.exec);
  const includes = uncurry(String.prototype.includes);
  const slice = uncurry(String.prototype.slice);
  const indexOf = uncurry(String.prototype.indexOf);
  const startsWith = uncurry(String.prototype.startsWith);
  const trim = uncurry(String.prototype.trim);
  const define = Object.defineProperty;
  const describe = Object.getOwnPropertyDescriptor;
  function push(list, value) {
    define(list, list.length, { __proto__: null, value, enumerable: true, writable: true, configurable: true });
  }
  function field(obj, key) {
    const d = obj && describe(obj, key);
    return d && OWN(d, "value") ? d.value : undefined;
  }
  const then = uncurry(Promise.prototype.then);
  function safeThen(promise, onFulfilled, onRejected) {
    const prev = describe(promise, "constructor");
    let patched = false;
    try {
      define(promise, "constructor", { __proto__: null, value: undefined, configurable: true, writable: true });
      patched = true;
    } catch (_) {}
    try {
      return then(promise, onFulfilled, onRejected);
    } finally {
      if (patched) {
        try {
          if (prev) define(promise, "constructor", prev);
          else delete promise.constructor;
        } catch (_) {}
      }
    }
  }
  const add = uncurry(EventTarget.prototype.addEventListener);
  const remove = uncurry(EventTarget.prototype.removeEventListener);
  const dispatch = uncurry(EventTarget.prototype.dispatchEvent);
  const seenGet = uncurry(WeakMap.prototype.get);
  const seenSet = uncurry(WeakMap.prototype.set);
  const seenDelete = uncurry(WeakMap.prototype.delete);
  const setAdd = uncurry(Set.prototype.add);
  const setDelete = uncurry(Set.prototype.delete);
  const setEach = uncurry(Set.prototype.forEach);
  const nowMs = Date.now;
  const schedule = setTimeout.bind(globalThis);
  const SetCtor = Set, WeakMapCtor = WeakMap, BlobCtor = Blob, PromiseCtor = Promise;
  const resolve = Promise.resolve.bind(Promise);
  const string = String, floor = Math.floor;
  const cdn = node ? require("../lib/rules.js").isAllowedCdn : iy.isAllowedCdn;
  const newWork = () => ({ fetches: 0, xhrs: 0, readers: new SetCtor() });
  const URLCtor = URL;
  const U8 = Uint8Array;
  const EventCtor = globalThis.CustomEvent;
  const TextDecoderCtor = TextDecoder;
  const encoder = new TextEncoder();
  const encode = uncurry(TextEncoder.prototype.encode);
  const decode = uncurry(TextDecoder.prototype.decode);
  const getter = (proto, key) => {
    for (let p = proto; p; p = Object.getPrototypeOf(p)) {
      const get = describe(p, key)?.get;
      if (get) return uncurry(get);
    }
    return value => value[key];
  };
  const urlHost = getter(URL.prototype, "hostname");
  const urlPath = getter(URL.prototype, "pathname");
  const urlProtocol = getter(URL.prototype, "protocol");
  const urlUsername = getter(URL.prototype, "username");
  const urlPassword = getter(URL.prototype, "password");
  const urlPort = getter(URL.prototype, "port");
  const urlSearch = getter(URL.prototype, "searchParams");
  const paramsGet = uncurry(URLSearchParams.prototype.get);
  const Form = FormData;
  const Params = URLSearchParams;
  const formGet = uncurry(Form.prototype.get);
  const blobSize = getter(Blob.prototype, "size");
  const blobBuffer = uncurry(Blob.prototype.arrayBuffer);
  const arrayBufferLength = getter(ArrayBuffer.prototype, "byteLength");
  const byteLength = getter(Object.getPrototypeOf(U8.prototype), "byteLength");
  const socketUrl = getter(globalThis.WebSocket?.prototype, "url");
  const eventData = getter(MessageEvent.prototype, "data");
  const responseOk = getter(Response.prototype, "ok");
  const responseUrl = getter(Response.prototype, "url");
  const responseHeaders = getter(Response.prototype, "headers");
  const responseBody = getter(Response.prototype, "body");
  const cloneResponse = uncurry(Response.prototype.clone);
  const getHeader = uncurry(Headers.prototype.get);
  const getReader = uncurry(ReadableStream.prototype.getReader);
  const read = uncurry(ReadableStreamDefaultReader.prototype.read);
  const cancel = uncurry(ReadableStreamDefaultReader.prototype.cancel);
  const xhrProto = globalThis.XMLHttpRequest?.prototype;
  const xhrStatus = getter(xhrProto, "status");
  const xhrUrl = getter(xhrProto, "responseURL");
  const xhrType = getter(xhrProto, "responseType");
  const xhrText = getter(xhrProto, "responseText");
  const xhrJson = getter(xhrProto, "response");
  const xhrHeader = xhrProto && uncurry(xhrProto.getResponseHeader);
  const cookie = getter(globalThis.Document?.prototype, "cookie");
  const path = getter(globalThis.Location?.prototype, "pathname");
  const parentOf = getter(globalThis.Node?.prototype, "parentElement");
  const childrenOf = getter(globalThis.Element?.prototype, "children");
  const childCount = getter(globalThis.HTMLCollection?.prototype, "length");
  const rowCount = getter(globalThis.NodeList?.prototype, "length");
  const queryRows = globalThis.Document ? uncurry(Document.prototype.querySelectorAll) :
    (doc, selector) => doc.querySelectorAll(selector);

  function accountId(value) {
    return typeof value === "string" && exec(/^[1-9][0-9]{0,39}$/, value) ? value : null;
  }

  function idFrom(value) {
    return safeInt(value) && value > 0 ? string(value) : value;
  }

  function accountFromCookie(value) {
    return typeof value === "string" ? accountId(exec(/(?:^|;\s*)ds_user_id=([0-9]+)(?=;|$)/, value)?.[1]) : null;
  }

  function threadFromPath(value) {
    return typeof value === "string" ? accountId(exec(/^\/direct\/t\/([0-9]+)\/?$/, value)?.[1]) : null;
  }

  function messageId(value) {
    return typeof value === "string" && exec(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/, value) ? value : null;
  }

  function time(value) {
    return safeInt(value) && value > 0 && value <= 8640000000000000 ? value : 0;
  }

  function allowedMedia(text) {
    return typeof text === "string" && text.length <= 2048 && !!cdn?.(text);
  }

  function normalizeEvent(value) {
    if (!value || typeof value !== "object" || isArray(value) ||
        !OWN(value, "kind") || !OWN(value, "threadId") || !OWN(value, "messageId")) return null;
    const threadId = accountId(value.threadId);
    const mid = messageId(value.messageId);
    if (!threadId || !mid) return null;
    if (value.kind === "unsent") return { kind: "unsent", threadId, messageId: mid };
    if (value.kind !== "message" || !OWN(value, "senderId")) return null;
    const senderId = accountId(value.senderId);
    if (!senderId) return null;
    const text = OWN(value, "text") && typeof value.text === "string" ? slice(value.text, 0, MAX_TEXT) : "";
    const media = [];
    if (OWN(value, "media") && isArray(value.media)) {
      for (let i = 0; i < value.media.length && i < 6 && media.length < MAX_MEDIA; i++) {
        const url = OWN(value.media, i) ? value.media[i] : undefined;
        let duplicate = false;
        for (let j = 0; j < media.length; j++) if (media[j] === url) duplicate = true;
        if (!duplicate && allowedMedia(url)) push(media, url);
      }
    }
    if (!text && !media.length) return null;
    return { kind: "message", threadId, messageId: mid, senderId, text, media,
      timestampMs: OWN(value, "timestampMs") ? time(value.timestampMs) : 0 };
  }

  const REST = /^\/api\/v[12]\/direct_v2\/(?:inbox|threads\/[0-9]+(?:\/items)?)\/?$/;
  const GRAPH = /^\/(?:api\/graphql|graphql\/query)\/?$/;
  const DM_OP = /^(?:use)?(?:IGD|PolarisDirect|Slide)[A-Za-z0-9_]*(?:Query|Subscription)$/;
  const HTTP_HOST = /^(?:www\.|i\.)?instagram\.com$/;
  const SOCKET_PATH = /^\/ws(?:\/lightspeed)?\/?$/;

  function httpTarget(raw, base, friendly, body, onThread) {
    if (typeof raw !== "string" || raw.length > 8192) return null;
    try {
      const url = new URLCtor(raw, base);
      if (urlProtocol(url) !== "https:" || urlUsername(url) || urlPassword(url) || urlPort(url) ||
          !exec(HTTP_HOST, urlHost(url))) return null;
      const pathname = urlPath(url);
      if (exec(REST, pathname)) return "rest";
      if (!exec(GRAPH, pathname)) return null;
      const nameKey = "fb_api_req_friendly_name";
      let name = friendly || paramsGet(urlSearch(url), nameKey);
      if (!name && typeof body === "string" && body.length <= 65536) name = paramsGet(new Params(body), nameKey);
      else if (!name && instanceOf(Form, body)) name = formGet(body, nameKey);
      else if (!name && instanceOf(Params, body)) name = paramsGet(body, nameKey);
      return (typeof name === "string" && exec(DM_OP, name)) || (!name && onThread) ? "graph" : null;
    } catch (_) { return null; }
  }

  function socketTarget(raw) {
    if (typeof raw !== "string" || raw.length > 4096) return null;
    try {
      const url = new URLCtor(raw);
      if (urlProtocol(url) !== "wss:" || urlUsername(url) || urlPassword(url) || urlPort(url)) return null;
      const host = urlHost(url);
      const pathname = urlPath(url);
      if (host === "gateway.instagram.com" && exec(/^\/ws\/lightspeed\/?$/, pathname)) return "gateway";
      if (host === "edge-chat.instagram.com" && exec(SOCKET_PATH, pathname)) return "mqtt";
    } catch (_) {}
    return null;
  }

  function restTimestamp(value) {
    // REST items use microseconds. Ignore unsafe integer values rather than rounding IDs or times.
    const ms = typeof value === "string" && exec(/^[0-9]{1,16}$/, value) ? +value : value;
    return time(ms) ? floor(ms / 1000) : 0;
  }

  function restRecords(root, out) {
    const threads = field(field(root, "inbox"), "threads");
    const single = field(root, "thread");
    const list = single ? [single] : threads;
    if (!isArray(list)) return;
    for (let i = 0; i < list.length && i < MAX_EVENTS && out.length < MAX_EVENTS; i++) {
      const thread = field(list, i);
      const threadId = accountId(idFrom(field(thread, "thread_fbid") ?? field(thread, "thread_id")));
      const items = field(thread, "items");
      if (!threadId || !isArray(items)) continue;
      for (let j = 0; j < items.length && j < MAX_EVENTS && out.length < MAX_EVENTS; j++) {
        const item = field(items, j);
        if (!item || !OWN(item, "item_id") || !OWN(item, "user_id")) continue;
        const type = field(item, "item_type");
        if (field(item, "is_ephemeral") === true || field(item, "expiring_media") || field(item, "visual_media") ||
            exec(/(?:view_once|ephemeral|vanish)/i, typeof type === "string" ? type : "")) continue;
        const media = field(item, "media");
        const images = field(field(media, "image_versions2"), "candidates");
        const voice = field(field(item, "voice_media"), "media");
        const animated = field(field(item, "animated_media"), "images");
        const record = normalizeEvent({
          kind: "message", threadId, messageId: idFrom(field(item, "item_id")), senderId: idFrom(field(item, "user_id")),
          text: field(item, "text"), timestampMs: restTimestamp(field(item, "timestamp")),
          media: [
            field(field(images, 0), "url"), field(field(field(media, "video_versions"), 0), "url"),
            field(field(voice, "audio"), "audio_src"), field(field(animated, "original"), "url")
          ]
        });
        if (record) push(out, record);
      }
    }
  }

  function appendSlide(root, out, messagesOnly) {
    const events = slide.collectDmEvents(root);
    for (let i = 0; i < events.length && i < MAX_EVENTS * 2 && out.length < MAX_EVENTS; i++) {
      if (messagesOnly && events[i].kind !== "message") continue;
      const type = OWN(events[i], "contentType") && typeof events[i].contentType === "string" ? events[i].contentType : "";
      if (exec(/ephemeral|view.?once|vanish|expiring/i, type)) continue;
      const record = normalizeEvent(events[i]);
      if (record) push(out, record);
    }
  }

  function httpRecords(input, type) {
    const out = [];
    if (!slide || (type !== "graph" && type !== "rest")) return out;
    const collect = root => type === "rest" ? restRecords(root, out) : appendSlide(root, out, true);
    if (typeof input !== "string") {
      if (input && typeof input === "object") collect(input);
      return out;
    }
    if (input.length > MAX_BODY || (!includes(input, '"message_id"') && !includes(input, '"item_id"'))) return out;
    const clean = text => {
      text = trim(text);
      return startsWith(text, "for (;;);") ? slice(text, 9) : text;
    };
    try { collect(parse(clean(input))); return out; } catch (_) { /* Try newline-delimited GraphQL. */ }
    if (type === "graph") {
      let start = 0;
      for (let i = 0; start < input.length && i < 256 && out.length < MAX_EVENTS; i++) {
        const end = indexOf(input, "\n", start);
        const line = clean(slice(input, start, end === -1 ? input.length : end));
        if (includes(line, '"message_id"')) {
          try { collect(parse(line)); } catch (_) {}
        }
        if (end === -1) break;
        start = end + 1;
      }
    }
    return out;
  }

  function frameRecords(input, transport) {
    const out = [];
    if (!slide || (transport !== "gateway" && transport !== "mqtt")) return out;
    let bytes;
    if (typeof input === "string") {
      if (input.length > MAX_BODY || transport !== "gateway") return out;
      bytes = encode(encoder, input);
    } else bytes = instanceOf(U8, input) ? input : new U8(input);
    if (!byteLength(bytes) || byteLength(bytes) > MAX_BODY) return out;
    const publish = bytes[0] >> 4 === 3 && lightspeed?.parseMqttPublish(bytes);
    if (publish) {
      if (publish.topic !== "/ls_resp") return out;
      bytes = publish.payloadBytes;
    } else if (transport === "mqtt") return out;
    const docs = slide.decodeGatewayFrame(bytes);
    for (let i = 0; i < docs.length && i < 128 && out.length < MAX_EVENTS; i++) appendSlide(docs[i], out, false);
    return out;
  }

  function rowScanner(doc) {
    let fiberKey = "";
    return function scan(threadId, report) {
      let source;
      let sourceChecks = 0;
      const rows = [];
      function fiber(el) {
        if (!el) return null;
        if (!fiberKey || !OWN(el, fiberKey)) {
          const props = keys(el);
          for (let i = 0; i < props.length; i++) {
            if (startsWith(props[i], "__reactFiber$")) { fiberKey = props[i]; break; }
          }
        }
        return fiberKey && OWN(el, fiberKey) ? el[fiberKey] : null;
      }

      function current(f) {
        // Resolve React's current root when a DOM fiber has a work-in-progress alternate.
        if (!f?.alternate) return f;
        let root = f;
        for (let n = 0; root.return && n < 200; n++) root = root.return;
        return root.alternate && root.stateNode?.current === root.alternate ? f.alternate : f;
      }

      let list;
      const seeds = queryRows(doc, "[data-igd-message-actions-hidden]");
      for (let i = 0; i < rowCount(seeds) && i < MAX_ROWS; i++) {
        let el = seeds[i];
        for (let j = 0; el && parentOf(el) && j < 8; j++, el = parentOf(el)) {
          const f = current(fiber(el));
          const ref = f?.memoizedProps?.currentMessageRef?.__id ?? f?.return?.memoizedProps?.currentMessageRef?.__id;
          if (typeof ref !== "string" || ref.length > 512) continue;
          if (!source && sourceChecks++ < 6) {
            let up = f;
            for (let n = 0; up && n < 200; n++, up = up.return) {
              const props = up.memoizedProps;
              const env = props?.environment ?? props?.value?.environment;
              if (typeof env?.getStore === "function") {
                source = env.getStore()?.getSource?.();
                if (source) break;
              }
            }
          }
          const record = source?.get(ref);
          if (accountId(idFrom(record?.thread_fbid)) !== threadId || !messageId(record?.message_id)) continue;
          list = parentOf(el);
          break;
        }
        if (list) break;
      }
      if (!list) return rows;
      const children = childrenOf(list);
      for (let i = 0; i < childCount(children) && i < MAX_ROWS; i++) {
        const el = children[i];
        const f = current(fiber(el));
        const ref = f?.memoizedProps?.currentMessageRef?.__id ?? f?.return?.memoizedProps?.currentMessageRef?.__id;
        const rec = typeof ref === "string" && ref.length <= 512 ? source.get(ref) : null;
        if (accountId(idFrom(rec?.thread_fbid)) !== threadId) continue;
        const mid = messageId(rec?.message_id);
        if (!mid) continue;
        report(el, rows.length);
        push(rows, { messageId: mid, timestampMs: time(+rec.timestamp_ms) });
      }
      return rows;
    };
  }

  function jsonResponseType(type) {
    return !type || !!exec(/^(?:application\/(?:json|[a-z0-9.+-]+\+json|x-ndjson|javascript)|text\/(?:plain|javascript))\s*(?:;|$)/i, type);
  }

  function createCapture(options) {
    const { post } = options;
    const doc = options.document ?? globalThis.document;
    const loc = options.location ?? globalThis.location;
    const getAccount = options.getAccount || (() => accountFromCookie(cookie(doc)));
    const now = options.now || nowMs;
    const scan = rowScanner(doc);
    const sockets = new WeakMapCtor();
    const xhrs = new WeakMapCtor();
    let account = null;
    let found = "";
    let generation = 0;
    let work = newWork();
    let queuedFrames = 0;

    function configure(value, eventName) {
      const next = accountId(value);
      const nextFound = typeof eventName === "string" && exec(/^iy-dm-[a-f0-9-]{36}$/, eventName) ? eventName : "";
      if (next === account && nextFound === found) return;
      account = next;
      found = nextFound;
      generation++;
      setEach(work.readers, reader => {
        try { safeThen(cancel(reader), undefined, () => {}); } catch (_) {}
      });
      work = newWork();
    }

    function current(stamp) {
      try { return !!account && generation === stamp && account === getAccount(); } catch (_) { return false; }
    }

    function emit(events, stamp, source, observedAt) {
      if (!events.length || !current(stamp)) return;
      // The private-channel sender is supplied by net.js. There is no window-message fallback.
      const records = [];
      for (let i = 0; i < events.length; i++) {
        if (events[i].kind !== "message" || events[i].senderId !== account) push(records, events[i]);
      }
      if (records.length) post({ type: "iy:dmarchive-events", account, source, observedAt, records });
    }

    function watchSocket(socket) {
      if (!account) return;
      try {
        if (seenGet(sockets, socket)) return;
        const type = socketTarget(socketUrl(socket));
        if (!type) { seenSet(sockets, socket, true); return; }
        if (!current(generation)) return;
        const owner = account;
        let queue = resolve();
        const listener = event => {
          if (!event.isTrusted || owner !== account || queuedFrames >= 16) return;
          const stamp = generation;
          let data;
          try { data = eventData(event); } catch (_) { return; }
          const observedAt = now();
          queuedFrames++;
          const runJob = done => {
            let finished = false;
            const complete = () => {
              if (finished) return;
              finished = true;
              queuedFrames--;
              done();
            };
            const process = payload => {
              try {
                if (!current(stamp)) return;
                if (typeof payload !== "string" && arrayBufferLength(payload) > MAX_BODY) return;
                emit(frameRecords(payload, type), stamp, "socket", observedAt);
              } catch (_) { /* A malformed frame must not affect Instagram. */ }
              finally { complete(); }
            };
            try {
              if (!current(stamp)) { complete(); return; }
              if (typeof data !== "string" && instanceOf(BlobCtor, data)) {
                if (blobSize(data) > MAX_BODY) { complete(); return; }
                safeThen(blobBuffer(data), buffer => { process(buffer); }, () => { complete(); });
                return;
              }
              process(data);
            } catch (_) { complete(); }
          };
          // Preserve wire order even when Firefox delivers an earlier frame as a Blob.
          const previous = queue;
          queue = new PromiseCtor(finish => {
            safeThen(previous, () => {
              schedule(() => { runJob(finish); }, 0);
            });
          });
        };
        add(socket, "message", listener);
        seenSet(sockets, socket, true);
      } catch (_) {}
    }

    function requestType(url, friendly, body, response = false) {
      return httpTarget(url, "https://www.instagram.com", friendly, body, response || !!threadFromPath(path(loc)));
    }

    function readFetchText(response, stamp, inFlight, onDone) {
      let reader = null;
      let done = false;
      const finish = text => {
        if (done) return;
        done = true;
        if (reader) {
          // Tee cancellation can wait on Instagram's branch. Never await it.
          setDelete(inFlight.readers, reader);
          try { safeThen(cancel(reader), undefined, () => {}); } catch (_) {}
        }
        onDone(text);
      };
      try {
        const headers = responseHeaders(response);
        if (!jsonResponseType(getHeader(headers, "content-type")) || +getHeader(headers, "content-length") > MAX_BODY ||
            !responseBody(response)) { finish(""); return; }
        reader = getReader(responseBody(cloneResponse(response)));
        setAdd(inFlight.readers, reader);
        const decoder = new TextDecoderCtor("utf-8", { __proto__: null, fatal: true });
        let size = 0;
        let text = "";
        const step = () => {
          if (!current(stamp)) { finish(""); return; }
          let next;
          try { next = read(reader); } catch (_) { finish(""); return; }
          safeThen(next, chunk => {
            try {
              if (!chunk || typeof chunk !== "object" || !OWN(chunk, "done")) { finish(""); return; }
              if (chunk.done) { finish(text + decode(decoder, undefined)); return; }
              const value = OWN(chunk, "value") ? chunk.value : null;
              if (!value) { finish(""); return; }
              size += byteLength(value);
              if (size > MAX_BODY) { finish(""); return; }
              text += decode(decoder, value, { __proto__: null, stream: true });
              step();
            } catch (_) { finish(""); }
          }, () => { finish(""); });
        };
        step();
      } catch (_) { finish(""); }
    }

    function watchFetch(pending, url, friendly, body) {
      const inFlight = work;
      if (!account || inFlight.fetches >= 4) return;
      try {
        const type = requestType(url, friendly, body);
        const stamp = generation;
        if (!type || !current(stamp)) return;
        const observedAt = now();
        inFlight.fetches++;
        let released = false;
        const release = () => {
          if (released) return;
          released = true;
          inFlight.fetches--;
        };
        safeThen(pending, response => {
          try {
            if (!current(stamp) || !responseOk(response) || requestType(responseUrl(response), friendly, body, true) !== type) {
              release();
              return;
            }
            readFetchText(response, stamp, inFlight, text => {
              try {
                if (text && current(stamp)) emit(httpRecords(text, type), stamp, "http", observedAt);
              } catch (_) {}
              finally { release(); }
            });
          } catch (_) { release(); }
        }, () => { release(); });
      } catch (_) {}
    }

    function resetXhr(xhr) {
      const entry = seenGet(xhrs, xhr);
      if (!entry) return;
      seenDelete(xhrs, xhr);
      entry.work.xhrs--;
      remove(xhr, "loadend", entry.listener, true);
    }

    function watchXhr(xhr, url, friendly, body) {
      const inFlight = work;
      if (!account || inFlight.xhrs >= 8) return;
      try {
        const type = requestType(url, friendly, body);
        const stamp = generation;
        if (!type || !current(stamp)) return;
        resetXhr(xhr);
        const observedAt = now();
        const listener = event => {
          if (!event.isTrusted) return;
          resetXhr(xhr);
          try {
            const mode = xhrType(xhr);
            const status = xhrStatus(xhr);
            if (!current(stamp) || status < 200 || status >= 300 || (mode && mode !== "text" && mode !== "json") ||
                requestType(xhrUrl(xhr), friendly, body, true) !== type) return;
            if (xhrHeader && (!jsonResponseType(xhrHeader(xhr, "content-type")) ||
                +xhrHeader(xhr, "content-length") > MAX_BODY)) return;
            const value = mode === "json" ? xhrJson(xhr) : xhrText(xhr);
            schedule(() => {
              try { if (current(stamp)) emit(httpRecords(value, type), stamp, "http", observedAt); } catch (_) {}
            }, 0);
          } catch (_) {}
        };
        add(xhr, "loadend", listener, true);
        seenSet(xhrs, xhr, { listener, work: inFlight });
        inFlight.xhrs++;
      } catch (_) {}
    }

    function scanRows(threadId, requestId) {
      const stamp = generation;
      try {
        if (!found || !safeInt(requestId) || requestId < 1 || !current(stamp) ||
            !accountId(threadId) || threadFromPath(path(loc)) !== threadId) return;
        const rows = scan(threadId, (el, index) => {
          dispatch(el, new EventCtor(found, { __proto__: null, detail: requestId + ":" + index }));
        });
        if (current(stamp) && threadFromPath(path(loc)) === threadId) {
          post({ type: "iy:dmarchive-rows", account, threadId, requestId, rows });
        }
      } catch (_) { /* An unknown React/Relay version leaves list placement unavailable. */ }
    }

    return { configure, isEnabled: () => !!account, watchSocket, watchFetch, watchXhr, resetXhr, scanRows };
  }

  const api = { MAX_EVENTS, MAX_ROWS, accountId, accountFromCookie, threadFromPath, messageId, time,
    normalizeEvent, httpTarget, socketTarget, httpRecords, frameRecords, createCapture };
  if (node) module.exports = api;
  else iy.dmCapture = Object.freeze(api);
})();
