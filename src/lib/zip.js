(function () {
  "use strict";

  const MAX_BYTES = 0xffffffff;
  const MAX_ENTRIES = 0xffff;
  const LOCAL_SIZE = 30;
  const CENTRAL_SIZE = 46;
  const END_SIZE = 22;
  const encoder = new TextEncoder();
  let crcTable;

  function crc32(bytes) {
    if (!crcTable) {
      crcTable = new Uint32Array(256);
      for (let i = 0; i < crcTable.length; i++) {
        let crc = i;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
        crcTable[i] = crc;
      }
    }
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 0xff];
    return (crc ^ 0xffffffff) >>> 0;
  }

  function safeName(name) {
    return name.replace(/\\/g, "/").replace(/^\/*[a-z]:/i, "").split("/")
      .map(segment => segment.replace(/[\x00-\x1f\x7f<>:"|?*\uD800-\uDFFF]/gu, "_").replace(/[. ]+$/, ""))
      .filter(Boolean)
      .map(segment => /^(?:con|prn|aux|nul|conin\$|conout\$|(?:com|lpt)[1-9¹²³]) *(?:\.|$)/i.test(segment)
        ? "_" + segment : segment)
      .join("/") || "file";
  }

  function uniqueName(name, used, nextSuffix) {
    const key = name.normalize("NFC").toLowerCase();
    if (!used.has(key)) {
      used.add(key);
      return name;
    }
    const dot = name.lastIndexOf(".");
    const extensionAt = dot > name.lastIndexOf("/") + 1 ? dot : name.length;
    const stem = name.slice(0, extensionAt);
    const extension = name.slice(extensionAt);
    let number = nextSuffix.get(key) || 2;
    let candidate;
    let candidateKey;
    do {
      candidate = `${stem} (${number++})${extension}`;
      candidateKey = candidate.normalize("NFC").toLowerCase();
    } while (used.has(candidateKey));
    nextSuffix.set(key, number);
    used.add(candidateKey);
    return candidate;
  }

  function dosStamp(value) {
    const date = value == null ? new Date(NaN) : new Date(value);
    const year = date.getFullYear();
    if (!Number.isFinite(year) || year < 1980) return { day: 33, time: 0 };
    if (year > 2107) return { day: 0xff9f, time: 0xbf7d };
    return {
      day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >>> 1)
    };
  }

  function writeEntryFields(view, offset, entry) {
    view.setUint16(offset, 20, true); // Version needed to extract.
    view.setUint16(offset + 2, 0x0800, true); // UTF-8 filename.
    view.setUint16(offset + 6, entry.time, true);
    view.setUint16(offset + 8, entry.day, true);
    view.setUint32(offset + 10, entry.crc, true);
    view.setUint32(offset + 14, entry.bytes.length, true);
    view.setUint32(offset + 18, entry.bytes.length, true);
    view.setUint16(offset + 22, entry.name.length, true);
  }

  function createZip(entries) {
    if (!Array.isArray(entries)) throw new TypeError("ZIP entries must be an array");
    if (entries.length > MAX_ENTRIES) throw new RangeError("ZIP supports at most 65,535 entries without ZIP64");

    const used = new Set();
    const nextSuffix = new Map();
    let localBytes = 0;
    let centralBytes = 0;
    const records = [];
    for (const entry of entries) {
      if (!entry || typeof entry.name !== "string" || !(entry.bytes instanceof Uint8Array)) {
        throw new TypeError("Each ZIP entry requires a name and Uint8Array bytes");
      }
      const name = encoder.encode(uniqueName(safeName(entry.name), used, nextSuffix));
      if (name.length > MAX_ENTRIES) throw new RangeError("ZIP entry name exceeds 65,535 UTF-8 bytes");
      const offset = localBytes;
      localBytes += LOCAL_SIZE + name.length + entry.bytes.length;
      centralBytes += CENTRAL_SIZE + name.length;
      if (localBytes + centralBytes + END_SIZE > MAX_BYTES) {
        throw new RangeError("ZIP archive exceeds the 4 GiB limit without ZIP64");
      }
      records.push({ name, bytes: entry.bytes, offset, ...dosStamp(entry.date) });
    }

    const blobParts = typeof Blob === "function" ? [] : null;
    const output = blobParts ? null : new Uint8Array(localBytes + centralBytes + END_SIZE);
    let written = 0;
    function append(...parts) {
      if (blobParts) {
        // Snapshot one entry at a time. The final Blob joins these immutable parts.
        blobParts.push(new Blob(parts));
      } else {
        for (const part of parts) {
          output.set(part, written);
          written += part.length;
        }
      }
    }

    for (const entry of records) {
      entry.crc = crc32(entry.bytes);
      const header = new Uint8Array(LOCAL_SIZE);
      const view = new DataView(header.buffer);
      view.setUint32(0, 0x04034b50, true);
      writeEntryFields(view, 4, entry);
      append(header, entry.name, entry.bytes);
    }
    for (const entry of records) {
      const header = new Uint8Array(CENTRAL_SIZE);
      const view = new DataView(header.buffer);
      view.setUint32(0, 0x02014b50, true);
      view.setUint16(4, 20, true); // Version made by, MS-DOS attributes.
      writeEntryFields(view, 6, entry);
      view.setUint32(42, entry.offset, true);
      append(header, entry.name);
    }
    const end = new Uint8Array(END_SIZE);
    const view = new DataView(end.buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(8, records.length, true);
    view.setUint16(10, records.length, true);
    view.setUint32(12, centralBytes, true);
    view.setUint32(16, localBytes, true);
    append(end);
    return blobParts ? new Blob(blobParts, { type: "application/zip" }) : output;
  }

  const api = { createZip };
  globalThis.IY = Object.assign(globalThis.IY || {}, { zip: api });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
