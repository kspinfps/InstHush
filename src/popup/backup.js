(() => {
  "use strict";

  const MAX_BYTES = 256 * 1024;
  // Returned by pickFile for an oversized file; parseBackup maps it to too_big.
  const OVERSIZE = "\u0000too_big";
  function isPlainObject(value) {
    if (!value || typeof value !== "object") return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  const FORBIDDEN = ["__proto__", "constructor", "prototype"];
  function hasForbiddenKey(value, depth) {
    if (!value || typeof value !== "object") return false;
    if (depth > 32) return true;
    for (const key of Object.getOwnPropertyNames(value)) {
      if (FORBIDDEN.includes(key) || hasForbiddenKey(value[key], depth + 1)) return true;
    }
    return false;
  }

  // favorites.js is optional here: without it a backup simply carries no favorites.
  function favoritesApi() {
    const api = globalThis.IY?.favorites;
    return api && typeof api.normalize === "function" ? api : null;
  }

  function buildBackup(store) {
    const result = {
      app: "InstHush", kind: "settings", version: 1,
      exportedAt: new Date().toISOString(),
      ui: isPlainObject(store?.ui) ? JSON.parse(JSON.stringify(store.ui)) : {}
    };
    const favorites = favoritesApi();
    if (favorites && store && typeof store === "object" && Object.prototype.hasOwnProperty.call(store, "favorites")) {
      result.favorites = favorites.normalize(store.favorites);
    }
    return result;
  }

  function parseBackup(text) {
    if (typeof text !== "string") return { ok: false, error: "bad_json" };
    if (text === OVERSIZE || text.length > MAX_BYTES || new TextEncoder().encode(text).byteLength > MAX_BYTES) {
      return { ok: false, error: "too_big" };
    }
    let value;
    try { value = JSON.parse(text); }
    catch { return { ok: false, error: "bad_json" }; }
    if (!isPlainObject(value)) return { ok: false, error: "bad_shape" };
    if (value.app !== "InstHush" || value.kind !== "settings") return { ok: false, error: "bad_kind" };
    if (value.version !== 1) return { ok: false, error: "bad_version" };
    if (!isPlainObject(value.ui) || hasForbiddenKey(value, 0)) return { ok: false, error: "bad_shape" };
    const result = { ok: true, ui: value.ui };
    // Optional: older backups have no favorites and leave the current list untouched.
    if (Object.prototype.hasOwnProperty.call(value, "favorites")) {
      const raw = value.favorites, favorites = favoritesApi();
      if (!favorites || !isPlainObject(raw) || raw.v !== 1 || !Array.isArray(raw.items)) return { ok: false, error: "bad_shape" };
      result.favorites = favorites.normalize(raw);
    }
    return result;
  }

  function mergeImported(currentUi, importedUi, normalise) {
    // A backup replaces settings; omitted/invalid values use the popup defaults.
    return normalise(importedUi);
  }

  function downloadBackup(obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2) + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    try {
      anchor.href = url;
      anchor.download = "insthush-settings-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + ".json";
      anchor.hidden = true;
      document.body.appendChild(anchor);
      anchor.click();
    } finally {
      anchor.remove();
      // Let the browser consume the download URL before releasing it.
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
  }

  function pickFile() {
    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";
      input.hidden = true;
      input.addEventListener("change", async () => {
        try {
          const file = input.files?.[0];
          if (file && typeof file.size === "number" && file.size > MAX_BYTES) { resolve(OVERSIZE); return; }
          resolve(file ? await file.text() : null);
        } catch (error) { reject(error); }
        finally { input.remove(); }
      }, { once: true });
      input.addEventListener("cancel", () => { input.remove(); resolve(null); }, { once: true });
      try { document.body.appendChild(input); input.click(); }
      catch (error) { input.remove(); reject(error); }
    });
  }

  const api = { OVERSIZE, buildBackup, parseBackup, mergeImported, downloadBackup, pickFile };
  globalThis.IY = Object.assign(globalThis.IY || {}, { backup: api });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
