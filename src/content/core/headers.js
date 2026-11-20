// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
// Headers for Instagram web REST calls, matching instagram.com's own web client.
(function () {
  "use strict";

  const APP_ID = "936619743392459";
  const ASBD_ID = "359341";
  const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
  const ID_RE = /^[a-z0-9]+$/i;
  const ASBD_RE = /^[a-z0-9_-]{1,32}$/i;
  const APP_ID_RE = /^\d{5,25}$/;
  const CTRL_RE = /[\r\n\x00-\x1f\x7f]/;

  let sniffedAsbd;
  let sniffedAppId;

  function randomPageId(rand = Math.random) {
    let out = "";
    for (let i = 0; i < 6; i++) {
      const r = Number(rand());
      const clamped = Number.isFinite(r) ? Math.min(Math.max(r, 0), 0.999999999999) : 0;
      out += ALPHABET[Math.floor(clamped * 36)];
    }
    return out;
  }

  const pageId = randomPageId();

  function cleanValue(value, fallback = "") {
    if (typeof value !== "string" || !value || CTRL_RE.test(value)) return fallback;
    return value;
  }

  function readCookie(name, cookieString) {
    if (typeof name !== "string" || !name) return undefined;
    let raw = cookieString;
    if (raw === undefined) {
      try {
        raw = globalThis.document && typeof globalThis.document.cookie === "string"
          ? globalThis.document.cookie
          : "";
      } catch (_) {
        return undefined;
      }
    }
    if (typeof raw !== "string" || !raw) return undefined;
    const prefix = name + "=";
    const parts = raw.split(";");
    for (let i = 0; i < parts.length; i++) {
      const entry = parts[i].trim();
      if (entry.startsWith(prefix)) return entry.slice(prefix.length);
    }
    return undefined;
  }

  function myUserId(cookieString) {
    const id = readCookie("ds_user_id", cookieString);
    return typeof id === "string" && /^\d+$/.test(id) ? id : undefined;
  }

  function readStorageItem(areaOrGetter, key) {
    try {
      const area = typeof areaOrGetter === "function" ? areaOrGetter() : areaOrGetter;
      if (!area || typeof area.getItem !== "function") return null;
      const value = area.getItem(key);
      return typeof value === "string" ? value : null;
    } catch (_) {
      return null;
    }
  }

  function setAsbdId(value) {
    if (typeof value === "string" && ASBD_RE.test(value.trim())) {
      sniffedAsbd = value.trim();
      return true;
    }
    if (value === undefined || value === null || value === "") {
      sniffedAsbd = undefined;
    }
    return false;
  }

  function getAsbdId() {
    return sniffedAsbd || ASBD_ID;
  }

  function setAppId(value) {
    if (typeof value === "string" && APP_ID_RE.test(value.trim())) {
      sniffedAppId = value.trim();
      return true;
    }
    if (value === undefined || value === null || value === "") {
      sniffedAppId = undefined;
    }
    return false;
  }

  function getAppId() {
    return sniffedAppId || APP_ID;
  }

  function getPageId() {
    return pageId;
  }

  function restHeaders(src = {}) {
    const input = src && typeof src === "object" ? src : {};
    const appId = typeof input.appId === "string" && APP_ID_RE.test(input.appId) ? input.appId : APP_ID;
    const asbd = typeof input.asbd === "string" && ASBD_RE.test(input.asbd) ? input.asbd : ASBD_ID;
    const csrf = cleanValue(input.csrf, "");
    const claim = cleanValue(input.claim, "0");
    const pid = typeof input.pageId === "string" && ID_RE.test(input.pageId) ? input.pageId : "";

    const headers = {
      "X-CSRFToken": csrf,
      "X-IG-App-ID": appId,
      "X-ASBD-ID": asbd,
      "X-IG-WWW-Claim": claim
    };

    const sessionRaw = typeof input.session === "string" ? input.session : "";
    const session = sessionRaw.split(":")[0];
    const tab = typeof input.tab === "string" ? input.tab : "";
    if (session && ID_RE.test(session) && tab && ID_RE.test(tab) && pid) {
      headers["X-Web-Session-ID"] = session + ":" + tab + ":" + pid;
    }

    const touch = Number(input.maxTouchPoints);
    headers["X-IG-Max-Touch-Points"] = String(Number.isFinite(touch) && touch > 0 ? Math.floor(touch) : 0);
    headers.Accept = "*/*";
    headers["X-Requested-With"] = "XMLHttpRequest";
    return headers;
  }

  function buildPageHeaders(overrides = {}) {
    const opts = overrides && typeof overrides === "object" ? overrides : {};
    const allowDefaultStorage = typeof process === "undefined" || !process.versions || !process.versions.node;
    const getSession = () => (opts.sessionStorage !== undefined ? opts.sessionStorage : (allowDefaultStorage ? globalThis.sessionStorage : null));
    const getLocal = () => (opts.localStorage !== undefined ? opts.localStorage : (allowDefaultStorage ? globalThis.localStorage : null));
    const nav = opts.navigator !== undefined ? opts.navigator : globalThis.navigator;
    const cookieStr = opts.cookieString !== undefined
      ? opts.cookieString
      : (opts.document && typeof opts.document.cookie === "string" ? opts.document.cookie : undefined);

    const csrf = opts.csrf !== undefined ? opts.csrf : readCookie("csrftoken", cookieStr);
    const claim = opts.claim !== undefined ? opts.claim : readStorageItem(getSession, "www-claim-v2");
    const session = opts.session !== undefined ? opts.session : readStorageItem(getLocal, "Session");
    const tab = opts.tab !== undefined ? opts.tab : readStorageItem(getSession, "TabId");
    const maxTouchPoints = opts.maxTouchPoints !== undefined
      ? opts.maxTouchPoints
      : (nav && Number.isFinite(nav.maxTouchPoints) ? nav.maxTouchPoints : 0);

    return restHeaders({
      csrf,
      claim,
      session,
      tab,
      pageId: opts.pageId !== undefined ? opts.pageId : pageId,
      maxTouchPoints,
      asbd: opts.asbd !== undefined ? opts.asbd : sniffedAsbd,
      appId: opts.appId !== undefined ? opts.appId : sniffedAppId
    });
  }

  const api = {
    APP_ID,
    ASBD_ID,
    randomPageId,
    readCookie,
    myUserId,
    readStorageItem,
    setAsbdId,
    getAsbdId,
    setAppId,
    getAppId,
    getPageId,
    restHeaders,
    buildPageHeaders
  };

  globalThis.IY = Object.assign(globalThis.IY || {}, { headers: api });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
