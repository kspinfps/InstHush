// Adapted in part from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
(function () {
  "use strict";
  // Keep private references and remove the page-visible global, so page
  // scripts cannot swap our rule functions.
  const rawIY = globalThis.IY;
  const lightspeed = rawIY && rawIY.lightspeed && typeof rawIY.lightspeed === "object"
    ? Object.freeze({ ...rawIY.lightspeed }) : null;
  const IY = Object.freeze({ ...rawIY });
  try { delete globalThis.IY; } catch (_) { /* ignore */ }
  // document_start: capture every built-in the security-relevant paths use before page
  // scripts run, so a page that patches Map/Array/JSON/URL/... cannot steer the private
  // channel, the avatar cache or the filters. RegExp internals (exec/Symbol.*) cannot be
  // captured this way and stay a documented residual.
  const uncurry = Function.prototype.bind.bind(Function.prototype.call);
  const instanceOf = uncurry(Function.prototype[Symbol.hasInstance]);
  const JSONparse = JSON.parse;
  const JSONstringify = JSON.stringify;
  const encodeUri = encodeURIComponent;
  const isArray = Array.isArray;
  const objectKeys = Object.keys;
  const hasOwn = Object.hasOwn;
  const regexExec = uncurry(RegExp.prototype.exec);
  const reflectApply = Reflect.apply;
  const getDescriptor = Object.getOwnPropertyDescriptor;
  const defineProperty = Object.defineProperty;
  const defineProperties = Object.defineProperties;
  const objectCreate = Object.create;
  const PromiseCtor = Promise;
  function append(list, value) {
    defineProperty(list, list.length, { __proto__: null, value, enumerable: true, writable: true, configurable: true });
  }
  const EVENT_TYPES = ["readystatechange", "load", "loadend"];
  const META_KEYS = ["url", "redirected", "type"];
  const FETCH_INIT_KEYS = [
    "method", "headers", "body", "referrer", "referrerPolicy", "mode",
    "credentials", "cache", "redirect", "integrity", "keepalive", "signal",
    "duplex", "priority", "window"
  ];
  const GRAPHQL_INSPECT_CAP = 1024 * 1024;
  const TYPING_INSPECT_CAP = 8192;
  const WS_INSPECT_CAP = 1024 * 1024;
  const numberIsFinite = Number.isFinite;
  const numberIsInteger = Number.isInteger;
  const numberIsSafeInteger = Number.isSafeInteger;
  const mathMin = Math.min;
  const dateNow = Date.now;
  const queueTask = queueMicrotask;
  const MapCtor = Map;
  const WeakMapCtor = WeakMap;
  const URLCtor = URL;
  const URLSearchParamsCtor = URLSearchParams;
  const FormDataCtor = FormData;
  const ArrayBufferCtor = ArrayBuffer;
  const ResponseCtor = Response;
  const RequestCtor = Request;
  const HeadersCtor = Headers;
  const metadataGetters = META_KEYS.map(key => getterOf(ResponseCtor.prototype, key));
  const requestUrl = getterOf(RequestCtor.prototype, "url");
  const requestMethod = getterOf(RequestCtor.prototype, "method");
  const requestHeaders = getterOf(RequestCtor.prototype, "headers");
  const urlHref = getterOf(URLCtor.prototype, "href");
  const responseOk = getterOf(ResponseCtor.prototype, "ok");
  const responseBody = getterOf(ResponseCtor.prototype, "body");
  const responseUsed = getterOf(ResponseCtor.prototype, "bodyUsed");
  const responseHeaders = getterOf(ResponseCtor.prototype, "headers");
  const responseStatus = getterOf(ResponseCtor.prototype, "status");
  const responseStatusText = getterOf(ResponseCtor.prototype, "statusText");
  const streamLocked = getterOf(globalThis.ReadableStream?.prototype, "locked");
  const responseText = cap(ResponseCtor.prototype, "text");
  const headerEntries = cap(HeadersCtor.prototype, "entries");
  const headerNext = uncurry(Object.getPrototypeOf(new HeadersCtor().entries()).next);
  const stopEvent = uncurry(Event.prototype.stopImmediatePropagation);
  const sourceOf = getterOf(MessageEvent.prototype, "source");
  const EventCtor = Event;
  const MessageEventCtor = typeof MessageEvent === "function" ? MessageEvent : null;
  const BlobCtor = typeof Blob === "function" ? Blob : null;
  const ReadableStreamCtor = typeof ReadableStream === "function" ? ReadableStream : null;
  const DocumentCtor = typeof Document === "function" ? Document : null;
  const scheduleTimeout = typeof setTimeout === "function" ? setTimeout : null;
  const cancelTimeout = typeof clearTimeout === "function" ? clearTimeout : null;
  const WeakSetCtor = WeakSet;
  const wsHas = uncurry(WeakSet.prototype.has);
  const wsAdd = uncurry(WeakSet.prototype.add);
  const promiseResolve = Promise.resolve.bind(Promise);
  const mapGet = uncurry(Map.prototype.get);
  const mapSet = uncurry(Map.prototype.set);
  const mapHas = uncurry(Map.prototype.has);
  const mapDelete = uncurry(Map.prototype.delete);
  const mapClear = uncurry(Map.prototype.clear);
  const mapKeys = uncurry(Map.prototype.keys);
  const mapValues = uncurry(Map.prototype.values);
  const mapSize = uncurry(Object.getOwnPropertyDescriptor(Map.prototype, "size").get);
  const iterNext = uncurry(Object.getPrototypeOf(new Map().keys()).next);
  const wmGet = uncurry(WeakMap.prototype.get);
  const wmSet = uncurry(WeakMap.prototype.set);
  const wmHas = uncurry(WeakMap.prototype.has);
  const wmDelete = uncurry(WeakMap.prototype.delete);
  const strIncludes = uncurry(String.prototype.includes);
  const strLower = uncurry(String.prototype.toLowerCase);
  const strSlice = uncurry(String.prototype.slice);
  const strSplit = uncurry(String.prototype.split);
  const strTrim = uncurry(String.prototype.trim);
  const strReplaceAll = uncurry(String.prototype.replaceAll);
  const arraySlice = uncurry(Array.prototype.slice);
  const urlSearchParams = uncurry(Object.getOwnPropertyDescriptor(URL.prototype, "searchParams").get);
  const urlPathname = uncurry(Object.getOwnPropertyDescriptor(URL.prototype, "pathname").get);
  const urlOrigin = getterOf(URL.prototype, "origin");
  const paramsGet = uncurry(URLSearchParams.prototype.get);
  const paramsString = uncurry(URLSearchParams.prototype.toString);
  const paramsEntries = uncurry(URLSearchParams.prototype.entries);
  const paramsNext = uncurry(Object.getPrototypeOf(new URLSearchParams().entries()).next);
  const formGet = uncurry(FormData.prototype.get);
  const formEntries = uncurry(FormData.prototype.entries);
  const formNext = uncurry(Object.getPrototypeOf(new FormData().entries()).next);
  const str = String;
  const strUpper = uncurry(String.prototype.toUpperCase);
  const strCharCode = uncurry(String.prototype.charCodeAt);
  const isView = ArrayBuffer.isView;
  // Optional built-ins: capture when present, otherwise call the method normally.
  function cap(proto, name) {
    const fn = proto && proto[name];
    return typeof fn === "function" ? uncurry(fn) : function (self, a, b) { return self[name](a, b); };
  }
  function getterOf(proto, name) {
    for (let p = proto; p; p = Object.getPrototypeOf(p)) {
      const get = getDescriptor(p, name)?.get;
      if (get) return uncurry(get);
    }
    return self => self[name];
  }
  const U8 = Uint8Array;
  const TAProto = Object.getPrototypeOf(Uint8Array).prototype;
  function u8Slice(bytes, start = 0, end = taLength(bytes)) {
    return new U8(new U8(taBuffer(bytes), taOffset(bytes) + start, end - start));
  }
  const u8IndexOf = cap(TAProto, "indexOf");
  const taBuffer = getterOf(TAProto, "buffer");
  const taOffset = getterOf(TAProto, "byteOffset");
  const taByteLength = getterOf(TAProto, "byteLength");
  const taLength = getterOf(TAProto, "length");
  const dvBuffer = getterOf(typeof DataView === "function" ? DataView.prototype : null, "buffer");
  const dvOffset = getterOf(typeof DataView === "function" ? DataView.prototype : null, "byteOffset");
  const dvByteLength = getterOf(typeof DataView === "function" ? DataView.prototype : null, "byteLength");
  const decodeBytes = cap(TextDecoder.prototype, "decode");
  const blobText = cap(BlobCtor?.prototype, "text");
  const blobSlice = cap(BlobCtor?.prototype, "slice");
  const blobSize = getterOf(BlobCtor?.prototype, "size");
  const promiseThen = uncurry(Promise.prototype.then);
  function safeThen(promise, onFulfilled, onRejected) {
    const prev = getDescriptor(promise, "constructor");
    let patched = false;
    try {
      defineProperty(promise, "constructor", { __proto__: null, value: undefined, configurable: true, writable: true });
      patched = true;
    } catch (_) {}
    try {
      return promiseThen(promise, onFulfilled, onRejected);
    } finally {
      if (patched) {
        try {
          if (prev) defineProperty(promise, "constructor", prev);
          else delete promise.constructor;
        } catch (_) {}
      }
    }
  }
  function settleInto(promise, resolve, reject) {
    safeThen(promise, value => { resolve(value); }, error => { reject(error); });
  }
  function afterRead(promise, decide, onFail) {
    return new PromiseCtor((resolve, reject) => {
      safeThen(promise, text => {
        let next;
        try { next = decide(text); }
        catch (_) {
          hit("error");
          try { next = onFail(); }
          catch (err) { reject(err); return; }
        }
        settleInto(next, resolve, reject);
      }, () => {
        hit("error");
        let next;
        try { next = onFail(); }
        catch (err) { reject(err); return; }
        settleInto(next, resolve, reject);
      });
    });
  }
  const headersGet = cap(typeof Headers === "function" ? Headers.prototype : null, "get");
  const headersAppend = cap(typeof Headers === "function" ? Headers.prototype : null, "append");
  const requestClone = cap(Request.prototype, "clone");
  const requestBody = getterOf(Request.prototype, "body");
  const streamGetReader = cap(ReadableStreamCtor?.prototype, "getReader");
  const streamTee = cap(ReadableStreamCtor?.prototype, "tee");
  const streamCancel = cap(ReadableStreamCtor?.prototype, "cancel");
  const readerRead = cap(typeof ReadableStreamDefaultReader === "function" ? ReadableStreamDefaultReader.prototype : null, "read");
  const readerCancel = cap(typeof ReadableStreamDefaultReader === "function" ? ReadableStreamDefaultReader.prototype : null, "cancel");
  const u8Set = cap(TAProto, "set");
  const xhrUrls = new WeakMapCtor();
  const xhrMethods = new WeakMapCtor();
  const xhrAsync = new WeakMapCtor();
  const xhrGen = new WeakMapCtor();
  const ANALYTICS_WAIT_MS = 1500;
  const MAX_PENDING_ANALYTICS = 64;
  let analyticsPending = true;
  let pendingAnalytics = [];
  let analyticsTimer = null;
  function armAnalyticsTimer() {
    if (analyticsTimer !== null || !scheduleTimeout) return;
    try {
      analyticsTimer = scheduleTimeout(function () {
        analyticsTimer = null;
        settleAnalytics(cfg.blockAnalytics);
      }, ANALYTICS_WAIT_MS);
    } catch (_) { analyticsTimer = null; }
  }
  function settleAnalytics(blocked) {
    if (!analyticsPending) return;
    analyticsPending = false;
    if (analyticsTimer !== null && cancelTimeout) {
      try { cancelTimeout(analyticsTimer); } catch (_) {}
    }
    analyticsTimer = null;
    if (!pendingAnalytics.length) return;
    const queue = pendingAnalytics;
    pendingAnalytics = [];
    for (let i = 0; i < queue.length; i++) {
      try { queue[i].run(blocked); } catch (_) { hit("error"); }
    }
  }
  const defaults = { video: true, ads: true, ghostStory: true, ghostDm: true, ghostTyping: false, blockAnalytics: false, suggested: false, noReels: false, mute: { words: [], accounts: [] } };
  let cfg = { ...defaults };
  let channel = null;
  const portPost = uncurry(MessagePort.prototype.postMessage);
  const portStart = uncurry(MessagePort.prototype.start);
  const portClose = uncurry(MessagePort.prototype.close);
  const portListen = uncurry(MessagePort.prototype.addEventListener);
  const eventData = uncurry(Object.getOwnPropertyDescriptor(MessageEvent.prototype, "data").get);
  const eventPorts = uncurry(Object.getOwnPropertyDescriptor(MessageEvent.prototype, "ports").get);
  const dmCapture = IY.dmCapture?.createCapture({ post(value) {
    if (channel) portPost(channel, value);
  } });
  let profileEnabled = false, profileQuery = null;
  const profileOperation = "PolarisProfilePostsQuery";
  function observeProfile(url, method, friendly, body) {
    if (!profileEnabled || strUpper(method || "") !== "POST" || !body ||
        (friendly && friendly !== profileOperation)) return;
    try {
      const parsed = new URLCtor(url, location.href);
      if (urlOrigin(parsed) !== location.origin || !regexExec(/^\/(?:api\/graphql|graphql\/query)\/?$/, urlPathname(parsed))) return;
      let form = body, get = paramsGet;
      if (typeof body === "string") {
        if (body.length > 65536 || !strIncludes(body, profileOperation)) return;
        form = new URLSearchParamsCtor(body);
      } else if (instanceOf(FormDataCtor, body)) get = formGet;
      else if (!(instanceOf(URLSearchParamsCtor, body))) return;
      if ((get(form, "fb_api_req_friendly_name") || friendly) !== profileOperation) return;
      const docId = get(form, "doc_id"), raw = get(form, "variables");
      if (!regexExec(/^\d{1,40}$/, docId || "") || typeof raw !== "string" || raw.length > 32768) return;
      const variables = JSONparse(raw);
      const user = IY.profileUsernameFromPath?.(location.pathname);
      if (!user || !variables || typeof variables !== "object" || isArray(variables) ||
          (hasOwn(variables, "username") && (typeof variables.username !== "string" || strLower(variables.username) !== strLower(user)))) return;
      const fbDtsg = get(form, "fb_dtsg"), lsd = get(form, "lsd");
      if ((fbDtsg && (typeof fbDtsg !== "string" || fbDtsg.length > 1024)) ||
          (lsd && (typeof lsd !== "string" || lsd.length > 1024))) return;
      profileQuery = { user: strLower(user), at: dateNow(), query: { friendlyName: profileOperation, docId, variables, fbDtsg, lsd } };
    } catch (_) { /* Unknown request shape. */ }
  }
  function onChannel(event) {
    const data = eventData(event);
    const ports = eventPorts(event);
    const source = sourceOf(event) ?? getDescriptor(event, "source")?.value;
    if (!event.isTrusted || source !== window || !data || !hasOwn(data, "type") ||
        data.type !== "iy:channel" || !hasOwn(ports, 0)) return;
    stopEvent(event);
    if (channel) { portClose(ports[0]); return; }
    channel = ports[0];
    portListen(channel, "message", function (message) {
      try {
        const data = eventData(message);
        const type = data && typeof data === "object" && hasOwn(data, "type") ? data.type : null;
        if (type === "iy:relay-req" && hasOwn(data, "id") && numberIsSafeInteger(data.id) &&
            hasOwn(data, "op") && typeof data.op === "string") {
          portPost(channel, IY.relayRequest(data));
        } else if (type === "iy:dmallow") setAllow(data);
        else if (type === "iy:dmcancel") allow = null;
        else if (type === "iy:dmarchive-config") {
          dmCapture?.configure(hasOwn(data, "account") ? data.account : null, hasOwn(data, "found") ? data.found : "");
        } else if (type === "iy:dmarchive-scan") {
          dmCapture?.scanRows(hasOwn(data, "threadId") ? data.threadId : null, hasOwn(data, "requestId") ? data.requestId : null);
        } else if (type === "iy:profile-config") {
          profileEnabled = hasOwn(data, "enabled") && data.enabled === true;
          if (!profileEnabled) profileQuery = null;
        } else if (type === "iy:profile-query" && hasOwn(data, "id") && numberIsSafeInteger(data.id)) {
          const user = IY.profileUsernameFromPath?.(location.pathname);
          const matches = profileEnabled && user && profileQuery && hasOwn(data, "username") && typeof data.username === "string" &&
            profileQuery.user === strLower(data.username) && profileQuery.user === strLower(user) &&
            dateNow() - profileQuery.at < 600000;
          portPost(channel, { type: "iy:profile-result", id: data.id, query: matches ? profileQuery.query : null });
        } else readCfg(data);
      } catch (_) { /* Ignore malformed config. */ }
    });
    portStart(channel);
    portPost(channel, { type: "iy:ack" });
    flushPending();
  }
  window.addEventListener("message", onChannel, true);
  // One-shot DM read allowance: lets exactly one receipt for one thread through.
  // It only ever arrives over the private channel; we never send a request ourselves.
  const ALLOW_DEFAULT_MS = 10000;
  let allow = null;
  function setAllow(data) {
    if (!data || !hasOwn(data, "id") || !IY.validThreadId(data.id)) { allow = null; return; }
    const rawMs = hasOwn(data, "ms") ? data.ms : undefined;
    const ms = numberIsFinite(rawMs) ? mathMin(15000, rawMs < 1000 ? 1000 : rawMs) : ALLOW_DEFAULT_MS;
    allow = { id: data.id, until: dateNow() + ms };
    checkAllowRoute();
  }
  // The allowance is bound to the route: it also needs the current pathname to be exactly
  // that thread, so a receipt fired while navigating to another chat can never use it.
  function routeThreadId() {
    try { return IY.threadIdFromPath(location.pathname); } catch (_) { return null; }
  }
  function allowMatches(id) {
    return !!allow && typeof id === "string" && id === allow.id && dateNow() <= allow.until &&
      routeThreadId() === allow.id;
  }
  // Synchronous (no channel round trip): called on cfg change and on every route signal.
  function checkAllowRoute() {
    if (allow && routeThreadId() !== allow.id) allow = null;
  }
  function consumeAllow() {
    allow = null;
    try { if (channel) portPost(channel, { type: "iy:dmused" }); } catch (_) { /* ignore */ }
  }
  const pending = objectCreate(null);
  const MAX_PENDING = 1000;
  let pendingTotal = 0;
  let scheduled = false;
  function drain() {
    const batch = { __proto__: null, ...pending };
    const keys = objectKeys(batch);
    for (let i = 0; i < keys.length; i++) {
      delete pending[keys[i]];
      pendingTotal -= batch[keys[i]];
    }
    for (let i = 0; i < keys.length; i++) {
      try { portPost(channel, { k: keys[i], n: batch[keys[i]] }); }
      catch (_) { /* Diagnostics must never interrupt the page. */ }
    }
  }
  function hit(k, n = 1) {
    try {
      const room = MAX_PENDING - pendingTotal;
      if (room <= 0) return;
      const count = mathMin(room, n);
      pending[k] = (pending[k] || 0) + count;
      pendingTotal += count;
      if (scheduled) return;
      scheduled = true;
      queueTask(function () {
        scheduled = false;
        if (!channel) return;
        drain();
      });
    } catch (_) { /* Fail open even if page event APIs are unavailable. */ }
  }
  const seenAvatars = new MapCtor();
  const pendingAvatars = new MapCtor();
  const MAX_AVATARS = 200;
  function hintUsername(url) {
    try {
      const parsed = new URLCtor(url, location.href);
      const fromQuery = paramsGet(urlSearchParams(parsed), "username");
      if (fromQuery && IY.isValidUsername && IY.isValidUsername(fromQuery)) return fromQuery;
    } catch (_) {}
    return null;
  }
  function emitAvatar(username, url, area) {
    try {
      if (typeof IY.buildAvatarMessage !== "function") return;
      const msg = IY.buildAvatarMessage(username, url, area);
      if (!msg) return;
      const key = strLower(msg.username);
      const score = numberIsFinite(area) && area > 0 ? area : 0;
      const prev = mapGet(seenAvatars, key);
      if (prev && (prev.score > score || (prev.score === score && prev.url === msg.url))) return;
      if (!prev && mapSize(seenAvatars) >= MAX_AVATARS) {
        const first = iterNext(mapKeys(seenAvatars)).value;
        if (first !== undefined) mapDelete(seenAvatars, first);
      }
      mapSet(seenAvatars, key, { url: msg.url, score });
      if (!channel) {
        if (mapSize(pendingAvatars) < MAX_AVATARS || mapHas(pendingAvatars, key)) mapSet(pendingAvatars, key, msg);
        return;
      }
      portPost(channel, msg);
    } catch (_) {}
  }
  // "Follows you" flag (I2): same capture path and gating as avatars; only the current
  // route's profile is reported, as a strict {type, username, follows:boolean} message.
  const seenFollows = new MapCtor();
  const pendingFollows = new MapCtor();
  function emitFollows(username, follows) {
    try {
      if (typeof IY.buildFollowsMessage !== "function") return;
      const msg = IY.buildFollowsMessage(username, follows);
      if (!msg) return;
      const key = strLower(msg.username);
      if (mapGet(seenFollows, key) === follows) return;
      if (!mapHas(seenFollows, key) && mapSize(seenFollows) >= MAX_AVATARS) {
        const first = iterNext(mapKeys(seenFollows)).value;
        if (first !== undefined) mapDelete(seenFollows, first);
      }
      mapSet(seenFollows, key, follows);
      if (!channel) {
        if (mapSize(pendingFollows) < MAX_AVATARS || mapHas(pendingFollows, key)) mapSet(pendingFollows, key, msg);
        return;
      }
      portPost(channel, msg);
    } catch (_) {}
  }
  function scanFollows(data, isBootstrap = false) {
    try {
      const only = IY.profileUsernameFromPath(location.pathname);
      if (!only || typeof IY.extractFollows !== "function") return;
      if (typeof data === "string" && (data.length > 1024 * 1024 || (!IY.hasFollowsMarker(data) &&
          !(isBootstrap && IY.hasFollowsBootstrapMarker(data))))) return;
      const wanted = strLower(only);
      const list = IY.extractFollows(data, isBootstrap);
      for (let i = 0; i < list.length; i++) {
        if (strLower(list[i].username) === wanted) emitFollows(list[i].username, list[i].follows);
      }
    } catch (_) {}
  }
  function scanAvatars(data, url, isBootstrap = false) {
    try {
      scanFollows(data, isBootstrap);
      if (!IY.profileUsernameFromPath(location.pathname) || typeof IY.extractAvatars !== "function") return;
      if (typeof data === "string" && data.length > 1024 * 1024) return;
      if (typeof data === "string" && !IY.hasAvatarMarker(data) &&
          !(isBootstrap && IY.hasAvatarBootstrapMarker && IY.hasAvatarBootstrapMarker(data))) return;
      const list = IY.extractAvatars(data, isBootstrap ? null : hintUsername(url), isBootstrap);
      // Bootstrap JSON carries many users (suggestions, viewer, ...): keep only the
      // profile of the current route.
      const only = isBootstrap ? IY.profileUsernameFromPath(location.pathname) : null;
      const wanted = only ? strLower(only) : null;
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (isBootstrap && (!wanted || strLower(item.username) !== wanted)) continue;
        emitAvatar(item.username, item.url, (item.width || 0) * (item.height || 0));
      }
    } catch (_) {}
  }
  function flushPending() {
    if (!channel) return;
    if (mapSize(pendingAvatars)) {
      const avatars = [];
      const it = mapValues(pendingAvatars);
      for (let step = iterNext(it); !step.done; step = iterNext(it)) append(avatars, step.value);
      mapClear(pendingAvatars);
      queueTask(function () {
        if (!channel) return;
        for (let i = 0; i < avatars.length; i++) {
          try { portPost(channel, avatars[i]); }
          catch (_) { /* Diagnostics must never interrupt the page. */ }
        }
      });
    }
    if (mapSize(pendingFollows)) {
      const items = [];
      const fit = mapValues(pendingFollows);
      for (let step = iterNext(fit); !step.done; step = iterNext(fit)) append(items, step.value);
      mapClear(pendingFollows);
      queueTask(function () {
        if (!channel) return;
        for (let i = 0; i < items.length; i++) {
          try { portPost(channel, items[i]); } catch (_) {}
        }
      });
    }
    if (!pendingTotal || scheduled) return;
    scheduled = true;
    queueTask(function () {
      scheduled = false;
      if (!channel || !pendingTotal) return;
      drain();
    });
  }
  function readCfg(value) {
    if (!value || typeof value !== "object" || isArray(value)) return;
    const count = objectKeys(value).length;
    if (count < 4 || count > 9) return;
    if (!hasOwn(value, "video") || !hasOwn(value, "ads") ||
        !hasOwn(value, "ghostStory") || !hasOwn(value, "ghostDm")) return;
    const expected = 4 + (hasOwn(value, "suggested") ? 1 : 0) + (hasOwn(value, "mute") ? 1 : 0) +
      (hasOwn(value, "noReels") ? 1 : 0) + (hasOwn(value, "ghostTyping") ? 1 : 0) +
      (hasOwn(value, "blockAnalytics") ? 1 : 0);
    if (count !== expected || (hasOwn(value, "mute") && !IY.validMute(value.mute))) return;
    if (typeof value.video !== "boolean" || typeof value.ads !== "boolean" ||
        typeof value.ghostStory !== "boolean" || typeof value.ghostDm !== "boolean") return;
    if (hasOwn(value, "suggested") && typeof value.suggested !== "boolean") return;
    if (hasOwn(value, "noReels") && typeof value.noReels !== "boolean") return;
    if (hasOwn(value, "ghostTyping") && typeof value.ghostTyping !== "boolean") return;
    if (hasOwn(value, "blockAnalytics") && typeof value.blockAnalytics !== "boolean") return;
    const adsChanged = cfg.ads !== value.ads;
    cfg = {
      video: value.video,
      ads: value.ads,
      ghostStory: value.ghostStory,
      ghostDm: value.ghostDm,
      ghostTyping: hasOwn(value, "ghostTyping") && value.ghostTyping === true,
      blockAnalytics: hasOwn(value, "blockAnalytics") && value.blockAnalytics === true,
      suggested: hasOwn(value, "suggested") && value.suggested === true,
      noReels: hasOwn(value, "noReels") && value.noReels === true,
      mute: IY.normalizeMute(hasOwn(value, "mute") ? value.mute : undefined)
    };
    if (!cfg.ghostDm) allow = null;
    syncDgwHook();
    if (adsChanged && bootstrapLoading) {
      if (cfg.ads) observe(bootstrap, document, { childList: true, subtree: true });
      else disconnect(bootstrap);
    }
    settleAnalytics(cfg.blockAnalytics);
  }
  const xhrProto = XMLHttpRequest.prototype;
  const xhrDispatch = cap(xhrProto, "dispatchEvent");
  const xhrListen = cap(xhrProto, "addEventListener");
  const xhrState = getterOf(xhrProto, "readyState");
  const xhrType = getterOf(xhrProto, "responseType");
  const originalOpen = xhrProto.open;
  const originalSend = xhrProto.send;
  const originalAbort = typeof xhrProto.abort === "function" ? xhrProto.abort : null;
  const originalFetch = window.fetch;
  const originalResponseClone = Response.prototype.clone;
  const originalWsSend = WebSocket.prototype.send;
  const socketUrl = getterOf(WebSocket.prototype, "url");
  const socketState = getterOf(WebSocket.prototype, "readyState");
  const socketBinaryType = getterOf(WebSocket.prototype, "binaryType");
  const socketDispatch = cap(WebSocket.prototype, "dispatchEvent");
  const originalSetHeader = xhrProto.setRequestHeader;
  const originalGetHeader = xhrProto.getResponseHeader;
  const originalBeacon = navigator.sendBeacon ? navigator.sendBeacon.bind(navigator) : null;
  const xhrFriendly = new WeakMapCtor();
  const decoder = new TextDecoder();
  const typingDecoder = new TextDecoder("utf-8", { fatal: true });
  const textGetter = Object.getOwnPropertyDescriptor(xhrProto, "responseText").get;
  const responseGetter = Object.getOwnPropertyDescriptor(xhrProto, "response").get;
  const overrides = new WeakMapCtor();

  // Roll back partial property changes before passing a failed interception through.
  function defineResponse(xhr, descriptors) {
    clearResponse(xhr);
    const previous = { __proto__: null };
    const keys = objectKeys(descriptors);
    for (let i = 0; i < keys.length; i++) previous[keys[i]] = getDescriptor(xhr, keys[i]);
    try { defineProperties(xhr, descriptors); }
    catch (error) {
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (previous[key]) defineProperty(xhr, key, previous[key]);
        else delete xhr[key];
      }
      throw error;
    }
    wmSet(overrides, xhr, previous);
  }
  function clearResponse(xhr) {
    const previous = wmGet(overrides, xhr);
    if (!previous) return;
    const names = objectKeys(previous);
    for (let i = 0; i < names.length; i++) {
      const key = names[i];
      if (previous[key]) defineProperty(xhr, key, previous[key]);
      else delete xhr[key];
    }
    wmDelete(overrides, xhr);
  }
  // Instagram sends GraphQL bodies as strings, URLSearchParams or FormData.
  // Only GraphQL URLs pay the (small) cost of turning the latter two into text.
  // Private Uint8Array view of an ArrayBuffer or ArrayBuffer view (no copy), else null.
  function bytesView(data) {
    if (instanceOf(ArrayBufferCtor, data)) return new U8(data);
    if (!isView(data)) return null;
    try { return new U8(taBuffer(data), taOffset(data), taByteLength(data)); }
    catch (_) { return new U8(dvBuffer(data), dvOffset(data), dvByteLength(data)); }
  }
  function coerceBody(body, allowStream, allowDoc) {
    if (body == null || typeof body === "string") return body;
    if ((BlobCtor && instanceOf(BlobCtor, body)) ||
        instanceOf(FormDataCtor, body) ||
        instanceOf(URLSearchParamsCtor, body) ||
        instanceOf(ArrayBufferCtor, body) ||
        isView(body) ||
        (allowStream && ReadableStreamCtor && instanceOf(ReadableStreamCtor, body)) ||
        (allowDoc && DocumentCtor && instanceOf(DocumentCtor, body))) return body;
    return str(body);
  }
  function friendlyParams(friendly) {
    if (!friendly) return "";
    const parts = strSplit(str(friendly), ",");
    let out = "";
    for (let i = 0; i < parts.length; i++) {
      const item = strTrim(parts[i]);
      if (!item) continue;
      let encoded;
      try { encoded = encodeUri(item); }
      catch (_) { encoded = strReplaceAll(item, "&", "%26"); }
      out += (out ? "&" : "") + "fb_api_req_friendly_name=" + encoded;
    }
    return out;
  }
  function appendBodyField(text, key, value, cap) {
    const piece = key === "fb_api_req_friendly_name"
      ? "fb_api_req_friendly_name=" + encodeUri(value)
      : strReplaceAll(value, "&", "%26");
    const sep = text ? "&" : "";
    if (text.length + sep.length + piece.length > cap) {
      const room = cap - text.length - sep.length;
      return { text: room > 0 ? text + sep + strSlice(piece, 0, room) : text, truncated: true };
    }
    return { text: text + sep + piece, truncated: false };
  }
  function inspectGraphqlBody(body, cap = GRAPHQL_INSPECT_CAP) {
    if (body == null) return { text: "", complete: true, truncated: false, blobs: null };
    if (typeof body === "string") return { text: body, complete: true, truncated: false, blobs: null };
    try {
      if (instanceOf(URLSearchParamsCtor, body)) {
        let text = "";
        let truncated = false;
        const entries = paramsEntries(body);
        for (let step = paramsNext(entries); !step.done; step = paramsNext(entries)) {
          const next = appendBodyField(text, step.value[0], step.value[1], cap);
          text = next.text;
          if (next.truncated) { truncated = true; break; }
        }
        return { text, complete: !truncated, truncated, blobs: null };
      }
      if (instanceOf(FormDataCtor, body)) {
        let text = "";
        let truncated = false;
        let hasNonString = false;
        let blobs = null;
        const entries = formEntries(body);
        for (let step = formNext(entries); !step.done; step = formNext(entries)) {
          const key = step.value[0], value = step.value[1];
          if (typeof value === "string") {
            if (!truncated) {
              const next = appendBodyField(text, key, value, cap);
              text = next.text;
              if (next.truncated) truncated = true;
            }
          } else {
            hasNonString = true;
            if (BlobCtor && instanceOf(BlobCtor, value)) {
              if (!blobs) blobs = [];
              append(blobs, { __proto__: null, key, blob: value });
            }
          }
        }
        return { text, complete: !truncated && !hasNonString, truncated, blobs };
      }
      if ((BlobCtor && instanceOf(BlobCtor, body)) ||
          (ReadableStreamCtor && instanceOf(ReadableStreamCtor, body))) {
        return { text: "", complete: false, truncated: false, blobs: null };
      }
      // Binary bodies are decoded from a private copy (safe for SharedArrayBuffer views).
      const view = bytesView(body);
      if (view) {
        const len = taLength(view);
        if (len <= cap) return { text: decodeBytes(decoder, u8Slice(view)), complete: true, truncated: false, blobs: null };
        return { text: decodeBytes(decoder, u8Slice(view, 0, cap)), complete: false, truncated: true, blobs: null };
      }
    } catch (_) { hit("error"); return { text: "", complete: false, truncated: false, blobs: null }; }
    return { text: "", complete: false, truncated: false, blobs: null };
  }
  // Only dedicated typing REST candidates pay this bounded synchronous cost.
  function inspectTypingSync(url, body, method) {
    if (!cfg.ghostTyping || !IY.typingHttpThread(url, method)) return "pass";
    if (body == null) return "pass";
    try {
      if (typeof body === "string") return IY.ghostTypingHttpMatch(url, body, method) ? "block" : "pass";
      if (instanceOf(URLSearchParamsCtor, body)) {
        return IY.ghostTypingHttpMatch(url, paramsString(body), method) ? "block" : "pass";
      }
      if (instanceOf(FormDataCtor, body)) {
        // Serialize with a captured encoder, preserving duplicate/unknown-field rejection.
        const entries = formEntries(body);
        let text = "";
        for (let i = 0; i <= 5; i++) {
          const step = formNext(entries);
          if (step.done) return IY.ghostTypingHttpMatch(url, text, method) ? "block" : "pass";
          if (typeof step.value[1] !== "string") return "unreadable";
          if (i === 5 || step.value[0].length > 32 || step.value[1].length > TYPING_INSPECT_CAP) return "pass";
          text += (i ? "&" : "") + encodeUri(step.value[0]) + "=" + encodeUri(step.value[1]);
          if (text.length > TYPING_INSPECT_CAP) return "pass";
        }
        return "pass";
      }
      if ((BlobCtor && instanceOf(BlobCtor, body)) ||
          (ReadableStreamCtor && instanceOf(ReadableStreamCtor, body))) return "unreadable";
      const view = bytesView(body);
      if (view) {
        if (taLength(view) > TYPING_INSPECT_CAP) return "unreadable";
        let decoded = "";
        try { decoded = decodeBytes(typingDecoder, u8Slice(view)); }
        catch (_) { return "pass"; }
        return IY.ghostTypingHttpMatch(url, decoded, method) ? "block" : "pass";
      }
      return "pass";
    } catch (_) { return "unreadable"; }
  }
  function ghostHit(key) { if (key !== "typing") hit(key); }
  // Meta also names the operation in the X-FB-Friendly-Name header; merge it in as
  // fb_api_req_friendly_name= entries so custom story/DM names match too.
  function ghostKeyText(url, plain, method, friendly) {
    if (!cfg.ghostStory && !cfg.ghostDm) return null;
    // Thread ids are read from the body only: a forged X-FB-Friendly-Name header must not
    // be able to contribute (or supply) the allowed id.
    const hdr = friendlyParams(friendly);
    let body = typeof plain === "string" ? plain : "";
    if (hdr) body = body ? hdr + "&" + body : hdr;
    const verb = typeof method === "string" ? method : "GET";
    if (cfg.ghostStory && IY.ghostStoryMatch(url, body, verb)) return "story";
    if (cfg.ghostDm && IY.ghostDmHttpMatch(url, body, verb)) {
      // "allow" means: pass this receipt. The caller consumes the allowance exactly once.
      return allow && allowMatches(IY.dmThreadId(url, typeof plain === "string" ? plain : "")) ? "allow" : "dm";
    }
    return null;
  }
  function ghostKey(url, rawBody, method, friendly) {
    const typingState = inspectTypingSync(url, rawBody, method);
    if (typingState === "block") return "typing";
    if (!cfg.ghostStory && !cfg.ghostDm) return null;
    const plain = typeof rawBody === "string" || !rawBody || !IY.isGraphqlUrl(url)
      ? rawBody
      : inspectGraphqlBody(rawBody, GRAPHQL_INSPECT_CAP).text;
    return ghostKeyText(url, plain, method, friendly);
  }
  function complete(xhr) {
    for (let t = 0; t < EVENT_TYPES.length; t++) {
      const type = EVENT_TYPES[t];
      // A handler may re-open the same XHR; stop faking events for it then.
      if (!wmHas(overrides, xhr)) break;
      // Native XHR invokes IDL handlers during dispatch. The fallback also supports
      // EventTarget-based XHR implementations without invoking native handlers twice.
      const key = "on" + type;
      let handler;
      let wrapped;
      let called = false;
      try {
        handler = xhr[key];
        if (typeof handler === "function") {
          wrapped = function (event) { called = true; return reflectApply(handler, this, [event]); };
          xhr[key] = wrapped;
        }
        const event = new EventCtor(type);
        xhrDispatch(xhr, event);
        if (wrapped && !called) reflectApply(handler, xhr, [event]);
      } catch (_) { hit("error"); }
      finally {
        try { if (wrapped && xhr[key] === wrapped) xhr[key] = handler; }
        catch (_) { hit("error"); }
      }
    }
  }
  function fake(xhr) {
    const body = xhrType(xhr) === "json" ? JSONparse(IY.fakeOkBody) : IY.fakeOkBody;
    const descriptors = { __proto__: null };
    descriptors.readyState = { __proto__: null, configurable: true, value: 4 };
    descriptors.status = { __proto__: null, configurable: true, value: 200 };
    descriptors.statusText = { __proto__: null, configurable: true, value: "OK" };
    descriptors.responseText = { __proto__: null, configurable: true, value: IY.fakeOkBody };
    descriptors.response = { __proto__: null, configurable: true, value: body };
    defineResponse(xhr, descriptors);
    try { queueTask(function () { complete(xhr); }); }
    catch (error) { clearResponse(xhr); throw error; }
  }
  function muteOn() { return !!(cfg.mute.words.length || cfg.mute.accounts.length); }
  function feedKind(url) {
    try { if (strIncludes(urlPathname(new URLCtor(url, location.href)), "/api/v1/feed/timeline")) return "feed"; } catch (_) {}
    return "";
  }
  function reelsOn(url) {
    if (!cfg.noReels || location.pathname !== "/") return false;
    if (IY.isGraphqlUrl(url)) return true;
    try { return !!regexExec(/^\/api\/v1\/feed\/timeline\/?$/, urlPathname(new URLCtor(url, location.href))); }
    catch (_) { return false; }
  }
  function filterFeed(text, url) {
    const ads = cfg.ads ? IY.filterAds(text) : { text, removed: 0, error: false };
    if (ads.removed) hit("ads", ads.removed);
    const suggested = cfg.suggested ? IY.filterSuggested(ads.text) : { text: ads.text, removed: 0, error: false };
    const kind = muteOn() ? feedKind(url) : "";
    const muted = muteOn() ? IY.filterMute(suggested.text, cfg.mute, kind) : { text: suggested.text, removed: 0, error: false };
    const reels = reelsOn(url) ? IY.filterReels(muted.text, feedKind(url)) : { text: muted.text, removed: 0, error: false };
    return { text: reels.text, removed: ads.removed + suggested.removed + muted.removed + reels.removed, error: ads.error || suggested.error || muted.error || reels.error };
  }
  function singleJsonPartial(xhr, text) {
    // Never hide bytes from incremental readers. Even pretty-printed JSON is
    // passed through conservatively: a newline may delimit NDJSON records.
    if (strIncludes(text, "\n") || strIncludes(text, "\r")) return false;
    let type;
    try { type = originalGetHeader ? reflectApply(originalGetHeader, xhr, ["content-type"]) : ""; }
    catch (_) { return false; }
    // Missing headers may be classified from the prefix; explicit stream or
    // unknown media types must keep their native partial-read behaviour.
    if (type) {
      const lowerType = strLower(type);
      if (regexExec(/stream|multipart|ndjson|json-seq|jsonl/, lowerType) ||
          !regexExec(/^(?:application|text)\/(?:[\w.+-]+\+)?json(?:\s*;|$)/, lowerType)) return false;
    }
    let i = 0;
    while (text[i] === " " || text[i] === "\t") i++;
    return text[i] === "{" || text[i] === "[";
  }
  function lazyAds(xhr, url, filterAdsOn, avatarOn) {
    let cached = false;
    let streamed = false;
    let avatarScanned = false;
    let filtered;
    function checkAvatar(data) {
      if (!avatarOn || avatarScanned || !data) return;
      avatarScanned = true;
      scanAvatars(data, url, false);
    }
    function read(getter) {
      const original = reflectApply(getter, xhr, []);
      try {
        if (xhrType(xhr) === "json") {
          if (xhrState(xhr) !== 4 || !original || typeof original !== "object") return original;
          checkAvatar(original);
          if (!filterAdsOn || (!cfg.ads && !cfg.suggested && !muteOn() && !reelsOn(url))) return original;
          if (!cached) {
            cached = true;
            filtered = original;
            // Mute only needs the stringify round trip when the parsed body holds a feed/comment root.
            if (!cfg.suggested && !(muteOn() && IY.hasMuteRoot(original, feedKind(url))) &&
                !(reelsOn(url) && IY.hasReelsRoot(original, feedKind(url)))) {
              // Retain the existing ad-only fast path when local mute is empty or cannot apply.
              const removed = cfg.ads ? IY.stripPayload(original) : 0;
              if (removed) hit("ads", removed);
              return filtered;
            }
            // Parsed XHR has no raw bytes: reject unsafe numbers before any mutation.
            let unsafe = false;
            const text = JSONstringify(original, function (key, value) {
              if (typeof value === "number" && numberIsInteger(value) && !numberIsSafeInteger(value)) unsafe = true;
              return value;
            });
            if (unsafe || IY.hasUnsafeInt(text)) return original;
            const result = filterFeed(text, url);
            if (result.removed) filtered = JSONparse(result.text);
            if (result.error) hit("error");
          }
          return filtered;
        }
        if (xhrType(xhr) !== "" && xhrType(xhr) !== "text") return original;
        if (xhrState(xhr) !== 4) {
          if (xhrState(xhr) === 3 && original) {
            // A normal JSON XHR can be read during LOADING too. Hide its partial
            // bytes so DONE can expose the filtered body without shifting offsets.
            if (!streamed && filterAdsOn && (cfg.ads || cfg.suggested || muteOn() || reelsOn(url)) &&
                singleJsonPartial(xhr, original)) return "";
            // Once any bytes reach an incremental reader, keep the entire body
            // native, including subsequent reads through the other text getter.
            streamed = true;
          }
          return original;
        }
        checkAvatar(original);
        if (streamed || !filterAdsOn) return original;
        if (!cached) {
          filtered = original;
          if (cfg.ads || cfg.suggested || muteOn() || reelsOn(url)) {
            const result = filterFeed(original, url);
            filtered = result.text;
            if (result.error) hit("error");
          }
          cached = true;
        }
        return filtered;
      } catch (_) { cached = true; filtered = original; hit("error"); return original; }
    }
    defineResponse(xhr, {
      __proto__: null,
      responseText: { __proto__: null, configurable: true, get: function () { return read(textGetter); } },
      response: { __proto__: null, configurable: true, get: function () { return read(responseGetter); } }
    });
    if (avatarOn && typeof xhr.addEventListener === "function") {
      xhrListen(xhr, "load", function () {
        if (avatarScanned || xhrState(xhr) !== 4) return;
        try {
          if (xhrType(xhr) === "json") checkAvatar(reflectApply(responseGetter, xhr, []));
          else if (xhrType(xhr) === "" || xhrType(xhr) === "text") checkAvatar(reflectApply(textGetter, xhr, []));
        } catch (_) {}
      }, { once: true });
    }
  }
  function bumpXhrGen(xhr) {
    const next = (wmGet(xhrGen, xhr) || 0) + 1;
    wmSet(xhrGen, xhr, next);
    return next;
  }
  xhrProto.open = function (method, url) {
    try { dmCapture?.resetXhr(this); } catch (_) { hit("error"); }
    try { clearResponse(this); } catch (_) { hit("error"); }
    bumpXhrGen(this);
    wmDelete(xhrFriendly, this);
    wmDelete(xhrUrls, this);
    wmDelete(xhrMethods, this);
    wmDelete(xhrAsync, this);
    const coercedMethod = str(method);
    const coercedUrl = typeof url === "string" ? url : instanceOf(URLCtor, url) ? urlHref(url) : url == null ? "" : str(url);
    wmSet(xhrMethods, this, coercedMethod);
    wmSet(xhrUrls, this, coercedUrl);
    wmSet(xhrAsync, this, arguments.length < 3 || arguments[2] === undefined || !!arguments[2]);
    const args = arraySlice(arguments);
    defineProperty(args, 0, { __proto__: null, value: coercedMethod, enumerable: true, writable: true, configurable: true });
    if (args.length > 1) {
      defineProperty(args, 1, { __proto__: null, value: coercedUrl, enumerable: true, writable: true, configurable: true });
    }
    return reflectApply(originalOpen, this, args);
  };
  if (originalAbort) {
    xhrProto.abort = function () {
      try { bumpXhrGen(this); } catch (_) {}
      return reflectApply(originalAbort, this, arguments);
    };
  }
  xhrProto.setRequestHeader = function (name, value) {
    if (arguments.length < 2) return reflectApply(originalSetHeader, this, arguments);
    const coercedName = str(name);
    const coercedValue = str(value);
    try {
      if (strLower(coercedName) === "x-fb-friendly-name") {
        // Native XHR combines repeated headers; keep every value so none escapes matching.
        const prev = wmGet(xhrFriendly, this);
        wmSet(xhrFriendly, this, prev ? prev + ", " + coercedValue : coercedValue);
      }
    } catch (_) { hit("error"); }
    const args = arraySlice(arguments);
    defineProperty(args, 0, { __proto__: null, value: coercedName, enumerable: true, writable: true, configurable: true });
    defineProperty(args, 1, { __proto__: null, value: coercedValue, enumerable: true, writable: true, configurable: true });
    return reflectApply(originalSetHeader, this, args);
  };
  function analyticsBlocked(url) {
    return cfg.blockAnalytics && typeof IY.analyticsMatch === "function" && IY.analyticsMatch(url);
  }
  function analyticsHold(url) {
    return analyticsPending && typeof IY.analyticsMatch === "function" && IY.analyticsMatch(url);
  }
  function holdAnalyticsFetch(self, target, init) {
    let safeInit = init === undefined || init === null ? init : undefined;
    if (init != null) {
      if (typeof init !== "object" && typeof init !== "function") {
        safeInit = init;
      } else {
        try { safeInit = snapshotInit(init).init; }
        catch (err) { return new PromiseCtor((_, reject) => reject(err)); }
      }
    }
    if (pendingAnalytics.length >= MAX_PENDING_ANALYTICS) return fakeFetch();
    return new PromiseCtor((resolve, reject) => {
      append(pendingAnalytics, {
        __proto__: null,
        run(blocked) {
          if (blocked) { settleInto(fakeFetch(), resolve, reject); return; }
          try {
            const pending = reflectApply(originalFetch, self, safeInit === undefined ? [target] : [target, safeInit]);
            settleInto(pending, resolve, reject);
          } catch (err) { reject(err); }
        }
      });
      armAnalyticsTimer();
    });
  }
  xhrProto.send = function (body) {
    if (!profileEnabled && !dmCapture?.isEnabled() && passthrough()) return reflectApply(originalSend, this, arguments);
    const coercedBody = coerceBody(body, false, true);
    const sendArgs = coercedBody !== body ? [coercedBody] : arguments;
    let blocked = false;
    let url = "";
    try {
      url = wmGet(xhrUrls, this) || "";
      if (analyticsBlocked(url)) { fake(this); return; }
      if (analyticsHold(url) && wmGet(xhrAsync, this) !== false) {
        if (pendingAnalytics.length >= MAX_PENDING_ANALYTICS) { fake(this); return; }
        const xhr = this;
        const gen = wmGet(xhrGen, xhr) || 0;
        const heldArgs = arguments.length === 0 ? [] : [coercedBody];
        append(pendingAnalytics, {
          __proto__: null,
          run(isBlocked) {
            if ((wmGet(xhrGen, xhr) || 0) !== gen) return;
            if (isBlocked) { try { fake(xhr); } catch (_) {} return; }
            try { reflectApply(originalSend, xhr, heldArgs); } catch (_) { hit("error"); }
          }
        });
        armAnalyticsTimer();
        return;
      }
      const method = wmGet(xhrMethods, this);
      const friendly = wmGet(xhrFriendly, this);
      if (cfg.ghostTyping) {
        const typingState = inspectTypingSync(url, coercedBody, method);
        if (typingState === "block" || typingState === "unreadable") {
          blocked = true;
          fake(this);
          return;
        }
      }
      if (cfg.ghostStory || cfg.ghostDm) {
        const isGraphqlPost = IY.isGraphqlUrl(url) && strUpper(method || "") === "POST";
        const info = isGraphqlPost ? inspectGraphqlBody(coercedBody, GRAPHQL_INSPECT_CAP) : { text: coercedBody, complete: true };
        const key = ghostKeyText(url, info.text, method, friendly);
        if (key === "allow") {
          if (info.complete) consumeAllow();
          else { blocked = true; ghostHit("dm"); fake(this); return; }
        } else if (key) {
          blocked = true;
          ghostHit(key);
          fake(this);
          return;
        } else if (isGraphqlPost && !info.complete) {
          const fallback = blockedKey(url, method, friendly);
          if (fallback) { blocked = true; ghostHit(fallback); fake(this); return; }
          if (!friendlyParams(friendly)) { blocked = true; ghostHit(cfg.ghostDm ? "dm" : "story"); fake(this); return; }
        }
      }
      const filterAdsOn = (cfg.ads || cfg.suggested || muteOn() || reelsOn(url)) && adUrl(url);
      dmCapture?.watchXhr(this, url, friendly, coercedBody);
      if (profileEnabled) observeProfile(url, method, friendly, coercedBody);
      const avatarOn = avatarUrl(url, coercedBody, friendly);
      if (filterAdsOn || avatarOn) lazyAds(this, url, filterAdsOn, avatarOn);
    } catch (_) {
      hit("error");
      // A matched seen call stays blocked even if faking the response failed.
      if (blocked) return;
      const method = wmGet(xhrMethods, this);
      const friendly = wmGet(xhrFriendly, this);
      const fallback = blockedKey(url, method, friendly);
      if (fallback) { ghostHit(fallback); try { fake(this); } catch (_) {} return; }
      if (!friendlyParams(friendly) && (cfg.ghostStory || cfg.ghostDm) && IY.isGraphqlUrl(url) &&
          (method == null || strUpper(method) === "POST")) {
        ghostHit(cfg.ghostDm ? "dm" : "story");
        try { fake(this); } catch (_) {}
        return;
      }
    }
    return reflectApply(originalSend, this, sendArgs);
  };
  function snapshotHeaders(rawHeaders) {
    if (rawHeaders == null) return { headers: rawHeaders, friendly: "" };
    if (instanceOf(HeadersCtor, rawHeaders)) {
      const copy = new HeadersCtor();
      const entries = headerEntries(rawHeaders);
      for (let step = headerNext(entries); !step.done; step = headerNext(entries)) {
        headersAppend(copy, step.value[0], step.value[1]);
      }
      return { headers: copy, friendly: headersGet(copy, "x-fb-friendly-name") || "" };
    }
    if (instanceOf(MapCtor, rawHeaders)) {
      const copy = [];
      let friendly = "";
      const keys = mapKeys(rawHeaders);
      for (let step = iterNext(keys); !step.done; step = iterNext(keys)) {
        const k = str(step.value);
        const v = str(mapGet(rawHeaders, step.value));
        const clonedPair = [];
        append(clonedPair, k);
        append(clonedPair, v);
        append(copy, clonedPair);
        if (strLower(k) === "x-fb-friendly-name") {
          friendly = friendly ? friendly + ", " + v : v;
        }
      }
      return { headers: copy, friendly };
    }
    if (isArray(rawHeaders)) {
      const copy = [];
      let friendly = "";
      for (let i = 0; i < rawHeaders.length; i++) {
        if (!hasOwn(rawHeaders, i)) continue;
        const pair = rawHeaders[i];
        if (!pair || typeof pair !== "object") {
          append(copy, pair);
          continue;
        }
        const k = str(pair[0]);
        const v = str(pair[1]);
        const clonedPair = [];
        append(clonedPair, k);
        append(clonedPair, v);
        append(copy, clonedPair);
        if (strLower(k) === "x-fb-friendly-name") {
          friendly = friendly ? friendly + ", " + v : v;
        }
      }
      return { headers: copy, friendly };
    }
    if (typeof rawHeaders === "object" || typeof rawHeaders === "function") {
      const copy = { __proto__: null };
      const keys = objectKeys(rawHeaders);
      let friendly = "";
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const v = str(rawHeaders[k]);
        defineProperty(copy, k, { __proto__: null, value: v, enumerable: true, writable: true, configurable: true });
        if (strLower(k) === "x-fb-friendly-name") {
          friendly = friendly ? friendly + ", " + v : v;
        }
      }
      return { headers: copy, friendly };
    }
    return { headers: rawHeaders, friendly: "" };
  }
  function snapshotInit(init) {
    const copy = { __proto__: null };
    let method;
    let hasMethod = false;
    let friendly = "";
    let hasHeaders = false;
    let body;
    let hasBody = false;
    const record = (key, raw) => {
      if (key === "method") {
        if (raw !== undefined) {
          method = str(raw);
          hasMethod = true;
          defineProperty(copy, key, { __proto__: null, value: method, enumerable: true, writable: true, configurable: true });
        }
      } else if (key === "headers") {
        if (raw !== undefined) {
          const snap = snapshotHeaders(raw);
          friendly = snap.friendly;
          hasHeaders = true;
          defineProperty(copy, key, { __proto__: null, value: snap.headers, enumerable: true, writable: true, configurable: true });
        }
      } else if (key === "body") {
        body = coerceBody(raw, true, false);
        hasBody = true;
        defineProperty(copy, key, { __proto__: null, value: body, enumerable: true, writable: true, configurable: true });
      } else {
        defineProperty(copy, key, { __proto__: null, value: raw, enumerable: true, writable: true, configurable: true });
      }
    };
    const keys = objectKeys(init);
    const seen = { __proto__: null };
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      seen[key] = true;
      record(key, init[key]);
    }
    for (let i = 0; i < FETCH_INIT_KEYS.length; i++) {
      const key = FETCH_INIT_KEYS[i];
      if (!seen[key] && key in init) record(key, init[key]);
    }
    return { init: copy, method, hasMethod, friendly, hasHeaders, body, hasBody };
  }
  // Buffer one GraphQL or profile response, strip ads when enabled, scan avatars passively,
  // and hand back an equivalent Response. Any failure returns the original bytes.
  function filterFetch(response, url, filterAdsOn, avatarOn) {
    if ((!filterAdsOn && !avatarOn) || !response || !responseOk(response) || !responseBody(response) || responseUsed(response) || streamLocked(responseBody(response))) return response;
    const type = headersGet(responseHeaders(response), "content-type") || "";
    // Streams (SSE, multipart @defer) are never buffered: that would stall incremental readers.
    if (regexExec(/event-stream|multipart/i, type)) return response;
    if (type && !regexExec(/json|javascript|text/i, type)) return response;
    return new PromiseCtor((resolve, reject) => {
      safeThen(responseText(response), function (text) {
        try {
          if (avatarOn) scanAvatars(text, url, false);
          if (!filterAdsOn || (!cfg.ads && !cfg.suggested && !muteOn() && !reelsOn(url))) {
            resolve(rebuild(response, text, false));
            return;
          }
          let result;
          try { result = filterFeed(text, url); }
          catch (_) { hit("error"); resolve(rebuild(response, text, false)); return; }
          if (result.error) hit("error");
          resolve(rebuild(response, result.removed ? result.text : text, !!result.removed));
        } catch (err) { reject(err); }
      }, reject);
    });
  }
  function rebuild(source, text, changed) {
    const headers = { __proto__: null };
    const entries = headerEntries(responseHeaders(source));
    for (let step = headerNext(entries); !step.done; step = headerNext(entries)) {
      const name = step.value[0];
      if (name !== "content-length" && name !== "content-encoding") headers[name] = step.value[1];
    }
    const out = new ResponseCtor(text, { __proto__: null, status: responseStatus(source), statusText: responseStatusText(source), headers });
    const metadata = { __proto__: null };
    for (let i = 0; i < META_KEYS.length; i++) {
      const key = META_KEYS[i];
      const own = getDescriptor(source, key);
      metadata[key] = own && hasOwn(own, "value") ? own.value : metadataGetters[i](source);
    }
    return preserveMetadata(out, metadata);
  }
  function preserveMetadata(out, metadata) {
    for (let i = 0; i < META_KEYS.length; i++) {
      const key = META_KEYS[i];
      defineProperty(out, key, { __proto__: null, configurable: true, value: metadata[key] });
    }
    defineProperty(out, "clone", { __proto__: null, configurable: true, writable: true, value: function clone() {
      return preserveMetadata(reflectApply(originalResponseClone, this, []), metadata);
    } });
    return out;
  }
  function adUrl(url) {
    if (IY.isGraphqlUrl(url)) return true;
    try {
      const path = urlPathname(new URLCtor(url, location.href));
      return strIncludes(path, "/api/v1/feed/timeline") || (muteOn() && !!regexExec(/^\/api\/v1\/media\/\d+\/comments\/?$/, path));
    }
    catch (_) { return false; }
  }
  function avatarUrl(url, body, friendly) {
    if (!IY.profileUsernameFromPath || !IY.profileUsernameFromPath(location.pathname)) return false;
    try {
      const parsed = new URLCtor(url, location.href);
      if (regexExec(/^\/api\/v1\/users\/(?:web_profile_info|[0-9]+\/info)\/?$/, urlPathname(parsed))) return true;
      if (!IY.isGraphqlUrl(url)) return false;
      // Profile operation names are inferred [Tahmin]; unknown doc IDs fail closed.
      const names = [friendly, paramsGet(urlSearchParams(parsed), "fb_api_req_friendly_name")];
      if (instanceOf(URLSearchParamsCtor, body)) append(names, paramsGet(body, "fb_api_req_friendly_name"));
      else if (instanceOf(FormDataCtor, body)) append(names, formGet(body, "fb_api_req_friendly_name"));
      else if (typeof body === "string" && body.length <= 65536) append(names, paramsGet(new URLSearchParamsCtor(body), "fb_api_req_friendly_name"));
      for (let i = 0; i < names.length; i++) {
        if (regexExec(/^(?:PolarisProfilePageContentQuery|PolarisProfilePageQuery|PolarisProfileHeaderQuery)$/, names[i] || "")) return true;
      }
      return false;
    } catch (_) { return false; }
  }
  function fakeFetch() {
    return new PromiseCtor(resolve => {
      resolve(new ResponseCtor(IY.fakeOkBody, {
        __proto__: null,
        status: 200,
        headers: { __proto__: null, "content-type": "application/json" }
      }));
    });
  }
  // Fail-closed key for a request whose body could not be read: matched on URL and
  // X-FB-Friendly-Name alone. Never "allow": without the body the thread id is unknown.
  function blockedKey(url, method, friendly) {
    try {
      if (!cfg.ghostStory && !cfg.ghostDm && !cfg.ghostTyping) return null;
      const verb = typeof method === "string" ? method : method === null ? "POST" : "GET";
      const name = friendlyParams(friendly);
      if (cfg.ghostStory && IY.ghostStoryMatch(url, name, verb)) return "story";
      if (cfg.ghostDm && IY.ghostDmHttpMatch(url, name, verb)) return "dm";
      if (cfg.ghostTyping && IY.typingHttpThread(url, verb)) return "typing";
    } catch (_) { /* fall through */ }
    return null;
  }
  function filtersOff() {
    return !analyticsPending && !cfg.ghostStory && !cfg.ghostDm && !cfg.ghostTyping && !cfg.blockAnalytics && !cfg.ads && !cfg.suggested && !cfg.noReels && !muteOn();
  }
  // Profile metadata also powers the existing avatar action when filters are off.
  function passthrough() {
    return filtersOff() && !(IY.profileUsernameFromPath && IY.profileUsernameFromPath(location.pathname));
  }
  window.fetch = function (input, init) {
    if (!profileEnabled && !dmCapture?.isEnabled() && passthrough()) return reflectApply(originalFetch, this, arguments);
    const isReq = instanceOf(RequestCtor, input);
    let url;
    try { url = isReq ? requestUrl(input) : instanceOf(URLCtor, input) ? urlHref(input) : str(input); }
    catch (err) { return new PromiseCtor((_, reject) => reject(err)); }
    if (analyticsBlocked(url)) return fakeFetch();
    if (analyticsHold(url)) return holdAnalyticsFetch(this, isReq ? input : url, init);
    const target = isReq ? input : url;
    let avatarOn = false;
    let method = null;
    let friendly = "", observedBody;
    let safeInit = init === undefined || init === null ? init : undefined;
    let initFailed = false;
    let initError;
    let forwardBranch = null;
    const cancelForwardBranch = () => {
      if (!forwardBranch) return;
      const branch = forwardBranch;
      forwardBranch = null;
      try { safeThen(streamCancel(branch), undefined, () => {}); } catch (_) {}
    };
    const forward = () => {
      forwardBranch = null;
      const pending = reflectApply(originalFetch, this, safeInit === undefined ? [target] : [target, safeInit]);
      dmCapture?.watchFetch(pending, url, friendly, observedBody);
      if (profileEnabled) observeProfile(url, method || "GET", friendly, observedBody);
      const filterAdsOn = (cfg.ads || cfg.suggested || muteOn() || reelsOn(url)) && adUrl(url);
      if (!filterAdsOn && !avatarOn) return pending;
      return new PromiseCtor((resolve, reject) => {
        safeThen(pending, response => {
          try {
            if (responseStatus(response) === 204 || responseStatus(response) === 205) {
              resolve(response);
              return;
            }
            const out = filterFetch(response, url, filterAdsOn, avatarOn);
            if (out === response) resolve(response);
            else settleInto(out, resolve, reject);
          } catch (err) { reject(err); }
        }, reject);
      });
    };
    // A receipt-shaped request whose body cannot be read or decided is blocked, never forwarded.
    const failClosed = (unreadableBody = false) => {
      const key = blockedKey(url, method, friendly);
      if (key) { cancelForwardBranch(); ghostHit(key); return fakeFetch(); }
      if (unreadableBody && !friendlyParams(friendly) && (cfg.ghostStory || cfg.ghostDm) &&
          IY.isGraphqlUrl(url) && (method === null || strUpper(method) === "POST")) {
        cancelForwardBranch();
        ghostHit(cfg.ghostDm ? "dm" : "story");
        return fakeFetch();
      }
      if (initFailed) { cancelForwardBranch(); return new PromiseCtor((_, reject) => reject(initError)); }
      return forward();
    };
    try {
      if (isReq) {
        method = requestMethod(input);
        friendly = headersGet(requestHeaders(input), "x-fb-friendly-name") || "";
      }
      let body;
      if (init != null) {
        if (typeof init !== "object" && typeof init !== "function") {
          safeInit = init;
        } else {
          let snap;
          try { snap = snapshotInit(init); }
          catch (err) { initFailed = true; initError = err; throw err; }
          safeInit = snap.init;
          if (snap.hasMethod) method = snap.method;
          if (snap.hasHeaders) friendly = snap.friendly;
          if (snap.hasBody) body = snap.body;
        }
      }
      if (method === null) method = "GET";
      observedBody = body;
      avatarOn = avatarUrl(url, body, friendly);
      if (cfg.ghostStory || cfg.ghostDm || cfg.ghostTyping) {
        const candidate = ghostKey(url, undefined, method, friendly);
        const graphqlPost = (cfg.ghostStory || cfg.ghostDm) && IY.isGraphqlUrl(url) && strUpper(method) === "POST";
        const typingPost = cfg.ghostTyping && !!IY.typingHttpThread(url, method);
        // REST receipts decide on the URL alone (thread id is in the path).
        if (candidate === "allow") { consumeAllow(); return forward(); }
        if (candidate && !IY.isGraphqlUrl(url)) { ghostHit(candidate); return fakeFetch(); }
        const decide = res => {
          const text = typeof res === "string" ? res : res.text;
          const truncated = typeof res === "object" && res !== null && !!res.truncated;
          observedBody = text;
          try {
            if (typingPost && !graphqlPost) {
              if (IY.ghostTypingHttpMatch(url, text, method)) {
                cancelForwardBranch();
                return fakeFetch();
              }
              if (truncated) return failClosed(true);
              return forward();
            }
            avatarOn = avatarUrl(url, text, friendly);
            const key = ghostKeyText(url, text, method, friendly);
            if (key === "allow") {
              if (truncated) { cancelForwardBranch(); ghostHit("dm"); return fakeFetch(); }
              consumeAllow();
              return forward();
            }
            if (key) {
              cancelForwardBranch();
              ghostHit(key);
              return fakeFetch();
            }
            if (truncated) return failClosed(true);
            return forward();
          } catch (_) { hit("error"); return failClosed(true); }
        };
        if (candidate || graphqlPost || typingPost) {
          const cap = typingPost && !graphqlPost ? TYPING_INSPECT_CAP : GRAPHQL_INSPECT_CAP;
          if (BlobCtor && instanceOf(BlobCtor, body)) {
            if (blobSize(body) <= cap) {
              return afterRead(blobText(body), text => decide({ text, truncated: false }), () => failClosed(true));
            }
            return afterRead(blobText(blobSlice(body, 0, cap)), text => decide({ text, truncated: true }), () => failClosed(true));
          }
          if (ReadableStreamCtor && instanceOf(ReadableStreamCtor, body)) {
            if (streamLocked(body)) return failClosed(true);
            const branches = streamTee(body);
            forwardBranch = branches[1];
            defineProperty(safeInit, "body", { __proto__: null, value: forwardBranch, enumerable: true, writable: true, configurable: true });
            return afterRead(readStream(branches[0], cap), decide, () => failClosed(true));
          }
          if (body == null && isReq && requestBody(input)) {
            return afterRead(readRequest(input, cap), decide, () => failClosed(true));
          }
          if (typingPost && !graphqlPost) {
            const state = inspectTypingSync(url, body, method);
            if (state === "block") return fakeFetch();
            if (state === "unreadable") return failClosed(true);
            return forward();
          }
          const info = inspectGraphqlBody(body, GRAPHQL_INSPECT_CAP);
          const key = ghostKeyText(url, info.text, method, friendly);
          if (key && key !== "allow") { ghostHit(key); return fakeFetch(); }
          if (info.blobs && info.blobs.length) {
            return afterRead(readFormBlobs(info.text, info.blobs, GRAPHQL_INSPECT_CAP, info.truncated), decide, () => failClosed(true));
          }
          if (key === "allow") {
            if (info.complete) consumeAllow();
            else { ghostHit("dm"); return fakeFetch(); }
          } else if (!info.complete) {
            return failClosed(true);
          }
        }
      }
    } catch (_) {
      hit("error");
      // Fail closed: an exception while deciding must not let a receipt through.
      return failClosed(true);
    }
    return forward();
  };
  function readFormBlobs(baseText, blobEntries, cap, initialTruncated = false) {
    return new PromiseCtor((resolve, reject) => {
      let text = baseText;
      let truncated = !!initialTruncated;
      let idx = 0;
      const next = () => {
        if (idx >= blobEntries.length) { resolve({ text, truncated }); return; }
        const entry = blobEntries[idx++];
        const room = cap - text.length;
        if (room <= 0) { truncated = true; resolve({ text, truncated }); return; }
        let pending;
        try {
          const size = blobSize(entry.blob);
          const slice = size > room ? (truncated = true, blobSlice(entry.blob, 0, room)) : entry.blob;
          pending = blobText(slice);
        } catch (err) { reject(err); return; }
        safeThen(pending, val => {
          try {
            const added = appendBodyField(text, entry.key, val, cap);
            text = added.text;
            if (added.truncated) truncated = true;
            next();
          } catch (err) { reject(err); }
        }, reject);
      };
      next();
    });
  }
  function readStream(stream, cap = GRAPHQL_INSPECT_CAP) {
    return new PromiseCtor((resolve, reject) => {
      let reader;
      try {
        reader = streamGetReader(stream);
      } catch (err) { reject(err); return; }
      const parts = [];
      let size = 0;
      let finished = false;
      const cancelReader = () => {
        try { safeThen(readerCancel(reader), undefined, () => {}); } catch (_) { /* ignore */ }
      };
      const decodeParts = () => {
        const bytes = new U8(size);
        let offset = 0;
        for (let i = 0; i < parts.length; i++) {
          u8Set(bytes, parts[i], offset);
          offset += taByteLength(parts[i]);
        }
        return decodeBytes(decoder, bytes);
      };
      const finishOk = (text, truncated) => {
        if (finished) return;
        finished = true;
        cancelReader();
        resolve({ text, truncated });
      };
      const finishErr = err => {
        if (finished) return;
        finished = true;
        cancelReader();
        reject(err);
      };
      const step = () => {
        let pending;
        try { pending = readerRead(reader); }
        catch (err) { finishErr(err); return; }
        safeThen(pending, result => {
          try {
            if (!result || typeof result !== "object" || !hasOwn(result, "done")) {
              finishErr(null);
              return;
            }
            if (result.done) {
              finishOk(decodeParts(), false);
              return;
            }
            const value = hasOwn(result, "value") ? result.value : null;
            const chunk = bytesView(value);
            if (!chunk) {
              finishErr(null);
              return;
            }
            const len = taByteLength(chunk);
            if (size + len > cap) {
              const room = cap - size;
              if (room > 0) {
                append(parts, u8Slice(chunk, 0, room));
                size += room;
              }
              finishOk(decodeParts(), true);
              return;
            }
            append(parts, u8Slice(chunk));
            size += len;
            step();
          } catch (err) { finishErr(err); }
        }, err => { finishErr(err); });
      };
      step();
    });
  }
  function readRequest(input, cap = GRAPHQL_INSPECT_CAP) {
    let stream;
    try { stream = requestBody(requestClone(input)); }
    catch (err) { return new PromiseCtor((_, reject) => reject(err)); }
    return readStream(stream, cap);
  }
  if (originalBeacon) {
    navigator.sendBeacon = function (url, data) {
      if (!analyticsPending && !cfg.ghostDm && !cfg.ghostStory && !cfg.ghostTyping && !cfg.blockAnalytics) return originalBeacon(url, data);
      const target = instanceOf(URLCtor, url) ? urlHref(url) : str(url);
      const coercedData = coerceBody(data, false, false);
      try {
        if (analyticsBlocked(target)) return true;
        if (analyticsHold(target)) {
          if (pendingAnalytics.length < MAX_PENDING_ANALYTICS) {
            append(pendingAnalytics, {
              __proto__: null,
              run(blocked) {
                if (blocked) return;
                try { originalBeacon(target, coercedData); } catch (_) { hit("error"); }
              }
            });
            armAnalyticsTimer();
          }
          return true;
        }
        if (cfg.ghostTyping) {
          const typingState = inspectTypingSync(target, coercedData, "POST");
          if (typingState === "block" || typingState === "unreadable") return true;
        }
        if (cfg.ghostStory || cfg.ghostDm) {
          const isGraphql = IY.isGraphqlUrl(target);
          const info = isGraphql ? inspectGraphqlBody(coercedData, GRAPHQL_INSPECT_CAP) : { text: coercedData, complete: true };
          const key = ghostKeyText(target, info.text, "POST", "");
          if (key === "allow") {
            if (info.complete) consumeAllow();
            else { ghostHit("dm"); return true; }
          } else if (key) {
            ghostHit(key);
            return true;
          } else if (isGraphql && !info.complete) {
            ghostHit(cfg.ghostDm ? "dm" : "story");
            return true;
          }
        }
      } catch (_) {
        hit("error");
        const fallback = blockedKey(target, "POST", "");
        if (fallback) { ghostHit(fallback); return true; }
        if ((cfg.ghostStory || cfg.ghostDm) && IY.isGraphqlUrl(target)) {
          ghostHit(cfg.ghostDm ? "dm" : "story");
          return true;
        }
      }
      return originalBeacon(target, coercedData);
    };
  }
  const queryScripts = document.querySelectorAll?.bind(document);
  let bootstrapPath = null, routeUrl = null;
  function scanAvatarBootstrap() {
    checkAllowRoute();
    const path = location.pathname;
    if (channel && routeUrl !== location.href) {
      routeUrl = location.href;
      try { portPost(channel, { type: "iy:route" }); } catch (_) {}
    }
    if (path === bootstrapPath) return;
    // A captured profile template belongs to one profile. Instagram can send the query
    // before DOMContentLoaded or before this route hook runs, so keep it on the same profile.
    if (profileQuery) {
      let routeUser = null;
      try { routeUser = IY.profileUsernameFromPath ? IY.profileUsernameFromPath(path) : null; } catch (_) { routeUser = null; }
      if (!routeUser || strLower(routeUser) !== profileQuery.user) profileQuery = null;
    }
    bootstrapPath = path;
    if (!IY.profileUsernameFromPath || !IY.profileUsernameFromPath(path)) return;
    if (!queryScripts) return;
    const scripts = queryScripts('script[type="application/json"]');
    for (let i = 0; i < scripts.length; i++) {
      const node = scripts[i];
      const text = node.textContent;
      if (IY.hasAvatarBootstrapMarker(text)) scanAvatars(text, location.href, true);
      else if (typeof IY.hasFollowsBootstrapMarker === "function" && IY.hasFollowsBootstrapMarker(text)) scanFollows(text, true);
    }
  }
  window.addEventListener("popstate", scanAvatarBootstrap);
  if (window.navigation) window.navigation.addEventListener("currententrychange", scanAvatarBootstrap);
  // History hooks cover browsers without the Navigation API, without polling.
  if (window.history) for (const name of ["pushState", "replaceState"]) {
    const original = window.history[name];
    if (typeof original !== "function") continue;
    window.history[name] = function () {
      const result = reflectApply(original, this, arguments);
      checkAllowRoute();
      queueTask(scanAvatarBootstrap);
      return result;
    };
  }
  const elMatches = cap(globalThis.Element?.prototype, "matches");
  const elGetAttr = cap(typeof Element === "function" ? Element.prototype : null, "getAttribute");
  const scannedScripts = new WeakSetCtor();
  const liveScripts = typeof document.getElementsByTagName === "function" ? document.getElementsByTagName("script") : null;
  function filterBootstrapScript(node) {
    try {
      const text = node.textContent;
      if (!text) return false;
      if (!IY.hasAdMarker(text) && !IY.hasBootstrapMarker(text)) return true;
      const result = IY.filterAds(text, true);
      if (result.removed && !result.error) { node.textContent = result.text; hit("ads", result.removed); }
      return true;
    } catch (_) { return true; /* Leave bootstrap untouched on failure. */ }
  }
  const observe = cap(MutationObserver.prototype, "observe");
  const disconnect = cap(MutationObserver.prototype, "disconnect");
  const bootstrap = new MutationObserver(function (records) {
    if (!cfg.ads) return;
    if (liveScripts) {
      for (let i = 0; i < liveScripts.length; i++) {
        const node = liveScripts[i];
        if (wsHas(scannedScripts, node)) continue;
        if (elGetAttr(node, "type") !== "application/json") { wsAdd(scannedScripts, node); continue; }
        if (filterBootstrapScript(node)) wsAdd(scannedScripts, node);
      }
      return;
    }
    for (let r = 0; r < records.length; r++) for (let n = 0, added = records[r].addedNodes; n < added.length; n++) {
      const node = added[n];
      if (node.nodeType !== 1 || !elMatches(node, 'script[type="application/json"]')) continue;
      filterBootstrapScript(node);
    }
  });
  let bootstrapLoading = document.readyState !== "interactive" && document.readyState !== "complete";
  if (bootstrapLoading) {
    observe(bootstrap, document, { childList: true, subtree: true });
    document.addEventListener("DOMContentLoaded", () => {
      bootstrapLoading = false;
      disconnect(bootstrap);
      scanAvatarBootstrap();
    }, { once: true });
  } else scanAvatarBootstrap();
  const READ_NEEDLE = "last_read_watermark_ts";
  const NEEDLE_CODES = [];
  for (let i = 0; i < READ_NEEDLE.length; i++) NEEDLE_CODES[i] = strCharCode(READ_NEEDLE, i);
  // Byte scan for the receipt marker; unrelated frames stay on the fast path.
  function bytesInclude(view) {
    const n = NEEDLE_CODES.length;
    const length = taLength(view);
    const first = NEEDLE_CODES[0];
    for (let i = u8IndexOf(view, first); i !== -1 && i <= length - n; i = u8IndexOf(view, first, i + 1)) {
      let j = 1;
      while (j < n && view[i + j] === NEEDLE_CODES[j]) j++;
      if (j === n) return true;
    }
    return false;
  }
  // [Tahmin] A single MQTT 3.1.1 QoS-0 PUBLISH on /typing or /indicate_activity.
  // Never drop QoS-1/2 (acknowledgements), concatenated/partial packets or opaque data.
  function typingWs(data, socket) {
    try {
      if (socketState(socket) !== 1 || !IY.typingSocketUrl(socketUrl(socket))) return false;
      if (typeof data === "string") return IY.wsTypingFrame(data);
      let bytes = bytesView(data);
      if (!bytes || !taLength(bytes) || taLength(bytes) > 16384) return false;
      if (bytes[0] !== 123 && bytes[0] !== 0x30) return false;
      bytes = u8Slice(bytes);
      if (bytes[0] === 123) return IY.wsTypingFrame(decodeBytes(typingDecoder, bytes));
      if (bytes[0] !== 0x30) return false;
      let remaining = 0, multiplier = 1, offset = 1, done = false;
      for (let i = 0; i < 4 && offset < taLength(bytes); i++) {
        const value = bytes[offset++];
        remaining += (value & 127) * multiplier;
        if (!(value & 128)) {
          if (i && value === 0) return false;
          done = true; break;
        }
        multiplier *= 128;
      }
      if (!done || remaining !== taLength(bytes) - offset || remaining < 3) return false;
      const topicLength = bytes[offset] * 256 + bytes[offset + 1];
      offset += 2;
      if (!topicLength || topicLength > 128 || offset + topicLength >= taLength(bytes)) return false;
      const topic = decodeBytes(typingDecoder, u8Slice(bytes, offset, offset + topicLength));
      if (topic !== "/typing" && topic !== "/indicate_activity") return false;
      return IY.wsTypingFrame(decodeBytes(typingDecoder, u8Slice(bytes, offset + topicLength)), topic);
    } catch (_) { return false; }
  }
  function emitMqttPubAck(socket, bytes) {
    if (!lightspeed || typeof lightspeed.mqttPubAck !== "function" || !MessageEventCtor) return;
    const ack = lightspeed.mqttPubAck(bytes);
    if (!ack) return;
    let origin = "";
    try { origin = urlOrigin(new URLCtor(socketUrl(socket))); } catch (_) {}
    let payload = taBuffer(ack);
    try {
      if (socketBinaryType(socket) === "blob" && BlobCtor) payload = new BlobCtor([ack]);
    } catch (_) {}
    queueTask(function () {
      try {
        if (socketState(socket) !== 1) return;
        const event = new MessageEventCtor("message", { data: payload, origin });
        let handler;
        let wrapped;
        let called = false;
        try {
          handler = socket.onmessage;
          if (typeof handler === "function") {
            wrapped = function (ev) { called = true; return reflectApply(handler, this, [ev]); };
            socket.onmessage = wrapped;
          }
          if (typeof socket.dispatchEvent === "function") socketDispatch(socket, event);
          if (wrapped && !called) reflectApply(handler, socket, [event]);
        } finally {
          try { if (wrapped && socket.onmessage === wrapped) socket.onmessage = handler; } catch (_) {}
        }
      } catch (_) {}
    });
  }
  function isDmSocket(socket) {
    try {
      if (socketState(socket) !== 1) return false;
      const url = socketUrl(socket);
      return (typeof IY.lightspeedSocketUrl === "function" && IY.lightspeedSocketUrl(url)) ||
        (typeof IY.typingSocketUrl === "function" && IY.typingSocketUrl(url));
    } catch (_) { return false; }
  }
  function lightspeedAllowed(socket) {
    return !!lightspeed && socketState(socket) === 1 &&
      typeof IY.lightspeedSocketUrl === "function" && IY.lightspeedSocketUrl(socketUrl(socket));
  }
  const setPrototype = Object.setPrototypeOf;
  const stripPrototype = (_, v) => v && typeof v === "object" ? setPrototype(v, null) : v;
  function lightspeedSeenThreadId(payloadText) {
    try {
      const req = JSONparse(payloadText, stripPrototype);
      if (!req || typeof req !== "object" || typeof req.payload !== "string") return null;
      const inner = JSONparse(req.payload, stripPrototype);
      if (!inner || typeof inner !== "object" || !isArray(inner.tasks)) return null;
      let found = null;
      for (let i = 0; i < inner.tasks.length; i++) {
        const task = inner.tasks[i];
        if (!task || typeof task !== "object" || (task.label !== "21" && task.label !== 21)) continue;
        const raw = typeof task.payload === "string" ? task.payload : JSONstringify(task.payload);
        const id = IY.dmTextThreadId(raw);
        if (!id) return null;
        if (found === null) found = id;
        else if (found !== id) return null;
      }
      return found;
    } catch (_) { return null; }
  }
  // Lazy DGW hook for Instagram's MqttBypassDGWClient typing publishes.
  // Completely inert while ghostTyping is off; uses a private WeakSet (no expandos).
  const DGW_METHODS = ["send", "sendAndForget", "publish"];
  const dgwPatched = new WeakSetCtor();
  let dgwHooked = false;
  let dgwTimer = null;
  function isDgwTypingArg(value) {
    if (!lightspeed || typeof lightspeed.isDgwTypingPayload !== "function") return false;
    if (!lightspeed.isDgwTypingPayload(value)) return false;
    let text = null;
    if (typeof value === "string") {
      if (value.length > 65536) return false;
      text = value;
    } else {
      const view = bytesView(value);
      if (view && taLength(view) <= 65536) {
        try { text = decodeBytes(typingDecoder, u8Slice(view)); } catch (_) { return false; }
      }
    }
    if (typeof text !== "string") return false;
    try {
      const parsed = JSONparse(text);
      if (parsed && typeof parsed === "object" && !isArray(parsed)) {
        return parsed.action === "indicate_activity";
      }
      return false;
    } catch (_) {
      return strIncludes(text, '"action":"indicate_activity"') ||
        strIncludes(text, '"action": "indicate_activity"');
    }
  }
  function isDgwTypingArgs(args) {
    for (let i = 0; i < args.length; i++) {
      if (isDgwTypingArg(args[i])) return true;
    }
    return false;
  }
  function patchDgwClient(mod) {
    try {
      const proto = mod && mod.prototype;
      if (!proto || typeof proto !== "object" || wsHas(dgwPatched, proto)) return;
      wsAdd(dgwPatched, proto);
      for (let i = 0; i < DGW_METHODS.length; i++) {
        const name = DGW_METHODS[i];
        const orig = proto[name];
        if (typeof orig !== "function") continue;
        const desc = getDescriptor(proto, name);
        if (desc && desc.configurable === false && desc.writable === false) continue;
        const wrapped = function () {
          try {
            if (cfg.ghostTyping && isDgwTypingArgs(arguments)) {
              return name === "send" ? promiseResolve(undefined) : undefined;
            }
          } catch (_) {}
          return reflectApply(orig, this, arguments);
        };
        if (desc && desc.configurable) {
          defineProperty(proto, name, {
            __proto__: null,
            value: wrapped,
            writable: desc.writable !== false,
            enumerable: !!desc.enumerable,
            configurable: true
          });
        } else {
          proto[name] = wrapped;
        }
      }
    } catch (_) {}
  }
  function stopDgwPoll() {
    if (dgwTimer !== null && cancelTimeout) {
      try { cancelTimeout(dgwTimer); } catch (_) {}
    }
    dgwTimer = null;
  }
  function syncDgwHook() {
    if (!cfg.ghostTyping) { stopDgwPoll(); return; }
    if (dgwHooked || dgwTimer !== null || !lightspeed) return;
    const deadline = dateNow() + 30000;
    function poll() {
      dgwTimer = null;
      if (!cfg.ghostTyping || dgwHooked) return;
      const reqLazy = window.requireLazy;
      if (typeof reqLazy === "function") {
        dgwHooked = true;
        try { reflectApply(reqLazy, window, [["MqttBypassDGWClient"], patchDgwClient]); }
        catch (_) { dgwHooked = false; }
        return;
      }
      if (scheduleTimeout && dateNow() < deadline) {
        try { dgwTimer = scheduleTimeout(poll, 200); } catch (_) { dgwTimer = null; }
      }
    }
    poll();
  }
  WebSocket.prototype.send = function (data) {
    dmCapture?.watchSocket(this);
    if (!cfg.ghostTyping && !cfg.ghostDm) return reflectApply(originalWsSend, this, arguments);
    if (arguments.length === 0 || socketState(this) !== 1) return reflectApply(originalWsSend, this, arguments);
    const dmSocket = isDmSocket(this);
    let outData = data;
    let rewritten = false;
    const isBlob = !!(BlobCtor && instanceOf(BlobCtor, outData));
    const isBin = !isBlob && (instanceOf(ArrayBufferCtor, outData) || isView(outData));
    if (!isBlob && !isBin && typeof outData !== "string") {
      outData = str(outData);
      rewritten = true;
    }
    try {
      if (isBlob) {
        if (dmSocket) {
          if (cfg.ghostDm) hit("dm");
          return;
        }
        return reflectApply(originalWsSend, this, arguments);
      }
      if (isBin) {
        const rawView = bytesView(outData);
        if (dmSocket && (!rawView || taLength(rawView) > WS_INSPECT_CAP)) {
          if (cfg.ghostDm) hit("dm");
          return;
        }
      }
      if (cfg.ghostTyping && typingWs(outData, this)) return;
      const lsOn = lightspeedAllowed(this);
      if (lsOn && typeof outData === "string") {
        if (cfg.ghostTyping && typeof lightspeed.filterLightspeedRequest === "function") {
          const filtered = lightspeed.filterLightspeedRequest(outData, { typing: true, seen: false });
          if (filtered === null) return;
          if (typeof filtered === "string" && filtered !== outData) {
            outData = filtered;
            rewritten = true;
          }
        }
        if (cfg.ghostDm && typeof lightspeed.filterLightspeedRequest === "function") {
          const seenOut = lightspeed.filterLightspeedRequest(outData, { typing: false, seen: true });
          if (seenOut !== outData) {
            if (allow && allowMatches(lightspeedSeenThreadId(outData))) {
              consumeAllow();
              return reflectApply(originalWsSend, this, rewritten ? [outData] : arguments);
            }
            hit("dm");
            if (seenOut === null) return;
            outData = seenOut;
            rewritten = true;
            return reflectApply(originalWsSend, this, [outData]);
          }
        }
      } else if (lsOn) {
        const view = bytesView(outData);
        if (view && taLength(view) >= 4 && taLength(view) <= WS_INSPECT_CAP && (view[0] >> 4) === 3 &&
            typeof lightspeed.filterMqttFrame === "function") {
          const bytes = u8Slice(view);
          let current = bytes;
          if (cfg.ghostTyping) {
            const typed = lightspeed.filterMqttFrame(current, { typing: true, seen: false });
            if (typed === null) {
              emitMqttPubAck(this, current);
              return;
            }
            if (typed !== current) {
              current = typed;
              outData = typed;
              rewritten = true;
            }
          }
          if (cfg.ghostDm) {
            const dmOut = lightspeed.filterMqttFrame(current, { typing: false, seen: true });
            if (dmOut !== current) {
              const parsed = typeof lightspeed.parseMqttPublish === "function"
                ? lightspeed.parseMqttPublish(current) : null;
              const payloadText = parsed ? decodeBytes(decoder, u8Slice(parsed.payloadBytes)) : "";
              if (allow && allowMatches(lightspeedSeenThreadId(payloadText))) {
                consumeAllow();
                return reflectApply(originalWsSend, this, rewritten ? [outData] : arguments);
              }
              hit("dm");
              if (dmOut === null) {
                emitMqttPubAck(this, current);
                return;
              }
              outData = dmOut;
              rewritten = true;
              return reflectApply(originalWsSend, this, [outData]);
            }
          }
        }
      }
      if (cfg.ghostDm) {
        let text = outData;
        const view = bytesView(outData);
        if (view) {
          if (taLength(view) < READ_NEEDLE.length || !bytesInclude(view)) {
            return reflectApply(originalWsSend, this, rewritten ? [outData] : arguments);
          }
          // Decode a private copy: TextDecoder rejects SharedArrayBuffer-backed views.
          text = decodeBytes(decoder, u8Slice(view));
        }
        if (typeof text === "string") {
          const result = IY.wsReadReceipt(text);
          if (result === "drop") {
            if (allow && allowMatches(IY.dmTextThreadId(text))) consumeAllow();
            else { hit("dm"); return; }
          }
          if (result === "leak") hit("leak");
        }
      }
    } catch (_) {
      hit("error");
      if (dmSocket) return;
    }
    return reflectApply(originalWsSend, this, rewritten ? [outData] : arguments);
  };
})();
