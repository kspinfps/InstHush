"use strict";
if (typeof importScripts === "function") {
  importScripts("../lib/media.js", "../lib/themes.js", "../lib/settings-schema.js", "../lib/sync.js", "../lib/filename.js");
  // v1.9 features load one by one: a script that fails to load must never take
  // downloads, the icon, health or sync down with it. Firefox lists the same files
  // (plus src/offscreen/audio.js) in manifest background.scripts, in this order.
  try { importScripts("../page/dm-capture.js", "../content/features/dm-archive.js"); } catch (err) {}
  try { importScripts("context-menu.js"); } catch (err) {}
  try { importScripts("audio-job.js"); } catch (err) {}
  try { importScripts("lazy.js"); } catch (err) {}
  try { importScripts("../lib/health.js", "health.js"); } catch (err) {}
}
// Keep unsent messages: the serial archive writer (inert until a tab with the switch on writes).
try { if (globalThis.IY && IY.dmArchive && typeof IY.dmArchive.registerWriter === "function") IY.dmArchive.registerWriter(chrome); } catch (err) {}

// Firefox loads the libraries before this file in its background document.
const firefoxBackground = typeof importScripts !== "function";
const pendingObjectUrls = new Map();

function revokePendingObjectUrl(id) {
  const url = pendingObjectUrls.get(id);
  if (!url) return;
  URL.revokeObjectURL(url);
  pendingObjectUrls.delete(id);
}

if (firefoxBackground) {
  chrome.downloads.onChanged.addListener(function (delta) {
    if (delta.state && (delta.state.current === "complete" || delta.state.current === "interrupted")) {
      revokePendingObjectUrl(delta.id);
    }
  });
}

function packagedIcon() {
  try {
    const result = chrome.action.setIcon({ path: { 16: "/assets/icon-16.png", 32: "/assets/icon-32.png" } }, function () { void chrome.runtime.lastError; });
    if (result && typeof result.catch === "function") result.catch(function () {});
  } catch (err) {}
}

function updateIcon(theme) {
  try {
    if (typeof OffscreenCanvas !== "function") { packagedIcon(); return; }
    const colors = IY.iconColors(theme);
    const imageData = {};
    for (const size of [16, 32]) {
      const context = new OffscreenCanvas(size, size).getContext("2d");
      context.scale(size / 16, size / 16);
      const shell = new Path2D("M2.5 14.5V7a5.5 5.5 0 0 1 11 0v7.5l-2.5-1-3 1-3-1Z");
      context.fillStyle = colors.fill;
      context.strokeStyle = colors.stroke;
      context.lineWidth = 1;
      context.lineJoin = "round";
      context.fill(shell);
      context.stroke(shell);
      context.fillStyle = colors.play;
      context.fill(new Path2D("m7 5 4 3-4 3Z"));
      imageData[size] = context.getImageData(0, 0, size, size);
    }
    const result = chrome.action.setIcon({ imageData }, function () {
      if (chrome.runtime.lastError) packagedIcon();
    });
    if (result && typeof result.catch === "function") result.catch(packagedIcon);
  } catch (err) { packagedIcon(); }
}

// Read on every worker startup; ignore an older read after a storage change.
let iconRevision = 0;
if (chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== "local" || !changes.ui) return;
    const before = changes.ui.oldValue;
    const after = changes.ui.newValue;
    if ((before && before.theme) === (after && after.theme)) return;
    iconRevision++;
    updateIcon(after && after.theme);
  });
  try {
    chrome.storage.local.get("ui", function (saved) {
      if (iconRevision) return;
      if (chrome.runtime.lastError) { packagedIcon(); return; }
      updateIcon(saved && saved.ui && saved.ui.theme);
    });
  } catch (err) { packagedIcon(); }
}

chrome.runtime.onInstalled.addListener(function () {
  chrome.storage.local.get(["cfg", "stats"], function (saved) {
    if (chrome.runtime.lastError) return;
    const defaults = { video: true, ads: true, ghostStory: true, ghostDm: true };
    const cfg = { ...defaults };
    for (const key of Object.keys(defaults)) {
      if (saved.cfg && typeof saved.cfg[key] === "boolean") cfg[key] = saved.cfg[key];
    }
    const stats = { ads: 0, story: 0, dm: 0, leak: 0, error: 0, last: { ads: 0, story: 0, dm: 0 } };
    for (const key of ["ads", "story", "dm", "leak", "error"]) {
      if (saved.stats && Number.isSafeInteger(saved.stats[key]) && saved.stats[key] >= 0) stats[key] = saved.stats[key];
    }
    for (const key of Object.keys(stats.last)) {
      const value = saved.stats && saved.stats.last && saved.stats.last[key];
      if (Number.isFinite(value) && value >= 0) stats.last[key] = value;
    }
    chrome.storage.local.set({ cfg, stats });
  });
});

// Opt-in settings sync (Settings page switch, off by default). Inert until switched on;
// a failure here never touches downloads, icons or health.
try {
  if (globalThis.IY && IY.sync && typeof IY.sync.install === "function") IY.sync.install(chrome);
} catch (err) {}

