// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
// Copyright jewdev
(function () {
  "use strict";

  const ORIGIN = "https://www.instagram.com";
  const STEPS = Object.freeze(["home", "post", "profile", "reels", "explore", "direct"]);
  const STEP_LABELS = Object.freeze({
    home: "Home feed",
    post: "A post",
    profile: "A profile",
    reels: "Reels",
    explore: "Explore",
    direct: "Messages"
  });
  const FIXED_PATHS = new Map([
    ["home", "/"], ["reels", "/reels/"], ["explore", "/explore/"], ["direct", "/direct/inbox/"]
  ]);
  // Keep profile navigation to single usernames and exclude Instagram's reserved routes.
  const RESERVED = new Set([
    "about", "accounts", "ads", "api", "archive", "business", "challenge", "create",
    "developer", "developers", "direct", "directory", "download", "emails", "explore",
    "graphql", "help", "legal", "lite", "locations", "login", "nametag", "notifications",
    "oauth", "p", "press", "privacy", "reel", "reels", "safety", "session", "settings",
    "signup", "static", "stories", "terms", "threads", "topics", "tv", "web", "your_activity"
  ]);

  function stepUrl(step, next) {
    if (FIXED_PATHS.has(step)) return ORIGIN + FIXED_PATHS.get(step);
    if (step === "post" && typeof next?.post === "string" && /^[A-Za-z0-9_-]+$/.test(next.post)) {
      return ORIGIN + "/p/" + next.post + "/";
    }
    if (step === "profile" && typeof next?.profile === "string" &&
        /^[A-Za-z0-9._]{1,30}$/.test(next.profile) && !/^\.+$/.test(next.profile) &&
        !RESERVED.has(next.profile.toLowerCase())) {
      return ORIGIN + "/" + next.profile + "/";
    }
    return undefined;
  }

  const STATUSES = ["skip", "pass", "warn", "fail"];

  function statusRank(status) {
    return Math.max(0, STATUSES.indexOf(status === "ok" ? "pass" : status));
  }

  function overall(checks) {
    let rank = 0;
    for (const check of checks) rank = Math.max(rank, statusRank(check?.status));
    return STATUSES[rank];
  }

  function rollupByFeature(checks) {
    const ranks = new Map();
    for (const check of checks) {
      if (!Array.isArray(check?.affects)) continue;
      for (const feature of check.affects) {
        if (typeof feature !== "string" || !feature.trim()) continue;
        ranks.set(feature, Math.max(ranks.get(feature) ?? 0, statusRank(check.status)));
      }
    }
    return Object.fromEntries(Array.from(ranks, ([feature, rank]) => [feature, STATUSES[rank]]));
  }

  function makeRedactor(report) {
    const sensitive = Array.isArray(report.sensitive) ? report.sensitive : [];
    const tokens = [report.next?.post, report.next?.profile, ...sensitive]
      .filter(value => typeof value === "string" && /^[A-Za-z0-9_.-]+$/.test(value))
      .sort((a, b) => b.length - a.length)
      .map(value => value.replace(/\./g, "\\."));
    const known = tokens.length
      ? new RegExp("(?<![\\w.-])(?:" + tokens.join("|") + ")(?![\\w-]|\\.[\\w])", "gi")
      : null;
    const url = /(?:\b[a-z][a-z0-9+.-]*:\/\/|\b(?:about|blob|data|javascript|mailto|tel):|(?<![\w/])\/\/)[^\s<>"']+/gi;
    const route = /(^|[\s("'=:])\/[^\s<>"')\]}]+/g;
    const mention = /\b[\w.+-]+@[\w.-]+\.[a-z]{2,63}\b|@[\w.]+/gi;
    const domain = /\b(?:[a-z0-9-]+\.)+[a-z]{2,63}(?:[/?#][^\s<>"']*)?(?![\w.-]|\.[\w])/gi;
    const labeled = /(\b(?:username|user|profile|shortcode|(?:post|reel)[ _-]?code|(?:(?:user|account|media|post|message|thread|reel)[ _-]?)?(?:ids?|pk))\s*[:=]\s*)(?:["'][^"'\r\n]+["']|@?[\w.-]+)/gi;

    return value => {
      if (typeof value !== "string") return "";
      // Free-text checks can carry URLs or IDs in error messages. Remove those before formatting.
      let text = value
        .replace(url, "[redacted]")
        .replace(route, "$1[redacted]")
        .replace(labeled, "$1[redacted]")
        .replace(mention, "[redacted]")
        .replace(domain, "[redacted]")
        .replace(/\b\d{6,}(?:_\d+)*\b/g, "[redacted]");
      if (known) text = text.replace(known, "[redacted]");
      return text.replace(/[\x00-\x1f\x7f\u2028\u2029]+/g, " ").trim();
    };
  }

  function reportText(report = {}, browser) {
    const redact = makeRedactor(report);
    const version = typeof report.version === "string" && /^\d{1,5}(?:\.\d{1,5}){1,3}$/.test(report.version)
      ? " " + report.version : "";
    const page = STEPS.includes(report.page) ? STEP_LABELS[report.page]
      : report.page === "full check" ? "Full check" : "Unknown";
    const lines = ["InstHush" + version + " health check", "Browser: " + (redact(browser) || "Unknown"), "Page: " + page];
    if (Number.isFinite(report.at) && Math.abs(report.at) <= 8.64e15) {
      lines.push("Time: " + new Date(report.at).toISOString());
    }
    let group;
    for (const check of Array.isArray(report.checks) ? report.checks : []) {
      if (!check || typeof check !== "object") continue;
      const heading = redact(check.group) || "InstHush";
      if (group !== heading) {
        group = heading;
        lines.push("", heading + ":");
      }
      const marker = STATUSES[statusRank(check.status)].toUpperCase();
      const label = redact(check.label) || "Check";
      const detail = redact(check.detail);
      lines.push("[" + marker + "] " + label + (detail ? ": " + detail : ""));
    }
    return lines.join("\n");
  }

  const api = { STEPS, STEP_LABELS, stepUrl, overall, rollupByFeature, reportText };
  globalThis.IY = Object.assign(globalThis.IY || {}, { health: api });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
