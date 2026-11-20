(function () {
  "use strict";
  // "Mark as read" for DM ghost mode. Clicking the button asks the page-world network
  // layer (over the private channel, via IY.allowDmRead) to let exactly the next read
  // receipt for THIS thread through, for a few seconds. This file never sends a request
  // and never fakes an event: Instagram itself sends the receipt on its next activity.

  var ALLOW_MS = 10000;
  var TOAST_MS = 3600;
  var CALL_CONTROL = '[aria-label*="audio call" i], [aria-label*="video call" i], [aria-label*="sesli ara" i], [aria-label*="görüntülü ara" i]';
  var DM_PATH = /^\/direct\/t\/([0-9]{5,25})\/?$/;

  // Open thread id from the pathname, or null.
  function threadIdFromPath(pathname) {
    if (typeof pathname !== "string") return null;
    var match = DM_PATH.exec(pathname.split(/[?#]/)[0]);
    return match ? match[1] : null;
  }

  var STRINGS = {
    en: {
      dmReadButton: "Mark as read",
      dmReadWaiting: "Waiting for activity",
      dmReadTip: "Let the next read receipt for this chat through",
      dmReadToast: "Will be marked read on next activity",
      dmReadDone: "Marked as read",
      dmReadExpired: "Not marked. Press again, then click or scroll in the chat.",
      dmReadFail: "Not ready yet. Try again in a moment."
    },
    tr: {
      dmReadButton: "Okundu yap",
      dmReadWaiting: "Etkinlik bekleniyor",
      dmReadTip: "Bu sohbet için bir sonraki okundu bilgisini geçir",
      dmReadToast: "Bir sonraki etkinlikte okundu olarak işaretlenecek",
      dmReadDone: "Okundu olarak işaretlendi",
      dmReadExpired: "İşaretlenmedi. Tekrar bas, sonra sohbette tıkla veya kaydır.",
      dmReadFail: "Henüz hazır değil. Biraz sonra tekrar dene."
    }
  };

  function fallbackText(key, lang) {
    var table = String(lang || "").toLowerCase().indexOf("tr") === 0 ? STRINGS.tr : STRINGS.en;
    return table[key] || STRINGS.en[key] || "";
  }

  // Walk out of the profile link/name group to its shared row with the call controls.
  function nameBranch(header) {
    var name = header.querySelector('h1, h2, h3, [role="heading"]') ||
      header.querySelector('a[href^="/"]:not([href^="/direct/"])') ||
      Array.from(header.querySelectorAll('[role="button"], button')).find(function (node) { return node.textContent.trim(); });
    if (!name) return null;
    var branch = name.closest('a, button, [role="button"]') || name;
    while (branch.parentElement && branch.parentElement !== header) {
      var next = branch.nextElementSibling;
      if (next?.className === "iy-dmread-host") next = next.nextElementSibling;
      if (next && (next.matches('a, button, [role="button"], svg') || next.querySelector('button, [role="button"], svg'))) break;
      branch = branch.parentElement;
    }
    return header.contains(branch) && branch !== header ? branch : null;
  }

  var api = { threadIdFromPath: threadIdFromPath, fallbackText: fallbackText, nameBranch: nameBranch, ALLOW_MS: ALLOW_MS };

  function boot() {
    if (globalThis.__iyDmReadInstalled) return;
    globalThis.__iyDmReadInstalled = true;

    var ghostOn = true, theme = "black", threadHeader = null;
    var threadId = null, armedId = null;
    var host = null, root = null, btn = null, label = null, toast = null;
    var armTimer = 0, toastTimer = 0;

    function t(key) {
      var text = "";
      try { text = chrome.i18n.getMessage(key); } catch (err) {}
      return text || fallbackText(key, navigator.language);
    }

    function pageMode() {
      try {
        var nodes = [document.body, document.documentElement];
        for (var i = 0; i < nodes.length; i++) {
          if (!nodes[i]) continue;
          var m = getComputedStyle(nodes[i]).backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
          if (m && (m[4] === undefined || parseFloat(m[4]) > 0)) {
            return (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255 < 0.5 ? "dark" : "light";
          }
        }
      } catch (err) {}
      return undefined;
    }

    function ensure() {
      if (host) return true;
      if (!document.documentElement) return false;
      host = document.createElement("div");
      host.className = "iy-dmread-host";
      host.style.display = "none";
      root = host.attachShadow({ mode: "closed" });
      var style = document.createElement("style");
      style.textContent =
        ":host{all:initial;position:relative;display:inline-flex;vertical-align:middle;align-self:center;flex:0 1 auto;min-width:0;max-width:100%;margin-inline:6px;" +
        "--bg:var(--iy-surface,#171D19);--raised:var(--iy-surface-raised,#252E27);--text:var(--iy-text,#EAF0E8);" +
        "--muted:var(--iy-muted,#ACB9AE);--border:var(--iy-border,#39473D);--accent:var(--iy-accent,#9DCEAB);" +
        "--on:var(--iy-on-accent,#17251C)}" +
        "button{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 8px;max-width:100%;overflow:hidden;" +
        "border:1px solid var(--border);border-radius:15px;background:var(--bg);color:var(--text);cursor:pointer;" +
        "font:600 12px/1 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;white-space:nowrap;" +
        "transition:background-color .12s ease,border-color .12s ease}" +
        "button:hover{background:var(--raised)}" +
        "button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}" +
        "button[aria-disabled=true]{cursor:default;color:var(--muted)}" +
        "button span{overflow:hidden;text-overflow:ellipsis}svg{width:14px;height:14px;flex:none}" +
        ".toast{position:absolute;z-index:10;top:34px;left:0;width:max-content;max-width:min(240px,50vw);padding:8px 12px;border:1px solid var(--border);" +
        "border-radius:8px;background:var(--bg);color:var(--text);" +
        "font:500 12px/1.35 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;pointer-events:none}" +
        ".toast[hidden]{display:none}" +
        "@media (prefers-reduced-motion:reduce){button{transition:none}}";
      btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("aria-disabled", "false");
      btn.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.5 8.5l3 3 5-6"/><path d="M7.5 11.5l1 .5 6-7"/></svg>';
      label = document.createElement("span");
      btn.appendChild(label);
      toast = document.createElement("div");
      toast.className = "toast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      toast.hidden = true;
      root.append(style, btn, toast);
      btn.addEventListener("click", IY.core.bind(onClick));
      render();
      return true;
    }

    function render() {
      if (!host) return;
      var waiting = armedId !== null;
      label.textContent = waiting ? t("dmReadWaiting") : t("dmReadButton");
      btn.setAttribute("aria-disabled", waiting ? "true" : "false");
      btn.setAttribute("aria-label", waiting ? t("dmReadWaiting") : t("dmReadButton") + ". " + t("dmReadTip"));
      btn.title = t("dmReadTip");
      if (globalThis.IY && typeof globalThis.IY.themeVars === "function") {
        var vars = globalThis.IY.themeVars(theme, pageMode()).split(";");
        for (var i = 0; i < vars.length; i++) {
          var cut = vars[i].indexOf(":");
          if (cut > 2) host.style.setProperty(vars[i].slice(0, cut), vars[i].slice(cut + 1));
        }
      }
    }

    function say(key) {
      if (!ensure()) return;
      toast.textContent = t(key);
      toast.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toast.hidden = true; }, TOAST_MS);
    }

    function disarm(cancelPage) {
      if (armTimer) { clearTimeout(armTimer); armTimer = 0; }
      if (armedId !== null && cancelPage && globalThis.IY && typeof globalThis.IY.cancelDmRead === "function") {
        try { globalThis.IY.cancelDmRead(); } catch (err) {}
      }
      armedId = null;
      render();
    }

    function onClick(event) {
      if (!event.isTrusted) return;
      if (armedId !== null || !ghostOn || !threadId) return;
      var iy = globalThis.IY;
      var ok = false;
      if (iy && typeof iy.allowDmRead === "function") {
        try { ok = iy.allowDmRead(threadId, ALLOW_MS) === true; } catch (err) { ok = false; }
      }
      if (!ok) { say("dmReadFail"); return; }
      armedId = threadId;
      render();
      say("dmReadToast");
      armTimer = setTimeout(function () {
        armTimer = 0;
        armedId = null;
        render();
        say("dmReadExpired");
      }, ALLOW_MS);
    }

    function onUsed() {
      if (armedId === null) return;
      disarm(false);
      say("dmReadDone");
    }

    function hostVisible(show) {
      if (!ensure()) return;
      host.dataset.shown = show ? "1" : "0";
      host.style.display = show ? "inline-flex" : "none";
      if (!show) toast.hidden = true;
    }

    function locate() {
      if (!threadId || !ghostOn || !ensure()) return;
      var headers = Array.from(document.querySelectorAll('main header, [role="main"] header, main [role="banner"], [role="main"] [role="banner"]'));
      // Some thread headers use plain divs for the row. Find the common group
      // containing the call buttons and the recipient without climbing into the inbox.
      if (!headers.length) {
        var main = document.querySelector('main, [role="main"]');
        var call = main?.querySelector(CALL_CONTROL);
        var row = call?.parentElement;
        for (var depth = 0; row && row !== main && depth < 8; depth++, row = row.parentElement) {
          if (row.querySelector('h1, h2, h3, [role="heading"], a[href^="/"]:not([href^="/direct/"])')) {
            headers.push(row);
            break;
          }
        }
      }
      for (var header of headers) {
        var branch = nameBranch(header);
        if (!branch) continue;
        threadHeader = header;
        if (branch.nextElementSibling !== host) branch.after(host);
        hostVisible(true);
        return;
      }
      threadHeader = null;
      hostVisible(false);
    }

    function refresh() {
      var id = threadIdFromPath(location.pathname);
      if (id !== threadId) { threadHeader = null; disarm(true); }
      threadId = id;
      var show = !!id && ghostOn;
      if (!show && armedId !== null) disarm(true);
      if (!show && !host) return;
      if (show) { render(); locate(); } else hostVisible(false);
    }

    function applyCfg(cfg) {
      ghostOn = !cfg || typeof cfg.ghostDm !== "boolean" ? true : cfg.ghostDm;
      refresh();
    }

    function applyUi(ui) {
      theme = ui && typeof ui.theme === "string" ? ui.theme : "black";
      render();
    }

    const iy = globalThis.IY;
    iy.core.feature("dmread", {
      keys: ["cfg", "ui"],
      enabled: ({ cfg }) => !cfg || typeof cfg.ghostDm !== "boolean" || cfg.ghostDm,
      start({ cfg, ui }) {
        iy.core.route(refresh);
        iy.core.observe(function (node) {
          return threadId && (threadHeader?.contains(node) || node.closest('header, [role="banner"]') ||
            (!host?.isConnected && (node.matches(CALL_CONTROL) || node.querySelector('header, [role="banner"], ' + CALL_CONTROL))));
        }, locate);
        if (iy.onDmUsed) iy.core.cleanup(iy.onDmUsed(iy.core.bind(onUsed)));
        applyUi(ui);
        applyCfg(cfg);
      },
      update({ ui }) { applyUi(ui); },
      stop() {
        ghostOn = false;
        disarm(true);
        clearTimeout(toastTimer);
        if (host) host.remove();
        host = root = btn = label = toast = null;
        threadId = threadHeader = null;
      }
    });
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    globalThis.IY = Object.assign(globalThis.IY || {}, { dmRead: api });
    if (typeof document !== "undefined" && typeof location !== "undefined" &&
        location.protocol === "https:" && location.hostname === "www.instagram.com") {
      try { boot(); } catch (err) {}
    }
  }
})();
