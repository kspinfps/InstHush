(function () {
  "use strict";

  const DEFAULT_TEMPLATE = "InstHush/{user}/{user}_{date}_{shortcode}_{index}";
  const LEGACY_TEMPLATE = "{user}_{date}_{shortcode}_{index}.{ext}";
  const MAX_SEGMENT_LENGTH = 180;
  const MAX_SEGMENT_BYTES = 255;
  const encoder = new TextEncoder();
  const token = /\{(user|date|time|shortcode|index|type|id|ext)\}/g;
  const reservedName = /^(?:con|prn|aux|nul|conin\$|conout\$|(?:com|lpt)[1-9¹²³]) *(?:\.|$)/i;

  function limitSegment(segment, extension = "") {
    if (segment.length <= MAX_SEGMENT_LENGTH && encoder.encode(segment).length <= MAX_SEGMENT_BYTES) return segment;
    const stem = extension ? segment.slice(0, -extension.length) : segment;
    const extensionBytes = encoder.encode(extension).length;
    let bytes = extensionBytes;
    let end = 0;
    for (const character of stem) {
      bytes += encoder.encode(character).length;
      if (bytes > MAX_SEGMENT_BYTES || end + character.length + extension.length > MAX_SEGMENT_LENGTH) break;
      end += character.length;
    }
    return stem.slice(0, end).replace(/[. ]+$/, "") + extension;
  }

  function sanitizeSegment(value, isFile) {
    let segment = value.replace(/[\\/\x00-\x1f\x7f<>:"|?*\uD800-\uDFFF]/gu, "_").replace(/^[. ]+|[. ]+$/g, "");
    if (!segment) return "";
    const extension = isFile ? /\.[a-z0-9]{1,16}$/i.exec(segment)?.[0] : "";
    segment = limitSegment(segment, extension);
    return reservedName.test(segment) ? limitSegment("_" + segment, extension) : segment;
  }

  function asDate(value) {
    if (value == null || value === "") return new Date(NaN);
    // Treat a date without a time zone or time of day as a local calendar day.
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(value + "T00:00:00");
    return new Date(value);
  }

  function renderFilename(template = DEFAULT_TEMPLATE, data = {}, { dateFormat = "YYYY-MM-DD" } = {}) {
    const { user, shortcode, index, type, id, ext, takenAt, isCarousel = false } = data;
    if (template === LEGACY_TEMPLATE) {
      const media = typeof module !== "undefined" && module.exports ? require("./media.js") : globalThis.IY;
      const seconds = takenAt ?? (asDate(data.date).getTime() / 1000);
      return media.buildFilename(user, shortcode, index, ext, isCarousel, seconds);
    }

    const date = asDate(data.date ?? (Number.isFinite(takenAt) ? takenAt * 1000 : undefined));
    const pad = value => String(value).padStart(2, "0");
    let dateStamp = "";
    let timeStamp = "";
    if (Number.isFinite(date.getTime())) {
      const parts = { YYYY: String(date.getFullYear()).padStart(4, "0"), MM: pad(date.getMonth() + 1), DD: pad(date.getDate()) };
      dateStamp = dateFormat.replace(/YYYY|MM|DD/g, part => parts[part]);
      timeStamp = [date.getHours(), date.getMinutes(), date.getSeconds()].map(pad).join("-");
    }

    const extension = String(ext ?? "").replace(/^\.+/, "");
    const values = { user, date: dateStamp, time: timeStamp, shortcode, index, type, id, ext: extension };
    // Split the template before expansion so values cannot create directories.
    const parts = template.replace(/^\/*[a-z]:/i, "").split("/").filter(part => part && !/^[. ]+$/.test(part));
    const fileTemplate = parts.pop() || "file";
    const expand = part => part.replace(token, (_, key) => String(values[key] ?? ""));
    const folders = parts.map(part => sanitizeSegment(expand(part), false)).filter(Boolean);
    const file = sanitizeSegment(expand(fileTemplate), true) || "file";
    const suffix = extension && !fileTemplate.includes("{ext}") ? "." + extension : "";
    return [...folders, sanitizeSegment(file + suffix, true)].join("/");
  }

  const api = { DEFAULT_TEMPLATE, LEGACY_TEMPLATE, renderFilename };
  globalThis.IY = Object.assign(globalThis.IY || {}, { filename: api });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
