(() => {
  "use strict";

  const messages = {
    popupStoryPause: "Hikâyeleri açılınca durdur",
    popupStoryPauseDesc: "Hikâye kendiliğinden akmaz, sen başlatırsın.",
    tipStoryPause: "Instagram'ın kendi duraklat düğmesine her hikâye öğesi için bir kez basar. Önce sen oynatırsan o öğeye dokunmaz. Varsayılan kapalı.",
    timerBreakToast: "$1 dakikadır Instagram'dasın. Kısa bir mola vermeyi dene.",
    timerBreakDismiss: "Kapat",
    popupTimer: "Instagram'da geçen süre",
    timerRowValue: "Bugün $1 · 7 gün $2",
    timerUnitHour: "sa",
    timerUnitMin: "dk",
    popupBreakReminder: "Mola hatırlatıcı",
    popupBreakOff: "Kapalı",
    popupBreakMins: "$1 dk",
    tipTimer: "Instagram'da aktif geçirdiğin süreyi yalnızca bu cihazda sayar. Sekme görünür, pencere odakta ve son 60 saniyede etkileşim varsa sayılır. Veri cihazdan çıkmaz.",
    popupDefaultSpeed: "Varsayılan hız",
    popupDefaultSpeedDesc: "Yeni videolar bu hızla başlar.",
    tipDefaultSpeed: "Akış, reels, profil ve gönderi videoları bu hızla başlar. Shift+. / Shift+, ya da menüyle seçtiğin hız o video için geçerli olur. Hikâyeler, mesajlar ve aramalar son seçtiğin hızı kullanır. 1x eski davranışı korur: son seçtiğin hız her yerde geçerlidir.",
    tipBreak: "Seçtiğin süre kesintisiz kullanımdan sonra küçük bir uyarı gösterir. 5 dakika ara verirsen sayaç sıfırlanır.",
    popupTitle: "InstHush",
    popupLocal: "Cihazda kalır",
    popupLocalChip: "Yalnızca cihazda",
    popupGhostMode: "Gizli mod",
    popupGhostOn: "Gizli mod açık",
    popupGhostOff: "Gizli mod kapalı",
    popupStatsEmpty: "Instagram'ı açınca sayaçlar dolar",
    popupGhostEnableAll: "İkisini aç",
    popupGhostDisableAll: "Tümünü kapat",
    popupSettings: "Ayarlar",
    popupVideo: "Video kontrolleri",
    popupVideoDesc: "Hız, sarma, döngü ve indirme.",
    popupAds: "Reklam engelleme",
    popupAdsDesc: "Akış, hikâye ve reels reklamlarını gizler.",
    popupCommentCopy: "Yorum kopyalama",
    popupCommentCopyDesc: "Yorumların altına tek tıkla Kopyala ekler.",
    popupOpBadge: "Gönderi sahibi rozeti",
    popupOpBadgeDesc: "Yorumlarda gönderi sahibinin yanıtlarına küçük bir Yazar etiketi ekler.",
    popupGhostTyping: "Yazıyor… gizle",
    popupGhostTypingDesc: "DM'de 'yazıyor' gösterilmez",
    tipGhostTyping: "DM'de yazarken karşı taraf 'yazıyor' göstergesini görmez.",
    popupFocusNoReels: "Akıştaki Reels'leri gizle",
    popupFocusNoReelsDesc: "Ana sayfa akışındaki Reels gönderilerini gizler.",
    tipFocusNoReels: "Ana sayfa akışındaki Reels gönderilerini gizler.",
    popupFocusMetaAi: "Meta AI'yi gizle",
    popupFocusMetaAiDesc: "Arama ve DM'deki Meta AI girişlerini gizler.",
    tipFocusMetaAi: "Arama ve DM'deki Meta AI girişlerini gizler.",
    tipOpBadge: "Yorumlarda gönderi sahibinin yanıtlarına küçük bir Yazar etiketi ekler.",
    popupTheme: "Tema",
    themeGreen: "Yeşil",
    themeBlack: "Siyah",
    themeWhite: "Beyaz",
    themePink: "Pembe",
    themePurple: "Mor",
    themeOcean: "Okyanus",
    infoMore: "Bilgi",
    tipGhostStory: "Hikâyeleri izlediğinde karşı taraf 'gördü' bilgisini almaz. Yalnızca bu tarayıcıda çalışır.",
    tipGhostDm: "Mesajları okuduğunda 'görüldü' gönderilmez. Yazmaya başlarsan Instagram bunu yine gösterebilir.",
    tipVideo: "Videolara hız, sarma, ses, döngü ve indirme çubuğu ekler. Canlı yayınları ve DRM korumalı akışları indirmez.",
    tipAds: "Akış, hikâye ve Reels içindeki sponsorlu paylaşımları gizler. Normal hesapların kendi tanıtım gönderilerini etkilemez.",
    tipCommentCopy: "Her yorumun altına tek tıkla metni panoya alan 'Kopyala' düğmesi ekler. Yorum sahibine bildirim göndermez.",
    tipTheme: "Panel, açılır pencere ve video çubuğunun renk temasını değiştirir. Instagram'ın kendi arayüz renklerine dokunmaz.",
    popupGhostStory: "Hikâye ghost",
    popupGhostStoryShort: "Görüldü gönderilmez",
    popupGhostDm: "DM ghost",
    popupGhostDmShort: "Okundu gönderilmez",
    popupActivity: "Cihaz sayaçları",
    popupLastDay: "Durum: son 24 saat",
    popupAdsBlocked: "Engellenen reklam",
    popupStoriesHidden: "Gizlenen hikâye görüldüsü",
    popupDmsHidden: "Gizlenen DM okundusu",
    popupActive: "Çalışıyor",
    popupWaiting: "Bekliyor",
    popupLeak: "Bazı DM okundu sinyalleri gizlenemedi.",
    popupShortcuts: "Video kısayolları",
    popupSpeed: "Oynatma hızı",
    popupSpeedKeys: "Shift + . / Shift + ,",
    popupSeek: "5 saniye sar",
    popupSeekKeys: "← / →",
    popupLoop: "Döngü",
    popupLoopKey: "L",
    popupPip: "Resim içinde resim",
    popupPipKey: "P",
    popupDownload: "İndir",
    popupDownloadKey: "D",
    popupIdmShort: "IDM: video hazır · Fotoğraf için jpg/webp türlerini ekleyin.",
    popupStorageError: "Ayarlar okunamadı; pencereyi yeniden açın.",
    popupSaveError: "Ayar kaydedilemedi; tekrar deneyin.",
    popupBackupExport: "Ayarları dışa aktar",
    popupBackupImport: "Ayarları içe aktar",
    popupBackupExported: "Ayar yedeği indiriliyor.",
    popupBackupImported: "Ayarlar içe aktarıldı.",
    popupBackupTooBig: "Yedek dosyası 256 KiB sınırını aşıyor.",
    popupBackupBadJson: "Dosya geçerli bir JSON dosyası değil.",
    popupBackupBadKind: "Bu dosya bir InstHush ayar yedeği değil.",
    popupBackupBadVersion: "Bu yedek sürümü desteklenmiyor.",
    popupBackupBadShape: "Yedek dosyasının ayar yapısı geçersiz.",
    popupBackupReadError: "Yedek dosyası okunamadı; tekrar deneyin.",
    popupBackupExportError: "Ayar yedeği oluşturulamadı; tekrar deneyin.",
    popupSeenPosts: "Görülen gönderileri soluklaştır",
    popupSeenPostsDesc: "Akışta daha önce gördüğün gönderileri soluk gösterir; üstüne gelince netleşir. Liste yalnızca bu cihazda tutulur.",
    tipSeenPosts: "Ana sayfa akışında önceki ziyaretlerde en az 1,5 saniye baktığın gönderileri soluk gösterir; üstüne gelince netleşir. Liste yalnızca bu cihazda tutulur, en fazla 3000 gönderi saklanır. Temizle listeyi siler.",
    seenPostsClear: "Temizle",
    seenPostsClearLabel: "Görülen gönderi listesini temizle",
    seenPostsCleared: "Görülen gönderi listesi temizlendi.",
    favoritesTitle: "Favoriler",
    favoritesAdd: "Favorilere ekle",
    favoritesRemove: "Favorilerden çıkar",
    favoritesEmpty: "Henüz favori yok. Bir profilde yıldıza bas.",
    favoritesDescription: "Sık baktığın hesaplar; liste yalnızca bu cihazda tutulur.",
    tipFavorites: "Sık baktığın en fazla 50 hesabı bu cihazda bir listede tutar. Bir profildeyken paneldeki yıldızla ekle ya da çıkar. Instagram'ın kendi Favoriler akışını değiştirmez."
  };
  const t = (key, substitutions) => chrome.i18n.getMessage(key, substitutions) ||
    (messages[key] || "").replace(/\$(\d+)/g, (_, n) => substitutions?.[Number(n) - 1] ?? "");
  const language = chrome.i18n.getUILanguage() || "tr";
  document.documentElement.lang = language;
  document.title = t("popupTitle");
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-label]").forEach((element) => {
    element.setAttribute("aria-label", t(element.dataset.i18nLabel));
  });

  const defaults = { video: true, ads: true, ghostStory: true, ghostDm: true };
  const uiDefaults = { theme: "black", commentCopy: true, followsBadge: true, autoAdvance: false, storyPause: false, noAutoplay: false, hoverZoom: false, exactDates: false, seenPosts: false, ghostTyping: false, followingFeed: false, cleanLinks: true, opBadge: true, breakMins: 0, defaultSpeed: 1, mute: { words: [], accounts: [] }, focusOpts: normalizeFocusOptions(), keys: true };
  const validBreaks = [0, 15, 30, 45, 60];
  const validSpeeds = [0.75, 1, 1.25, 1.5, 1.75, 2];
  const validThemes = ["green", "black", "white", "pink", "purple", "ocean"];
  const schema = globalThis.IY?.settingsSchema;
  const SVG = "http://www.w3.org/2000/svg";
  // Emblems for category headings (same drawings as the dock and Settings).
  const EMBLEMS = {
    groupFeed: [["rect", { x: "2.25", y: "2.25", width: "11.5", height: "11.5", rx: "1.75" }], ["path", { d: "M5 5.75h6M5 8h6M5 10.25h3.5" }]],
    video: [["path", { class: "emblem-fill", fill: "currentColor", stroke: "none", d: "M4.25 2.75 10.25 6.25 4.25 9.75Z" }], ["path", { d: "M4.25 2.75 10.25 6.25 4.25 9.75Z" }], ["path", { d: "M2.25 13h11.5M10.25 11.5v3" }]],
    download: [["path", { d: "M8 2.75v7.5M5.25 7.75 8 10.5l2.75-2.75M3.25 13.25h9.5" }]],
    avatar: [["circle", { class: "emblem-fill", cx: "8", cy: "5.5", r: "2.5", fill: "currentColor", stroke: "none" }], ["circle", { cx: "8", cy: "5.5", r: "2.5" }], ["path", { d: "M3 13.25c.9-2.1 2.75-3.25 5-3.25s4.1 1.15 5 3.25" }]],
    focus: [["circle", { cx: "8", cy: "8", r: "3" }], ["path", { d: "M1 5V1h4m6 0h4v4m0 6v4h-4m-6 0H1v-4" }]],
    theme: [["circle", { cx: "8", cy: "8", r: "5.75" }], ["path", { d: "M8 2.25a5.75 5.75 0 0 1 0 11.5Z", fill: "currentColor", stroke: "none" }]],
    keys: [["rect", { x: "1.75", y: "3.75", width: "12.5", height: "8.5", rx: "1.75" }], ["path", { d: "M4.5 6.75h1M7.5 6.75h1M10.5 6.75h1M5 9.75h6" }]],
    info: [["circle", { cx: "8", cy: "8", r: "6" }], ["path", { d: "M8 7.25v3.5" }], ["circle", { cx: "8", cy: "4.75", r: "0.75", fill: "currentColor", stroke: "none" }]],
    chevron: [["path", { d: "m8 10 4 4 4-4" }]]
  };
  function svgIcon(kind, className, viewBox) {
    const icon = document.createElementNS(SVG, "svg");
    for (const [key, value] of Object.entries({ class: className, width: "16", height: "16", viewBox: viewBox || "0 0 16 16", fill: "none", stroke: "currentColor",
      "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) icon.setAttribute(key, value);
    for (const [tag, attrs] of EMBLEMS[kind] || EMBLEMS.info) {
      const node = document.createElementNS(SVG, tag);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
      icon.appendChild(node);
    }
    return icon;
  }
  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  // Popup quick switches: catalogue entries with the popup surface, grouped by category. The
  // ghost card (privacy) is static markup; every other category becomes one closed disclosure.
  // Planned entries stay hidden until their wave flips them.
  function popupGroups() {
    if (!schema) return [];
    return schema.CATEGORIES.filter(category => category.id !== "privacy").map(category => ({
      category,
      entries: schema.entries().filter(entry => entry.category === category.id && entry.path && entry.type === "boolean" &&
        entry.surfaces.includes("popup") && !entry.internal)
    })).filter(group => group.entries.length);
  }
  const quickGroups = document.getElementById("quick-groups");
  const disclosures = [];
  for (const { category, entries } of popupGroups()) {
    const id = "group-" + category.id;
    const toggle = node("button", "setting compact-setting group-toggle");
    toggle.type = "button"; toggle.id = id + "-toggle";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", id + "-panel");
    const lead = node("span", "setting-lead");
    lead.append(svgIcon(category.icon, "emblem"), node("span", "setting-label", t(category.label)));
    const end = node("span", "group-end");
    const count = node("span", "group-count", "– / " + entries.length);
    end.append(count, svgIcon("chevron", "group-chevron", "0 0 24 24"));
    toggle.append(lead, end);
    const panel = node("div", "group-panel");
    panel.id = id + "-panel"; panel.hidden = true;
    panel.setAttribute("role", "group");
    panel.setAttribute("aria-labelledby", toggle.id);
    for (const entry of entries) {
      const [area, key, sub] = entry.path.split(".");
      const row = node("button", "setting compact-setting v17-row");
      row.type = "button";
      row.setAttribute("role", "switch");
      row.setAttribute("aria-checked", String(schema.normalizeValue(entry, undefined) === true));
      row.setAttribute("aria-labelledby", "q-" + entry.id + "-label");
      row.setAttribute("aria-describedby", "q-" + entry.id + "-desc");
      if (area === "cfg") row.dataset.setting = key;
      else if (key === "focusOpts") row.dataset.focusSetting = sub;
      else row.dataset.uiSetting = key;
      row.disabled = true;
      const copy = node("span", "setting-copy");
      const rowLead = node("span", "setting-lead");
      const label = node("span", "setting-label", t(entry.label));
      label.id = "q-" + entry.id + "-label";
      rowLead.appendChild(label);
      if (entry.tip) {
        const info = node("span", "info-btn");
        info.setAttribute("role", "button"); info.tabIndex = 0;
        info.dataset.tip = entry.tip; info.dataset.labelFor = entry.label;
        info.appendChild(svgIcon("info", "info-glyph"));
        rowLead.appendChild(info);
      }
      const desc = node("span", "description", t(entry.desc));
      desc.id = "q-" + entry.id + "-desc";
      copy.append(rowLead, desc);
      const track = node("span", "switch"); track.setAttribute("aria-hidden", "true");
      row.append(copy, track);
      panel.appendChild(row);
    }
    quickGroups.append(toggle, panel);
    disclosures.push({ toggle, panel, count, entries });
  }
  document.querySelectorAll(".info-btn[data-label-for]").forEach((element) => {
    element.setAttribute("aria-label", `${t(element.dataset.labelFor)} — ${t("infoMore")}`);
  });

  const buttons = [...document.querySelectorAll("[data-setting]")];
  const uiButtons = [...document.querySelectorAll("[data-ui-setting]")];
  const focusButtons = [...document.querySelectorAll("[data-focus-setting]")];
  const infoButtons = [...document.querySelectorAll(".info-btn[data-tip]")];
  const swatches = [...document.querySelectorAll(".swatch[data-theme]")];
  const tooltip = document.getElementById("iy-popup-tooltip");
  const message = document.getElementById("storage-message");
  const day = 24 * 60 * 60 * 1000;
  const numbers = new Intl.NumberFormat(language);
  const compactNumbers = new Intl.NumberFormat(language, { notation: "compact", maximumFractionDigits: 1 });
  const master = document.getElementById("ghost-master");
  const ghostCard = document.querySelector(".ghost-card");
  const brandStatus = document.getElementById("brand-status");
  const syncPill = document.getElementById("sync-pill");
  const localBadge = document.getElementById("local-badge");
  const allSettings = document.getElementById("all-settings");
  const gsap = window.gsap;
  const counters = Object.fromEntries(["ads", "story", "dm"].map((key) => [key, {
    value: 0, target: -1, element: document.querySelector(`[data-count="${key}"]`), tween: null
  }]));
  let reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let darkScheme = window.matchMedia("(prefers-color-scheme: dark)");
  let entered = false;
  let cfg = { ...defaults };
  let ui = { ...uiDefaults };
  let stats = {};
  let statsLoaded = false;
  let syncOn = false;
  let ready = false;
  let saving = false;
  let cfgRevision = 0;
  let uiRevision = 0;
  let statsRevision = 0;
  let syncRevision = 0;
  let expiryTimer;
  let activeTipBtn = null;
  let tipPinned = false;

  function storage(method, argument) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local[method](argument, (result) => {
          const error = chrome.runtime.lastError;
          if (error) reject(new Error(error.message));
          else resolve(result || {});
        });
      } catch (error) { reject(error); }
    });
  }

  function paintCount(counter) {
    const value = Math.round(counter.value);
    counter.element.textContent = value < 100000 ? numbers.format(value) : compactNumbers.format(value);
  }

  const media = gsap?.matchMedia();
  media?.add({ all: "all", reduce: "(prefers-reduced-motion: reduce)" }, (context) => {
    reducedMotion = context.conditions.reduce;
    if (!entered && !reducedMotion) {
      gsap.timeline({ defaults: { ease: "power3.out" } })
        .fromTo(".logo-shell", { strokeDasharray: 100, strokeDashoffset: 100, fillOpacity: 0 },
          { strokeDashoffset: 0, duration: .4 }, 0)
        .to(".logo-shell", { fillOpacity: 1, duration: .2, clearProps: "all" }, .4)
        .from(".logo-play", { opacity: 0, duration: .2, clearProps: "opacity" }, .4)
        .from(".entrance", { y: 7, opacity: 0, duration: .28, stagger: .04, clearProps: "transform,opacity" }, .04);
    }
    entered = true;
    return () => {
      for (const counter of Object.values(counters)) {
        counter.tween?.kill();
        if (counter.target >= 0) { counter.value = counter.target; paintCount(counter); }
      }
      for (const group of disclosures) {
        group.tween?.kill();
        group.panel.hidden = group.toggle.getAttribute("aria-expanded") !== "true";
        group.panel.style.removeProperty("height");
      }
    };
  });

  // Category disclosures: closed on every open; opening one closes its sibling.
  function setExpanded(group, open) {
    if ((group.toggle.getAttribute("aria-expanded") === "true") === open && group.panel.hidden === !open) return;
    group.toggle.setAttribute("aria-expanded", String(open));
    group.tween?.kill();
    if (!gsap || reducedMotion) {
      group.panel.hidden = !open;
      group.panel.style.removeProperty("height");
      return;
    }
    const from = group.panel.hidden ? 0 : group.panel.getBoundingClientRect().height;
    group.panel.hidden = false;
    gsap.set(group.panel, { height: from });
    group.tween = gsap.to(group.panel, {
      height: open ? "auto" : 0, duration: .12, ease: "power3.out", overwrite: true,
      onComplete: () => {
        group.panel.hidden = !open;
        group.panel.style.removeProperty("height");
        if (open) group.panel.scrollIntoView({ block: "nearest" });
      }
    });
  }
  for (const group of disclosures) {
    group.toggle.addEventListener("click", () => {
      const open = group.toggle.getAttribute("aria-expanded") !== "true";
      for (const other of disclosures) if (other !== group) setExpanded(other, false);
      setExpanded(group, open);
    });
  }

  allSettings.addEventListener("click", () => {
    // The options tab takes focus; close the popup once the browser has opened it.
    try {
      chrome.runtime.openOptionsPage(() => {
        if (chrome.runtime.lastError) message.textContent = t("popupSettingsError");
        else window.close();
      });
    } catch { message.textContent = t("popupSettingsError"); }
  });

  function positionTooltip(btn) {
    const bodyRect = document.body.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const tipRect = tooltip.getBoundingClientRect();
    if (!bodyRect.width || !tipRect.width) return;
    let left = btnRect.left - bodyRect.left + btnRect.width / 2 - tipRect.width / 2;
    left = Math.max(8, Math.min(left, bodyRect.width - tipRect.width - 8));
    let top = btnRect.top - bodyRect.top - tipRect.height - 6;
    if (top < 8) top = btnRect.bottom - bodyRect.top + 6;
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
  }
  function showTip(btn, pin) {
    if (activeTipBtn && activeTipBtn !== btn) activeTipBtn.removeAttribute("aria-describedby");
    activeTipBtn = btn;
    if (pin) tipPinned = true;
    tooltip.textContent = t(btn.dataset.tip);
    btn.setAttribute("aria-describedby", "iy-popup-tooltip");
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
  for (const info of infoButtons) {
    info.addEventListener("mouseenter", () => showTip(info, false));
    info.addEventListener("mouseleave", () => hideTip(false));
    info.addEventListener("focus", () => showTip(info, false));
    info.addEventListener("blur", () => hideTip(true));
    info.addEventListener("click", (event) => {
      event.stopPropagation();
      event.preventDefault();
      if (activeTipBtn === info && tipPinned) hideTip(true); else showTip(info, true);
    });
    info.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.stopPropagation();
        event.preventDefault();
        if (activeTipBtn === info && tipPinned) hideTip(true); else showTip(info, true);
      } else if (event.key === "Escape" && activeTipBtn === info) {
        event.stopPropagation();
        hideTip(true);
      }
    });
  }
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element && event.target.closest(".info-btn"))) hideTip(true);
  });

  function markJustTurnedOn(button) {
    button.dataset.justOn = "true";
    setTimeout(() => { delete button.dataset.justOn; }, 240);
  }

  function mergeCfg(value) {
    const merged = { ...defaults, ...(isPlainObject(value) ? value : {}) };
    for (const key of Object.keys(defaults)) {
      if (typeof merged[key] !== "boolean") merged[key] = defaults[key];
    }
    return merged;
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
  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }
  function mergeUi(value) {
    const raw = isPlainObject(value) ? value : {};
    const resolvedTheme = globalThis.IY?.resolveThemeName ? globalThis.IY.resolveThemeName(raw.theme) : raw.theme;
    return {
      theme: validThemes.includes(resolvedTheme) ? resolvedTheme : uiDefaults.theme,
      commentCopy: typeof raw.commentCopy === "boolean" ? raw.commentCopy : uiDefaults.commentCopy,
      followsBadge: typeof raw.followsBadge === "boolean" ? raw.followsBadge : uiDefaults.followsBadge,
      autoAdvance: raw.autoAdvance === true,
      storyPause: raw.storyPause === true,
      noAutoplay: raw.noAutoplay === true,
      hoverZoom: raw.hoverZoom === true,
      exactDates: raw.exactDates === true,
      seenPosts: raw.seenPosts === true,
      ghostTyping: raw.ghostTyping === true,
      followingFeed: raw.followingFeed === true,
      cleanLinks: typeof raw.cleanLinks === "boolean" ? raw.cleanLinks : uiDefaults.cleanLinks,
      opBadge: typeof raw.opBadge === "boolean" ? raw.opBadge : uiDefaults.opBadge,
      breakMins: validBreaks.includes(raw.breakMins) ? raw.breakMins : uiDefaults.breakMins,
      defaultSpeed: validSpeeds.includes(Number(raw.defaultSpeed)) ? Number(raw.defaultSpeed) : uiDefaults.defaultSpeed,
      focusOpts: normalizeFocusOptions(raw),
      mute: globalThis.IY?.normalizeMute?.(raw.mute) || { words: [], accounts: [] },
      keys: raw.keys !== false
    };
  }
  function applyTheme() {
    if (globalThis.IY?.themeVars) {
      const mode = darkScheme.matches ? "dark" : "light";
      document.documentElement.style.cssText = globalThis.IY.themeVars(ui.theme, mode);
    }
  }
  darkScheme.addEventListener("change", applyTheme);

  function renderCfg() {
    for (const button of buttons) {
      const checked = String(cfg[button.dataset.setting]);
      if (button.getAttribute("aria-checked") !== checked) button.setAttribute("aria-checked", checked);
      button.disabled = !ready;
      button.setAttribute("aria-disabled", String(!ready || saving));
    }
    for (const button of uiButtons) {
      const checked = String(ui[button.dataset.uiSetting]);
      if (button.getAttribute("aria-checked") !== checked) button.setAttribute("aria-checked", checked);
      button.disabled = !ready;
      button.setAttribute("aria-disabled", String(!ready || saving));
    }
    for (const button of focusButtons) {
      button.setAttribute("aria-checked", String(ui.focusOpts[button.dataset.focusSetting]));
      button.disabled = !ready;
      button.setAttribute("aria-disabled", String(!ready || saving));
    }
    // "1 / 2": enabled quick switches out of the ones shown in that category.
    for (const group of disclosures) {
      const on = [...group.panel.querySelectorAll('[role="switch"]')].filter(row => row.getAttribute("aria-checked") === "true").length;
      group.count.textContent = ready ? on + " / " + group.entries.length : "– / " + group.entries.length;
    }
    for (const swatch of swatches) {
      swatch.setAttribute("aria-checked", String(ui.theme === swatch.dataset.theme));
      swatch.disabled = !ready;
      swatch.setAttribute("aria-disabled", String(!ready || saving));
    }
    applyTheme();
    master.disabled = !ready;
    master.setAttribute("aria-disabled", String(!ready || saving));
    master.textContent = t(cfg.ghostStory && cfg.ghostDm ? "popupGhostDisableAll" : "popupGhostEnableAll");
    ghostCard.dataset.cloaked = String(ready && (cfg.ghostStory || cfg.ghostDm));
    const active = ready && (cfg.ghostStory || cfg.ghostDm);
    brandStatus.dataset.active = String(active);
    brandStatus.querySelector(".status-on").setAttribute("aria-hidden", String(!active));
    brandStatus.querySelector(".status-off").setAttribute("aria-hidden", String(active));
    syncPill.hidden = !syncOn;
    localBadge.hidden = syncOn;
  }

  function renderStats() {
    clearTimeout(expiryTimer);
    // Unknown until the first read: dashes, not zeros.
    if (!statsLoaded) {
      for (const counter of Object.values(counters)) counter.element.textContent = "–";
      document.querySelector(".stats").hidden = false;
      document.getElementById("stats-empty").hidden = true;
      return;
    }
    const now = Date.now();
    let nextExpiry = Infinity;
    for (const key of ["ads", "story", "dm"]) {
      const value = stats[key];
      const count = Number.isFinite(value) && value >= 0 ? Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value)) : 0;
      const counter = counters[key];
      if (counter.target !== count) {
        counter.tween?.kill();
        counter.target = count;
        counter.element.setAttribute("aria-label", numbers.format(count));
        counter.element.title = numbers.format(count);
        if (gsap && !reducedMotion) {
          counter.tween = gsap.to(counter, { value: count, duration: .4, ease: "power2.out", onUpdate: () => paintCount(counter) });
        } else { counter.value = count; paintCount(counter); }
      }
      const last = stats.last?.[key];
      const active = Number.isFinite(last) && last > 0 && last <= now && now - last < day;
      const status = document.querySelector(`[data-status="${key}"]`);
      const statusText = t(active ? "popupActive" : "popupWaiting");
      status.firstElementChild.textContent = statusText;
      status.parentElement.title = statusText;
      status.dataset.active = String(active);
      if (active) nextExpiry = Math.min(nextExpiry, last + day - now);
    }
    const empty = Object.values(counters).every(counter => counter.target === 0);
    document.querySelector(".stats").hidden = empty;
    document.getElementById("stats-empty").hidden = !empty;
    document.getElementById("leak-note").hidden = !(Number.isFinite(stats.leak) && stats.leak > 0);
    if (Number.isFinite(nextExpiry)) expiryTimer = setTimeout(renderStats, nextExpiry + 1);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.cfg) {
      cfgRevision++;
      cfg = mergeCfg(changes.cfg.newValue);
      ready = true;
      renderCfg();
    }
    if (changes.ui) {
      uiRevision++;
      ui = mergeUi(changes.ui.newValue);
      ready = true;
      renderCfg();
    }
    if (changes.stats) {
      statsRevision++;
      stats = changes.stats.newValue || {};
      statsLoaded = true;
      renderStats();
    }
    if (changes.syncState) {
      syncRevision++;
      syncOn = readSync(changes.syncState.newValue);
      renderCfg();
    }
  });
  function readSync(value) { return isPlainObject(value) && value.on === true; }

  async function saveSettings(patch, master = false) {
    if (!ready || saving) return;
    saving = true;
    message.textContent = "";
    renderCfg();
    try {
      const beforeRead = cfgRevision;
      const beforeUi = uiRevision;
      const stored = await storage("get", master ? ["cfg", "ui"] : "cfg");
      const rawCfg = isPlainObject(stored.cfg) ? stored.cfg : {};
      const next = { ...rawCfg, ...(cfgRevision === beforeRead ? mergeCfg(rawCfg) : cfg), ...patch };
      const revision = cfgRevision;
      const values = { cfg: next };
      const uiBeforeWrite = uiRevision;
      if (master) {
        delete next.ghostTyping;
        values.ui = { ...stored.ui, ...(beforeUi === uiRevision ? {} : ui), ghostTyping: patch.ghostDm };
      }
      await storage("set", values);
      if (master && uiBeforeWrite === uiRevision) ui = mergeUi(values.ui);
      if (cfgRevision === revision) cfg = mergeCfg(next);
    } catch {
      message.textContent = t("popupSaveError");
    } finally {
      saving = false;
      renderCfg();
    }
  }

  async function saveUiSettings(patch) {
    if (!ready || saving) return;
    saving = true;
    message.textContent = "";
    renderCfg();
    try {
      const beforeRead = uiRevision;
      const stored = await storage("get", "ui");
      const rawUi = isPlainObject(stored.ui) ? stored.ui : {};
      const next = { ...rawUi, ...(uiRevision === beforeRead ? mergeUi(rawUi) : ui), ...patch };
      if (patch.focusOpts) next.focusOpts = { ...rawUi.focusOpts,
        ...(uiRevision === beforeRead ? normalizeFocusOptions(rawUi) : ui.focusOpts), ...patch.focusOpts };
      if (patch.muteEdit) { next.mute = globalThis.IY.editMute((uiRevision === beforeRead ? rawUi : ui).mute, patch.muteEdit); delete next.muteEdit; }
      const revision = uiRevision;
      await storage("set", { ui: next });
      if (uiRevision === revision) ui = mergeUi(next);
    } catch {
      message.textContent = t("popupSaveError");
    } finally {
      saving = false;
      renderCfg();
    }
  }

  for (const button of buttons) {
    button.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest(".info-btn")) return;
      const key = button.dataset.setting;
      if (!cfg[key]) markJustTurnedOn(button);
      saveSettings({ [key]: !cfg[key] });
    });
  }
  for (const button of uiButtons) {
    button.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest(".info-btn")) return;
      const key = button.dataset.uiSetting;
      if (!ui[key]) markJustTurnedOn(button);
      saveUiSettings({ [key]: !ui[key] });
    });
  }
  for (const button of focusButtons) {
    button.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest(".info-btn")) return;
      const key = button.dataset.focusSetting;
      if (!ui.focusOpts[key]) markJustTurnedOn(button);
      saveUiSettings({ focusOpts: { [key]: !ui.focusOpts[key] } });
    });
  }
  for (const swatch of swatches) {
    swatch.addEventListener("click", () => {
      saveUiSettings({ theme: swatch.dataset.theme });
    });
  }
  master.addEventListener("click", () => {
    const desired = !(cfg.ghostStory && cfg.ghostDm);
    if (desired) {
      for (const b of buttons) {
        if (b.dataset.setting === "ghostStory" || b.dataset.setting === "ghostDm") markJustTurnedOn(b);
      }
    }
    saveSettings({ ghostStory: desired, ghostDm: desired }, true);
  });

  const updateVisibility = () => { document.documentElement.dataset.hidden = String(document.hidden); };
  document.addEventListener("visibilitychange", updateVisibility);
  updateVisibility();
  renderCfg();
  renderStats();
  const initialCfgRevision = cfgRevision;
  const initialUiRevision = uiRevision;
  const initialStatsRevision = statsRevision;
  const initialSyncRevision = syncRevision;
  // One batched read for the switches and counters; counters paint after the switches.
  storage("get", ["cfg", "ui", "stats", "syncState"]).then((stored) => {
    if (cfgRevision === initialCfgRevision) cfg = mergeCfg(stored.cfg);
    if (uiRevision === initialUiRevision) ui = mergeUi(stored.ui);
    if (statsRevision === initialStatsRevision) stats = stored.stats || {};
    if (syncRevision === initialSyncRevision) syncOn = readSync(stored.syncState);
    statsLoaded = true;
    ready = true;
    renderCfg();
    renderStats();
  }).catch(() => {
    message.textContent = t("popupStorageError");
  });
  window.addEventListener("pagehide", () => {
    clearTimeout(expiryTimer);
    media?.revert();
  }, { once: true });
})();
