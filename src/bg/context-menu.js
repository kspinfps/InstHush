// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
// Background context menu controller for "InstHush ile indir" / "Download with InstHush".
// Syncs dynamically with chrome.storage.local["ui"].contextMenu and messages the active tab on click.
(function () {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;

  var MENU_ID = "iy-context-download";
  var MESSAGE_CONTEXT_DOWNLOAD = "iy:context-download";
  var CONTEXTS = Object.freeze(["page", "image", "video", "link"]);
  var DOCUMENT_URL_PATTERNS = Object.freeze(["https://www.instagram.com/*"]);

  var STRINGS = {
    tr: {
      contextMenuDownload: "InstHush ile indir"
    },
    en: {
      contextMenuDownload: "Download with InstHush"
    }
  };

  function fallbackText(key, lang) {
    var l = String(lang || "tr").trim().toLowerCase();
    var table = l.indexOf("en") === 0 ? STRINGS.en : STRINGS.tr;
    return table[key] || STRINGS.tr[key] || STRINGS.en[key] || "";
  }

  function menuTitle(chromeApi, langOverride) {
    try {
      if (!langOverride && chromeApi && chromeApi.i18n && typeof chromeApi.i18n.getMessage === "function") {
        var msg = chromeApi.i18n.getMessage("contextMenuDownload");
        if (msg) return msg;
      }
    } catch (_) {}
    var uiLang = langOverride;
    if (!uiLang) {
      try {
        if (chromeApi && chromeApi.i18n && typeof chromeApi.i18n.getUILanguage === "function") {
          uiLang = chromeApi.i18n.getUILanguage();
        }
      } catch (_) {}
    }
    return fallbackText("contextMenuDownload", uiLang || "tr");
  }

  function isContextMenuEnabled(ui, cfg) {
    if (ui && typeof ui === "object" && ui.contextMenu === false) return false;
    if (cfg && typeof cfg === "object" && cfg.contextMenu === false) return false;
    return true;
  }

  function isInstagramTabUrl(url) {
    if (typeof url !== "string" || !url) return true;
    try {
      var parsed = new URL(url);
      if (parsed.protocol !== "https:") return false;
      var host = parsed.hostname.toLowerCase();
      return host === "www.instagram.com" || host === "instagram.com" || host.endsWith(".instagram.com");
    } catch (_) {
      return false;
    }
  }

  function installContextMenu(chromeApi, options) {
    var api = chromeApi || (typeof chrome !== "undefined" ? chrome : null);
    var opts = options || {};
    if (!api || !api.contextMenus || typeof api.contextMenus.removeAll !== "function") {
      return null;
    }

    var disposed = false;
    var lastEnabled;
    var syncSeq = 0;
    var storageSeq = 0;

    function clearLastError() {
      try {
        if (api.runtime) void api.runtime.lastError;
      } catch (_) {}
    }

    function sync(enabled, force) {
      if (disposed) return;
      var next = Boolean(enabled);
      if (!force && next === lastEnabled) return;
      lastEnabled = next;
      var mySeq = ++syncSeq;

      try {
        api.contextMenus.removeAll(function () {
          clearLastError();
          if (disposed || mySeq !== syncSeq || !next) return;
          try {
            api.contextMenus.create({
              id: MENU_ID,
              title: menuTitle(api, opts.lang),
              contexts: CONTEXTS.slice(),
              documentUrlPatterns: DOCUMENT_URL_PATTERNS.slice()
            }, function () {
              clearLastError();
            });
          } catch (_) {}
        });
      } catch (_) {}
    }

    function refresh(force) {
      if (disposed) return;
      if (!api.storage || !api.storage.local || typeof api.storage.local.get !== "function") {
        sync(true, Boolean(force));
        return;
      }
      var rev = storageSeq;
      try {
        api.storage.local.get(["ui", "cfg"], function (saved) {
          clearLastError();
          if (disposed || rev !== storageSeq) return;
          var ui = saved && saved.ui;
          var cfg = saved && saved.cfg;
          sync(isContextMenuEnabled(ui, cfg), Boolean(force));
        });
      } catch (_) {
        sync(true, Boolean(force));
      }
    }

    function handleClick(info, tab) {
      if (disposed || lastEnabled === false) return false;
      if (!info || info.menuItemId !== MENU_ID) return false;
      if (!tab || typeof tab.id !== "number") return false;
      if (tab.url && !isInstagramTabUrl(tab.url)) return false;
      if (info.pageUrl && !isInstagramTabUrl(info.pageUrl)) return false;
      if (!api.tabs || typeof api.tabs.sendMessage !== "function") return false;

      var payload = {
        type: MESSAGE_CONTEXT_DOWNLOAD,
        mediaType: typeof info.mediaType === "string" ? info.mediaType : null,
        srcUrl: typeof info.srcUrl === "string" ? info.srcUrl : null,
        linkUrl: typeof info.linkUrl === "string" ? info.linkUrl : null,
        pageUrl: typeof info.pageUrl === "string" ? info.pageUrl : null
      };

      try {
        var maybePromise = api.tabs.sendMessage(tab.id, payload, function () {
          clearLastError();
        });
        if (maybePromise && typeof maybePromise.catch === "function") {
          maybePromise.catch(function () {});
        }
        return true;
      } catch (_) {
        return false;
      }
    }

    function onStorageChanged(changes, area) {
      if (disposed || area !== "local" || !changes) return;
      if (!Object.prototype.hasOwnProperty.call(changes, "ui") &&
          !Object.prototype.hasOwnProperty.call(changes, "cfg")) {
        return;
      }
      storageSeq++;
      var nextUi = Object.prototype.hasOwnProperty.call(changes, "ui")
        ? changes.ui && changes.ui.newValue
        : undefined;
      var nextCfg = Object.prototype.hasOwnProperty.call(changes, "cfg")
        ? changes.cfg && changes.cfg.newValue
        : undefined;
      sync(isContextMenuEnabled(nextUi, nextCfg), false);
    }

    function onInstalled() {
      refresh(true);
    }

    function onStartup() {
      refresh(true);
    }

    if (api.contextMenus.onClicked && typeof api.contextMenus.onClicked.addListener === "function") {
      api.contextMenus.onClicked.addListener(handleClick);
    }
    if (api.storage && api.storage.onChanged && typeof api.storage.onChanged.addListener === "function") {
      api.storage.onChanged.addListener(onStorageChanged);
    }
    if (api.runtime && api.runtime.onInstalled && typeof api.runtime.onInstalled.addListener === "function") {
      api.runtime.onInstalled.addListener(onInstalled);
    }
    if (api.runtime && api.runtime.onStartup && typeof api.runtime.onStartup.addListener === "function") {
      api.runtime.onStartup.addListener(onStartup);
    }

    if (opts.autoSync !== false) {
      refresh(true);
    }

    function destroy() {
      if (disposed) return;
      disposed = true;
      syncSeq++;
      if (api.contextMenus.onClicked && typeof api.contextMenus.onClicked.removeListener === "function") {
        api.contextMenus.onClicked.removeListener(handleClick);
      }
      if (api.storage && api.storage.onChanged && typeof api.storage.onChanged.removeListener === "function") {
        api.storage.onChanged.removeListener(onStorageChanged);
      }
      if (api.runtime && api.runtime.onInstalled && typeof api.runtime.onInstalled.removeListener === "function") {
        api.runtime.onInstalled.removeListener(onInstalled);
      }
      if (api.runtime && api.runtime.onStartup && typeof api.runtime.onStartup.removeListener === "function") {
        api.runtime.onStartup.removeListener(onStartup);
      }
      try {
        api.contextMenus.removeAll(function () { clearLastError(); });
      } catch (_) {}
    }

    return {
      sync: sync,
      refresh: refresh,
      handleClick: handleClick,
      onStorageChanged: onStorageChanged,
      isEnabled: function () { return lastEnabled !== false; },
      destroy: destroy
    };
  }

  var exported = {
    MENU_ID: MENU_ID,
    MESSAGE_CONTEXT_DOWNLOAD: MESSAGE_CONTEXT_DOWNLOAD,
    CONTEXTS: CONTEXTS,
    DOCUMENT_URL_PATTERNS: DOCUMENT_URL_PATTERNS,
    STRINGS: STRINGS,
    fallbackText: fallbackText,
    menuTitle: menuTitle,
    isContextMenuEnabled: isContextMenuEnabled,
    isInstagramTabUrl: isInstagramTabUrl,
    installContextMenu: installContextMenu,
    instance: null
  };

  globalThis.IY = globalThis.IY || {};
  globalThis.IY.bgContextMenu = exported;

  if (isNode) {
    module.exports = exported;
  } else if (typeof chrome !== "undefined" && chrome && chrome.contextMenus) {
    exported.instance = installContextMenu(chrome);
  }
})();
