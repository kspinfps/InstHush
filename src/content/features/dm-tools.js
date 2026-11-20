// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
// DM voice message download: renders a themed closed-shadow download button next to each
// voice message bubble in Direct Messages, builds filenames via src/lib/filename.js, and
// prevents all click/pointer propagation so downloading never plays the clip, never marks
// anything as read, and never consumes or interferes with DM ghost mode (dmread.js / net.js).
(function () {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;

  var SCAN_THROTTLE_MS = 300;
  var MAX_FIBER_WALK = 6;
  var MAX_ENV_WALK = 2000;
  var MAX_DIV_TRIES = 20;

  var VOICE_BTN_CSS = `:host {
  display: inline-grid;
  place-items: center;
  flex: none;
  align-self: center;
  vertical-align: middle;
}
.iy-voice-dl {
  appearance: none;
  box-sizing: border-box;
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  margin: 0 6px 0 4px;
  padding: 0;
  border: 1px solid var(--iy-border, rgb(var(--iy-ink, 255 255 255) / 0.16));
  border-radius: 50%;
  background: var(--iy-glass, var(--iy-surface-raised, #252e27));
  color: var(--iy-text, #eaf0e8);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgb(var(--iy-ink, 255 255 255) / 0.08);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  cursor: pointer;
  transition: background-color 120ms cubic-bezier(0.2, 0, 0, 1), border-color 120ms cubic-bezier(0.2, 0, 0, 1), color 120ms cubic-bezier(0.2, 0, 0, 1), transform 120ms cubic-bezier(0.2, 0, 0, 1);
}
.iy-voice-dl:hover:not(:disabled) {
  background: var(--iy-accent-soft, rgb(var(--iy-ink, 255 255 255) / 0.16));
  border-color: var(--iy-accent, #9dceab);
  color: var(--iy-accent, #9dceab);
}
.iy-voice-dl:active:not(:disabled) {
  transform: scale(0.94);
}
.iy-voice-dl:focus-visible {
  outline: 2px solid var(--iy-accent, #9dceab);
  outline-offset: 2px;
}
.iy-voice-dl:disabled {
  opacity: 0.5;
  cursor: default;
}
@media (prefers-reduced-motion: reduce) {
  .iy-voice-dl, .iy-voice-dl:active:not(:disabled) {
    transition: none !important;
    transform: none !important;
  }
}
:host([data-motion="off"]) .iy-voice-dl,
:host([data-motion="off"]) .iy-voice-dl:active:not(:disabled) {
  transition: none !important;
  transform: none !important;
}
@media (forced-colors: active) {
  .iy-voice-dl {
    border: 1px solid ButtonText;
    background: ButtonFace;
    color: ButtonText;
  }
}`;

  var STRINGS = {
    tr: {
      voiceDownloadBtn: "Sesli mesajı indir",
      toastVoiceStarted: "Sesli mesaj indiriliyor.",
      toastVoiceError: "Sesli mesaj indirilemedi.",
      toastVoiceNone: "İndirilecek sesli mesaj bulunamadı."
    },
    en: {
      voiceDownloadBtn: "Download voice message",
      toastVoiceStarted: "Downloading voice message.",
      toastVoiceError: "Could not download voice message.",
      toastVoiceNone: "No voice message found to download."
    }
  };

  function fallbackText(key, lang) {
    var l = String(lang || "").trim().toLowerCase();
    var table = l.indexOf("en") === 0 ? STRINGS.en : STRINGS.tr;
    return table[key] || STRINGS.tr[key] || STRINGS.en[key] || "";
  }

  function getShadow(deps) {
    if (deps && deps.shadow) return deps.shadow;
    var iy = globalThis.IY;
    if (iy && iy.shadow && typeof iy.shadow.createHost === "function") return iy.shadow;
    if (isNode) {
      try { return require("../ui/shadow.js"); } catch (_) {}
    }
    return null;
  }

  function getFilenameLib(deps) {
    if (deps && deps.filename) return deps.filename;
    var iy = globalThis.IY;
    if (iy && iy.filename && typeof iy.filename.renderFilename === "function") return iy.filename;
    if (isNode) {
      try { return require("../../lib/filename.js"); } catch (_) {}
    }
    return null;
  }

  function getMediaLib(deps) {
    if (deps && deps.media) return deps.media;
    var iy = globalThis.IY;
    if (iy && typeof iy.isAllowedCdn === "function") return iy;
    if (isNode) {
      try { return require("../../lib/media.js"); } catch (_) {}
    }
    return iy || null;
  }

  function getDownloadLib(deps) {
    if (deps && deps.download) return deps.download;
    var iy = globalThis.IY;
    if (iy && iy.download) return iy.download;
    if (isNode) {
      try { return require("../core/download.js"); } catch (_) {}
    }
    return null;
  }

  function isVoiceDownloadEnabled(cfg, ui) {
    if (ui && typeof ui === "object" && typeof ui.voiceDownload === "boolean") {
      return ui.voiceDownload;
    }
    if (cfg && typeof cfg === "object" && typeof cfg.voiceDownload === "boolean") {
      return cfg.voiceDownload;
    }
    return false;
  }

  function isDmRoute(pathname) {
    if (typeof pathname !== "string") return false;
    return /^\/direct(?:\/|$)/.test(pathname.split(/[?#]/)[0]);
  }

  function isAllowedVoiceUrl(url, mediaLib) {
    if (typeof url !== "string" || !url) return false;
    if (mediaLib && typeof mediaLib.isAllowedCdn === "function") {
      return mediaLib.isAllowedCdn(url);
    }
    try {
      var parsed = new URL(url);
      return (
        parsed.protocol === "https:" &&
        !parsed.username &&
        !parsed.password &&
        !parsed.port &&
        (parsed.hostname.endsWith(".cdninstagram.com") ||
          parsed.hostname.endsWith(".fbcdn.net") ||
          parsed.hostname === "lookaside.fbsbx.com")
      );
    } catch (_) {
      return false;
    }
  }

  function extFromAudioUrl(url, fallback) {
    if (typeof url === "string" && url) {
      try {
        var pathname = new URL(url, "https://www.instagram.com/").pathname;
        var m = /\.(m4a|mp4|aac|mp3|ogg|opus|wav)(?:$|[?#])/i.exec(pathname);
        if (m) return m[1].toLowerCase();
      } catch (_) {}
    }
    return fallback || "m4a";
  }

  function extractRootFolder(template, defaultTemplate) {
    var tpl = typeof template === "string" && template.trim() ? template.trim() : defaultTemplate;
    if (typeof tpl !== "string" || tpl.indexOf("/") === -1) return "";
    var clean = tpl.replace(/^\/*[a-z]:/i, "");
    var parts = clean.split("/").filter(function (p) { return p && !/^[. ]+$/.test(p); });
    if (parts.length < 2) return "";
    var first = parts[0];
    if (/\{[a-z]+\}/i.test(first)) return "";
    return first;
  }

  function inRootFolder(subpath, template, defaultTemplate) {
    var root = extractRootFolder(template, defaultTemplate);
    var cleanSub = String(subpath || "").replace(/^\/+/, "");
    return root ? root + "/" + cleanSub : cleanSub;
  }

  function voiceFilename(attachmentId, options) {
    var opts = options || {};
    var fnLib = getFilenameLib(opts);
    var defaultTpl = (fnLib && fnLib.DEFAULT_TEMPLATE) || "InstHush/{user}/{user}_{date}_{shortcode}_{index}";
    var userTpl = typeof opts.template === "string" && opts.template.trim() ? opts.template.trim() : defaultTpl;
    var ext = typeof opts.ext === "string" && /^[a-z0-9]{2,5}$/i.test(opts.ext)
      ? opts.ext.toLowerCase()
      : extFromAudioUrl(opts.url, "m4a");
    var nowSec = Number.isFinite(opts.takenAt) && opts.takenAt > 0
      ? opts.takenAt
      : Math.floor((typeof opts.now === "function" ? opts.now() : Date.now()) / 1000);
    var rawId = attachmentId !== undefined && attachmentId !== null && String(attachmentId).trim()
      ? String(attachmentId).trim().replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "")
      : "";
    if (!rawId) rawId = String(Math.floor(nowSec));

    var voiceTpl = inRootFolder("DMs/voice_{date}_{id}", userTpl, defaultTpl);
    if (fnLib && typeof fnLib.renderFilename === "function") {
      return fnLib.renderFilename(voiceTpl, {
        user: opts.user || "",
        shortcode: "",
        index: 1,
        id: rawId,
        takenAt: nowSec,
        type: "audio",
        ext: ext
      }, { dateFormat: opts.dateFormat || "YYYY-MM-DD" });
    }
    var safeId = rawId.replace(/[^\w.-]/g, "_") || "voice";
    return "InstHush/DMs/voice_" + safeId + "." + ext;
  }

  function insertAfter(anchor, node) {
    if (!anchor || !node) return false;
    if (typeof anchor.insertAdjacentElement === "function") {
      anchor.insertAdjacentElement("afterend", node);
      return true;
    }
    var parent = anchor.parentElement || anchor.parentNode;
    if (parent && typeof parent.insertBefore === "function") {
      parent.insertBefore(node, anchor.nextSibling || null);
      return true;
    }
    if (parent && typeof parent.appendChild === "function") {
      parent.appendChild(node);
      return true;
    }
    if (parent && typeof parent.append === "function") {
      parent.append(node);
      return true;
    }
    return false;
  }

  /**
   * Scans a document/root for React fiber voice bubbles (`audioAttachmentRef` -> `XFBSlideAudioAttachment`)
   * and DOM `<audio>` / `[data-iy-voice-url]` elements without triggering any playback or read receipts.
   */
  function createVoiceScanner(options) {
    var opts = options || {};
    var fiberKey = "";
    var cachedRelaySource = opts.relaySource || null;
    var notVoice = new WeakSet();
    var voiceBubbles = new Map();
    var voiceInfo = new WeakMap();

    function fiberOf(el) {
      if (!el || typeof el !== "object") return undefined;
      if (fiberKey && Object.prototype.hasOwnProperty.call(el, fiberKey)) {
        return el[fiberKey];
      }
      var keys = Object.keys(el);
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].indexOf("__reactFiber$") === 0) {
          fiberKey = keys[i];
          return el[fiberKey];
        }
      }
      return undefined;
    }

    function sourceAbove(el) {
      var f = fiberOf(el);
      for (var i = 0; i < MAX_ENV_WALK && f; i++, f = f.return) {
        var props = f.memoizedProps;
        var env = props && (props.environment || (props.value && props.value.environment));
        if (env && typeof env.getStore === "function") {
          var store = env.getStore();
          if (store && typeof store.getSource === "function") {
            var src = store.getSource();
            if (src && typeof src.get === "function") return src;
          }
        }
      }
      return undefined;
    }

    function getRelaySource(doc, sampleEl) {
      if (opts.relaySource && typeof opts.relaySource.get === "function") return opts.relaySource;
      if (cachedRelaySource && typeof cachedRelaySource.get === "function") return cachedRelaySource;
      if (sampleEl) {
        var fromSample = sourceAbove(sampleEl);
        if (fromSample) {
          cachedRelaySource = fromSample;
          return fromSample;
        }
      }
      if (!doc || typeof doc.querySelector !== "function") return null;
      var selectors = ["main div", 'div[role="main"] div'];
      for (var s = 0; s < selectors.length; s++) {
        var rootDiv = doc.querySelector(selectors[s]);
        var src = rootDiv && sourceAbove(rootDiv);
        if (src) {
          cachedRelaySource = src;
          return src;
        }
      }
      if (typeof doc.querySelectorAll === "function") {
        var divs = doc.querySelectorAll("div");
        var tries = 0;
        for (var i = 0; i < divs.length; i++) {
          if (!fiberOf(divs[i])) continue;
          var found = sourceAbove(divs[i]);
          if (found) {
            cachedRelaySource = found;
            return found;
          }
          if (++tries >= MAX_DIV_TRIES) break;
        }
      }
      return null;
    }

    function insideVoiceBubble(el) {
      for (var a = el ? el.parentElement : null; a; a = a.parentElement) {
        if (voiceInfo.has(a)) return true;
      }
      return false;
    }

    function scan(doc, onVoice) {
      if (!doc || typeof doc.querySelectorAll !== "function") return [];
      var foundList = [];

      // Prune disconnected bubbles so remounted threads get fresh buttons.
      voiceBubbles.forEach(function (el, id) {
        if (!el || el.isConnected === false) voiceBubbles.delete(id);
      });

      var divs = doc.querySelectorAll("div");
      var src = null;

      for (var i = 0; i < divs.length; i++) {
        var el = divs[i];
        if (!el || el.isConnected === false) continue;
        if (voiceInfo.has(el)) {
          var existingInfo = voiceInfo.get(el);
          foundList.push({ el: el, voice: existingInfo });
          if (typeof onVoice === "function") onVoice(el, existingInfo);
          continue;
        }
        if (notVoice.has(el)) continue;

        // 1. Check data-iy-voice-url / data-voice-url attribute if present.
        var attrUrl = typeof el.getAttribute === "function"
          ? (el.getAttribute("data-iy-voice-url") || el.getAttribute("data-voice-url"))
          : "";
        if (attrUrl) {
          var attrId = (typeof el.getAttribute === "function" && (el.getAttribute("data-iy-voice-id") || el.getAttribute("data-voice-id"))) || "";
          if (!insideVoiceBubble(el)) {
            var attrVoice = { kind: "voice", url: String(attrUrl), id: String(attrId || "") };
            voiceInfo.set(el, attrVoice);
            if (attrId) voiceBubbles.set(String(attrId), el);
            foundList.push({ el: el, voice: attrVoice });
            if (typeof onVoice === "function") onVoice(el, attrVoice);
          }
          continue;
        }

        // 2. Check React fiber for audioAttachmentRef -> XFBSlideAudioAttachment.
        var hasRef = false;
        var f = fiberOf(el);
        for (var depth = 0; depth < MAX_FIBER_WALK && f; depth++, f = f.return) {
          var props = f.memoizedProps;
          if (!props || typeof props !== "object") continue;
          var refObj = props.audioAttachmentRef || props.audioAttachment;
          var refId = refObj && (refObj.__id || refObj.id || (typeof refObj === "string" ? refObj : ""));
          var directCdn = (refObj && refObj.attachment_cdn_url) || props.attachment_cdn_url;

          if (!refId && !directCdn) continue;
          hasRef = true;

          var key = String(refId || directCdn);
          if (!voiceBubbles.has(key) && !insideVoiceBubble(el)) {
            var rec = null;
            if (directCdn) {
              rec = refObj && typeof refObj === "object" ? refObj : props;
            } else {
              src = src || getRelaySource(doc, el);
              if (src && typeof src.get === "function") {
                try { rec = src.get(refId); } catch (_) { cachedRelaySource = null; rec = null; }
              }
            }
            var cdnUrl = rec && (rec.attachment_cdn_url || rec.audio_url || rec.playable_url);
            if (typeof cdnUrl === "string" && cdnUrl) {
              var fbid = rec.attachment_fbid !== undefined && rec.attachment_fbid !== null
                ? String(rec.attachment_fbid)
                : (rec.id !== undefined && rec.id !== null ? String(rec.id) : String(refId || ""));
              var durationMs = Number(rec.playable_duration_in_ms);
              var info = {
                kind: "voice",
                url: cdnUrl,
                id: fbid,
                durationMs: Number.isFinite(durationMs) && durationMs > 0 ? durationMs : undefined
              };
              voiceBubbles.set(key, el);
              voiceInfo.set(el, info);
              foundList.push({ el: el, voice: info });
              if (typeof onVoice === "function") onVoice(el, info);
            }
          }
          break;
        }

        // Only mark as non-voice when no audioAttachmentRef was present; if the record hasn't
        // loaded in Relay yet, leave it unmarked so the next scan retries it.
        if (!hasRef) {
          notVoice.add(el);
        }
      }

      // 3. Check passive <audio> elements if any exist in the DM thread (never calling .play()).
      var audios = doc.querySelectorAll("audio");
      for (var a = 0; a < audios.length; a++) {
        var audioEl = audios[a];
        if (!audioEl || audioEl.isConnected === false) continue;
        var bubbleEl = (typeof audioEl.closest === "function" && audioEl.closest('[role="region"], [role="button"], div')) || audioEl.parentElement || audioEl;
        if (!bubbleEl || voiceInfo.has(bubbleEl) || insideVoiceBubble(bubbleEl)) continue;
        var audioSrc = audioEl.currentSrc || audioEl.src || (typeof audioEl.getAttribute === "function" ? audioEl.getAttribute("src") : "");
        if (!audioSrc && typeof audioEl.querySelector === "function") {
          var sourceEl = audioEl.querySelector("source[src]");
          if (sourceEl) audioSrc = sourceEl.src || (typeof sourceEl.getAttribute === "function" ? sourceEl.getAttribute("src") : "");
        }
        if (typeof audioSrc === "string" && audioSrc) {
          var audioId = (typeof audioEl.getAttribute === "function" && (audioEl.getAttribute("data-id") || audioEl.getAttribute("id"))) || "";
          var audioInfo = { kind: "voice", url: audioSrc, id: String(audioId) };
          voiceInfo.set(bubbleEl, audioInfo);
          foundList.push({ el: bubbleEl, voice: audioInfo });
          if (typeof onVoice === "function") onVoice(bubbleEl, audioInfo);
        }
      }

      return foundList;
    }

    function reset() {
      fiberKey = "";
      cachedRelaySource = opts.relaySource || null;
      notVoice = new WeakSet();
      voiceBubbles.clear();
      voiceInfo = new WeakMap();
    }

    return {
      scan: scan,
      reset: reset,
      fiberOf: fiberOf,
      sourceAbove: sourceAbove,
      setRelaySource: function (src) { cachedRelaySource = src; }
    };
  }

  function stopBubbleEvents(el, onActivate) {
    if (!el || typeof el.addEventListener !== "function") return;
    var swallow = function (e) {
      if (!e) return;
      if (typeof e.stopPropagation === "function") e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
    };
    var events = ["pointerdown", "pointerup", "mousedown", "mouseup", "dblclick", "touchstart", "touchend"];
    for (var i = 0; i < events.length; i++) {
      el.addEventListener(events[i], swallow);
    }
    el.addEventListener("click", function (e) {
      if (e) {
        if (e.isTrusted === false) return;
        if (typeof e.preventDefault === "function") e.preventDefault();
        if (typeof e.stopPropagation === "function") e.stopPropagation();
        if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
      }
      onActivate(e);
    });
    el.addEventListener("keydown", function (e) {
      if (!e) return;
      if (e.key === "Enter" || e.key === " ") {
        if (e.isTrusted === false) return;
        if (typeof e.preventDefault === "function") e.preventDefault();
        if (typeof e.stopPropagation === "function") e.stopPropagation();
        if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
        onActivate(e);
      }
    });
  }

  function createController(deps) {
    var d = deps || {};
    var enabled = false;
    var currentTemplate = "";
    var buttons = new Map(); // bubble Element -> { record, host, btn, voice }
    var selectedVoice = null;
    var scanner = createVoiceScanner({ relaySource: d.relaySource });
    var scanTimer = 0;
    var cleanups = [];

    function getDoc() {
      return d.document || (typeof document !== "undefined" ? document : null);
    }

    function getLoc() {
      return d.location || (typeof location !== "undefined" ? location : { pathname: "/", href: "" });
    }

    function getNavLang() {
      if (d.lang) return d.lang;
      if (typeof navigator !== "undefined" && navigator && navigator.language) return navigator.language;
      var doc = getDoc();
      if (doc && doc.documentElement && typeof doc.documentElement.lang === "string" && doc.documentElement.lang) {
        return doc.documentElement.lang;
      }
      return "tr";
    }

    function t(key) {
      try {
        var chromeApi = d.chrome || (typeof chrome !== "undefined" ? chrome : null);
        if (chromeApi && chromeApi.i18n && typeof chromeApi.i18n.getMessage === "function") {
          var msg = chromeApi.i18n.getMessage(key);
          if (msg) return msg;
        }
      } catch (_) {}
      return fallbackText(key, getNavLang());
    }

    function notify(message, ms) {
      var sh = getShadow(d);
      if (sh && typeof sh.showToast === "function") {
        sh.showToast(message, ms);
      }
      return message;
    }

    function applySettingsState(settings) {
      var ui = settings && settings.ui;
      var sh = getShadow(d);
      if (ui && typeof ui === "object") {
        if (typeof ui.filenameTemplate === "string") {
          currentTemplate = ui.filenameTemplate;
        }
        if (sh) {
          if (typeof ui.theme === "string" && typeof sh.setTheme === "function") sh.setTheme(ui.theme);
          if (typeof ui.animations === "boolean" && typeof sh.setMotion === "function") sh.setMotion(ui.animations);
        }
      }
    }

    async function downloadVoice(voice, options) {
      var mediaLib = getMediaLib(d);
      var url = voice && typeof voice.url === "string" ? voice.url.trim() : "";
      if (!isAllowedVoiceUrl(url, mediaLib)) {
        notify(t("toastVoiceError"), 4000);
        return { ok: false, error: "invalid-url" };
      }

      var filename = voiceFilename(voice && voice.id, {
        url: url,
        template: (options && options.template) || currentTemplate,
        takenAt: voice && voice.takenAt,
        now: d.now,
        filename: d.filename
      });

      var ok = false;
      try {
        if (typeof d.sendDownload === "function") {
          var customReply = await d.sendDownload({ url: url, filename: filename, id: voice.id, type: "audio" });
          ok = Boolean(customReply && customReply.ok !== false);
        } else {
          var dlLib = getDownloadLib(d);
          if (dlLib && typeof dlLib.createDownloadJob === "function") {
            var job = dlLib.createDownloadJob([{
              url: url,
              filename: filename,
              id: (voice && voice.id) || "",
              type: "audio"
            }], {
              mode: "separate",
              isAllowedCdn: function (u) { return isAllowedVoiceUrl(u, mediaLib); }
            });
            var res = await job.start();
            ok = Boolean(res && res.ok);
          } else {
            var chromeApi = d.chrome || (typeof chrome !== "undefined" ? chrome : null);
            if (chromeApi && chromeApi.runtime && typeof chromeApi.runtime.sendMessage === "function") {
              ok = await new Promise(function (resolve) {
                try {
                  var settled = false;
                  var finish = function (reply) {
                    if (settled) return;
                    settled = true;
                    var err = chromeApi.runtime && chromeApi.runtime.lastError;
                    resolve(!err && Boolean(reply && reply.ok === true));
                  };
                  var p = chromeApi.runtime.sendMessage({ type: "iy:download", url: url, filename: filename }, finish);
                  if (p && typeof p.then === "function") {
                    p.then(finish, function () { finish({ ok: false }); });
                  }
                } catch (_) {
                  resolve(false);
                }
              });
            }
          }
        }
      } catch (_) {
        ok = false;
      }

      notify(ok ? t("toastVoiceStarted") : t("toastVoiceError"), ok ? 2800 : 4000);
      return { ok: ok, url: url, filename: filename };
    }

    function attachVoiceButton(bubble, voice) {
      if (!enabled || !bubble || bubble.isConnected === false || !voice || typeof voice.url !== "string") {
        return null;
      }
      var mediaLib = getMediaLib(d);
      if (!isAllowedVoiceUrl(voice.url, mediaLib)) {
        return null;
      }

      var existing = buttons.get(bubble);
      if (existing) {
        if (existing.host && existing.host.isConnected !== false) {
          existing.voice = voice;
          return existing.host;
        }
        if (existing.record && typeof existing.record.destroy === "function") {
          existing.record.destroy();
        }
        buttons.delete(bubble);
      }

      var sh = getShadow(d);
      var doc = getDoc();
      if (!sh || !doc) return null;

      var label = t("voiceDownloadBtn");
      var btn = sh.h("button", {
        type: "button",
        className: "iy-voice-dl",
        title: label,
        "aria-label": label
      }, sh.icon("download", 16));

      var record = sh.createHost({
        document: doc,
        tag: "span",
        className: "iy-voice-dl-host",
        css: VOICE_BTN_CSS,
        top: btn,
        stopPropagation: true
      });

      var entry = {
        record: record,
        host: record.host,
        btn: btn,
        bubble: bubble,
        voice: voice,
        busy: false
      };

      var markSelected = function () {
        selectedVoice = entry.voice;
      };
      btn.addEventListener("pointerenter", markSelected);
      btn.addEventListener("focus", markSelected);
      if (typeof bubble.addEventListener === "function") {
        bubble.addEventListener("pointerenter", markSelected);
      }

      stopBubbleEvents(btn, function () {
        if (!enabled || entry.busy) return;
        entry.busy = true;
        btn.disabled = true;
        selectedVoice = entry.voice;
        Promise.resolve(downloadVoice(entry.voice)).finally(function () {
          entry.busy = false;
          btn.disabled = false;
        });
      });

      insertAfter(bubble, record.host);
      buttons.set(bubble, entry);
      if (!selectedVoice) selectedVoice = voice;
      return record.host;
    }

    function pruneDisconnected() {
      buttons.forEach(function (entry, bubble) {
        if (!bubble || bubble.isConnected === false || !entry.host || entry.host.isConnected === false) {
          if (entry && entry.record && typeof entry.record.destroy === "function") {
            entry.record.destroy();
          } else if (entry && entry.host && typeof entry.host.remove === "function") {
            entry.host.remove();
          }
          if (selectedVoice === entry.voice) selectedVoice = null;
          buttons.delete(bubble);
        }
      });
    }

    function runScan() {
      if (!enabled) return;
      pruneDisconnected();
      if (!isDmRoute(getLoc().pathname)) return;
      var doc = getDoc();
      if (!doc) return;

      scanner.scan(doc, function (bubble, voice) {
        attachVoiceButton(bubble, voice);
      });

      var iy = globalThis.IY;
      var reqScan = (d.bridge && d.bridge.requestScan) ||
        (iy && iy.bridge && iy.bridge.requestScan) ||
        (iy && iy.requestScan);
      if (typeof reqScan === "function") {
        try { reqScan(); } catch (_) {}
      }
    }

    function scheduleScan() {
      if (!enabled) return;
      pruneDisconnected();
      if (!isDmRoute(getLoc().pathname)) return;
      if (scanTimer) return;
      scanTimer = setTimeout(function () {
        scanTimer = 0;
        runScan();
      }, SCAN_THROTTLE_MS);
    }

    async function downloadSelected() {
      pruneDisconnected();
      var targetVoice = selectedVoice;
      if (!targetVoice) {
        var lastEntry = null;
        buttons.forEach(function (entry) { lastEntry = entry; });
        if (lastEntry) targetVoice = lastEntry.voice;
      }
      if (!targetVoice) {
        notify(t("toastVoiceNone"), 3200);
        return { ok: false, error: "no-voice" };
      }
      return await downloadVoice(targetVoice);
    }

    function start(settings) {
      var s = settings || {};
      if (!isVoiceDownloadEnabled(s.cfg, s.ui)) return;
      applySettingsState(s);
      if (enabled) return;
      enabled = true;

      var iy = globalThis.IY;

      // Subscribe to bridge onFound('voice') if available.
      var onFoundFn = (d.bridge && d.bridge.onFound) ||
        (iy && iy.bridge && iy.bridge.onFound) ||
        (iy && iy.onFound);
      if (typeof onFoundFn === "function") {
        var offFound = onFoundFn("voice", function (bubble, voice) {
          attachVoiceButton(bubble, voice);
        });
        if (typeof offFound === "function") cleanups.push(offFound);
      }

      // Subscribe to shared MutationObserver and SPA router.
      if (iy && iy.core) {
        if (typeof iy.core.observe === "function") {
          var offObs = iy.core.observe(function () { return isDmRoute(getLoc().pathname); }, scheduleScan);
          if (typeof offObs === "function") cleanups.push(offObs);
        }
        if (typeof iy.core.route === "function") {
          var offRoute = iy.core.route(function () {
            pruneDisconnected();
            if (isDmRoute(getLoc().pathname)) runScan();
          });
          if (typeof offRoute === "function") cleanups.push(offRoute);
        }
      }

      runScan();
    }

    function update(settings) {
      var s = settings || {};
      applySettingsState(s);
      var shouldEnable = isVoiceDownloadEnabled(s.cfg, s.ui);
      if (shouldEnable && !enabled) start(s);
      else if (!shouldEnable && enabled) stop();
    }

    function stop() {
      enabled = false;
      if (scanTimer) {
        clearTimeout(scanTimer);
        scanTimer = 0;
      }
      while (cleanups.length) {
        var fn = cleanups.pop();
        try { fn(); } catch (_) {}
      }
      buttons.forEach(function (entry) {
        if (entry && entry.record && typeof entry.record.destroy === "function") {
          entry.record.destroy();
        } else if (entry && entry.host && typeof entry.host.remove === "function") {
          entry.host.remove();
        }
      });
      buttons.clear();
      selectedVoice = null;
      scanner.reset();
    }

    return {
      start: start,
      update: update,
      stop: stop,
      scan: runScan,
      scheduleScan: scheduleScan,
      attachVoiceButton: attachVoiceButton,
      downloadVoice: downloadVoice,
      downloadSelected: downloadSelected,
      isEnabled: function () { return enabled; },
      getButtons: function () { return buttons; },
      getSelectedVoice: function () { return selectedVoice; },
      setRelaySource: function (src) { scanner.setRelaySource(src); }
    };
  }

  var defaultController = null;

  function registerFeature(core, deps) {
    var iyCore = core || (globalThis.IY && globalThis.IY.core);
    if (!iyCore || typeof iyCore.feature !== "function") return null;
    if (!defaultController) defaultController = createController(deps);
    iyCore.feature("voiceDownload", {
      keys: ["cfg", "ui"],
      enabled: function (settings) {
        return isVoiceDownloadEnabled(settings && settings.cfg, settings && settings.ui);
      },
      start: function (settings) {
        defaultController.start(settings);
      },
      update: function (settings) {
        defaultController.update(settings);
      },
      stop: function () {
        defaultController.stop();
      }
    });
    return defaultController;
  }

  var api = {
    VOICE_BTN_CSS: VOICE_BTN_CSS,
    STRINGS: STRINGS,
    fallbackText: fallbackText,
    isVoiceDownloadEnabled: isVoiceDownloadEnabled,
    isDmRoute: isDmRoute,
    isAllowedVoiceUrl: isAllowedVoiceUrl,
    extFromAudioUrl: extFromAudioUrl,
    inRootFolder: inRootFolder,
    voiceFilename: voiceFilename,
    createVoiceScanner: createVoiceScanner,
    createController: createController,
    registerFeature: registerFeature,
    getController: function () { return defaultController; },
    downloadSelected: function () {
      if (!defaultController) defaultController = createController();
      return defaultController.downloadSelected();
    }
  };

  globalThis.IY = globalThis.IY || {};
  globalThis.IY.dmTools = api;
  globalThis.IY.voiceDownload = api;

  if (globalThis.IY.core && typeof globalThis.IY.core.feature === "function") {
    registerFeature(globalThis.IY.core);
  }

  if (isNode) {
    module.exports = api;
  }
})();
