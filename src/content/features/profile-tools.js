// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
// Copyright jewdev
(function () {
  "use strict";

  const iy = globalThis.IY = globalThis.IY || {};
  const TRIGGER_CSS = `
    button {
      position: fixed; right: 20px; bottom: calc(74px + env(safe-area-inset-bottom));
      z-index: 2147483000; max-width: calc(100vw - 40px); min-height: 40px;
      padding: 8px 12px; border-radius: 10px; cursor: pointer;
      font: 600 13px/1.3 system-ui, sans-serif; color: var(--iy-text);
      background: var(--iy-surface-raised); border: 1px solid var(--iy-track-outline, currentColor);
      box-shadow: 0 4px 16px #0003;
    }
    button:hover { background: var(--iy-hover, var(--iy-surface)); }
    button:focus-visible { outline: 2px solid var(--iy-accent-text, currentColor); outline-offset: 2px; }
    @media (max-width: 767px) { button { bottom: calc(128px + env(safe-area-inset-bottom)); } }
    @media (forced-colors: active) { button:focus-visible { outline-color: Highlight; } }
  `;

  function sourceFor(path, ui, lib = iy) {
    const route = lib.resolve.parseRoute(path);
    if (route.kind !== "profile" || !lib.isValidUsername(route.username)) return null;
    const parts = path.split("/").filter(Boolean);
    if (route.saved) {
      if (ui?.bulkSaved !== true || parts.length > 4 ||
          (parts.length === 3 && parts[2] !== "all-posts") ||
          (parts.length === 4 && !/^\d{1,40}$/.test(parts[3]))) return null;
      return { scope: "saved", username: route.username, collection: route.saved };
    }
    if (ui?.bulkProfile !== true || parts.length > 2 ||
        (parts[1] && !["reels", "tagged", "channel", "guides"].includes(parts[1]))) return null;
    return { scope: "profile", username: route.username };
  }

  function visibleCollections(doc, location, source, lib = iy) {
    const collections = new Map();
    for (const link of doc.querySelectorAll('main a[href*="/saved/"]')) {
      let url;
      try { url = new URL(link.href, location.href); } catch (_) { continue; }
      if (url.origin !== location.origin) continue;
      const target = sourceFor(url.pathname, { bulkSaved: true }, lib);
      if (!target?.collection || target.collection === "all" ||
          target.username.toLowerCase() !== source.username.toLowerCase()) continue;
      const name = (link.getAttribute("aria-label") || link.textContent || "").trim().slice(0, 100);
      if (name) collections.set(target.collection, name);
    }
    if (source.collection !== "all" && !collections.has(source.collection)) collections.set(source.collection, "");
    return collections;
  }

  function register(lib = iy, env = globalThis) {
    let ui;
    let trigger;
    let button;
    let modal;
    let routeKey;

    function removeTrigger() {
      trigger?.destroy();
      trigger = button = undefined;
    }

    function closeModal() {
      modal?.close();
      modal = undefined;
    }

    function currentSource() {
      return sourceFor(env.location.pathname, ui, lib);
    }

    function key(source) {
      return source && [source.scope, source.username.toLowerCase(), source.collection].join("/");
    }

    function open() {
      const source = currentSource();
      if (!source || key(source) !== routeKey || modal) return;
      if (source.scope === "saved") source.collections = visibleCollections(env.document, env.location, source, lib);
      modal = lib.bulkDownload.openModal(source, {
        opener: button, settings: ui, document: env.document, onClose: () => { modal = undefined; }
      });
    }

    function refresh() {
      const source = currentSource();
      const nextKey = key(source);
      if (!source) removeTrigger();
      if (routeKey !== nextKey) closeModal();
      routeKey = nextKey;
      if (!source) return;
      if (!trigger?.host.isConnected) {
        removeTrigger();
        button = env.document.createElement("button");
        button.type = "button";
        button.setAttribute("aria-haspopup", "dialog");
        button.addEventListener("click", lib.core.bind(open));
        trigger = lib.bulkDownload.createHost(env.document, button, TRIGGER_CSS, ui?.theme);
      }
      const label = lib.bulkDownload.labels()[source.scope];
      if (button.textContent !== label) button.textContent = label;
      trigger.updateTheme(ui?.theme);
      modal?.setTheme(ui?.theme);
    }

    lib.core.feature("bulkDownload", {
      keys: ["ui"],
      enabled: ({ ui }) => ui?.bulkProfile === true || ui?.bulkSaved === true,
      start(settings) {
        ui = settings.ui;
        lib.core.route(refresh);
        refresh();
      },
      update(settings) {
        ui = settings.ui;
        refresh();
      },
      stop() {
        removeTrigger();
        closeModal();
        routeKey = ui = undefined;
      }
    });
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { sourceFor, visibleCollections, register };
  else register();
})();