// Health check runner (Settings page button). Inert until that page asks; a failure here touches nothing else.
try {
  if (globalThis.IY && IY.bgHealth && typeof IY.bgHealth.install === "function") IY.bgHealth.install(chrome);
} catch (err) {}

// Serialize health updates from all tabs, including overlapping worker events.
let healthWrites = Promise.resolve();
const reservedHealthNames = new Set(["__proto__", "constructor", "prototype"]);
const maxHealthKeys = 50;
chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg?.type === "iy:health") {
    if (sender?.id !== chrome.runtime.id || typeof msg.name !== "string" ||
        reservedHealthNames.has(msg.name) ||
        !/^[a-z][a-z0-9_-]{0,39}$/i.test(msg.name) || !["start", "stop", "callback", "load"].includes(msg.phase)) return;
    const last = Date.now();
    healthWrites = healthWrites.then(async () => {
      const { health = {} } = await chrome.storage.local.get("health");
      const entries = Object.create(null);
      const keys = Object.keys(health || {});
      let size = 0;
      for (const key of keys) {
        if (reservedHealthNames.has(key)) continue;
        entries[key] = health[key];
        if (++size === maxHealthKeys) break;
      }
      if (size === maxHealthKeys && !Object.hasOwn(entries, msg.name)) {
        if (keys.length > size) await chrome.storage.local.set({ health: entries });
        return false;
      }
      const count = Number(entries[msg.name]?.count) || 0;
      const entry = { count: count + 3, last, msg: "Feature " + msg.phase + " failed" };
      await chrome.storage.local.set({ health: { ...entries, [msg.name]: entry } });
      return true;
    }).then(ok => sendResponse({ ok }), () => sendResponse({ ok: false })).catch(() => {});
    return true;
  }
  // "Ayarların tümü" in the in-page dock: content scripts cannot open the options page themselves.
  if (msg?.type === "iy:openOptions") {
    if (sender?.id !== chrome.runtime.id) return;
    try {
      const opened = chrome.runtime.openOptionsPage();
      if (opened && typeof opened.then === "function") opened.then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
      else sendResponse({ ok: true });
    } catch (err) { sendResponse({ ok: false }); }
    return true;
  }
  if (!msg || (msg.type !== "iy:download" && msg.type !== "iy:download-zip")) return;
  const zip = msg.type === "iy:download-zip";
  try {
    if (!sender || sender.id !== chrome.runtime.id) {
      sendResponse({ ok: false, error: "invalid-sender" });
      return;
    }
    const url = msg.url;
    const filename = msg.avatarUsername === undefined ? msg.filename : IY.buildAvatarFilename(msg.avatarUsername, new Date());
    if (msg.avatarUsername !== undefined && (!IY.isValidUsername(msg.avatarUsername) || !IY.isAllowedCdn(url))) {
      sendResponse({ ok: false, error: "invalid-avatar" });
      return;
    }
    if (zip ? !(firefoxBackground ? msg.blob instanceof Blob || msg.blob instanceof Uint8Array :
        typeof url === "string" && /^blob:https:\/\/www\.instagram\.com\/[A-Za-z0-9-]+$/.test(url)) :
        !IY.isAllowedCdn(url) && !(IY.isFramePng(url) && typeof filename === "string" && filename.endsWith(".png"))) {
      sendResponse({ ok: false, error: "invalid-url" });
      return;
    }
    const cleanFilename = typeof filename === "string" ? filename.trim() : "";
    // Filename templates may add folders: a relative path of at most 6 safe segments.
    // Each segment passes the strict leaf check, so "", ".", "..", "\", drive letters and
    // reserved device names are all refused.
    if (!IY.isSafeDownloadPath(cleanFilename) ||
        (zip && !/\.zip$/i.test(cleanFilename))) {
      sendResponse({ ok: false, error: "invalid-filename" });
      return;
    }
    let objectUrl = null;
    function revoke() {
      if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    }
    try {
      let downloadUrl = url;
      if (zip && firefoxBackground) {
        objectUrl = URL.createObjectURL(new Blob([msg.blob], { type: "application/zip" }));
        downloadUrl = objectUrl;
      } else if (firefoxBackground && IY.isFramePng(url)) {
        // Decode locally: no fetch, host permission or data-URL download needed.
        const bytes = Uint8Array.from(atob(url.slice(url.indexOf(",") + 1)), c => c.charCodeAt(0));
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
        downloadUrl = objectUrl;
      }
      chrome.downloads.download({ url: downloadUrl, filename: cleanFilename, saveAs: false, conflictAction: "uniquify" }, function (id) {
        const error = chrome.runtime.lastError;
        if (error || typeof id !== "number") {
          revoke();
          sendResponse({ ok: false, error: error ? error.message : "download-failed" });
        } else {
          if (objectUrl) {
            pendingObjectUrls.set(id, objectUrl);
            // Fallback only: downloads.onChanged revokes on completion. A ZIP can be large.
            setTimeout(function () { revokePendingObjectUrl(id); }, zip ? 600000 : 60000);
          }
          sendResponse({ ok: true, id });
        }
      });
    } catch (error) { revoke(); throw error; }
    return true;
  } catch (error) {
    sendResponse({ ok: false, error: error.message || "download-failed" });
  }
});
