// Adapted from Glassgram's video download picker and downloadAudio action, GPL-3.0-only.
(() => {
  "use strict";
  const strings = {
    setAudioMp3: ["Sesi MP3 olarak kaydet", "Save audio as MP3"],
    saveSoundWorking: ["MP3 hazırlanıyor…", "Preparing MP3…"],
    saveSoundPermissionWait: ["MP3 için izin penceresini onayla…", "Confirm the MP3 permission window…"],
    saveSoundDownloading: ["Ses indiriliyor…", "Downloading audio…"],
    saveSoundDecoding: ["Ses çözülüyor…", "Decoding audio…"],
    saveSoundEncoding: ["MP3 dönüştürülüyor…", "Converting to MP3…"],
    saveSoundStarted: ["MP3 indirmesi başladı.", "MP3 download started."],
    saveSoundPermission: ["MP3 için Instagram medya sunucularına erişim izni gerekli.", "MP3 needs permission to access Instagram's media servers."],
    saveSoundMissing: ["Bu videoda kaydedilebilir ses bulunamadı.", "No audio could be found in this video."],
    saveSoundDecode: ["Bu videonun sesi MP3'e çözülemedi.", "Could not decode this video's audio."],
    saveSoundNetwork: ["Video sesi Instagram sunucusundan indirilemedi.", "Could not download the video's audio from Instagram."],
    saveSoundBusy: ["Bir medya işlemi sürüyor. Biraz sonra tekrar dene.", "A media job is running. Try again shortly."],
    saveSoundSize: ["Bu medya MP3 dönüştürme sınırını aşıyor.", "This media exceeds the MP3 conversion limit."],
    saveSoundTarget: ["Video değişti veya seçilemedi. Menüyü yeniden aç.", "The video changed or could not be identified. Reopen the menu."],
    saveSoundFailed: ["Ses MP3 olarak kaydedilemedi.", "Could not save the sound as MP3."]
  };

  // resolveTarget may choose the first video when several blob-backed slides
  // have no identifying information. Require unique evidence in this case.
  function identified(items, selected, video, key) {
    const videos = items.filter(item => item?.type === "video");
    if (videos.length < 2) return true;
    const src = key(video.currentSrc || video.src);
    const poster = key(video.poster);
    const byUrl = src && videos.filter(item => key(item.url) === src);
    const byPoster = poster && videos.filter(item => key(item.posterUrl) === poster);
    const matches = byUrl?.length ? byUrl : byPoster?.length ? byPoster :
      videos.filter(item => Math.abs(item.duration - video.duration) < 1.5);
    return matches.length === 1 && matches[0] === selected;
  }

  function findContainerShortcode(video, resolve) {
    if (!video || typeof resolve?.shortcodeInRoot !== "function") return undefined;
    if (typeof video.closest === "function") {
      const box = video.closest('div[role="dialog"], [role="dialog"], article, section');
      const code = box && resolve.shortcodeInRoot(box);
      if (code) return code;
    }
    let cur = video.parentElement;
    for (let depth = 0; depth < 6 && cur; depth++, cur = cur.parentElement) {
      const tag = typeof cur.tagName === "string" ? cur.tagName.toUpperCase() : "";
      if (tag === "MAIN" || tag === "BODY" || tag === "HTML") break;
      if (typeof cur.querySelectorAll === "function" && cur.querySelectorAll("video").length > 1) break;
      const code = resolve.shortcodeInRoot(cur);
      if (code) return code;
    }
    return undefined;
  }

  function install(env) {
    const iy = env.IY;
    const api = env.browser || env.chrome;
    let enabled = false, button, pending, activeProgress = null, generation = 0;

    function isTr() {
      try { return /^tr\b/i.test(api.i18n.getUILanguage()); } catch (_) { return true; }
    }
    function label(key) {
      let msg = "";
      try { msg = api.i18n.getMessage(key); } catch (_) {}
      return msg || strings[key][isTr() ? 0 : 1];
    }
    function toast(key, ms) {
      return iy.shadow?.showToast(label(key), ms);
    }
    function closeProgress() {
      try { activeProgress?.close?.(); } catch (_) {}
      activeProgress = null;
    }
    function formatProgress(stage, percent) {
      const pct = Number.isFinite(percent) && percent > 0 ? ` ${Math.min(100, Math.round(percent))}%` : "";
      if (stage === "permission") return label("saveSoundPermissionWait");
      if (stage === "fetch") return label("saveSoundDownloading") + pct;
      if (stage === "decode") return label("saveSoundDecoding");
      if (stage === "encode") return label("saveSoundEncoding") + pct;
      return label("saveSoundWorking");
    }
    function remove() { button?.remove(); button = null; }

    function normalizeContext(raw, video) {
      if (!raw || typeof raw !== "object") return null;
      const kind = raw.kind === "reel" ? "post" : raw.kind === "highlight" ? "story" : raw.kind;
      if (kind === "post") {
        if (!raw.shortcode) return null;
        return { kind: "post", el: video || raw.el || null, shortcode: raw.shortcode };
      }
      if (kind === "story") {
        let reelId = raw.reelId;
        if (typeof reelId === "string" && reelId) {
          const id = reelId;
          reelId = async () => id;
        } else if (typeof reelId !== "function") {
          if (raw.highlightId) {
            const id = "highlight:" + raw.highlightId;
            reelId = async () => id;
          } else if (raw.username) {
            const username = raw.username;
            reelId = offline => iy.api.getUserId(username, { offline });
          } else {
            return null;
          }
        }
        return {
          kind: "story",
          el: video || raw.el || null,
          username: raw.username,
          storyId: raw.storyId,
          highlightId: raw.highlightId,
          reelId
        };
      }
      if (kind === "direct" && iy.isAllowedCdn(raw.directUrl)) {
        return { kind: "direct", el: video || raw.el || null, directUrl: raw.directUrl };
      }
      return null;
    }

    function state(video, hint) {
      if (!enabled) return null;
      if (video && (video.tagName !== "VIDEO" || video.isConnected === false || video.srcObject)) return null;
      let ctx = hint ? normalizeContext(hint, video) : null;
      if (!ctx && video) {
        ctx = normalizeContext(iy.resolve.contextFor(video), video);
        if (!ctx) {
          const code = findContainerShortcode(video, iy.resolve);
          if (code) ctx = { kind: "post", el: video, shortcode: code };
        }
        if (!ctx) {
          const direct = video.currentSrc || video.src;
          if (iy.isAllowedCdn(direct)) ctx = { kind: "direct", el: video, directUrl: direct };
        }
      }
      if (!ctx) return null;
      return {
        ctx,
        video: video || ctx.el || null,
        stamp: [
          env.location.href, ctx.kind, ctx.shortcode, ctx.storyId, ctx.username,
          ctx.highlightId, video?.currentSrc, video?.src, video?.poster
        ]
      };
    }

    // Listen for live progress updates from the background audio job.
    try {
      api.runtime?.onMessage?.addListener?.((msg, sender) => {
        if (msg?.type !== "iy:save-sound-progress" || !pending || !activeProgress) return false;
        if (sender && api.runtime?.id && sender.id !== api.runtime.id) return false;
        const text = formatProgress(msg.stage, msg.percent);
        if (typeof activeProgress.update === "function") activeProgress.update(text);
        else iy.shadow?.showToast(text, 0);
        return false;
      });
    } catch (_) {}

    async function execute(initial, checkFresh, version) {
      if (!checkFresh()) { toast("saveSoundTarget"); return { ok: false, error: "target" }; }
      if (pending) { toast("saveSoundBusy"); return { ok: false, error: "busy" }; }
      const request = pending = {};
      const video = initial.video;
      const ctx = initial.ctx;
      activeProgress = iy.shadow?.showToast(label("saveSoundWorking"), 0) || null;
      try {
        let audioUrls = [];
        let videoUrl;
        let duration = video?.duration;
        let meta = {
          user: ctx.username || "instagram",
          shortcode: ctx.shortcode || ctx.storyId || "video",
          id: ctx.storyId || "",
          takenAt: 0,
          index: 0,
          isCarousel: false
        };

        if (ctx.kind === "direct") {
          videoUrl = iy.isAllowedCdn(ctx.directUrl) ? ctx.directUrl : undefined;
        } else {
          let resolved;
          try {
            resolved = await iy.resolve.resolveTarget(ctx);
          } catch (_) {
            if (!enabled || version !== generation) return { ok: false, error: "disabled" };
            if (!checkFresh()) { closeProgress(); toast("saveSoundTarget"); return { ok: false, error: "target" }; }
            const direct = video?.currentSrc || video?.src;
            if (iy.isAllowedCdn(direct)) {
              videoUrl = direct;
            } else {
              closeProgress();
              toast("saveSoundFailed", 5000);
              return { ok: false, error: "failed" };
            }
          }
          if (resolved) {
            const { post, index, tray } = resolved;
            if (!enabled || version !== generation) return { ok: false, error: "disabled" };
            if (!checkFresh()) { closeProgress(); toast("saveSoundTarget"); return { ok: false, error: "target" }; }
            const item = post?.items?.[index];
            const storyId = ctx.storyId;
            if (item?.type !== "video" || (storyId && String(post.id) !== storyId) ||
                (video && !identified(post.items, item, video, iy.resolve.cdnFileKey)) ||
                (video && tray && !storyId && !identified(tray.map(p => p.items?.[0]), item, video, iy.resolve.cdnFileKey))) {
              closeProgress();
              toast("saveSoundTarget");
              return { ok: false, error: "target" };
            }
            const rawAudio = Array.isArray(item.audioUrls) ? item.audioUrls : (item.audioUrl ? [item.audioUrl] : []);
            audioUrls = [...new Set(rawAudio.filter(url => iy.isAllowedCdn(url)))];
            const candidate = item.dashOnly ? (video?.currentSrc || video?.src) : item.url;
            videoUrl = iy.isAllowedCdn(candidate) ? candidate :
              (!item.dashOnly && iy.isAllowedCdn(video?.currentSrc || video?.src) ? (video.currentSrc || video.src) : undefined);
            duration = item.duration || video?.duration;
            meta = {
              user: post.username,
              shortcode: post.shortcode || post.id,
              id: item.id || post.id,
              takenAt: post.takenAt,
              index,
              isCarousel: post.items.length > 1
            };
          }
        }

        const audioUrl = audioUrls[0];
        if (!audioUrl && !videoUrl) {
          closeProgress();
          toast("saveSoundMissing", 4500);
          return { ok: false, error: "silent" };
        }

        const payload = { type: "iy:save-sound", audioUrl, videoUrl, duration, meta };
        if (audioUrls.length > 1) payload.audioUrls = audioUrls;
        const result = await api.runtime.sendMessage(payload);
        closeProgress();
        if (!enabled || version !== generation || result?.error === "disabled") {
          return { ok: false, error: "disabled" };
        }
        const errors = {
          permission: "saveSoundPermission",
          busy: "saveSoundBusy",
          size: "saveSoundSize",
          silent: "saveSoundMissing",
          decode: "saveSoundDecode",
          fetch: "saveSoundNetwork",
          source: "saveSoundNetwork"
        };
        if (result?.ok) {
          toast("saveSoundStarted", 3000);
        } else {
          toast(errors[result?.error] || "saveSoundFailed", 5000);
        }
        return result || { ok: false, error: "failed" };
      } catch (_) {
        closeProgress();
        if (enabled && version === generation) toast("saveSoundFailed", 5000);
        return { ok: false, error: "failed" };
      } finally {
        if (pending === request) {
          closeProgress();
          pending = null;
        }
      }
    }

    function mountMenu(menu, getVideo, close) {
      remove();
      if (!enabled) return;
      const video = getVideo();
      const initial = state(video);
      if (!initial) return;
      const version = generation;
      const node = button = menu.ownerDocument.createElement("button");
      node.type = "button";
      node.className = "menu-item";
      node.setAttribute("role", "menuitem");
      node.textContent = label("setAudioMp3");
      menu.appendChild(node);
      const fresh = () => {
        if (generation !== version || getVideo() !== video) return false;
        const now = state(video);
        return Boolean(now && now.stamp.every((v, i) => v === initial.stamp[i]));
      };
      node.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();
        if (!enabled || node !== button) return;
        close();
        await execute(initial, fresh, version);
      });
    }

    async function ensureEnabled() {
      if (enabled) return true;
      try {
        const saved = await new Promise(resolve => {
          const maybe = api?.storage?.local?.get?.("ui", data => resolve(data || {}));
          if (maybe && typeof maybe.then === "function") maybe.then(resolve, () => resolve({}));
        });
        if (saved?.ui?.audioMp3 === true) { enabled = true; return true; }
      } catch (_) {}
      return false;
    }

    async function run(target) {
      if (!(await ensureEnabled())) return { ok: false, error: "disabled" };
      let video = null;
      let hint = null;
      if (target && typeof target === "object") {
        if (target.tagName === "VIDEO") video = target;
        else {
          hint = target;
          if (target.el && target.el.tagName === "VIDEO") video = target.el;
        }
      }
      const initial = state(video, hint);
      if (!initial) {
        toast("saveSoundTarget", 4500);
        return { ok: false, error: "target" };
      }
      const version = generation;
      const fresh = () => {
        if (generation !== version) return false;
        const now = state(video, hint);
        return Boolean(now && now.stamp.every((v, i) => v === initial.stamp[i]));
      };
      return execute(initial, fresh, version);
    }

    iy.core.feature("saveSound", {
      enabled: settings => settings.ui?.audioMp3 === true,
      start() { enabled = true; },
      stop() { enabled = false; generation++; pending = null; closeProgress(); remove(); }
    });
    return { mountMenu, run };
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { install };
  else globalThis.IY.saveSound = install(globalThis);
})();
