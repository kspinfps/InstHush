// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
// Copyright jewdev
(function () {
  "use strict";

  const TRACKING = /^(?:igsh|igshid|ig_rid|ig_mid|fbclid|stkn|xmt|si|utm_.*|_branch_.*)$/i;
  const INSTAGRAM_HOST = /^(?:[a-z0-9-]+\.)*(?:instagram\.com|instagr\.am)$/;
  const SHARE_HOST = /^(?:www\.)?instagram\.com$/;
  const SHARE_PATH = /^\/(?:(?:p|reel|reels)\/[A-Za-z0-9_-]+|stories\/[A-Za-z0-9._]{1,30}(?:\/\d+)?)\/?$/;
  const DOMAIN = /^(?:https?:\/\/)?((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63})\/?$/i;
  const AUTHORITY = /^(https?:\/\/)([^/?#]+)([^?#]*)/i;

  function httpUrl(input) {
    if (typeof input !== "string" || !/^https?:\/\/[^/]/i.test(input) ||
        /[\s\x00-\x1f\x7f\\]/.test(input)) return undefined;
    try { return new URL(input); } catch (_) { return undefined; }
  }

  function clean(input, domain) {
    const parsed = httpUrl(input);
    if (!parsed || parsed.username || parsed.password || parsed.port ||
        !INSTAGRAM_HOST.test(parsed.hostname)) return input;
    const hashIndex = input.indexOf("#");
    const beforeHash = hashIndex < 0 ? input : input.slice(0, hashIndex);
    const queryIndex = beforeHash.indexOf("?");
    let result = input;
    if (queryIndex >= 0) {
      // Preserve the bytes of functional parameters and fragments, as cleanlinks.js does.
      const kept = [];
      let removed = false;
      for (const part of beforeHash.slice(queryIndex + 1).split("&")) {
        if (!part) continue;
        const [name, value] = new URLSearchParams(part).entries().next().value ?? [];
        if (TRACKING.test(name) || (name === "ref" && value === "share")) removed = true;
        else kept.push(part);
      }
      if (removed) {
        const hash = hashIndex < 0 ? "" : input.slice(hashIndex);
        result = beforeHash.slice(0, queryIndex) + (kept.length ? "?" + kept.join("&") : "") + hash;
      }
    }
    return swapShareDomain(result, domain);
  }

  function swapShareDomain(input, domain) {
    const target = typeof domain === "string" && DOMAIN.exec(domain.trim());
    if (!target || target[1].length > 253) return input;
    const parsed = httpUrl(input);
    if (!parsed || !SHARE_HOST.test(parsed.hostname) || !SHARE_PATH.test(parsed.pathname)) return input;
    const [, scheme, host, path] = AUTHORITY.exec(input);
    if (host.toLowerCase() !== parsed.hostname || path !== parsed.pathname) return input;
    return scheme + target[1].toLowerCase() + input.slice(scheme.length + host.length);
  }

  function unwrapLinkShim(input) {
    const shim = httpUrl(input);
    if (!shim || shim.hostname !== "l.instagram.com" || shim.pathname !== "/" ||
        shim.username || shim.password || shim.port) return undefined;
    return httpUrl(shim.searchParams.get("u"))?.href;
  }

  const api = { clean, swapShareDomain, unwrapLinkShim };
  globalThis.IY = Object.assign(globalThis.IY || {}, { links: api });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
