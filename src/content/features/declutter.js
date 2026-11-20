// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
// DOM-level feed decluttering: 1px collapse + 500-shortcode remount memory + overflow-anchor,
// independent switches, Turkish + English labels, and shared IY.core.observe integration.
(function () {
  "use strict";

  const MAX_CHECKS = 6;
  const MAX_REMEMBERED = 500;
  const SHORTCODE_RE = /\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,})/;

  const COLLAPSE_STYLES = Object.freeze({
    height: "1px",
    "min-height": "0",
    overflow: "hidden",
    visibility: "hidden",
    margin: "0",
    padding: "0",
    border: "0"
  });
  const REMOVE_STYLES = Object.freeze({ display: "none" });

  // Paid partnership / Sponsor tags stay excluded to match InstHush's network filter (ads.js).
  const SPONSORED_WORDS = Object.freeze([
    "Sponsored",
    "Sponsorlu",
    "Sponsorlu gönderi",
    "Reklam",
    "Publicidad",
    "Sponsorisé",
    "Gesponsert",
    "Sponsorizzato",
    "Patrocinado",
    "Gesponsord",
    "Реклама",
    "ממומן",
    "مُموَّل",
    "ممول",
    "広告",
    "광고",
    "贊助",
    "赞助"
  ]);

  const SUGGESTED_WORDS = Object.freeze([
    "Suggested for you",
    "Suggested posts",
    "Suggested reels",
    "Suggested accounts",
    "Suggested",
    "Senin için önerilenler",
    "Senin için önerildi",
    "Önerilen gönderiler",
    "Önerilen reels",
    "Önerilen Reels",
    "Önerilen hesaplar",
    "Önerilen",
    "Vorgeschlagen für dich",
    "Vorschläge für dich",
    "Suggestions pour vous",
    "Sugerencias para ti",
    "Suggeriti per te",
    "Sugestões para você",
    "Рекомендации для вас",
    "הצעות בשבילך"
  ]);

  const RESERVED_ROUTES = new Set([
    "accounts", "explore", "direct", "about", "developer", "legal", "emails", "challenge",
    "stories", "reels", "reel", "p", "tv", "web", "session", "privacy", "terms", "press",
    "api", "graphql", "oauth", "nametag", "lite", "your_activity", "notifications", "threads",
    "settings", "archive", "create", "login", "signup", "help", "ads", "business", "static", "download"
  ]);

  const SETTING_FOR = Object.freeze({
    ad: "ads",
    suggested: "suggested",
    muted: "muteWords",
    sidebar: "suggestedAccounts",
    stories: "storyTray",
    reels: "reelsNav",
    explore: "exploreNav",
    threads: "threads"
  });

  const COLLAPSE_KINDS = new Set(["ad", "suggested", "muted"]);

  function getSelectors() {
    const iy = globalThis.IY;
    return iy && iy.selectors ? iy.selectors : {};
  }

  function buildWordSet(base, extra) {
    const set = new Set(base);
    if (Array.isArray(extra)) {
      for (let i = 0; i < extra.length; i++) {
        if (typeof extra[i] === "string" && extra[i]) set.add(extra[i]);
      }
    }
    return set;
  }

  function selConfig() {
    const s = getSelectors();
    return {
      article: s.article || "article",
      dialog: s.dialog || 'div[role="dialog"], [role="dialog"]',
      main: s.main || "main",
      postLink: s.postLink || 'a[href*="/p/"], a[href*="/reel/"], a[href*="/reels/"], a[href*="/tv/"]',
      reelsNav: s.reelsNav || 'a[href="/reels/"]',
      exploreNav: s.exploreNav || 'a[href="/explore/"]',
      threadsLink: s.threadsLink || 'a[href*="threads."]',
      sidebarSuggestionsLink: s.sidebarSuggestionsLink || 'a[href="/explore/people/"]',
      sponsoredSet: buildWordSet(SPONSORED_WORDS, s.sponsoredWords || s.SPONSORED_WORDS),
      suggestedSet: buildWordSet(SUGGESTED_WORDS, s.suggestedWords || s.SUGGESTED_WORDS)
    };
  }

  function fallbackNormalizeMute(value) {
    const result = { words: [], accounts: [] };
    if (!value || typeof value !== "object" || Array.isArray(value)) return result;
    for (const key of ["words", "accounts"]) {
      const list = value[key];
      const out = result[key];
      if (!Array.isArray(list)) continue;
      for (let i = 0; i < list.length && i < 100; i++) {
        if (typeof list[i] !== "string" || list[i].length > 102) continue;
        let clean = list[i].trim();
        if (key === "accounts" && clean[0] === "@") clean = clean.slice(1);
        if (!clean || clean.length > 50) continue;
        if (key === "accounts") {
          if (!/^[A-Za-z0-9_](?:[A-Za-z0-9_.]{0,28}[A-Za-z0-9_])?$/.test(clean) || clean.includes("..")) continue;
          clean = clean.toLowerCase();
        } else {
          clean = clean.toLocaleLowerCase("tr");
        }
        if (!out.includes(clean)) out.push(clean);
      }
    }
    return result;
  }

  function normalizeMuteValue(value) {
    const iy = globalThis.IY;
    if (iy && typeof iy.normalizeMute === "function") return iy.normalizeMute(value);
    return fallbackNormalizeMute(value);
  }

  function readOptions(settings) {
    const s = settings || {};
    const cfg = s.cfg;
    const ui = s.ui;
    const ads = !cfg || typeof cfg !== "object" || cfg.ads !== false;
    const rawFocus = ui && ui.focusOpts;
    const legacy = (!rawFocus || typeof rawFocus !== "object" || Array.isArray(rawFocus)) && !!ui && ui.focus === true;
    const suggested = legacy ? true : !!(rawFocus && rawFocus.suggested === true);
    const suggestedAccounts = !!(rawFocus && rawFocus.suggestedAccounts === true);
    const storyTray = !!(rawFocus && rawFocus.storyTray === true);
    const reelsNav = !!(rawFocus && rawFocus.reelsNav === true);
    const exploreNav = !!(rawFocus && rawFocus.exploreNav === true);
    const threads = !!(rawFocus && rawFocus.threads === true);
    const mute = normalizeMuteValue(ui && ui.mute);
    const muteWords = mute.words.length > 0 || mute.accounts.length > 0;
    return { ads, suggested, suggestedAccounts, storyTray, reelsNav, exploreNav, threads, muteWords, mute };
  }

  function isEnabled(settings) {
    const opts = readOptions(settings);
    for (const key of Object.values(SETTING_FOR)) {
      if (opts[key]) return true;
    }
    return false;
  }

  function parseRoute(pathname) {
    const iy = globalThis.IY;
    if (iy && iy.resolve && typeof iy.resolve.parseRoute === "function") return iy.resolve.parseRoute(pathname);
    if (iy && iy.hover && typeof iy.hover.parseRoute === "function") return iy.hover.parseRoute(pathname);
    const path = typeof pathname === "string" ? pathname : "/";
    const parts = path.split(/[?#]/)[0].split("/").filter(Boolean);
    const a = parts[0] || "";
    const b = parts[1] || "";
    const c = parts[2] || "";
    if (!a) return { kind: "home" };
    if (a === "p" || a === "tv") return { kind: "post", shortcode: b };
    if (a === "reel" && b) return { kind: "reel", shortcode: b };
    if (a === "reels") return b ? { kind: "reel", shortcode: b } : { kind: "reels" };
    if (a === "stories") {
      if (b === "highlights" && c) return { kind: "highlight", highlightId: c };
      if (b) return { kind: "stories", username: b, storyId: c };
    }
    if (a === "explore") return { kind: "explore" };
    if (a === "direct") return { kind: "direct" };
    if (RESERVED_ROUTES.has(a.toLowerCase())) return { kind: "other" };
    if ((b === "p" || b === "reel" || b === "reels" || b === "tv") && c) {
      return { kind: b === "p" || b === "tv" ? "post" : "reel", shortcode: c, username: a };
    }
    return { kind: "profile", username: a };
  }

  function shortcodeFromHref(href) {
    if (typeof href !== "string" || !href) return undefined;
    const m = SHORTCODE_RE.exec(href);
    return m ? m[1] : undefined;
  }

  function ownShortcode(root, postLinkSel) {
    if (!root || typeof root.querySelector !== "function") return undefined;
    const timeEl = root.querySelector("a time");
    const timeAnchor = timeEl && typeof timeEl.closest === "function" ? timeEl.closest("a") : null;
    const fromTime = shortcodeFromHref(timeAnchor && typeof timeAnchor.getAttribute === "function" ? timeAnchor.getAttribute("href") : null);
    if (fromTime) return fromTime;
    const sel = postLinkSel || 'a[href*="/p/"], a[href*="/reel/"], a[href*="/reels/"], a[href*="/tv/"]';
    let found;
    const links = typeof root.querySelectorAll === "function" ? root.querySelectorAll(sel) : [];
    for (let i = 0; i < links.length; i++) {
      const a = links[i];
      const sc = shortcodeFromHref(typeof a.getAttribute === "function" ? a.getAttribute("href") : a.href);
      if (!sc) continue;
      if (found && sc !== found) return undefined;
      found = sc;
    }
    return found;
  }

  function postAuthor(root) {
    if (!root || typeof root.querySelectorAll !== "function") return undefined;
    const headerLinks = root.querySelectorAll('header a[href^="/"]');
    const fallbackLinks = root.querySelectorAll('a[href^="/"]');
    const lists = headerLinks.length ? [headerLinks, fallbackLinks] : [fallbackLinks];
    for (let l = 0; l < lists.length; l++) {
      const links = lists[l];
      for (let i = 0; i < links.length; i++) {
        const href = typeof links[i].getAttribute === "function" ? links[i].getAttribute("href") : "";
        if (!href) continue;
        const clean = href.split(/[?#]/)[0];
        const m = /^\/([A-Za-z0-9._]{1,30})\/?$/.exec(clean);
        if (m && !RESERVED_ROUTES.has(m[1].toLowerCase())) return m[1];
      }
    }
    return undefined;
  }

  function matchesMutedWords(text, words) {
    if (typeof text !== "string" || !text || !words || !words.length || text.length > 100000) return false;
    const folded = text.toLocaleLowerCase("tr");
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (!word) continue;
      let from = 0;
      let at;
      while ((at = folded.indexOf(word, from)) !== -1) {
        const end = at + word.length;
        const before = folded.slice(at > 1 ? at - 2 : 0, at);
        const after = folded.slice(end, end + 2);
        if (!/(?:\p{L}|\p{M}|\p{N}|_)$/u.test(before) && !/^(?:\p{L}|\p{M}|\p{N}|_)/u.test(after)) {
          return true;
        }
        from = at + 1;
      }
    }
    return false;
  }

  function extractPostText(root) {
    if (!root) return "";
    const chunks = [];
    let total = 0;
    function walk(node) {
      if (total > 100000) return;
      if (node.nodeType === 3) {
        const val = node.nodeValue || node.textContent || "";
        if (val) { chunks.push(val); total += val.length; }
        return;
      }
      if (!node.childNodes && node._text) {
        chunks.push(node._text);
        total += node._text.length;
      }
      const list = node.childNodes && node.childNodes.length ? node.childNodes : node.children;
      if (list && list.length) {
        for (let i = 0; i < list.length; i++) walk(list[i]);
      } else if (node.textContent) {
        chunks.push(node.textContent);
        total += node.textContent.length;
      }
    }
    walk(root);
    return chunks.length ? chunks.join(" ") : (root.textContent || "");
  }

  function isMutedPost(mute, author, text) {
    if (!mute) return false;
    if (author && Array.isArray(mute.accounts) && mute.accounts.includes(author.toLowerCase())) return true;
    return matchesMutedWords(text, mute.words);
  }

  function hasExactLabel(root, wordSet) {
    if (!root || typeof root.querySelectorAll !== "function") return false;
    const nodes = root.querySelectorAll("span, a");
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (el.childElementCount > 1) continue;
      const t = el.textContent ? el.textContent.trim() : "";
      if (t && wordSet.has(t)) return true;
    }
    return false;
  }

  function isThreadsHost(href) {
    if (typeof href !== "string" || !href) return false;
    try {
      const host = new URL(href, "https://www.instagram.com").hostname.toLowerCase();
      return host === "threads.net" || host.endsWith(".threads.net") ||
        host === "threads.com" || host.endsWith(".threads.com");
    } catch (_) {
      return false;
    }
  }

  function isElement(node) {
    return !!node && typeof node === "object" && (node.nodeType === 1 || typeof node.matches === "function");
  }

  function isStyleable(node) {
    return isElement(node) && !!node.style && typeof node.style.setProperty === "function";
  }

  function rectOf(el) {
    if (!el || typeof el.getBoundingClientRect !== "function") return null;
    try { return el.getBoundingClientRect(); } catch (_) { return null; }
  }

  function createController(deps) {
    const d = deps || {};
    let active = false;
    let generation = 0;
    let scanQueued = false;
    let currentOpts = readOptions({});
    let muteSig = "";

    const kinds = new Map();
    const hidden = new Map();
    const collapsedPosts = new Map();
    let remembered = new WeakSet();
    let codes = new WeakMap();
    let unverified = new WeakSet();
    let checks = new WeakMap();
    let seen = new WeakSet();

    let anchorOff = null;
    let collapsedOnHome = false;
    let offObserve = null;
    let offMutations = null;
    let offRoute = null;

    function getDoc() {
      return d.document || (typeof document !== "undefined" ? document : null);
    }

    function getWin() {
      return d.window || (typeof window !== "undefined" ? window : null);
    }

    function getCore() {
      return d.core || (globalThis.IY && globalThis.IY.core) || null;
    }

    function isOwnUi(node) {
      if (typeof d.isOwnUi === "function") return d.isOwnUi(node);
      const iy = globalThis.IY;
      if (iy && iy.shadow && typeof iy.shadow.isOwnUi === "function") return iy.shadow.isOwnUi(node);
      return false;
    }

    function currentRoute() {
      const doc = getDoc();
      const loc = (doc && doc.location) || (typeof location !== "undefined" ? location : null);
      const path = loc && typeof loc.pathname === "string" ? loc.pathname : "/";
      return typeof d.parseRoute === "function" ? d.parseRoute(path) : parseRoute(path);
    }

    function isHome() {
      return currentRoute().kind === "home";
    }

    function stylesFor(kind) {
      return COLLAPSE_KINDS.has(kind) ? COLLAPSE_STYLES : REMOVE_STYLES;
    }

    function hide(el, styles) {
      if (!isStyleable(el) || hidden.has(el)) return;
      const prev = new Map();
      const keys = Object.keys(styles);
      for (let i = 0; i < keys.length; i++) {
        const prop = keys[i];
        const curVal = typeof el.style.getPropertyValue === "function" ? el.style.getPropertyValue(prop) : "";
        const curPri = typeof el.style.getPropertyPriority === "function" ? el.style.getPropertyPriority(prop) : "";
        prev.set(prop, [curVal, curPri]);
        el.style.setProperty(prop, styles[prop], "important");
      }
      hidden.set(el, prev);
    }

    function show(el) {
      const prev = hidden.get(el);
      if (!prev) return;
      hidden.delete(el);
      if (!el.style) return;
      for (const [prop, entry] of prev) {
        if (entry[0]) el.style.setProperty(prop, entry[0], entry[1] || "");
        else if (typeof el.style.removeProperty === "function") el.style.removeProperty(prop);
      }
    }

    function syncAnchoring(opts, on = true) {
      const doc = getDoc();
      if (!doc) return;
      const want = !!(on && collapsedOnHome && isHome() && (opts.ads || opts.suggested || opts.muteWords));
      if (want && !anchorOff) {
        const targets = [doc.documentElement, doc.body].filter(isStyleable);
        anchorOff = targets.map(el => {
          const val = typeof el.style.getPropertyValue === "function" ? el.style.getPropertyValue("overflow-anchor") : "";
          const pri = typeof el.style.getPropertyPriority === "function" ? el.style.getPropertyPriority("overflow-anchor") : "";
          el.style.setProperty("overflow-anchor", "none", "important");
          return { el, value: val, priority: pri };
        });
      } else if (!want && anchorOff) {
        for (let i = 0; i < anchorOff.length; i++) {
          const item = anchorOff[i];
          if (item.value) item.el.style.setProperty("overflow-anchor", item.value, item.priority || "");
          else if (typeof item.el.style.removeProperty === "function") item.el.style.removeProperty("overflow-anchor");
        }
        anchorOff = null;
      }
    }

    function has(kind, within) {
      for (const [el, k] of kinds) {
        if (k !== kind || el.isConnected === false) continue;
        if (!within || (typeof within.contains === "function" && within.contains(el))) return true;
      }
      return false;
    }

    function codeOf(art, postLinkSel, dialogSel) {
      const fresh = ownShortcode(art, postLinkSel);
      const cached = codes.get(art);
      if (fresh && cached && fresh !== cached) {
        // React recycled this <article> node in-place for a different post.
        codes.set(art, fresh);
        checks.delete(art);
        remembered.delete(art);
        unverified.delete(art);
        if (kinds.has(art)) {
          kinds.delete(art);
          const rect = rectOf(art);
          const inDialog = dialogSel && typeof art.closest === "function" && art.closest(dialogSel);
          if (!rect || rect.top >= 0 || inDialog) show(art);
        }
        return fresh;
      }
      if (fresh && !cached) codes.set(art, fresh);
      return fresh || cached;
    }

    function remember(el, kind, sel) {
      if (remembered.has(el) || !isHome() || (typeof el.closest === "function" && el.closest(sel.dialog))) return;
      const code = codeOf(el, sel.postLink, sel.dialog);
      if (!code) return;
      remembered.add(el);
      collapsedPosts.delete(code);
      collapsedPosts.set(code, kind);
      if (collapsedPosts.size > MAX_REMEMBERED) {
        collapsedPosts.delete(collapsedPosts.keys().next().value);
      }
    }

    function classify(art, sel) {
      if (hasExactLabel(art, sel.sponsoredSet)) return "ad";
      if (hasExactLabel(art, sel.suggestedSet)) return "suggested";
      const mute = currentOpts.mute;
      if ((mute.words.length || mute.accounts.length) && isHome() && !(typeof art.closest === "function" && art.closest(sel.dialog))) {
        if (isMutedPost(mute, postAuthor(art), extractPostText(art))) return "muted";
      }
      return undefined;
    }

    function restore(art, sel) {
      if (!collapsedPosts.size || !isHome() || (typeof art.closest === "function" && art.closest(sel.dialog))) return false;
      const code = codeOf(art, sel.postLink, sel.dialog);
      const kind = code && collapsedPosts.get(code);
      if (!kind) return false;
      collapsedPosts.delete(code);
      collapsedPosts.set(code, kind);
      kinds.set(art, kind);
      remembered.add(art);
      unverified.add(art);
      return true;
    }

    function verify(art, sel) {
      if (!kinds.has(art)) { unverified.delete(art); return; }
      const kind = classify(art, sel);
      if (kind) {
        unverified.delete(art);
        kinds.set(art, kind);
        return;
      }
      const n = (checks.get(art) || 0) + 1;
      checks.set(art, n);
      if (n < MAX_CHECKS) return;
      unverified.delete(art);
      const code = codeOf(art, sel.postLink, sel.dialog);
      if (code) collapsedPosts.delete(code);
      const rect = rectOf(art);
      if (rect && rect.top < 0) return;
      kinds.delete(art);
      show(art);
    }

    function tagFeed(doc, sel) {
      const articles = doc.querySelectorAll(sel.article);
      for (let i = 0; i < articles.length; i++) {
        const art = articles[i];
        codeOf(art, sel.postLink, sel.dialog);
        if (unverified.has(art)) {
          verify(art, sel);
          continue;
        }
        if (kinds.has(art) || restore(art, sel)) continue;
        const inDialog = typeof art.closest === "function" && art.closest(sel.dialog);
        const rect = rectOf(art);
        if (!inDialog && rect && rect.top < 0) continue;
        const n = checks.get(art) || 0;
        if (n >= MAX_CHECKS) continue;
        checks.set(art, n + 1);
        const kind = classify(art, sel);
        if (kind) kinds.set(art, kind);
      }
    }

    function soleWrapper(el, doc) {
      let cur = el;
      while (
        cur.parentElement &&
        cur.parentElement.childElementCount === 1 &&
        cur.parentElement.tagName !== "NAV" &&
        cur.parentElement !== doc.body &&
        cur.parentElement !== doc.documentElement
      ) {
        cur = cur.parentElement;
      }
      return cur;
    }

    function tagNav(doc, sel) {
      const pairs = [[sel.reelsNav, "reels"], [sel.exploreNav, "explore"]];
      for (let p = 0; p < pairs.length; p++) {
        const links = doc.querySelectorAll(pairs[p][0]);
        for (let i = 0; i < links.length; i++) {
          const a = links[i];
          if (seen.has(a)) continue;
          seen.add(a);
          if (typeof a.closest === "function" && a.closest(sel.article)) continue;
          kinds.set(soleWrapper(a, doc), pairs[p][1]);
        }
      }
      const threads = doc.querySelectorAll(sel.threadsLink);
      for (let i = 0; i < threads.length; i++) {
        const a = threads[i];
        if (kinds.has(a)) continue;
        if (typeof a.closest === "function" && a.closest(sel.article)) continue;
        const href = typeof a.getAttribute === "function" ? a.getAttribute("href") : a.href;
        if (isThreadsHost(href)) kinds.set(a, "threads");
      }
    }

    function findSidebarAnchor(doc, main, sel) {
      const byLink = doc.querySelectorAll(sel.sidebarSuggestionsLink);
      for (let i = 0; i < byLink.length; i++) {
        const el = byLink[i];
        if (!seen.has(el) && !(typeof el.closest === "function" && el.closest(sel.article))) return el;
      }
      const scopes = main ? [main.querySelectorAll("span"), doc.querySelectorAll("aside span")] : [doc.querySelectorAll("span")];
      for (let sIdx = 0; sIdx < scopes.length; sIdx++) {
        const spans = scopes[sIdx];
        for (let i = 0; i < spans.length; i++) {
          const el = spans[i];
          if (seen.has(el) || el.childElementCount !== 0) continue;
          const text = el.textContent ? el.textContent.trim() : "";
          if (!text || !sel.suggestedSet.has(text)) continue;
          if (typeof el.closest === "function" && el.closest(sel.article + ", nav")) continue;
          return el;
        }
      }
      return null;
    }

    function isStoryList(ul, sel) {
      if (typeof ul.closest === "function" && ul.closest(sel.article)) return false;
      if (ul.querySelectorAll("li canvas").length >= 2) return true;
      const links = ul.querySelectorAll('li a[href^="/stories/"]');
      if (links.length >= 2) return true;
      const btns = ul.querySelectorAll("li button, li [role=\"button\"]");
      let storyBtns = 0;
      for (let i = 0; i < btns.length; i++) {
        const lbl = btns[i].getAttribute ? (btns[i].getAttribute("aria-label") || "") : "";
        if (/(?:story|hikaye|hikâye)/i.test(lbl)) storyBtns++;
        if (storyBtns >= 2) return true;
      }
      return false;
    }

    function pickTrayRoot(ul, main, doc, sel) {
      const pres = typeof ul.closest === "function" ? ul.closest('[role="presentation"]') : null;
      const candidates = [pres && pres.parentElement, pres, ul.parentElement, ul];
      for (let i = 0; i < candidates.length; i++) {
        const cand = candidates[i];
        if (!cand || cand === main || cand === doc.body || cand === doc.documentElement) continue;
        if (typeof cand.querySelector === "function" && cand.querySelector(sel.article)) continue;
        return cand;
      }
      return ul;
    }

    function tagHome(doc, win, sel) {
      if (!isHome()) return;
      const main = doc.querySelector(sel.main);
      if (!has("sidebar")) {
        const anchor = findSidebarAnchor(doc, main, sel);
        if (anchor) {
          seen.add(anchor);
          let col = anchor;
          const path = [anchor];
          while (col.parentElement && col.parentElement !== doc.body && col.parentElement !== doc.documentElement) {
            const pr = rectOf(col.parentElement);
            if (!pr || pr.width <= 0 || pr.width >= 420) break;
            if (main && (col.parentElement === main || (typeof col.parentElement.contains === "function" && col.parentElement.contains(main)))) break;
            col = col.parentElement;
            path.push(col);
          }
          const cr = rectOf(col);
          const vw = (win && win.innerWidth) || 1024;
          if (col !== anchor && cr && cr.left > vw / 2) {
            // The right column also holds the account switcher and the footer links: hide only
            // the block that carries the suggestions heading, which is the branch of the first
            // wrapper (from the column down) that has more than one child. A column that has no
            // such split keeps the old behaviour and goes as a whole.
            let level = path.length - 1;
            while (level > 0 && path[level].childElementCount <= 1) level--;
            const block = level > 0 ? path[level - 1] : null;
            kinds.set(block && block !== anchor ? block : col, "sidebar");
          }
        }
      }
      if (main && !has("stories", main)) {
        const lists = main.querySelectorAll("ul");
        for (let i = 0; i < lists.length; i++) {
          const ul = lists[i];
          if (isStoryList(ul, sel)) {
            kinds.set(pickTrayRoot(ul, main, doc, sel), "stories");
            break;
          }
        }
      }
    }

    function tagProfile(doc, sel) {
      if (currentRoute().kind !== "profile") return;
      const main = doc.querySelector(sel.main);
      if (!main || has("sidebar", main)) return;
      const nodes = main.querySelectorAll("h1, h2, h3, h4, h5, h6, span");
      let heading = null;
      for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i];
        if (seen.has(el) || el.childElementCount !== 0) continue;
        const t = el.textContent ? el.textContent.trim() : "";
        if (t && sel.suggestedSet.has(t) && !(typeof el.closest === "function" && el.closest(sel.article))) {
          heading = el;
          break;
        }
      }
      if (!heading) return;
      seen.add(heading);
      let block = heading;
      while (
        block.parentElement &&
        block.parentElement !== main &&
        block.parentElement !== doc.body &&
        !block.parentElement.querySelector("header")
      ) {
        block = block.parentElement;
      }
      const parent = block.parentElement;
      const safeSibling = parent && (parent !== main || parent.childElementCount > 1);
      if (
        block !== heading &&
        block !== main &&
        safeSibling &&
        parent.querySelector("header") &&
        !block.querySelector("header") &&
        !block.querySelector(sel.article)
      ) {
        kinds.set(block, "sidebar");
      }
    }

    function apply(opts, sel) {
      const home = isHome();
      for (const [el, kind] of kinds) {
        if (el.isConnected === false) {
          kinds.delete(el);
          hidden.delete(el);
          continue;
        }
        if (!isStyleable(el)) continue;
        const flag = SETTING_FOR[kind];
        if (opts[flag]) {
          hide(el, stylesFor(kind));
          if (COLLAPSE_KINDS.has(kind) && typeof el.matches === "function" && el.matches(sel.article)) {
            if (home && !(typeof el.closest === "function" && el.closest(sel.dialog))) collapsedOnHome = true;
            remember(el, kind, sel);
          }
        } else {
          show(el);
        }
      }
    }

    function syncMute(opts) {
      const nextSig = JSON.stringify(opts.mute);
      if (nextSig === muteSig) return;
      muteSig = nextSig;
      for (const [el, kind] of kinds) {
        if (kind !== "muted") continue;
        kinds.delete(el);
        if (isStyleable(el)) show(el);
      }
      for (const [code, kind] of collapsedPosts) {
        if (kind === "muted") collapsedPosts.delete(code);
      }
      remembered = new WeakSet();
      checks = new WeakMap();
    }

    function scanAll() {
      if (!active) return;
      const doc = getDoc();
      if (!doc) return;
      const sel = selConfig();
      if (currentOpts.ads || currentOpts.suggested || currentOpts.muteWords) tagFeed(doc, sel);
      if (currentOpts.reelsNav || currentOpts.exploreNav || currentOpts.threads) tagNav(doc, sel);
      if (currentOpts.suggestedAccounts || currentOpts.storyTray) tagHome(doc, getWin(), sel);
      if (currentOpts.suggestedAccounts) tagProfile(doc, sel);
      apply(currentOpts, sel);
      syncAnchoring(currentOpts, true);
    }

    function scheduleScan() {
      if (!active || scanQueued) return;
      scanQueued = true;
      const gen = generation;
      const core = getCore();
      const flush = () => {
        if (!active || gen !== generation) return;
        scanQueued = false;
        scanAll();
      };
      const wrapped = core && typeof core.bind === "function" ? core.bind(flush) : flush;
      Promise.resolve().then(wrapped);
    }

    function collapseRemounted(arts, sel) {
      if (!arts.size) return;
      const home = isHome();
      for (const art of arts) {
        if (kinds.has(art) || !restore(art, sel)) continue;
        const kind = kinds.get(art);
        if (kind && currentOpts[SETTING_FOR[kind]] && isStyleable(art)) {
          hide(art, stylesFor(kind));
          if (home) collapsedOnHome = true;
        }
      }
      if (collapsedOnHome) syncAnchoring(currentOpts, true);
    }

    function onAddedNode(node) {
      if (!active || !isElement(node) || isOwnUi(node)) return;
      if (collapsedPosts.size && isHome()) {
        const sel = selConfig();
        const arts = new Set();
        const host = typeof node.closest === "function" ? node.closest(sel.article) : null;
        if (host) {
          arts.add(host);
        } else if (typeof node.matches === "function" && node.matches(sel.article)) {
          arts.add(node);
        } else if (typeof node.querySelectorAll === "function") {
          const found = node.querySelectorAll(sel.article);
          for (let i = 0; i < found.length; i++) arts.add(found[i]);
        }
        collapseRemounted(arts, sel);
      }
      scheduleScan();
    }

    function onMutations(records) {
      if (!active || !collapsedPosts.size || !isHome() || !Array.isArray(records)) return;
      const sel = selConfig();
      const arts = new Set();
      const hosts = new Map();
      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        if (!r || !r.addedNodes || !r.addedNodes.length) continue;
        let host = hosts.get(r.target);
        if (host === undefined) {
          host = isElement(r.target) && typeof r.target.closest === "function" ? r.target.closest(sel.article) : null;
          hosts.set(r.target, host);
        }
        if (host) { arts.add(host); continue; }
        for (let j = 0; j < r.addedNodes.length; j++) {
          const n = r.addedNodes[j];
          if (!isElement(n) || isOwnUi(n)) continue;
          if (typeof n.matches === "function" && n.matches(sel.article)) arts.add(n);
          else if (typeof n.querySelectorAll === "function") {
            const list = n.querySelectorAll(sel.article);
            for (let k = 0; k < list.length; k++) arts.add(list[k]);
          }
        }
      }
      collapseRemounted(arts, sel);
    }

    function onRoute() {
      if (!active) return;
      scanAll();
    }

    function start(settings) {
      currentOpts = readOptions(settings);
      if (!isEnabled(settings)) { stop(); return; }
      if (active) { update(settings); return; }
      active = true;
      generation++;
      scanQueued = false;
      muteSig = JSON.stringify(currentOpts.mute);

      const core = getCore();
      if (core) {
        if (typeof core.observe === "function") {
          offObserve = core.observe(node => isElement(node) && !isOwnUi(node), onAddedNode);
        }
        if (typeof core.onMutations === "function") {
          offMutations = core.onMutations(onMutations);
        }
        if (typeof core.route === "function") {
          offRoute = core.route(onRoute);
        }
      }
      scanAll();
    }

    function update(settings) {
      currentOpts = readOptions(settings);
      if (!isEnabled(settings)) { stop(); return; }
      if (!active) { start(settings); return; }
      syncMute(currentOpts);
      scanAll();
    }

    function stop() {
      if (!active && !hidden.size && !anchorOff) return;
      active = false;
      generation++;
      scanQueued = false;
      if (offObserve) { try { offObserve(); } catch (_) {} offObserve = null; }
      if (offMutations) { try { offMutations(); } catch (_) {} offMutations = null; }
      if (offRoute) { try { offRoute(); } catch (_) {} offRoute = null; }

      collapsedPosts.clear();
      remembered = new WeakSet();
      codes = new WeakMap();
      unverified = new WeakSet();
      collapsedOnHome = false;
      for (const el of [...hidden.keys()]) show(el);
      kinds.clear();
      checks = new WeakMap();
      seen = new WeakSet();
      muteSig = "";
      syncAnchoring(currentOpts, false);
    }

    return {
      start,
      update,
      stop,
      scan: scanAll,
      isActive: () => active
    };
  }

  let defaultController = null;

  function registerFeature(core) {
    const iyCore = core || (globalThis.IY && globalThis.IY.core);
    if (!iyCore || typeof iyCore.feature !== "function") return null;
    if (!defaultController) defaultController = createController();
    iyCore.feature("declutter", {
      keys: ["cfg", "ui"],
      enabled: isEnabled,
      start: settings => defaultController.start(settings),
      update: settings => defaultController.update(settings),
      stop: () => defaultController.stop()
    });
    return defaultController;
  }

  const api = {
    SPONSORED_WORDS,
    SUGGESTED_WORDS,
    COLLAPSE_STYLES,
    REMOVE_STYLES,
    MAX_CHECKS,
    MAX_REMEMBERED,
    readOptions,
    isEnabled,
    parseRoute,
    ownShortcode,
    postAuthor,
    matchesMutedWords,
    isMutedPost,
    hasExactLabel,
    createController,
    registerFeature,
    getController: () => defaultController
  };

  globalThis.IY = globalThis.IY || {};
  globalThis.IY.declutter = api;
  if (globalThis.IY.core && typeof globalThis.IY.core.feature === "function") {
    registerFeature(globalThis.IY.core);
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
