// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
// Copyright jewdev; InstHush changes GPL-3.0-only.
(function () {
  "use strict";

  var FALLBACK_TRACKING = /^(?:igsh|igshid|ig_rid|ig_mid|fbclid|stkn|xmt|si|utm_.*|_branch_.*)$/i;
  var FALLBACK_IG_HOST = /^(?:[a-z0-9-]+\.)*(?:instagram\.com|instagr\.am)$/;
  var FALLBACK_SHARE_HOST = /^(?:www\.)?instagram\.com$/;
  var FALLBACK_SHARE_PATH = /^\/(?:(?:p|reel|reels)\/[A-Za-z0-9_-]+|stories\/[A-Za-z0-9._]{1,30}(?:\/\d+)?)\/?$/;
  var FALLBACK_DOMAIN = /^(?:https?:\/\/)?((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63})\/?$/i;
  var FALLBACK_AUTHORITY = /^(https?:\/\/)([^/?#]+)([^?#]*)/i;

  function resolveLinksLib() {
    if (globalThis.IY && globalThis.IY.links && typeof globalThis.IY.links.clean === "function") {
      return globalThis.IY.links;
    }
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
      try {
        var mod = require("../lib/links.js");
        if (mod && typeof mod.clean === "function") return mod;
      } catch (_) {}
    }
    return null;
  }

  function fallbackHttpUrl(input) {
    if (typeof input !== "string" || !/^https?:\/\/[^/]/i.test(input) ||
        /[\s\x00-\x1f\x7f\\]/.test(input)) return undefined;
    try { return new URL(input); } catch (err) { return undefined; }
  }

  function fallbackSwapShareDomain(input, domain) {
    var target = typeof domain === "string" && FALLBACK_DOMAIN.exec(domain.trim());
    if (!target || target[1].length > 253) return input;
    var parsed = fallbackHttpUrl(input);
    if (!parsed || !FALLBACK_SHARE_HOST.test(parsed.hostname) || !FALLBACK_SHARE_PATH.test(parsed.pathname)) return input;
    var auth = FALLBACK_AUTHORITY.exec(input);
    if (!auth || auth[2].toLowerCase() !== parsed.hostname || auth[3] !== parsed.pathname) return input;
    return auth[1] + target[1].toLowerCase() + input.slice(auth[1].length + auth[2].length);
  }

  // Fallback used only when src/lib/links.js is not loaded before this script.
  function fallbackClean(url, domain) {
    var parsed = fallbackHttpUrl(url);
    if (!parsed || parsed.username || parsed.password || parsed.port ||
        !FALLBACK_IG_HOST.test(parsed.hostname)) return url;
    var hashIndex = url.indexOf("#");
    var beforeHash = hashIndex < 0 ? url : url.slice(0, hashIndex);
    var queryIndex = beforeHash.indexOf("?");
    var result = url;
    if (queryIndex >= 0) {
      var parts = beforeHash.slice(queryIndex + 1).split("&");
      var kept = [];
      var removed = false;
      for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        if (!part) continue;
        var first = new URLSearchParams(part).entries().next();
        var name = first.done ? "" : first.value[0];
        var value = first.done ? "" : first.value[1];
        if (FALLBACK_TRACKING.test(name) || (name === "ref" && value === "share")) removed = true;
        else kept.push(part);
      }
      if (removed) {
        var hashPart = hashIndex < 0 ? "" : url.slice(hashIndex);
        result = beforeHash.slice(0, queryIndex) + (kept.length ? "?" + kept.join("&") : "") + hashPart;
      }
    }
    return fallbackSwapShareDomain(result, domain);
  }

  function clean(url, domain) {
    var lib = resolveLinksLib();
    return lib ? lib.clean(url, domain) : fallbackClean(url, domain);
  }

  function swapShareDomain(url, domain) {
    var lib = resolveLinksLib();
    return lib && typeof lib.swapShareDomain === "function"
      ? lib.swapShareDomain(url, domain)
      : fallbackSwapShareDomain(url, domain);
  }

  var api = { clean: clean, swapShareDomain: swapShareDomain };
  globalThis.IY = globalThis.IY || {};
  globalThis.IY.cleanlinks = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document === "undefined" || typeof chrome === "undefined") return;
  if (globalThis.__iyCleanlinksInstalled) return;
  globalThis.__iyCleanlinksInstalled = true;

  var enabled = false;
  var shareDomain = "";
  var listening = false;
  var generation = 0;
  var routeTimer = null;
  var unsubRoute = null;
  var lastInputUrl = null;
  var lastOutputUrl = null;

  function safe(fn) {
    return IY.core.guard("cleanlinks", fn);
  }

  function isEnabled(ui) {
    return !ui || typeof ui !== "object" || typeof ui.cleanLinks !== "boolean" ? true : ui.cleanLinks;
  }

  function readShareDomain(ui) {
    if (!ui || typeof ui !== "object" || typeof ui.shareDomain !== "string") return "";
    var trimmed = ui.shareDomain.trim();
    return trimmed.length <= 253 ? trimmed : "";
  }

  function isTextField(node) {
    if (!node || typeof node.tagName !== "string") return false;
    var tag = node.tagName.toUpperCase();
    return tag === "INPUT" || tag === "TEXTAREA";
  }

  function inEditable(node) {
    try {
      if (!node) return false;
      if (node.nodeType === 3) node = node.parentElement;
      if (!node) return false;
      if (node.isContentEditable === true) return true;
      return typeof node.closest === "function" && !!node.closest('[contenteditable]:not([contenteditable="false"])');
    } catch (err) { return false; }
  }

  // Only the live selection (or a selected text field range) is read. Existing
  // clipboardData is never read or overwritten.
  function selectedText(event) {
    var field = event && isTextField(event.target) ? event.target : null;
    if (!field && (!event || !event.target) && isTextField(document.activeElement)) field = document.activeElement;
    if (field) {
      if (String(field.type || "").toLowerCase() === "password") return "";
      if (typeof field.value === "string" && typeof field.selectionStart === "number" &&
          typeof field.selectionEnd === "number" && field.selectionEnd > field.selectionStart) {
        return field.value.slice(field.selectionStart, field.selectionEnd);
      }
    }
    var sel = typeof document.getSelection === "function"
      ? document.getSelection()
      : (typeof window !== "undefined" && typeof window.getSelection === "function" ? window.getSelection() : null);
    return sel ? String(sel) : "";
  }

  var onCopy = safe(function (event) {
    if (!enabled || !event || event.defaultPrevented || event.isTrusted === false) return;
    var data = event.clipboardData;
    if (!data || typeof data.setData !== "function") return;
    // Another handler already set clipboard data: leave it alone.
    if (data.types && data.types.length) return;
    // Rich-text editors (DM composer etc.) manage their own copy data.
    if (inEditable(event.target) || inEditable(document.activeElement)) return;
    var raw = selectedText(event);
    if (typeof raw !== "string") return;
    var trimmed = raw.trim();
    if (!trimmed) return;
    // clean() only changes a string that is exactly one Instagram URL.
    var cleaned = clean(trimmed, shareDomain);
    if (cleaned === trimmed) return;
    data.setData("text/plain", cleaned);
    if (typeof event.preventDefault === "function") event.preventDefault();
  });

  // Never pass shareDomain here: history.replaceState stays same-origin.
  function cleanLocation() {
    if (!enabled || typeof location === "undefined" || typeof location.href !== "string") return;
    var current = location.href;
    if (current === lastInputUrl || current === lastOutputUrl) return;
    lastInputUrl = current;
    var cleaned = clean(current);
    if (cleaned === current) {
      lastOutputUrl = current;
      return;
    }
    lastOutputUrl = cleaned;
    if (typeof history === "undefined" || typeof history.replaceState !== "function") return;
    var state = null;
    try { state = history.state; } catch (err) {}
    try { history.replaceState(state, "", cleaned); } catch (err) {}
  }

  // Navigation hooks only schedule the check; replaceState must never run inside
  // Instagram's own pushState/replaceState call stack.
  var onRoute = safe(function () {
    if (!enabled) return;
    scheduleRouteCheck();
  });

  function scheduleRouteCheck() {
    if (routeTimer !== null) return;
    if (typeof setTimeout === "function") {
      var current = generation;
      routeTimer = setTimeout(safe(function () {
        routeTimer = null;
        if (current === generation && enabled) cleanLocation();
      }), 0);
    } else if (typeof Promise === "function") {
      var token = generation;
      Promise.resolve().then(safe(function () { if (token === generation && enabled) cleanLocation(); }));
    }
  }

  function start() {
    if (listening) return;
    listening = true;
    document.addEventListener("copy", onCopy, true);
    unsubRoute = IY.core.route(onRoute);
  }

  function stop() {
    enabled = false;
    shareDomain = "";
    generation++;
    if (routeTimer !== null && typeof clearTimeout === "function") clearTimeout(routeTimer);
    routeTimer = null;
    lastInputUrl = null;
    lastOutputUrl = null;
    if (typeof unsubRoute === "function") {
      try { unsubRoute(); } catch (err) {}
      unsubRoute = null;
    }
    if (!listening) return;
    listening = false;
    try { document.removeEventListener("copy", onCopy, true); } catch (err) {}
  }

  IY.core.feature("cleanlinks", {
    enabled: ({ ui }) => isEnabled(ui),
    start({ ui }) { enabled = true; shareDomain = readShareDomain(ui); start(); cleanLocation(); },
    update({ ui }) { shareDomain = readShareDomain(ui); },
    stop
  });
})();
