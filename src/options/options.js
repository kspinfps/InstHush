// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
// Copyright jewdev; InstHush changes GPL-3.0-only.
//
// InstHush Settings tab. Everything is built from src/lib/settings-schema.js; values live
// in chrome.storage.local exactly where the popup and dock keep them, so a change here
// shows in every open surface through storage.onChanged.
(function () {
  "use strict";

  const BACKUP_VERSION = 2;
  const MAX_BACKUP_BYTES = 256 * 1024;
  const FORBIDDEN = ["__proto__", "constructor", "prototype"];
  const STORE_KEYS = ["cfg", "ui", "shortcuts", "speed", "favorites", "usage", "syncState"];

  function isPlainObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }
  function hasForbiddenKey(value, depth) {
    if (!value || typeof value !== "object") return false;
    if (depth > 32) return true;
    for (const key of Object.getOwnPropertyNames(value)) {
      if (FORBIDDEN.indexOf(key) !== -1 || hasForbiddenKey(value[key], depth + 1)) return true;
    }
    return false;
  }
  function schemaApi(env) {
    return (env && env.schema) || (env && env.IY && env.IY.settingsSchema) || globalThis.IY.settingsSchema;
  }

  // ------------------------------------------------------------------ backups (pure)
  // Version 2 carries every exportable preference by catalogue path, key bindings and,
  // only when asked, the personal lists. Version 1 files (popup) still import.
  function buildBackupV2(store, options, env) {
    const schema = schemaApi(env);
    const settings = {};
    for (const entry of schema.ENTRIES) {
      if (!entry.exportable || entry.planned || entry.consent || !entry.path || entry.type === "bindings") continue;
      settings[entry.path] = schema.read(store, entry.id);
    }
    const result = {
      app: "InstHush", kind: "settings", version: BACKUP_VERSION,
      exportedAt: new Date((env && env.now ? env.now() : Date.now())).toISOString(),
      settings,
      shortcuts: schema.normalizeShortcuts(store && store.shortcuts)
    };
    if (options && options.lists) {
      result.lists = {
        mute: schema.read(store, "mute"),
        favorites: schema.normalizeValue("favorites", store && store.favorites)
      };
    }
    return result;
  }

  function parseAnyBackup(text, env) {
    const backup = (env && env.backup) || globalThis.IY.backup;
    if (typeof text !== "string") return { ok: false, error: "bad_json" };
    if ((backup && text === backup.OVERSIZE) || text.length > MAX_BACKUP_BYTES ||
        new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) return { ok: false, error: "too_big" };
    let value;
    try { value = JSON.parse(text); } catch (_) { return { ok: false, error: "bad_json" }; }
    if (!isPlainObject(value)) return { ok: false, error: "bad_shape" };
    if (value.app !== "InstHush" || value.kind !== "settings") return { ok: false, error: "bad_kind" };
    if (value.version === 1) {
      const parsed = backup.parseBackup(text);
      if (!parsed.ok) return parsed;
      return Object.assign({ version: 1 }, parsed);
    }
    if (value.version !== BACKUP_VERSION) return { ok: false, error: "bad_version" };
    if (hasForbiddenKey(value, 0) || !isPlainObject(value.settings)) return { ok: false, error: "bad_shape" };
    if ("shortcuts" in value && !isPlainObject(value.shortcuts)) return { ok: false, error: "bad_shape" };
    const result = { ok: true, version: 2, settings: value.settings, shortcuts: value.shortcuts };
    if ("lists" in value) {
      const lists = value.lists;
      if (!isPlainObject(lists)) return { ok: false, error: "bad_shape" };
      result.lists = {};
      if ("mute" in lists) {
        if (!isPlainObject(lists.mute)) return { ok: false, error: "bad_shape" };
        result.lists.mute = lists.mute;
      }
      if ("favorites" in lists) {
        const fav = lists.favorites;
        if (!isPlainObject(fav) || fav.v !== 1 || !Array.isArray(fav.items)) return { ok: false, error: "bad_shape" };
        result.lists.favorites = fav;
      }
    }
    return result;
  }

  // The stored values after an import, and what changes. Device consents, pending jobs
  // and the sync switch are never imported. Version 1 keeps cfg (outside its scope);
  // missing lists keep the current ones.
  function planImport(store, parsed, env) {
    const schema = schemaApi(env);
    const current = isPlainObject(store) ? store : {};
    let next = Object.assign({}, current);
    const writes = {};
    function apply(change) {
      if (!change) return;
      Object.assign(writes, change);
      next = Object.assign({}, next, change);
    }
    const lists = [];
    if (parsed.version === 1) {
      const rawUi = isPlainObject(current.ui) ? current.ui : {};
      const imported = schema.normalizeUi(parsed.ui);
      const ui = Object.assign({}, rawUi, imported);
      if (!Object.prototype.hasOwnProperty.call(parsed.ui, "mute")) ui.mute = schema.read(current, "mute");
      else lists.push("mute");
      apply({ ui });
      if (parsed.favorites) { apply({ favorites: schema.normalizeValue("favorites", parsed.favorites) }); lists.push("favorites"); }
    } else {
      for (const path of Object.keys(parsed.settings)) {
        const entry = schema.get(path);
        if (!entry || entry.path !== path || !entry.exportable || entry.planned || entry.consent || entry.type === "bindings") continue;
        apply(schema.patch(next, entry.id, parsed.settings[path]));
      }
      if (parsed.shortcuts !== undefined) apply({ shortcuts: schema.normalizeShortcuts(parsed.shortcuts) });
      if (parsed.lists && parsed.lists.mute) { apply(schema.patch(next, "mute", parsed.lists.mute)); lists.push("mute"); }
      if (parsed.lists && parsed.lists.favorites) { apply({ favorites: schema.normalizeValue("favorites", parsed.lists.favorites) }); lists.push("favorites"); }
    }
    const changes = schema.differences(current, next, { filter: entry => !entry.personal });
    return { writes, next, changes, lists };
  }

  // ------------------------------------------------------------------ the page
  function createApp(env) {
    const doc = env.document;
    const win = env.window || {};
    const chromeApi = env.chrome;
    const schema = schemaApi(env);
    const IY = env.IY || globalThis.IY || {};
    const backup = env.backup || IY.backup;
    const syncApi = env.sync || IY.sync;
    const usageApi = env.usage || IY.usage;
    const favApi = env.favorites || IY.favorites;
    const healthApi = env.optionsHealth || IY.optionsHealth;
    const healthLib = env.health || IY.health;
    const now = env.now || Date.now;
    const rebindable = env.rebindable || (def => def.rebindable === true);
    const uiLanguage = (() => { try { return chromeApi.i18n.getUILanguage() || "tr"; } catch (_) { return "tr"; } })();
    const locale = /^tr/i.test(uiLanguage) ? "tr" : "en";
    let bundle = env.messages || null;

    function t(key, substitutions) {
      let text = "";
      try { text = chromeApi.i18n.getMessage(key, substitutions); } catch (_) {}
      if (!text && bundle && bundle[locale] && bundle[locale][key]) {
        text = String(bundle[locale][key].message || "").replace(/\$(\d+)/g, (_, n) => (substitutions || [])[Number(n) - 1] ?? "");
      }
      return text || key;
    }

    // ---------------------------------------------------------------- storage
    function area(name, method, argument) {
      return new Promise((resolve, reject) => {
        try {
          const target = chromeApi.storage[name];
          const result = target[method](argument, value => {
            const error = chromeApi.runtime && chromeApi.runtime.lastError;
            if (error) reject(new Error(error.message || "storage"));
            else resolve(value || {});
          });
          if (result && typeof result.then === "function") result.then(value => resolve(value || {}), reject);
        } catch (error) { reject(error); }
      });
    }
    const local = {
      get: key => area("local", "get", key),
      set: value => area("local", "set", value),
      remove: key => area("local", "remove", key)
    };
    const syncCtx = chromeApi.storage && chromeApi.storage.sync ? {
      local,
      sync: { get: key => area("sync", "get", key), set: value => area("sync", "set", value), remove: key => area("sync", "remove", key) },
      now, random: env.random || Math.random
    } : null;

    let store = {};
    let ready = false;
    let writing = Promise.resolve();
    // Writes run one after another and always start from a fresh read.
    function queue(task) {
      const run = writing.then(task);
      writing = run.catch(() => {});
      return run;
    }

    // ---------------------------------------------------------------- DOM helpers
    const SVG = "http://www.w3.org/2000/svg";
    function el(tag, className, text) {
      const node = doc.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined && text !== null && text !== "") node.textContent = text;
      return node;
    }
    function svg(tag, attrs) {
      const node = doc.createElementNS(SVG, tag);
      for (const key of Object.keys(attrs)) node.setAttribute(key, attrs[key]);
      return node;
    }
    const EMBLEMS = {
      ghostMode: [["path", { class: "emblem-fill", fill: "currentColor", stroke: "none", d: "M3.5 13.5V7a4.5 4.5 0 0 1 9 0v6.5l-2.25-1.25L8 13.5l-2.25-1.25Z" }], ["path", { d: "M3.5 13.5V7a4.5 4.5 0 0 1 9 0v6.5l-2.25-1.25L8 13.5l-2.25-1.25Z" }], ["circle", { cx: "6.5", cy: "6.75", r: "0.85", fill: "currentColor", stroke: "none" }], ["circle", { cx: "9.5", cy: "6.75", r: "0.85", fill: "currentColor", stroke: "none" }]],
      ghostStory: [["path", { class: "emblem-fill", fill: "currentColor", stroke: "none", d: "M2.25 13.5V7.25a3.75 3.75 0 0 1 7.5 0v6.25l-1.88-1.1L6 13.5l-1.87-1.1Z" }], ["path", { d: "M2.25 13.5V7.25a3.75 3.75 0 0 1 7.5 0v6.25l-1.88-1.1L6 13.5l-1.87-1.1Z" }], ["circle", { cx: "4.75", cy: "7", r: "0.75", fill: "currentColor", stroke: "none" }], ["circle", { cx: "7.25", cy: "7", r: "0.75", fill: "currentColor", stroke: "none" }], ["path", { d: "M11.5 2.25a2.5 2.5 0 1 1-1.77 4.27" }]],
      ghostDm: [["path", { class: "emblem-fill", fill: "currentColor", stroke: "none", d: "M2.25 13.5V7.5a3.5 3.5 0 0 1 7 0v6l-1.75-1L5.75 13.5 4 12.5Z" }], ["path", { d: "M2.25 13.5V7.5a3.5 3.5 0 0 1 7 0v6l-1.75-1L5.75 13.5 4 12.5Z" }], ["circle", { cx: "4.6", cy: "7.25", r: "0.7", fill: "currentColor", stroke: "none" }], ["circle", { cx: "6.9", cy: "7.25", r: "0.7", fill: "currentColor", stroke: "none" }], ["path", { d: "M9.5 2.25h3.25c.55 0 1 .45 1 1v2c0 .55-.45 1-1 1H11.2L9.75 7.5V6.25H9.5c-.55 0-1-.45-1-1v-2c0-.55.45-1 1-1Z" }]],
      video: [["path", { class: "emblem-fill", fill: "currentColor", stroke: "none", d: "M4.25 2.75 10.25 6.25 4.25 9.75Z" }], ["path", { d: "M4.25 2.75 10.25 6.25 4.25 9.75Z" }], ["path", { d: "M2.25 13h11.5M10.25 11.5v3" }]],
      ads: [["path", { class: "emblem-fill", fill: "currentColor", stroke: "none", d: "M8 1.75 13.25 4v4c0 3.25-2.75 5.25-5.25 6.25C5.5 13.25 2.75 11.25 2.75 8V4Z" }], ["path", { d: "M8 1.75 13.25 4v4c0 3.25-2.75 5.25-5.25 6.25C5.5 13.25 2.75 11.25 2.75 8V4Z" }], ["path", { d: "M5.5 5.5 10.5 10.5" }]],
      commentCopy: [["rect", { class: "emblem-fill", x: "2.75", y: "5.25", width: "7.75", height: "8.5", rx: "1.25", fill: "currentColor", stroke: "none" }], ["rect", { x: "2.75", y: "5.25", width: "7.75", height: "8.5", rx: "1.25" }], ["path", { d: "M5.5 5.25V3.5c0-.69.56-1.25 1.25-1.25h5.25c.69 0 1.25.56 1.25 1.25v6.25c0 .69-.56 1.25-1.25 1.25H10.5" }]],
      autoAdvance: [["path", { d: "m3 3 6 5-6 5ZM12 3v10" }]],
      storyPause: [["path", { d: "M5.5 3v10M10.5 3v10" }]],
      noAutoplay: [["path", { d: "M5 3.5v9l7-4.5z" }]],
      hoverZoom: [["circle", { cx: "7", cy: "7", r: "4.25" }], ["path", { d: "M10.25 10.25L13.5 13.5" }]],
      cleanLinks: [["path", { d: "M8 5l1.5-1.5a2.12 2.12 0 1 1 3 3l-2 2a2.12 2.12 0 0 1-3 0" }], ["path", { d: "M8 11l-1.5 1.5a2.12 2.12 0 1 1-3-3l2-2a2.12 2.12 0 0 1 3 0" }]],
      exactDates: [["rect", { x: "2.25", y: "3.25", width: "11.5", height: "10.5", rx: "1.75" }], ["path", { d: "M2.25 6.75h11.5M5.25 1.75v3M10.75 1.75v3M5 9.5h1.5M7.25 9.5h1.5M9.5 9.5h1.5M5 11.75h1.5" }]],
      seenPosts: [["path", { d: "M1.5 8s2.25-4.25 6.5-4.25S14.5 8 14.5 8s-2.25 4.25-6.5 4.25S1.5 8 1.5 8Z" }], ["circle", { cx: "8", cy: "8", r: "1.75" }]],
      favorites: [["path", { class: "emblem-fill", fill: "currentColor", stroke: "none", d: "M8 2.15 9.53 6.3 13.94 6.47 10.47 9.2 11.67 13.46 8 11 4.33 13.46 5.53 9.2 2.06 6.47 6.47 6.3Z" }], ["path", { d: "M8 2.15 9.53 6.3 13.94 6.47 10.47 9.2 11.67 13.46 8 11 4.33 13.46 5.53 9.2 2.06 6.47 6.47 6.3Z" }]],
      opBadge: [["path", { d: "M3 2.75h10c.55 0 1 .45 1 1v6.5c0 .55-.45 1-1 1H8.25L5.25 13.5v-2.25H3c-.55 0-1-.45-1-1v-6.5c0-.55.45-1 1-1Z" }], ["path", { d: "M5.75 7 7.25 8.5 10.25 5.5" }]],
      groupFeed: [["rect", { x: "2.25", y: "2.25", width: "11.5", height: "11.5", rx: "1.75" }], ["path", { d: "M5 5.75h6M5 8h6M5 10.25h3.5" }]],
      usage: [["circle", { cx: "8", cy: "8", r: "6" }], ["path", { d: "M8 4v4l3 2" }]],
      defaultSpeed: [["path", { d: "M2.5 11.5a5.5 5.5 0 1 1 11 0" }], ["path", { d: "M8 11.5 10.75 7.25" }]],
      focus: [["circle", { cx: "8", cy: "8", r: "3" }], ["path", { d: "M1 5V1h4m6 0h4v4m0 6v4h-4m-6 0H1v-4" }]],
      keys: [["rect", { x: "1.75", y: "3.75", width: "12.5", height: "8.5", rx: "1.75" }], ["path", { d: "M4.5 6.75h1M7.5 6.75h1M10.5 6.75h1M5 9.75h6" }]],
      breakMins: [["path", { d: "M3 5h8v5a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3ZM11 6h1a2 2 0 0 1 0 4h-1M5 1.5v1M8 1.5v1" }]],
      theme: [["circle", { cx: "8", cy: "8", r: "5.75" }], ["path", { d: "M8 2.25a5.75 5.75 0 0 1 0 11.5Z", fill: "currentColor", stroke: "none" }]],
      avatar: [["circle", { class: "emblem-fill", cx: "8", cy: "5.5", r: "2.5", fill: "currentColor", stroke: "none" }], ["circle", { cx: "8", cy: "5.5", r: "2.5" }], ["path", { d: "M3 13.25c.9-2.1 2.75-3.25 5-3.25s4.1 1.15 5 3.25" }]],
      download: [["path", { d: "M8 2.75v7.5M5.25 7.75 8 10.5l2.75-2.75M3.25 13.25h9.5" }]],
      sync: [["path", { d: "M13 6.5A5 5 0 0 0 3.6 5M3 9.5a5 5 0 0 0 9.4 1.5" }], ["path", { d: "M3.25 2.5v2.75H6M12.75 13.5v-2.75H10" }]],
      backup: [["path", { d: "M3 10.5v2.25h10V10.5M8 3v7M5.25 5.75 8 3l2.75 2.75" }]],
      reset: [["path", { d: "M3 8a5 5 0 1 0 1.5-3.55" }], ["path", { d: "M3 2.5v2.75h2.75" }]],
      warning: [["path", { d: "M8 2.25 14.25 13.25H1.75Z" }], ["path", { d: "M8 6.5v3M8 11.5h.01" }]],
      info: [["circle", { cx: "8", cy: "8", r: "6" }], ["path", { d: "M8 7.25v3.5" }], ["circle", { cx: "8", cy: "4.75", r: "0.75", fill: "currentColor", stroke: "none" }]],
      search: [["circle", { cx: "7", cy: "7", r: "4.5" }], ["path", { d: "m10.5 10.5 3 3" }]],
      chevron: [["path", { d: "m4 6 4 4 4-4" }]],
      arrow: [["path", { d: "M3 8h10M9 4l4 4-4 4" }]],
      health: [["path", { d: "M1.5 8.5h3l1.75-4.5 3 8 1.75-3.5h3.5" }]],
      mute: [["path", { d: "M2.75 6h2.5l3.5-3v10l-3.5-3h-2.5Z" }], ["path", { d: "M11 6.25l3 3.5M14 6.25l-3 3.5" }]]
    };
    function emblem(kind, className) {
      const icon = svg("svg", { class: className || "emblem", width: "16", height: "16", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor",
        "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false" });
      for (const [tag, attrs] of EMBLEMS[kind] || EMBLEMS.info) icon.appendChild(svg(tag, attrs));
      return icon;
    }
    function categoryIcon(id) {
      const category = schema.CATEGORIES.find(item => item.id === id);
      return emblem(category ? category.icon : "info");
    }

    // ---------------------------------------------------------------- status and tooltip
    const statusNode = doc.getElementById("status");
    function announce(key, substitutions) {
      if (statusNode) statusNode.textContent = key ? t(key, substitutions) : "";
    }
    const tooltip = doc.getElementById("tooltip");
    let activeTip = null, tipPinned = false;
    function showTip(button, pin) {
      if (!tooltip) return;
      if (activeTip && activeTip !== button) activeTip.removeAttribute("aria-describedby");
      activeTip = button;
      if (pin) tipPinned = true;
      tooltip.textContent = t(button.dataset.tip);
      button.setAttribute("aria-describedby", "tooltip");
      tooltip.setAttribute("aria-hidden", "false");
      tooltip.classList.add("show");
      const rect = button.getBoundingClientRect(), tip = tooltip.getBoundingClientRect();
      const width = win.innerWidth || 1024;
      let left = rect.left + rect.width / 2 - tip.width / 2;
      left = Math.max(8, Math.min(left, width - tip.width - 8));
      let top = rect.top - tip.height - 6;
      if (top < 8) top = rect.bottom + 6;
      tooltip.style.left = Math.round(left) + "px";
      tooltip.style.top = Math.round(top) + "px";
    }
    function hideTip(force) {
      if (!tooltip || (tipPinned && !force)) return;
      tipPinned = false;
      if (activeTip) { activeTip.removeAttribute("aria-describedby"); activeTip = null; }
      tooltip.classList.remove("show");
      tooltip.setAttribute("aria-hidden", "true");
    }
    function infoButton(tipKey, labelText) {
      const button = el("button", "info-btn");
      button.type = "button";
      button.dataset.tip = tipKey;
      button.setAttribute("aria-label", labelText + " — " + t("infoMore"));
      button.appendChild(emblem("info", "info-glyph"));
      button.addEventListener("mouseenter", () => showTip(button, false));
      button.addEventListener("mouseleave", () => hideTip(false));
      button.addEventListener("focus", () => showTip(button, false));
      button.addEventListener("blur", () => hideTip(true));
      button.addEventListener("click", event => {
        event.preventDefault();
        if (activeTip === button && tipPinned) hideTip(true); else showTip(button, true);
      });
      button.addEventListener("keydown", event => {
        if (event.key === "Escape" && activeTip === button) { event.stopPropagation(); hideTip(true); }
      });
      return button;
    }

    // ---------------------------------------------------------------- dialogs
    const dialog = doc.getElementById("dialog");
    function openDialog(options) {
      return new Promise(resolve => {
        const title = doc.getElementById("dialog-title");
        const desc = doc.getElementById("dialog-desc");
        const body = doc.getElementById("dialog-body");
        const actions = doc.getElementById("dialog-actions");
        const opener = doc.activeElement;
        title.textContent = options.title;
        desc.textContent = options.desc || "";
        desc.hidden = !options.desc;
        body.replaceChildren(...(options.body || []));
        const buttons = [];
        let settled = false;
        function finish(value) {
          if (settled) return;
          settled = true;
          try { if (dialog.open) dialog.close(); } catch (_) {}
          dialog.removeAttribute("open");
          if (opener && typeof opener.focus === "function" && opener.isConnected !== false) opener.focus();
          resolve(value);
        }
        const all = [{ value: "cancel", label: options.cancel || t("optCancel") }].concat(options.actions || []);
        for (const action of all) {
          const button = el("button", "btn" + (action.accent ? " btn-accent" : "") + (action.danger ? " btn-danger" : ""), action.label);
          button.type = "button";
          button.dataset.value = action.value;
          button.addEventListener("click", () => finish(action.value));
          buttons.push(button);
        }
        actions.replaceChildren(...buttons);
        dialog.oncancel = event => { if (event) event.preventDefault(); finish("cancel"); };
        dialog.onkeydown = event => {
          if (event.key === "Escape") { event.preventDefault(); finish("cancel"); }
        };
        try { if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", ""); }
        catch (_) { dialog.setAttribute("open", ""); }
        // Cancel takes focus first.
        buttons[0].focus();
        dialog.dataset.state = "open";
        dialog.finish = finish;
      });
    }

    // ---------------------------------------------------------------- values and saving
    function readValue(id) { return schema.read(store, id); }
    let updaters = [];
    function refresh() {
      for (const update of updaters) { try { update(store); } catch (_) {} }
      renderHeader();
    }
    function markBusy(node, busy) {
      if (!node) return;
      if (busy) node.setAttribute("aria-busy", "true"); else node.removeAttribute("aria-busy");
    }
    async function saveEntry(id, value, row) {
      if (!ready) return false;
      const entry = schema.get(id);
      const key = entry.path.split(".")[0];
      markBusy(row, true);
      announce("");
      try {
        await queue(async () => {
          const fresh = await local.get(key);
          const change = schema.patch(Object.assign({}, store, fresh), id, value);
          if (!change) throw new Error("not editable");
          await local.set(change);
          Object.assign(store, change);
        });
        markBusy(row, false);
        refresh();
        return true;
      } catch (_) {
        markBusy(row, false);
        announce("popupSaveError");
        refresh();
        return false;
      }
    }
    async function writeRaw(task, row, successKey) {
      if (!ready) return false;
      markBusy(row, true);
      announce("");
      try {
        await queue(task);
        markBusy(row, false);
        refresh();
        if (successKey) announce(successKey);
        return true;
      } catch (_) {
        markBusy(row, false);
        announce("popupSaveError");
        refresh();
        return false;
      }
    }

    // ---------------------------------------------------------------- row builders
    function copyBlock(entry, ids) {
      const copy = el("span", "setting-copy");
      const lead = el("span", "setting-lead");
      if (entry.icon) lead.appendChild(emblem(entry.icon));
      const label = el("span", "setting-label", t(entry.label));
      label.id = ids.label;
      lead.appendChild(label);
      copy.appendChild(lead);
      if (entry.desc) {
        const desc = el("span", "description", t(entry.desc));
        desc.id = ids.desc;
        copy.appendChild(desc);
      }
      return copy;
    }

    function switchRow(entry, options) {
      const row = el("div", "setting compact-setting row" + (options && options.sub ? " sub-row" : ""));
      row.id = "row-" + entry.id;
      row.dataset.entry = entry.id;
      const ids = { label: "label-" + entry.id, desc: "desc-" + entry.id };
      const copy = copyBlock(entry, ids);
      const button = el("button", "switch-btn");
      button.type = "button";
      button.id = "sw-" + entry.id;
      button.setAttribute("role", "switch");
      button.setAttribute("aria-labelledby", ids.label);
      if (entry.desc) button.setAttribute("aria-describedby", ids.desc);
      const track = el("span", "switch");
      track.setAttribute("aria-hidden", "true");
      button.appendChild(track);
      function toggle() {
        if (!ready || row.getAttribute("aria-busy") === "true") return;
        const next = readValue(entry.id) !== true;
        if (next) { row.dataset.justOn = "true"; win.setTimeout && win.setTimeout(() => { delete row.dataset.justOn; }, 240); }
        (options && options.onToggle ? options.onToggle(next, row) : saveEntry(entry.id, next, row));
      }
      button.addEventListener("click", toggle);
      // The text toggles too; the info button beside it does not.
      copy.addEventListener("click", toggle);
      row.append(copy);
      if (entry.tip) row.appendChild(infoButton(entry.tip, t(entry.label)));
      row.appendChild(button);
      row.switchButton = button;
      updaters.push(() => {
        const on = readValue(entry.id) === true;
        button.setAttribute("aria-checked", String(on));
        row.setAttribute("aria-checked", String(on));
        button.disabled = !ready;
      });
      return row;
    }

    function selectRow(entry, format) {
      const row = el("div", "setting compact-setting row select-row");
      row.id = "row-" + entry.id;
      row.dataset.entry = entry.id;
      const ids = { label: "label-" + entry.id, desc: "desc-" + entry.id };
      const copy = copyBlock(entry, ids);
      const wrap = el("span", "select-wrap");
      const select = el("select");
      select.id = "sel-" + entry.id;
      select.setAttribute("aria-labelledby", ids.label);
      if (entry.desc) select.setAttribute("aria-describedby", ids.desc);
      for (const value of entry.values) {
        const option = el("option", "", format(value));
        option.value = String(value);
        select.appendChild(option);
      }
      select.addEventListener("change", () => {
        const raw = select.value;
        const value = typeof entry.default === "number" ? Number(raw) : raw;
        saveEntry(entry.id, value, row);
      });
      wrap.append(select, emblem("chevron", "select-chevron"));
      row.append(copy);
      if (entry.tip) row.appendChild(infoButton(entry.tip, t(entry.label)));
      row.appendChild(wrap);
      updaters.push(() => {
        select.value = String(readValue(entry.id));
        select.disabled = !ready;
      });
      return row;
    }

    const THEME_SWATCH = { green: "#246346", black: "#181B1E", white: "#F5F6F7", pink: "#C84B7C", purple: "#734BB8", ocean: "#1F7A94" };
    const THEME_LABEL = { green: "themeGreen", black: "themeBlack", white: "themeWhite", pink: "themePink", purple: "themePurple", ocean: "themeOcean" };
    function themeRow(entry) {
      const row = el("div", "setting compact-setting row theme-row");
      row.id = "row-" + entry.id;
      row.dataset.entry = entry.id;
      const ids = { label: "label-" + entry.id, desc: "desc-" + entry.id };
      const copy = copyBlock(entry, ids);
      const group = el("div", "swatches");
      group.setAttribute("role", "radiogroup");
      group.setAttribute("aria-labelledby", ids.label);
      const swatches = schema.THEME_ORDER.map(id => {
        const swatch = el("button", "swatch");
        swatch.type = "button";
        swatch.setAttribute("role", "radio");
        swatch.dataset.theme = id;
        swatch.setAttribute("aria-label", t(THEME_LABEL[id]));
        swatch.style.setProperty("--swatch-color", THEME_SWATCH[id]);
        swatch.addEventListener("click", () => saveEntry(entry.id, id, row));
        swatch.addEventListener("keydown", event => {
          const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
          if (!step) return;
          event.preventDefault();
          const order = schema.THEME_ORDER;
          const next = order[(order.indexOf(id) + step + order.length) % order.length];
          const target = swatches[order.indexOf(next)];
          target.focus();
          saveEntry(entry.id, next, row);
        });
        group.appendChild(swatch);
        return swatch;
      });
      row.append(copy, group);
      updaters.push(() => {
        const current = readValue(entry.id);
        for (const swatch of swatches) {
          const on = swatch.dataset.theme === current;
          swatch.setAttribute("aria-checked", String(on));
          swatch.tabIndex = on ? 0 : -1;
          swatch.disabled = !ready;
        }
      });
      return row;
    }

    function infoRow(entry, meta) {
      const row = el("div", "setting compact-setting row info-row");
      row.id = "row-" + entry.id;
      row.dataset.entry = entry.id;
      const ids = { label: "label-" + entry.id, desc: "desc-" + entry.id };
      const copy = copyBlock(entry, ids);
      const metaNode = el("span", "meta");
      copy.appendChild(metaNode);
      row.appendChild(copy);
      updaters.push(() => { metaNode.textContent = meta(); });
      return row;
    }

    function onOff(value) { return t(value ? "optOn" : "optOff"); }
    function chordText(id) {
      const chord = schema.effectiveShortcuts(store.shortcuts)[id];
      return chord ? schema.formatChord(chord, locale) : t("optKeyNone");
    }
    function actionMeta(entry) {
      return () => {
        const parts = [];
        if (entry.shortcut) parts.push(t("optKeyLabel", [chordText(entry.shortcut)]));
        if (entry.controlledBy) {
          const control = schema.get(entry.controlledBy);
          parts.push(t(control.label) + ": " + onOff(readValue(control.id)));
        }
        return parts.join(" · ");
      };
    }

    function seenPostsRow(entry) {
      const wrap = el("div", "setting-with-action");
      wrap.appendChild(switchRow(entry));
      const clear = el("button", "row-action", t("seenPostsClear"));
      clear.type = "button";
      clear.id = "action-seenPostsClear";
      clear.setAttribute("aria-label", t("seenPostsClearLabel"));
      clear.addEventListener("click", () => writeRaw(() => local.remove("seenPosts"), wrap, "seenPostsCleared"));
      wrap.appendChild(clear);
      updaters.push(() => { clear.disabled = !ready; });
      return wrap;
    }

    function muteRow(entry) {
      const wrap = el("div", "mute-area");
      wrap.id = "row-" + entry.id;
      wrap.dataset.entry = entry.id;
      if (!IY.createMuteEditor) return wrap;
      const editor = IY.createMuteEditor({
        parent: wrap, id: "mute-editor", rowClass: "setting compact-setting row disclosure", leadClass: "setting-lead",
        labelClass: "setting-label", t: key => t(key),
        read: () => readValue("mute"),
        save: change => {
          if (!change || !change.muteEdit) return;
          writeRaw(async () => {
            const fresh = await local.get("ui");
            const raw = isPlainObject(fresh.ui) ? fresh.ui : {};
            const next = Object.assign({}, raw, schema.normalizeUi(raw));
            next.mute = IY.editMute(raw.mute, change.muteEdit);
            await local.set({ ui: next });
            store.ui = next;
          }, wrap);
        }
      });
      const desc = el("p", "description sub-desc", t(entry.desc));
      wrap.insertBefore ? wrap.insertBefore(desc, editor.panel) : wrap.appendChild(desc);
      updaters.push(() => editor.render(readValue("mute"), !ready));
      return wrap;
    }

    function favoritesRow(entry) {
      const wrap = el("div", "favorites-area");
      wrap.id = "row-" + entry.id;
      wrap.dataset.entry = entry.id;
      const head = el("div", "setting compact-setting row");
      const ids = { label: "label-" + entry.id, desc: "desc-" + entry.id };
      const copy = copyBlock(Object.assign({}, entry, { icon: "favorites" }), ids);
      const count = el("span", "count");
      head.append(copy);
      if (entry.tip) head.appendChild(infoButton(entry.tip, t(entry.label)));
      head.appendChild(count);
      const list = el("div", "fav-list");
      list.setAttribute("role", "list");
      list.setAttribute("aria-labelledby", ids.label);
      const empty = el("p", "description fav-empty", t("favoritesEmpty"));
      wrap.append(head, list, empty);
      let signature = null, removeButtons = [];
      updaters.push(() => {
        const items = readValue("favorites").items;
        count.textContent = String(items.length);
        const next = JSON.stringify(items.map(item => item.u));
        if (next !== signature) {
          signature = next;
          list.replaceChildren();
          removeButtons = [];
          for (const item of items) {
            const line = el("div", "fav-row");
            line.setAttribute("role", "listitem");
            const link = el("a", "fav-link", "@" + item.u);
            link.href = "https://www.instagram.com/" + item.u + "/";
            link.target = "_blank";
            link.rel = "noopener";
            const remove = el("button", "fav-remove", "×");
            remove.type = "button";
            remove.setAttribute("aria-label", t("favoritesRemove") + " @" + item.u);
            remove.addEventListener("click", () => {
              if (!favApi) return;
              writeRaw(async () => {
                const fresh = await local.get("favorites");
                const nextList = favApi.normalize(favApi.remove(favApi.normalize(fresh.favorites), item.u));
                await local.set({ favorites: nextList });
                store.favorites = nextList;
              }, wrap);
            });
            line.append(link, remove);
            list.appendChild(line);
            removeButtons.push(remove);
          }
        }
        list.hidden = !items.length;
        empty.hidden = items.length > 0;
        for (const button of removeButtons) button.disabled = !ready || !favApi;
      });
      return wrap;
    }

    function usageRow(entry) {
      return infoRow(Object.assign({}, entry), () => {
        if (!usageApi || typeof usageApi.summarize !== "function") return "";
        const summary = usageApi.summarize(store.usage && store.usage.days, now());
        const units = { h: t("timerUnitHour"), m: t("timerUnitMin") };
        return t("timerRowValue", [usageApi.formatDuration(summary.today, units), usageApi.formatDuration(summary.week, units)]);
      });
    }

    // ---------------------------------------------------------------- v1.9 rows
    // Select labels for the v1.9 choices (W1 download format, W4 daily limit and grayscale).
    const ENUM_FORMATS = {
      dailyLimit: value => value === 0 ? t("popupBreakOff") : t("popupBreakMins", [String(value)]),
      grayscale: value => t({ never: "optGrayscaleNever", limited: "optGrayscaleLimited", limit: "optGrayscaleLimit", always: "optGrayscaleAlways" }[value] || "optGrayscaleNever"),
      downloadFormat: value => t(value === "files" ? "optFormatFiles" : "optFormatZip")
    };
    // Same rule as src/lib/links.js swapShareDomain: a bare host name or an http(s) origin.
    const SHARE_DOMAIN = /^(?:https?:\/\/)?((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63})\/?$/i;
    // Sample metadata for the filename preview (no real account).
    const FILE_SAMPLE = { user: "instagram", shortcode: "C1a2B3c4D5e", index: 1, type: "image", id: "3141592653589793",
      ext: "jpg", takenAt: 1763649005, isCarousel: true };
    function filePreview(template) {
      const lib = IY.filename;
      if (!lib || typeof lib.renderFilename !== "function") return "";
      try { return String(lib.renderFilename(template || lib.DEFAULT_TEMPLATE, Object.assign({}, FILE_SAMPLE)) || ""); }
      catch (_) { return ""; }
    }
    // Why a typed value cannot be saved, as a message key; "" when it can.
    function textProblem(entry, value) {
      if (value.length > (entry.maxLength || 200)) return "optTextTooLong";
      if (entry.id === "shareDomain") {
        if (!value) return "";
        const match = SHARE_DOMAIN.exec(value);
        return match && match[1].length <= 253 ? "" : "optShareDomainInvalid";
      }
      if (entry.id === "filenameTemplate" && value) {
        const path = filePreview(value);
        // The background accepts at most 6 folder levels and 240 characters (src/bg/sw.js).
        if (!path) return "optTemplateInvalid";
        if (path.length > 240 || path.split("/").length > 6) return "optTemplateTooLong";
      }
      return "";
    }
    function textRow(entry) {
      const row = el("div", "setting compact-setting row text-row");
      row.id = "row-" + entry.id;
      row.dataset.entry = entry.id;
      const ids = { label: "label-" + entry.id, desc: "desc-" + entry.id };
      const copy = copyBlock(entry, ids);
      const hint = el("span", "meta text-hint");
      hint.id = "hint-" + entry.id;
      copy.appendChild(hint);
      const field = el("span", "text-field");
      const input = el("input", "text-input");
      input.type = "text";
      input.id = "txt-" + entry.id;
      input.maxLength = entry.maxLength || 200;
      input.autocomplete = "off";
      input.spellcheck = false;
      input.setAttribute("aria-labelledby", ids.label);
      input.setAttribute("aria-describedby", (entry.desc ? ids.desc + " " : "") + hint.id);
      input.setAttribute("placeholder", entry.id === "shareDomain" ? "kkinstagram.com" : String(entry.default || ""));
      field.appendChild(input);
      let restore = null;
      if (entry.default) {
        restore = el("button", "row-action", t("optKeyDefault"));
        restore.type = "button";
        restore.id = "restore-" + entry.id;
        restore.addEventListener("click", () => { input.value = entry.default; commit(); });
        field.appendChild(restore);
      }
      function describe() {
        const value = input.value.trim();
        const problem = textProblem(entry, value);
        input.setAttribute("aria-invalid", String(!!problem));
        if (problem) hint.textContent = t(problem);
        else if (entry.id === "filenameTemplate") hint.textContent = t("optTemplatePreview", [filePreview(value || entry.default)]);
        else if (entry.id === "shareDomain") {
          hint.textContent = value ? t("optShareDomainPreview", ["https://" + SHARE_DOMAIN.exec(value)[1].toLowerCase() + "/p/C1a2B3c4D5e/"]) : t("optShareDomainEmpty");
        } else hint.textContent = "";
        return problem;
      }
      async function commit() {
        if (describe()) return;
        let value = input.value.trim();
        // An empty template means the default one; a domain is stored as its bare host name.
        if (entry.id === "filenameTemplate" && !value) value = entry.default;
        if (entry.id === "shareDomain" && value) value = SHARE_DOMAIN.exec(value)[1].toLowerCase();
        if (value === readValue(entry.id)) { input.value = value; describe(); return; }
        await saveEntry(entry.id, value, row);
      }
      input.addEventListener("input", describe);
      input.addEventListener("change", commit);
      input.addEventListener("keydown", event => {
        if (event.key === "Enter") { event.preventDefault(); commit(); }
        else if (event.key === "Escape" && input.value !== readValue(entry.id)) {
          event.preventDefault();
          event.stopPropagation();
          input.value = readValue(entry.id);
          describe();
        }
      });
      row.append(copy);
      if (entry.tip) row.appendChild(infoButton(entry.tip, t(entry.label)));
      row.appendChild(field);
      updaters.push(() => {
        if (doc.activeElement !== input) { input.value = readValue(entry.id); describe(); }
        input.disabled = !ready;
        if (restore) restore.disabled = !ready;
      });
      return row;
    }

    // MP3 conversion runs in an extension page that reads the Instagram CDN, so turning it on
    // asks for those hosts once (optional_host_permissions); nothing else needs them.
    function toggleAudioMp3(next, row) {
      if (!next) { saveEntry("audioMp3", false, row); return; }
      const permissions = chromeApi.permissions;
      let request = null;
      // Called straight from the click: browsers ask for a permission only during a user gesture.
      try { if (permissions && typeof permissions.request === "function") request = permissions.request({ origins: IY.MP3_ORIGINS }); }
      catch (_) { request = null; }
      Promise.resolve(request).then(granted => {
        if (granted !== true) { announce("optMp3PermissionDenied"); refresh(); return; }
        saveEntry("audioMp3", true, row);
      }, () => { announce("optMp3PermissionDenied"); refresh(); });
    }

    // Risky features (F2-design "Risky features"): off by default, a visible warning that stays
    // when the switch is off, and a confirmation before each one turns on.
    const RISK_COPY = {
      bulkProfile: ["riskRateWarning"],
      bulkSaved: ["riskRateWarning"],
      unfollowers: ["riskScanWarning"],
      unfollowQueue: ["riskQueueWarning", "riskQueueDetail"],
      keepUnsent: ["riskUnsentWarning", "riskUnsentDetail"]
    };
    const ARCHIVE_KEY = "iy.dmArchive.v1";
    function archiveCount(value) {
      const records = value && Array.isArray(value.records) ? value.records : [];
      const cutoff = now() - 30 * 86400000;
      return records.filter(record => record && Number(record.unsentAt) > cutoff).length;
    }
    function riskyRow(entry) {
      const wrap = el("div", "risky-setting");
      const copyKeys = RISK_COPY[entry.id] || ["riskRateWarning"];
      const row = switchRow(entry, {
        onToggle: (next, node) => {
          if (!next) { saveEntry(entry.id, false, node); return; }
          openDialog({
            title: t(entry.label),
            desc: t(copyKeys[0]),
            body: copyKeys.slice(1).map(key => el("p", "description", t(key))),
            actions: [{ value: "on", label: t("riskEnable"), accent: true }]
          }).then(choice => { if (choice === "on") saveEntry(entry.id, true, node); });
        }
      });
      const warning = el("div", "risk-note");
      warning.id = "risk-" + entry.id;
      const head = el("p", "warning-head");
      head.append(emblem("warning"), el("span", "", t(copyKeys[0])));
      warning.appendChild(head);
      for (const key of copyKeys.slice(1)) warning.appendChild(el("p", "description", t(key)));
      if (row.switchButton) row.switchButton.setAttribute("aria-describedby", (entry.desc ? "desc-" + entry.id + " " : "") + warning.id);
      wrap.append(row, warning);
      if (entry.id === "keepUnsent") {
        // Archive contents stay out of sync, backups and reports; only their count shows here.
        const actions = el("div", "risk-actions");
        const countNode = el("span", "meta");
        countNode.id = "archive-count";
        const clear = el("button", "row-action", t("riskUnsentClear"));
        clear.type = "button";
        clear.id = "action-clearUnsent";
        let count = null;
        function show() {
          countNode.textContent = count === null ? "" : t("riskUnsentCount", [String(count)]);
          clear.disabled = !ready || !count;
        }
        function load() {
          local.get(ARCHIVE_KEY).then(value => { count = archiveCount(value[ARCHIVE_KEY]); show(); }, () => { count = null; show(); });
        }
        clear.addEventListener("click", async () => {
          const choice = await openDialog({
            title: t("riskUnsentClear"), desc: t("riskUnsentClearConfirm", [String(count || 0)]),
            actions: [{ value: "clear", label: t("riskUnsentClear"), danger: true }]
          });
          if (choice !== "clear") return;
          await writeRaw(() => local.remove(ARCHIVE_KEY), wrap, "riskUnsentCleared");
          load();
        });
        actions.append(countNode, clear);
        warning.appendChild(actions);
        updaters.push(show);
        load();
      }
      return wrap;
    }

    function ghostCard(entry) {
      const card = el("section", "ghost-card");
      card.id = "row-" + entry.id;
      card.dataset.entry = entry.id;
      card.setAttribute("aria-labelledby", "ghost-heading");
      const heading = el("div", "ghost-heading");
      const title = el("h3", "ghost-title");
      title.id = "ghost-heading";
      title.append(emblem("ghostMode"), el("span", "", t(entry.label)));
      const master = el("button", "ghost-master");
      master.type = "button";
      master.id = "ghost-master";
      master.setAttribute("aria-describedby", "ghost-desc");
      heading.append(title, master);
      const desc = el("p", "description ghost-desc", t(entry.desc));
      desc.id = "ghost-desc";
      const controls = el("div", "ghost-controls");
      for (const id of entry.children) {
        const child = schema.get(id);
        const row = switchRow(child);
        row.classList.add("ghost-setting");
        controls.appendChild(row);
      }
      master.addEventListener("click", () => writeRaw(async () => {
        const fresh = await local.get(["cfg", "ui"]);
        const change = schema.ghostMasterPatch(fresh);
        await local.set(change);
        Object.assign(store, change);
      }, card));
      card.append(heading, desc, controls);
      updaters.push(() => {
        const story = readValue("ghostStory"), dm = readValue("ghostDm");
        master.textContent = t(story && dm ? "setGhostAllOff" : "setGhostAllOn");
        master.disabled = !ready;
        card.dataset.cloaked = String(ready && (story || dm));
      });
      return card;
    }

    function focusDisclosure(entry) {
      const wrap = el("div", "focus-area");
      wrap.id = "row-" + entry.id;
      wrap.dataset.entry = entry.id;
      const toggle = el("button", "setting compact-setting row disclosure");
      toggle.type = "button";
      toggle.id = "focus-toggle";
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-controls", "focus-panel");
      const ids = { label: "label-" + entry.id, desc: "desc-" + entry.id };
      const copy = copyBlock(Object.assign({}, entry, { icon: "focus" }), ids);
      const end = el("span", "disclosure-end");
      const count = el("span", "count");
      end.append(count, emblem("chevron", "chevron"));
      toggle.append(copy, end);
      toggle.setAttribute("aria-labelledby", ids.label);
      toggle.setAttribute("aria-describedby", ids.desc);
      const panel = el("div", "disclosure-panel");
      panel.id = "focus-panel";
      panel.setAttribute("role", "group");
      panel.setAttribute("aria-labelledby", ids.label);
      panel.hidden = true;
      toggle.addEventListener("click", () => {
        const open = toggle.getAttribute("aria-expanded") !== "true";
        toggle.setAttribute("aria-expanded", String(open));
        panel.hidden = !open;
      });
      const linked = [];
      for (const id of entry.children) {
        const child = schema.get(id);
        if (child.category === entry.category) { panel.appendChild(switchRow(child, { sub: true })); continue; }
        const line = el("div", "setting compact-setting row sub-row link-row");
        const text = el("span", "setting-copy");
        text.appendChild(el("span", "setting-label", t(child.label)));
        const state = el("span", "description");
        text.appendChild(state);
        const link = el("a", "text-link", t("optOpenIn", [t(schema.CATEGORIES.find(c => c.id === child.category).label)]));
        link.href = "#" + child.category;
        link.addEventListener("click", () => { pendingFocus = "sw-" + child.id; });
        line.append(text, link);
        panel.appendChild(line);
        linked.push({ child, state });
      }
      wrap.append(toggle, panel);
      updaters.push(() => {
        let on = 0;
        for (const id of entry.children) if (readValue(id) === true) on++;
        count.textContent = on + " / " + entry.children.length;
        for (const item of linked) item.state.textContent = onOff(readValue(item.child.id) === true);
      });
      return wrap;
    }

    // ---------------------------------------------------------------- keyboard editor
    function shortcutsEditor(entry) {
      const wrap = el("div", "shortcuts-area");
      wrap.id = "row-" + entry.id;
      wrap.dataset.entry = entry.id;
      wrap.appendChild(el("p", "description sub-desc", t(entry.desc)));
      const defs = schema.shortcutDefs();
      for (const group of schema.SHORTCUT_GROUPS) {
        const inGroup = defs.filter(def => def.group === group);
        if (!inGroup.length) continue;
        const box = el("div", "key-group");
        const heading = el("h4", "key-group-title", t("optKeyGroup" + group[0].toUpperCase() + group.slice(1)));
        heading.id = "keys-" + group;
        const list = el("ul", "key-list");
        list.setAttribute("aria-labelledby", heading.id);
        for (const def of inGroup) list.appendChild(shortcutRow(def));
        box.append(heading, list);
        wrap.appendChild(box);
      }
      return wrap;
    }

    function shortcutRow(def) {
      const item = el("li", "key-row");
      item.id = "key-" + def.id.replace(/\./g, "-");
      const text = el("span", "key-copy");
      const label = el("span", "setting-label", t(def.label));
      label.id = item.id + "-label";
      const context = el("span", "description", t("optCtx" + def.context[0].toUpperCase() + def.context.slice(1)));
      text.append(label, context);
      const keycap = el("kbd", "keycap");
      keycap.id = item.id + "-chord";
      const controls = el("span", "key-actions");
      const change = el("button", "btn btn-small", t("optKeyChange"));
      change.type = "button";
      change.setAttribute("aria-describedby", label.id + " " + keycap.id);
      const clear = el("button", "btn btn-small", t("optKeyClear"));
      clear.type = "button";
      clear.setAttribute("aria-describedby", label.id);
      const restore = el("button", "btn btn-small", t("optKeyDefault"));
      restore.type = "button";
      restore.setAttribute("aria-describedby", label.id);
      controls.append(change, clear, restore);
      const message = el("span", "key-message");
      message.id = item.id + "-msg";
      message.setAttribute("aria-live", "polite");
      const editable = rebindable(def);
      if (!editable) message.textContent = t("optKeyFixed");
      item.append(text, keycap, controls, message);

      let recording = false;
      function stop(keepMessage) {
        recording = false;
        change.textContent = t("optKeyChange");
        change.removeAttribute("aria-pressed");
        item.classList.remove("recording");
        if (!keepMessage) message.textContent = "";
      }
      async function store_(chord) {
        const result = schema.bindShortcut(store.shortcuts, def.id, chord);
        if (!result.ok) {
          message.textContent = result.error === "conflict"
            ? t("optKeyConflict", [t(schema.SHORTCUTS.find(other => other.id === result.conflict).label)])
            : t(result.error === "navigation" ? "optKeyNavigation" : "optKeyReserved");
          change.setAttribute("aria-describedby", label.id + " " + keycap.id + " " + message.id);
          return false;
        }
        const ok = await writeRaw(async () => {
          const fresh = await local.get("shortcuts");
          const again = schema.bindShortcut(fresh.shortcuts, def.id, chord);
          if (!again.ok) throw new Error(again.error);
          await local.set({ shortcuts: again.value });
          store.shortcuts = again.value;
        }, item);
        if (ok) message.textContent = "";
        return ok;
      }
      change.addEventListener("click", () => {
        if (!editable || !ready) return;
        if (recording) { stop(); return; }
        recording = true;
        change.textContent = t("optKeyPress");
        change.setAttribute("aria-pressed", "true");
        item.classList.add("recording");
        message.textContent = t("optKeyRecording");
      });
      change.addEventListener("keydown", event => {
        if (!recording) return;
        if (event.key === "Tab") { stop(); return; }
        event.preventDefault();
        event.stopPropagation();
        if (event.key === "Escape") { stop(); return; }
        const chord = schema.chordFromEvent(event);
        if (!chord) return;
        stop(true);
        store_(chord);
      });
      change.addEventListener("blur", () => { if (recording) stop(); });
      clear.addEventListener("click", () => { if (editable && ready) store_(""); });
      restore.addEventListener("click", () => { if (editable && ready) store_(null); });
      updaters.push(() => {
        keycap.textContent = chordText(def.id);
        const custom = Object.prototype.hasOwnProperty.call(schema.normalizeShortcuts(store.shortcuts).map, def.id);
        change.disabled = !editable || !ready;
        clear.disabled = !editable || !ready || schema.effectiveShortcuts(store.shortcuts)[def.id] === "";
        restore.disabled = !editable || !ready || !custom;
      });
      return item;
    }

    // ---------------------------------------------------------------- backup, reset, sync
    function errorKey(code) {
      return { too_big: "popupBackupTooBig", bad_json: "popupBackupBadJson", bad_kind: "popupBackupBadKind",
        bad_version: "popupBackupBadVersion", bad_shape: "popupBackupBadShape" }[code] || "popupBackupReadError";
    }
    function formatValue(entry, value) {
      if (entry.type === "boolean") return onOff(value === true);
      if (entry.id === "theme") return t(THEME_LABEL[value] || "themeGreen");
      if (entry.id === "defaultSpeed") return value + "×";
      if (entry.id === "breakMins") return value === 0 ? t("popupBreakOff") : t("popupBreakMins", [String(value)]);
      if (entry.type === "bindings") return t("optKeysCount", [String(Object.keys((value && value.map) || {}).length)]);
      return String(value);
    }
    function changeList(changes, lists, extra) {
      const list = el("ul", "change-list");
      for (const change of changes) {
        const line = el("li", "", t(change.entry.label) + ": " + formatValue(change.entry, change.from) + " → " + formatValue(change.entry, change.to));
        list.appendChild(line);
      }
      for (const name of lists || []) list.appendChild(el("li", "", name));
      for (const text of extra || []) list.appendChild(el("li", "", text));
      if (!list.children.length) list.appendChild(el("li", "", t("optNoChanges")));
      return list;
    }
    function listSummary(next, names) {
      const out = [];
      if (names.indexOf("mute") !== -1) {
        const mute = schema.read(next, "mute");
        out.push(t("optListMute", [String(mute.words.length), String(mute.accounts.length)]));
      }
      if (names.indexOf("favorites") !== -1) {
        out.push(t("optListFavorites", [String(schema.normalizeValue("favorites", next.favorites).items.length)]));
      }
      return out;
    }

    function backupRow(entry) {
      const row = el("div", "setting compact-setting row stack-row");
      row.id = "row-" + entry.id;
      row.dataset.entry = entry.id;
      const ids = { label: "label-" + entry.id, desc: "desc-" + entry.id };
      row.appendChild(copyBlock(Object.assign({}, entry, { icon: "backup" }), ids));
      const lists = el("label", "check");
      const box = el("input");
      box.type = "checkbox";
      box.id = "backup-lists";
      lists.append(box, el("span", "", t("optBackupLists")));
      const actions = el("div", "row-actions");
      const exportButton = el("button", "btn", t("optExport"));
      exportButton.type = "button";
      exportButton.id = "backup-export";
      const importButton = el("button", "btn", t("optImport"));
      importButton.type = "button";
      importButton.id = "backup-import";
      actions.append(exportButton, importButton);
      row.append(lists, actions);
      exportButton.addEventListener("click", async () => {
        if (!ready) return;
        announce("");
        try {
          const fresh = await local.get(["cfg", "ui", "shortcuts", "favorites"]);
          backup.downloadBackup(buildBackupV2(fresh, { lists: box.checked }, { schema, now }));
          announce("popupBackupExported");
        } catch (_) { announce("popupBackupExportError"); }
      });
      importButton.addEventListener("click", async () => {
        if (!ready) return;
        announce("");
        let text;
        try { text = await backup.pickFile(); } catch (_) { announce("popupBackupReadError"); return; }
        if (text === null || text === undefined) return;
        const parsed = parseAnyBackup(text, { backup });
        if (!parsed.ok) { announce(errorKey(parsed.error)); return; }
        let plan;
        try { plan = planImport(await local.get(["cfg", "ui", "shortcuts", "favorites"]), parsed, { schema }); }
        catch (_) { announce("popupBackupReadError"); return; }
        const answer = await openDialog({
          title: t("optImportTitle"), desc: t("optImportDesc"),
          body: [changeList(plan.changes, listSummary(plan.next, plan.lists))],
          actions: [{ value: "apply", label: t("optImportApply"), accent: true }]
        });
        if (answer !== "apply") return;
        await writeRaw(async () => {
          await local.set(plan.writes);
          Object.assign(store, plan.writes);
        }, row, "popupBackupImported");
      });
      updaters.push(() => { exportButton.disabled = importButton.disabled = box.disabled = !ready; });
      return row;
    }

    function resetRow(entry) {
      const row = el("div", "setting compact-setting row");
      row.id = "row-" + entry.id;
      row.dataset.entry = entry.id;
      const ids = { label: "label-" + entry.id, desc: "desc-" + entry.id };
      row.appendChild(copyBlock(Object.assign({}, entry, { icon: "reset" }), ids));
      const button = el("button", "btn", t("optReset"));
      button.type = "button";
      button.id = "reset-button";
      row.appendChild(button);
      button.addEventListener("click", async () => {
        if (!ready) return;
        const fresh = await local.get(STORE_KEYS).catch(() => null);
        if (!fresh) { announce("popupStorageError"); return; }
        const plan = schema.resetPatch(fresh);
        const after = Object.assign({}, fresh, plan.set);
        for (const key of plan.remove) delete after[key];
        const changes = schema.differences(fresh, after, { filter: item => !item.personal && item.id !== "sync" });
        const extra = [];
        if (schema.read(fresh, "sync")) extra.push(t("optResetSyncOff"));
        if (Object.keys(schema.normalizeShortcuts(fresh.shortcuts).map).length) extra.push(t("optResetKeys"));
        const answer = await openDialog({
          title: t("optResetTitle"), desc: t("optResetDesc"),
          body: [changeList(changes, [], extra)],
          actions: [{ value: "reset", label: t("optReset"), danger: true }]
        });
        if (answer !== "reset") return;
        const wasSyncing = schema.read(fresh, "sync");
        await writeRaw(async () => {
          await local.set(plan.set);
          await local.remove(plan.remove);
          Object.assign(store, plan.set);
          for (const key of plan.remove) delete store[key];
          if (wasSyncing && syncCtx && syncApi) await syncApi.disable(syncCtx).catch(() => {});
        }, row, "optResetDone");
      });
      updaters.push(() => { button.disabled = !ready; });
      return row;
    }

    function syncRow(entry) {
      const wrap = el("div", "sync-area");
      const row = switchRow(Object.assign({}, entry, { icon: "sync" }), { onToggle: (next, node) => toggleSync(next, node) });
      const status = el("p", "description sync-status");
      status.id = "sync-status";
      status.setAttribute("role", "status");
      const retry = el("button", "row-action", t("optSyncRetry"));
      retry.type = "button";
      retry.id = "sync-retry";
      retry.hidden = true;
      retry.addEventListener("click", () => {
        if (!syncCtx || !syncApi) return;
        writeRaw(async () => {
          const state = await syncApi.reconcile(syncCtx, { force: true });
          store.syncState = state;
        }, wrap);
      });
      wrap.append(row, status, retry);
      updaters.push(() => {
        const state = syncApi ? syncApi.normalizeState(store.syncState) : { on: false, status: "off" };
        let text = t("optSyncOff");
        if (!syncCtx) text = t("optSyncUnavailable");
        else if (state.on && state.status === "synced") text = t("optSyncSynced");
        else if (state.on && state.status === "error") text = t("optSyncError", [t("optSyncError_" + (state.error || "write"))]);
        else if (state.on) text = t("optSyncPending");
        status.textContent = text;
        retry.hidden = !(state.on && state.status === "error");
        retry.disabled = !ready;
        if (!syncCtx) row.switchButton.disabled = true;
      });
      return wrap;
    }

    async function toggleSync(next, row) {
      if (!syncCtx || !syncApi) return;
      if (!next) {
        await writeRaw(async () => {
          const result = await syncApi.disable(syncCtx);
          const fresh = await local.get("syncState");
          store.syncState = fresh.syncState;
          if (!result.ok) throw new Error(result.error);
        }, row, "optSyncTurnedOff");
        return;
      }
      const consent = await openDialog({
        title: t("optSyncTitle"), desc: t("optSyncExplain"),
        body: [el("p", "description", t("optSyncScope"))],
        actions: [{ value: "on", label: t("optSyncEnable"), accent: true }]
      });
      if (consent !== "on") return;
      markBusy(row, true);
      let result;
      try { result = await queue(() => syncApi.enable(syncCtx)); }
      catch (_) { result = { ok: false, error: "write" }; }
      if (result.needsChoice) {
        const labels = result.diff.map(path => { const item = schema.get(path); return item ? t(item.label) : path; });
        const choice = await openDialog({
          title: t("optSyncChoiceTitle"), desc: t("optSyncChoiceDesc"),
          body: [changeList([], labels)],
          actions: [{ value: "local", label: t("optSyncUseLocal"), accent: true }, { value: "remote", label: t("optSyncUseRemote") }]
        });
        if (choice !== "local" && choice !== "remote") { markBusy(row, false); refresh(); return; }
        try { result = await queue(() => syncApi.enable(syncCtx, choice)); }
        catch (_) { result = { ok: false, error: "write" }; }
      }
      markBusy(row, false);
      try { Object.assign(store, await local.get(STORE_KEYS)); } catch (_) {}
      refresh();
      announce(result.ok ? "optSyncTurnedOn" : "optSyncFailed");
    }

    // ---------------------------------------------------------------- category rendering
    const content = doc.getElementById("content");
    const navList = doc.getElementById("nav-list");
    const navToggle = doc.getElementById("nav-toggle");
    const searchInput = doc.getElementById("search");
    const searchClear = doc.getElementById("search-clear");
    const searchStatus = doc.getElementById("search-status");
    let current = "privacy";
    let pendingFocus = null;
    const navLinks = {};

    function rowFor(entry) {
      switch (entry.id) {
        case "ghostMode": return ghostCard(entry);
        case "focusMode": return focusDisclosure(entry);
        case "seenPosts": return seenPostsRow(entry);
        case "mute": return muteRow(entry);
        case "favorites": return favoritesRow(entry);
        case "usage": return usageRow(entry);
        case "theme": return themeRow(entry);
        case "defaultSpeed": return selectRow(entry, value => value + "×");
        case "breakMins": return selectRow(entry, value => value === 0 ? t("popupBreakOff") : t("popupBreakMins", [String(value)]));
        case "shortcuts": return shortcutsEditor(entry);
        case "backup": return backupRow(entry);
        case "reset": return resetRow(entry);
        case "sync": return syncRow(entry);
        case "healthCheck": return healthRow(entry);
        case "audioMp3": return switchRow(entry, { onToggle: toggleAudioMp3 });
        default:
          if (entry.risk && entry.type === "boolean") return riskyRow(entry);
          if (entry.type === "enum" && ENUM_FORMATS[entry.id]) return selectRow(entry, ENUM_FORMATS[entry.id]);
          if (entry.type === "string") return textRow(entry);
          if (entry.type === "boolean") return switchRow(entry);
          if (entry.type === "action") return infoRow(entry, actionMeta(entry));
          return null;
      }
    }
    function healthRow(entry) {
      if (!healthApi || !healthLib) return null;
      return healthApi.createRow({
        doc, chrome: chromeApi, t, el, entry, lib: healthLib, locale, openDialog, announce,
        copyBlock, ready: () => ready, register: fn => updaters.push(fn),
        clipboard: env.clipboard || (win.navigator && win.navigator.clipboard) || { writeText: () => Promise.reject(new Error("clipboard")) },
        agent: env.userAgent || (win.navigator && win.navigator.userAgent) || ""
      });
    }
    // Children render inside their parent row.
    function isNested(entry) {
      if (!entry.parent) return false;
      const parent = schema.get(entry.parent);
      return !!parent && parent.category === entry.category;
    }

    function groupCard(category, group, list) {
      const card = el("section", "group");
      const titleKey = "setGroup" + group[0].toUpperCase() + group.slice(1);
      const heading = el("h3", "group-title", t(titleKey));
      heading.id = "group-" + category + "-" + group;
      card.setAttribute("aria-labelledby", heading.id);
      card.appendChild(heading);
      for (const entry of list) {
        const row = rowFor(entry);
        if (row) card.appendChild(row);
      }
      if (group === "health") { card.id = "health-card"; card.classList.add("status-card"); }
      if (category === "downloads" && group === "toolbar") card.appendChild(el("p", "note", t("popupIdm")));
      return card;
    }

    function renderCategory(id, focusHeading) {
      hideTip(true);
      updaters = [];
      const block = schema.byCategory().find(item => item.category.id === id) || schema.byCategory()[0];
      current = block.category.id;
      const section = el("section", "category");
      section.id = "cat-" + current;
      const heading = el("h2", "category-title");
      heading.id = "heading-" + current;
      heading.tabIndex = -1;
      heading.append(categoryIcon(current), el("span", "", t(block.category.label)));
      section.setAttribute("aria-labelledby", heading.id);
      section.appendChild(heading);
      const groups = [];
      for (const entry of block.entries) {
        if (isNested(entry)) continue;
        let group = groups.find(item => item.id === (entry.group || "main"));
        if (!group) { group = { id: entry.group || "main", list: [] }; groups.push(group); }
        group.list.push(entry);
      }
      let riskyEntries = [];
      for (const group of groups) {
        if (group.id === "ghost") { section.appendChild(rowFor(schema.get("ghostMode"))); continue; }
        if (group.id === "risky") { riskyEntries = group.list; continue; }
        const card = groupCard(current, group.id, group.list);
        if (group.list.some(entry => entry.risk)) card.classList.add("warning-card");
        section.appendChild(card);
      }
      // Container for the risky features (hidden while there are none).
      if (current === "tools") {
        const risky = el("section", "group warning-card");
        risky.id = "risky-block";
        risky.hidden = !riskyEntries.length;
        if (riskyEntries.length) {
          const title = el("h3", "group-title warning-head");
          title.id = "group-tools-risky";
          title.append(emblem("warning"), el("span", "", t("setGroupRisky")));
          risky.setAttribute("aria-labelledby", title.id);
          risky.append(title, el("p", "description sub-desc", t("riskIntro")));
          for (const entry of riskyEntries) risky.appendChild(rowFor(entry));
        }
        section.append(risky);
      }
      content.replaceChildren(section);
      for (const key of Object.keys(navLinks)) {
        if (key === current) navLinks[key].setAttribute("aria-current", "page");
        else navLinks[key].removeAttribute("aria-current");
      }
      const navCurrent = doc.getElementById("nav-current");
      if (navCurrent) navCurrent.textContent = t(block.category.label);
      refresh();
      const target = pendingFocus ? doc.getElementById(pendingFocus) : null;
      pendingFocus = null;
      if (target) target.focus();
      else if (focusHeading) heading.focus();
    }

    function renderNav() {
      navList.replaceChildren();
      for (const category of schema.CATEGORIES) {
        const item = el("li");
        const link = el("a", "nav-link");
        link.href = "#" + category.id;
        link.append(emblem(category.icon), el("span", "", t(category.label)));
        link.addEventListener("click", () => {
          if (searchInput.value) clearSearch(false);
          if (navToggle && navToggle.getAttribute("aria-expanded") === "true") setNavOpen(false);
          // Same hash: hashchange will not fire, so render here.
          if (("#" + category.id) === (win.location && win.location.hash)) renderCategory(category.id, true);
        });
        navLinks[category.id] = link;
        item.appendChild(link);
        navList.appendChild(item);
      }
    }
    function setNavOpen(open) {
      if (!navToggle) return;
      navToggle.setAttribute("aria-expanded", String(open));
      navList.dataset.open = String(open);
    }

    function categoryFromHash() {
      const hash = win.location && typeof win.location.hash === "string" ? win.location.hash.slice(1) : "";
      return schema.CATEGORY_IDS.indexOf(hash) !== -1 ? hash : "privacy";
    }

    // ---------------------------------------------------------------- search
    let index = null;
    let previous = null;
    let announceTimer = 0;
    function searchIndex() {
      if (!index) index = schema.createSearchIndex(bundle || fallbackBundle());
      return index;
    }
    // Without the packaged message files only the UI language is indexed.
    function fallbackBundle() {
      const table = {};
      for (const entry of schema.ENTRIES) {
        for (const key of [entry.label, entry.desc, entry.tip]) if (key) table[key] = { message: t(key) };
      }
      for (const category of schema.CATEGORIES) table[category.label] = { message: t(category.label) };
      return { [locale]: table };
    }
    function renderSearch(query) {
      hideTip(true);
      updaters = [];
      const result = searchIndex().search(query, locale);
      const section = el("section", "category search-results");
      section.id = "search-results";
      const heading = el("h2", "category-title", t("optResults"));
      heading.id = "heading-search";
      heading.tabIndex = -1;
      section.setAttribute("aria-labelledby", heading.id);
      section.appendChild(heading);
      if (!result.total) {
        const empty = el("div", "group empty");
        empty.appendChild(el("p", "", t("optNoResults")));
        const clear = el("button", "btn", t("optSearchClear"));
        clear.type = "button";
        clear.id = "no-results-clear";
        clear.addEventListener("click", () => clearSearch(true));
        empty.appendChild(clear);
        section.appendChild(empty);
      }
      for (const group of result.groups) {
        const card = el("section", "group");
        const title = el("h3", "group-title");
        title.id = "results-" + group.category.id;
        title.append(categoryIcon(group.category.id), el("span", "", t(group.category.label)));
        card.setAttribute("aria-labelledby", title.id);
        card.appendChild(title);
        const shown = new Set();
        for (const hit of group.results) {
          let entry = hit.entry;
          // A ghost switch shows inside its card; "Clear" shows with its switch.
          if (entry.parent === "ghostMode") entry = schema.get("ghostMode");
          if (entry.id === "seenPostsClear") entry = schema.get("seenPosts");
          if (shown.has(entry.id)) continue;
          shown.add(entry.id);
          const row = rowFor(entry);
          if (!row) continue;
          if (isNested(entry) && entry.parent !== "ghostMode") {
            const parent = schema.get(entry.parent);
            const context = el("p", "context", t("optInside", [t(parent.label)]));
            card.appendChild(context);
          }
          card.appendChild(row);
        }
        section.appendChild(card);
      }
      content.replaceChildren(section);
      for (const key of Object.keys(navLinks)) navLinks[key].removeAttribute("aria-current");
      refresh();
      if (win.clearTimeout) win.clearTimeout(announceTimer);
      const text = result.total ? t("optResultCount", [String(result.total)]) : t("optNoResults");
      if (win.setTimeout) announceTimer = win.setTimeout(() => { if (searchStatus) searchStatus.textContent = text; }, 400);
      else if (searchStatus) searchStatus.textContent = text;
      return result;
    }
    function onSearchInput() {
      const query = searchInput.value;
      searchClear.hidden = !query;
      if (query.trim()) {
        if (!previous) previous = { category: current, scroll: win.scrollY || 0 };
        renderSearch(query);
      } else clearSearch(false);
    }
    function clearSearch(restoreFocus) {
      searchInput.value = "";
      searchClear.hidden = true;
      if (searchStatus) searchStatus.textContent = "";
      const back = previous;
      previous = null;
      renderCategory(back ? back.category : current, false);
      if (back && typeof win.scrollTo === "function") win.scrollTo(0, back.scroll);
      if (restoreFocus) searchInput.focus();
    }

    // ---------------------------------------------------------------- header, theme
    const syncPill = doc.getElementById("sync-pill");
    function renderHeader() {
      if (syncPill) syncPill.hidden = !(ready && schema.read(store, "sync"));
    }
    let darkQuery = null;
    try { darkQuery = win.matchMedia ? win.matchMedia("(prefers-color-scheme: dark)") : null; } catch (_) {}
    function applyTheme() {
      if (!IY.themeVars) return;
      const mode = darkQuery && darkQuery.matches ? "dark" : "light";
      doc.documentElement.style.cssText = IY.themeVars(readValue("theme"), mode);
      doc.documentElement.dataset.theme = readValue("theme");
    }

    // ---------------------------------------------------------------- boot
    function localize() {
      doc.documentElement.lang = locale;
      doc.title = t("optPageTitle");
      for (const node of doc.querySelectorAll("[data-i18n]")) node.textContent = t(node.dataset.i18n);
      for (const node of doc.querySelectorAll("[data-i18n-label]")) node.setAttribute("aria-label", t(node.dataset.i18nLabel));
      for (const node of doc.querySelectorAll("[data-i18n-placeholder]")) node.setAttribute("placeholder", t(node.dataset.i18nPlaceholder));
    }

    async function load() {
      try {
        store = await local.get(STORE_KEYS);
        ready = true;
        const retry = doc.getElementById("load-retry");
        if (retry) retry.hidden = true;
        applyTheme();
        refresh();
      } catch (_) {
        ready = false;
        announce("optLoadError");
        const retry = doc.getElementById("load-retry");
        if (retry) retry.hidden = false;
        refresh();
      }
    }

    function start() {
      localize();
      renderNav();
      renderCategory(categoryFromHash(), false);
      if (win.addEventListener) {
        win.addEventListener("hashchange", () => {
          if (searchInput.value) { searchInput.value = ""; searchClear.hidden = true; previous = null; }
          renderCategory(categoryFromHash(), true);
        });
      }
      searchInput.addEventListener("input", onSearchInput);
      searchInput.addEventListener("keydown", event => {
        if (event.key === "Escape" && searchInput.value) { event.preventDefault(); clearSearch(true); }
      });
      searchClear.addEventListener("click", () => clearSearch(true));
      if (navToggle) navToggle.addEventListener("click", () => setNavOpen(navToggle.getAttribute("aria-expanded") !== "true"));
      const retry = doc.getElementById("load-retry");
      if (retry) retry.addEventListener("click", load);
      doc.addEventListener("click", event => {
        const target = event.target;
        if (!(target && target.closest && target.closest(".info-btn"))) hideTip(true);
      });
      doc.addEventListener("keydown", event => { if (event.key === "Escape" && activeTip) hideTip(true); });
      if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener("change", applyTheme);
      chromeApi.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local") return;
        let touched = false;
        for (const key of STORE_KEYS) {
          if (!changes[key]) continue;
          touched = true;
          if (changes[key].newValue === undefined) delete store[key]; else store[key] = changes[key].newValue;
        }
        if (!touched) return;
        if (changes.ui) applyTheme();
        refresh();
      });
      // Both locales feed the search index; failing that, the UI language alone.
      if (!bundle && typeof env.fetchMessages === "function") {
        env.fetchMessages().then(value => { if (value) { bundle = value; index = null; } }).catch(() => {});
      }
      return load();
    }

    return {
      start, renderCategory, renderSearch, clearSearch, get store() { return store; }, get ready() { return ready; },
      openDialog, t, locale
    };
  }

  function boot() {
    const chromeApi = globalThis.chrome;
    const app = createApp({
      document, window, chrome: chromeApi, IY: globalThis.IY,
      fetchMessages: async () => {
        const out = {};
        for (const name of ["tr", "en"]) {
          const response = await fetch(chromeApi.runtime.getURL("_locales/" + name + "/messages.json"));
          if (response.ok) out[name] = await response.json();
        }
        return out.tr || out.en ? out : null;
      }
    });
    app.start();
  }

  const api = { BACKUP_VERSION, buildBackupV2, parseAnyBackup, planImport, createApp };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else {
    globalThis.IY = Object.assign(globalThis.IY || {}, { options: api });
    if (typeof document !== "undefined" && document.getElementById("content")) boot();
  }
})();
