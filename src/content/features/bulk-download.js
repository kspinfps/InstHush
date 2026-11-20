// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
// Copyright jewdev
(function () {
  "use strict";

  const iy = globalThis.IY = globalThis.IY || {};
  const isNode = typeof module !== "undefined" && module.exports;
  const download = isNode ? require("../core/download.js") : iy.download;
  const filename = isNode ? require("../../lib/filename.js") : iy.filename;
  const csv = isNode ? require("../../lib/csv.js") : iy.csv;
  const zip = isNode ? require("../../lib/zip.js") : iy.zip;
  const media = isNode ? require("../../lib/media.js") : iy;
  const MAX_POSTS = 100000;
  const KINDS = ["photo", "video", "reel"];
  const MIN_DELAY_MS = 1500;
  const JITTER_MS = 2000;
  const PAUSE_EVERY = 10;
  const REST_MS = 10000;
  const ZIP_END_SIZE = 22;
  const MAX_ZIP_BYTES = 0xffffffff;
  const MAX_ZIP_ENTRIES = 0xffff;

  function abortableDelay(ms, signal) {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", abort);
        resolve();
      }, ms);
      function abort() {
        clearTimeout(timer);
        reject(signal.reason);
      }
      signal.addEventListener("abort", abort, { once: true });
    });
  }

  function createJobControls() {
    const controller = new AbortController();
    const { signal } = controller;
    let resume;
    let pause;

    function setPaused(paused) {
      if (paused && !pause) {
        pause = new Promise(resolve => { resume = resolve; });
      } else if (!paused && pause) {
        resume();
        pause = resume = undefined;
      }
    }
    signal.addEventListener("abort", () => setPaused(false), { once: true });

    async function ready() {
      while (pause) await pause;
      signal.throwIfAborted();
    }
    return { signal, ready, setPaused, isPaused: () => Boolean(pause), cancel: () => controller.abort() };
  }

  async function checkCooldown(api, signal) {
    signal.throwIfAborted();
    const remainingMs = await api.cooldownLeft();
    signal.throwIfAborted();
    if (remainingMs > 0) {
      throw new api.ApiError("Instagram requests are paused", 429,
        { code: "rate_limited", rateLimited: true, remainingMs });
    }
  }

  async function beforeRequest(api, controls) {
    do {
      await controls.ready();
      await checkCooldown(api, controls.signal);
    } while (controls.isPaused());
  }

  function fail(code) {
    return Object.assign(new Error(code), { code });
  }

  function utcDay(value) {
    const ms = Date.parse(value + "T00:00:00Z");
    return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? ms / 1000 : NaN;
  }

  function dates(from, to) {
    const since = from ? utcDay(from) : -Infinity;
    const until = to ? utcDay(to) + 86400 : Infinity;
    if (Number.isNaN(since) || Number.isNaN(until) || until <= since) throw fail("invalid_dates");
    return { since, until, restricted: Boolean(from || to) };
  }

  // Guard formulas that a spreadsheet might trim before evaluation as well.
  function csvText(value) {
    return /^[\s\x00-\x1f]+[=+\-@]/u.test(value || "") ? "'" + value : value;
  }

  function csvFor(posts, kinds) {
    const rows = [["link", "username", "date", "type", "files", "caption"]];
    for (const post of posts) {
      const date = new Date(post.takenAt * 1000);
      const section = post.kind === "reel" ? "reel" : "p";
      const link = /^[a-z0-9_-]{1,64}$/i.test(post.shortcode || "")
        ? `https://www.instagram.com/${section}/${post.shortcode}/` : "";
      rows.push([link, csvText(post.username), post.takenAt > 0 && Number.isFinite(date.getTime()) ? date.toISOString() : "",
        post.kind, post.itemKinds.filter(kind => kinds.has(kind)).length, csvText(post.caption)]);
    }
    return csv.writeCsv(rows);
  }

  async function collectPosts(options, { api, controls, onProgress, delay, random }) {
    const profile = options.scope === "profile";
    const max = profile ? options.limit : Infinity;
    const { signal } = controls;
    const posts = [];
    const seenPosts = new Set();
    const seenCursors = new Set();
    let nonPinned = 0;
    let cursor;
    let pages = 0;

    do {
      await beforeRequest(api, controls);
      const page = profile
        ? await api.getProfilePostsPage(options.username, cursor, { signal })
        : await api.getSavedPostsPage(options.collection, cursor, { signal });
      signal.throwIfAborted();
      for (const post of page.posts) {
        const keys = [post.id && "id:" + post.id, post.shortcode && "code:" + post.shortcode].filter(Boolean);
        const duplicate = keys.some(key => seenPosts.has(key));
        for (const key of keys) seenPosts.add(key);
        if (duplicate) continue;
        posts.push(post);
        if (!post.pinned) nonPinned++;
      }
      onProgress({ phase: "scan", done: Math.min(posts.length, max), total: profile ? max : undefined });
      pages++;
      cursor = page.next;
      if (cursor) {
        if (seenCursors.has(cursor)) throw fail("invalid_response");
        seenCursors.add(cursor);
      }
      if (!cursor || nonPinned >= max) break;
      const rest = pages % PAUSE_EVERY === 0 ? REST_MS : 0;
      await delay(MIN_DELAY_MS + Math.floor(random() * JITTER_MS) + rest, signal);
    } while (true);

    return profile ? posts.sort((a, b) => b.takenAt - a.takenAt).slice(0, max) : posts;
  }

  function selectedEntries(posts, kinds, template) {
    const entries = [];
    for (const post of posts) {
      const indices = post.items.flatMap((_, index) => kinds.has(post.itemKinds[index]) ? [index] : []);
      entries.push(...download.buildEntriesForPost(post, { indices, template }));
    }
    return entries;
  }

  function uniqueZipName(name, used, suffixes) {
    const key = name.normalize("NFC").toLowerCase();
    if (!used.has(key)) {
      used.add(key);
      return name;
    }
    const slash = name.lastIndexOf("/") + 1;
    const extension = /(\.[a-z0-9]{1,16})$/i.exec(name)?.[1] || "";
    const stem = name.slice(slash, name.length - extension.length);
    let counter = suffixes.get(key) || 2;
    let candidate;
    let candidateKey;
    do {
      const leaf = filename.renderFilename("{id}" + (extension ? ".{ext}" : ""),
        { id: `(${counter++}) ${stem}`, ext: extension });
      candidate = name.slice(0, slash) + leaf;
      candidateKey = candidate.normalize("NFC").toLowerCase();
    } while (used.has(candidateKey));
    suffixes.set(key, counter);
    used.add(candidateKey);
    return candidate;
  }

  async function fetchMedia(entry, { api, fetchMediaResponse, signal }) {
    if (!media.isAllowedCdn(entry.url)) throw fail("file_error");
    const response = await fetchMediaResponse(entry.url, {
      signal, credentials: "omit", redirect: "error", referrerPolicy: "no-referrer"
    });
    if (response.status === 429 || api.isChallengeUrl?.(response.url)) {
      await api.startCooldown();
      const challenge = response.status !== 429;
      throw new api.ApiError("Instagram blocked requests", response.status,
        { code: challenge ? "challenge" : "rate_limited", rateLimited: true });
    }
    if (!response.ok || /^text\/(?:html|plain)\b/i.test(response.headers?.get("content-type") || "")) {
      throw fail("file_error");
    }
    const buffer = await response.arrayBuffer();
    signal.throwIfAborted();
    if (!buffer.byteLength) throw fail("file_error");
    return new Uint8Array(buffer);
  }

  async function buildArchive(entries, { api, controls, onProgress, fetchMediaResponse }) {
    if (entries.length > MAX_ZIP_ENTRIES) throw fail("zip_size");
    const { signal } = controls;
    const locals = [];
    const directory = [];
    const used = new Set();
    const suffixes = new Map();
    let offset = 0;
    let directorySize = 0;

    for (const entry of entries) {
      await beforeRequest(api, controls);
      const name = uniqueZipName(entry.filename, used, suffixes);
      // Reuse the ZIP library's STORE records and CRC. Retain only immutable Blob slices
      // plus central records, and patch each record's offset for its position in the final ZIP.
      let chunk;
      try {
        chunk = zip.createZip([{ name, date: entry.date,
          bytes: await fetchMedia(entry, { api, fetchMediaResponse, signal }) }]);
      } catch (error) {
        if (error instanceof RangeError) throw fail("zip_size");
        throw error;
      }
      const endOffset = chunk.size - ZIP_END_SIZE;
      const end = new DataView(await chunk.slice(endOffset).arrayBuffer());
      const size = end.getUint32(12, true);
      const localSize = end.getUint32(16, true);
      if (end.getUint32(0, true) !== 0x06054b50 || localSize + size !== endOffset) throw fail("file_error");
      if (offset + localSize + directorySize + size + ZIP_END_SIZE > MAX_ZIP_BYTES) throw fail("zip_size");
      const central = await chunk.slice(localSize, endOffset).arrayBuffer();
      signal.throwIfAborted();
      new DataView(central).setUint32(42, offset, true);
      locals.push(chunk.slice(0, localSize));
      directory.push(central);
      offset += localSize;
      directorySize += size;
      onProgress({ phase: "zip", done: locals.length, total: entries.length });
    }

    await controls.ready();
    const end = new DataView(new ArrayBuffer(ZIP_END_SIZE));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, entries.length, true);
    end.setUint16(10, entries.length, true);
    end.setUint32(12, directorySize, true);
    end.setUint32(16, offset, true);
    return new Blob([...locals, ...directory, end.buffer], { type: "application/zip" });
  }

  async function queueFiles(entries, { api, controls, onProgress, createDownloadJob }) {
    const { signal } = controls;
    let queued = 0;
    let failed = 0;
    let flatNames = false;

    async function submit(entry) {
      const job = createDownloadJob([entry], { mode: "separate" });
      const cancel = () => job.cancel();
      signal.addEventListener("abort", cancel, { once: true });
      try {
        const result = await job.start();
        signal.throwIfAborted();
        return result;
      } finally {
        signal.removeEventListener("abort", cancel);
      }
    }

    for (const entry of entries) {
      await beforeRequest(api, controls);
      const leaf = media.safeFilename(entry.filename.split("/").at(-1));
      const preferPath = !flatNames && entry.filename.includes("/");
      let result = await submit({ ...entry, filename: preferPath ? entry.filename : leaf });
      if (preferPath && !result.ok && result.error === "invalid-filename") {
        // Older background workers accept leaf names only. The rejected request queued no file.
        flatNames = true;
        await beforeRequest(api, controls);
        result = await submit({ ...entry, filename: leaf });
      }
      if (result.ok) queued++;
      else failed++;
      onProgress({ phase: "files", done: queued + failed, total: entries.length });
    }
    return { queued, failed };
  }

  async function runBulk(options, {
    api = iy.api,
    controls = createJobControls(),
    onProgress = () => {},
    delay = abortableDelay,
    random = Math.random,
    fetchMediaResponse = (...args) => globalThis.fetch(...args),
    createDownloadJob = download.createDownloadJob
  } = {}) {
    if (options.scope !== "profile" && options.scope !== "saved") throw fail("invalid_scope");
    if (options.scope === "profile" && (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > MAX_POSTS)) {
      throw fail("invalid_count");
    }
    if (!["zip", "files", "csv"].includes(options.format)) throw fail("invalid_format");
    const kinds = new Set(options.kinds);
    if (!KINDS.some(kind => kinds.has(kind))) throw fail("invalid_types");
    const allKinds = KINDS.every(kind => kinds.has(kind));
    const { since, until, restricted } = dates(options.from, options.to);
    const context = { api, controls, onProgress, delay, random, fetchMediaResponse, createDownloadJob };
    const posts = (await collectPosts(options, context)).filter(post =>
      (!restricted || (post.takenAt > 0 && post.takenAt >= since && post.takenAt < until)) &&
      (post.kinds.some(kind => kinds.has(kind)) || (post.kinds.length === 0 && allKinds)));
    await controls.ready();

    if (options.format === "csv") {
      return { matched: posts.length, blob: new Blob([csvFor(posts, kinds)], { type: "text/csv;charset=utf-8" }) };
    }
    const entries = selectedEntries(posts, kinds, options.template);
    if (!entries.length) return { matched: posts.length, files: 0 };
    if (options.format === "files") {
      return { matched: posts.length, files: entries.length, ...await queueFiles(entries, context) };
    }
    return { matched: posts.length, files: entries.length, blob: await buildArchive(entries, context) };
  }

  const strings = {
    en: {
      profile: "Download profile posts", saved: "Download saved posts", all: "All saved posts",
      collection: id => `Collection ${id}`, scope: "Saved posts", count: "Latest posts to check",
      photos: "Photos", videos: "Videos", reels: "Reels", filters: "Media types",
      from: "From (UTC)", to: "Through (UTC)", format: "Save as",
      zip: "ZIP archive", files: "Separate files", csv: "CSV list only",
      warning: "Instagram may limit requests. This job sends requests slowly, pauses regularly, and stops if Instagram asks you to verify your account.",
      fileNotice: "Files already sent to your browser’s Downloads can finish after you cancel.",
      start: "Start", close: "Close", cancel: "Cancel", pause: "Pause", resume: "Resume",
      save: "Save file", waiting: "Checking for a cooldown…", starting: "Starting…", paused: "Paused",
      stopping: "Stopping…", cancelled: "Cancelled.", busy: "The previous job is still stopping. Try again shortly.",
      scan: (done, total) => total ? `Checking posts · ${done} / ${total}` : `Checking posts · ${done} found`,
      zipProgress: (done, total) => `Building ZIP · ${done} / ${total} files`,
      filesProgress: (done, total) => `Sending files to Downloads · ${done} / ${total}`,
      csvReady: count => `CSV ready · ${count} posts`, zipReady: count => `ZIP ready · ${count} files`,
      filesDone: (queued, failed) => `Sent to Downloads · ${queued} files${failed ? ` · ${failed} failed` : ""}`,
      empty: "No downloadable files match these filters.",
      rate: minutes => minutes ? `Instagram limited requests. Try again in ${minutes} min.` : "Instagram limited requests. The job stopped.",
      challenge: minutes => "Instagram asks you to verify your account. Complete the check in Instagram." +
        (minutes ? ` Try again in ${minutes} min.` : ""),
      invalid_count: `Enter a whole number between 1 and ${MAX_POSTS.toLocaleString("en")}.`,
      invalid_dates: "Enter a valid date range.", invalid_types: "Select at least one media type.",
      invalid_response: "Instagram returned an incomplete post list. The job stopped.",
      unauthorized: "Sign in to Instagram and try again.",
      profile_query_unavailable: "The profile request is unavailable. Open or reload the profile’s Posts tab, then try again.",
      zip_size: "This selection is too large for one ZIP. Choose fewer posts or use separate files.",
      file_error: "A media file could not be downloaded. Try again or choose a smaller selection.",
      generic: "The download could not be prepared. Try again."
    },
    tr: {
      profile: "Profil gönderilerini indir", saved: "Kaydedilenleri indir", all: "Tüm kaydedilenler",
      collection: id => `Koleksiyon ${id}`, scope: "Kaydedilenler", count: "Kontrol edilecek son gönderi sayısı",
      photos: "Fotoğraflar", videos: "Videolar", reels: "Reels videoları", filters: "Medya türleri",
      from: "Başlangıç (UTC)", to: "Bitiş (UTC)", format: "Kayıt biçimi",
      zip: "ZIP arşivi", files: "Ayrı dosyalar", csv: "Yalnızca CSV listesi",
      warning: "Instagram istekleri sınırlayabilir. İşlem istekleri yavaşça gönderir, düzenli aralar verir ve Instagram hesap doğrulaması isterse durur.",
      fileNotice: "Tarayıcının indirme listesine gönderilen dosyalar, işlemi iptal ettikten sonra da tamamlanabilir.",
      start: "Başlat", close: "Kapat", cancel: "İptal et", pause: "Duraklat", resume: "Sürdür",
      save: "Dosyayı kaydet", waiting: "İstek kısıtlaması denetleniyor…", starting: "Başlatılıyor…", paused: "Duraklatıldı",
      stopping: "Durduruluyor…", cancelled: "İptal edildi.", busy: "Önceki işlem durduruluyor. Biraz sonra tekrar dene.",
      scan: (done, total) => total ? `Gönderiler kontrol ediliyor · ${done} / ${total}` : `Gönderiler kontrol ediliyor · ${done} bulundu`,
      zipProgress: (done, total) => `ZIP hazırlanıyor · ${done} / ${total} dosya`,
      filesProgress: (done, total) => `Dosyalar indirme listesine gönderiliyor · ${done} / ${total}`,
      csvReady: count => `CSV hazır · ${count} gönderi`, zipReady: count => `ZIP hazır · ${count} dosya`,
      filesDone: (queued, failed) => `İndirme listesine gönderildi · ${queued} dosya${failed ? ` · ${failed} başarısız` : ""}`,
      empty: "Bu filtrelere uyan indirilebilir dosya yok.",
      rate: minutes => minutes ? `Instagram istekleri sınırladı. ${minutes} dk sonra tekrar dene.` : "Instagram istekleri sınırladı. İşlem durdu.",
      challenge: minutes => "Instagram hesap doğrulaması istiyor. Doğrulamayı Instagram’da tamamla." +
        (minutes ? ` ${minutes} dk sonra tekrar dene.` : ""),
      invalid_count: `1 ile ${MAX_POSTS.toLocaleString("tr")} arasında bir tam sayı gir.`,
      invalid_dates: "Geçerli bir tarih aralığı gir.", invalid_types: "En az bir medya türü seç.",
      invalid_response: "Instagram eksik bir gönderi listesi döndürdü. İşlem durdu.",
      unauthorized: "Instagram’a giriş yap ve tekrar dene.",
      profile_query_unavailable: "Profil isteği kullanılamıyor. Profilin Gönderiler sekmesini aç veya yenile, ardından tekrar dene.",
      zip_size: "Bu seçim tek bir ZIP için fazla büyük. Daha az gönderi seç veya ayrı dosyaları kullan.",
      file_error: "Bir medya dosyası indirilemedi. Tekrar dene veya daha az gönderi seç.",
      generic: "İndirme hazırlanamadı. Tekrar dene."
    }
  };

  function labels() {
    let language = globalThis.navigator?.language;
    try { language = globalThis.chrome?.i18n?.getUILanguage?.() || language; } catch (_) {}
    return /^tr(?:[-_]|$)/i.test(language || "") ? strings.tr : strings.en;
  }

  const CSS = `
    dialog {
      box-sizing: border-box; width: min(440px, calc(100% - 32px)); max-height: calc(100% - 32px);
      padding: 20px; border: 1px solid var(--iy-border, currentColor); border-radius: 18px;
      background: var(--iy-surface-raised); color: var(--iy-text); font: 500 14px/1.4 system-ui, sans-serif;
      box-shadow: 0 12px 36px #0005; overflow: auto;
    }
    dialog::backdrop { background: #0008; }
    :host([data-mode="dark"]) dialog { color-scheme: dark; }
    :host([data-mode="light"]) dialog { color-scheme: light; }
    h2 { margin: 0; font-size: 18px; overflow-wrap: anywhere; }
    p { margin: 0; color: var(--iy-muted, var(--iy-text)); }
    form, fieldset, label.field { display: grid; gap: 8px; min-width: 0; }
    form { gap: 12px; margin-top: 12px; }
    fieldset { padding: 0; margin: 0; border: 0; }
    input, select, button { font: inherit; }
    input, select { min-width: 0; accent-color: var(--iy-accent); }
    input:not([type="checkbox"]), select, button, a {
      box-sizing: border-box; min-height: 40px; padding: 6px 12px; border-radius: 10px;
      border: 1px solid var(--iy-track-outline, currentColor);
      background: var(--iy-surface); color: var(--iy-text);
    }
    label.choice { display: inline-flex; align-items: center; min-height: 32px; gap: 8px; }
    .dates, footer, .types { display: flex; gap: 8px; flex-wrap: wrap; }
    .dates > label { flex: 1 1 140px; }
    footer { justify-content: end; }
    button, a { cursor: pointer; }
    a { display: inline-flex; align-items: center; text-decoration: none; }
    :is(button,a):hover:not(:disabled) { background: var(--iy-hover, var(--iy-surface)); }
    .primary { background: var(--iy-accent); color: var(--iy-on-accent); }
    .primary:hover:not(:disabled) { background: var(--iy-hover); color: var(--iy-accent-text); }
    :focus-visible { outline: 2px solid var(--iy-accent-text, currentColor); outline-offset: 2px; }
    button:disabled { cursor: default; opacity: .65; }
    .warning {
      padding: 10px 12px; border-inline-start: 3px solid var(--iy-accent-text, currentColor);
      border-radius: 6px; background: var(--iy-surface);
    }
    .status { min-height: 1.4em; }
    progress { width: 100%; accent-color: var(--iy-accent); }
    [hidden] { display: none !important; }
    @media (forced-colors: active) { :focus-visible { outline-color: Highlight; } }
  `;

  let activeJob;

  function createHost(doc, content, css, theme) {
    const host = doc.createElement("div");
    const root = host.attachShadow({ mode: "closed" });
    const style = doc.createElement("style");
    style.textContent = css;
    root.append(style, content);
    for (const type of ["pointerdown", "click", "dblclick"]) {
      root.addEventListener(type, event => event.stopPropagation());
    }
    iy.shadow.addHost(host);
    const updateTheme = name => iy.shadow.applyThemeToHost(host, name || "green");
    updateTheme(theme);
    doc.documentElement.appendChild(host);
    return { host, root, updateTheme, destroy: () => host.remove() };
  }

  function openModal(source, { opener, settings = {}, document: doc = globalThis.document, onClose } = {}) {
    const t = labels();
    const profile = source.scope === "profile";
    const el = (tag, text = "") => {
      const node = doc.createElement(tag);
      if (text) node.textContent = text;
      return node;
    };
    function field(text, child, className = "field") {
      const label = el("label");
      label.className = className;
      label.append(el("span", text), child);
      return label;
    }
    function option(select, value, text) {
      const node = el("option", text);
      node.value = value;
      select.append(node);
    }

    const dialog = el("dialog");
    const title = el("h2", profile ? `${t.profile} · @${source.username}` : t.saved);
    title.id = "bulk-title";
    const warning = el("p", t.warning);
    warning.id = "bulk-warning";
    warning.className = "warning";
    dialog.setAttribute("aria-labelledby", title.id);
    dialog.setAttribute("aria-describedby", warning.id);
    const form = el("form");
    form.noValidate = true;
    const selection = el("fieldset");
    const count = el("input");
    const collection = el("select");
    if (profile) {
      count.type = "number";
      count.min = "1";
      count.max = String(MAX_POSTS);
      count.step = "1";
      count.value = "50";
      selection.append(field(t.count, count));
    } else {
      option(collection, "all", t.all);
      for (const [id, name] of source.collections || []) option(collection, id, name || t.collection(id));
      const selected = source.collection || "all";
      if (selected !== "all" && !source.collections?.has(selected)) option(collection, selected, t.collection(selected));
      collection.value = selected;
      selection.append(field(t.scope, collection));
    }

    const filters = el("fieldset");
    filters.append(el("legend", t.filters));
    const types = el("div");
    types.className = "types";
    const typeInputs = KINDS.map((_, index) => {
      const input = el("input");
      input.type = "checkbox";
      input.checked = true;
      const label = el("label");
      label.className = "choice";
      label.append(input, el("span", [t.photos, t.videos, t.reels][index]));
      types.append(label);
      return input;
    });
    filters.append(types);
    const datesRow = el("div");
    datesRow.className = "dates";
    const from = el("input");
    const to = el("input");
    from.type = to.type = "date";
    datesRow.append(field(t.from, from), field(t.to, to));

    const format = el("select");
    for (const mode of ["zip", "files", "csv"]) option(format, mode, t[mode]);
    format.value = settings.downloadFormat === "files" ? "files" : "zip";
    const notice = el("p", t.fileNotice);
    const syncNotice = () => { notice.hidden = format.value !== "files"; };
    format.addEventListener("change", syncNotice);
    syncNotice();
    selection.append(filters, datesRow, field(t.format, format), notice);

    const progress = el("progress");
    progress.hidden = true;
    const status = el("p", t.waiting);
    status.className = "status";
    status.id = "bulk-status";
    status.setAttribute("role", "status");
    progress.setAttribute("aria-labelledby", status.id);
    const footer = el("footer");
    const cancel = el("button", t.close);
    cancel.type = "button";
    cancel.autofocus = true;
    const pause = el("button", t.pause);
    pause.type = "button";
    pause.hidden = true;
    const start = el("button", t.start);
    start.type = "submit";
    start.className = "primary";
    start.disabled = true;
    const save = el("a", t.save);
    save.hidden = true;
    save.className = "primary";
    footer.append(cancel, pause, start, save);
    form.append(selection, progress, status, footer);
    dialog.append(title, warning, form);
    const host = createHost(doc, dialog, CSS, settings.theme);

    let controls;
    let closed = false;
    let paused = false;
    let cooling = false;
    let cooldownTimer;
    let objectUrl;
    let saved = false;

    function clearOutput() {
      if (!objectUrl) return;
      const url = objectUrl;
      if (saved) setTimeout(() => URL.revokeObjectURL(url), 60000);
      else URL.revokeObjectURL(url);
      objectUrl = undefined;
      saved = false;
      save.removeAttribute("href");
      save.hidden = true;
    }
    save.addEventListener("click", () => { saved = true; });

    function close() {
      if (closed) return;
      closed = true;
      controls?.cancel();
      clearTimeout(cooldownTimer);
      clearOutput();
      if (dialog.open) dialog.close();
      host.destroy();
      if (opener?.isConnected) opener.focus();
      onClose?.();
    }

    function showCooldown(ms, challenge = false) {
      if (closed) return;
      const minutes = Math.ceil(ms / 60000);
      cooling = ms > 0;
      status.textContent = challenge ? t.challenge(minutes) : t.rate(minutes);
      if (!cooling) return;
      start.disabled = true;
      clearTimeout(cooldownTimer);
      cooldownTimer = setTimeout(async () => {
        try {
          const left = await iy.api.cooldownLeft();
          if (closed) return;
          if (left > 0) return showCooldown(left, challenge);
          status.textContent = challenge ? t.challenge(0) : "";
        } catch (_) {
          if (closed) return;
          status.textContent = t.generic;
        }
        cooling = false;
        start.disabled = Boolean(controls);
      }, Math.min(ms, 0x7fffffff));
    }

    function showProgress({ phase, done, total }) {
      if (closed || paused || controls.signal.aborted) return;
      progress.hidden = false;
      if (total) {
        progress.max = total;
        progress.value = done;
      } else progress.removeAttribute("value");
      const message = phase === "scan" ? t.scan : phase === "zip" ? t.zipProgress : t.filesProgress;
      status.textContent = message(done, total);
    }

    async function startJob(event) {
      event.preventDefault();
      if (closed || controls || cooling || start.disabled) return;
      if (activeJob) {
        status.textContent = t.busy;
        return;
      }
      const options = {
        ...source, collection: collection.value, limit: count.valueAsNumber,
        format: format.value, kinds: KINDS.filter((_, index) => typeInputs[index].checked),
        from: from.value, to: to.value, template: settings.filenameTemplate
      };
      clearOutput();
      controls = activeJob = createJobControls();
      paused = false;
      status.textContent = t.starting;
      selection.disabled = start.disabled = true;
      progress.hidden = true;
      cancel.textContent = t.cancel;
      pause.hidden = false;
      pause.disabled = false;
      pause.textContent = t.pause;
      cancel.focus();
      try {
        const result = await runBulk(options, { controls, onProgress: showProgress });
        if (closed) return;
        controls.signal.throwIfAborted();
        if (result.blob) {
          const name = profile ? `${source.username}_posts`
            : options.collection === "all" ? "saved_posts" : `saved_${options.collection}`;
          const day = new Date().toISOString().slice(0, 10);
          objectUrl = URL.createObjectURL(result.blob);
          save.href = objectUrl;
          save.download = `${name}_${day}.${options.format}`;
          save.hidden = false;
          status.textContent = options.format === "csv" ? t.csvReady(result.matched) : t.zipReady(result.files);
          if (host.root.activeElement === cancel || host.root.activeElement === pause) save.focus();
        } else status.textContent = result.files ? t.filesDone(result.queued, result.failed) : t.empty;
      } catch (error) {
        if (closed) return;
        if (controls.signal.aborted) status.textContent = t.cancelled;
        else if (error.rateLimited || error.status === 429 || error.code === "challenge") {
          const left = error.remainingMs || await iy.api.cooldownLeft().catch(() => 0);
          showCooldown(left, error.code === "challenge");
        } else {
          status.textContent = typeof t[error.code] === "string" ? t[error.code] : t.generic;
        }
      } finally {
        activeJob = controls = undefined;
        if (!closed) {
          selection.disabled = false;
          start.disabled = cooling;
          progress.hidden = true;
          cancel.textContent = t.close;
          if (host.root.activeElement === pause) cancel.focus();
          pause.hidden = true;
        }
      }
    }

    cancel.addEventListener("click", () => {
      if (!controls) return close();
      controls.cancel();
      pause.disabled = true;
      status.textContent = t.stopping;
    });
    pause.addEventListener("click", () => {
      paused = !paused;
      controls.setPaused(paused);
      pause.textContent = paused ? t.resume : t.pause;
      status.textContent = paused ? t.paused : t.starting;
    });
    dialog.addEventListener("cancel", event => {
      event.preventDefault();
      event.stopPropagation();
      close();
    });
    for (const type of ["keydown", "keyup"]) dialog.addEventListener(type, event => event.stopPropagation());
    dialog.addEventListener("close", close);
    form.addEventListener("submit", startJob);
    try { dialog.showModal(); } catch (error) { close(); throw error; }
    iy.api.cooldownLeft().then(left => {
      if (closed) return;
      if (left > 0) showCooldown(left);
      else {
        start.disabled = false;
        status.textContent = "";
      }
    }, () => {
      if (closed) return;
      start.disabled = false;
      status.textContent = t.generic;
    });
    return { close, setTheme: theme => host.updateTheme(theme) };
  }

  globalThis.IY.bulkDownload = { runBulk, createJobControls, labels, createHost, openModal };
  if (isNode) module.exports = globalThis.IY.bulkDownload;
})();
