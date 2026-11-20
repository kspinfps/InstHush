// Health check probe. Loaded lazily, and only in the tab the background opened for the check.
// Strictly read-only: it looks at what the page already loaded and asks the page relay (memory in
// the page, no network) for a post. It never clicks, types, opens anything or sends a request.
// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only. Copyright jewdev.
(function () {
  "use strict";

  const READY_MS = 12000;
  const SETTLE_MS = 1200;
  const SHORTCODE_RE = /\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,})/;
  const RESERVED = new Set(["accounts", "explore", "direct", "about", "developer", "legal", "emails", "challenge",
    "stories", "reels", "reel", "p", "tv", "web", "session", "privacy", "terms", "press", "api", "graphql", "oauth",
    "nametag", "lite", "your_activity", "notifications", "threads", "settings", "archive", "create", "login",
    "signup", "help", "ads", "business", "static", "download"]);
  const SPONSORED = new Set(["Sponsored", "Sponsorlu", "Sponsorlu gönderi", "Reklam", "Publicidad", "Sponsorisé",
    "Gesponsert", "Sponsorizzato", "Patrocinado", "Gesponsord", "Реклама", "広告", "광고", "贊助", "赞助"]);

  // English text: it goes into the copied report. The Settings page shows its own translation by id.
  const LABELS = {
    page: "Page script", relay: "Instagram page data", feed: "Post layout", postdata: "Post data",
    nav: "Navigation", stories: "Stories tray", comments: "Comments", profile: "Profile layout",
    avatar: "Profile picture capture", bulk: "Bulk download format", reels: "Reels player",
    explore: "Explore grid", inbox: "Inbox", cooldown: "Rate limit"
  };

  function result(id, status, detail, affects, n) {
    const out = { id, label: LABELS[id] || id, status, detail };
    if (affects && affects.length) out.affects = affects;
    if (Number.isFinite(n)) out.n = n;
    return out;
  }

  function create(deps) {
    const doc = deps.document;
    const loc = deps.location;
    const sleep = deps.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
    const now = deps.now || (() => Date.now());
    const readyMs = deps.readyMs === undefined ? READY_MS : deps.readyMs;
    const settleMs = deps.settleMs === undefined ? SETTLE_MS : deps.settleMs;
    const all = (root, sel) => { try { return Array.from((root || doc).querySelectorAll(sel)); } catch (_) { return []; } };
    const one = (root, sel) => { try { return (root || doc).querySelector(sel); } catch (_) { return null; } };

    function shortcodeIn(root) {
      let found;
      for (const a of all(root, 'a[href*="/p/"], a[href*="/reel/"], a[href*="/reels/"], a[href*="/tv/"]')) {
        const m = SHORTCODE_RE.exec(a.getAttribute("href") || "");
        if (!m) continue;
        if (found && found !== m[1]) return undefined;
        found = m[1];
      }
      return found;
    }
    function authorIn(root) {
      const links = all(root, 'header a[href^="/"]');
      for (const a of links.length ? links : all(root, 'a[href^="/"]')) {
        const m = /^\/([A-Za-z0-9._]{1,30})\/?$/.exec((a.getAttribute("href") || "").split(/[?#]/)[0]);
        if (m && !RESERVED.has(m[1].toLowerCase())) return m[1];
      }
      return undefined;
    }
    function sponsored(article) {
      for (const el of all(article, "span, a")) {
        if (el.childElementCount > 1) continue;
        if (SPONSORED.has((el.textContent || "").trim())) return true;
      }
      return false;
    }
    function route() {
      const parts = String(loc.pathname || "/").split("/").filter(Boolean);
      const a = parts[0] || "";
      if (!a) return "home";
      if (a === "p" || a === "tv") return "post";
      if (a === "reels" || a === "reel") return "reels";
      if (a === "explore") return "explore";
      if (a === "direct") return parts[1] === "t" ? "chat" : "direct";
      if (a === "stories") return "story";
      return RESERVED.has(a.toLowerCase()) ? "other" : "profile";
    }

    const READY = {
      home: () => all(doc, "article").some(a => shortcodeIn(a)),
      post: () => !!one(doc, "main img, main video, article img, article video"),
      profile: () => !!one(one(doc, "header"), "img"),
      reels: () => !!one(doc, "video"),
      explore: () => !!one(one(doc, "main"), 'a[href*="/p/"], a[href*="/reel/"]'),
      direct: () => !!(one(doc, "main") && one(doc, "main").childElementCount)
    };
    async function whenReady(step) {
      const end = now() + readyMs;
      for (;;) {
        if (READY[step]()) { await sleep(settleMs); return true; }
        if (now() >= end) return false;
        await sleep(250);
      }
    }

    async function relay(op, args) {
      try { return { ok: true, value: await deps.relay(op, args) }; } catch (_) { return { ok: false }; }
    }

    async function pageChecks(rel) {
      if (!rel.ok) {
        return [result("page", "fail", "The page script does not answer.", ["Downloads", "Story and message privacy"]),
          result("relay", "skip", "Needs the page script.")];
      }
      const found = rel.value && rel.value.relay === true;
      return [result("page", "pass", "Connected."), found
        ? result("relay", "pass", "Found and readable.")
        : result("relay", "fail", "Instagram's page data was not found. Features that read posts would have to ask Instagram.",
          ["Downloads", "Follow badge", "Story details"])];
    }

    function visibleCode() {
      const m = /^\/(?:[^/]+\/)?(?:p|reel|tv)\/([A-Za-z0-9_-]{5,})/.exec(loc.pathname || "");
      if (m) return m[1];
      for (const article of all(doc, "article")) { const c = shortcodeIn(article); if (c) return c; }
      return undefined;
    }
    async function postData(relayOk) {
      if (!relayOk) return result("postdata", "skip", "Needs Instagram's page data.");
      const code = visibleCode();
      if (!code) return result("postdata", "skip", "No post on this page.");
      const rel = await relay("getMedia", { code });
      const raw = rel.ok ? rel.value : null;
      if (!raw) return result("postdata", "warn", "A post on screen was not found in the page data. Downloads fall back to asking Instagram.", ["Downloads"]);
      let items = [];
      try { items = deps.normalize(raw, code).items || []; } catch (_) {}
      return items.length && items.every(item => item && item.url)
        ? result("postdata", "pass", "Read the media of a post on screen.", undefined, items.length)
        : result("postdata", "fail", "Found a post but could not read its photo or video links.", ["Downloads", "Full size view", "Copy media link"]);
    }

    function feed() {
      const articles = all(doc, "article");
      if (!articles.length) {
        const main = one(doc, "main");
        if (route() === "post" && main && one(main, "img, video")) {
          return one(main, "time[datetime]")
            ? result("feed", "pass", "Found the post on this page.")
            : result("feed", "warn", "Found the post, but not its date.", ["Exact dates"]);
        }
        return one(doc, 'a[href*="/p/"], a[href*="/reel/"]')
          ? result("feed", "fail", "Posts are on screen, but not where InstHush looks for them.", ["Media toolbar", "Ad cleanup", "Exact dates", "Keyboard keys"])
          : result("feed", "skip", "No posts loaded in time. Run the check again.");
      }
      const coded = articles.filter(a => shortcodeIn(a)).length;
      const timed = articles.filter(a => one(a, "time[datetime]")).length;
      if (!coded) return result("feed", "fail", "Found posts, but none links to itself the way InstHush expects.", ["Media toolbar", "Keyboard keys", "Seen posts"]);
      if (!timed) return result("feed", "warn", "Found posts without a date.", ["Exact dates"], coded);
      return result("feed", "pass", "Recognized posts on screen.", undefined, coded);
    }

    function nav() {
      const miss = [one(doc, 'a[href="/reels/"]') ? "" : "Reels", one(doc, 'a[href="/explore/"]') ? "" : "Explore"].filter(Boolean);
      return miss.length
        ? result("nav", "warn", "Could not find the " + miss.join(" and ") + " link in the menu.", ["Hide Reels tab", "Hide Explore tab", "Focus mode"])
        : result("nav", "pass", "Found the Reels and Explore links.");
    }
    function stories() {
      const main = one(doc, "main");
      const tray = all(main, "ul").some(ul => !ul.closest("article") &&
        (all(ul, "li canvas").length >= 2 || all(ul, 'li a[href^="/stories/"]').length >= 2));
      return tray ? result("stories", "pass", "Found the stories tray.")
        : result("stories", "skip", "No stories tray right now. It only shows when people you follow posted stories.");
    }
    function comments() {
      const replies = deps.replyWords || {};
      // Instagram's own labels carry zero-width characters, extra spaces and capitals the plain
      // trim missed, and the reply control may sit outside "main" (dialog) or carry only an
      // aria-label. Same normalising as the comment features use, tried in both casings.
      const label = raw => String(raw || "").replace(/[​-‍⁠﻿]/g, "").replace(/s+/g, " ").trim();
      const isReply = el => [el.textContent, el.getAttribute && el.getAttribute("aria-label")].some(raw => {
        const text = label(raw);
        return !!text && [text.toLowerCase(), text.toLocaleLowerCase("tr")].some(word => Object.hasOwn(replies, word));
      });
      const buttons = [...new Set([
        ...all(doc, 'main button, main [role="button"]'),
        ...all(doc, 'article button, article [role="button"], [role="dialog"] button, [role="dialog"] [role="button"], main [tabindex="0"]')
      ])].filter(isReply);
      const times = all(one(doc, "main"), "time[datetime]").length;
      if (times < 2 && !buttons.length) return result("comments", "skip", "This post shows no comments.");
      return buttons.length ? result("comments", "pass", "Found comments with their reply control.", undefined, buttons.length)
        : result("comments", "warn", "Found comments, but not their reply control.", ["Copy comment", "Author badge", "Comment GIF save"]);
    }
    function profile() {
      const header = one(doc, "header");
      if (!header) return result("profile", "fail", "Could not find the profile header.", ["Follow badge", "HD profile picture", "Bulk download"]);
      if (!one(header, "img")) return result("profile", "warn", "Found the profile header, but no picture in it.", ["HD profile picture"]);
      const name = String((loc.pathname || "").split("/").filter(Boolean)[0] || "").toLowerCase();
      const named = !!name && all(header, "h1, h2, span").some(el => (el.textContent || "").trim().toLowerCase() === name);
      return named ? result("profile", "pass", "Found the header, picture and username.")
        : result("profile", "warn", "Found the header, but not the username in it.", ["Follow badge"]);
    }
    function avatar() {
      const name = String((loc.pathname || "").split("/").filter(Boolean)[0] || "");
      if (typeof deps.getAvatar !== "function") return result("avatar", "skip", "Needs the page bridge.");
      let url = null;
      try { url = deps.getAvatar(name); } catch (_) {}
      return url ? result("avatar", "pass", "Captured the picture from Instagram's own response.")
        : result("avatar", "warn", "Instagram's own response did not carry the picture. The picture falls back to the page.", ["HD profile picture"]);
    }
    async function bulk(ui) {
      if (!ui || ui.bulkProfile !== true) return result("bulk", "skip", "Bulk profile download is off.");
      if (typeof deps.getProfileQuery !== "function") return result("bulk", "skip", "Needs the page bridge.");
      let query = null;
      try { query = await deps.getProfileQuery(String((loc.pathname || "").split("/").filter(Boolean)[0] || "")); } catch (_) {}
      return query ? result("bulk", "pass", "Captured Instagram's profile request format.")
        : result("bulk", "warn", "Instagram did not load the profile's posts the way InstHush expects.", ["Bulk download"]);
    }
    function reels() {
      const n = all(doc, "video").length;
      return n ? result("reels", "pass", "Found the reel video.", undefined, n)
        : result("reels", "fail", "Could not find a reel video.", ["Video controls", "Reel counter", "Reel ad cleanup", "Next reel when one ends"]);
    }
    function explore() {
      const n = all(one(doc, "main"), 'a[href*="/p/"], a[href*="/reel/"]').length;
      return n ? result("explore", "pass", "Found posts in the grid.", undefined, n)
        : result("explore", "fail", "Could not find the posts in the grid.", ["Media toolbar", "Hover zoom", "Daily limit"]);
    }
    function inbox() {
      const where = route();
      if (where === "chat") return result("inbox", "warn", "Instagram opened a chat by itself. InstHush does not open chats.", ["Message privacy"]);
      if (where !== "direct") return result("inbox", "fail", "Instagram opened another page instead of the inbox.", ["Voice message save", "Keep unsent messages"]);
      return result("inbox", "pass", "Opened the inbox. No chat is opened, so nothing is marked as read.");
    }
    async function cooldown() {
      let left = 0;
      try { left = typeof deps.cooldownLeft === "function" ? await deps.cooldownLeft() : 0; } catch (_) {}
      return left > 0 ? result("cooldown", "warn", "Instagram limited the requests of InstHush. They are paused.", ["Bulk download", "Unfollowers"], Math.ceil(left / 60000))
        : result("cooldown", "pass", "Not rate limited.");
    }

    // Where the next steps go, read from the feed. Never part of a copied report.
    function nextFromFeed() {
      const next = {};
      for (const article of all(doc, "article")) {
        if (sponsored(article)) continue;
        if (!next.post) next.post = shortcodeIn(article);
        if (!next.profile) next.profile = authorIn(article);
        if (next.post && next.profile) break;
      }
      return next;
    }

    async function run(step, ui) {
      if (!READY[step]) return { error: "step" };
      const loaded = await whenReady(step);
      const checks = [];
      let next;
      if (step === "home") {
        const pages = await pageChecks(await relay("health", {}));
        checks.splice(0, checks.length, ...pages);
        const relayOk = pages[1].status === "pass";
        if (loaded) checks.push(feed(), await postData(relayOk), nav(), stories());
        else checks.push(feed());
        checks.push(await cooldown());
        next = nextFromFeed();
      } else if (step === "post") {
        const rel = await relay("health", {});
        checks.push(feed(), await postData(rel.ok && rel.value && rel.value.relay === true), comments());
      } else if (step === "profile") {
        checks.push(profile(), avatar(), await bulk(ui));
      } else if (step === "reels") checks.push(reels());
      else if (step === "explore") checks.push(explore());
      else checks.push(inbox());
      return { checks, next, route: route() };
    }

    return { run, route, LABELS };
  }

  const api = { create, LABELS };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }

  // Browser: answer the background's step requests. Messages from anywhere else are ignored.
  const iy = globalThis.IY = globalThis.IY || {};
  if (!iy.core || typeof iy.core.isHealthTab !== "function" || !iy.core.isHealthTab() || iy.healthProbe) return;
  let client = null;
  let ui = {};
  try { chrome.storage.local.get("ui", saved => { void chrome.runtime.lastError; ui = (saved && saved.ui) || {}; }); } catch (_) {}
  const probe = create({
    document, location,
    replyWords: iy.selectors && iy.selectors.reply,
    normalize: (raw, code) => iy.resolve.normalizeMedia(raw, code),
    relay: (op, args) => {
      if (!client) client = iy.api.createRelayClient({ timeoutMs: 3000 });
      return client.request(op, args, 3000);
    },
    getAvatar: name => (typeof iy.getAvatar === "function" ? iy.getAvatar(name) : null),
    getProfileQuery: typeof iy.getProfileQuery === "function" ? name => iy.getProfileQuery(name) : undefined,
    cooldownLeft: () => iy.api.cooldownLeft()
  });
  iy.healthProbe = probe;
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== "iy:health-run" || sender.id !== chrome.runtime.id || sender.tab) return false;
    probe.run(msg.step, ui).then(sendResponse, () => sendResponse({ error: "failed" }));
    return true;
  });
})();
