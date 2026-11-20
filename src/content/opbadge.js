(function () {
  "use strict";

  const selectors = typeof module !== "undefined" && module.exports ? require("./core/selectors.js") : IY.selectors;
  const ANCHOR = selectors.profileAnchor, SCOPE = selectors.postScope;
  const LIST = 'ul, ol, [role="list"]';
  const ROW = 'li, [role="listitem"]';
  const POST_MARK = 'article, video, a[href^="/p/"], a[href^="/reel/"]';
  // [Tahmin] Instagram comment rows carry an h3 author heading and/or a <time>;
  // the caption is excluded by its marker. Media carousel <li>s have neither.
  const CAPTION = 'h1, [data-testid="post-caption"], #photo-caption';
  const ATTR = "data-iy-op", STYLE_ID = "iy-op-style";
  const BATCH_CAP = 50;
  // Top-level routes that look like usernames but are not profiles.
  const RESERVED = new Set(["explore", "reels", "reel", "p", "tv", "direct", "accounts", "stories", "about",
    "legal", "privacy", "developer", "web", "emails", "challenge", "api", "static", "ads", "press", "terms",
    "safety", "directory", "nametag", "session", "oauth", "login", "logout", "download", "docs", "lite",
    "business", "notifications", "your_activity", "saved", "settings", "graphql", "ajax"]);

  function isUsername(value) {
    return typeof value === "string" && /^[A-Za-z0-9_](?:[A-Za-z0-9_.]{0,28}[A-Za-z0-9_])?$/.test(value) && !value.includes("..");
  }

  function usernameFromHref(href) {
    const match = typeof href === "string" && /^\/([^/]+)\/$/.exec(href);
    if (!match || !isUsername(match[1])) return null;
    const name = match[1].toLowerCase();
    return RESERVED.has(name) ? null : name;
  }

  function scopeFor(anchor) {
    const scope = anchor.closest(SCOPE);
    if (!scope) {
      const path = anchor.ownerDocument && anchor.ownerDocument.location.pathname;
      return /^\/(?:p|reel)\/[^/]+\/?$/.test(path || "") ? anchor.closest("main") : null;
    }
    if (scope.matches("article")) return scope;
    // A dialog is a post only with an article/video or a post permalink (not avatars).
    return scope.querySelector(POST_MARK) ? scope : null;
  }

  function divAuthor(row, scope) {
    for (const anchor of row.querySelectorAll('a[role="link"]')) {
      if (!anchor.parentElement.matches("div") || anchor.querySelector("img, svg")) continue;
      if (scopeFor(anchor) === scope && usernameFromHref(anchor.getAttribute("href"))) return anchor;
    }
    return null;
  }

  function divRow(time, scope) {
    // Real page comments use span > time. Post permalink dates are not comments.
    if (!time.parentElement.matches("span") || time.closest("a")) return null;
    for (let row = time.parentElement; row && row !== scope; row = row.parentElement) {
      if (row.matches("div") && divAuthor(row, scope)) return row;
    }
    return null;
  }

  function pageCommentAnchor(anchor, scope) {
    if (anchor.closest("header, nav, aside") || anchor.closest(CAPTION)) return false;
    for (let row = anchor.parentElement; row && row !== scope; row = row.parentElement) {
      if (!row.matches("div")) continue;
      // Only a row's own time counts, never a nested reply's or a later comment's.
      const times = Array.from(row.querySelectorAll("time"));
      if (times.length) return !row.querySelector(CAPTION) &&
        times.some(time => divRow(time, scope) === row) && divAuthor(row, scope) === anchor;
    }
    return false;
  }

  const ownerCache = new WeakMap();
  function ownerFor(scope) {
    if (!scope) return null;
    const path = scope.matches("main") ? scope.ownerDocument.location.pathname : null;
    const hit = ownerCache.get(scope);
    if (hit && hit.path === path && hit.anchor.isConnected && hit.anchor.getAttribute("href") === hit.href && scope.contains(hit.anchor)) return hit.owner;
    const page = scope.matches("main");
    // [Tahmin] On standalone posts the header has no <header>: its first profile
    // link precedes caption/comments in main. Ignore navigation, caption markers,
    // timed comment rows and nested article/dialog scopes; do not use CSS classes.
    for (const anchor of scope.querySelectorAll(page ? ANCHOR : "header a[href]")) {
      if (scopeFor(anchor) !== scope) continue;
      if (page && (anchor.closest("nav, aside") || anchor.closest(CAPTION) || pageCommentAnchor(anchor, scope))) continue;
      const href = anchor.getAttribute("href");
      const username = usernameFromHref(href);
      if (username) { ownerCache.set(scope, { anchor, href, path, owner: username }); return username; }
    }
    return null;
  }

  function isCommentAnchor(anchor, scope) {
    if (scope && scope.matches("main")) return scopeFor(anchor) === scope && pageCommentAnchor(anchor, scope);
    if (!scope || anchor.closest(SCOPE) !== scope || anchor.closest("header") || anchor.closest(CAPTION)) return false;
    const row = anchor.closest(ROW);
    const list = row && row.parentElement && row.parentElement.closest(LIST);
    if (!list || !scope.contains(list)) return false;
    // Exclude a caption wrapper even when its username sits outside h1.
    if (row.querySelector(CAPTION)) return false;
    const own = node => node.closest(ROW) === row;
    // Positive detection: the row itself must have an author heading or a time.
    const heading = Array.from(row.querySelectorAll("h3")).find(own);
    if (!heading && !Array.from(row.querySelectorAll("time")).some(own)) return false;
    for (const candidate of (heading || row).querySelectorAll(ANCHOR)) {
      if (!own(candidate) || candidate.querySelector("img, svg")) continue; // nested reply / avatar
      if (usernameFromHref(candidate.getAttribute("href"))) return candidate === anchor;
    }
    return false;
  }

  function isOwnerComment(anchor) {
    const username = usernameFromHref(anchor.getAttribute("href"));
    if (!username) return false;
    const scope = scopeFor(anchor);
    return isCommentAnchor(anchor, scope) && username === ownerFor(scope);
  }

  function isEnabled(ui) {
    return !ui || typeof ui.opBadge !== "boolean" ? true : ui.opBadge;
  }

  // The badge is a ::after pseudo-element driven by a data attribute on Instagram's
  // own anchor: no sibling nodes are inserted into React-managed trees.
  function createController(env) {
    const doc = env.document;
    let enabled = false;
    let observer = null;
    let pending = null;
    let roots = [];
    let queued = new WeakSet();
    let cursor = null;
    let generation = 0;

    function mark(anchor) {
      if (!anchor.isConnected) return;
      if (isOwnerComment(anchor)) {
        const label = env.message() || "Yazar";
        if (anchor.getAttribute(ATTR) !== label) anchor.setAttribute(ATTR, label);
      } else if (anchor.getAttribute(ATTR) !== null) anchor.removeAttribute(ATTR); // href changed in place
    }

    function schedule() {
      if (!enabled || pending !== null) return;
      const current = generation;
      pending = env.schedule(function () {
        if (current !== generation) return;
        pending = null;
        try { batch(); }
        catch (err) { cursor = null; throw err; } // Skip this root and report through the scheduled callback.
        finally { if (current === generation && (cursor || roots.length)) schedule(); }
      });
    }

    function enqueue(node) {
      if (!enabled || !node || node.nodeType !== 1 || queued.has(node)) return;
      queued.add(node);
      roots.push(node);
      schedule();
    }

    function batch() {
      let count = 0;
      while (count < BATCH_CAP) {
        if (!cursor) {
          const root = roots.shift();
          if (!root) break;
          queued.delete(root);
          if (!root.isConnected) continue;
          const self = root.matches(ANCHOR);
          const list = root.querySelectorAll(ANCHOR);
          cursor = { root, list, index: 0, self };
        }
        let node;
        if (cursor.self) { cursor.self = false; node = cursor.root; }
        else if (cursor.index < cursor.list.length) node = cursor.list[cursor.index++];
        else { cursor = null; continue; }
        count++;
        mark(node);
      }
      return count;
    }

    function stop() {
      enabled = false;
      generation++;
      if (observer) observer();
      observer = null;
      if (pending !== null) env.cancel(pending);
      pending = null;
      roots = [];
      cursor = null;
      queued = new WeakSet();
      for (const anchor of Array.from(doc.querySelectorAll("[" + ATTR + "]"))) anchor.removeAttribute(ATTR);
      const style = doc.getElementById(STYLE_ID);
      if (style) style.remove();
    }

    function apply(ui) {
      if (!isEnabled(ui)) { stop(); return; }
      if (enabled) return;
      enabled = true;
      if (!doc.getElementById(STYLE_ID)) {
        const style = doc.createElement("style");
        style.id = STYLE_ID;
        style.textContent = "a[" + ATTR + "]::after{content:attr(" + ATTR + ");display:inline-block;font-size:11px;font-weight:600;padding:0 6px;margin-inline-start:4px;border:1px solid currentColor;border-radius:999px;opacity:.8;vertical-align:middle;text-decoration:none;white-space:nowrap;}";
        doc.documentElement.appendChild(style);
      }
      observer = env.observe(enqueue);
      enqueue(doc.documentElement);
    }
    return { apply, stop };
  }

  const api = { isUsername, usernameFromHref, scopeFor, ownerFor, isCommentAnchor, isOwnerComment, isEnabled, createController, BATCH_CAP };
  globalThis.IY = globalThis.IY || {};
  globalThis.IY.opbadge = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document === "undefined" || typeof chrome === "undefined" || globalThis.__iyOpbadgeInstalled) return;
  globalThis.__iyOpbadgeInstalled = true;
  const idle = typeof requestIdleCallback === "function";
  const controller = createController({
    document, observe: callback => IY.core.observe(node => node.matches(ANCHOR) || node.querySelector(ANCHOR), callback),
    schedule(callback) {
      const run = IY.core.guard("opbadge", callback);
      return idle ? requestIdleCallback(run) : setTimeout(run, 0);
    },
    cancel: id => idle ? cancelIdleCallback(id) : clearTimeout(id),
    message: () => { try { return chrome.i18n.getMessage("opBadge"); } catch (_) { return "Yazar"; } }
  });
  IY.core.feature("opbadge", {
    enabled: ({ ui }) => isEnabled(ui),
    start: ({ ui }) => controller.apply(ui), stop: controller.stop
  });
})();
