(() => {
  "use strict";

  const COPY = {
    tr: {
      title: "MP3 indirme izni",
      desc: "Video sesini cihazında MP3 dosyasına dönüştürmek için InstHush'ın Instagram medya sunucularından ses dosyasını okumasına izin ver. Dönüştürme yalnızca cihazında yapılır.",
      hosts: "cdninstagram.com · fbcdn.net · lookaside.fbsbx.com",
      allow: "İzin ver ve MP3'ü indir",
      cancel: "Vazgeç",
      granted: "İzin verildi. MP3 hazırlanıyor, bu pencere kapanacak.",
      denied: "İzin verilmedi. Tekrar deneyebilir veya bu pencereyi kapatabilirsin.",
      unavailable: "Tarayıcı izin isteğini açamadı. Ayarlar → İndirme bölümünden tekrar dene."
    },
    en: {
      title: "MP3 download permission",
      desc: "Allow InstHush to read the video audio from Instagram's media servers so it can convert it to MP3 on your device. Everything stays local.",
      hosts: "cdninstagram.com · fbcdn.net · lookaside.fbsbx.com",
      allow: "Allow and download MP3",
      cancel: "Cancel",
      granted: "Permission granted. Preparing your MP3; this window will close.",
      denied: "Permission was not granted. You can try again or close this window.",
      unavailable: "The browser could not open the permission dialog. Try again from Settings → Downloads."
    }
  };

  function applyTheme(doc, iy, themeName) {
    if (!doc?.documentElement || !iy?.themeVars) return;
    const key = iy.resolveThemeName ? iy.resolveThemeName(themeName) : "black";
    const vars = iy.themeVars(key);
    for (const pair of vars.split(";")) {
      const idx = pair.indexOf(":");
      if (idx > 0) doc.documentElement.style.setProperty(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
    const mode = key === "white" ? "light" : "dark";
    doc.documentElement.setAttribute("data-theme", key);
    doc.documentElement.setAttribute("data-mode", mode);
  }

  function init(env = globalThis) {
    const doc = env.document;
    const api = env.browser || env.chrome;
    const iy = env.IY || {};
    const lang = /^tr\b/i.test(api?.i18n?.getUILanguage?.() || "tr") ? "tr" : "en";
    const copy = COPY[lang];

    if (doc?.documentElement) doc.documentElement.lang = lang;
    const titleEl = doc.getElementById("title");
    const descEl = doc.getElementById("desc");
    const hostsEl = doc.getElementById("hosts");
    const statusEl = doc.getElementById("status");
    const allowBtn = doc.getElementById("allow");
    const cancelBtn = doc.getElementById("cancel");

    if (titleEl) titleEl.textContent = copy.title;
    if (descEl) descEl.textContent = copy.desc;
    if (hostsEl) hostsEl.textContent = copy.hosts;
    if (allowBtn) allowBtn.textContent = copy.allow;
    if (cancelBtn) cancelBtn.textContent = copy.cancel;

    let settled = false;
    function notify(granted) {
      if (settled) return;
      settled = true;
      try {
        const res = api?.runtime?.sendMessage?.({ type: "iy:mp3-permission-done", granted: granted === true });
        if (res && typeof res.catch === "function") res.catch(() => {});
      } catch (_) {}
    }

    // The background closes this window once it has the grant; this is only the fallback.
    function closeSoon() { env.setTimeout?.(() => env.close?.(), 1200); }
    // Messages from an extension page keep the Chromium service worker alive while the
    // browser permission dialog is open and the conversion waits for the answer.
    const ping = () => {
      try {
        const res = api?.runtime?.sendMessage?.({ type: "iy:mp3-permission-ping" });
        if (res && typeof res.catch === "function") res.catch(() => {});
      } catch (_) {}
    };
    ping();
    const pinger = env.setInterval?.(ping, 10000);
    function showStatus(text) {
      if (!statusEl) return;
      statusEl.textContent = text;
      statusEl.hidden = !text;
    }

    // Apply current theme from storage.
    try {
      const got = api?.storage?.local?.get?.("ui", saved => {
        applyTheme(doc, iy, saved?.ui?.theme);
      });
      if (got && typeof got.then === "function") {
        got.then(saved => applyTheme(doc, iy, saved?.ui?.theme), () => applyTheme(doc, iy));
      }
    } catch (_) {
      applyTheme(doc, iy);
    }

    // If permission was already granted before the page finished loading, continue right away.
    const origins = { origins: iy.MP3_ORIGINS || [] };
    if (origins.origins.length && api?.permissions?.contains) {
      Promise.resolve(api.permissions.contains(origins)).then(has => {
        if (has === true) {
          notify(true);
          closeSoon();
        }
      }, () => {});
    }

    allowBtn?.addEventListener("click", () => {
      if (!api?.permissions?.request || !origins.origins.length) {
        showStatus(copy.unavailable);
        return;
      }
      allowBtn.disabled = true;
      showStatus("");
      let req;
      // Called synchronously inside the click handler to keep the user gesture intact.
      try {
        req = api.permissions.request(origins);
      } catch (_) {
        allowBtn.disabled = false;
        showStatus(copy.unavailable);
        return;
      }
      Promise.resolve(req).then(granted => {
        if (granted === true) {
          showStatus(copy.granted);
          notify(true);
          closeSoon();
        } else {
          allowBtn.disabled = false;
          showStatus(copy.denied);
        }
      }, () => {
        allowBtn.disabled = false;
        showStatus(copy.denied);
      });
    });

    cancelBtn?.addEventListener("click", () => {
      notify(false);
      env.close?.();
    });

    doc.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        event.preventDefault();
        notify(false);
        env.close?.();
      }
    });

    env.addEventListener?.("beforeunload", () => { env.clearInterval?.(pinger); notify(false); });
    allowBtn?.focus?.();
    return { notify };
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { init, COPY };
  else init(globalThis);
})();
