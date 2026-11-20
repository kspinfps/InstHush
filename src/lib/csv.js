// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
// Copyright jewdev
(function () {
  "use strict";

  function csvCell(value) {
    const text = value == null ? "" : String(value);
    const guarded = /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
    return '"' + guarded.replace(/"/g, '""') + '"';
  }

  function writeCsv(rows) {
    return "\uFEFF" + rows.map(row => Array.from(row, csvCell).join(",")).join("\r\n");
  }

  const api = { csvCell, writeCsv };
  globalThis.IY = Object.assign(globalThis.IY || {}, { csv: api });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
