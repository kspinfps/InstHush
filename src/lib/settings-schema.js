// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
// Copyright jewdev; InstHush changes GPL-3.0-only.
//
// One catalogue for every InstHush preference. Popup, dock and the Settings page read
// labels, defaults and normalisation from here. Every default below equals the value the
// version 1.8 popup, dock, background and feature scripts already used; tests/settings-schema.test.js
// derives those values from the code itself.
//
// Storage stays where it is today (chrome.storage.local): "cfg" for the four core switches,
// "ui" for everything else, and separate records for lists and device data. Nothing here
// reads or writes storage; the helpers are pure.
(function () {
  "use strict";

  const SCHEMA_VERSION = 1;
  const DEFAULT_TEMPLATE = "InstHush/{user}/{user}_{date}_{shortcode}_{index}";

  // Sidebar order. Emblem names are the dock/popup emblems.
  const CATEGORIES = Object.freeze([
    { id: "privacy", label: "setCatPrivacy", icon: "ghostMode", synonyms: { tr: ["gizlilik", "ghost", "görünmez"], en: ["privacy", "ghost", "stealth"] } },
    { id: "feed", label: "setCatFeed", icon: "groupFeed", synonyms: { tr: ["akış", "ana sayfa", "temizlik"], en: ["feed", "home", "declutter"] } },
    { id: "video", label: "setCatVideo", icon: "video", synonyms: { tr: ["video", "oynatma", "reels"], en: ["video", "playback", "player"] } },
    { id: "downloads", label: "setCatDownloads", icon: "download", synonyms: { tr: ["indirme", "kaydet"], en: ["downloads", "save"] } },
    { id: "profile", label: "setCatProfile", icon: "avatar", synonyms: { tr: ["profil", "hikâye"], en: ["profile", "stories"] } },
    { id: "focus", label: "setCatFocus", icon: "focus", synonyms: { tr: ["odak", "süre", "dikkat"], en: ["focus", "time", "distraction"] } },
    { id: "appearance", label: "setCatAppearance", icon: "theme", synonyms: { tr: ["görünüm", "tema", "renk"], en: ["appearance", "theme", "colour", "color"] } },
    { id: "tools", label: "setCatTools", icon: "keys", synonyms: { tr: ["araçlar", "yedek", "kısayol"], en: ["tools", "backup", "shortcuts"] } }
  ]);
  const CATEGORY_IDS = CATEGORIES.map(category => category.id);

  // Theme names and aliases: identical to src/lib/themes.js (tests compare them).
  const THEME_ORDER = ["green", "black", "white", "pink", "purple", "ocean"];
  const THEME_ALIASES = {
    green: "green", yesil: "green", "yeşil": "green", black: "black", siyah: "black",
    white: "white", beyaz: "white", pink: "pink", pembe: "pink", purple: "purple", mor: "purple",
    ocean: "ocean", okyanus: "ocean"
  };
  const BREAK_MINUTES = [0, 15, 30, 45, 60];
  const DEFAULT_SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];
  // src/content/video.js SPEEDS: the sticky per-session speed snaps to one of these.
  const PLAYER_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75, 4];
  const FOCUS_OPTION_KEYS = ["counts", "suggested", "noReels", "reelsNav", "exploreNav", "threads", "metaAi"];
  // v1.9 feed cleanup switches stored beside them (ui.focusOpts.*). They are not part of the
  // v1.8 focus disclosure or its legacy `focus: true` migration; patches keep them by merging.
  const FEED_CLEANUP_KEYS = ["suggestedAccounts", "storyTray"];

  function syn(tr, en) { return { tr: tr || [], en: en || [] }; }

  // Entry fields:
  //   id        stable identifier (also the search alias)
  //   path      storage.local location, "area.key[.key]"; null for actions and composites
  //   type      boolean | enum | string | number | list | object | bindings | action | readout | composite | data
  //   default   fresh-install value (what today's code assumes when the value is missing)
  //   category  sidebar category, or null for device data that has no row
  //   group     sub-heading inside the category
  //   surfaces  where its controls live: popup, dock, settings
  //   label/desc  _locales keys
  //   tip       existing longer info text (optional)
  //   synonyms  extra search words per locale
  //   risk      false | "rate" (rate limits) | "account" (account risk) | "privacy"
  //   since     first version with the behaviour [best effort before 1.9]
  //   syncable  may travel through browser sync (scalar preferences only)
  //   exportable  part of a settings backup (lists are a separate opt-in)
  //   planned   false, or the wave that implements it; planned entries are hidden and inert
  //   plannedDefault  the fresh-install value the implementing wave should use
  //   internal  remembered state with no row of its own
  const ENTRIES = [
    // ---- Gizlilik / Privacy ----
    { id: "ghostMode", path: null, type: "composite", category: "privacy", group: "ghost", surfaces: ["popup", "dock", "settings"],
      label: "setGhostMode", desc: "setGhostModeDesc", children: ["ghostStory", "ghostDm", "ghostTyping"],
      synonyms: syn(["gizli mod", "hayalet", "tümünü kapat", "tümünü aç"], ["ghost mode", "stealth", "turn all off", "turn all on"]), since: "1.0.0" },
    { id: "ghostStory", path: "cfg.ghostStory", type: "boolean", default: true, category: "privacy", group: "ghost", surfaces: ["popup", "dock", "settings"],
      label: "setGhostStory", desc: "setGhostStoryDesc", tip: "tipGhostStory", icon: "ghostStory", parent: "ghostMode",
      synonyms: syn(["görüldü", "hikâye görüldü", "izlendi", "gizli izleme"], ["seen", "seen receipt", "story seen", "view receipt", "anonymous story"]), since: "1.0.0", syncable: true },
    { id: "ghostDm", path: "cfg.ghostDm", type: "boolean", default: true, category: "privacy", group: "ghost", surfaces: ["popup", "dock", "settings"],
      label: "setGhostDm", desc: "setGhostDmDesc", tip: "tipGhostDm", icon: "ghostDm", parent: "ghostMode",
      synonyms: syn(["görüldü", "okundu", "mesaj", "dm okundu", "gizli okuma"], ["seen", "seen receipt", "read receipt", "message read", "direct"]), since: "1.0.0", syncable: true },
    { id: "ghostTyping", path: "ui.ghostTyping", type: "boolean", default: false, category: "privacy", group: "ghost", surfaces: ["popup", "dock", "settings"],
      label: "setGhostTyping", desc: "setGhostTypingDesc", tip: "tipGhostTyping", icon: "ghostTyping", parent: "ghostMode",
      synonyms: syn(["yazıyor", "yazma göstergesi"], ["typing", "typing indicator"]), since: "1.8.0", syncable: true },
    { id: "markRead", path: null, type: "action", category: "privacy", group: "ghost", surfaces: ["dock"],
      label: "setMarkRead", desc: "setMarkReadDesc", synonyms: syn(["okundu yap", "okundu gönder"], ["mark as read", "send read"]), since: "1.7.0" },
    { id: "cleanLinks", path: "ui.cleanLinks", type: "boolean", default: true, category: "privacy", group: "links", surfaces: ["settings"],
      label: "setCleanLinks", desc: "setCleanLinksDesc", tip: "tipCleanLinks", icon: "cleanLinks",
      synonyms: syn(["link", "bağlantı", "izleme", "igsh", "utm", "paylaşım"], ["link", "tracking", "igsh", "utm", "share"]), since: "1.8.0", syncable: true },
    { id: "shareDomain", path: "ui.shareDomain", type: "string", default: "", category: "privacy", group: "links", surfaces: ["settings"],
      label: "setShareDomain", desc: "setShareDomainDesc", tip: "tipShareDomain", synonyms: syn(["alan adı", "domain"], ["domain", "share domain"]), planned: false, since: "1.9.0", syncable: true, maxLength: 253 },
    { id: "directLinks", path: "ui.directLinks", type: "boolean", default: false, category: "privacy", group: "links", surfaces: ["settings"],
      label: "setDirectLinks", desc: "setDirectLinksDesc", tip: "tipDirectLinks", synonyms: syn(["dış bağlantı", "çıkış uyarısı", "yönlendirme", "zararlı bağlantı"], ["external link", "redirect", "l.instagram", "harmful link"]), planned: false, since: "1.9.0", syncable: true },
    { id: "blockAnalytics", path: "ui.blockAnalytics", type: "boolean", default: false, category: "privacy", group: "links", surfaces: ["settings"],
      label: "setBlockAnalytics", desc: "setBlockAnalyticsDesc", tip: "tipBlockAnalytics", synonyms: syn(["analitik", "telemetri", "ölçüm"], ["analytics", "telemetry", "tracking"]), planned: false, since: "1.9.0", syncable: true },

    // ---- Akış / Feed ----
    { id: "ads", path: "cfg.ads", type: "boolean", default: true, category: "feed", group: "cleanup", surfaces: ["popup", "dock", "settings"],
      label: "setAds", desc: "setAdsDesc", tip: "tipAds", icon: "ads", synonyms: syn(["reklam", "sponsorlu"], ["ads", "sponsored", "adblock"]), since: "1.0.0", syncable: true },
    { id: "suggested", path: "ui.focusOpts.suggested", type: "boolean", default: false, category: "feed", group: "cleanup", surfaces: ["popup", "settings"],
      label: "setSuggested", desc: "setSuggestedDesc", tip: "tipFocusSuggested", parent: "focusMode",
      synonyms: syn(["öneri", "önerilen"], ["suggested", "suggestions", "recommended"]), since: "1.7.0", syncable: true },
    { id: "suggestedAccounts", path: "ui.focusOpts.suggestedAccounts", type: "boolean", default: false, category: "feed", group: "cleanup", surfaces: ["settings"],
      label: "setSuggestedAccounts", desc: "setSuggestedAccountsDesc", synonyms: syn(["önerilen hesaplar", "kişiler"], ["suggested accounts", "people"]), since: "1.9.0", syncable: true },
    { id: "noReels", path: "ui.focusOpts.noReels", type: "boolean", default: false, category: "feed", group: "cleanup", surfaces: ["settings"],
      label: "setNoReels", desc: "setNoReelsDesc", tip: "tipFocusNoReels", parent: "focusMode",
      synonyms: syn(["reels", "akıştaki reels"], ["reels", "feed reels"]), since: "1.8.0", syncable: true },
    { id: "storyTray", path: "ui.focusOpts.storyTray", type: "boolean", default: false, category: "feed", group: "cleanup", surfaces: ["settings"],
      label: "setStoryTray", desc: "setStoryTrayDesc", synonyms: syn(["hikâye tepsisi", "hikâyeler"], ["story tray", "stories bar"]), since: "1.9.0", syncable: true },
    { id: "reelsNav", path: "ui.focusOpts.reelsNav", type: "boolean", default: false, category: "feed", group: "navigation", surfaces: ["settings"],
      label: "setReelsNav", desc: "setReelsNavDesc", tip: "tipFocusReelsNav", parent: "focusMode",
      synonyms: syn(["reels sekmesi", "menü"], ["reels tab", "navigation"]), since: "1.7.0", syncable: true },
    { id: "exploreNav", path: "ui.focusOpts.exploreNav", type: "boolean", default: false, category: "feed", group: "navigation", surfaces: ["settings"],
      label: "setExploreNav", desc: "setExploreNavDesc", tip: "tipFocusExploreNav", parent: "focusMode",
      synonyms: syn(["keşfet", "menü"], ["explore", "navigation"]), since: "1.7.0", syncable: true },
    { id: "threads", path: "ui.focusOpts.threads", type: "boolean", default: false, category: "feed", group: "navigation", surfaces: ["settings"],
      label: "setThreads", desc: "setThreadsDesc", tip: "tipFocusThreads", parent: "focusMode",
      synonyms: syn(["threads"], ["threads"]), since: "1.7.0", syncable: true },
    { id: "metaAi", path: "ui.focusOpts.metaAi", type: "boolean", default: false, category: "feed", group: "navigation", surfaces: ["settings"],
      label: "setMetaAi", desc: "setMetaAiDesc", tip: "tipFocusMetaAi", parent: "focusMode",
      synonyms: syn(["meta ai", "yapay zekâ", "yapay zeka"], ["meta ai", "ai", "assistant"]), since: "1.8.0", syncable: true },
    { id: "followingFeed", path: "ui.followingFeed", type: "boolean", default: false, category: "feed", group: "feed", surfaces: ["dock", "settings"],
      label: "setFollowingFeed", desc: "setFollowingFeedDesc", tip: "tipFollowingFeed", icon: "groupFeed",
      synonyms: syn(["takip edilenler", "kronolojik"], ["following", "chronological"]), since: "1.8.0", syncable: true },
    { id: "noDoubleTap", path: "ui.noDoubleTap", type: "boolean", default: false, category: "feed", group: "feed", surfaces: ["settings"],
      label: "setNoDoubleTap", desc: "setNoDoubleTapDesc", synonyms: syn(["çift tıklama", "beğeni"], ["double click", "double tap", "like"]), since: "1.9.0", syncable: true },
    { id: "seenPosts", path: "ui.seenPosts", type: "boolean", default: false, category: "feed", group: "feed", surfaces: ["settings"],
      label: "setSeenPosts", desc: "setSeenPostsDesc", tip: "tipSeenPosts", icon: "seenPosts", action: "seenPostsClear",
      synonyms: syn(["görülen", "soluk", "okunmuş gönderi"], ["seen posts", "dim", "already seen"]), since: "1.8.0", syncable: true },
    { id: "seenPostsClear", path: null, type: "action", category: "feed", group: "feed", surfaces: ["settings"], parent: "seenPosts",
      label: "seenPostsClear", desc: "seenPostsClearLabel", synonyms: syn(["geçmişi temizle"], ["clear history"]), since: "1.8.0" },
    { id: "mute", path: "ui.mute", type: "list", default: { words: [], accounts: [] }, category: "feed", group: "feed", surfaces: ["dock", "settings"],
      label: "setMute", desc: "setMuteDesc", synonyms: syn(["sessize al", "kelime", "hesap", "engelle", "filtre"], ["mute", "muted words", "muted accounts", "filter"]),
      since: "1.8.0", personal: true },

    // ---- Video ----
    { id: "video", path: "cfg.video", type: "boolean", default: true, category: "video", group: "player", surfaces: ["popup", "dock", "settings"],
      label: "setVideo", desc: "setVideoDesc", tip: "tipVideo", icon: "video",
      synonyms: syn(["video", "hız", "sarma", "ses", "döngü", "resim içinde resim"], ["video", "speed", "seek", "volume", "loop", "pip", "player"]), since: "1.0.0", syncable: true },
    { id: "defaultSpeed", path: "ui.defaultSpeed", type: "enum", default: 1, values: DEFAULT_SPEEDS, coerce: "number", category: "video", group: "player", surfaces: ["settings"],
      label: "setDefaultSpeed", desc: "setDefaultSpeedDesc", tip: "tipDefaultSpeed", icon: "defaultSpeed",
      synonyms: syn(["hız", "oynatma hızı"], ["speed", "playback rate"]), since: "1.7.0", syncable: true },
    { id: "autoAdvance", path: "ui.autoAdvance", type: "boolean", default: false, category: "video", group: "reels", surfaces: ["popup", "dock", "settings"],
      label: "setAutoAdvance", desc: "setAutoAdvanceDesc", tip: "tipAutoAdvance", icon: "autoAdvance",
      synonyms: syn(["otomatik geçiş", "sonraki reels"], ["auto advance", "autoscroll", "next reel"]), since: "1.3.0", syncable: true },
    { id: "noAutoplay", path: "ui.noAutoplay", type: "boolean", default: false, category: "video", group: "player", surfaces: ["settings"],
      label: "setNoAutoplay", desc: "setNoAutoplayDesc", tip: "tipNoAutoplay", icon: "noAutoplay",
      synonyms: syn(["otomatik oynatma"], ["autoplay"]), since: "1.7.0", syncable: true },
    { id: "storyPause", path: "ui.storyPause", type: "boolean", default: false, category: "video", group: "stories", surfaces: ["settings"],
      label: "setStoryPause", desc: "setStoryPauseDesc", tip: "tipStoryPause", icon: "storyPause",
      synonyms: syn(["hikâye duraklat"], ["pause stories"]), since: "1.7.0", syncable: true },
    { id: "storyNoAdvance", path: "ui.storyNoAdvance", type: "boolean", default: false, category: "video", group: "stories", surfaces: ["dock", "settings"],
      label: "setStoryNoAdvance", desc: "setStoryNoAdvanceDesc", synonyms: syn(["hikâye sonu", "otomatik ilerleme"], ["story end", "auto advance stories"]), since: "1.9.0", syncable: true },
    { id: "speed", path: "speed", type: "enum", default: 1, values: PLAYER_SPEEDS, coerce: "nearest", category: "video", surfaces: [], internal: true,
      label: "setSpeed", desc: "setSpeedDesc", since: "1.0.0" },
    { id: "rememberSound", path: "ui.rememberSound", type: "boolean", default: true, category: "video", surfaces: [], internal: true,
      label: "setRememberSound", desc: "setRememberSoundDesc", since: "1.3.0" },
    { id: "volume", path: "ui.volume", type: "number", default: null, min: 0, max: 1, category: "video", surfaces: [], internal: true, optional: true,
      label: "setVolume", desc: "setVolumeDesc", since: "1.3.0" },
    { id: "muted", path: "ui.muted", type: "boolean", default: null, category: "video", surfaces: [], internal: true, optional: true,
      label: "setMuted", desc: "setMutedDesc", since: "1.3.0" },

    // ---- İndirme / Downloads ----
    { id: "mediaToolbar", path: "ui.mediaToolbar", type: "boolean", default: true, category: "downloads", group: "toolbar", surfaces: ["settings"],
      label: "setMediaToolbar", desc: "setMediaToolbarDesc", synonyms: syn(["araç çubuğu", "üzerine gelince"], ["toolbar", "hover"]), since: "1.9.0", syncable: true },
    { id: "oneClickDownload", path: "ui.oneClickDownload", type: "boolean", default: false, category: "downloads", group: "toolbar", surfaces: ["settings"],
      label: "setOneClickDownload", desc: "setOneClickDownloadDesc", since: "1.9.0", syncable: true },
    { id: "downloadItem", path: null, type: "action", category: "downloads", group: "toolbar", surfaces: ["dock", "settings"], controlledBy: "video", shortcut: "media.download",
      label: "setDownloadItem", desc: "setDownloadItemDesc", synonyms: syn(["indir", "kaydet", "fotoğraf", "video indir"], ["download", "save", "photo", "video"]), since: "1.0.0" },
    { id: "downloadAll", path: null, type: "action", category: "downloads", group: "toolbar", surfaces: ["dock", "settings"], controlledBy: "video", shortcut: "media.downloadAll",
      label: "setDownloadAll", desc: "setDownloadAllDesc", synonyms: syn(["tümünü indir", "albüm", "slayt"], ["download all", "carousel", "album"]), since: "1.4.0" },
    { id: "viewFullSize", path: null, type: "action", category: "downloads", group: "toolbar", surfaces: ["dock", "settings"],
      label: "setViewFullSize", desc: "setViewFullSizeDesc", synonyms: syn(["tam boyut", "yakınlaştır", "büyüt"], ["full size", "zoom", "viewer"]), since: "1.9.0" },
    { id: "copyMediaUrl", path: null, type: "action", category: "downloads", group: "toolbar", surfaces: ["settings"],
      label: "setCopyMediaUrl", desc: "setCopyMediaUrlDesc", synonyms: syn(["adres kopyala", "url"], ["copy url", "link"]), since: "1.9.0" },
    { id: "copyCaption", path: null, type: "action", category: "downloads", group: "toolbar", surfaces: ["settings"],
      label: "setCopyCaption", desc: "setCopyCaptionDesc", synonyms: syn(["açıklama kopyala"], ["copy caption"]), since: "1.9.0" },
    { id: "filenameTemplate", path: "ui.filenameTemplate", type: "string", default: DEFAULT_TEMPLATE, category: "downloads", group: "files", surfaces: ["settings"],
      label: "setFilenameTemplate", desc: "setFilenameTemplateDesc", synonyms: syn(["dosya adı", "klasör", "şablon"], ["filename", "folder", "template"]), since: "1.9.0", syncable: true, maxLength: 200 },
    { id: "downloadFormat", path: "ui.downloadFormat", type: "enum", default: "zip", values: ["zip", "files"], category: "downloads", group: "files", surfaces: ["settings"],
      label: "setDownloadFormat", desc: "setDownloadFormatDesc", synonyms: syn(["zip", "arşiv", "ayrı dosyalar"], ["zip", "archive", "separate files"]), since: "1.9.0", syncable: true },
    { id: "contextMenu", path: "ui.contextMenu", type: "boolean", default: true, category: "downloads", group: "files", surfaces: ["settings"],
      label: "setContextMenu", desc: "setContextMenuDesc", synonyms: syn(["sağ tık", "bağlam menüsü"], ["right click", "context menu"]), since: "1.9.0", syncable: true },
    { id: "voiceDownload", path: "ui.voiceDownload", type: "boolean", default: false, category: "downloads", group: "extras", surfaces: ["dock", "settings"],
      label: "setVoiceDownload", desc: "setVoiceDownloadDesc", synonyms: syn(["sesli mesaj", "ses kaydı"], ["voice message", "audio message"]), since: "1.9.0", syncable: true },
    { id: "commentGif", path: "ui.commentGif", type: "boolean", default: true, category: "downloads", group: "extras", surfaces: ["settings"],
      label: "setCommentGif", desc: "setCommentGifDesc", synonyms: syn(["gif", "yorum gif"], ["gif", "comment gif"]), since: "1.9.0", syncable: true },
    { id: "audioMp3", path: "ui.audioMp3", type: "boolean", default: false, category: "downloads", group: "extras", surfaces: ["settings"],
      label: "setAudioMp3", desc: "setAudioMp3Desc", synonyms: syn(["mp3", "ses", "müzik"], ["mp3", "audio", "sound"]), since: "1.9.0", syncable: false },
    { id: "bulkProfile", path: "ui.bulkProfile", type: "boolean", default: false, category: "downloads", group: "bulk", surfaces: ["settings"], risk: "rate",
      label: "setBulkProfile", desc: "setBulkProfileDesc", synonyms: syn(["toplu indir", "csv", "profil gönderileri"], ["bulk download", "csv", "profile posts"]), since: "1.9.0", consent: true },
    { id: "bulkSaved", path: "ui.bulkSaved", type: "boolean", default: false, category: "downloads", group: "bulk", surfaces: ["settings"], risk: "rate",
      label: "setBulkSaved", desc: "setBulkSavedDesc", synonyms: syn(["kaydedilenler", "koleksiyon", "csv"], ["saved posts", "collection", "csv"]), since: "1.9.0", consent: true },

    // ---- Profil ve hikâye / Profile and stories ----
    { id: "hdAvatar", path: null, type: "action", category: "profile", group: "profile", surfaces: ["dock", "settings"],
      label: "setHdAvatar", desc: "setHdAvatarDesc", synonyms: syn(["profil fotoğrafı", "avatar", "hd"], ["profile picture", "avatar", "hd"]), since: "1.7.0" },
    { id: "followsBadge", path: "ui.followsBadge", type: "boolean", default: true, category: "profile", group: "profile", surfaces: ["dock", "settings"],
      label: "setFollowsBadge", desc: "setFollowsBadgeDesc", tip: "tipFollowsBadge", icon: "avatar",
      synonyms: syn(["takip ediyor", "takip durumu", "karşılıklı"], ["follows you", "follow status", "mutual"]), since: "1.8.0", syncable: true },
    { id: "storyDetails", path: "ui.storyDetails", type: "boolean", default: true, category: "profile", group: "stories", surfaces: ["dock", "settings"],
      label: "setStoryDetails", desc: "setStoryDetailsDesc", synonyms: syn(["etiket", "bahsetme", "çıkartma", "müzik"], ["mentions", "stickers", "music", "tags"]), since: "1.9.0", syncable: true },
    { id: "favorites", path: "favorites", type: "list", default: { v: 1, items: [] }, category: "profile", group: "profile", surfaces: ["dock", "settings"],
      label: "setFavorites", desc: "setFavoritesDesc", tip: "tipFavorites", synonyms: syn(["favori", "yıldız"], ["favorites", "favourites", "star"]), since: "1.8.0", personal: true },
    { id: "hoverZoom", path: "ui.hoverZoom", type: "boolean", default: false, category: "profile", group: "profile", surfaces: ["settings"],
      label: "setHoverZoom", desc: "setHoverZoomDesc", tip: "tipHoverZoom", icon: "hoverZoom",
      synonyms: syn(["önizleme", "büyüt", "küçük resim"], ["preview", "zoom", "thumbnail"]), since: "1.7.0", syncable: true },

    // ---- Odak / Focus ----
    { id: "focusMode", path: null, type: "composite", category: "focus", group: "focus", surfaces: ["settings"],
      label: "setFocusMode", desc: "setFocusModeDesc", tip: "tipFocus", children: FOCUS_OPTION_KEYS.slice(),
      synonyms: syn(["odak modu", "dikkat dağıtıcı"], ["focus mode", "distractions"]), since: "1.7.0" },
    { id: "counts", path: "ui.focusOpts.counts", type: "boolean", default: false, category: "focus", group: "focus", surfaces: ["settings"],
      label: "setCounts", desc: "setCountsDesc", tip: "tipFocusCounts", parent: "focusMode",
      synonyms: syn(["beğeni sayısı", "sayılar", "görüntülenme"], ["like count", "counts", "views"]), since: "1.7.0", syncable: true },
    { id: "dailyLimit", path: "ui.focusLimit", type: "enum", default: 0, values: [0, 15, 30, 45, 60, 90, 120], coerce: "number", category: "focus", group: "limit", surfaces: ["settings"],
      label: "setDailyLimit", desc: "setDailyLimitDesc", synonyms: syn(["günlük sınır", "süre sınırı"], ["daily limit", "time limit"]), since: "1.9.0", syncable: true },
    { id: "timeRemaining", path: "ui.focusTimer", type: "boolean", default: true, category: "focus", group: "limit", surfaces: ["dock", "settings"],
      label: "setTimeRemaining", desc: "setTimeRemainingDesc", synonyms: syn(["kalan süre", "sayaç"], ["time left", "countdown"]), since: "1.9.0", syncable: true },
    { id: "grayscale", path: "ui.grayscale", type: "enum", default: "never", values: ["never", "limited", "limit", "always"], category: "focus", group: "limit", surfaces: ["settings"],
      label: "setGrayscale", desc: "setGrayscaleDesc", synonyms: syn(["gri", "siyah beyaz"], ["grayscale", "greyscale", "black and white"]), since: "1.9.0", syncable: true },
    { id: "reelCounter", path: "ui.reelCounter", type: "boolean", default: false, category: "focus", group: "limit", surfaces: ["dock", "settings"],
      label: "setReelCounter", desc: "setReelCounterDesc", synonyms: syn(["reels sayacı", "sayaç"], ["reel counter", "count reels"]), since: "1.9.0", syncable: true },
    { id: "usage", path: "usage", type: "readout", default: { days: {} }, category: "focus", group: "time", surfaces: ["settings"],
      label: "setUsage", desc: "setUsageDesc", tip: "tipTimer", icon: "usage", synonyms: syn(["geçen süre", "kullanım", "ekran süresi"], ["time spent", "usage", "screen time"]), since: "1.7.0" },
    { id: "breakMins", path: "ui.breakMins", type: "enum", default: 0, values: BREAK_MINUTES, coerce: "strict", category: "focus", group: "time", surfaces: ["settings"],
      label: "setBreakMins", desc: "setBreakMinsDesc", tip: "tipBreak", icon: "breakMins",
      synonyms: syn(["mola", "hatırlatıcı"], ["break", "reminder"]), since: "1.7.0", syncable: true },

    // ---- Görünüm / Appearance ----
    { id: "theme", path: "ui.theme", type: "enum", default: "black", values: THEME_ORDER, coerce: "theme", category: "appearance", group: "look", surfaces: ["settings"],
      label: "setTheme", desc: "setThemeDesc", tip: "tipTheme", icon: "theme",
      synonyms: syn(["tema", "renk", "yeşil", "siyah", "beyaz", "pembe", "mor", "okyanus", "karanlık"], ["theme", "colour", "color", "green", "black", "white", "pink", "purple", "ocean", "dark"]), since: "1.2.0", syncable: true },
    { id: "animations", path: "ui.animations", type: "boolean", default: true, category: "appearance", group: "look", surfaces: ["settings"],
      label: "setAnimations", desc: "setAnimationsDesc", synonyms: syn(["animasyon", "hareket"], ["animations", "motion"]), planned: "P2", since: "1.9.0", syncable: true },
    { id: "exactDates", path: "ui.exactDates", type: "boolean", default: false, category: "appearance", group: "info", surfaces: ["settings"],
      label: "setExactDates", desc: "setExactDatesDesc", tip: "tipExactDates", icon: "exactDates",
      synonyms: syn(["tarih", "saat", "zaman"], ["date", "time", "timestamp"]), since: "1.8.0", syncable: true },
    { id: "opBadge", path: "ui.opBadge", type: "boolean", default: true, category: "appearance", group: "info", surfaces: ["settings"],
      label: "setOpBadge", desc: "setOpBadgeDesc", tip: "tipOpBadge", icon: "opBadge",
      synonyms: syn(["yazar", "gönderi sahibi", "rozet"], ["author", "op", "badge"]), since: "1.8.0", syncable: true },
    { id: "commentCopy", path: "ui.commentCopy", type: "boolean", default: true, category: "appearance", group: "info", surfaces: ["settings"],
      label: "setCommentCopy", desc: "setCommentCopyDesc", tip: "tipCommentCopy", icon: "commentCopy",
      synonyms: syn(["yorum", "kopyala"], ["comment", "copy"]), since: "1.2.0", syncable: true },

    // ---- Araçlar / Tools ----
    { id: "keys", path: "ui.keys", type: "boolean", default: true, category: "tools", group: "keys", surfaces: ["settings"],
      label: "setKeys", desc: "setKeysDesc", tip: "tipKeys", icon: "keys",
      synonyms: syn(["kısayol", "klavye", "tuş", "j/k"], ["shortcut", "hotkey", "keyboard", "keybinding"]), since: "1.7.0", syncable: true },
    { id: "shortcuts", path: "shortcuts", type: "bindings", default: { v: 1, map: {} }, category: "tools", group: "keys", surfaces: ["settings"],
      label: "setShortcuts", desc: "setShortcutsDesc", synonyms: syn(["kısayol", "tuş ata", "yeniden ata"], ["shortcut", "hotkey", "rebind", "keybinding"]), since: "1.9.0", syncable: true },
    { id: "backup", path: null, type: "action", category: "tools", group: "data", surfaces: ["settings"],
      label: "setBackup", desc: "setBackupDesc", synonyms: syn(["yedek", "dışa aktar", "içe aktar", "json"], ["backup", "export", "import", "json"]), since: "1.8.0" },
    { id: "reset", path: null, type: "action", category: "tools", group: "data", surfaces: ["settings"],
      label: "setReset", desc: "setResetDesc", synonyms: syn(["sıfırla", "varsayılan"], ["reset", "defaults"]), since: "1.9.0" },
    { id: "healthCheck", path: null, type: "action", category: "tools", group: "health", surfaces: ["settings"],
      label: "setHealthCheck", desc: "setHealthCheckDesc", synonyms: syn(["sağlık", "denetim", "rapor"], ["health", "check", "report", "diagnostics"]), since: "1.9.0" },
    { id: "sync", path: "syncState.on", type: "boolean", default: false, category: "tools", group: "data", surfaces: ["settings"],
      label: "setSync", desc: "setSyncDesc", synonyms: syn(["eşitle", "senkron", "hesap", "bulut"], ["sync", "synchronise", "synchronize", "account", "cloud"]), since: "1.9.0", consent: true },
    { id: "unfollowers", path: "ui.unfollowers", type: "boolean", default: false, category: "tools", group: "risky", surfaces: ["settings"], risk: "rate",
      label: "setUnfollowers", desc: "setUnfollowersDesc", synonyms: syn(["takibi bırakan", "takipçi", "tarama"], ["unfollowers", "followers", "scan"]), since: "1.9.0", consent: true },
    { id: "unfollowQueue", path: "ui.unfollowQueue", type: "boolean", default: false, category: "tools", group: "risky", surfaces: ["settings"], risk: "account",
      label: "setUnfollowQueue", desc: "setUnfollowQueueDesc", synonyms: syn(["takipten çık", "kuyruk"], ["unfollow", "queue"]), since: "1.9.0", consent: true },
    { id: "keepUnsent", path: "ui.keepUnsent", type: "boolean", default: false, category: "tools", group: "risky", surfaces: ["settings"], risk: "privacy",
      label: "setKeepUnsent", desc: "setKeepUnsentDesc", synonyms: syn(["geri alınan", "silinen mesaj"], ["unsent", "deleted messages"]), since: "1.9.0", consent: true },

    // ---- Device data (no row; listed so backup, sync and reset know what to leave alone) ----
    { id: "statsData", path: "stats", type: "data", default: { ads: 0, story: 0, dm: 0, leak: 0, error: 0, last: { ads: 0, story: 0, dm: 0 } }, category: null, surfaces: ["popup", "dock"],
      label: null, desc: null, since: "1.0.0" },
    { id: "seenPostsData", path: "seenPosts", type: "data", default: null, category: null, surfaces: [], label: null, desc: null, since: "1.8.0", personal: true },
    { id: "healthData", path: "health", type: "data", default: {}, category: null, surfaces: [], label: null, desc: null, since: "1.9.0" },
    { id: "focusBudgetData", path: "ige.focus", type: "data", default: null, category: null, surfaces: [], label: null, desc: null, since: "1.9.0" },
    { id: "reelTallyData", path: "ige.reels", type: "data", default: null, category: null, surfaces: [], label: null, desc: null, since: "1.9.0" },
    { id: "rateLimitData", path: "iy.rateLimitedUntil", type: "data", default: 0, category: null, surfaces: [], label: null, desc: null, since: "1.9.0" },
    { id: "syncData", path: "syncState", type: "data", default: { on: false }, category: null, surfaces: [], label: null, desc: null, since: "1.9.0" }
  ];

  // Existing keyboard shortcuts. "rebindable" is true once the script that owns the key
  // (content/keys.js, content/video.js, content/dock.js) reads the stored bindings; the others
  // stay read-only in Settings. Contexts: global, feed, player, media, viewer.
  // player.play stays fixed: in v1.8 video.js never reached its K branch, so K has no player
  // action to rebind yet (wiring it would add a new key behaviour on Reels and stories).
  const REBINDABLE = ["feed.next", "feed.prev", "help", "dock.toggle", "ghost.toggle",
    "player.speedUp", "player.speedDown", "player.back", "player.forward", "player.loop", "player.pip", "player.mute",
    "player.volumeUp", "player.volumeDown", "player.hold", "player.frameBack", "player.frameForward",
    "player.zoomIn", "player.zoomOut", "player.reset", "player.rotate", "player.fill", "player.ab",
    "player.fullscreen", "player.capture", "media.download", "media.downloadAll"];
  const SHORTCUTS = [
    { id: "feed.next", group: "navigation", context: "feed", chord: "j", label: "setKeyFeedNext", owner: "keys" },
    { id: "feed.prev", group: "navigation", context: "feed", chord: "k", label: "setKeyFeedPrev", owner: "keys" },
    { id: "help", group: "navigation", context: "global", chord: "?", label: "keysHelp", owner: "keys" },
    { id: "dock.toggle", group: "navigation", context: "global", chord: "Alt+g", label: "keysDock", owner: "dock" },
    { id: "ghost.toggle", group: "navigation", context: "global", chord: "Alt+Shift+g", label: "keysGhosts", owner: "dock" },
    { id: "player.speedUp", group: "player", context: "player", chord: "Shift+.", label: "setKeySpeedUp", owner: "video" },
    { id: "player.speedDown", group: "player", context: "player", chord: "Shift+,", label: "setKeySpeedDown", owner: "video" },
    { id: "player.back", group: "player", context: "player", chord: "ArrowLeft", label: "videoBack", owner: "video" },
    { id: "player.forward", group: "player", context: "player", chord: "ArrowRight", label: "videoForward", owner: "video" },
    { id: "player.play", group: "player", context: "player", chord: "k", label: "setKeyPlay", owner: "video" },
    { id: "player.loop", group: "player", context: "player", chord: "l", label: "popupLoop", owner: "video" },
    { id: "player.pip", group: "player", context: "player", chord: "p", label: "popupPip", owner: "video" },
    { id: "player.mute", group: "player", context: "player", chord: "m", label: "keysMute", owner: "video" },
    { id: "player.volumeUp", group: "player", context: "player", chord: "ArrowUp", label: "setKeyVolumeUp", owner: "video" },
    { id: "player.volumeDown", group: "player", context: "player", chord: "ArrowDown", label: "setKeyVolumeDown", owner: "video" },
    { id: "player.hold", group: "player", context: "player", chord: "s", label: "scHold", owner: "video" },
    { id: "player.frameBack", group: "player", context: "player", chord: ",", label: "setKeyFrameBack", owner: "video" },
    { id: "player.frameForward", group: "player", context: "player", chord: ".", label: "setKeyFrameForward", owner: "video" },
    { id: "player.zoomIn", group: "player", context: "player", chord: "z", label: "toolZoomIn", owner: "video" },
    { id: "player.zoomOut", group: "player", context: "player", chord: "Shift+z", label: "toolZoomOut", owner: "video" },
    { id: "player.reset", group: "player", context: "player", chord: "0", label: "scReset", owner: "video" },
    { id: "player.rotate", group: "player", context: "player", chord: "r", label: "scRotate", owner: "video" },
    { id: "player.fill", group: "player", context: "player", chord: "c", label: "scFill", owner: "video" },
    { id: "player.ab", group: "player", context: "player", chord: "a", label: "scAb", owner: "video" },
    { id: "player.fullscreen", group: "player", context: "player", chord: "f", label: "scFullscreen", owner: "video" },
    { id: "player.capture", group: "player", context: "player", chord: "Shift+x", label: "videoCapture", owner: "video" },
    { id: "media.download", group: "media", context: "media", chord: "d", label: "keysDownloadPost", owner: "video" },
    { id: "media.downloadAll", group: "media", context: "media", chord: "Shift+d", label: "keysDownloadPostAll", owner: "video" },
    { id: "media.fullSize", group: "media", context: "media", chord: "z", label: "setKeyFullSize", owner: "mediaToolbar" },
    { id: "media.copyUrl", group: "media", context: "media", chord: "Shift+c", label: "setKeyCopyUrl", owner: "mediaToolbar" },
    { id: "viewer.fit", group: "viewer", context: "viewer", chord: "0", label: "setKeyViewerFit", owner: "viewer" },
    { id: "viewer.close", group: "viewer", context: "viewer", chord: "Escape", label: "setKeyViewerClose", owner: "viewer" }
  ].map(def => Object.freeze(Object.assign({ rebindable: false, planned: false }, def,
    REBINDABLE.indexOf(def.id) !== -1 ? { rebindable: true } : null)));
  const SHORTCUT_GROUPS = ["navigation", "player", "media", "viewer"];

  // ---------------------------------------------------------------- catalogue lookup
  const byId = new Map();
  const byPath = new Map();
  for (const entry of ENTRIES) {
    entry.surfaces = Object.freeze(entry.surfaces.slice());
    if (!entry.synonyms) entry.synonyms = syn();
    if (!("planned" in entry)) entry.planned = false;
    if (!("risk" in entry)) entry.risk = false;
    if (!("syncable" in entry)) entry.syncable = false;
    if (!("exportable" in entry)) entry.exportable = !!entry.syncable;
    byId.set(entry.id, entry);
    if (entry.path) byPath.set(entry.path, entry);
    Object.freeze(entry);
  }
  const shortcutById = new Map(SHORTCUTS.map(def => [def.id, def]));

  function get(key) {
    if (typeof key !== "string") return null;
    return byId.get(key) || byPath.get(key) || null;
  }

  function entries(options) {
    const includePlanned = !!(options && options.includePlanned);
    return ENTRIES.filter(entry => includePlanned || !entry.planned);
  }

  // Rows the Settings page shows per category, in catalogue order.
  function byCategory(options) {
    const includePlanned = !!(options && options.includePlanned);
    return CATEGORIES.map(category => ({
      category,
      entries: ENTRIES.filter(entry => entry.category === category.id && !entry.internal &&
        (includePlanned || !entry.planned) && entry.surfaces.indexOf("settings") !== -1)
    }));
  }

  // ---------------------------------------------------------------- value normalisation
  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }
  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }
  function resolveThemeName(name) {
    if (typeof name !== "string") return "black";
    const key = name.trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(THEME_ALIASES, key) ? THEME_ALIASES[key] : "black";
  }
  function muteNormalizer() {
    const iy = globalThis.IY;
    if (iy && typeof iy.normalizeMute === "function") return iy.normalizeMute;
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
      try { return require("./themes.js").normalizeMute; } catch (_) {}
    }
    return null;
  }
  function favoritesNormalizer() {
    const iy = globalThis.IY;
    if (iy && iy.favorites && typeof iy.favorites.normalize === "function") return iy.favorites.normalize;
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
      try { return require("./favorites.js").normalize; } catch (_) {}
    }
    return null;
  }
  function nearestSpeed(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 1;
    let best = PLAYER_SPEEDS[0], distance = Math.abs(n - best);
    for (let i = 1; i < PLAYER_SPEEDS.length; i++) {
      const delta = Math.abs(n - PLAYER_SPEEDS[i]);
      if (delta < distance) { distance = delta; best = PLAYER_SPEEDS[i]; }
    }
    return best;
  }

  // Returns the normalised value, or undefined for an optional entry with nothing valid.
  function normalizeValue(key, value) {
    const entry = typeof key === "string" ? get(key) : key;
    if (!entry) return undefined;
    switch (entry.type) {
      case "boolean":
        if (typeof value === "boolean") return value;
        return entry.optional ? undefined : entry.default;
      case "enum": {
        if (entry.coerce === "theme") return resolveThemeName(value);
        if (entry.coerce === "nearest") return nearestSpeed(value);
        if (entry.coerce === "number") {
          // Same as the popup/dock: Number() first, so "1.5" is 1.5 and a boolean is 0/1.
          const n = Number(value);
          return entry.values.indexOf(n) !== -1 ? n : entry.default;
        }
        return entry.values.indexOf(value) !== -1 ? value : entry.default;
      }
      case "number": {
        // video.js reads Number(ui.volume) and keeps it only inside (0, 1].
        const n = Number(value);
        if (Number.isFinite(n) && n > entry.min && n <= entry.max) return n;
        return entry.optional ? undefined : entry.default;
      }
      case "string": {
        if (typeof value !== "string") return entry.default;
        const text = value.trim();
        return text.length <= (entry.maxLength || 200) ? text : entry.default;
      }
      case "list": {
        if (entry.id === "mute") {
          const normalize = muteNormalizer();
          return normalize ? normalize(value) : { words: [], accounts: [] };
        }
        if (entry.id === "favorites") {
          const normalize = favoritesNormalizer();
          return normalize ? normalize(value) : { v: 1, items: [] };
        }
        return clone(entry.default);
      }
      case "bindings":
        return normalizeShortcuts(value);
      default:
        return value === undefined ? clone(entry.default) : value;
    }
  }

  // Same result as version 1.8 popup/dock normalizeFocusOptions, including the legacy `focus: true`.
  function normalizeFocusOptions(ui) {
    const raw = ui && ui.focusOpts;
    const legacy = (!raw || typeof raw !== "object" || Array.isArray(raw)) && !!ui && ui.focus === true;
    const result = {};
    for (const key of FOCUS_OPTION_KEYS) {
      result[key] = legacy ? key === "counts" || key === "suggested" : !!raw && raw[key] === true;
    }
    return result;
  }

  function normalizeCfg(raw) {
    const source = isPlainObject(raw) ? raw : {};
    const result = {};
    for (const entry of ENTRIES) {
      if (entry.planned || !entry.path || entry.path.indexOf("cfg.") !== 0) continue;
      result[entry.path.slice(4)] = normalizeValue(entry, source[entry.path.slice(4)]);
    }
    return result;
  }

  // The user-facing ui object, key for key what the version 1.8 popup mergeUi returns.
  const UI_ORDER = ["theme", "commentCopy", "followsBadge", "autoAdvance", "storyPause", "noAutoplay", "hoverZoom",
    "exactDates", "seenPosts", "ghostTyping", "followingFeed", "cleanLinks", "opBadge", "breakMins", "defaultSpeed",
    "focusOpts", "mute", "keys"];
  function normalizeUi(raw) {
    const source = isPlainObject(raw) ? raw : {};
    const result = {};
    for (const key of UI_ORDER) {
      if (key === "focusOpts") result.focusOpts = normalizeFocusOptions(source);
      else result[key] = normalizeValue(get("ui." + key), source[key]);
    }
    // Entries added after v1.8 (still under ui, never planned ones) follow the fixed v1.8 keys.
    for (const entry of ENTRIES) {
      if (entry.planned || entry.internal || !entry.path || entry.path.indexOf("ui.") !== 0) continue;
      const key = entry.path.slice(3);
      if (key.indexOf(".") !== -1 || Object.prototype.hasOwnProperty.call(result, key)) continue;
      result[key] = normalizeValue(entry, source[key]);
    }
    return result;
  }

  // Remembered player state kept inside ui; present only when stored (and valid).
  function normalizeUiInternal(raw) {
    const source = isPlainObject(raw) ? raw : {};
    const result = {};
    for (const entry of ENTRIES) {
      if (!entry.internal || !entry.path || entry.path.indexOf("ui.") !== 0) continue;
      const key = entry.path.slice(3);
      if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
      const value = normalizeValue(entry, source[key]);
      if (value !== undefined) result[key] = value;
    }
    return result;
  }

  function defaults() {
    return {
      cfg: normalizeCfg({}),
      ui: normalizeUi({}),
      speed: 1,
      shortcuts: { v: 1, map: {} },
      favorites: { v: 1, items: [] },
      syncState: { on: false }
    };
  }

  // Whole local store (only the areas this catalogue owns) to normalised values.
  function normalize(raw) {
    const store = isPlainObject(raw) ? raw : {};
    return {
      cfg: normalizeCfg(store.cfg),
      ui: Object.assign(normalizeUi(store.ui), normalizeUiInternal(store.ui)),
      speed: nearestSpeed(store.speed),
      shortcuts: normalizeShortcuts(store.shortcuts),
      favorites: normalizeValue("favorites", store.favorites),
      syncState: { on: !!(isPlainObject(store.syncState) && store.syncState.on === true) }
    };
  }

  // Normalised value at a path such as "ui.focusOpts.counts" from a raw store.
  function read(store, key) {
    const entry = get(key);
    if (!entry || !entry.path) return undefined;
    const source = isPlainObject(store) ? store : {};
    const parts = entry.path.split(".");
    if (parts[0] === "ui" && parts[1] === "focusOpts") {
      if (FEED_CLEANUP_KEYS.indexOf(parts[2]) !== -1) {
        const raw = isPlainObject(source.ui) ? source.ui.focusOpts : undefined;
        return isPlainObject(raw) && raw[parts[2]] === true;
      }
      return normalizeFocusOptions(source.ui)[parts[2]];
    }
    if (parts[0] === "syncState") return !!(isPlainObject(source.syncState) && source.syncState.on === true);
    let value = source;
    for (const part of parts) value = isPlainObject(value) ? value[part] : undefined;
    return normalizeValue(entry, value);
  }

  // Storage patch for one change, merged into the raw stored record like the popup does:
  // unknown keys survive, the edited record is normalised, focusOpts merges key by key.
  function patch(store, key, value) {
    const entry = get(key);
    if (!entry || !entry.path || entry.planned || entry.type === "readout" || entry.type === "data") return null;
    const source = isPlainObject(store) ? store : {};
    const parts = entry.path.split(".");
    const area = parts[0];
    const clean = normalizeValue(entry, value);
    if (area === "cfg") {
      const raw = isPlainObject(source.cfg) ? source.cfg : {};
      return { cfg: Object.assign({}, raw, normalizeCfg(raw), { [parts[1]]: clean }) };
    }
    if (area === "ui") {
      const raw = isPlainObject(source.ui) ? source.ui : {};
      const next = Object.assign({}, raw, normalizeUi(raw));
      if (parts[1] === "focusOpts") {
        next.focusOpts = Object.assign({}, isPlainObject(raw.focusOpts) ? raw.focusOpts : {}, normalizeFocusOptions(raw), { [parts[2]]: clean });
      } else if (clean === undefined) delete next[parts[1]];
      else next[parts[1]] = clean;
      return { ui: next };
    }
    if (area === "syncState") {
      const raw = isPlainObject(source.syncState) ? source.syncState : {};
      return { syncState: Object.assign({}, raw, { on: clean === true }) };
    }
    return { [area]: clean };
  }

  // Ghost master: both receipts on -> all three off; otherwise all three on.
  // Same writes as the version 1.8 popup: ghostTyping follows into ui and never stays in cfg.
  function ghostMasterPatch(store) {
    const source = isPlainObject(store) ? store : {};
    const cfg = normalizeCfg(source.cfg);
    const desired = !(cfg.ghostStory && cfg.ghostDm);
    const rawCfg = isPlainObject(source.cfg) ? source.cfg : {};
    const nextCfg = Object.assign({}, rawCfg, cfg, { ghostStory: desired, ghostDm: desired });
    delete nextCfg.ghostTyping;
    const rawUi = isPlainObject(source.ui) ? source.ui : {};
    return { cfg: nextCfg, ui: Object.assign({}, rawUi, { ghostTyping: desired }) };
  }

  // Fresh-install preferences. Lists, archives, usage, history and counters are kept;
  // sync and every consent switch go off on this device.
  function resetPatch(store) {
    const source = isPlainObject(store) ? store : {};
    const fresh = defaults();
    const rawCfg = isPlainObject(source.cfg) ? source.cfg : {};
    const nextCfg = Object.assign({}, rawCfg, fresh.cfg);
    delete nextCfg.ghostTyping;
    const rawUi = isPlainObject(source.ui) ? source.ui : {};
    const nextUi = Object.assign({}, fresh.ui, { mute: normalizeValue("mute", rawUi.mute) });
    const rawSync = isPlainObject(source.syncState) ? source.syncState : {};
    return {
      set: { cfg: nextCfg, ui: nextUi, syncState: Object.assign({}, rawSync, { on: false, status: "off" }) },
      remove: ["speed", "shortcuts"]
    };
  }

  // Rows that differ between two stores (normalised), in catalogue order.
  function differences(before, after, options) {
    const filter = options && options.filter;
    const out = [];
    for (const entry of ENTRIES) {
      if (entry.planned || !entry.path || entry.type === "data" || entry.type === "readout") continue;
      if (filter && !filter(entry)) continue;
      const a = read(before, entry.id), b = read(after, entry.id);
      if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ id: entry.id, entry, from: a, to: b });
    }
    return out;
  }

  // ---------------------------------------------------------------- shortcuts
  const MODIFIER_ORDER = ["Ctrl", "Alt", "Shift", "Meta"];
  const NAMED_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Escape", "Enter", "Tab", "Backspace",
    "Delete", "Insert", "Home", "End", "PageUp", "PageDown", " ", "ContextMenu"];
  const IGNORED_KEYS = ["Shift", "Control", "Alt", "AltGraph", "Meta", "OS", "CapsLock", "NumLock", "ScrollLock",
    "Fn", "FnLock", "Hyper", "Super", "Dead", "Unidentified", "Process", "Compose"];

  function keyToken(key) {
    if (typeof key !== "string" || !key) return "";
    if (key === "İ" || key === "I") return "i";
    if ([...key].length === 1) return key.toLowerCase();
    if (/^F([1-9]|1[0-9]|2[0-4])$/.test(key) || NAMED_KEYS.indexOf(key) !== -1) return key;
    return "";
  }

  // "Alt+Shift+g" style: fixed modifier order, then one key token.
  function parseChord(chord) {
    if (typeof chord !== "string" || !chord || chord.length > 40) return null;
    const parts = chord === "+" ? ["+"] : chord.split("+");
    // A literal "+" key leaves an empty last part ("Shift++").
    if (parts.length > 1 && parts[parts.length - 1] === "" && parts[parts.length - 2] === "") { parts.splice(-2, 2, "+"); }
    const key = parts.pop();
    const mods = parts;
    let last = -1;
    for (const mod of mods) {
      const index = MODIFIER_ORDER.indexOf(mod);
      if (index <= last) return null;
      last = index;
    }
    const token = keyToken(key);
    if (!token || token !== key) return null;
    return { mods, key: token };
  }
  function isChord(chord) { return parseChord(chord) !== null; }

  // Logical key from a keydown, or null for events that never record a binding.
  // Symbols are taken as produced (Shift is part of the character); letters and
  // named keys keep Shift.
  function chordFromEvent(event) {
    if (!event || event.isComposing || event.repeat || event.keyCode === 229) return null;
    const key = event.key;
    if (typeof key !== "string" || IGNORED_KEYS.indexOf(key) !== -1) return null;
    const token = keyToken(key);
    if (!token) return null;
    const letter = token.length === 1 && /\p{L}/u.test(token);
    const named = token.length > 1;
    const mods = [];
    if (event.ctrlKey) mods.push("Ctrl");
    if (event.altKey) mods.push("Alt");
    if (event.shiftKey && (letter || named)) mods.push("Shift");
    if (event.metaKey) mods.push("Meta");
    return mods.concat(token).join("+");
  }

  // Why a chord cannot be bound, or "" when it can.
  function chordProblem(chord) {
    const parsed = parseChord(chord);
    if (!parsed) return "invalid";
    const { mods, key } = parsed;
    if (mods.indexOf("Ctrl") !== -1 || mods.indexOf("Meta") !== -1) return "reserved";
    if (/^F\d+$/.test(key) || key === "ContextMenu") return "reserved";
    if (["Tab", "Enter", " ", "Escape", "Backspace", "Delete", "Home", "End", "PageUp", "PageDown"].indexOf(key) !== -1) return "navigation";
    if (mods.indexOf("Alt") !== -1 && ["ArrowLeft", "ArrowRight", "Home", "d", "e", "f"].indexOf(key) !== -1) return "reserved";
    return "";
  }

  function contextsOverlap(a, b) {
    return a === b || a === "global" || b === "global";
  }

  function shortcutDefs(options) {
    const includePlanned = !!(options && options.includePlanned);
    return SHORTCUTS.filter(def => includePlanned || !def.planned);
  }

  // Stored overrides only: { v: 1, map: { id: chord | "" } }. "" means cleared.
  function normalizeShortcuts(raw) {
    const result = { v: 1, map: {} };
    if (!isPlainObject(raw) || raw.v !== 1 || !isPlainObject(raw.map)) return result;
    for (const id of Object.keys(raw.map)) {
      const def = shortcutById.get(id);
      const chord = raw.map[id];
      // Only rebindable actions read overrides; a stored chord for a fixed one is inert junk.
      if (!def || def.planned || !def.rebindable || typeof chord !== "string") continue;
      if (chord !== "" && (chordProblem(chord) || chord === def.chord)) continue;
      result.map[id] = chord;
    }
    // Drop overrides that collide where both actions can fire. A default always beats an
    // override; between two overrides the earlier catalogue entry keeps its binding.
    // Each pass removes one override, so this ends.
    const live = SHORTCUTS.filter(def => !def.planned);
    for (let pass = 0; pass <= live.length; pass++) {
      const effective = effectiveShortcuts(result, true);
      let drop = null;
      for (let i = 0; i < live.length && !drop; i++) {
        for (let j = i + 1; j < live.length && !drop; j++) {
          const a = live[i], b = live[j];
          if (!effective[a.id] || effective[a.id] !== effective[b.id] || !contextsOverlap(a.context, b.context)) continue;
          const aOverride = Object.prototype.hasOwnProperty.call(result.map, a.id);
          const bOverride = Object.prototype.hasOwnProperty.call(result.map, b.id);
          drop = bOverride ? b.id : aOverride ? a.id : null;
        }
      }
      if (!drop) break;
      delete result.map[drop];
    }
    return result;
  }

  function effectiveShortcuts(stored, trusted) {
    const map = trusted ? stored.map : normalizeShortcuts(stored).map;
    const out = {};
    for (const def of SHORTCUTS) {
      if (def.planned) continue;
      out[def.id] = Object.prototype.hasOwnProperty.call(map, def.id) ? map[def.id] : def.chord;
    }
    return out;
  }

  // The other action already using `chord` where both can fire, or null.
  function shortcutConflict(stored, id, chord) {
    const def = shortcutById.get(id);
    if (!def || !chord) return null;
    const effective = effectiveShortcuts(stored);
    for (const other of SHORTCUTS) {
      if (other.id === id || other.planned) continue;
      if (effective[other.id] === chord && contextsOverlap(other.context, def.context)) return other.id;
    }
    return null;
  }

  // New stored record after binding (`chord`), clearing ("") or restoring (null) one action.
  function bindShortcut(stored, id, chord) {
    const def = shortcutById.get(id);
    const next = normalizeShortcuts(stored);
    if (!def || def.planned || !def.rebindable) return { ok: false, error: "unknown", value: next };
    if (chord === null || chord === def.chord) { delete next.map[id]; return { ok: true, value: next }; }
    if (chord !== "") {
      const problem = chordProblem(chord);
      if (problem) return { ok: false, error: problem, value: next };
      const clash = shortcutConflict(next, id, chord);
      if (clash) return { ok: false, error: "conflict", conflict: clash, value: next };
    }
    next.map[id] = chord;
    return { ok: true, value: next };
  }

  const KEY_LABELS = { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓", Escape: "Esc", " ": "Space" };
  function formatChord(chord, locale) {
    const parsed = parseChord(chord);
    if (!parsed) return "";
    const lang = typeof locale === "string" && /^tr/i.test(locale) ? "tr" : "en";
    let key = KEY_LABELS[parsed.key] || parsed.key;
    if (key.length === 1) key = lang === "tr" ? key.toLocaleUpperCase("tr") : key.toUpperCase();
    return parsed.mods.concat(key).join(" + ");
  }

  // ---------------------------------------------------------------- search
  // Case, Turkish dotted/dotless I, combining marks and punctuation all fold away.
  function fold(text) {
    if (typeof text !== "string") return "";
    return text.replace(/[İIı]/g, "i").normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  }
  function words(text) {
    const folded = fold(text);
    return folded ? folded.split(" ") : [];
  }

  function messageText(bundle, locale, key) {
    const table = bundle && bundle[locale];
    const item = table && table[key];
    if (typeof item === "string") return item;
    return item && typeof item.message === "string" ? item.message : "";
  }

  // bundle: { tr: messages.json, en: messages.json } (either may be missing).
  function createSearchIndex(bundle) {
    const locales = ["tr", "en"];
    const docs = [];
    let order = 0;
    for (const entry of ENTRIES) {
      if (entry.planned || entry.internal || !entry.category || entry.surfaces.indexOf("settings") === -1) continue;
      const category = CATEGORIES.find(item => item.id === entry.category);
      const doc = { entry, order: order++, label: {}, labelWords: [], descWords: [], synWords: [], otherWords: [] };
      for (const locale of locales) {
        const label = messageText(bundle, locale, entry.label);
        doc.label[locale] = fold(label);
        doc.labelWords.push(...words(label));
        doc.descWords.push(...words(messageText(bundle, locale, entry.desc)));
        if (entry.tip) doc.descWords.push(...words(messageText(bundle, locale, entry.tip)));
        for (const phrase of entry.synonyms[locale] || []) doc.synWords.push(...words(phrase));
        doc.otherWords.push(...words(messageText(bundle, locale, category.label)));
        for (const phrase of category.synonyms[locale] || []) doc.otherWords.push(...words(phrase));
      }
      doc.otherWords.push(...words(entry.id.replace(/([a-z])([A-Z])/g, "$1 $2")), ...words(entry.path || ""));
      docs.push(doc);
    }
    // Children are found through their parent too, so a matching child is always reachable.
    function hit(list, token) { return list.some(word => word.indexOf(token) === 0); }
    function score(doc, tokens, phrase, locale) {
      const all = doc.labelWords.concat(doc.descWords, doc.synWords, doc.otherWords);
      if (!tokens.every(token => hit(all, token))) return -1;
      const label = doc.label[locale] || doc.label.tr || "";
      if (label === phrase || doc.label.tr === phrase || doc.label.en === phrase) return 0;
      if (label.indexOf(phrase) === 0 || tokens.every(token => hit(doc.labelWords, token))) return 1;
      if (tokens.every(token => hit(doc.labelWords.concat(doc.descWords), token))) return 2;
      if (tokens.every(token => hit(doc.labelWords.concat(doc.descWords, doc.synWords), token))) return 3;
      return 4;
    }
    function search(query, locale) {
      const tokens = words(query);
      const lang = typeof locale === "string" && /^en/i.test(locale) ? "en" : "tr";
      if (!tokens.length) return { query: "", total: 0, results: [], groups: [] };
      const phrase = tokens.join(" ");
      const results = [];
      for (const doc of docs) {
        const rank = score(doc, tokens, phrase, lang);
        if (rank >= 0) results.push({ id: doc.entry.id, entry: doc.entry, rank, order: doc.order });
      }
      results.sort((a, b) => a.rank - b.rank || a.order - b.order);
      const groups = [];
      for (const category of CATEGORIES) {
        const inCategory = results.filter(result => result.entry.category === category.id);
        if (inCategory.length) groups.push({ category, results: inCategory });
      }
      return { query: phrase, total: results.length, results, groups };
    }
    return { search, size: docs.length };
  }

  let sharedIndex = null, sharedBundle = null;
  function useMessages(bundle) {
    sharedBundle = bundle || null;
    sharedIndex = null;
  }
  function search(query, locale, bundle) {
    if (bundle) return createSearchIndex(bundle).search(query, locale);
    if (!sharedIndex) sharedIndex = createSearchIndex(sharedBundle);
    return sharedIndex.search(query, locale);
  }

  const api = Object.freeze({
    SCHEMA_VERSION, CATEGORIES, CATEGORY_IDS, ENTRIES, SHORTCUTS, SHORTCUT_GROUPS, THEME_ORDER, BREAK_MINUTES,
    DEFAULT_SPEEDS, PLAYER_SPEEDS, FOCUS_OPTION_KEYS, DEFAULT_TEMPLATE,
    get, entries, byCategory, defaults, normalize, normalizeCfg, normalizeUi, normalizeUiInternal,
    normalizeFocusOptions, normalizeValue, resolveThemeName, nearestSpeed, read, patch, ghostMasterPatch,
    resetPatch, differences,
    parseChord, isChord, chordFromEvent, chordProblem, formatChord, shortcutDefs, normalizeShortcuts,
    effectiveShortcuts, shortcutConflict, bindShortcut,
    fold, createSearchIndex, useMessages, search
  });
  globalThis.IY = Object.assign(globalThis.IY || {}, { settingsSchema: api });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
