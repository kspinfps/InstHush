(function () {
  "use strict";

  IY.core.feature("dock", { keys: [], enabled: () => true, start: mount });
  function mount() {
    var defaults = { video: true, ads: true, ghostStory: true, ghostDm: true };
    var uiDefaults = { theme: "black", commentCopy: true, followsBadge: true, autoAdvance: false, storyPause: false, noAutoplay: false, hoverZoom: false, exactDates: false, seenPosts: false, ghostTyping: false, followingFeed: false, cleanLinks: true, opBadge: true, keys: true, breakMins: 0, defaultSpeed: 1, mute: { words: [], accounts: [] }, focusOpts: normalizeFocusOptions(), storyNoAdvance: false, voiceDownload: false, storyDetails: true };
    var VALID_BREAKS = [0, 15, 30, 45, 60];
    var VALID_SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];
    var VALID_THEMES = ["green", "black", "white", "pink", "purple", "ocean"];
    var cfg = Object.assign({}, defaults);
    var ui = Object.assign({}, uiDefaults);
    var open = false, ready = false, busy = false;
    var cfgRevision = 0, uiRevision = 0, statsRevision = 0, baseline = null, lastStory = 0, sessionStory = 0;
    var pathname = "", pillTimer = 0, activeTipBtn = null, tipPinned = false;
    var host = document.createElement("div");
    host.className = "iy-dock-host";
    var root = host.attachShadow({ mode: "closed" });

    IY.core.cleanup(() => {
      host.remove();
      clearTimeout(pillTimer);
      if (avatarRaf) cancelAnimationFrame(avatarRaf);
      setProfileListeners(false);
    });
    function safe(fn) { return IY.core.guard("dock", fn); }
    function t(key, fallback, substitutions) {
      try { return chrome.i18n.getMessage(key, substitutions) || fallback; } catch (err) { return fallback; }
    }
    function isPlainObject(value) {
      return !!value && typeof value === "object" && !Array.isArray(value);
    }
    function normalize(value) {
      var result = Object.assign({}, defaults);
      Object.keys(defaults).forEach(function (key) {
        if (isPlainObject(value) && typeof value[key] === "boolean") result[key] = value[key];
      });
      return result;
    }
    function normalizeFocusOptions(ui) {
      var raw = ui && ui.focusOpts;
      var legacy = (!raw || typeof raw !== "object" || Array.isArray(raw)) && ui && ui.focus === true;
      var result = {};
      for (var key of ["counts", "suggested", "noReels", "reelsNav", "exploreNav", "threads", "metaAi"]) {
        result[key] = legacy ? key === "counts" || key === "suggested" : !!raw && raw[key] === true;
      }
      return result;
    }
    function normalizeUi(value) {
      var result = Object.assign({}, uiDefaults);
      result.focusOpts = normalizeFocusOptions(value);
      result.mute = globalThis.IY?.normalizeMute?.(value && value.mute) || { words: [], accounts: [] };
      if (isPlainObject(value)) {
        for (var key of ["commentCopy", "followsBadge", "autoAdvance", "cleanLinks", "opBadge", "storyDetails"]) {
          if (typeof value[key] === "boolean") result[key] = value[key];
        }
        for (var strict of ["storyPause", "noAutoplay", "hoverZoom", "exactDates", "seenPosts", "followingFeed", "ghostTyping", "storyNoAdvance", "voiceDownload"]) result[strict] = value[strict] === true;
        result.keys = value.keys !== false;
        if (VALID_BREAKS.indexOf(value.breakMins) !== -1) result.breakMins = value.breakMins;
        if (VALID_SPEEDS.indexOf(Number(value.defaultSpeed)) !== -1) result.defaultSpeed = Number(value.defaultSpeed);
        if (typeof value.theme === "string") {
          var resolved = globalThis.IY && typeof globalThis.IY.resolveThemeName === "function"
            ? globalThis.IY.resolveThemeName(value.theme) : value.theme;
          if (VALID_THEMES.indexOf(resolved) !== -1) result.theme = resolved;
        }
      }
      return result;
    }
    function el(tag, className, text) {
      var node = document.createElement(tag);
      node.className = className || "";
      if (text) node.textContent = text;
      return node;
    }
    function svgNode(tag, attrs) {
      var node = document.createElementNS("http://www.w3.org/2000/svg", tag);
      Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
      return node;
    }
    function logo() {
      var svg = svgNode("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" });
      svg.appendChild(svgNode("path", {
        fill: "currentColor", "fill-rule": "evenodd",
        d: "M12 2 21 6v6c0 5-5 8-9 10-4-2-9-5-9-10V6Zm-2 6v8l6-4Z"
      }));
      return svg;
    }
    function emblem(kind) {
      var svg = svgNode("svg", {
        class: "emblem", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor",
        "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round",
        "aria-hidden": "true", focusable: "false"
      });
      if (kind === "ghostMode") {
        var mPath = "M3.5 13.5V7a4.5 4.5 0 0 1 9 0v6.5l-2.25-1.25L8 13.5l-2.25-1.25Z";
        svg.append(svgNode("path", { class: "emblem-fill", fill: "currentColor", stroke: "none", d: mPath }), svgNode("path", { d: mPath }));
        var eyes0 = svgNode("g", { class: "ghost-eyes" });
        eyes0.append(svgNode("circle", { cx: "6.5", cy: "6.75", r: "0.85", fill: "currentColor", stroke: "none" }), svgNode("circle", { cx: "9.5", cy: "6.75", r: "0.85", fill: "currentColor", stroke: "none" }));
        svg.appendChild(eyes0);
      } else if (kind === "ghostStory") {
        var gPath = "M2.25 13.5V7.25a3.75 3.75 0 0 1 7.5 0v6.25l-1.88-1.1L6 13.5l-1.87-1.1Z";
        svg.append(svgNode("path", { class: "emblem-fill", fill: "currentColor", stroke: "none", d: gPath }), svgNode("path", { d: gPath }));
        var eyes1 = svgNode("g", { class: "ghost-eyes" });
        eyes1.append(svgNode("circle", { cx: "4.75", cy: "7", r: "0.75", fill: "currentColor", stroke: "none" }), svgNode("circle", { cx: "7.25", cy: "7", r: "0.75", fill: "currentColor", stroke: "none" }));
        svg.append(eyes1, svgNode("path", { d: "M11.5 2.25a2.5 2.5 0 1 1-1.77 4.27" }));
      } else if (kind === "ghostDm" || kind === "ghostTyping") {
        var dPath = "M2.25 13.5V7.5a3.5 3.5 0 0 1 7 0v6l-1.75-1L5.75 13.5 4 12.5Z";
        svg.append(svgNode("path", { class: "emblem-fill", fill: "currentColor", stroke: "none", d: dPath }), svgNode("path", { d: dPath }));
        var eyes2 = svgNode("g", { class: "ghost-eyes" });
        eyes2.append(svgNode("circle", { cx: "4.6", cy: "7.25", r: "0.7", fill: "currentColor", stroke: "none" }), svgNode("circle", { cx: "6.9", cy: "7.25", r: "0.7", fill: "currentColor", stroke: "none" }));
        svg.append(eyes2, svgNode("path", { d: "M9.5 2.25h3.25c.55 0 1 .45 1 1v2c0 .55-.45 1-1 1H11.2L9.75 7.5V6.25H9.5c-.55 0-1-.45-1-1v-2c0-.55.45-1 1-1Z" }));
      } else if (kind === "video") {
        svg.append(
          svgNode("path", { class: "emblem-fill", fill: "currentColor", stroke: "none", d: "M4.25 2.75 10.25 6.25 4.25 9.75Z" }),
          svgNode("path", { d: "M4.25 2.75 10.25 6.25 4.25 9.75Z" }),
          svgNode("path", { d: "M2.25 13h11.5M10.25 11.5v3" })
        );
      } else if (kind === "ads") {
        var sPath = "M8 1.75 13.25 4v4c0 3.25-2.75 5.25-5.25 6.25C5.5 13.25 2.75 11.25 2.75 8V4Z";
        svg.append(svgNode("path", { class: "emblem-fill", fill: "currentColor", stroke: "none", d: sPath }), svgNode("path", { d: sPath }), svgNode("path", { d: "M5.5 5.5 10.5 10.5" }));
      } else if (kind === "commentCopy") {
        svg.append(
          svgNode("rect", { class: "emblem-fill", x: "2.75", y: "5.25", width: "7.75", height: "8.5", rx: "1.25", fill: "currentColor", stroke: "none" }),
          svgNode("rect", { x: "2.75", y: "5.25", width: "7.75", height: "8.5", rx: "1.25" }),
          svgNode("path", { d: "M5.5 5.25V3.5c0-.69.56-1.25 1.25-1.25h5.25c.69 0 1.25.56 1.25 1.25v6.25c0 .69-.56 1.25-1.25 1.25H10.5" })
        );
      } else if (kind === "autoAdvance") {
        svg.append(svgNode("path", { d: "m3 3 6 5-6 5ZM12 3v10" }));
      } else if (kind === "storyPause") {
        svg.append(svgNode("path", { d: "M5.5 3v10M10.5 3v10" }));
      } else if (kind === "noAutoplay") {
        svg.append(svgNode("path", { d: "M5 3.5v9l7-4.5z" }));
      } else if (kind === "hoverZoom") {
        svg.append(svgNode("circle", { cx: "7", cy: "7", r: "4.25" }), svgNode("path", { d: "M10.25 10.25L13.5 13.5" }));
      } else if (kind === "cleanLinks") {
        svg.append(svgNode("path", { d: "M8 5l1.5-1.5a2.12 2.12 0 1 1 3 3l-2 2a2.12 2.12 0 0 1-3 0" }), svgNode("path", { d: "M8 11l-1.5 1.5a2.12 2.12 0 1 1-3-3l2-2a2.12 2.12 0 0 1 3 0" }));
      } else if (kind === "exactDates") {
        svg.append(svgNode("rect", { x: "2.25", y: "3.25", width: "11.5", height: "10.5", rx: "1.75" }), svgNode("path", { d: "M2.25 6.75h11.5M5.25 1.75v3M10.75 1.75v3M5 9.5h1.5M7.25 9.5h1.5M9.5 9.5h1.5M5 11.75h1.5" }));
      } else if (kind === "seenPosts") {
        svg.append(svgNode("path", { d: "M1.5 8s2.25-4.25 6.5-4.25S14.5 8 14.5 8s-2.25 4.25-6.5 4.25S1.5 8 1.5 8Z" }), svgNode("circle", { cx: "8", cy: "8", r: "1.75" }));
      } else if (kind === "favorites" || kind === "favStar") {
        var starPath = "M8 2.15 9.53 6.3 13.94 6.47 10.47 9.2 11.67 13.46 8 11 4.33 13.46 5.53 9.2 2.06 6.47 6.47 6.3Z";
        svg.append(svgNode("path", { class: "emblem-fill", fill: "currentColor", stroke: "none", d: starPath }), svgNode("path", { d: starPath }));
      } else if (kind === "opBadge") {
        svg.append(svgNode("path", { d: "M3 2.75h10c.55 0 1 .45 1 1v6.5c0 .55-.45 1-1 1H8.25L5.25 13.5v-2.25H3c-.55 0-1-.45-1-1v-6.5c0-.55.45-1 1-1Z" }), svgNode("path", { d: "M5.75 7 7.25 8.5 10.25 5.5" }));
      } else if (kind === "groupPlayback") {
        svg.append(svgNode("circle", { cx: "8", cy: "8", r: "6" }), svgNode("path", { d: "M6.75 5.75 10.25 8l-3.5 2.25Z" }));
      } else if (kind === "groupFeed") {
        svg.append(svgNode("rect", { x: "2.25", y: "2.25", width: "11.5", height: "11.5", rx: "1.75" }), svgNode("path", { d: "M5 5.75h6M5 8h6M5 10.25h3.5" }));
      } else if (kind === "groupTime") {
        svg.append(svgNode("path", { d: "M4.5 2.25h7M4.5 13.75h7M5.25 2.25c0 2.75 5.5 3 5.5 5.75s-5.5 3-5.5 5.75M10.75 2.25c0 2.75-5.5 3-5.5 5.75s5.5 3 5.5 5.75" }));
      } else if (kind === "usage") {
        svg.append(svgNode("circle", { cx: "8", cy: "8", r: "6" }), svgNode("path", { d: "M8 4v4l3 2" }));
      } else if (kind === "defaultSpeed") {
        svg.append(svgNode("path", { d: "M2.5 11.5a5.5 5.5 0 1 1 11 0" }), svgNode("path", { d: "M8 11.5 10.75 7.25" }));
      } else if (kind === "focus") {
        svg.append(svgNode("circle", { cx: "8", cy: "8", r: "3" }), svgNode("path", { d: "M1 5V1h4m6 0h4v4m0 6v4h-4m-6 0H1v-4" }));
      } else if (kind === "keys") {
        svg.append(svgNode("rect", { x:"1.75", y:"3.75", width:"12.5", height:"8.5", rx:"1.75" }), svgNode("path", { d:"M4.5 6.75h1M7.5 6.75h1M10.5 6.75h1M5 9.75h6" }));
      } else if (kind === "more") {
        svg.append(svgNode("circle", { cx:"3.5", cy:"8", r:"1" }), svgNode("circle", { cx:"8", cy:"8", r:"1" }), svgNode("circle", { cx:"12.5", cy:"8", r:"1" }));
      } else if (kind === "breakMins") {
        svg.append(svgNode("path", { d:"M3 5h8v5a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3ZM11 6h1a2 2 0 0 1 0 4h-1M5 1.5v1M8 1.5v1" }));
      } else if (kind === "theme") {
        svg.append(svgNode("circle", { cx: "8", cy: "8", r: "5.75" }), svgNode("path", { d: "M8 2.25a5.75 5.75 0 0 1 0 11.5Z", fill: "currentColor", stroke: "none" }));
      } else if (kind === "avatar") {
        svg.append(
          svgNode("circle", { class: "emblem-fill", cx: "8", cy: "5.5", r: "2.5", fill: "currentColor", stroke: "none" }),
          svgNode("circle", { cx: "8", cy: "5.5", r: "2.5" }),
          svgNode("path", { d: "M3 13.25c.9-2.1 2.75-3.25 5-3.25s4.1 1.15 5 3.25" })
        );
      } else if (kind === "download") {
        svg.setAttribute("class", "action-icon");
        svg.append(svgNode("path", { d: "M8 2.75v7.5M5.25 7.75 8 10.5l2.75-2.75M3.25 13.25h9.5" }));
      } else if (kind === "downloadHeading") {
        svg.append(svgNode("path", { d: "M8 2.75v7.5M5.25 7.75 8 10.5l2.75-2.75M3.25 13.25h9.5" }));
      } else if (kind === "downloadAll") {
        svg.append(svgNode("path", { d: "M8 1.75v6.5M5.5 5.75 8 8.25l2.5-2.5M3.25 10.75h9.5M4.75 13.75h6.5" }));
      } else if (kind === "markRead") {
        svg.append(svgNode("path", { d: "M1.5 8.5l3 3 5-6" }), svgNode("path", { d: "M7.5 11.5l1 .5 6-7" }));
      } else if (kind === "arrow") {
        svg.append(svgNode("path", { d: "M3 8h10M9 4l4 4-4 4" }));
      } else if (kind === "followingFeed") {
        svg.append(svgNode("circle", { cx: "6", cy: "5.5", r: "2.25" }), svgNode("path", { d: "M2 13c.45-2 1.9-3.25 4-3.25S9.55 11 10 13" }),
          svgNode("path", { d: "M10.5 3.5a2.1 2.1 0 0 1 0 4.1M12 9.9c1.1.45 1.8 1.5 2 3.1" }));
      } else if (kind === "followsBadge") {
        svg.append(svgNode("circle", { class: "emblem-fill", cx: "6.5", cy: "5.25", r: "2.5", fill: "currentColor", stroke: "none" }),
          svgNode("circle", { cx: "6.5", cy: "5.25", r: "2.5" }), svgNode("path", { d: "M2 13.25c.45-2.1 2.15-3.5 4.5-3.5 1 0 1.85.25 2.55.7" }),
          svgNode("path", { d: "m10 12 1.5 1.5 3-3" }));
      } else if (kind === "info") {
        svg.setAttribute("class", "info-glyph");
        svg.append(svgNode("circle", { cx: "8", cy: "8", r: "6" }), svgNode("path", { d: "M8 7.25v3.5" }), svgNode("circle", { cx: "8", cy: "4.75", r: "0.75", fill: "currentColor", stroke: "none" }));
      }
      return svg;
    }

    var style = el("style");
    style.textContent = `
      :host { all: initial; --bg:var(--iy-surface,#171D19); --surface:var(--iy-surface-raised,#252E27); --text:var(--iy-text,#EAF0E8); --muted:var(--iy-muted,#ACB9AE);
        --border:var(--iy-border,#39473D); --accent:var(--iy-accent,#9DCEAB); --hover:var(--iy-hover,#252E27); --track:var(--iy-track,#748279); --thumb:var(--iy-thumb,#17251C);
        --ghost:var(--iy-ghost,#203F31); --ghost-text:var(--iy-ghost-text,#F0F6ED); --ghost-muted:var(--iy-ghost-muted,#BED2C4); --ghost-highlight:var(--iy-ghost-highlight,#C9E6AB);
        --ghost-ink:var(--iy-ghost-ink,#183E30); --video-glass:var(--iy-glass,#171D19EB); --video-hairline:var(--iy-hairline,#FFFFFF1F);
        --radius-sm:6px; --radius-md:10px; --radius-lg:18px; --ease-out:cubic-bezier(.2,0,0,1);
        position:fixed; z-index:2147483001; inset:auto; pointer-events:none;
        color:var(--text); font:12px/18px ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
        -webkit-font-smoothing:antialiased; color-scheme:dark; }
      * { box-sizing:border-box; }
      .anchor { position:fixed; left:92px; bottom:20px; width:40px; height:40px; }
      button { font:inherit; color:inherit; appearance:none; border:0; cursor:pointer; }
      button:focus-visible, .info-btn:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
      button:disabled { cursor:wait; opacity:.6; }
      .trigger { position:relative; display:grid; place-items:center; width:40px; height:40px;
        padding:8px; border-radius:14px; background:var(--video-glass); border:1px solid var(--video-hairline);
        box-shadow:0 2px 4px #00000026,0 8px 24px #00000033; pointer-events:auto;
        transition:background-color 200ms var(--ease-out),color 200ms var(--ease-out); }
      svg { display:block; width:24px; height:24px; flex:none; }
      .trigger[data-cloaked=true] { color:var(--ghost-highlight); border-color:var(--ghost-highlight); background:var(--ghost); }
      .dots { position:absolute; display:flex; gap:3px; bottom:3px; }
      .dot { width:3px; height:3px; border-radius:50%; background:currentColor; opacity:0; }
      .dot.active { opacity:1; }
      .panel { position:absolute; bottom:50px; left:0; width:260px; max-width:calc(100vw - 40px);
        max-height:calc(100dvh - 100px); overflow:auto; overscroll-behavior:contain;
        padding:8px; border-radius:var(--radius-lg); border:1px solid var(--video-hairline);
        background:var(--video-glass); box-shadow:0 2px 4px #00000026,0 8px 24px #00000033;
        opacity:0; transform:scale(.96); transform-origin:20px calc(100% + 30px); pointer-events:none;
        visibility:hidden; transition:opacity 180ms var(--ease-out),transform 180ms var(--ease-out),background-color 200ms var(--ease-out),color 200ms var(--ease-out),visibility 0s 180ms;
        scrollbar-color:var(--track) var(--bg); scrollbar-width:thin; }
      .panel.open { opacity:1; transform:scale(1); visibility:visible; pointer-events:auto; transition-delay:0s; }
      .pill { position:fixed; left:50%; top:max(20px,env(safe-area-inset-top)); transform:translate(-50%,-4px);
        display:flex; align-items:center; gap:8px; max-width:calc(100vw - 40px); padding:9px 12px;
        border:1px solid var(--video-hairline); border-radius:14px; background:var(--video-glass);
        box-shadow:0 2px 4px #00000026,0 8px 24px #00000033; color:var(--ghost-highlight);
        opacity:0; visibility:hidden; transition:opacity 150ms var(--ease-out),transform 150ms var(--ease-out),visibility 0s 150ms; }
      .pill svg { width:16px; height:16px; }
      .pill.show { opacity:1; visibility:visible; transform:translate(-50%,0); transition-delay:0s; }
      [hidden] { display:none !important; }
      .avatar-btn { position:fixed; left:0; top:0; width:32px; height:32px; padding:0;
        display:grid; place-items:center; border-radius:10px;
        background:var(--video-glass); border:1px solid var(--video-hairline);
        color:var(--text); box-shadow:0 2px 4px #00000026,0 8px 24px #00000033;
        backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px);
        opacity:0; visibility:hidden; pointer-events:none;
        transition:opacity 140ms var(--ease-out),background-color 140ms var(--ease-out),color 140ms var(--ease-out); }
      .avatar-btn.show { opacity:1; visibility:visible; pointer-events:auto; }
      .avatar-btn:hover { background:var(--surface); color:var(--accent); }
      .avatar-btn svg { width:18px; height:18px; pointer-events:none; }
      ::selection { background:var(--ghost-highlight); color:var(--ghost-ink); }
      @media(min-width:1264px) { .anchor { left:264px; } }
      @media(min-width:1920px) { .anchor { left:calc(12.5vw + 20px); } }
      @media(max-width:767px) { .anchor { left:auto; right:20px; bottom:calc(76px + env(safe-area-inset-bottom)); }
        .panel { left:auto; right:0; transform-origin:calc(100% - 20px) calc(100% + 30px); max-height:calc(100dvh - 156px); } }
      @media(prefers-reduced-motion:reduce) { .panel,.pill,.trigger,.avatar-btn { transition:none; } .panel { transform:none; } }
      @media(forced-colors:active) { .trigger,.panel,.pill,.avatar-btn { border:1px solid ButtonText; } }
    `;
    root.appendChild(style);

    var anchor = el("div", "anchor");
    var trigger = el("button", "trigger");
    trigger.type = "button";
    trigger.setAttribute("aria-label", t("dockTitle", "InstHush · gizlilik kontrolleri"));
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-controls", "iy-dock-panel");
    trigger.setAttribute("aria-keyshortcuts", "Alt+G");
    trigger.appendChild(logo());
    var dots = el("span", "dots");
    dots.setAttribute("aria-hidden", "true");
    var storyDot = el("span", "dot"), dmDot = el("span", "dot");
    dots.append(storyDot, dmDot); trigger.appendChild(dots);

    var panel = el("section", "panel");
    panel.id = "iy-dock-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", t("dockTitle", "InstHush · gizlilik kontrolleri"));
    panel.setAttribute("aria-hidden", "true");
    panel.inert = true;

    var heading = el("h2", "heading");
    heading.append(emblem("ghostMode"), el("span", "", t("popupGhostMode", "Gizli mod")));
    panel.appendChild(heading);

    var tooltip = el("div", "tooltip");
    tooltip.id = "iy-dock-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.setAttribute("aria-hidden", "true");

    function positionTooltip(btn) {
      var pRect = panel.getBoundingClientRect();
      var bRect = btn.getBoundingClientRect();
      var tRect = tooltip.getBoundingClientRect();
      if (!pRect.width || !tRect.width) return;
      var left = Math.max(8, Math.min(bRect.left - pRect.left + bRect.width / 2 - tRect.width / 2, pRect.width - tRect.width - 8));
      var top = bRect.top - pRect.top - tRect.height - 6 + panel.scrollTop;
      if (bRect.top - pRect.top - tRect.height - 6 < 8) top = bRect.bottom - pRect.top + 6 + panel.scrollTop;
      tooltip.style.left = Math.round(left) + "px";
      tooltip.style.top = Math.round(top) + "px";
    }
    function showTip(btn, text, pin) {
      if (activeTipBtn && activeTipBtn !== btn) activeTipBtn.removeAttribute("aria-describedby");
      activeTipBtn = btn;
      if (pin) tipPinned = true;
      tooltip.textContent = text;
      btn.setAttribute("aria-describedby", "iy-dock-tooltip");
      tooltip.setAttribute("aria-hidden", "false");
      tooltip.classList.add("show");
      positionTooltip(btn);
    }
    function hideTip(force) {
      if (tipPinned && !force) return;
      tipPinned = false;
      if (activeTipBtn) { activeTipBtn.removeAttribute("aria-describedby"); activeTipBtn = null; }
      tooltip.classList.remove("show");
      tooltip.setAttribute("aria-hidden", "true");
    }
    function makeInfoButton(label, tipKey, tipFallback) {
      var info = el("span", "info-btn");
      info.setAttribute("role", "button");
      info.setAttribute("tabindex", "0");
      info.setAttribute("aria-label", label + " — " + t("infoMore", "Bilgi"));
      info.appendChild(emblem("info"));
      var getTip = function () { return t(tipKey, tipFallback); };
      info.addEventListener("mouseenter", safe(function () { showTip(info, getTip(), false); }));
      info.addEventListener("mouseleave", safe(function () { hideTip(false); }));
      info.addEventListener("focus", safe(function () { showTip(info, getTip(), false); }));
      info.addEventListener("blur", safe(function () { hideTip(true); }));
      info.addEventListener("click", safe(function (event) {
        event.stopPropagation(); event.preventDefault();
        if (activeTipBtn === info && tipPinned) hideTip(true); else showTip(info, getTip(), true);
      }));
      info.addEventListener("keydown", safe(function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.stopPropagation(); event.preventDefault();
          if (activeTipBtn === info && tipPinned) hideTip(true); else showTip(info, getTip(), true);
        } else if (event.key === "Escape" && activeTipBtn === info) {
          event.stopPropagation(); hideTip(true);
        }
      }));
      return info;
    }
    function markJustTurnedOn(button) {
      button.dataset.justOn = "true";
      setTimeout(safe(function () { delete button.dataset.justOn; }), 240);
    }

    var ghosts = el("div", "ghosts"), switches = {}, uiSwitches = {}, switchRows = [];
    // Rows below the hero follow the page under the pointer.
    // Long or nested labels wrap (v17-row); the v1.8 one-line rows keep their anatomy.
    var WRAPPING = ["followingFeed", "followsBadge"];
    function addSwitch(parent, key, label, tipKey, tipFallback, isUi, icon) {
      var modern = WRAPPING.indexOf(key) !== -1;
      var button = el("button", modern ? "row v17-row" : "row"); button.type = "button";
      button.setAttribute("role", "switch");
      var lead = el("span", "row-lead");
      var labelNode = el("span", "row-label", label), info = makeInfoButton(label, tipKey, tipFallback);
      if (modern) {
        labelNode.appendChild(info);
        lead.append(emblem(icon || key), labelNode);
      } else {
        lead.append(emblem(icon || key), labelNode, info);
      }
      button.appendChild(lead);
      var track = el("span", "track"); track.setAttribute("aria-hidden", "true"); button.appendChild(track);
      button.addEventListener("click", safe(function (event) {
        if (!event.isTrusted) return;
        if (event.target instanceof Element && event.target.closest(".info-btn")) return;
        if (isUi) {
          if (!ui[key]) markJustTurnedOn(button);
          saveUi({ [key]: !ui[key] });
        } else {
          if (!cfg[key]) markJustTurnedOn(button);
          save(function (current) { var patch = {}; patch[key] = !current[key]; return patch; });
        }
      }));
      // The same preference can show in two contexts (video on Home and on Reels); all copies render.
      switchRows.push({ key: key, isUi: !!isUi, button: button });
      if (isUi) { if (!uiSwitches[key]) uiSwitches[key] = button; } else if (!switches[key]) switches[key] = button;
      parent.appendChild(button);
      return button;
    }
    // One-tap action row: emblem, label, (i), trailing download/arrow glyph.
    function addAction(parent, className, icon, label, tipKey, tipFallback, trailing) {
      var row = el("button", "row v17-row action-row " + className); row.type = "button";
      var lead = el("span", "row-lead");
      var labelNode = el("span", "row-label", label);
      if (tipKey) labelNode.appendChild(makeInfoButton(label, tipKey, tipFallback));
      lead.append(emblem(icon), labelNode);
      row.appendChild(lead);
      if (trailing) row.appendChild(emblem(trailing));
      parent.appendChild(row);
      return row;
    }
    function addDisclosure(parent, id, label, kind) {
      var toggle = el("button", "row v17-row disclosure group-toggle"); toggle.type = "button";
      toggle.id = "iy-group-" + id;
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-controls", "iy-group-" + id + "-options");
      var lead = el("span", "row-lead");
      lead.append(emblem(kind), el("span", "row-label", label));
      var end = el("span", "group-end");
      var countNode = el("span", "mute-count", "0");
      var chevron = svgNode("svg", { class: "emblem", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.5", "aria-hidden": "true" });
      chevron.appendChild(svgNode("path", { d: "m8 10 4 4 4-4" }));
      end.append(countNode, chevron);
      toggle.append(lead, end);
      var body = el("div", "group-body"); body.id = "iy-group-" + id + "-options"; body.hidden = true;
      body.setAttribute("role", "group"); body.setAttribute("aria-labelledby", toggle.id);
      function setExpanded(expanded) {
        toggle.setAttribute("aria-expanded", String(expanded)); body.hidden = !expanded;
        chevron.style.transform = expanded ? "rotate(180deg)" : "";
      }
      toggle.addEventListener("click", safe(function (event) {
        if (!event.isTrusted) return;
        setExpanded(toggle.getAttribute("aria-expanded") !== "true");
      }));
      parent.append(toggle, body);
      return { toggle: toggle, body: body, count: countNode, collapse: function () { setExpanded(false); } };
    }

    var favApi = globalThis.IY.favorites && typeof globalThis.IY.favorites.normalize === "function" ? globalThis.IY.favorites : null;
    var favorites = favApi ? favApi.normalize(null) : null, favBusy = false, favRevision = 0, favSignature = null;
    var swatchButtons = {};
    var master, muteEditor, favList, favEmpty, favGroup, avatarRow, profileActions, favStar, status;
    var context, contextHeading, contextLabel, contextIcon, sections = {}, downloadItemRow, downloadAllRow, markReadRow, allSettings;
    var viewFullRow, voiceRow, storyDetailsRow, storyAllRow, reelsReadout, exploreReadout;
    var contextName = "";
    var panelBuilt = false;
    // Route -> heading (label key, fallback, emblem). Rows live in one section per route.
    var CONTEXTS = {
      feed: ["dockCtxFeed", "Akış", "groupFeed"],
      profile: ["dockCtxProfile", "Profil", "avatar"],
      post: ["dockCtxPost", "Gönderi", "download"],
      dm: ["dockCtxDm", "Mesajlar", "ghostDm"],
      reels: ["dockCtxReels", "Reels", "video"],
      story: ["dockCtxStory", "Hikâye", "storyPause"],
      explore: ["dockCtxExplore", "Keşfet", "usage"]
    };
    function buildPanel() {
      if (panelBuilt) return;
      var panelStyle = el("style");
      panelStyle.textContent = `
/* Inline mute controls reuse the panel's surface, border, radius and focus tokens. */
.mute-toggle { width:100%; display:flex; justify-content:space-between; align-items:center; }
.mute-count { color:var(--muted); font-size:11px; font-variant-numeric:tabular-nums; }
.mute-editor { padding:4px 8px 8px 30px; }
.mute-end { display:inline-flex; align-items:center; gap:6px; flex:none; margin-inline-end:7px; }
.mute-chevron { transition:transform 220ms var(--ease-out); }
.mute-toggle[aria-expanded=true] .mute-chevron { transform:rotate(180deg); }
.mute-editor[hidden] { display:none; }
.mute-group { min-width:0; margin:0 0 8px; padding:0; border:0; }
.mute-group legend { margin-bottom:4px; }
.mute-form { display:flex; gap:4px; margin:0 0 4px; }
.mute-form input { min-width:0; width:100%; height:26px; padding:0 8px; border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--surface); color:var(--text); font:inherit; font-size:11px; }
.mute-add,.mute-chip { border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--surface); color:var(--text); font:inherit; font-size:11px; }
.mute-add { padding:0 8px; }
.mute-chips { display:flex; flex-wrap:wrap; gap:4px; }
.mute-chip { display:inline-flex; align-items:center; max-width:100%; padding:1px 4px 1px 6px; gap:4px; overflow-wrap:anywhere; }
.mute-remove { padding:0 3px; background:transparent; color:var(--muted); }
.mute-form input:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.mute-add:hover,.mute-remove:hover { background:var(--hover); }
      .heading { display:flex; align-items:center; gap:6px; margin:4px 8px 10px; font-size:14px; line-height:20px; font-weight:650; }
      .heading .emblem { width:16px; height:16px; color:var(--accent); }
      .heading .emblem-fill { opacity:.22; }
      .ghosts { border-radius:var(--radius-md); padding:4px; background:var(--ghost); color:var(--ghost-text); }
      .row { width:100%; min-height:40px; display:flex; gap:8px; align-items:center; justify-content:space-between;
        text-align:start; padding:8px; border-radius:6px; background:transparent; }
      .ghosts .row { min-height:48px; font-size:14px; font-weight:600; }
      .row:hover { background:var(--hover); }
      .ghosts .row:hover { background:#C9E6AB0F; }
      .ghosts button:focus-visible, .ghosts .info-btn:focus-visible { outline-color:var(--ghost-highlight); outline-offset:-2px; }
      .row-lead { display:inline-flex; align-items:center; gap:6px; min-width:0; flex:1; }
      .row-label { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .v17-row .row-label { white-space:normal; overflow:visible; text-overflow:clip; overflow-wrap:anywhere; line-height:16px; }
      .v17-row .row-lead { gap:6px; }
      /* The (i) button rides inline after the last word, so a wrapped label never strands it by the switch. */
      .v17-row .row-label > .info-btn { vertical-align:middle; margin:-4px 0 -4px 6px; }
      .group-body { margin-inline-start:8px; }
      .group-end { display:inline-flex; align-items:center; gap:6px; flex:none; margin-inline-end:7px; }
      .group-end .emblem { transition:transform 220ms var(--ease-out); }
      .emblem { width:16px; height:16px; flex:none; color:var(--muted); transition:transform 220ms var(--ease-out),opacity 220ms var(--ease-out); }
      .ghosts .emblem { color:var(--ghost-muted); }
      .emblem-fill { opacity:0; transition:opacity 220ms var(--ease-out); }
      [aria-checked=true] .emblem { color:var(--accent); }
      .ghosts [aria-checked=true] .emblem { color:var(--ghost-highlight); }
      [aria-checked=true] .emblem-fill { opacity:.22; }
      .ghost-eyes { transform-box:fill-box; transform-origin:center; }
      [data-just-on=true] .ghost-eyes { animation:iy-blink 220ms var(--ease-out) 1; }
      [data-just-on=true] .emblem { animation:iy-emblem-on 220ms var(--ease-out) 1; }
      @keyframes iy-blink { 0%,100% { transform:scaleY(1); } 45% { transform:scaleY(.1); } }
      @keyframes iy-emblem-on { 0% { transform:scale(.88); opacity:.65; } 55% { transform:scale(1.08); opacity:1; } 100% { transform:scale(1); opacity:1; } }
      .info-btn { display:inline-grid; place-items:center; width:24px; height:24px; min-width:24px; min-height:24px;
        margin:-4px 0; border-radius:50%; color:var(--muted); cursor:pointer; flex:none; }
      .ghosts .info-btn { color:var(--ghost-muted); }
      .info-btn:hover { color:var(--text); background:#FFFFFF14; }
      .ghosts .info-btn:hover { color:var(--ghost-text); background:#FFFFFF14; }
      .info-glyph { width:16px; height:16px; }
      .track { flex:none; width:30px; height:18px; padding:3px; border-radius:9px; background:var(--track); }
      .track::after { content:""; display:block; width:12px; height:12px; border-radius:50%; background:var(--thumb);
        transition:transform 220ms var(--ease-out); }
      [aria-checked=true] .track { background:var(--accent); }
      .ghosts [aria-checked=true] .track { background:var(--ghost-highlight); }
      .ghosts .track::after { background:var(--ghost-ink); }
      [aria-checked=true] .track::after { transform:translateX(12px); }
      .master { width:100%; min-height:40px; padding:8px; border-radius:6px; background:transparent;
        color:var(--ghost-highlight); text-align:start; font-weight:600; }
      .master:hover { background:#C9E6AB0F; }
      .context { margin-top:8px; }
      .context-heading { display:flex; align-items:center; gap:6px; min-height:24px; margin:0 8px 2px; color:var(--muted);
        font-size:11px; line-height:16px; font-weight:650; }
      .context-heading .emblem { color:var(--muted); }
      .context-heading:focus-visible { outline:2px solid var(--accent); outline-offset:2px; border-radius:4px; }
      .action-row .emblem, .avatar-row .emblem { color:var(--accent); }
      .action-row > .emblem:last-child { color:var(--muted); }
      .context-subheading { margin:6px 8px 0; color:var(--muted); font-size:11px; line-height:16px; font-weight:650; }
      .context-readout { margin:2px 8px 4px; color:var(--text); font-size:12px; line-height:18px; font-variant-numeric:tabular-nums; }
      .theme-row { cursor:default; flex-wrap:wrap; row-gap:6px; margin-top:8px; }
      .theme-row:hover { background:transparent; }
      .theme-row .emblem { color:var(--accent); }
      .swatches { display:inline-flex; align-items:center; gap:6px; flex:none; }
      .theme-row .swatches { flex-basis:100%; padding-inline-start:22px; }
      .swatch { width:24px; height:24px; padding:0; border-radius:50%; border:1.5px solid var(--border);
        background:var(--swatch-color,#246346); position:relative; transition:transform 120ms var(--ease-out); }
      .swatch:hover:not(:disabled) { transform:scale(1.06); }
      .swatch[aria-checked=true] { border-color:var(--text); box-shadow:0 0 0 2px var(--bg),0 0 0 3.5px var(--accent); }
      .all-settings { display:flex; align-items:center; justify-content:space-between; gap:8px; width:100%; min-height:40px;
        margin-top:8px; padding:8px 12px; border-radius:var(--radius-md); background:transparent; color:var(--accent);
        font-weight:600; text-align:start; }
      .all-settings:hover { background:var(--hover); }
      .all-settings .emblem { color:currentColor; }
      .tooltip { position:absolute; left:8px; top:8px; width:max-content; max-width:calc(100% - 16px);
        padding:6px 8px; border-radius:var(--radius-sm); background:var(--surface); color:var(--text);
        border:1px solid var(--border); box-shadow:0 2px 4px #00000026,0 8px 24px #00000033;
        font-size:11px; line-height:15px; font-weight:400; pointer-events:none; z-index:5;
        opacity:0; transform:translateY(4px); visibility:hidden;
        transition:opacity 150ms var(--ease-out),transform 150ms var(--ease-out),visibility 0s 150ms; }
      .tooltip.show { opacity:1; transform:translateY(0); visibility:visible; transition-delay:0s; }
      .status { margin:10px 0 6px; color:var(--muted); font-size:10px; line-height:16px;
        text-align:center; font-variant-numeric:tabular-nums; }
      .signature { display:flex; align-items:center; justify-content:center; gap:6px; margin:8px auto 2px; padding:0; background:transparent; color:var(--muted); font-size:10px; }
      .signature img { width:20px; height:20px; border-radius:50%; }
      .signature:hover { color:var(--accent); }
      .footer { margin:0 0 2px; color:var(--muted); font-size:10px; text-align:center; }
      .action-icon { width:16px; height:16px; color:var(--accent); flex:none; }
      .profile-actions { display:flex; align-items:center; gap:4px; }
      .profile-actions > .avatar-row { flex:1; min-width:0; }
      .profile-actions > .fav-star { width:40px; flex:none; justify-content:center; }
      .fav-star[aria-pressed=true] .emblem { color:var(--accent); }
      .fav-star[aria-pressed=true] .emblem-fill { opacity:1; }
      .fav-row { display:flex; align-items:center; gap:4px; border-radius:6px; }
      .fav-row:hover { background:var(--hover); }
      .fav-link { display:flex; align-items:center; gap:6px; flex:1; min-width:0; min-height:40px; padding:8px; border-radius:6px; color:inherit; text-decoration:none; }
      .fav-link .row-label { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .fav-link:focus-visible { outline:2px solid var(--accent); outline-offset:-2px; }
      .fav-remove { flex:none; display:grid; place-items:center; width:28px; height:28px; margin-inline-end:4px; border-radius:6px; background:transparent; color:var(--muted); font-size:14px; line-height:1; }
      .fav-remove:hover:not(:disabled) { background:var(--surface); color:var(--text); }
      .fav-note { margin:2px 8px 6px 30px; color:var(--muted); font-size:11px; line-height:15px; }
      @media(max-width:767px) { .row,.master,.all-settings { min-height:44px; } }
      @media(prefers-reduced-motion:reduce) { .track::after,.emblem,.emblem-fill,.tooltip,.swatch { transition:none; }
        [data-just-on=true] .ghost-eyes,[data-just-on=true] .emblem { animation:none; }
        .tooltip { transform:none; } }
      @media(forced-colors:active) { .track,.tooltip,.swatch { border:1px solid ButtonText; }
        .track::after { background:ButtonText; } [aria-checked=true] .track { background:Highlight; } }
    `;
      root.appendChild(panelStyle);
      // Hero: the same three ghost switches and master on every route.
      addSwitch(ghosts, "ghostStory", t("popupGhostStory", "Hikâye ghost"), "tipGhostStory", "Hikâyeleri izlediğinde karşı taraf 'gördü' bilgisini almaz. Yalnızca bu tarayıcıda çalışır.", false);
      addSwitch(ghosts, "ghostDm", t("popupGhostDm", "DM ghost"), "tipGhostDm", "Mesajları okuduğunda 'görüldü' gönderilmez. Yazmaya başlarsan Instagram bunu yine gösterebilir.", false);
      addSwitch(ghosts, "ghostTyping", t("popupGhostTyping", "Yazıyor… gizle"), "tipGhostTyping", "DM'de yazarken karşı taraf 'yazıyor' göstergesini görmez.", true);
      master = el("button", "master"); master.type = "button";
      master.setAttribute("aria-describedby", "iy-dock-master-desc");
      var masterDesc = el("span", "sr-only", t("setGhostModeDesc", "Hikâye görüldüsünü, DM okundusunu ve yazıyor göstergesini birlikte aç veya kapat."));
      masterDesc.id = "iy-dock-master-desc"; masterDesc.hidden = true;
      ghosts.append(master, masterDesc);

      // Context: the page under the dock, up to three rows.
      context = el("section", "context");
      contextHeading = el("h3", "context-heading");
      contextHeading.id = "iy-dock-context-heading";
      contextHeading.tabIndex = -1;
      contextIcon = el("span", "context-icon");
      contextLabel = el("span", "", "");
      contextHeading.append(contextIcon, contextLabel);
      context.setAttribute("aria-labelledby", contextHeading.id);
      context.appendChild(contextHeading);
      Object.keys(CONTEXTS).forEach(function (name) {
        var section = el("div", "context-rows"); section.dataset.context = name; section.hidden = true;
        sections[name] = section; context.appendChild(section);
      });

      // Akış / Feed
      addSwitch(sections.feed, "ads", t("popupAds", "Reklam engelleme"), "tipAds", "Akış, hikâye ve Reels içindeki sponsorlu paylaşımları gizler. Normal hesapların kendi tanıtım gönderilerini etkilemez.", false);
      addSwitch(sections.feed, "followingFeed", t("setFollowingFeed", "Takip edilenler akışı"), "tipFollowingFeed", "Ana sayfayı ve Ana Sayfa bağlantılarını Takip edilenler akışıyla açar. Açıkça bir akış seçersen bu sayfa oturumunda seçimin korunur. Varsayılan kapalı.", true);
      muteEditor = globalThis.IY.createMuteEditor({ parent: sections.feed, id: "iy-mute-editor",
        rowClass: "row v17-row disclosure", leadClass: "row-lead", labelClass: "row-label", trusted: true,
        t: function (key) { return t(key, key); }, read: function () { return ui.mute; }, save: saveUi });
      // Feed videos are where the player is used: the Video pair also sits on Home.
      var feedVideo = el("p", "context-subheading", t("setCatVideo", "Video"));
      sections.feed.appendChild(feedVideo);
      addSwitch(sections.feed, "video", t("popupVideo", "Video kontrolleri"), "tipVideo", "Videolara hız, sarma, ses, döngü ve indirme çubuğu ekler. Canlı yayınları ve DRM korumalı akışları indirmez.", false);
      addSwitch(sections.feed, "autoAdvance", t("popupAutoAdvance", "Reels otomatik geçiş"), "tipAutoAdvance", "Reel bitince sıradakine geçer.", true);

      // Profil / Profile: HD photo download with the favorite star beside it, follow status, favorites list.
      var avatarRowLabel = t("dockAvatarDownload", "Profil fotoğrafını indir");
      avatarRow = el("button", "row avatar-row v17-row");
      avatarRow.type = "button";
      avatarRow.hidden = true;
      var avatarLead = el("span", "row-lead");
      avatarLead.append(
        emblem("avatar"),
        el("span", "row-label", avatarRowLabel),
        makeInfoButton(avatarRowLabel, "tipAvatarDownload", "Açık olan profilin mevcut en yüksek çözünürlüklü profil fotoğrafını cihazına kaydeder.")
      );
      avatarRow.append(avatarLead, emblem("download"));
      // The favorite star is a sibling of the profile-photo row, not nested in it.
      profileActions = el("div", "profile-actions"); profileActions.hidden = true;
      favStar = el("button", "row fav-star"); favStar.type = "button";
      favStar.setAttribute("aria-pressed", "false");
      favStar.appendChild(emblem("favStar"));
      favStar.hidden = !favApi;
      profileActions.append(avatarRow, favStar);
      sections.profile.appendChild(profileActions);
      addSwitch(sections.profile, "followsBadge", t("setFollowsBadge", "Takip durumu rozeti"), "tipFollowsBadge", "Profil sayfasında, kişi seni takip ediyorsa kullanıcı adının yanında küçük bir rozet gösterir. Instagram kendi etiketini gösteriyorsa bir şey eklenmez. Ek istek yapılmaz.", true);
      // Local favorite accounts (I20): plain list kept in storage.local.favorites, never synced.
      favList = favEmpty = favGroup = null;
      if (favApi) {
        favGroup = addDisclosure(sections.profile, "favorites", t("favoritesTitle", "Favoriler"), "favorites");
        favList = el("div", "fav-list"); favList.setAttribute("role", "list");
        favList.setAttribute("aria-label", t("favoritesTitle", "Favoriler"));
        favEmpty = el("p", "fav-note", t("favoritesEmpty", "Henüz favori yok. Bir profilde yıldıza bas."));
        favGroup.body.append(favList, favEmpty, el("p", "fav-note", t("favoritesDescription", "Sık baktığın hesaplar; liste yalnızca bu cihazda tutulur.")));
      }

      // Gönderi / Post: the D and Shift+D paths of the video controller.
      downloadItemRow = addAction(sections.post, "download-item", "download", t("setDownloadItem", "Medyayı indir"), "setDownloadItemDesc", "Seçili fotoğrafı veya videoyu kaydet.", null);
      downloadAllRow = addAction(sections.post, "download-all", "downloadAll", t("setDownloadAll", "Tümünü indir"), "setDownloadAllDesc", "Albümün tüm slaytlarını kaydet.", null);
      // Full-size viewer for the selected photo (W1); videos keep their own bar and fullscreen.
      viewFullRow = addAction(sections.post, "view-full", "hoverZoom", t("setViewFullSize", "Tam boyutta aç"), "setViewFullSizeDesc", "Asıl boyutu gör, tekerlekle yakınlaştır ve sürükleyerek gezin.", null);

      // Mesajlar / DM thread: let the next read receipt through once.
      markReadRow = addAction(sections.dm, "mark-read", "markRead", t("setMarkRead", "Okundu yap"), "setMarkReadDesc", "Bu sohbetin bir sonraki okundu bilgisini gönder.", null);
      // Voice message download (W1, off by default): shown only with its switch on.
      voiceRow = addAction(sections.dm, "voice-download", "download", t("setVoiceDownload", "Sesli mesajı indir"), "setVoiceDownloadDesc", "DM’de seçtiğin sesli mesajı kaydet.", null);

      // Hikâye / Story or highlight (W2): details sheet, stop at story end, the whole set.
      storyDetailsRow = addAction(sections.story, "story-details", "info", t("setStoryDetails", "Hikâye ayrıntıları"), "setStoryDetailsDesc", "Etiketleri, bahsetmeleri, çıkartmaları, müziği ve bağlantıları göster.", null);
      addSwitch(sections.story, "storyNoAdvance", t("setStoryNoAdvance", "Hikâye sonunda bekle"), "setStoryNoAdvanceDesc", "Sonraki hikâyeye geçmek için seni bekle.", true, "storyPause");
      storyAllRow = addAction(sections.story, "story-all", "downloadAll", t("setDownloadAll", "Tümünü indir"), "setDownloadAllDesc", "Hikâye dizisini veya öne çıkanı kaydet.", null);

      // Reels
      addSwitch(sections.reels, "video", t("popupVideo", "Video kontrolleri"), "tipVideo", "Videolara hız, sarma, ses, döngü ve indirme çubuğu ekler. Canlı yayınları ve DRM korumalı akışları indirmez.", false);
      addSwitch(sections.reels, "autoAdvance", t("popupAutoAdvance", "Reels otomatik geçiş"), "tipAutoAdvance", "Reel bitince sıradakine geçer.", true);
      // Focus readout (W4): remaining time and today's reels on one line, only when either is on.
      reelsReadout = el("p", "context-readout"); reelsReadout.hidden = true;
      sections.reels.appendChild(reelsReadout);
      exploreReadout = el("p", "context-readout"); exploreReadout.hidden = true;
      sections.explore.appendChild(exploreReadout);

      // Tema: the six swatches stay on every route (v1.8 component and behaviour).
      var themeLabel = t("popupTheme", "Tema");
      var themeRow = el("div", "row theme-row");
      var themeLead = el("span", "row-lead");
      themeLead.append(emblem("theme"), el("span", "row-label", themeLabel), makeInfoButton(themeLabel, "tipTheme", "Panel, açılır pencere ve video çubuğunun renk temasını değiştirir. Instagram'ın kendi arayüz renklerine dokunmaz."));
      var swatchesWrap = el("div", "swatches");
      swatchesWrap.setAttribute("role", "radiogroup");
      swatchesWrap.setAttribute("aria-label", themeLabel);
      var THEME_META = [
        { id: "green", key: "themeGreen", fallback: "Yeşil", color: "#246346" },
        { id: "black", key: "themeBlack", fallback: "Siyah", color: "#181B1E" },
        { id: "white", key: "themeWhite", fallback: "Beyaz", color: "#F5F6F7" },
        { id: "pink", key: "themePink", fallback: "Pembe", color: "#C84B7C" },
        { id: "purple", key: "themePurple", fallback: "Mor", color: "#734BB8" },
        { id: "ocean", key: "themeOcean", fallback: "Okyanus", color: "#1F7A94" }
      ];
      swatchButtons = {};
      THEME_META.forEach(function (meta) {
        var sw = el("button", "swatch"); sw.type = "button";
        sw.setAttribute("role", "radio");
        sw.setAttribute("aria-label", t(meta.key, meta.fallback));
        sw.setAttribute("aria-checked", "false");
        sw.dataset.theme = meta.id;
        sw.style.setProperty("--swatch-color", meta.color);
        sw.addEventListener("click", safe(function (event) { if (event.isTrusted) saveUi({ theme: meta.id }); }));
        swatchButtons[meta.id] = sw;
        swatchesWrap.appendChild(sw);
      });
      themeRow.append(themeLead, swatchesWrap);

      allSettings = el("button", "all-settings"); allSettings.type = "button";
      allSettings.append(el("span", "", t("popupAllSettings", "Ayarların tümü")), emblem("arrow"));

      status = el("p", "status");
      var credit = el("button", "signature");
      credit.type = "button";
      var avatar = el("img");
      avatar.src = "data:image/png;base64,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";
      avatar.alt = "";
      avatar.width = 20;
      avatar.height = 20;
      credit.append(avatar, el("span", "", t("creditAuthor", "Hazırlayan KSPIN")));
      credit.addEventListener("click", function (event) {
        if (!event.isTrusted) return;
        window.open("https://github.com/kspinfps", "_blank", "noopener");
      });
      panel.append(ghosts, context, themeRow, allSettings, status, el("p", "footer", t("dockFooter", "InstHush · cihazda kalır")), credit, tooltip);
      avatarRow.addEventListener("click", safe(function (event) {
        if (!event.isTrusted) return;
        if (event.target instanceof Element && event.target.closest(".info-btn")) return;
        downloadProfileAvatar();
      }));
      favStar.addEventListener("click", safe(function (event) {
        if (!event.isTrusted) return;
        var user = currentProfileUser();
        if (!user) return;
        editFavorites(function (list) {
          return favApi.has(list, user) ? favApi.remove(list, user) : favApi.add(list, user, Date.now());
        });
      }));
      [[downloadItemRow, false], [downloadAllRow, true]].forEach(function (pair) {
        pair[0].addEventListener("click", safe(function (event) {
          if (!event.isTrusted) return;
          if (event.target instanceof Element && event.target.closest(".info-btn")) return;
          var run = globalThis.IY && globalThis.IY.videoDownload;
          if (typeof run !== "function" || !run(pair[1])) showPill(t("dockNoMedia", "Bu sayfada indirilecek medya bulunamadı."));
        }));
      });
      markReadRow.addEventListener("click", safe(function (event) {
        if (!event.isTrusted) return;
        if (event.target instanceof Element && event.target.closest(".info-btn")) return;
        markThreadRead();
      }));
      viewFullRow.addEventListener("click", safe(function (event) {
        if (!event.isTrusted) return;
        if (event.target instanceof Element && event.target.closest(".info-btn")) return;
        openFullSize();
      }));
      voiceRow.addEventListener("click", safe(function (event) {
        if (!event.isTrusted) return;
        if (event.target instanceof Element && event.target.closest(".info-btn")) return;
        var tools = globalThis.IY && globalThis.IY.dmTools;
        if (tools && typeof tools.downloadSelected === "function") Promise.resolve(tools.downloadSelected()).catch(function () {});
      }));
      storyDetailsRow.addEventListener("click", safe(function (event) {
        if (!event.isTrusted) return;
        if (event.target instanceof Element && event.target.closest(".info-btn")) return;
        var details = globalThis.IY && globalThis.IY.storyDetails;
        if (!details || typeof details.open !== "function") return;
        setOpen(false);
        Promise.resolve(details.open()).catch(function () {});
      }));
      storyAllRow.addEventListener("click", safe(function (event) {
        if (!event.isTrusted) return;
        if (event.target instanceof Element && event.target.closest(".info-btn")) return;
        downloadStorySet();
      }));
      allSettings.addEventListener("click", safe(function (event) {
        if (!event.isTrusted) return;
        openSettings();
      }));
      master.addEventListener("click", safe(function (event) { if (event.isTrusted) toggleBoth(); }));
      panelBuilt = true;
      render();
    }
    var avatarBtn = el("button", "avatar-btn"); avatarBtn.hidden = true;
    avatarBtn.type = "button";
    var avatarBtnLabel = t("avatarDownloadBtn", "Profil fotoğrafını tam boy indir");
    avatarBtn.setAttribute("aria-label", avatarBtnLabel);
    avatarBtn.title = avatarBtnLabel;
    avatarBtn.setAttribute("aria-hidden", "true");
    var avatarBtnSvg = svgNode("svg", {
      viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
      "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round",
      "aria-hidden": "true", focusable: "false"
    });
    avatarBtnSvg.appendChild(svgNode("path", { d: "M12 4.75v9.5M8.25 10.5 12 14.25 15.75 10.5M5 19.25h14" }));
    avatarBtn.appendChild(avatarBtnSvg);

    var pill = el("div", "pill"); pill.setAttribute("role", "status"); pill.setAttribute("aria-live", "polite");
    var pillText = el("span"); pill.append(logo(), pillText);
    anchor.append(panel, trigger); root.append(anchor, pill, avatarBtn); document.documentElement.appendChild(host);

    var avatarBusy = false, avatarBtnOn = false, avatarRaf = 0, lastPtrX = -1, lastPtrY = -1, activeAvatarImg = null;
    var cachedAvatarImg = null, cachedAvatarPath = "";
    function currentProfileUser() {
      return globalThis.IY.profileUsernameFromPath(location.pathname);
    }
    function isAllowedCdnUrl(url) {
      return globalThis.IY.isAllowedCdn(url);
    }
    function findProfileAvatarImg(user) {
      var list = document.querySelectorAll("main header img, header img");
      var best = null;
      var bestScore = -1;
      var lowUser = typeof user === "string" ? user.toLowerCase() : "";
      for (var i = 0; i < list.length; i++) {
        var img = list[i];
        if (img.closest("article, nav, footer, [role=dialog], [role='navigation'], a[href*='/p/'], a[href*='/reel/'], a[href*='/reels/'], ul")) continue;
        var r = img.getBoundingClientRect();
        if (r.width < 56 || r.width > 260 || r.height < 56 || r.height > 260) continue;
        if (Math.abs(r.width - r.height) > 24) continue;
        var alt = (img.getAttribute("alt") || "").toLowerCase();
        var score = r.width * r.height;
        if (img.closest("header")) score += 50000;
        if (lowUser && alt.indexOf(lowUser) !== -1) score += 100000;
        else if (/profile|profil|avatar|foto/.test(alt)) score += 40000;
        if (score > bestScore) { bestScore = score; best = img; }
      }
      return best;
    }
    // One lookup per route: repeated hovers over the header reuse the found image.
    function cachedProfileAvatarImg(user) {
      if (cachedAvatarImg && cachedAvatarPath === location.pathname && cachedAvatarImg.isConnected) return cachedAvatarImg;
      cachedAvatarImg = findProfileAvatarImg(user);
      cachedAvatarPath = location.pathname;
      return cachedAvatarImg;
    }
    function resolveProfileAvatarUrl(user) {
      var IY = globalThis.IY;
      if (IY && typeof IY.getAvatar === "function") {
        var cached = IY.getAvatar(user);
        if (cached && isAllowedCdnUrl(cached)) return cached;
      }
      var img = activeAvatarImg && activeAvatarImg.isConnected ? activeAvatarImg : cachedProfileAvatarImg(user);
      if (!img) return null;
      var srcset = img.getAttribute("srcset");
      if (srcset) {
        if (IY && typeof IY.pickSrcsetUrl === "function") {
          var fromSet = IY.pickSrcsetUrl(srcset);
          if (fromSet && isAllowedCdnUrl(fromSet)) return fromSet;
        }
      }
      var direct = img.currentSrc || img.getAttribute("src") || img.src;
      return isAllowedCdnUrl(direct) ? direct : null;
    }
    function buildProfileFilename(user) {
      return globalThis.IY.buildAvatarFilename(user, new Date());
    }
    function hideAvatarBtn() {
      avatarBtn.hidden = true;
      if (!avatarBtnOn) return;
      avatarBtnOn = false;
      activeAvatarImg = null;
      avatarBtn.classList.remove("show");
      avatarBtn.setAttribute("aria-hidden", "true");
    }
    function placeAvatarBtn(img) {
      if (!img || !img.isConnected) { hideAvatarBtn(); return; }
      var r = img.getBoundingClientRect();
      if (r.width < 56 || r.height < 56 || r.bottom <= 0 || r.top >= window.innerHeight) { hideAvatarBtn(); return; }
      var x = Math.round(r.right - 32);
      var y = Math.round(r.bottom - 32);
      avatarBtn.style.transform = "translate3d(" + x + "px," + y + "px,0)";
      if (!avatarBtnOn) {
        avatarBtn.hidden = false;
        avatarBtnOn = true;
        avatarBtn.classList.add("show");
        avatarBtn.setAttribute("aria-hidden", "false");
      }
    }
    function checkAvatarHover() {
      avatarRaf = 0;
      var user = currentProfileUser();
      if (!user) { hideAvatarBtn(); return; }
      if (avatarBtnOn && avatarBtn.matches(":hover")) return;
      var img = activeAvatarImg && activeAvatarImg.isConnected ? activeAvatarImg : cachedProfileAvatarImg(user);
      if (!img) { hideAvatarBtn(); return; }
      var r = img.getBoundingClientRect();
      if (lastPtrX >= r.left - 4 && lastPtrX <= r.right + 4 && lastPtrY >= r.top - 4 && lastPtrY <= r.bottom + 4) {
        activeAvatarImg = img;
        placeAvatarBtn(img);
      } else {
        hideAvatarBtn();
      }
    }
    function downloadProfileAvatar() {
      if (avatarBusy) return;
      var user = currentProfileUser();
      if (!user) {
        showPill(t("toastAvatarError", "Profil fotoğrafı indirilemedi."));
        return;
      }
      var url = resolveProfileAvatarUrl(user);
      if (!url) {
        showPill(t("toastAvatarError", "Profil fotoğrafı indirilemedi."));
        return;
      }
      var filename = buildProfileFilename(user);
      if (!filename) return;
      avatarBusy = true;
      if (avatarRow) avatarRow.disabled = true;
      avatarBtn.disabled = true;
      try {
        chrome.runtime.sendMessage({ type: "iy:download", url: url, filename: filename, avatarUsername: user }, safe(function (reply) {
          avatarBusy = false;
          if (avatarRow) avatarRow.disabled = !ready || busy;
          avatarBtn.disabled = false;
          if (chrome.runtime.lastError || !reply || reply.ok !== true) {
            showPill(t("toastAvatarError", "Profil fotoğrafı indirilemedi."));
            return;
          }
          showPill(t("toastStarted", "İndirme başladı."));
        }));
      } catch (err) {
        avatarBusy = false;
        if (avatarRow) avatarRow.disabled = !ready || busy;
        avatarBtn.disabled = false;
        showPill(t("toastAvatarError", "Profil fotoğrafı indirilemedi."));
      }
    }
    avatarBtn.addEventListener("click", safe(function (event) {
      if (!event.isTrusted) return;
      event.preventDefault();
      event.stopPropagation();
      downloadProfileAvatar();
    }));

    // The profile follow-status badge lives in src/content/features/follow-badge.js (v1.9, W2);
    // the dock keeps only its switch (ui.followsBadge).
    var profileListenersOn = false;
    var onProfileScroll = safe(function () {
      if (avatarBtnOn && activeAvatarImg) placeAvatarBtn(activeAvatarImg);
    });
    var onProfileResize = safe(function () {
      if (avatarBtnOn && activeAvatarImg) placeAvatarBtn(activeAvatarImg);
    });
    function setProfileListeners(onProfile) {
      if (onProfile === profileListenersOn) return;
      profileListenersOn = onProfile;
      if (onProfile) {
        document.addEventListener("pointerover", avatarPointer, { capture: true, passive: true });
        document.addEventListener("pointerout", avatarPointerOut, { capture: true, passive: true });
        document.addEventListener("scroll", onProfileScroll, { capture: true, passive: true });
        window.addEventListener("resize", onProfileResize, { passive: true });
      } else {
        document.removeEventListener("pointerover", avatarPointer, true);
        document.removeEventListener("pointerout", avatarPointerOut, true);
        document.removeEventListener("scroll", onProfileScroll, true);
        if (window.removeEventListener) window.removeEventListener("resize", onProfileResize);
      }
    }

    // The dock follows Instagram's own scheme: a dark page gets the dark panel
    // for contrast, and a light page gets the light panel.
    function detectContrastingDockMode(themeName) {
      if (themeName === "black") return "dark";
      if (themeName === "white") return "light";
      try {
        var nodes = [document.body, document.documentElement];
        for (var i = 0; i < nodes.length; i++) {
          if (!nodes[i]) continue;
          var bg = getComputedStyle(nodes[i]).backgroundColor;
          var m = bg && bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
          if (m && (m[4] === undefined || parseFloat(m[4]) > 0)) {
            var lum = (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255;
            return lum < 0.5 ? "dark" : "light";
          }
        }
        if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
      } catch (err) {}
      return "dark";
    }
    function applyTheme() {
      if (globalThis.IY && typeof globalThis.IY.themeVars === "function") {
        host.style.cssText = globalThis.IY.themeVars(ui.theme, detectContrastingDockMode(ui.theme));
      }
    }
    function showPill(text) {
      clearTimeout(pillTimer); pillText.textContent = text; pill.classList.add("show");
      pillTimer = setTimeout(safe(function () { pill.classList.remove("show"); }), 2500);
    }
    function render() {
      applyTheme();
      trigger.dataset.cloaked = String(ready && (cfg.ghostStory || cfg.ghostDm));
      storyDot.classList.toggle("active", ready && cfg.ghostStory);
      dmDot.classList.toggle("active", ready && cfg.ghostDm);
      if (!panelBuilt) return;
      muteEditor.render(ui.mute, !ready || busy);
      switchRows.forEach(function (item) {
        item.button.setAttribute("aria-checked", String(item.isUi ? ui[item.key] : cfg[item.key]));
        item.button.disabled = !ready || busy;
      });
      Object.keys(swatchButtons).forEach(function (id) {
        swatchButtons[id].setAttribute("aria-checked", String(ui.theme === id));
        swatchButtons[id].disabled = !ready || busy;
      });
      renderProfileActions();
      avatarRow.disabled = !ready || busy || avatarBusy;
      downloadItemRow.disabled = downloadAllRow.disabled = markReadRow.disabled = !ready || busy;
      renderFavorites();
      renderContext();
      master.disabled = !ready || busy;
      master.textContent = cfg.ghostStory && cfg.ghostDm ? t("dockShowAll", "Tümünü kapat") : t("dockHideAll", "Tümünü aç");
      var n = String(sessionStory);
      status.textContent = t("dockSessionStories", "Bu oturumda " + n + " hikâye görüldüsü gizlendi", [n]);
      status.title = status.textContent;
    }
    var POST_PATH = /^\/(?:[A-Za-z0-9._]{1,30}\/)?(?:p|tv)\/[^/]+/;
    var REELS_PATH = /^\/(?:[A-Za-z0-9._]{1,30}\/)?reels?(?:\/|$)/;
    var THREAD_PATH = /^\/direct\/t\/([0-9]{5,25})\/?$/;
    var STORY_PATH = /^\/stories\/[^/]+\/?/;
    var EXPLORE_PATH = /^\/explore(?:\/|$)/;
    // Which context the page under the dock is: feed, profile, post, dm, reels or "" (hero only).
    function routeContext() {
      var path = location.pathname || "/";
      if (path === "/") return "feed";
      if (POST_PATH.test(path)) return "post";
      if (REELS_PATH.test(path)) return "reels";
      if (THREAD_PATH.test(path)) return "dm";
      if (STORY_PATH.test(path)) return "story";
      if (EXPLORE_PATH.test(path)) return "explore";
      if (currentProfileUser()) return "profile";
      return "";
    }
    function renderContext() {
      if (!panelBuilt) return;
      var name = routeContext();
      var canDownload = cfg.video && typeof (globalThis.IY && globalThis.IY.videoDownload) === "function";
      downloadItemRow.hidden = downloadAllRow.hidden = !canDownload;
      markReadRow.hidden = !(cfg.ghostDm && typeof (globalThis.IY && globalThis.IY.allowDmRead) === "function");
      var iyApi = globalThis.IY || {};
      var actionsApi = iyApi.actions;
      viewFullRow.hidden = !(actionsApi && typeof actionsApi.openZoom === "function");
      voiceRow.hidden = !(ui.voiceDownload && iyApi.dmTools && typeof iyApi.dmTools.downloadSelected === "function");
      storyDetailsRow.hidden = !(ui.storyDetails && iyApi.storyDetails && typeof iyApi.storyDetails.open === "function");
      storyAllRow.hidden = !(actionsApi && typeof actionsApi.downloadAll === "function");
      renderReadouts();
      var visible = name && Array.prototype.some.call(sections[name].children, function (row) { return !row.hidden; }) ? name : "";
      if (visible !== contextName) {
        var active = root.activeElement;
        var stale = contextName && active && sections[contextName].contains(active);
        // Item details from the previous page close; their target is gone.
        if (favGroup) favGroup.collapse();
        muteEditor.row.setAttribute("aria-expanded", "false");
        muteEditor.panel.hidden = true;
        contextName = visible;
        if (stale) (visible ? contextHeading : allSettings).focus({ preventScroll: true });
      }
      Object.keys(sections).forEach(function (key) { sections[key].hidden = key !== visible; });
      context.hidden = !visible;
      if (visible) {
        var meta = CONTEXTS[visible];
        if (contextLabel.textContent !== t(meta[0], meta[1])) {
          contextLabel.textContent = t(meta[0], meta[1]);
          contextIcon.replaceChildren(emblem(meta[2] === "download" ? "downloadHeading" : meta[2]));
        }
      }
    }
    // Remaining time (focus-limit.js) and today's reels (reel-counter.js) on one line; each part
    // shows only while its feature runs. Refreshed on open, route change and when the features
    // save their totals (ige.focus every few seconds, ige.reels per reel): the dock never polls.
    function focusReadout(timeOnly) {
      var parts = [];
      try {
        var limitApi = globalThis.IY && globalThis.IY.focusLimit;
        var limit = limitApi && typeof limitApi.getController === "function" ? limitApi.getController() : null;
        if (limit && limit.isActive() && limit.getSettings().showTimer) {
          parts.push(t("focusLimitPill", "Bugün " + limit.getFormattedRemaining() + " kaldı", [limit.getFormattedRemaining()]));
        }
        var counterApi = globalThis.IY && globalThis.IY.reelCounter;
        var counter = !timeOnly && counterApi && typeof counterApi.getController === "function" ? counterApi.getController() : null;
        if (counter && counter.isActive()) parts.push(counter.getFormattedCount());
      } catch (err) {}
      return parts.join(" · ");
    }
    function renderReadouts() {
      if (!panelBuilt) return;
      var reels = focusReadout(false), explore = focusReadout(true);
      if (reelsReadout.textContent !== reels) reelsReadout.textContent = reels;
      if (exploreReadout.textContent !== explore) exploreReadout.textContent = explore;
      reelsReadout.hidden = !reels;
      exploreReadout.hidden = !explore;
    }
    // The selected photo of the open post, for the full-size viewer.
    function currentPostImage() {
      var keys = globalThis.IY && globalThis.IY.feedKeys;
      var post = keys && typeof keys.currentPost === "function" ? keys.currentPost(true) : null;
      var scope = post || document.querySelector('main article, [role="dialog"] article, main');
      if (!scope) return null;
      var best = null, bestArea = 0, vh = window.innerHeight || 0;
      var images = scope.querySelectorAll("img");
      for (var i = 0; i < images.length && i < 80; i++) {
        var r = images[i].getBoundingClientRect();
        if (r.width < 150 || r.height < 150 || r.bottom <= 0 || r.top >= vh) continue;
        if (r.width * r.height > bestArea) { bestArea = r.width * r.height; best = images[i]; }
      }
      return best;
    }
    function openFullSize() {
      var actionsApi = globalThis.IY && globalThis.IY.actions;
      var img = currentPostImage();
      if (!actionsApi || typeof actionsApi.openZoom !== "function" || !img) {
        showPill(t("toastZoomPhotoOnly", "Yalnızca fotoğraflar yakınlaştırılabilir."));
        return;
      }
      setOpen(false);
      Promise.resolve(actionsApi.openZoom(img)).catch(function () {});
    }
    // The open story or highlight as one set (ZIP or separate files, as chosen in Settings).
    function downloadStorySet() {
      var actionsApi = globalThis.IY && globalThis.IY.actions;
      var hover = globalThis.IY && globalThis.IY.hover;
      var media = null, bestArea = 0, vh = window.innerHeight || 0;
      var nodes = document.querySelectorAll("section video, section img, video");
      for (var i = 0; i < nodes.length && i < 60; i++) {
        var r = nodes[i].getBoundingClientRect();
        if (r.width < 150 || r.height < 150 || r.bottom <= 0 || r.top >= vh) continue;
        if (r.width * r.height > bestArea) { bestArea = r.width * r.height; media = nodes[i]; }
      }
      var target = media && hover && typeof hover.contextFor === "function" ? hover.contextFor(media) : (actionsApi && actionsApi.__lazy ? media : null);
      if (!actionsApi || typeof actionsApi.downloadAll !== "function" || !target) {
        showPill(t("dockNoMedia", "Bu sayfada indirilecek medya bulunamadı."));
        return;
      }
      Promise.resolve(actionsApi.downloadAll(target)).catch(function () {});
    }
    function markThreadRead() {
      var match = THREAD_PATH.exec(location.pathname);
      var api = globalThis.IY;
      if (!match || !cfg.ghostDm || !api || typeof api.allowDmRead !== "function") return;
      var ok = false;
      try { ok = api.allowDmRead(match[1], (api.dmRead && api.dmRead.ALLOW_MS) || 10000) === true; } catch (err) { ok = false; }
      showPill(ok ? t("dmReadToast", "Bir sonraki etkinlikte okundu olarak işaretlenecek") : t("dmReadFail", "Henüz hazır değil. Biraz sonra tekrar dene."));
    }
    // Content scripts cannot open the options page; the background does it.
    function openSettings() {
      setOpen(false);
      var failed = function () { showPill(t("dockSettingsError", "Ayarlar açılamadı; tekrar dene.")); };
      try {
        chrome.runtime.sendMessage({ type: "iy:openOptions" }, safe(function (reply) {
          if (chrome.runtime.lastError || !reply || reply.ok !== true) failed();
        }));
      } catch (err) { failed(); }
    }
    function setOpen(value) {
      if (value) buildPanel();
      open = value; panel.inert = !open;
      if (!open) hideTip(true);
      renderProfileActions();
      panel.classList.toggle("open", open);
      panel.setAttribute("aria-hidden", String(!open)); trigger.setAttribute("aria-expanded", String(open));
      renderReadouts();
      if (open) { (ready && !busy ? switches.ghostStory : trigger).focus({ preventScroll:true }); }
      else trigger.focus({ preventScroll:true });
    }
    function renderProfileActions() {
      if (!panelBuilt) return;
      var user = currentProfileUser();
      avatarRow.hidden = !user;
      profileActions.hidden = !user;
      if (!favApi) return;
      var pressed = !!user && favApi.has(favorites, user);
      var label = pressed ? t("favoritesRemove", "Favorilerden çıkar") : t("favoritesAdd", "Favorilere ekle");
      favStar.setAttribute("aria-pressed", String(pressed));
      favStar.setAttribute("aria-label", label);
      favStar.title = label;
      favStar.disabled = !ready || busy || favBusy;
    }
    function openFavorite(event, link) {
      // Modified and middle clicks keep the browser's own new-tab/window behavior.
      if (!event.isTrusted || event.defaultPrevented || event.button !== 0 ||
          event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      // The closed shadow root hides this anchor from Instagram's router, so navigate explicitly.
      event.preventDefault();
      setOpen(false);
      location.assign(link.getAttribute("href"));
    }
    function renderFavorites() {
      if (!favApi) return;
      var disabled = !ready || busy || favBusy;
      var signature = JSON.stringify(favorites.items.map(function (item) { return item.u; }));
      if (signature !== favSignature) {
        favSignature = signature;
        favList.replaceChildren();
        favorites.items.forEach(function (item) {
          var row = el("div", "fav-row"); row.setAttribute("role", "listitem");
          var link = el("a", "fav-link");
          link.setAttribute("href", "https://www.instagram.com/" + item.u + "/");
          link.append(emblem("avatar"), el("span", "row-label", "@" + item.u));
          link.addEventListener("click", safe(function (event) { openFavorite(event, link); }));
          var remove = el("button", "fav-remove", "\u00d7"); remove.type = "button";
          remove.setAttribute("aria-label", t("favoritesRemove", "Favorilerden çıkar") + " @" + item.u);
          remove.addEventListener("click", safe(function (event) {
            if (!event.isTrusted) return;
            editFavorites(function (list) { return favApi.remove(list, item.u); });
          }));
          row.append(link, remove);
          favList.appendChild(row);
        });
      }
      if (favGroup) favGroup.count.textContent = String(favorites.items.length);
      favList.hidden = !favorites.items.length;
      favEmpty.hidden = favorites.items.length > 0;
      Array.from(favList.querySelectorAll("button")).forEach(function (button) { button.disabled = disabled; });
    }
    function favFailed() { favBusy = false; render(); showPill(t("popupSaveError", "Ayar kaydedilemedi; tekrar deneyin.")); }
    // Re-read the stored list before each edit so popup and other tabs are never overwritten.
    function editFavorites(change) {
      if (!favApi || !ready || busy || favBusy) return;
      favBusy = true; render();
      try {
        chrome.storage.local.get("favorites", safe(function (data) {
          if (chrome.runtime.lastError) { favFailed(); return; }
          var next = favApi.normalize(change(favApi.normalize(data && data.favorites)));
          var revision = favRevision;
          try {
            chrome.storage.local.set({ favorites: next }, safe(function () {
              if (chrome.runtime.lastError) { favFailed(); return; }
              if (revision === favRevision) favorites = next;
              favBusy = false; render();
            }));
          } catch (err) { favFailed(); }
        }));
      } catch (err) { favFailed(); }
    }
    function save(change, confirmation) {
      if (!ready || busy) return;
      busy = true; render();
      try {
        chrome.storage.local.get(confirmation ? ["cfg", "ui"] : "cfg", safe(function (data) {
          if (chrome.runtime.lastError) { failed(); return; }
          var current = normalize(data.cfg), patch = change(current);
          var merged = Object.assign({}, isPlainObject(data.cfg) ? data.cfg : {}, current, patch);
          var revision = cfgRevision, beforeUi = uiRevision;
          var values = { cfg: merged };
          if (confirmation) {
            delete merged.ghostTyping;
            values.ui = Object.assign({}, data.ui, { ghostTyping: patch.ghostDm });
          }
          try {
            chrome.storage.local.set(values, safe(function () {
              if (chrome.runtime.lastError) { failed(); return; }
              if (revision === cfgRevision) cfg = normalize(merged);
              if (confirmation && beforeUi === uiRevision) ui = normalizeUi(values.ui);
              busy = false; render(); route(true);
              if (confirmation) showPill(cfg.ghostStory && cfg.ghostDm ? t("dockGhostsOn", "Hikâye ve DM ghost açık") : t("dockGhostsOff", "Hikâye ve DM ghost kapalı"));
            }));
          } catch (err) { failed(); }
        }));
      } catch (err) { failed(); }
    }
    function saveUi(patch) {
      if (!ready || busy) return;
      busy = true; render();
      try {
        chrome.storage.local.get("ui", safe(function (data) {
          if (chrome.runtime.lastError) { failed(); return; }
          var existing = isPlainObject(data.ui) ? data.ui : {};
          var merged = Object.assign({}, existing, normalizeUi(existing), patch);
            if (patch.focusOpts) merged.focusOpts = Object.assign({}, existing.focusOpts, normalizeFocusOptions(existing), patch.focusOpts);
          if (patch.muteEdit) { merged.mute = globalThis.IY.editMute(existing.mute, patch.muteEdit); delete merged.muteEdit; }
          var revision = uiRevision;
          try {
            chrome.storage.local.set({ ui: merged }, safe(function () {
              if (chrome.runtime.lastError) { failed(); return; }
              if (revision === uiRevision) ui = normalizeUi(merged);
              busy = false; render();
            }));
          } catch (err) { failed(); }
        }));
      } catch (err) { failed(); }
    }
    function failed() { busy = false; render(); showPill(t("popupSaveError", "Ayar kaydedilemedi; tekrar deneyin.")); }
    function toggleBoth() {
      if (panelBuilt && !(cfg.ghostStory && cfg.ghostDm)) { markJustTurnedOn(switches.ghostStory); markJustTurnedOn(switches.ghostDm); }
      save(function (current) { var value = !(current.ghostStory && current.ghostDm); return { ghostStory:value, ghostDm:value }; }, true);
    }
    function count(stats) {
      var value = stats && stats.story;
      value = typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
      if (baseline === null) baseline = value;
      else sessionStory += Math.max(0, value - lastStory);
      lastStory = value; render();
    }
    function route(force) {
      var next = location.pathname;
      if (!force && next === pathname) return;
      var changed = pathname !== next;
      pathname = next;
      if (changed) { activeAvatarImg = null; cachedAvatarImg = null; cachedAvatarPath = ""; hideAvatarBtn(); }
      var onProfile = !!currentProfileUser();
      renderProfileActions();
      renderContext();
      setProfileListeners(onProfile);
      if (!onProfile) {
        if (avatarRaf) cancelAnimationFrame(avatarRaf);
        avatarRaf = 0;
        hideAvatarBtn();
      }
      clearTimeout(pillTimer); pill.classList.remove("show");
      if (!ready) return;
      if (/^\/stories\//.test(next) && cfg.ghostStory) showPill(t("dockHiddenViewing", "Gizli izleme"));
      else if (/^\/direct\/t\//.test(next) && cfg.ghostDm) showPill(t("dockHiddenReading", "Gizli okuma"));
    }
    // Key bindings from Settings (stored overrides only). Without an override the v1.8 matcher
    // stays: Alt+G / Alt+Shift+G by produced letter or physical G key.
    var keyOverrides = {};
    function readShortcuts(raw) {
      var api = globalThis.IY && globalThis.IY.settingsSchema;
      keyOverrides = {};
      if (api && typeof api.normalizeShortcuts === "function") {
        try { keyOverrides = api.normalizeShortcuts(raw).map; } catch (err) { keyOverrides = {}; }
      }
      var chord = Object.prototype.hasOwnProperty.call(keyOverrides, "dock.toggle") ? keyOverrides["dock.toggle"] : "Alt+g";
      if (chord) trigger.setAttribute("aria-keyshortcuts", chord.split("+").map(function (part, index, parts) {
        return index === parts.length - 1 && part.length === 1 ? part.toUpperCase() : part;
      }).join("+"));
      else trigger.removeAttribute("aria-keyshortcuts");
    }
    function keyOverridden(id) { return Object.prototype.hasOwnProperty.call(keyOverrides, id); }
    function eventChord(event) {
      var api = globalThis.IY && globalThis.IY.settingsSchema;
      if (!api || typeof api.chordFromEvent !== "function") return null;
      var key = event.key, code = typeof event.code === "string" ? event.code : "";
      // Non-Latin letters and Alt-composed characters (macOS) fall back to the physical key.
      if (typeof key === "string" && key.length === 1 && /^Key[A-Z]$/.test(code) &&
          ((/\p{L}/u.test(key) && !/\p{Script=Latin}/u.test(key)) || (event.altKey && !/^[a-z]$/i.test(key)))) key = code.slice(3).toLowerCase();
      return api.chordFromEvent({ key: key, code: code, ctrlKey: !!event.ctrlKey, altKey: !!event.altKey, shiftKey: !!event.shiftKey,
        metaKey: !!event.metaKey, isComposing: false, repeat: false, keyCode: 0 });
    }
    // "dock.toggle" | "ghost.toggle" | "" for a keydown.
    function dockAction(event) {
      var chord = null, ids = ["dock.toggle", "ghost.toggle"];
      for (var i = 0; i < ids.length; i++) {
        if (!keyOverridden(ids[i]) || keyOverrides[ids[i]] === "") continue;
        if (chord === null) chord = eventChord(event) || "";
        if (chord && keyOverrides[ids[i]] === chord) return ids[i];
      }
      if (event.altKey && !event.ctrlKey && !event.metaKey && (event.code === "KeyG" || String(event.key).toLowerCase() === "g")) {
        var id = event.shiftKey ? "ghost.toggle" : "dock.toggle";
        if (!keyOverridden(id)) return id;
      }
      return "";
    }
    trigger.addEventListener("click", safe(function () { setOpen(!open); }));
    panel.addEventListener("click", safe(function (event) {
      if (!(event.target instanceof Element && event.target.closest(".info-btn"))) hideTip(true);
    }));
    ["click", "pointerdown", "dblclick"].forEach(function (name) {
      root.addEventListener(name, safe(function (event) { event.stopPropagation(); }));
    });
    function avatarPointer(event) {
      if (!(event.target instanceof Element) || !event.target.closest("header")) return;
      lastPtrX = event.clientX;
      lastPtrY = event.clientY;
      if (!avatarRaf) avatarRaf = requestAnimationFrame(safe(checkAvatarHover));
    }
    function avatarPointerOut(event) {
      if (event.relatedTarget === host) return;
      var img = activeAvatarImg;
      var container = img && (img.closest("a, button") || img.parentElement);
      if (!container || !event.relatedTarget || !container.contains(event.relatedTarget)) hideAvatarBtn();
    }
    IY.core.listen(document, "click", function (event) {
      if (event.composedPath().includes(host)) return;
      if (open) setOpen(false);
    }, { capture:true, passive:true });
    function dockInputFocused() {
      var active = root.activeElement;
      return !!active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
    }
    // Keystrokes typed into a dock input must not reach page or extension shortcut listeners.
    // Capture-phase listeners (keys.js, video.js) only see the retargeted host, so while a dock
    // input has focus the host presents itself as a text field (role + editable) to their
    // typing checks; bubble listeners (Instagram) are cut at the shadow root.
    root.addEventListener("focusin", safe(function (event) {
      if (!(event.target && ["INPUT", "TEXTAREA", "SELECT"].indexOf(event.target.tagName) !== -1)) return;
      host.setAttribute("role", "textbox");
      host.contentEditable = "true";
    }));
    root.addEventListener("focusout", safe(function (event) {
      if (!(event.target && ["INPUT", "TEXTAREA", "SELECT"].indexOf(event.target.tagName) !== -1)) return;
      host.removeAttribute("role");
      host.removeAttribute("contenteditable");
    }));
    ["keydown", "keyup", "keypress"].forEach(function (name) {
      root.addEventListener(name, safe(function (event) {
        if (event.target && event.target.tagName === "INPUT") event.stopPropagation();
      }));
    });
    IY.core.listen(document, "keydown", function (event) {
      if (!event.isTrusted) return;
      var typing = event.composedPath().some(function (node) {
        return node !== host && node instanceof Element && (node.matches("input,textarea,select,[role=textbox]") || node.isContentEditable);
      });
      if (typing) return;
      // The closed shadow root hides its inputs from composedPath(): a focused dock input is
      // typing too. Only Tab (cycle) and Escape (close) stay with the dock then.
      if (dockInputFocused() && event.key !== "Tab" && event.key !== "Escape") return;
      var action = dockAction(event);
      if (action) {
        if (event.repeat) return;
        event.preventDefault(); event.stopImmediatePropagation();
        if (action === "ghost.toggle") toggleBoth(); else setOpen(!open);
      } else if (open && event.key === "Escape") {
        event.preventDefault(); event.stopImmediatePropagation();
        if (activeTipBtn) hideTip(true); else setOpen(false);
      } else if (open && event.key === "Tab") {
        var buttons = Array.from(panel.querySelectorAll("button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],.info-btn")).filter(function (node) {
          return !node.closest("[hidden]");
        });
        buttons.push(trigger);
        var index = buttons.indexOf(root.activeElement);
        var next = (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
        event.preventDefault(); event.stopImmediatePropagation(); buttons[next].focus({ preventScroll:true });
      }
    }, true);
    IY.core.listen(document, "focusin", function (event) {
      if (open && event.target !== host) (ready && !busy ? switches.ghostStory : trigger).focus({ preventScroll:true });
    }, true);
    IY.core.route(() => route(false));
    if (window.matchMedia) {
      try { IY.core.listen(window.matchMedia("(prefers-color-scheme: dark)"), "change", applyTheme); } catch (err) {}
    }
    IY.core.onStorage(function (changes, area) {
      if (area !== "local") return;
      if (changes.cfg) { cfgRevision++; cfg = normalize(changes.cfg.newValue); ready = true; render(); route(true); }
      if (changes.ui) { uiRevision++; ui = normalizeUi(changes.ui.newValue); ready = true; render(); }
      if (changes.stats) { statsRevision++; count(changes.stats.newValue); }
      if (open && (changes["ige.focus"] || changes["ige.reels"])) renderReadouts();
      if (changes.favorites && favApi) { favRevision++; favorites = favApi.normalize(changes.favorites.newValue); render(); }
      if (changes.shortcuts) { shortcutsRevision++; readShortcuts(changes.shortcuts.newValue); }
    });
    render();
    var shortcutsRevision = 0;
    readShortcuts(undefined);
    var initialCfgRevision = cfgRevision, initialUiRevision = uiRevision, initialStatsRevision = statsRevision, initialFavRevision = favRevision, initialShortcutsRevision = shortcutsRevision;
    chrome.storage.local.get(["cfg", "ui", "stats", "favorites", "shortcuts"], safe(function (data) {
      if (chrome.runtime.lastError) { showPill(t("dockLoadError", "Ayarlar okunamadı; sayfayı yenileyin.")); return; }
      if (initialCfgRevision === cfgRevision) cfg = normalize(data.cfg);
      if (initialUiRevision === uiRevision) ui = normalizeUi(data.ui);
      if (initialShortcutsRevision === shortcutsRevision) readShortcuts(data.shortcuts);
      if (favApi && initialFavRevision === favRevision) favorites = favApi.normalize(data.favorites);
      ready = true;
      if (initialStatsRevision === statsRevision) count(data.stats);
      render(); route(true);
    }));
  }
})();
