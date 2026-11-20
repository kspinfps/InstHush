(function () {
  "use strict";

  const barCss = () => `:host {
  font: 500 12px/1 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--iy-text, #eaf0e8);
  letter-spacing: normal;
  text-transform: none;
  writing-mode: horizontal-tb;
}
.frame {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: calc(8px + var(--iy-lift, 0px));
  container-type: inline-size;
  pointer-events: none;
}
:host(.iy-reel) .frame { right: 72px; }
.bar {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 2px;
  box-sizing: border-box;
  width: 100%;
  padding: 4px;
  border-radius: 12px;
  border: 1px solid rgb(var(--iy-ink, 255 255 255) / 0.12);
  background: var(--iy-surface-a, #171d19eb);
  color: inherit;
  color-scheme: dark;
  font: inherit;
  letter-spacing: 0;
  box-shadow: 0 2px 4px #00000026, 0 8px 24px #00000033, inset 0 1px 0 rgb(var(--iy-ink, 255 255 255) / 0.0588);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  user-select: none;
  -webkit-user-select: none;
  pointer-events: auto;
  animation: iy-in 160ms cubic-bezier(0.2, 0, 0, 1);
}
@keyframes iy-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
.btn, .chip, .progress, .vol, .time { flex: 0 0 auto; }
.btn, .chip {
  appearance: none;
  box-sizing: border-box;
  min-width: 32px;
  height: 32px;
  margin: 0;
  padding: 0 6px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 140ms cubic-bezier(0.2, 0, 0, 1);
}
.btn.icon, .btn.play, .btn.mute { width: 32px; padding: 0; }
.chip { min-width: 48px; padding: 0 8px; background: rgb(var(--iy-ink, 255 255 255) / 0.0392); box-shadow: inset 0 0 0 1px rgb(var(--iy-ink, 255 255 255) / 0.1216); }
.btn:hover, .chip:hover, .btn.is-on, .chip.is-on, .menu-item.is-on { background: rgb(var(--iy-ink, 255 255 255) / 0.14); }
.btn.is-on, .chip.is-on, .menu-item.is-on { background: var(--iy-accent-soft, #9dceab26); color: var(--iy-accent, #9dceab); }
.btn:active, .chip:active, .menu-item:active { transform: scale(0.96); }
svg { display: block; pointer-events: none; }
svg[hidden] { display: none; }
.progress {
  position: relative;
  flex: 1 1 auto;
  min-width: 36px;
  width: 48px;
  height: 32px;
  border-radius: 8px;
  cursor: pointer;
  touch-action: none;
}
.progress::before {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: 13.5px;
  height: 5px;
  border-radius: 999px;
  background: rgb(var(--iy-ink, 255 255 255) / 0.22);
  transition: transform 120ms cubic-bezier(0.2, 0, 0, 1);
}
.buffer, .fill {
  position: absolute;
  left: 0;
  top: 13.5px;
  height: 5px;
  width: 100%;
  border-radius: 999px;
  transform-origin: left center;
  transform: scaleX(0);
  pointer-events: none;
}
.buffer::before { background: rgb(var(--iy-ink, 255 255 255) / 0.38); }
.fill { anchor-name: --iy-playhead; }
.fill::before { background: var(--iy-accent, #9dceab); }
.tooltip {
  position: absolute;
  left: 0;
  top: 0;
  padding: 3px 6px;
  border-radius: 6px;
  border: 1px solid rgb(var(--iy-ink, 255 255 255) / 0.12);
  background: var(--iy-surface, #171d19);
  color: rgb(var(--iy-ink, 255 255 255));
  font: 500 11px/1 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transform: translate3d(0, -6px, 0);
  transition: opacity 120ms cubic-bezier(0.2, 0, 0, 1);
}
.tooltip.is-on { opacity: 1; }
.vol { width: 68px; min-width: 48px; flex-basis: 68px; }
.time {
  min-width: 11ch;
  padding: 0 4px;
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1;
}
.menu {
  position: absolute;
  left: 0;
  bottom: calc(100% + 6px);
  z-index: 2;
  display: flex;
  flex-direction: column;
  min-width: 76px;
  max-height: 240px;
  overflow: auto;
  padding: 4px;
  border-radius: 12px;
  border: 1px solid rgb(var(--iy-ink, 255 255 255) / 0.12);
  background: var(--iy-surface, #171d19);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.32);

  pointer-events: auto;
}
.menu[hidden] { display: none; }
.menu-item {
  appearance: none;
  margin: 0;
  padding: 0 10px;
  height: 32px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-variant-numeric: tabular-nums;
  text-align: left;
  cursor: pointer;
}
.menu-item:hover { background: rgb(var(--iy-ink, 255 255 255) / 0.12); }
input[type="range"] {
  appearance: none;
  -webkit-appearance: none;
  height: 32px;
  margin: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
input[type="range"]::-webkit-slider-runnable-track {
  height: 5px;
  border-radius: 999px;
  background: linear-gradient(to right, rgb(var(--iy-ink, 255 255 255)) var(--p, 0%), rgb(var(--iy-ink, 255 255 255) / 0.3) var(--p, 0%));
}
input[type="range"]::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  margin-top: -4px;
  border: 0;
  border-radius: 50%;
  background: rgb(var(--iy-ink, 255 255 255));
}
button:focus-visible, .progress:focus-visible, input:focus-visible {
  outline: 2px solid rgb(var(--iy-ink, 255 255 255));
  outline-offset: 2px;
}
.menu { box-sizing: border-box; max-width: 100%; max-height: var(--iy-menu-room, 120px); }
.menu-item { flex-shrink: 0; }
.menu.tools { min-width: 0; }
.menu.tools .menu-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; white-space: normal; min-height: 32px; height: auto; padding-block: 8px; }
.sound { display: flex; align-items: center; flex: 0 0 auto; }
.volume-panel { display: flex; align-items: center; }
@container (max-width: 560px) {
  .volume-panel { display: none; position: absolute; left: 0; right: 0; bottom: calc(100% + 6px); padding: 6px 10px; border-radius: 10px; border: 1px solid rgb(var(--iy-ink, 255 255 255) / 0.12); background: var(--iy-surface, #171d19); }
  .volume-panel::after { content: ''; position: absolute; left: 0; right: 0; top: 100%; height: 12px; }
  .sound:hover .volume-panel, .sound:focus-within .volume-panel { display: flex; }
  .volume-panel .vol { width: 100%; min-width: 0; flex: 1; height: 24px; }
}
.menu-item .key { opacity: 0.56; font-size: 11px; }
.menu .menu-item[hidden] { display: none !important; }
.btn[hidden] { display: none; }
@container (max-width: 560px) { .time { display: none; } }
@container (max-width: 480px) { .btn.loop { display: none; } }
@container (max-width: 400px) { .btn.seek { display: none; } }
@container (max-width: 300px) { .chip { display: none; } }
@container (max-width: 220px) { .btn.icon { width: 28px; min-width: 28px; } .progress { min-width: 16px; } }
@container (max-width: 180px) { .btn.icon { width: 24px; min-width: 24px; } .progress { min-width: 8px; } }
@container (max-width: 150px) { .bar { gap: 0; padding: 2px; } .btn.icon { width: 20px; min-width: 20px; } }
.menu { scrollbar-width: thin; scrollbar-color: rgb(var(--iy-ink, 255 255 255) / 0.25) transparent; }
button:focus-visible, .progress:focus-visible, input:focus-visible { outline-color: var(--iy-accent, #9dceab); outline-offset: -2px; }
@media (prefers-reduced-motion: reduce) {
  .bar { animation: none; }
  .btn, .chip, .menu-item, .tooltip { transition: none; }
  .btn:active, .chip:active, .menu-item:active { transform: none; }
}
.progress:hover::before, .progress:focus-visible::before { transform: scaleY(1.4); }
.buffer::before, .fill::before { content: ""; position: absolute; inset: 0; border-radius: inherit; transition: transform 120ms cubic-bezier(0.2, 0, 0, 1); }
.progress:hover .buffer::before, .progress:hover .fill::before, .progress:focus-visible .buffer::before, .progress:focus-visible .fill::before { transform: scaleY(1.4); }
.progress::after { content: ""; position: absolute; position-anchor: --iy-playhead; left: anchor(right); top: 11px; width: 10px; height: 10px; margin-left: -5px; border-radius: 50%; background: var(--iy-text, #eaf0e8); box-shadow: 0 1px 3px #00000066; pointer-events: none; opacity: 0; transform: scale(.8); transition: opacity 120ms cubic-bezier(0.2, 0, 0, 1), transform 120ms cubic-bezier(0.2, 0, 0, 1); }
.progress:hover::after, .progress:focus-visible::after { opacity: 1; transform: scale(1); }
@supports not (left: anchor(right)) { .progress::after { display: none; } }
@media (prefers-reduced-motion: reduce) { .progress::before, .progress::after, .buffer::before, .fill::before { transition: none; } }`;

  const photoCss = () => `:host {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 2147483000;
  width: 32px;
  height: 32px;
  margin: 0;
  padding: 0;
  border: 0;
  display: none;
  pointer-events: auto;
  color: var(--iy-text, #eaf0e8);
  color-scheme: dark;
}
:host(.iy-on) { display: block; }
.photo {
  appearance: none;
  box-sizing: border-box;
  width: 32px;
  height: 32px;
  margin: 0;
  padding: 0;
  border: 1px solid rgb(var(--iy-ink, 255 255 255) / 0.12);
  border-radius: 10px;
  background: var(--iy-surface-a, #171d19eb);
  color: inherit;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 0 2px 4px #00000026, 0 8px 24px #00000033, inset 0 1px 0 rgb(var(--iy-ink, 255 255 255) / 0.0392);
  transition: transform 140ms cubic-bezier(0.2, 0, 0, 1);
}
.menu.tools {
  left: auto;
  right: 0;
  width: max-content;
  max-width: min(240px, calc(100vw - 24px));
  max-height: var(--iy-menu-room, 200px);
}
.photo:hover { background: var(--iy-surface-raised, #303e34); }
.photo:active { transform: scale(0.96); }
.photo:focus-visible { outline: 2px solid rgb(var(--iy-ink, 255 255 255)); outline-offset: 2px; }
svg { display: block; pointer-events: none; }
svg[hidden] { display: none; }
@media (prefers-reduced-motion: reduce) {
  .photo { transition: none; }
  .photo:active { transform: none; }
}`;

  const toastCss = () => `:host {
  position: fixed;
  z-index: 2147483002;
  left: 16px;
  right: 16px;
  bottom: 20px;
  display: flex;
  justify-content: center;
  pointer-events: none;
  font: 500 13px/1.35 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--iy-text, #eaf0e8);
  letter-spacing: normal;
}
.msg {
  max-width: 420px;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid rgb(var(--iy-ink, 255 255 255) / 0.12);
  background: var(--iy-surface-a, #171d19eb);
  color: inherit;
  font: inherit;
  box-shadow: 0 2px 4px #00000026, 0 8px 24px #00000033, inset 0 1px 0 rgb(var(--iy-ink, 255 255 255) / 0.0392);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 160ms cubic-bezier(0.2, 0, 0, 1), transform 160ms cubic-bezier(0.2, 0, 0, 1);
}
:host(.iy-on) .msg { opacity: 1; transform: translateY(0); }
@media (prefers-reduced-motion: reduce) {
  .msg { transition: none; transform: none; }
  :host(.iy-on) .msg { transform: none; }
}`;

  const pillCss = () => `.pill {
  position: absolute;
  left: 50%;
  top: 46%;
  z-index: 2;
  padding: 8px 12px;
  border-radius: 14px;
  border: 1px solid rgb(var(--iy-ink, 255 255 255) / 0.12);
  background: var(--iy-surface-a, #171d19eb);
  color: var(--iy-text, #eaf0e8);
  box-shadow: 0 2px 4px #00000026, 0 8px 24px #00000033, inset 0 1px 0 rgb(var(--iy-ink, 255 255 255) / 0.0392);
  font: 600 13px/1 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transform: translate3d(-50%, -50%, 0) scale(0.96);
  transition: opacity 140ms cubic-bezier(0.2, 0, 0, 1), transform 140ms cubic-bezier(0.2, 0, 0, 1);
}
.pill.is-on { opacity: 1; transform: translate3d(-50%, -50%, 0) scale(1); }
@media (prefers-reduced-motion: reduce) {
  .pill { transition: none; transform: translate3d(-50%, -50%, 0); }
  .pill.is-on { transform: translate3d(-50%, -50%, 0); }
}`;

  if (globalThis.__iyVideoInstalled) return;
  var IY = globalThis.IY;
  if (!IY || typeof IY.codeFromPath !== "function" || typeof IY.shortcodeToPk !== "function" || typeof IY.pickMedia !== "function" || typeof IY.buildFilename !== "function") return;
  globalThis.__iyVideoInstalled = true;

  var SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75, 4];
  var SVG_NS = "http://www.w3.org/2000/svg";
  var DASH = "Bu video yalnızca HD akış olarak var; bu sürüm indiremiyor.";
  var ERR = "İndirilemedi.";
  var STARTED = "İndirme başladı.";
  var STILL_MS = 2200;
  var SHORTCUT_MS = 1500;
  var PILL_MS = 600;
  var MIN_W = 200;
  var MIN_H = 120;

  var advanceWanted = false;
  var storyPauseWanted = false;
  var storyPauseTimer = 0;
  var storyPauseState = { id: "", paused: false, user: false, tries: 0 };
  // No-autoplay: pause a video Instagram started by itself, once.
  var noAutoplayWanted = false;
  var AP_GESTURE_MS = 1200;
  var apStates = new WeakMap();
  var apGestureAt = -Infinity;
  var apGestureTarget = null;
  var apFlashNode = null;
  var playRaf = 0;
  var playNode = null;
  var panRaf = 0;
  var panX = 0, panY = 0;
  var layoutGeneration = 0, cacheGeneration = -1;
  var autoAdvance = false;
  var heldInputs = new Set();
  var reelStates = new WeakMap();
  var pipBusy = false;
  var captureBusy = false;
  var live = false;
  var speed = 1;
  // ui.defaultSpeed: 1 = legacy (the one sticky `speed` for every video).
  var defaultSpeed = 1;
  var speedStates = new WeakMap();
  var active = null;
  var hovered = null;
  var host = null;
  var bar = null;
  var chip = null;
  var menu = null;
  var menuItems = [];
  var menuOpen = false;
  var openEl = null;
  var openAnchor = null;
  var toolsBtn = null;
  var toolsMenu = null;
  var downloadMenu = null;
  var downloadButton = null, photoButton = null;
  var oneClickDownload = false, audioMp3 = false, photoToolbar = true;
  var toolItems = {};
  var progress = null;
  var buffer = null;
  var fill = null;
  var tooltip = null;
  var timeEl = null;
  var volume = null;
  var loopBtn = null;
  var pipBtn = null;
  var playBtn = null;
  var muteBtn = null;
  var playIcon = null;
  var pauseIcon = null;
  var muteIcon = null;
  var soundIcon = null;
  var pill = null;
  var labels = {};

  var hasCache = false;
  var cacheL = 0;
  var cacheT = 0;
  var cacheR = 0;
  var cacheB = 0;
  var cacheW = 0;
  var cacheH = 0;
  var cacheAt = 0;
  var overVideo = false;
  var overBar = false;
  var overField = false;
  var barFocused = false;
  var scrubbing = false;
  var seenPointer = false;
  var lastX = -1;
  var lastY = -1;
  var barVisible = false;
  var liftPx = 0;
  var liftDirty = true;
  var wasReel = false;
  var wasStory = false;

  var moveRaf = 0;
  var moveX = 0;
  var moveY = 0;
  var moveTarget = null;
  var posRaf = 0;
  var lastTx = NaN;
  var lastTy = NaN;
  var lastTw = 0;
  var lastTh = 0;
  var movingUntil = 0;
  var stillTimer = 0;
  var stillDeadline = 0;
  var shortcutUntil = 0;
  var shortcutTimer = 0;
  var pillTimer = 0;
  var lastPct = -1;
  var lastBuf = -1;
  var lastSec = -1;
  var lastDur = -1;

  var photoHost = null;
  var photoImg = null;
  var photoOn = false;
  var photoX = NaN;
  var photoY = NaN;
  var toastHost = null;
  var toastText = null;
  var toastTimer = 0;
  var inFlight = false;

  // Sound memory. Instagram keeps its own mute state and applies it to every video
  // it creates or starts, so a choice made on one element is lost on the next one.
  // The user's last choice lives here and in chrome.storage.local.ui.
  var VOL_STEP = 0.05;
  var FRESH_MS = 1200;
  var GESTURE_MS = 1000;
  var ENFORCE_MAX = 3;
  var ENFORCE_WINDOW_MS = 4000;
  var SAVE_MS = 400;
  var WHEEL_STEP_PX = 40;
  var rememberSound = true;
  var prefMuted = null;
  var prefVolume = -1;
  var gestureAt = 0;
  var gestureVideo = null;
  var soundAt = 0;
  var soundVideo = null;
  var gestureX = 0;
  var gestureY = 0;
  var wheelAcc = 0;
  var uiPatch = null;
  var uiTimer = 0;
  var themeName = "";
  // Per-video bookkeeping, held weakly so it dies with the element.
  var seen = new WeakMap();
  var TOKENS = ["--iy-accent", "--iy-accent-soft", "--iy-surface", "--iy-surface-a", "--iy-surface-raised", "--iy-text", "--iy-ink"];

  function t(key, fallback) {
    try {
      var text = chrome.i18n.getMessage(key);
      if (text) return text;
    } catch (err) {}
    return fallback;
  }

  function loadLabels() {
    labels.speed = t("videoSpeed", "Hız");
    labels.back = t("videoBack", "5 saniye geri");
    labels.forward = t("videoForward", "5 saniye ileri");
    labels.progress = t("videoProgress", "İlerleme");
    labels.volume = t("videoVolume", "Ses");
    labels.loop = t("videoLoop", "Döngü");
    labels.capture = t("videoCapture", "Kareyi PNG olarak kaydet");
    labels.pip = t("videoPip", "Resim içinde resim");
    labels.download = t("videoDownload", "İndir");
    labels.bar = t("videoBar", "Video kontrolleri");
    labels.play = t("videoPlay", "Oynat");
    labels.pause = t("videoPause", "Duraklat");
    labels.mute = t("videoMute", "Sessize al");
    labels.unmute = t("videoUnmute", "Sesi aç");
    labels.pillBack = t("pillBack", "\u22125 s");
    labels.pillForward = t("pillForward", "+5 s");
    labels.loopOn = t("pillLoopOn", "Döngü açık");
    labels.loopOff = t("pillLoopOff", "Döngü kapalı");
    labels.pipOn = t("pillPipOn", "PiP açık");
    labels.pipOff = t("pillPipOff", "PiP kapalı");
    labels.muted = t("pillMuted", "Sessiz");
    labels.sound = t("pillSound", "Ses açık");
    labels.playing = t("pillPlaying", "Oynatılıyor");
    labels.paused = t("pillPaused", "Duraklatıldı");
    labels.dash = t("toastDashOnly", DASH);
    labels.err = t("toastError", ERR);
    labels.started = t("toastStarted", STARTED);
    labels.downloadHint = t("videoDownloadHint", "İndir (Shift: tümü)");
    labels.volumeHint = t("videoVolumeHint", "Ses (tekerlek, ↑/↓)");
    labels.more = t("videoMore", "Diğer araçlar");
    labels.zoomIn = t("toolZoomIn", "Yakınlaştır");
    labels.zoomOut = t("toolZoomOut", "Uzaklaştır");
    labels.rotate = t("toolRotate", "Döndür");
    labels.fill = t("toolFill", "Doldur / sığdır");
    labels.ab = t("toolAb", "A–B döngüsü");
    labels.fullscreen = t("toolFullscreen", "Tam ekran");
    labels.reset = t("toolReset", "Görünümü sıfırla");
    labels.downloadAll = t("toolDownloadAll", "Tümünü indir");
    labels.pillReset = t("pillViewReset", "Görünüm sıfırlandı");
    labels.pillFill = t("pillFill", "Doldur");
    labels.pillFit = t("pillFit", "Sığdır");
    labels.pillAbOff = t("pillAbOff", "A–B kapalı");
    labels.pillFrameBack = t("pillFrameBack", "−1 kare");
    labels.pillFrameForward = t("pillFrameForward", "+1 kare");
  }

  function tSub(key, sub, fallback) {
    try {
      var text = chrome.i18n.getMessage(key, [String(sub)]);
      if (text) return text;
    } catch (err) {}
    return fallback;
  }

  function nearestSpeed(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return 1;
    var best = SPEEDS[0];
    var dist = Math.abs(n - best);
    for (var i = 1; i < SPEEDS.length; i++) {
      var delta = Math.abs(n - SPEEDS[i]);
      if (delta < dist) {
        dist = delta;
        best = SPEEDS[i];
      }
    }
    return best;
  }

  // ui.defaultSpeed allowed values; anything else (or a missing value) is 1.
  function defaultSpeedNormalise(value) {
    var n = Number(value);
    var allowed = [0.75, 1, 1.25, 1.5, 1.75, 2];
    if (value === null || value === "" || typeof value === "boolean" || !Number.isFinite(n)) return 1;
    for (var i = 0; i < allowed.length; i++) {
      if (Math.abs(allowed[i] - n) < 1e-9) return allowed[i];
    }
    return 1;
  }

  // Pure rate decision. st = { src, user, rate } per element.
  // def === 1 or an ineligible video (story, DM, call): the sticky session speed.
  // Otherwise a new video gets def until the user picks a speed for it; that
  // pick (st.user, st.rate) then wins for as long as the element keeps its src.
  function speedDecide(st, src, eligible, def, sess) {
    if (src !== st.src) { st.src = src; st.user = false; st.rate = 0; }
    if (!eligible || def === 1) return sess;
    if (st.user && st.rate > 0) return st.rate;
    return def;
  }

  function speedEligible(node) {
    return !onStoryPath() && !onDmPath() && !callMedia(node) && !inCall();
  }

  function speedStateOf(node) {
    var st = speedStates.get(node);
    if (!st) { st = { src: "", user: false, rate: 0 }; speedStates.set(node, st); }
    return st;
  }

  function rateFor(node) {
    if (!node) return speed;
    try {
      return speedDecide(speedStateOf(node), node.currentSrc || node.src || "", speedEligible(node), defaultSpeed, speed);
    } catch (err) { return speed; }
  }

  function speedIndex() {
    var i = SPEEDS.indexOf(nearestSpeed(rateFor(active)));
    return i < 0 ? 0 : i;
  }

  function formatSpeed(n) {
    return String(n) + "\u00d7";
  }

  function fmt(seconds) {
    var total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    var ss = (s < 10 ? "0" : "") + s;
    if (h > 0) return h + ":" + (m < 10 ? "0" : "") + m + ":" + ss;
    return m + ":" + ss;
  }

  function icon(d) {
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.5");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    var path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
    return svg;
  }

  function makeButton(label, className) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.setAttribute("aria-label", label);
    button.title = label;
    return button;
  }

  function stopInside(root) {
    function stop(e) {
      try { e.stopPropagation(); } catch (err) {}
    }
    root.addEventListener("pointerdown", stop);
    root.addEventListener("click", stop);
    root.addEventListener("dblclick", stop);
  }

  function mountParent() {
    return document.fullscreenElement || document.documentElement;
  }

  function placeHost(node) {
    if (!node) return;
    var parent = mountParent();
    if (node.parentNode !== parent) parent.appendChild(node);
  }

  function writeCache(rect) {
    cacheGeneration = layoutGeneration;
    cacheAt = performance.now();
    cacheL = rect.left;
    cacheT = rect.top;
    cacheR = rect.right;
    cacheB = rect.bottom;
    cacheW = rect.width;
    cacheH = rect.height;
    hasCache = cacheW > 0 && cacheH > 0;
  }

  function pointInRect(rect, x, y) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function fieldNode(node) {
    if (node && node.nodeType === 3) node = node.parentElement;
    if (!(node instanceof Element)) return false;
    if (node === host || node === photoHost || node === toastHost) return false;
    return !!node.closest("textarea, input, [contenteditable]");
  }

  function onReelPath() {
    var path = location.pathname;
    return path.indexOf("/reels/") !== -1 || path.indexOf("/reel/") !== -1;
  }

  function onStoryPath() {
    return location.pathname.indexOf("/stories/") !== -1;
  }

  function onDmPath() {
    return IY.isDmPath(location.pathname);
  }

  // Direct messages show small avatars and stickers; only real media gets controls.
  function photoSized(rect) {
    if (onDmPath()) return IY.isDmSized(rect.width, rect.height);
    return rect.width > 200 && rect.height >= 1;
  }

  function syncPathClass() {
    if (!host) return;
    var reel = onReelPath() || reelColumn;
    var story = onStoryPath();
    if (reel !== wasReel) {
      wasReel = reel;
      host.classList.toggle("iy-reel", reel);
    }
    if (story !== wasStory) {
      wasStory = story;
      host.classList.toggle("iy-story", story);
      if (!story) setLift(0);
    }
  }

  function setLift(px) {
    if (px === liftPx) return;
    liftPx = px;
    if (host) host.style.setProperty("--iy-lift", px + "px");
  }

  // Never identify calls by size alone: small ordinary media exists too.
  function callRoute() {
    return /^\/(?:direct\/(?:t\/[^/]+\/)?|)(?:call|calls|video_call|videocall|video_chat|rtc)(?:\/|$)/i.test(location.pathname);
  }

  function callMedia(el) {
    if (callRoute()) return true;
    if (!el) return false;
    if (el.srcObject && typeof el.srcObject.getTracks === "function") return true;
    return !!(el.closest && el.closest(CALL_SELECTOR));
  }

  var CALL_SELECTOR = '[role="dialog"][aria-label*="call" i], [role="dialog"][aria-label*="arama" i], [data-call-id]';
  var callState = false, callAt = -Infinity, callPath = "";
  // Hot pointer/placement paths consume cached state only; discrete events refresh.
  function inCall(refresh) {
    if (callRoute()) return true;
    var now = performance.now();
    if (refresh && (callPath !== location.pathname || now - callAt >= 500)) {
      callPath = location.pathname;
      callAt = now;
      callState = !!document.querySelector(CALL_SELECTOR);
    }
    return callPath === location.pathname && callState;
  }

  function leaveCallAlone() {
    if (!inCall()) {
      // A recycled stream invalidates only its own controls, not the page.
      if (active && callMedia(active)) dropActive();
      return false;
    }
    if (active) dropActive();
    hidePhoto();
    return true;
  }

  function controlScope(el) {
    var root = el.closest("article, [role='dialog'], section");
    if (root) return root;
    root = el.parentElement;
    for (var i = 0; i < 3 && root && root.parentElement; i++) {
      if (/^(MAIN|BODY|HTML)$/.test(root.parentElement.tagName)) break;
      root = root.parentElement;
    }
    return root;
  }

  var nativeSounds = [];
  var soundCandidates = [];
  var reelColumn = false;
  var photoTop = 0;
  var photoLift = 0;
  function restoreNativeSounds() {
    for (var i = 0; i < nativeSounds.length; i++) {
      var saved = nativeSounds[i];
      if (saved.node.getAttribute("style") === saved.applied) {
        if (saved.original === null) saved.node.removeAttribute("style");
        else saved.node.setAttribute("style", saved.original);
        continue;
      }
      if (saved.value) saved.node.style.setProperty("visibility", saved.value, saved.priority);
      else saved.node.style.removeProperty("visibility");
      if (saved.empty && !saved.node.getAttribute("style")) saved.node.removeAttribute("style");
    }
    nativeSounds = [];
  }

  function isSoundButton(node) {
    var label = node.getAttribute("aria-label") || "";
    var svg = node.querySelector("svg[aria-label]");
    var pattern = /^(mute|unmute|turn (?:sound|audio) (?:on|off)|sound (?:on|off)|audio (?:on|off)|toggle audio|toggle sound|sesi a\u00e7|sesi kapat|ses a\u00e7|ses kapat)$/i;
    return pattern.test(label.trim()) || !!(svg && pattern.test((svg.getAttribute("aria-label") || "").trim()));
  }

  // Only on show/activation/resize. No main/document-wide button scan.
  function nativeControlLift(rect) {
    restoreNativeSounds();
    if (!active) return 0;
    var scope = controlScope(active);
    if (!scope) return 0;
    var top = Infinity;
    soundCandidates = [];
    reelColumn = false;
    var column = [];
    var nodes = scope.querySelectorAll("button, [role='button']");
    for (var i = 0; i < nodes.length && i < 80; i++) {
      var n = nodes[i];
      if (n === host || (host && host.contains(n))) continue;
      var r = n.getBoundingClientRect();
      if (r.width < 8 || r.height < 8 || r.width > rect.width * 0.5) continue;
      if (r.left < rect.left || r.right > rect.right || r.top < rect.top || r.bottom > rect.bottom) continue;
      if (isSoundButton(n) || /^(sound|audio)$/i.test((n.textContent || "").trim())) soundCandidates.push({node: n, video: active});
      if (isSoundButton(n)) {
        nativeSounds.push({ node: n, original: n.getAttribute("style"), value: n.style.getPropertyValue("visibility"), priority: n.style.getPropertyPriority("visibility"), empty: !n.hasAttribute("style") });
        n.style.setProperty("visibility", "hidden", "important");
        nativeSounds[nativeSounds.length - 1].applied = n.getAttribute("style");
      } else {
        if (r.left >= rect.right - 72 && r.width <= 56) column.push(r);
        if (r.bottom > rect.bottom - 64 && r.top < top) top = r.top;
      }
    }
    reelColumn = column.some(function (a) { return column.some(function (b) { return Math.abs(a.left - b.left) < 16 && Math.abs(a.top - b.top) >= 48; }); });
    syncPathClass();
    return top === Infinity ? 0 : clampLift(rect, top);
  }

  function clampLift(rect, top) {
    return Math.max(0, Math.min(Math.ceil(rect.bottom - top), rect.height - 104));
  }

  function storyBounds(el) {
    var scope = controlScope(el);
    var r = scope && scope.getBoundingClientRect();
    return {top: Math.max(0, r ? r.top : 0), bottom: Math.min(window.innerHeight, r ? r.bottom : window.innerHeight)};
  }

  function storyLift(rect, el) {
    var card = storyBounds(el);
    var top = card.bottom - 72;
    var scope = controlScope(el);
    var nodes = scope ? scope.querySelectorAll("textarea, input, [contenteditable], button, [role='button']") : [];
    for (var i = 0; i < nodes.length && i < 80; i++) {
      var r = nodes[i].getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || r.right <= rect.left || r.left >= rect.right) continue;
      if (r.bottom >= card.bottom - 32 && r.top >= card.bottom - 140) top = Math.min(top, r.top);
    }
    return clampLift(rect, top);
  }

  function computeLift(rect) {
    var lift = nativeControlLift(rect);
    var top = onStoryPath() ? Math.max(rect.top, storyBounds(active).top + 64) : rect.top + 8;
    if (onStoryPath()) lift = Math.max(lift, storyLift(rect, active));
    setLift(lift);
    var room = rect.bottom - lift - 58 - top;
    host.style.setProperty("--iy-menu-room", Math.max(0, Math.floor(room)) + "px");
    return room >= 36;
  }

  function buildBar() {
    host = document.createElement("div");
    host.className = "iy-host";
    var root = host.attachShadow({ mode: "closed" });
    var style = document.createElement("style");
    style.textContent = barCss() + "\n" + pillCss();

    bar = document.createElement("div");
    bar.className = "bar";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", labels.bar);
    bar.setAttribute("aria-hidden", "true");

    playBtn = makeButton(labels.play, "btn icon play");
    playIcon = icon("M8.5 5.75v12.5L18 12 8.5 5.75z");
    pauseIcon = icon("M8 5.5v13M16 5.5v13");
    pauseIcon.toggleAttribute("hidden", !!(true));
    playBtn.appendChild(playIcon);
    playBtn.appendChild(pauseIcon);

    var backBtn = makeButton(labels.back, "btn seek");
    backBtn.textContent = "\u22125";
    var fwdBtn = makeButton(labels.forward, "btn seek");
    fwdBtn.textContent = "+5";

    chip = makeButton(labels.speed + " " + formatSpeed(speed), "chip");
    chip.textContent = formatSpeed(speed);
    chip.setAttribute("aria-haspopup", "listbox");
    chip.setAttribute("aria-expanded", "false");

    progress = document.createElement("div");
    progress.className = "progress";
    progress.setAttribute("role", "slider");
    progress.tabIndex = 0;
    progress.setAttribute("aria-label", labels.progress);
    progress.setAttribute("aria-valuemin", "0");
    progress.setAttribute("aria-valuemax", "1000");
    progress.setAttribute("aria-valuenow", "0");
    buffer = document.createElement("div");
    buffer.className = "buffer";
    fill = document.createElement("div");
    fill.className = "fill";
    tooltip = document.createElement("div");
    tooltip.className = "tooltip";
    tooltip.setAttribute("aria-hidden", "true");
    progress.appendChild(buffer);
    progress.appendChild(fill);
    progress.appendChild(tooltip);

    timeEl = document.createElement("span");
    timeEl.className = "time";
    timeEl.dir = "ltr";
    timeEl.textContent = "0:00 / 0:00";

    muteBtn = makeButton(labels.mute, "btn icon mute");
    soundIcon = icon("M4.5 9.5h3.2L12 5.8v12.4l-4.3-3.7H4.5zM15.6 9.1a4.2 4.2 0 0 1 0 5.8M17.8 7a7 7 0 0 1 0 10");
    muteIcon = icon("M4.5 9.5h3.2L12 5.8v12.4l-4.3-3.7H4.5zM16 10l4 4M20 10l-4 4");
    muteIcon.toggleAttribute("hidden", !!(true));
    muteBtn.appendChild(soundIcon);
    muteBtn.appendChild(muteIcon);

    volume = document.createElement("input");
    volume.type = "range";
    volume.className = "vol";
    volume.min = "0";
    volume.max = "1";
    volume.step = "0.05";
    volume.value = "1";
    volume.setAttribute("aria-label", labels.volume);

    loopBtn = makeButton(labels.loop, "btn icon loop");
    loopBtn.appendChild(icon("M17 2.5l3.5 3.5L17 9.5M4 11V9.5A3.5 3.5 0 0 1 7.5 6H20M7 21.5 3.5 18 7 14.5M20 13v1.5A3.5 3.5 0 0 1 16.5 18H4"));
    loopBtn.setAttribute("aria-pressed", "false");

    pipBtn = makeButton(labels.pip, "btn icon pip");
    pipBtn.appendChild(icon("M4.5 6.5h15v12h-15zM13.25 12.75h5.25v4.5h-5.25z"));
    pipBtn.setAttribute("aria-pressed", "false");

    volume.title = labels.volumeHint;

    var dlBtn = downloadButton = makeButton(labels.download, "btn icon download");
    syncDownloadButton(dlBtn);
    dlBtn.appendChild(icon("M12 4.75v9.5M8.25 10.5 12 14.25 15.75 10.5M5 19.25h14"));

    toolsBtn = makeButton(labels.more, "btn icon tools-btn");
    toolsBtn.appendChild(icon("M5.5 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0M11 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0M16.5 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0"));
    toolsBtn.setAttribute("aria-haspopup", "menu");
    toolsBtn.setAttribute("aria-expanded", "false");

    pill = document.createElement("div");
    pill.className = "pill";
    pill.setAttribute("aria-hidden", "true");

    bar.appendChild(playBtn);
    bar.appendChild(backBtn);
    bar.appendChild(chip);
    bar.appendChild(fwdBtn);
    bar.appendChild(progress);
    bar.appendChild(timeEl);
    var sound = document.createElement("div");
    sound.className = "sound";
    var volumePanel = document.createElement("div");
    volumePanel.className = "volume-panel";
    sound.appendChild(muteBtn);
    volumePanel.appendChild(volume);
    sound.appendChild(volumePanel);
    bar.appendChild(loopBtn);
    bar.appendChild(sound);
    bar.appendChild(pipBtn);
    bar.appendChild(dlBtn);
    bar.appendChild(toolsBtn);
    root.appendChild(style);
    var frame = document.createElement("div");
    frame.className = "frame";
    frame.appendChild(bar);
    root.appendChild(frame);
    root.appendChild(pill);
    stopInside(root);
    root.addEventListener("pointerdown", closeOutsideDownload);

    playBtn.addEventListener("click", function () {
      try { togglePlay(); } catch (err) {}
    });
    backBtn.addEventListener("click", function () {
      try { seekBy(-5); } catch (err) {}
    });
    fwdBtn.addEventListener("click", function () {
      try { seekBy(5); } catch (err) {}
    });
    chip.addEventListener("click", function () {
      try {
        if (menuOpen && openEl === menu) closeMenu();
        else { ensureSpeedMenu(); openMenu(menu, chip); }
        syncVisibility();
      } catch (err) {}
    });
    toolsBtn.addEventListener("click", function () {
      try {
        if (menuOpen && openEl === toolsMenu) closeMenu();
        else {
          ensureToolsMenu();
          syncTools();
          openMenu(toolsMenu, toolsBtn);
        }
        syncVisibility();
      } catch (err) {}
    });
    bar.addEventListener("wheel", onBarWheel, { passive: false });
    progress.addEventListener("pointerdown", onProgressDown);
    progress.addEventListener("pointermove", onProgressMove);
    progress.addEventListener("pointerup", endScrub);
    progress.addEventListener("pointercancel", endScrub);
    progress.addEventListener("lostpointercapture", endScrub);
    progress.addEventListener("pointerleave", onProgressLeave);
    muteBtn.addEventListener("click", function () {
      try { toggleMute(); } catch (err) {}
    });
    volume.addEventListener("input", onVolumeInput);
    volume.addEventListener("wheel", onVolumeWheel, { passive: false });
    muteBtn.addEventListener("wheel", onVolumeWheel, { passive: false });
    loopBtn.addEventListener("click", function () {
      try { toggleLoop(); } catch (err) {}
    });
    pipBtn.addEventListener("click", function () {
      try { togglePip(); } catch (err) {}
    });
    dlBtn.addEventListener("click", function (e) {
      if (active) onDownloadButton(active, dlBtn, bar, e);
    });
    updateChip();
  }

  // Built on first open: nothing to pay until the tools are used.
  function ensureSpeedMenu() {
    if (menu) return;
    menu = document.createElement("div");
    menu.className = "menu";
    menu.hidden = true;
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", labels.speed);
    menuItems = [];
    for (var i = 0; i < SPEEDS.length; i++) {
      var item = document.createElement("button");
      item.type = "button";
      item.className = "menu-item";
      item.setAttribute("role", "option");
      item.dataset.speed = String(SPEEDS[i]);
      item.textContent = formatSpeed(SPEEDS[i]);
      item.setAttribute("aria-label", labels.speed + " " + formatSpeed(SPEEDS[i]));
      menu.appendChild(item);
      menuItems.push(item);
    }

    menu.addEventListener("click", function (e) {
      try {
        var btn = e.target && e.target.closest ? e.target.closest(".menu-item") : null;
        if (!btn) return;
        applySpeed(btn.dataset.speed, true);
        closeMenu();
        syncVisibility();
      } catch (err) {}
    });
    bar.appendChild(menu);
    updateChip();
  }

  function ensureToolsMenu() {
    if (toolsMenu || !bar) return;
    toolsMenu = document.createElement("div");
    toolsMenu.className = "menu tools";
    toolsMenu.hidden = true;
    toolsMenu.setAttribute("role", "menu");
    toolsMenu.setAttribute("aria-label", labels.more);
    toolItems = {};
    var tools = [
      ["zoomIn", labels.zoomIn, "Z"],
      ["zoomOut", labels.zoomOut, "⇧Z"],
      ["rotate", labels.rotate, "R"],
      ["fill", labels.fill, "C"],
      ["ab", labels.ab, "A"],
      ["loop", labels.loop, "L"],
      ["fullscreen", labels.fullscreen, "F"],
      ["reset", labels.reset, "0"],
      ["downloadAll", labels.downloadAll, "⇧D"],
      ["capture", labels.capture, "⇧X"],
      ["pip", labels.pip, "P"],
      ["back", labels.back, "\u2190"],
      ["forward", labels.forward, "\u2192"],
      ["speed", labels.speed, "\u21e7, / \u21e7."],
      ["download", labels.download, "D"]
    ];
    for (var ti = 0; ti < tools.length; ti++) {
      var tool = document.createElement("button");
      tool.type = "button";
      tool.className = "menu-item";
      tool.setAttribute("role", "menuitem");
      tool.dataset.act = tools[ti][0];
      var name = document.createElement("span");
      name.textContent = tools[ti][1];
      var kbd = document.createElement("span");
      kbd.className = "key";
      kbd.textContent = tools[ti][2];
      tool.appendChild(name);
      tool.appendChild(kbd);
      toolsMenu.appendChild(tool);
      toolItems[tools[ti][0]] = tool;
    }

    toolsMenu.addEventListener("click", onToolsClick);
    bar.appendChild(toolsMenu);
  }

  function onToolsClick(e) {
    try {
      var btn = e.target && e.target.closest ? e.target.closest(".menu-item") : null;
      if (!btn) return;
      var act = btn.dataset.act;
      closeMenu();
      if (act === "speed") { ensureSpeedMenu(); openMenu(menu, toolsBtn); return; }
      var text = runTool(act);
      if (text) flash(text);
      else syncVisibility();
    } catch (err) {}
  }

  function buildPhoto() {
    photoHost = document.createElement("div");
    photoHost.className = "iy-photo";
    photoHost.setAttribute("aria-hidden", "true");
    var root = photoHost.attachShadow({ mode: "closed" });
    var style = document.createElement("style");
    style.textContent = barCss() + "\n" + photoCss();
    var button = photoButton = makeButton(labels.download, "photo");
    syncDownloadButton(button);
    button.appendChild(icon("M12 4.75v9.5M8.25 10.5 12 14.25 15.75 10.5M5 19.25h14"));
    root.appendChild(style);
    root.appendChild(button);
    stopInside(root);
    root.addEventListener("pointerdown", closeOutsideDownload);
    button.addEventListener("click", function (e) {
      if (photoImg) onDownloadButton(photoImg, button, root, e);
    });
  }

  function syncDownloadButton(button) {
    if (!button) return;
    var hasMenu = !oneClickDownload && !onDmPath();
    button.setAttribute("aria-haspopup", hasMenu ? "menu" : "false");
    button.setAttribute("aria-expanded", String(hasMenu && openAnchor === button));
    button.title = hasMenu ? labels.download : labels.downloadHint;
  }

  function onDownloadButton(media, anchor, parent, event) {
    if (openAnchor === anchor) { closeMenu(); return; }
    if (!live || !media.isConnected) return;
    if (oneClickDownload || event.shiftKey || onDmPath()) {
      download(media, !!event.shiftKey);
      return;
    }
    closeMenu();
    var path = location.pathname;
    var src = media.currentSrc || media.src;
    var poster = media.poster;
    var identity = identityFrom(media);
    var panel = document.createElement("div");
    panel.className = "menu tools download-menu";
    panel.setAttribute("role", "menu");
    panel.setAttribute("aria-label", labels.download);
    function current() {
      if (!live || !media.isConnected || (media !== active && media !== photoImg) ||
          location.pathname !== path || (media.currentSrc || media.src) !== src || media.poster !== poster) return false;
      var now = identityFrom(media);
      return now?.code === identity?.code && now?.pk === identity?.pk;
    }
    function item(label, action) {
      var btn = makeButton(label, "menu-item");
      btn.textContent = label;
      btn.setAttribute("role", "menuitem");
      btn.addEventListener("click", function () {
        var valid = current();
        closeMenu();
        anchor.focus({ preventScroll: true });
        if (valid) Promise.resolve(action()).catch(function () {}); // Actions display their own errors.
      });
      panel.appendChild(btn);
      return btn;
    }
    var first = item(t("playerDownloadItem", "Bu öğeyi indir"), function () { return download(media, false); });
    var all = item(t("playerDownloadAll", "Hepsini indir"), function () { return IY.actions.downloadAll(media); });
    all.hidden = true;
    if (audioMp3 && media instanceof HTMLVideoElement) {
      item(t("setAudioMp3", "Sesi MP3 olarak kaydet"), async function () {
        if (!IY.saveSound?.run) await IY.core.lazy?.load("saveSound");
        if (audioMp3 && current() && IY.saveSound?.run) return IY.saveSound.run(media);
        if (audioMp3 && current()) showToast(freshToast("err"));
      });
    }
    item(t("playerCopyLink", "Bağlantıyı kopyala"), function () { return IY.actions.copyMediaUrl(media); });
    if (media instanceof HTMLImageElement) {
      item(t("mediaViewFull", "Tam boyutta aç"), function () { return IY.actions.openZoom(media); });
    }
    panel.addEventListener("keydown", function (e) {
      var items = Array.from(panel.children).filter(function (btn) { return !btn.hidden; });
      var index = items.indexOf(e.target);
      if (e.key === "ArrowDown") index = (index + 1) % items.length;
      else if (e.key === "ArrowUp") index = (index + items.length - 1) % items.length;
      else if (e.key === "Home") index = 0;
      else if (e.key === "End") index = items.length - 1;
      else return;
      e.preventDefault();
      e.stopPropagation();
      items[index].focus();
    });
    panel.addEventListener("focusout", function (e) {
      if (openEl === panel && e.relatedTarget !== anchor && !panel.contains(e.relatedTarget)) closeMenu();
    });
    panel.hidden = true;
    parent.appendChild(panel);
    openMenu(panel, anchor);
    if (openEl !== panel) { panel.remove(); return; }
    downloadMenu = panel;
    first.focus({ preventScroll: true });
    // Loading these modules on click also works with the hover toolbar disabled.
    (async function () {
      if (IY.actions?.__lazy) await IY.core.lazy.load("actions");
      if (openEl !== panel || !current()) return;
      var multiple = await IY.actions?.hasMultiple(media, { offline: false });
      if (openEl === panel && current()) all.hidden = !multiple;
    })().catch(function () {});
  }

  function updateChip() {
    if (!chip) return;
    var shown = rateFor(active);
    var text = formatSpeed(shown);
    var label = labels.speed + " " + text;
    chip.textContent = text;
    chip.setAttribute("aria-label", label);
    chip.title = label;
    for (var i = 0; i < menuItems.length; i++) {
      var on = Number(menuItems[i].dataset.speed) === shown;
      menuItems[i].classList.toggle("is-on", on);
      menuItems[i].setAttribute("aria-selected", on ? "true" : "false");
    }
  }

  function openMenu(el, anchor) {
    if (!el || !anchor || leaveCallAlone()) return;
    closeMenu();
    // "Sesi MP3 olarak kaydet" (off by default): save-sound.js adds or removes its item for the
    // active video each time the tools menu opens. Its failure never blocks the menu.
    if (el === toolsMenu && globalThis.IY && IY.saveSound && typeof IY.saveSound.mountMenu === "function") {
      try { IY.saveSound.mountMenu(el, function () { return active; }, closeMenu); } catch (err) {}
    }
    el.hidden = false;
    menuOpen = true;
    openEl = el;
    openAnchor = anchor;
    anchor.setAttribute("aria-expanded", "true");
    if (anchor === photoButton) return;
    try {
      var br = bar.getBoundingClientRect();
      var cr = anchor.getBoundingClientRect();
      var x = cr.left - br.left;
      // Keep a right-side menu inside the bar.
      var room = br.width - el.offsetWidth;
      if (x > room) x = room;
      if (x < 0) x = 0;
      el.style.transform = "translate3d(" + Math.round(x) + "px,0,0)";
    } catch (err) {}
  }

  function closeMenu() {
    if (!menuOpen) return;
    menuOpen = false;
    if (openEl) openEl.hidden = true;
    if (downloadMenu) { downloadMenu.remove(); downloadMenu = null; }
    if (openAnchor) openAnchor.setAttribute("aria-expanded", "false");
    openEl = null;
    openAnchor = null;
  }

  function applySpeed(value, persist) {
    if (leaveCallAlone()) return;
    speed = nearestSpeed(value);
    if (persist && active) {
      // The user's pick wins for this video, whatever the default is.
      var st = speedStateOf(active);
      st.src = active.currentSrc || active.src || "";
      st.user = true;
      st.rate = speed;
    }
    updateChip();
    if (live && active) {
      try { active.playbackRate = rateFor(active); } catch (err) {}
    }
    if (persist) {
      try { chrome.storage.local.set({ speed: speed }); } catch (err) {}
    }
  }

  function stepSpeed(dir) {
    var next = (speedIndex() + dir) % SPEEDS.length;
    if (next < 0) next += SPEEDS.length;
    applySpeed(SPEEDS[next], true);
  }

  function resetPaint() {
    lastPct = -1;
    lastBuf = -1;
    lastSec = -1;
    lastDur = -1;
  }

  function scaleValue(n) {
    if (n <= 0) return "0";
    if (n >= 1000) return "1";
    var prefix = n < 10 ? "0.00" : n < 100 ? "0.0" : "0.";
    while (n % 10 === 0) n = (n / 10) | 0;
    return prefix + n;
  }

  function paintProgress() {
    if (!active || !progress || !fill || !buffer || !timeEl || scrubbing) return;
    var dur = active.duration;
    var cur = active.currentTime;
    if (!Number.isFinite(cur) || cur < 0) cur = 0;
    var known = Number.isFinite(dur) && dur > 0 && dur !== Infinity;
    var ratio = known ? cur / dur : 0;
    if (ratio < 0) ratio = 0;
    if (ratio > 1) ratio = 1;
    var bufRatio = ratio;
    if (known) {
      try {
        var ranges = active.buffered;
        var end = 0;
        for (var i = 0; i < ranges.length; i++) {
          var start = ranges.start(i);
          var rangeEnd = ranges.end(i);
          if (start <= cur && cur <= rangeEnd) {
            end = rangeEnd;
            break;
          }
          if (rangeEnd > end) end = rangeEnd;
        }
        bufRatio = end / dur;
      } catch (err) {}
    }
    if (bufRatio < ratio) bufRatio = ratio;
    if (bufRatio > 1) bufRatio = 1;
    var pct = Math.round(ratio * 1000);
    var buf = Math.round(bufRatio * 1000);
    if (pct !== lastPct) {
      lastPct = pct;
      fill.style.transform = "scaleX(" + scaleValue(pct) + ")";
    }
    if (buf !== lastBuf) {
      lastBuf = buf;
      buffer.style.transform = "scaleX(" + scaleValue(buf) + ")";
    }
    var sec = Math.floor(cur);
    var dsec = known ? Math.floor(dur) : 0;
    if (sec !== lastSec || dsec !== lastDur) {
      lastSec = sec;
      lastDur = dsec;
      timeEl.textContent = fmt(sec) + " / " + fmt(dsec);
      progress.setAttribute("aria-valuenow", String(pct));
      progress.setAttribute("aria-valuemax", "1000");
    }
  }

  function syncPlay() {
    if (!playBtn) return;
    var on = !!(active && !active.paused && !active.ended);
    var label = on ? labels.pause : labels.play;
    playBtn.setAttribute("aria-label", label);
    playBtn.title = label;
    if (playIcon) playIcon.toggleAttribute("hidden", !!(on));
    if (pauseIcon) pauseIcon.toggleAttribute("hidden", !!(!on));
  }

  function syncLoop() {
    if (!loopBtn) return;
    var on = !!(active && active.loop);
    loopBtn.classList.toggle("is-on", on);
    loopBtn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function syncVolume() {
    if (!active) return;
    var muted = !!active.muted || active.volume === 0;
    if (volume) {
      volume.value = muted ? "0" : String(active.volume);
      volume.style.setProperty("--p", (Number(volume.value) * 100) + "%");
    }
    if (muteBtn) {
      var label = muted ? labels.unmute : labels.mute;
      muteBtn.setAttribute("aria-label", label);
      muteBtn.title = label;
      muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
      muteBtn.classList.toggle("is-on", muted);
    }
    if (muteIcon) muteIcon.toggleAttribute("hidden", !!(!muted));
    if (soundIcon) soundIcon.toggleAttribute("hidden", !!(muted));
  }

  function syncPip() {
    if (!pipBtn) return;
    pipBtn.hidden = !pipSupported();
    var on = false;
    try { on = !!(active && document.pictureInPictureElement === active); } catch (err) { on = false; }
    pipBtn.classList.toggle("is-on", on);
    pipBtn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function syncControls() {
    updateChip();
    syncPlay();
    syncVolume();
    syncLoop();
    syncPip();
    resetPaint();
    paintProgress();
  }

  function bindActive(v) {
    if (autoAdvance) bindAdvance(v);
    v.addEventListener("play", onActiveMedia);
    v.addEventListener("pause", onActiveMedia);
    v.addEventListener("ended", onActiveMedia);
    v.addEventListener("durationchange", onActiveMedia);
  }

  function unbindActive() {
    if (!active) return;
    unbindAdvance(active);
    active.removeEventListener("play", onActiveMedia);
    active.removeEventListener("pause", onActiveMedia);
    active.removeEventListener("ended", onActiveMedia);
    active.removeEventListener("durationchange", onActiveMedia);
  }

  function soundZone(v) {
    if (onReelPath() || onStoryPath()) return true;
    return !!v.closest("article, [role='dialog']");
  }

  function mostlyVisible(v, measured) {
    var r = measured || v === active && hasCache && cacheGeneration === layoutGeneration && performance.now() - cacheAt < 100 ? cachedRect() : v.getBoundingClientRect();
    if (r.width < MIN_W || r.height < MIN_H) return false;
    var vw = window.innerWidth || 0;
    var vh = window.innerHeight || 0;
    var w = Math.min(r.right, vw) - Math.max(r.left, 0);
    var h = Math.min(r.bottom, vh) - Math.max(r.top, 0);
    return w >= r.width * 0.5 && h >= r.height * 0.5;
  }

  function canUnmute() {
    // Unmuting without a prior user gesture makes Chrome pause the video.
    try {
      var ua = navigator.userActivation;
      return !ua || ua.hasBeenActive;
    } catch (err) {
      return true;
    }
  }

  function isSilent(v) {
    return !!v.muted || v.volume === 0;
  }

  function differsFromPref(v) {
    if (prefVolume > 0 && Math.abs(v.volume - prefVolume) > 0.001) return true;
    if (prefMuted === true && !v.muted) return true;
    if (prefMuted === false && isSilent(v)) return true;
    return false;
  }

  function applyPref(v) {
    if (!rememberSound || callMedia(v) || inCall()) return;
    try {
      if (prefVolume > 0 && Math.abs(v.volume - prefVolume) > 0.001) v.volume = prefVolume;
      if (prefMuted === true && !v.muted) v.muted = true;
      else if (prefMuted === false && canUnmute()) {
        if (v.volume === 0) v.volume = prefVolume > 0 ? prefVolume : 1;
        if (v.muted) v.muted = false;
      }
    } catch (err) {}
  }

  function bookOf(v) {
    var b = seen.get(v);
    if (!b) {
      b = { at: 0, n: 0, w: 0 };
      seen.set(v, b);
    }
    return b;
  }

  function gestureOn(v, now) {
    return now - gestureAt <= GESTURE_MS && gestureVideo === v &&
      nativeSounds.length === 0;
  }

  function onAnyVolume(e) {
    try {
      var v = e.target;
      inCall(true);
      if (!live || leaveCallAlone() || !(v instanceof HTMLVideoElement) || callMedia(v)) return;
      if (v === active) syncVolume();
      if (!rememberSound || !v.isConnected || !soundZone(v)) return;
      var now = performance.now();
      var b = seen.get(v);
      var fresh = !!b && now - b.at < FRESH_MS;
      // A visible sound button (pointer or Enter/Space) is the user's choice,
      // even while the video is fresh. Anything else is Instagram applying its
      // stale state to a new or recycled video.
      var heard = soundVideo === v && now - soundAt <= GESTURE_MS;
      if (heard || (!fresh && now - gestureAt <= GESTURE_MS && gestureOn(v, now))) {
        var silent = isSilent(v);
        var patch = {};
        var write = false;
        if (prefMuted !== silent) {
          prefMuted = silent;
          patch.muted = silent;
          write = true;
        }
        if (heard && v.volume > 0 && Math.abs(v.volume - prefVolume) > 0.001) {
          prefVolume = v.volume;
          patch.volume = prefVolume;
          write = true;
        }
        if (write) saveUi(patch);
        if (!heard && !silent && prefVolume > 0 && Math.abs(v.volume - prefVolume) > 0.001) applyPref(v);
        return;
      }
      if ((prefMuted === null && prefVolume <= 0) || !differsFromPref(v)) return;
      if (v.paused) return;
      b = bookOf(v);
      if (b.visibleAt === undefined || now - b.visibleAt >= 200) {
        b.visible = mostlyVisible(v);
        b.visibleAt = now;
      }
      if (!b.visible) return;
      // Never fight a loop: a few corrections per window, then yield.
      if (now - b.w > ENFORCE_WINDOW_MS) {
        b.w = now;
        b.n = 0;
      }
      if (b.n >= ENFORCE_MAX) return;
      b.n += 1;
      applyPref(v);
    } catch (err) {}
  }

  function onGesture(e) {
    if (!e.isTrusted) return;
    try {
      gestureVideo = null;
      soundVideo = null;
      inCall(true);
      var keyboard = e.type === "keydown";
      if (keyboard && e.key !== "Enter" && e.key !== " " && e.code !== "Space") {
        gestureAt = performance.now();
        return;
      }
      if (e.target === host || e.target === photoHost) {
        gestureAt = performance.now();
        gestureX = e.clientX;
        gestureY = e.clientY;
        return;
      }
      var node = e.target && e.target.closest && e.target.closest("button, [role='button']");
      if (node && node !== host && node !== photoHost) {
        var hidden = false;
        for (var i = 0; i < nativeSounds.length; i++) if (nativeSounds[i].node === node) hidden = true;
        if (!hidden && (isSoundButton(node) || /^(sound|audio)$/i.test((node.textContent || "").trim()))) {
          var scope = typeof controlScope === "function" ? controlScope(node) : (node.closest ? node.closest("article, [role='dialog'], section") : null);
          var video = active;
          if (scope && scope.querySelectorAll) {
            var list = scope.querySelectorAll("video");
            var best = null;
            var bestScore = 1e9;
            for (var j = 0; j < list.length; j++) {
              var score = soundDistance(node, list[j]);
              if (score < bestScore) { bestScore = score; best = list[j]; }
            }
            if (best) video = best;
          }
          gestureVideo = video;
          soundVideo = video;
          soundAt = performance.now();
        }
      }
      gestureAt = performance.now();
      gestureX = e.clientX;
      gestureY = e.clientY;
    } catch (err) {}
  }

  function soundDistance(a, b) {
    var hops = 0;
    var chain = [];
    var x = a;
    while (x && hops < 48) { chain.push(x); x = x.parentNode; hops++; }
    var y = b;
    var down = 0;
    while (y && down < 48) {
      for (var k = 0; k < chain.length; k++) if (chain[k] === y) return k + down;
      y = y.parentNode;
      down++;
    }
    return 1000;
  }

  function saveUi(patch) {
    uiPatch = Object.assign(uiPatch || {}, patch);
    if (uiTimer) return;
    uiTimer = setTimeout(flushUi, SAVE_MS);
  }

  function flushUi() {
    uiTimer = 0;
    var patch = uiPatch;
    uiPatch = null;
    if (!patch) return;
    try {
      chrome.storage.local.get("ui", function (data) {
        try {
          if (chrome.runtime.lastError) return;
          var cur = data && data.ui && typeof data.ui === "object" ? data.ui : {};
          chrome.storage.local.set({ ui: Object.assign({}, cur, patch) });
        } catch (err) {}
      });
    } catch (err) {}
  }

  function readUi(ui, cfg) {
    if (!ui || typeof ui !== "object") ui = {};
    if (oneClickDownload !== (ui.oneClickDownload === true) || audioMp3 !== (ui.audioMp3 === true)) closeMenu();
    oneClickDownload = ui.oneClickDownload === true;
    audioMp3 = ui.audioMp3 === true;
    photoToolbar = ui.mediaToolbar !== false && cfg?.mediaToolbar !== false;
    syncDownloadButton(downloadButton);
    syncDownloadButton(photoButton);
    if (photoOn && photoToolbar && !onStoryPath() && !onDmPath()) hidePhoto();
    advanceWanted = ui.autoAdvance === true;
    setAutoAdvance(live && advanceWanted);
    storyPauseWanted = ui.storyPause === true;
    syncStoryPause();
    noAutoplayWanted = ui.noAutoplay === true;
    var ds = defaultSpeedNormalise(ui.defaultSpeed);
    if (ds !== defaultSpeed) {
      defaultSpeed = ds;
      if (live && active && !callMedia(active)) {
        try { active.playbackRate = rateFor(active); } catch (err) {}
        updateChip();
      }
    }
    if (!noAutoplayWanted) { apGestureTarget = null; apFlashNode = null; }
    rememberSound = ui.rememberSound !== false;
    // A pending local write is newer than what storage echoes back.
    var pend = uiPatch || {};
    if (!("muted" in pend)) prefMuted = typeof ui.muted === "boolean" ? ui.muted : null;
    if (!("volume" in pend)) {
      var vol = Number(ui.volume);
      prefVolume = Number.isFinite(vol) && vol > 0 && vol <= 1 ? vol : -1;
    }
    var theme = IY.resolveThemeName ? IY.resolveThemeName(ui.theme) : ui.theme || "black";
    if (theme !== themeName) {
      themeName = theme;
      applyTheme();
    }
  }

  // Story auto-pause: press Instagram's own pause control once per item.
  // The state machine is pure so it can be tested without a page.
  function storyPauseStep(state, ev) {
    if (ev.type === "item") {
      if (ev.id !== state.id) {
        state.id = ev.id;
        state.paused = false;
        state.user = false;
        state.tries = 0;
      }
      return false;
    }
    if (ev.type === "user") {
      // The user is already driving this item: never fight them.
      if (!state.paused) state.user = true;
      return false;
    }
    if (ev.type === "tick") {
      if (state.paused || state.user || state.tries >= 15) return false;
      state.tries += 1;
      if (ev.found) {
        state.paused = true;
        return true;
      }
    }
    return false;
  }

  // [Tahmin] Instagram labels the control "Pause" (EN) / "Duraklat" or "Durdur" (TR).

  function findPauseControl() {
    var node = null;
    try { node = document.querySelector(IY.selectors.storyPause); } catch (err) { node = null; }
    if (!node) return null;
    return node.closest('[role="button"], button') || node;
  }

  function storyPauseTick() {
    try {
      if (!live || !storyPauseWanted || !onStoryPath() || leaveCallAlone()) return;
      storyPauseStep(storyPauseState, { type: "item", id: location.pathname });
      var st = storyPauseState;
      if (st.paused || st.user || st.tries >= 15) return;
      var control = findPauseControl();
      if (storyPauseStep(st, { type: "tick", found: !!control })) control.click();
    } catch (err) {}
  }

  // The retry chain runs only on /stories/ with the setting on and the tab
  // visible. It ends once the item is paused, the user took over, or 15
  // tries passed; kickStoryPause() restarts it on the next item.
  function storyPauseActive() {
    return live && storyPauseWanted && !document.hidden && onStoryPath();
  }

  function storyPauseStop() {
    if (storyPauseTimer) {
      clearTimeout(storyPauseTimer);
      storyPauseTimer = 0;
    }
  }

  function storyPauseLoop() {
    storyPauseTimer = 0;
    try {
      if (!storyPauseActive()) return;
      storyPauseTick();
      var st = storyPauseState;
      if (storyPauseActive() && !st.paused && !st.user && st.tries < 15) {
        storyPauseTimer = setTimeout(storyPauseLoop, 400);
      }
    } catch (err) {}
  }

  function kickStoryPause() {
    try {
      if (storyPauseTimer || !storyPauseActive()) return;
      storyPauseTimer = setTimeout(storyPauseLoop, 400);
    } catch (err) {}
  }

  function onStoryUser(e) {
    try {
      if (!e.isTrusted || !storyPauseWanted || !onStoryPath()) return;
      storyPauseStep(storyPauseState, { type: "item", id: location.pathname });
      storyPauseStep(storyPauseState, { type: "user" });
      // The click or key may move to the next item: re-arm for it.
      kickStoryPause();
    } catch (err) {}
  }

  function syncStoryPause() {
    var on = live && storyPauseWanted;
    if (on) kickStoryPause();
    else {
      storyPauseStop();
      storyPauseState = { id: "", paused: false, user: false, tries: 0 };
    }
  }

  // No-autoplay decision, pure. state is per element: { src, user, paused }.
  // Returns true when the caller should pause the element now.
  // ev: { type: "play", src, eligible, user }.
  function noAutoplayStep(state, ev) {
    if (ev.type !== "play") return false;
    if (ev.src !== state.src) {
      // A recycled element with new media is a new item.
      state.src = ev.src;
      state.user = false;
      state.paused = false;
    }
    if (!ev.eligible) return false;
    // A user start is sticky: never re-pause that item.
    if (state.user) return false;
    if (ev.user) {
      state.user = true;
      return false;
    }
    if (state.paused) return false;
    state.paused = true;
    return true;
  }

  // Reels, stories, DMs and calls are never touched.
  function noAutoplayEligible(node) {
    if (onReelPath() || onStoryPath() || onDmPath() || callMedia(node) || inCall()) return false;
    return true;
  }

  // True when a trusted press or key just happened on this video, its post,
  // our bar, or inside a dialog (a post the user just opened).
  function noAutoplayUser(node, now) {
    if (now - apGestureAt > AP_GESTURE_MS) return false;
    var t = apGestureTarget;
    if (!t || typeof t.nodeType !== "number") return false;
    if (t === host || t === photoHost || t === node) return true;
    if (node.closest && node.closest("[role='dialog']")) return true;
    var scope = controlScope(node);
    return !!scope && (scope === t || scope.contains(t));
  }

  function noAutoplayOnPlay(node) {
    if (!noAutoplayWanted) return;
    var st = apStates.get(node);
    if (!st) {
      st = { src: "", user: false, paused: false };
      apStates.set(node, st);
    }
    var eligible = noAutoplayEligible(node);
    var user = eligible && noAutoplayUser(node, performance.now());
    var src = node.currentSrc || node.src || "";
    if (!noAutoplayStep(st, { type: "play", src: src, eligible: eligible, user: user })) return;
    try { node.pause(); } catch (err) {}
    apFlashNode = node;
  }

  function onApGesture(e) {
    if (!e.isTrusted || !noAutoplayWanted) return;
    apGestureAt = performance.now();
    apGestureTarget = e.target;
  }

  function setLevel(value) {
    if (leaveCallAlone()) return;
    if (!active) return false;
    var n = Number(value);
    if (!Number.isFinite(n)) return false;
    n = Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;
    try {
      if (n <= 0) {
        // Zero means mute; the last audible level is kept for the next unmute.
        prefMuted = true;
        active.muted = true;
        saveUi({ muted: true });
      } else {
        prefMuted = false;
        prefVolume = n;
        active.volume = n;
        active.muted = false;
        saveUi({ muted: false, volume: n });
      }
    } catch (err) {
      return false;
    }
    syncVolume();
    return true;
  }

  function nudgeVolume(dir) {
    if (!active) return false;
    var cur = isSilent(active) ? 0 : active.volume;
    return setLevel(cur + dir * VOL_STEP);
  }

  function volText() {
    if (!active || isSilent(active)) return labels.muted;
    var pct = Math.round(active.volume * 100);
    return tSub("pillVolume", pct, "Ses %" + pct);
  }

  function onVolumeWheel(e) {
    if (leaveCallAlone()) return;
    try {
      if (!active || !e.deltaY || e.ctrlKey) return;
      e.preventDefault();
      var dir = 0;
      if (e.deltaMode !== 0) dir = e.deltaY < 0 ? 1 : -1;
      else {
        wheelAcc += e.deltaY;
        if (Math.abs(wheelAcc) < WHEEL_STEP_PX) return;
        dir = wheelAcc < 0 ? 1 : -1;
        wheelAcc = 0;
      }
      if (nudgeVolume(dir)) flash(volText());
    } catch (err) {}
  }

  function hex6(c) {
    return typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);
  }

  function soft(c, alphaHex, pct) {
    return hex6(c) ? c + alphaHex : "color-mix(in srgb, " + c + " " + pct + "%, transparent)";
  }

  function themeTokens() {
    // Green is the built-in theme: no tokens, so the default green CSS fallbacks stay in effect.
    var all = IY.THEMES;
    if (!themeName || themeName === "green" || !all || typeof all !== "object") return null;
    if (!Object.hasOwn(all, themeName)) return null;
    var th = all[themeName];
    if (!th || typeof th !== "object") return null;
    var out = {};
    var ok = function (c) { return typeof c === "string" && c !== "" && c.length < 64 && !/[;{}]/.test(c); };
    if (ok(th.accent)) {
      out["--iy-accent"] = th.accent;
      out["--iy-accent-soft"] = soft(th.accent, "26", 15);
    }
    if (ok(th.surface)) {
      out["--iy-surface"] = th.surface;
      out["--iy-surface-a"] = soft(th.surface, "eb", 92);
    }
    if (ok(th.surfaceRaised)) out["--iy-surface-raised"] = th.surfaceRaised;
    if (ok(th.text)) {
      out["--iy-text"] = th.text;
      if (hex6(th.text)) {
        var r = parseInt(th.text.slice(1, 3), 16);
        var g = parseInt(th.text.slice(3, 5), 16);
        var bl = parseInt(th.text.slice(5, 7), 16);
        // Light text keeps the white ink of the original look; dark text inks with itself.
        out["--iy-ink"] = (r * 0.299 + g * 0.587 + bl * 0.114) > 128 ? "255 255 255" : r + " " + g + " " + bl;
      }
    }
    return out;
  }

  function paintTheme(node, tokens) {
    if (!node) return;
    for (var i = 0; i < TOKENS.length; i++) {
      var name = TOKENS[i];
      if (tokens && tokens[name]) node.style.setProperty(name, tokens[name]);
      else node.style.removeProperty(name);
    }
  }

  function applyTheme() {
    try {
      var tokens = themeTokens();
      paintTheme(host, tokens);
      paintTheme(photoHost, tokens);
      paintTheme(toastHost, tokens);
    } catch (err) {}
  }

  // ---- View tools: zoom/pan, rotate, fill. Only the active video is ever touched,
  // its inline styles are saved before the first write and restored exactly.
  var ZOOM_MAX = 4;
  var ZOOM_STEP = 1.25;
  var FRAME_S = 1 / 30;
  var PAN_SLOP = 4;
  var VIEW_PROPS = ["transform", "transform-origin", "object-fit", "object-view-box"];
  var canViewBox = false;
  // Transform zoom needs a dedicated clipping box. Page parents also contain
  // overlays and controls, so leave those alone and hide zoom when unsupported.
  try { canViewBox = !!(window.CSS && CSS.supports("object-view-box", "inset(0)")); } catch (err) { canViewBox = false; }
  var view = null;
  var viewBound = false;
  var pan = null;
  var swallowUntil = 0;
  var ab = null;
  var holdEl = null;

  function viewFor(v) {
    if (view && view.el === v) return view;
    resetView();
    var saved = [];
    for (var i = 0; i < VIEW_PROPS.length; i++) {
      saved.push([VIEW_PROPS[i], v.style.getPropertyValue(VIEW_PROPS[i]), v.style.getPropertyPriority(VIEW_PROPS[i])]);
    }
    view = { el: v, hadStyle: v.hasAttribute("style"), zoom: 1, cx: 0.5, cy: 0.5, rot: 0, fit: "", k: 1, saved: saved };
    return view;
  }

  function restoreProp(v, name) {
    var s = null;
    for (var i = 0; i < view.saved.length; i++) if (view.saved[i][0] === name) s = view.saved[i];
    if (s && s[1]) v.style.setProperty(name, s[1], s[2]);
    else v.style.removeProperty(name);
  }

  function savedValue(name) {
    for (var i = 0; i < view.saved.length; i++) if (view.saved[i][0] === name) return view.saved[i][1];
    return "";
  }

  function viewIdle() {
    return !view || (view.zoom <= 1.001 && view.rot % 360 === 0 && !view.fit);
  }

  function resetView() {
    if (!view) return false;
    var v = view.el;
    try {
      for (var i = 0; i < VIEW_PROPS.length; i++) restoreProp(v, VIEW_PROPS[i]);
      if (!view.hadStyle && !v.getAttribute("style")) v.removeAttribute("style");
    } catch (err) {}
    view = null;
    pan = null;
    if (panRaf) cancelAnimationFrame(panRaf);
    panRaf = 0;
    bindView(false);
    lastTx = NaN;
    lastTw = 0;
    lastTh = 0;
    return true;
  }

  function paintView() {
    if (!view) return;
    var v = view.el;
    if (viewIdle()) {
      resetView();
      return;
    }
    try {
      layoutGeneration++;
      var z = view.zoom;
      if (z > 1.001 && canViewBox) {
        var half = 0.5 / z;
        if (view.cx < half) view.cx = half;
        if (view.cx > 1 - half) view.cx = 1 - half;
        if (view.cy < half) view.cy = half;
        if (view.cy > 1 - half) view.cy = 1 - half;
        var pct = function (n) { return (Math.round(n * 10000) / 100) + "%"; };
        v.style.setProperty("object-view-box", "inset(" + pct(view.cy - half) + " " + pct(1 - view.cx - half) + " " + pct(1 - view.cy - half) + " " + pct(view.cx - half) + ")", "important");
      } else restoreProp(v, "object-view-box");
      var quarter = ((view.rot % 360) + 360) % 360;
      if (quarter) {
        var w = view.w || (view.w = v.offsetWidth || 1);
        var h = view.h || (view.h = v.offsetHeight || 1);
        // A quarter turn swaps the box; shrink it back inside the original one.
        view.k = quarter % 180 ? Math.min(w / h, h / w) : 1;
        var base = savedValue("transform");
        v.style.setProperty("transform", (base && base !== "none" ? base + " " : "") + "rotate(" + quarter + "deg) scale(" + (Math.round(view.k * 10000) / 10000) + ")", "important");
        v.style.setProperty("transform-origin", "50% 50%", "important");
      } else {
        view.k = 1;
        restoreProp(v, "transform");
        restoreProp(v, "transform-origin");
      }
      if (view.fit) v.style.setProperty("object-fit", view.fit, "important");
      else restoreProp(v, "object-fit");
    } catch (err) {}
    bindView(!viewIdle() && view.zoom > 1.001);
    lastTx = NaN;
    lastTw = 0;
    lastTh = 0;
    schedulePlace();
  }

  // The unrotated box of the active video, so the bar keeps its place when rotated.
  function cachedRect() {
    return {left: cacheL, top: cacheT, right: cacheR, bottom: cacheB, width: cacheW, height: cacheH};
  }
  function rectOf(v) {
    var r = v.getBoundingClientRect();
    if (!view || view.el !== v || !(view.rot % 180)) return r;
    var w = v.offsetWidth;
    var h = v.offsetHeight;
    var cx = r.left + r.width / 2;
    var cy = r.top + r.height / 2;
    return { left: cx - w / 2, top: cy - h / 2, right: cx + w / 2, bottom: cy + h / 2, width: w, height: h };
  }

  function zoomBy(dir) {
    if (!active || !canViewBox) return false;
    var vw = viewFor(active);
    var next = dir > 0 ? vw.zoom * ZOOM_STEP : vw.zoom / ZOOM_STEP;
    if (next < 1.02) next = 1;
    if (next > ZOOM_MAX) next = ZOOM_MAX;
    vw.zoom = Math.round(next * 100) / 100;
    paintView();
    return true;
  }

  function zoomText() {
    var z = view && view.el === active ? view.zoom : 1;
    return (Math.round(z * 100) / 100) + "×";
  }

  function rotateBy() {
    if (!active) return false;
    var vw = viewFor(active);
    vw.rot = (vw.rot + 90) % 360;
    paintView();
    return true;
  }

  function toggleFill() {
    if (!active) return false;
    var vw = viewFor(active);
    if (vw.fit) vw.fit = "";
    else {
      var now = "";
      try { now = getComputedStyle(active).objectFit; } catch (err) { now = ""; }
      vw.fit = now === "cover" ? "contain" : "cover";
    }
    var on = vw.fit;
    paintView();
    return on || "off";
  }

  // Pan and the zoomed-only gestures. Bound only while zoomed, so Instagram's
  // own tap, double-tap like and wheel scrolling are untouched otherwise.
  function bindView(on) {
    if (on === viewBound) return;
    viewBound = on;
    var add = on ? "addEventListener" : "removeEventListener";
    document[add]("pointerdown", onPanDown, true);
    document[add]("pointermove", onPanMove, true);
    document[add]("pointerup", onPanUp, true);
    document[add]("pointercancel", onPanUp, true);
    document[add]("click", onViewClick, true);
    document[add]("dblclick", onViewDbl, true);
    document[add]("dragstart", onViewDrag, true);
    if (on) document.addEventListener("wheel", onViewWheel, { capture: true, passive: false });
    else document.removeEventListener("wheel", onViewWheel, true);
  }

  function inView(x, y) {
    if (!view || !view.el.isConnected) return false;
    var r = rectOf(view.el);
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  function onPanDown(e) {
    if (leaveCallAlone()) return;
    try {
      if (!e.isTrusted || e.button !== 0 || e.target === host || !inView(e.clientX, e.clientY)) return;
      pan = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy, moved: false };
    } catch (err) {}
  }

  function onPanMove(e) {
    if (leaveCallAlone()) return;
    try {
      if (!pan || !view) return;
      panX = e.clientX;
      panY = e.clientY;
      if (pan.moved || Math.abs(panX - pan.x) + Math.abs(panY - pan.y) >= PAN_SLOP) e.preventDefault();
      if (!panRaf) panRaf = requestAnimationFrame(applyPan);
    } catch (err) {}
  }
  function applyPan() {
    panRaf = 0;
    try {
      if (!pan || !view) return;
      var sx = panX - pan.x;
      var sy = panY - pan.y;
      if (!pan.moved && Math.abs(sx) + Math.abs(sy) < PAN_SLOP) return;
      pan.moved = true;
      var q = ((view.rot % 360) + 360) % 360;
      var dx = q === 90 ? sy : q === 180 ? -sx : q === 270 ? -sy : sx;
      var dy = q === 90 ? -sx : q === 180 ? -sy : q === 270 ? sx : sy;
      var r = view.el.getBoundingClientRect();
      var spanX = (q % 180 ? r.height : r.width) || 1;
      var spanY = (q % 180 ? r.width : r.height) || 1;
      view.cx = pan.cx - dx / (spanX * view.zoom);
      view.cy = pan.cy - dy / (spanY * view.zoom);
      paintView();
    } catch (err) {}
  }

  function onPanUp() {
    if (panRaf) { cancelAnimationFrame(panRaf); applyPan(); }
    if (pan && pan.moved) swallowUntil = performance.now() + 350;
    pan = null;
  }

  function onViewClick(e) {
    if (leaveCallAlone()) return;
    if (performance.now() > swallowUntil) return;
    swallowUntil = 0;
    try {
      e.preventDefault();
      e.stopPropagation();
    } catch (err) {}
  }

  function onViewDbl(e) {
    if (leaveCallAlone()) return;
    try {
      if (!e.isTrusted || e.target === host || !inView(e.clientX, e.clientY)) return;
      e.preventDefault();
      e.stopPropagation();
      resetView();
      flash(labels.pillReset);
    } catch (err) {}
  }

  function onViewDrag(e) {
    try { if (pan) e.preventDefault(); } catch (err) {}
  }

  function wheelZoom(e) {
    if (!e.ctrlKey || !e.deltaY || !active) return false;
    e.preventDefault();
    if (zoomBy(e.deltaY < 0 ? 1 : -1)) flash(zoomText());
    return true;
  }

  function onViewWheel(e) {
    if (leaveCallAlone()) return;
    try {
      if (e.target === host || !inView(e.clientX, e.clientY)) return;
      wheelZoom(e);
    } catch (err) {}
  }

  function onBarWheel(e) {
    if (leaveCallAlone()) return;
    try { wheelZoom(e); } catch (err) {}
  }

  // ---- A-B loop on the active video; listeners exist only while a loop is set.
  function abCheck() {
    if (!ab || ab.b < 0) return;
    if (callMedia(ab.el)) { clearAb(); return; }
    var v = ab.el;
    if (v.currentTime >= ab.b || v.ended) {
      try {
        v.currentTime = ab.a;
        if (v.paused && v.ended) {
          var p = v.play();
          if (p && typeof p.catch === "function") p.catch(function () {});
        }
      } catch (err) {}
    }
  }

  function abFrame() {
    if (!ab || ab.b < 0) return;
    abCheck();
    if (!ab) return;
    try { ab.cb = ab.el.requestVideoFrameCallback(abFrame); } catch (err) { ab.cb = 0; ab.el.addEventListener("timeupdate", abCheck); }
  }

  function clearAb() {
    if (!ab) return false;
    var v = ab.el;
    try {
      v.removeEventListener("timeupdate", abCheck);
      v.removeEventListener("ended", abCheck);
      if (ab.cb && v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(ab.cb);
    } catch (err) {}
    ab = null;
    return true;
  }

  function cycleAb() {
    if (!active) return "";
    var now = Number.isFinite(active.currentTime) ? active.currentTime : 0;
    if (!ab || ab.el !== active) {
      clearAb();
      ab = { el: active, a: now, b: -1, cb: 0 };
      return "A " + fmt(now);
    }
    if (ab.b < 0) {
      var a = ab.a;
      var b = now;
      if (b < a) {
        var tmp = a;
        a = b;
        b = tmp;
      }
      if (b - a < 0.3) b = a + 0.3;
      ab.a = a;
      ab.b = b;
      if (typeof active.requestVideoFrameCallback !== "function") active.addEventListener("timeupdate", abCheck);
      active.addEventListener("ended", abCheck);
      if (typeof active.requestVideoFrameCallback === "function") abFrame();
      try { active.currentTime = a; } catch (err) {}
      return "A–B " + fmt(a) + "–" + fmt(b);
    }
    clearAb();
    return labels.pillAbOff;
  }

  // ---- Hold-to-speed: playback rate only, never the stored speed.
  function holdStart() {
    if (!active || holdEl) return "";
    holdEl = active;
    var rate = rateFor(holdEl) < 2 ? 2 : 4;
    try { holdEl.playbackRate = rate; } catch (err) {}
    document.addEventListener("keyup", onHoldUp, true);
    window.addEventListener("blur", holdEnd);
    return formatSpeed(rate);
  }

  function holdEnd() {
    if (!holdEl) return;
    try { if (!callMedia(holdEl)) holdEl.playbackRate = rateFor(holdEl); } catch (err) {}
    holdEl = null;
    holdCode = "";
    document.removeEventListener("keyup", onHoldUp, true);
    window.removeEventListener("blur", holdEnd);
  }

  function onHoldUp(e) {
    try {
      if (holdCode && e.code === holdCode) holdEnd();
      else if (!overridden("player.hold") && (e.code === "KeyS" || e.key === "s" || e.key === "S")) holdEnd();
    } catch (err) {}
  }

  function stepFrame(dir) {
    if (!active) return false;
    try {
      if (!active.paused) active.pause();
      var next = (Number.isFinite(active.currentTime) ? active.currentTime : 0) + dir * FRAME_S;
      if (next < 0) next = 0;
      if (Number.isFinite(active.duration) && next > active.duration) next = active.duration;
      active.currentTime = next;
      resetPaint();
      paintProgress();
      syncPlay();
    } catch (err) {
      return false;
    }
    return true;
  }

  function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        var out = document.exitFullscreen();
        if (out && typeof out.catch === "function") out.catch(function () {});
        return true;
      }
      if (!active || !document.fullscreenEnabled) return false;
      // The video's own container: Instagram's overlays come along, and our bar
      // follows through onFullscreen. A bare <video> could not host the bar.
      var box = active.parentElement;
      if (!box || box === document.body || box === document.documentElement) box = active;
      var p = box.requestFullscreen();
      if (p && typeof p.catch === "function") p.catch(function () {});
      return true;
    } catch (err) {
      return false;
    }
  }

  function syncTools() {
    var on = function (k, v) { if (toolItems[k]) toolItems[k].classList.toggle("is-on", !!v); };
    var mine = view && view.el === active;
    on("zoomIn", mine && view.zoom > 1.001);
    on("rotate", mine && view.rot % 360);
    on("fill", mine && view.fit);
    on("ab", ab && ab.el === active);
    on("loop", active && active.loop);
    on("fullscreen", !!document.fullscreenElement);
    if (toolItems.pip) toolItems.pip.hidden = !pipSupported();
    if (toolItems.zoomIn) toolItems.zoomIn.hidden = !canViewBox;
    if (toolItems.zoomOut) toolItems.zoomOut.hidden = !canViewBox;
  }

  // Shared by the menu and the shortcuts; returns the pill text, or "" if nothing ran.
  function runTool(act) {
    if (!active || leaveCallAlone()) return "";
    if (act === "back") { seekBy(-5); return labels.pillBack; }
    if (act === "forward") { seekBy(5); return labels.pillForward; }
    if (act === "download") { download(active, false); return ""; }
    if (act === "capture") { captureFrame(); return labels.capture; }
    if (act === "pip") return togglePip() ? labels.pip : "";
    if (act === "zoomIn") return zoomBy(1) ? zoomText() : "";
    if (act === "zoomOut") return zoomBy(-1) ? zoomText() : "";
    if (act === "rotate") return rotateBy() ? (view ? view.rot : 0) + "°" : "";
    if (act === "fill") {
      var fit = toggleFill();
      return fit ? (fit === "cover" ? labels.pillFill : labels.pillFit) : "";
    }
    if (act === "ab") return cycleAb();
    if (act === "loop") return toggleLoop() ? (active.loop ? labels.loopOn : labels.loopOff) : "";
    if (act === "fullscreen") return toggleFullscreen() ? labels.fullscreen : "";
    if (act === "reset") {
      resetView();
      return labels.pillReset;
    }
    if (act === "downloadAll") {
      download(active, true);
      return labels.download;
    }
    return "";
  }

  function dropTools(v) {
    // Leaving a video (or switching to another) puts the old one back exactly.
    if (view && view.el !== v) resetView();
    if (ab && ab.el !== v) clearAb();
    if (holdEl && holdEl !== v) holdEnd();
  }

  function onActiveMedia() {
    if (leaveCallAlone()) return;
    try {
      layoutGeneration++;
      lastSec = -1;
      syncPlay();
      schedulePlace();
    } catch (err) {}
  }

  function activate(v, measured) {
    if (!live || !v || !v.isConnected || callMedia(v) || leaveCallAlone()) return;
    var rect = measured || rectOf(v);
    if (rect.width < 1 || rect.height < 1) {
      if (active === v) dropActive();
      return;
    }
    if (!host) {
      buildBar();
      placeHost(host);
      applyTheme();
      updateChip();
    }
    if (active !== v) {
      restoreNativeSounds();
      closeMenu();
      dropTools(v);
      unbindActive();
      active = v;
      bindActive(v);
      try { v.playbackRate = rateFor(v); } catch (err) {}
      resetPaint();
    }
    writeCache(rect);
    if (rememberSound && (prefMuted !== null || prefVolume > 0) &&
        soundZone(v) && mostlyVisible(v, rect)) applyPref(v);
    syncPathClass();
    liftDirty = true;
    syncControls();
  }

  function dropActive() {
    restoreNativeSounds();
    soundCandidates = [];
    reelColumn = false;
    dropTools(null);
    unbindActive();
    active = null;
    if (hovered && hovered.isConnected === false) hovered = null;
    // A detached hit-test target would keep a removed post (and its media) alive.
    if (stackTarget && !stackTarget.isConnected) {
      stackTarget = null;
      stackVid = null;
      stackImg = null;
    }
    overVideo = false;
    hasCache = false;
    cacheW = 0;
    cacheH = 0;
    setVisible(false);
  }

  function schedulePlace() {
    if (!live || posRaf || (!barVisible && !photoOn)) return;
    posRaf = requestAnimationFrame(onPlace);
  }

  function onPlace() {
    posRaf = 0;
    var keep = false;
    try { keep = placeBody(); } catch (err) { keep = false; }
    if (keep && live && barVisible) posRaf = requestAnimationFrame(onPlace);
  }

  function placeBody() {
    if (photoOn) placePhoto();
    if (!barVisible || !active) return false;
    if (!active.isConnected || callMedia(active) || inCall()) {
      dropActive();
      return false;
    }
    var rect = hasCache && cacheGeneration === layoutGeneration ? cachedRect() : rectOf(active);
    if (rect.width < 1 || rect.height < 1) {
      dropActive();
      return false;
    }
    if (!hasCache || cacheGeneration !== layoutGeneration) writeCache(rect);
    syncPathClass();
    if (rect.width < MIN_W || rect.height < MIN_H) {
      setVisible(false);
      return false;
    }
    if (liftDirty) {
      liftDirty = false;
      if (!computeLift(rect)) { setVisible(false); return false; }
    }
    var x = Math.round(rect.left);
    var y = Math.round(rect.top);
    var w = Math.round(rect.width);
    var h = Math.round(rect.height);
    if (x !== lastTx || y !== lastTy) {
      lastTx = x;
      lastTy = y;
      host.style.transform = "translate3d(" + x + "px," + y + "px,0)";
    }
    if (w !== lastTw) {
      lastTw = w;
      host.style.width = w + "px";
    }
    if (h !== lastTh) {
      lastTh = h;
      host.style.height = h + "px";
    }
    paintProgress();
    if (scrubbing) return true;
    if (!active.paused && !active.ended) return true;
    if (performance.now() < movingUntil) return true;
    return false;
  }

  function setVisible(next) {
    next = !!(next && live && host && active);
    if (next === barVisible) return;
    if (next && !computeLift(cachedRect())) { restoreNativeSounds(); return; }
    barVisible = next;
    if (next) { liftDirty = true; layoutGeneration++; }
    host.classList.toggle("iy-on", next);
    if (bar) bar.setAttribute("aria-hidden", next ? "false" : "true");
    if (!next) {
      restoreNativeSounds();
      if (!photoButton || openAnchor !== photoButton) closeMenu();
      return;
    }
    liftDirty = true;
    syncPathClass();
    schedulePlace();
  }

  function syncVisibility() {
    var show = false;
    if (live && active && active.isConnected && !overField && hasCache && cacheW >= MIN_W && cacheH >= MIN_H) {
      var shortcut = performance.now() < shortcutUntil;
      if (barFocused || (menuOpen && openAnchor !== photoButton) || scrubbing || overBar || shortcut) show = true;
      else if (overVideo && stillTimer) show = true;
    }
    setVisible(show);
  }

  function armStill() {
    var now = performance.now();
    movingUntil = now + 120;
    stillDeadline = now + STILL_MS;
    if (!stillTimer) stillTimer = setTimeout(onStill, STILL_MS);
  }

  function onStill() {
    stillTimer = 0;
    var left = stillDeadline - performance.now();
    if (left > 1) {
      stillTimer = setTimeout(onStill, left);
      return;
    }
    try { syncVisibility(); } catch (err) {}
  }

  function clearStill() {
    if (!stillTimer) return;
    clearTimeout(stillTimer);
    stillTimer = 0;
  }

  function flash(text) {
    shortcutUntil = performance.now() + SHORTCUT_MS;
    if (shortcutTimer) clearTimeout(shortcutTimer);
    shortcutTimer = setTimeout(function () {
      shortcutTimer = 0;
      try { syncVisibility(); } catch (err) {}
    }, SHORTCUT_MS);
    if (pill && text) {
      pill.textContent = text;
      pill.classList.add("is-on");
      pill.setAttribute("aria-hidden", "false");
      if (pillTimer) clearTimeout(pillTimer);
      pillTimer = setTimeout(function () {
        pillTimer = 0;
        try {
          if (!pill) return;
          pill.classList.remove("is-on");
          pill.setAttribute("aria-hidden", "true");
        } catch (err) {}
      }, PILL_MS);
    }
    syncVisibility();
  }

  function videoFromStack(stack, x, y) {
    var i;
    var el;
    for (i = 0; i < stack.length; i++) {
      el = stack[i];
      // A stream is excluded on its own. Its box must not steal the hit from a photo above or below it.
      if (!(el instanceof HTMLVideoElement) || !el.isConnected || callMedia(el)) continue;
      var direct = el.getBoundingClientRect();
      if (direct.width > 0 && direct.height > 0 && pointInRect(direct, x, y)) {
        if (onDmPath() && !IY.isDmSized(direct.width, direct.height)) continue;
        return el;
      }
    }
    var limit = stack.length < 3 ? stack.length : 3;
    var prev = null;
    for (i = 0; i < limit; i++) {
      el = stack[i];
      if (!(el instanceof Element) || el === host || el === photoHost) continue;
      var scope = el.closest("article, [role='dialog'], [role='presentation']");
      if (!scope || scope === prev) continue;
      prev = scope;
      var vids = scope.getElementsByTagName("video");
      var best = null;
      var bestArea = Infinity;
      for (var k = 0; k < vids.length; k++) {
        var video = vids[k];
        if (!video.isConnected || callMedia(video)) continue;
        var rect = video.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0 || !pointInRect(rect, x, y)) continue;
        if (onDmPath() && !IY.isDmSized(rect.width, rect.height)) continue;
        var area = rect.width * rect.height;
        if (area < bestArea) {
          bestArea = area;
          best = video;
        }
      }
      if (best) return best;
    }
    return null;
  }

  function imageFromStack(stack, x, y) {
    for (var i = 0; i < stack.length; i++) {
      var el = stack[i];
      if (!(el instanceof HTMLImageElement) || !el.isConnected) continue;
      if (!inPhotoZone(el)) continue;
      var rect = el.getBoundingClientRect();
      if (!photoSized(rect) || !pointInRect(rect, x, y)) continue;
      if (onDmPath() && !IY.isAllowedCdn(el.currentSrc || el.src)) continue;
      return el;
    }
    return null;
  }

  var STACK_MS = 100;
  var stackTarget = null;
  var stackAt = 0;
  var stackVid = null;
  var stackImg = null;

  function handleMove() {
    moveRaf = 0;
    if (!live || leaveCallAlone()) return;
    var x = moveX;
    var y = moveY;
    var target = moveTarget;
    moveTarget = null;
    try {
      var moved = !seenPointer || Math.abs(x - lastX) > 0.5 || Math.abs(y - lastY) > 0.5;
      seenPointer = true;
      lastX = x;
      lastY = y;
      overBar = target === host;
      if (downloadMenu && target === (openAnchor === photoButton ? photoHost : host)) return;

      if (active && !active.isConnected) dropActive();

      if (fieldNode(target)) {
        overField = true;
        overVideo = false;
        overBar = false;
        hovered = null;
        hidePhoto();
        clearStill();
        syncVisibility();
        return;
      }
      overField = false;

      var vid = null;
      var cheap = false;
      if (active && active.isConnected && hasCache && x >= cacheL && y >= cacheT && x <= cacheR && y <= cacheB) {
        // A rect read within STACK_MS is fresh enough; skip the forced layout.
        if (cacheGeneration === layoutGeneration && performance.now() - cacheAt < STACK_MS) {
          cheap = true;
          vid = active;
        } else {
          var cached = rectOf(active);
          if (cached.width < 1 || cached.height < 1) {
            dropActive();
          } else {
            writeCache(cached);
            if (pointInRect(cached, x, y)) {
              cheap = true;
              vid = active;
            }
          }
        }
      }

      if (!cheap) {
        // Hit-testing is the costliest step: redo it only when the element under
        // the pointer changes, or at most every STACK_MS while it stays the same.
        var now = performance.now();
        if (target !== stackTarget || target instanceof HTMLVideoElement || now - stackAt >= STACK_MS) {
          stackTarget = target;
          stackAt = now;
          var stack = document.elementsFromPoint(x, y);
          stackVid = videoFromStack(stack, x, y);
          stackImg = stackVid || target === photoHost ? null : imageFromStack(stack, x, y);
        } else if (stackVid && !stackVid.isConnected) {
          stackVid = null;
        }
        vid = stackVid;
        if (vid) hidePhoto();
        else if (target !== photoHost) {
          if (stackImg && stackImg.isConnected) {
            if (!(photoOn && photoImg === stackImg)) showPhoto(stackImg);
          }
          else hidePhoto();
        }
      } else {
        hidePhoto();
      }

      if (vid) {
        hovered = vid;
        overVideo = !callMedia(vid);
        if (overVideo && vid !== active) activate(vid);
        if (overVideo && moved) armStill();
        if (!overVideo) clearStill();
      } else {
        hovered = null;
        overVideo = false;
        if (!(overBar && active)) overBar = false;
        clearStill();
      }
      syncVisibility();
    } catch (err) {}
  }

  function onPointerMove(e) {
    if (!e.isTrusted) return;
    try {
      moveX = e.clientX;
      moveY = e.clientY;
      moveTarget = e.target;
      if (moveRaf) return;
      moveRaf = requestAnimationFrame(handleMove);
    } catch (err) {}
  }

  function closeOutsideDownload(e) {
    if (downloadMenu && !downloadMenu.contains(e.target) && !openAnchor.contains(e.target)) closeMenu();
  }

  function onPointerDown(e) {
    if (!e.isTrusted || leaveCallAlone()) return;
    try {
      if (!menuOpen) return;
      // The shadow root is closed: from here a press on the bar targets the host.
      if (e.target === (openAnchor === photoButton ? photoHost : host)) return;
      var path = e.composedPath();
      for (var i = 0; i < path.length; i++) {
        if (path[i] === openEl || path[i] === openAnchor) return;
      }
      closeMenu();
      syncVisibility();
    } catch (err) {}
  }

  function onPointerOut(e) {
    if (!e.isTrusted) return;
    try {
      if (e.relatedTarget) return;
      overVideo = false;
      overBar = false;
      hovered = null;
      hidePhoto();
      clearStill();
      syncVisibility();
    } catch (err) {}
  }

  function onPlay(e) {
    if (!e.isTrusted) return;
    kickStoryPause();
    try {
      var node = e.target;
      inCall(true);
      if (!live || leaveCallAlone() || !(node instanceof HTMLVideoElement)) return;
      if (typeof noAutoplayWanted !== "undefined" && noAutoplayWanted) {
        try { noAutoplayOnPlay(node); } catch (err) {}
      }
      playNode = node;
      if (playRaf) return;
      playRaf = requestAnimationFrame(flushPlay);
    } catch (err) {}
  }
  function flushPlay() {
    playRaf = 0;
    var node = playNode;
    playNode = null;
    try {
      if (!live || !node || !node.isConnected || callMedia(node) || leaveCallAlone()) return;
      try { node.playbackRate = rateFor(node); } catch (err) {}
      var measured = rectOf(node);
      if (onDmPath() && !IY.isDmSized(measured.width, measured.height)) return;
      if (node === active) writeCache(measured);
      // Capture phase: this runs before Instagram's own play handler, and any
      // re-mute it does next is corrected in onAnyVolume.
      bookOf(node).at = performance.now();
      if (rememberSound && (prefMuted !== null || prefVolume > 0) && soundZone(node) && mostlyVisible(node, measured)) applyPref(node);
      if (hovered && hovered !== node && hovered.isConnected) return;
      activate(node, measured);
      if (seenPointer && hasCache && lastX >= cacheL && lastX <= cacheR && lastY >= cacheT && lastY <= cacheB) {
        overVideo = true;
        if (!stillTimer) armStill();
      }
      if (apFlashNode === node) {
        apFlashNode = null;
        // Show the bar for a moment so the paused video can be started from it.
        if (node === active) flash("");
      }
      syncVisibility();
    } catch (err) {}
  }

  function onMeta(e) {
    if (!e.isTrusted) return;
    kickStoryPause();
    if (e.target === active) { layoutGeneration++; schedulePlace(); }
    try {
      var node = e.target;
      if (node.srcObject) inCall(true);
      if (leaveCallAlone() || callMedia(node) || !(node instanceof HTMLVideoElement)) return;
      try { node.playbackRate = rateFor(node); } catch (err) {}
    } catch (err) {}
  }

  function onFocusIn(e) {
    try {
      barFocused = pathHasHost(e);
      if ((e.target instanceof HTMLVideoElement || e.target instanceof HTMLImageElement) && IY.playerOwnsMedia(e.target)) {
        if (e.target instanceof HTMLVideoElement) {
          activate(e.target);
          barFocused = active === e.target;
        } else showPhoto(e.target);
      }
      syncVisibility();
    } catch (err) {}
  }

  function onFocusOut(e) {
    try {
      barFocused = e.relatedTarget === host;
      syncVisibility();
    } catch (err) {}
  }

  function pathHasHost(e) {
    var path = e.composedPath();
    for (var i = 0; i < path.length; i++) {
      if (path[i] === host) return true;
    }
    return e.target === host;
  }

  function onScroll() {
    try {
      // Wheel scrolling fires no pointermove; release posts Instagram unmounted meanwhile.
      if (active && !active.isConnected) dropActive();
      else if (stackTarget && !stackTarget.isConnected) {
        stackTarget = null;
        stackVid = null;
        stackImg = null;
      }
      layoutGeneration++;
      if (hovered && !hovered.isConnected) hovered = null;
      if (stackVid && !stackVid.isConnected) stackVid = null;
      if (stackImg && !stackImg.isConnected) stackImg = null;
      if (photoImg && !photoImg.isConnected) hidePhoto();
      schedulePlace();
    } catch (err) {}
  }

  function onVisibility() {
    if (storyPauseActive()) kickStoryPause();
    else storyPauseStop();
    inCall(true);
    if (leaveCallAlone()) return;
    if (active) {
      var r = rectOf(active);
      if (!r.width || !r.height) dropActive();
    }
  }

  function onResize() {
    try {
      closeMenu();
      if (photoOn && photoImg) photoLift = onStoryPath() ? storyLift(photoImg.getBoundingClientRect(), photoImg) : 0;
      layoutGeneration++;
      if (view) { view.w = 0; view.h = 0; }
      if (view && view.rot % 180) paintView();
      liftDirty = true;
      schedulePlace();
    } catch (err) {}
  }

  function onFullscreen() {
    try {
      layoutGeneration++;
      placeHost(host);
      placeHost(photoHost);
      placeHost(toastHost);
      liftDirty = true;
      lastTx = NaN;
      lastTy = NaN;
      schedulePlace();
    } catch (err) {}
  }

  function onPipEvent() {
    try { syncPip(); } catch (err) {}
  }

  function typingEvent(e) {
    if (e.isComposing) return true;
    var path = null;
    try { path = e.composedPath(); } catch (err) { path = null; }
    if (!path) return false;
    var inPhoto = false;
    for (var i = 0; i < path.length; i++) {
      var n = path[i];
      if (!(n instanceof Element)) continue;
      if (n === photoHost) inPhoto = true;
      if (n === host || n === photoHost) continue;
      var tag = n.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (n.isContentEditable) return true;
    }
    return inPhoto;
  }

  // ---- Key bindings (Settings > Araçlar > Klavye kısayolları).
  // Stored overrides only ({ v: 1, map: { id: chord | "" } }); an action without an override keeps
  // its v1.8 matcher below unchanged (Turkish F letters via e.key, physical-code fallbacks). An
  // overridden action is matched only by its new chord; "" turns the action off.
  var keyOverrides = {};
  var hasKeyOverrides = false;
  var holdCode = "";
  var VIDEO_KEY_IDS = ["media.download", "media.downloadAll", "player.capture", "player.speedUp", "player.speedDown",
    "player.back", "player.forward", "player.loop", "player.pip", "player.mute", "player.volumeUp", "player.volumeDown",
    "player.frameBack", "player.frameForward", "player.hold", "player.zoomIn", "player.zoomOut", "player.reset",
    "player.rotate", "player.fill", "player.ab", "player.fullscreen"];
  // Held keys keep acting (seek, speed, volume, frame step, zoom); the hold key swallows repeats.
  var REPEATABLE = { "player.speedUp": 1, "player.speedDown": 1, "player.back": 1, "player.forward": 1, "player.volumeUp": 1,
    "player.volumeDown": 1, "player.frameBack": 1, "player.frameForward": 1, "player.zoomIn": 1, "player.zoomOut": 1, "player.hold": 1 };

  function readShortcuts(raw) {
    var schema = globalThis.IY && IY.settingsSchema;
    var next = {};
    if (schema && typeof schema.normalizeShortcuts === "function") {
      try {
        var map = schema.normalizeShortcuts(raw).map;
        for (var i = 0; i < VIDEO_KEY_IDS.length; i++) {
          if (Object.prototype.hasOwnProperty.call(map, VIDEO_KEY_IDS[i])) next[VIDEO_KEY_IDS[i]] = map[VIDEO_KEY_IDS[i]];
        }
      } catch (err) { next = {}; }
    }
    keyOverrides = next;
    hasKeyOverrides = Object.keys(next).length > 0;
  }

  function overridden(id) {
    return hasKeyOverrides && Object.prototype.hasOwnProperty.call(keyOverrides, id);
  }

  // Logical chord of a keydown ("Shift+d", ">", "ArrowLeft"); letters of non-Latin layouts fall
  // back to the physical key so a Latin binding still works there.
  function eventChord(e) {
    var schema = globalThis.IY && IY.settingsSchema;
    if (!schema || typeof schema.chordFromEvent !== "function") return null;
    var key = e.key;
    if (typeof key === "string" && key.length === 1 && /\p{L}/u.test(key) && !/\p{Script=Latin}/u.test(key) &&
        typeof e.code === "string" && /^Key[A-Z]$/.test(e.code)) key = e.code.slice(3).toLowerCase();
    return schema.chordFromEvent({ key: key, code: e.code, ctrlKey: !!e.ctrlKey, altKey: !!e.altKey, shiftKey: !!e.shiftKey,
      metaKey: !!e.metaKey, isComposing: false, repeat: false, keyCode: 0 });
  }

  function customVideoAction(e) {
    if (!hasKeyOverrides) return "";
    var chord = eventChord(e);
    if (!chord) return "";
    for (var i = 0; i < VIDEO_KEY_IDS.length; i++) {
      var id = VIDEO_KEY_IDS[i];
      if (overridden(id) && keyOverrides[id] !== "" && keyOverrides[id] === chord) return id;
    }
    return "";
  }

  // The v1.8 D detection: the produced Latin letter, or the physical key for layouts without one.
  function legacyD(e) {
    return e.key === "d" || e.key === "D" || (!/^[a-z]$/i.test(e.key) && e.code === "KeyD");
  }

  function legacyDownloadAction(e) {
    if (!legacyD(e)) return "";
    var id = e.shiftKey ? "media.downloadAll" : "media.download";
    return overridden(id) ? "" : id;
  }

  // The v1.8 player chain, in order. The first matching action that still has its default wins.
  function legacyPlayerAction(e) {
    var key = e.key;
    var rules = [
      ["player.capture", e.shiftKey && !e.repeat && e.code === "KeyX"],
      ["player.speedUp", e.shiftKey && (e.code === "Period" || key === "." || key === ">")],
      ["player.speedDown", e.shiftKey && (e.code === "Comma" || key === "," || key === "<")],
      ["player.back", !e.shiftKey && key === "ArrowLeft"],
      ["player.forward", !e.shiftKey && key === "ArrowRight"],
      ["player.loop", !e.shiftKey && !e.repeat && (key === "l" || key === "L")],
      ["player.pip", !e.shiftKey && !e.repeat && (key === "p" || key === "P")],
      [e.shiftKey ? "media.downloadAll" : "media.download", !e.repeat && legacyD(e)],
      ["player.mute", !e.shiftKey && !e.repeat && (key === "m" || key === "M")],
      ["player.volumeUp", !e.shiftKey && key === "ArrowUp"],
      ["player.volumeDown", !e.shiftKey && key === "ArrowDown"],
      ["player.frameForward", !e.shiftKey && (e.code === "Period" || key === ".")],
      ["player.frameBack", !e.shiftKey && (e.code === "Comma" || key === ",")],
      ["player.hold", !e.shiftKey && (key === "s" || key === "S" || e.code === "KeyS")],
      ["player.zoomIn", e.repeat ? (key === "z" || key === "+" || key === "=") : ((key === "z" && !e.shiftKey) || key === "+" || key === "=" || e.code === "NumpadAdd")],
      ["player.zoomOut", e.repeat ? (key === "Z" || key === "-") : (key === "Z" || (key === "z" && e.shiftKey) || key === "-" || e.code === "NumpadSubtract")],
      ["player.reset", !e.repeat && !e.shiftKey && (key === "0" || e.code === "Numpad0")],
      ["player.rotate", !e.repeat && !e.shiftKey && (key === "r" || key === "R")],
      ["player.fill", !e.repeat && !e.shiftKey && (key === "c" || key === "C")],
      ["player.ab", !e.repeat && !e.shiftKey && (key === "a" || key === "A")],
      ["player.fullscreen", !e.repeat && !e.shiftKey && (key === "f" || key === "F")]
    ];
    for (var i = 0; i < rules.length; i++) {
      if (rules[i][1] && !overridden(rules[i][0])) return rules[i][0];
    }
    return "";
  }

  function onKey(e) {
    if (!e.isTrusted || e.defaultPrevented) return;
    inCall(true);
    try {
      if (!live || leaveCallAlone() || e.ctrlKey || e.metaKey) return;
      if (downloadMenu) {
        if (e.key === "Escape") {
          var anchor = openAnchor;
          closeMenu();
          anchor.focus({ preventScroll: true });
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
      if (e.key === "Tab" && !e.shiftKey && (e.target === active || e.target === photoImg)) {
        var button = e.target === active && barVisible ? downloadButton : (e.target === photoImg && photoOn ? photoButton : null);
        if (button) {
          button.focus({ preventScroll: true });
          e.preventDefault();
          return;
        }
      }
      if ((e.key === " " || e.key === "Enter") && e.target === host &&
          downloadButton?.getRootNode().activeElement === downloadButton) return;
      var custom = customVideoAction(e);
      // Alt stays the browser's and the dock's, unless the user bound an Alt chord here.
      if (e.altKey && !custom) return;
      if (callMedia(e.target) || (hovered && callMedia(hovered))) return;
      if (typingEvent(e)) return;
      var dAct = custom === "media.download" || custom === "media.downloadAll" ? custom : custom ? "" : legacyDownloadAction(e);
      if (dAct && IY.feedKeys) {
        if (IY.feedKeys.typing(e)) return;
        if (e.repeat) return;
        var post = IY.feedKeys.currentPost();
        var media = post && postMedia(post);
        if (media) {
          download(media, dAct === "media.downloadAll");
          e.preventDefault();
          e.stopPropagation();
          if (media === active) flash(labels.download);
          return;
        }
        // An empty/hidden slide in the selected post must not download an
        // unrelated video left active by playback or an earlier pointer hover.
        if (post) return;
      }
      if (dAct === "media.downloadAll" && photoOn && photoImg && photoImg.isConnected && !overVideo) {
        if (!e.repeat) download(photoImg, true);
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (!active || !active.isConnected) {
        if (active) dropActive();
        return;
      }
      var playing = !active.paused && !active.ended;
      if (!playing && !overVideo) return;
      var key = e.key;
      var act = custom || legacyPlayerAction(e);
      if (!act) return;
      if (e.repeat && !REPEATABLE[act]) return;
      if (act === "player.capture") { captureFrame(); flash(labels.capture); return; }
      // Story arrows stay Instagram's (previous/next story) unless the pointer is on the bar.
      if ((key === "ArrowLeft" || key === "ArrowRight") && !e.shiftKey && onStoryPath() && !overBar) return;
      var handled = false;
      var pillText = "";
      if (act === "player.speedUp" || act === "player.speedDown") {
        stepSpeed(act === "player.speedUp" ? 1 : -1);
        pillText = formatSpeed(rateFor(active));
        handled = true;
      } else if (act === "player.back") {
        handled = seekBy(-5);
        if (handled) pillText = labels.pillBack;
      } else if (act === "player.forward") {
        handled = seekBy(5);
        if (handled) pillText = labels.pillForward;
      } else if (act === "player.loop") {
        handled = toggleLoop();
        if (handled) pillText = active.loop ? labels.loopOn : labels.loopOff;
      } else if (act === "player.pip") {
        handled = togglePip();
        if (handled) {
          var pipOn = false;
          try { pipOn = document.pictureInPictureElement !== active; } catch (err) { pipOn = true; }
          pillText = pipOn ? labels.pipOn : labels.pipOff;
        }
      } else if (act === "media.download" || act === "media.downloadAll") {
        download(active, act === "media.downloadAll");
        pillText = labels.download;
        handled = true;
      } else if (act === "player.mute") {
        handled = toggleMute();
        if (handled) pillText = volText();
      } else if (act === "player.volumeUp" || act === "player.volumeDown") {
        // Only while the pointer is on the video: elsewhere arrows scroll the page,
        // on /reels/ they switch reels, and a focused bar control keeps its own keys.
        if ((overVideo || overBar) && !barFocused && !onReelPath()) {
          handled = nudgeVolume(act === "player.volumeUp" ? 1 : -1);
          if (handled) pillText = volText();
        }
      } else if (act === "player.frameBack" || act === "player.frameForward") {
        var fwd = act === "player.frameForward";
        handled = stepFrame(fwd ? 1 : -1);
        if (handled) pillText = fwd ? labels.pillFrameForward : labels.pillFrameBack;
      } else if (act === "player.hold") {
        // Key repeat while held is swallowed; keyup ends the hold.
        handled = true;
        if (!e.repeat) {
          holdCode = typeof e.code === "string" ? e.code : "";
          pillText = holdStart();
        }
      } else {
        var tool = { "player.zoomIn": "zoomIn", "player.zoomOut": "zoomOut", "player.reset": "reset", "player.rotate": "rotate",
          "player.fill": "fill", "player.ab": "ab", "player.fullscreen": "fullscreen" }[act];
        if (tool) {
          pillText = runTool(tool);
          handled = !!pillText;
        }
      }
      if (!handled) return;
      e.preventDefault();
      e.stopPropagation();
      flash(pillText);
    } catch (err) {}
  }

  // Dock "Medyayı indir" / "Tümünü indir" on a post page: the same path as D / Shift+D.
  function downloadCurrentPost(all) {
    if (!live || !IY.feedKeys || typeof IY.feedKeys.currentPost !== "function") return false;
    var post = IY.feedKeys.currentPost(true);
    var media = post && postMedia(post);
    if (!media) return false;
    download(media, !!all);
    return true;
  }
  globalThis.IY = Object.assign(globalThis.IY || {}, { videoDownload: downloadCurrentPost });

  function seekBy(delta) {
    if (leaveCallAlone()) return;
    if (!active) return false;
    try {
      var dur = active.duration;
      var next = (Number.isFinite(active.currentTime) ? active.currentTime : 0) + delta;
      if (next < 0) next = 0;
      if (Number.isFinite(dur) && dur > 0 && next > dur) next = dur;
      active.currentTime = next;
      scrubbing = false;
      resetPaint();
      paintProgress();
    } catch (err) {
      return false;
    }
    return true;
  }

  function togglePlay() {
    if (leaveCallAlone()) return;
    if (!active) return false;
    try {
      if (active.paused || active.ended) {
        var pending = active.play();
        if (pending && typeof pending.catch === "function") pending.catch(function () {});
      } else {
        active.pause();
      }
    } catch (err) {
      return false;
    }
    syncPlay();
    return true;
  }

  function toggleLoop() {
    if (leaveCallAlone()) return;
    if (!active) return false;
    try { active.loop = !active.loop; } catch (err) { return false; }
    syncLoop();
    return true;
  }

  function toggleMute() {
    if (leaveCallAlone()) return;
    if (!active) return false;
    try {
      if (isSilent(active)) {
        var level = prefVolume > 0 ? prefVolume : (active.volume > 0 ? active.volume : 1);
        prefMuted = false;
        if (Math.abs(active.volume - level) > 0.001) active.volume = level;
        active.muted = false;
      } else {
        prefMuted = true;
        active.muted = true;
      }
      saveUi({ muted: prefMuted });
    } catch (err) {
      return false;
    }
    syncVolume();
    return true;
  }

  function pipSupported() {
    return !!(active && document.pictureInPictureEnabled && typeof active.requestPictureInPicture === "function");
  }
  function togglePip() {
    if (leaveCallAlone()) return;
    if (!pipSupported() || pipBusy) return false;
    var v = active;
    var attr = v.getAttribute("disablepictureinpicture");
    try {
      pipBusy = true;
      var result;
      if (document.pictureInPictureElement) result = document.exitPictureInPicture();
      else {
        v.removeAttribute("disablepictureinpicture");
        try { result = v.requestPictureInPicture(); }
        finally { if (attr !== null) v.setAttribute("disablepictureinpicture", attr); }
      }
      Promise.resolve(result).catch(function () {}).finally(function () { pipBusy = false; syncPip(); });
      return true;
    } catch (err) { pipBusy = false; return false; }
  }

  async function captureFrame() {
    if (!live || !active || captureBusy) return;
    captureBusy = true;
    try {
      var v = active;
      if (!v.videoWidth || !v.videoHeight || v.readyState < 2) throw new Error("no-frame");
      var canvas = document.createElement("canvas");
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      canvas.getContext("2d").drawImage(v, 0, 0);
      // Serialization throws SecurityError for tainted videos; never fetch a replacement.
      var url = canvas.toDataURL("image/png");
      var info = identityFrom(v) || {};
      var root = v.closest("article, [role='dialog']") || v.parentElement;
      var profile = root.querySelector('a[href^="/"]:not([href*="/p/"]):not([href*="/reel/"]):not([href*="/reels/"])');
      var username = profile && /^\/[^/]+\/$/.test(profile.getAttribute("href")) ? profile.getAttribute("href").split("/")[1] : "instagram";
      var time = root.querySelector("time[datetime]");
      var takenAt = time ? Date.parse(time.getAttribute("datetime")) / 1000 : undefined;
      var name = IY.buildFrameFilename(username, info.code || info.pk || "video", slideIndex(v), !!v.closest("li"), takenAt, v.currentTime);
      showToast(await sendDownload(url, name) ? freshToast("started") : t("toastCaptureError", "Video karesi kaydedilemedi."));
    } catch (err) {
      showToast(err.name === "SecurityError" ? t("toastCaptureBlocked", "Bu videonun karesi tarayıcının kaynak güvenliği nedeniyle kaydedilemiyor.") : t("toastCaptureError", "Video karesi kaydedilemedi."));
    } finally { captureBusy = false; }
  }

  function inputHeld(e) {
    if (!autoAdvance) return;
    var key = e.type.indexOf("key") === 0 ? "k:" + e.code : "p:" + e.pointerId;
    if (e.type === "keydown" || e.type === "pointerdown") heldInputs.add(key);
    else heldInputs.delete(key);
  }
  function clearHeld() { heldInputs.clear(); }
  function bindAdvance(v) {
    v.addEventListener("timeupdate", advanceReel, { passive: true });
    v.addEventListener("ended", advanceReel, { passive: true });
  }
  function unbindAdvance(v) {
    v.removeEventListener("timeupdate", advanceReel);
    v.removeEventListener("ended", advanceReel);
  }
  function setAutoAdvance(on) {
    if (on === autoAdvance) return;
    autoAdvance = on;
    heldInputs.clear();
    if (active) { if (on) bindAdvance(active); else unbindAdvance(active); }
    for (var event of ["pointerdown", "pointerup", "pointercancel", "keydown", "keyup"]) {
      if (on) document.addEventListener(event, inputHeld, { capture: true, passive: true });
      else document.removeEventListener(event, inputHeld, true);
    }
    if (on) window.addEventListener("blur", clearHeld, { passive: true });
    else window.removeEventListener("blur", clearHeld);
  }
  function advanceReel(e) {
    if (leaveCallAlone()) return;
    if (!autoAdvance || !live || !active || e.target !== active || !/^\/reels\//.test(location.pathname)) return;
    var v = active;
    var state = reelStates.get(v);
    var now = performance.now();
    if (state && e.type !== "ended" && now - state.at < 100) return;
    var info = identityFrom(v);
    var identity = v.currentSrc + ":" + (info && (info.code || info.pk) || "");
    if (!state || state.identity !== identity) {
      state = { identity: identity, scroller: state && state.scroller, previous: -1, at: -Infinity, done: false };
      reelStates.set(v, state);
    }
    if (e.type !== "ended" && now - state.at < 100) return;
    state.at = now;
    var wrap = IY.reelWrapped(state.previous, v.currentTime, v.duration);
    state.previous = v.currentTime;
    if (state.done || (e.type !== "ended" && !wrap) || document.hidden || heldInputs.size || menuOpen || ab || scrubbing || v.seeking || !mostlyVisible(v)) return;
    var cached = state.scroller;
    if (cached && cached.isConnected && cached.contains(v)) {
      if (cached.scrollTop + cached.clientHeight >= cached.scrollHeight - 1) return;
      state.done = true;
      cached.scrollBy({ top: cached.clientHeight, behavior: "instant" });
      return;
    }
    for (var node = v.parentElement; node; node = node.parentElement) {
      var css = getComputedStyle(node);
      if (!/^(auto|scroll)$/.test(css.overflowY) || node.scrollHeight <= node.clientHeight + 1) continue;
      if (node.scrollTop + node.clientHeight >= node.scrollHeight - 1) return;
      state.scroller = node;
      state.done = true;
      node.scrollBy({ top: node.clientHeight, behavior: "instant" });
      return;
    }
  }

  function ratioFromClient(clientX, known) {
    var rect = known || progress.getBoundingClientRect();
    var w = rect.width || 1;
    var r = (clientX - rect.left) / w;
    if (r < 0) r = 0;
    if (r > 1) r = 1;
    return r;
  }

  function showTip(clientX, known) {
    if (!progress || !tooltip || !active) return;
    var dur = active.duration;
    if (!Number.isFinite(dur) || dur <= 0 || dur === Infinity) {
      tooltip.classList.remove("is-on");
      return;
    }
    var rect = known || progress.getBoundingClientRect();
    var r = ratioFromClient(clientX, rect);
    tooltip.textContent = fmt(r * dur);
    tooltip.style.transform = "translate3d(" + Math.round(clientX - rect.left) + "px,-8px,0) translateX(-50%)";
    tooltip.classList.add("is-on");
  }

  function onProgressDown(e) {
    if (leaveCallAlone()) return;
    try {
      scrubbing = true;
      if (progress.setPointerCapture) progress.setPointerCapture(e.pointerId);
      var rect = progress.getBoundingClientRect();
      seekRatio(ratioFromClient(e.clientX, rect));
      showTip(e.clientX, rect);
      syncVisibility();
    } catch (err) {}
  }

  function onProgressMove(e) {
    if (leaveCallAlone()) return;
    try {
      var rect = progress.getBoundingClientRect();
      if (scrubbing) seekRatio(ratioFromClient(e.clientX, rect));
      showTip(e.clientX, rect);
    } catch (err) {}
  }

  function onProgressLeave() {
    try {
      if (scrubbing || !tooltip) return;
      tooltip.classList.remove("is-on");
    } catch (err) {}
  }

  function seekRatio(r) {
    if (leaveCallAlone()) return;
    if (!active) return;
    var dur = active.duration;
    if (!Number.isFinite(dur) || dur <= 0 || dur === Infinity) return;
    if (r < 0) r = 0;
    if (r > 1) r = 1;
    try { active.currentTime = r * dur; } catch (err) { return; }
    var pct = Math.round(r * 1000);
    lastPct = pct;
    if (fill) fill.style.transform = "scaleX(" + (pct / 1000) + ")";
    var sec = Math.floor(r * dur);
    lastSec = sec;
    lastDur = Math.floor(dur);
    if (timeEl) timeEl.textContent = fmt(sec) + " / " + fmt(lastDur);
    if (progress) progress.setAttribute("aria-valuenow", String(pct));
  }

  function endScrub() {
    try {
      if (!scrubbing) return;
      scrubbing = false;
      paintProgress();
      syncVisibility();
    } catch (err) {}
  }

  function onVolumeInput() {
    if (leaveCallAlone()) return;
    try {
      if (!active || !volume) return;
      setLevel(volume.value);
    } catch (err) {}
  }

  function validInfo(info) {
    if (!info) return false;
    if (info.kind === "story") return typeof info.pk === "string" && info.pk !== "";
    return typeof info.code === "string" && info.code !== "";
  }

  function infoFromLink(link) {
    if (!link) return null;
    try {
      var path = new URL(link.getAttribute("href") || "", location.href).pathname;
      return IY.codeFromPath(path);
    } catch (err) {
      return null;
    }
  }

  function identityFrom(el) {
    var info = null;
    try { info = IY.codeFromPath(location.pathname); } catch (err) { info = null; }
    if (validInfo(info)) return info;
    if (!(el instanceof Element)) return null;
    var node = el;
    for (var depth = 0; depth < 12 && node && node !== document.documentElement; depth++) {
      var link = null;
      try {
        link = node.querySelector('a[href*="/reel/"], a[href*="/reels/"], a[href*="/p/"]');
      } catch (err) {
        link = null;
      }
      info = infoFromLink(link);
      if (validInfo(info)) return info;
      node = node.parentElement;
    }
    var root = el.closest("article, [role='dialog'], main");
    if (!root) return null;
    var fallback = null;
    try {
      fallback = root.querySelector('a[href*="/p/"], a[href*="/reel/"], a[href*="/reels/"]');
    } catch (err) {
      fallback = null;
    }
    return infoFromLink(fallback);
  }

  function slideIndex(el) {
    try {
      if (!(el instanceof Element)) return 0;
      var li = el.closest("li");
      if (!li || !li.parentElement || !li.closest("ul")) return 0;
      var kids = li.parentElement.children;
      var index = 0;
      for (var i = 0; i < kids.length; i++) {
        if (kids[i].tagName !== "LI") continue;
        if (kids[i] === li) return index;
        index += 1;
      }
    } catch (err) {}
    return 0;
  }

  function postMedia(post) {
    var bounds = post.getBoundingClientRect();
    var best = null, bestArea = 0;
    post.querySelectorAll("video,img").forEach(function (media) {
      if (!media.isConnected || callMedia(media)) return;
      var r = media.getBoundingClientRect();
      var video = media instanceof HTMLVideoElement;
      if (video ? r.width < MIN_W || r.height < MIN_H : !photoSized(r)) return;
      var left = Math.max(r.left, bounds.left), right = Math.min(r.right, bounds.right);
      var top = Math.max(r.top, bounds.top), bottom = Math.min(r.bottom, bounds.bottom);
      // Carousel neighbours may have full-sized rectangles outside their
      // clipping container. Measure within the post, even during J/K scrolling.
      for (var node = media; node; node = node.parentElement) {
        var css = getComputedStyle(node);
        if (css.visibility === "hidden" || css.display === "none") return;
        if (node !== media) {
          var clipX = /^(hidden|clip|auto|scroll)$/.test(css.overflowX);
          var clipY = /^(hidden|clip|auto|scroll)$/.test(css.overflowY);
          if (clipX || clipY) {
            var clip = node.getBoundingClientRect();
            if (clipX) { left = Math.max(left, clip.left); right = Math.min(right, clip.right); }
            if (clipY) { top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom); }
          }
        }
        if (node === post) break;
      }
      var area = Math.max(0, right - left) * Math.max(0, bottom - top);
      if (area > bestArea || (area > 0 && area === bestArea && video)) {
        best = media; bestArea = area;
      }
    });
    return best;
  }

  function showToast(text, ms) {
    try {
      if (!text) return;
      if (!toastHost) {
        toastHost = document.createElement("div");
        toastHost.className = "iy-toast";
        var root = toastHost.attachShadow({ mode: "closed" });
        var style = document.createElement("style");
        style.textContent = toastCss();
        toastText = document.createElement("div");
        toastText.className = "msg";
        toastText.setAttribute("role", "status");
        root.appendChild(style);
        root.appendChild(toastText);
        try { paintTheme(toastHost, themeTokens()); } catch (err) {}
        placeHost(toastHost);
      }
      toastText.textContent = text;
      toastHost.classList.add("iy-on");
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(function () {
        toastTimer = 0;
        try { if (toastHost) toastHost.classList.remove("iy-on"); } catch (err) {}
      }, ms || 2800);
    } catch (err) {}
  }

  function freshToast(kind) {
    if (kind === "dash") return t("toastDashOnly", DASH) || DASH;
    if (kind === "started") return t("toastStarted", STARTED) || STARTED;
    return t("toastError", ERR) || ERR;
  }

  function pickEvery(item) {
    if (typeof IY.pickAllMedia === "function") {
      var list = IY.pickAllMedia(item);
      if (Array.isArray(list)) return list;
    }
    var out = [];
    for (var i = 0; i < item.carousel_media.length; i++) {
      var p = IY.pickMedia(item, i) || { error: "no-media" };
      out.push(Object.assign({ index: i }, p));
    }
    return out;
  }

  function sendDownload(url, filename) {
    return new Promise(function (done) {
      try {
        chrome.runtime.sendMessage({ type: "iy:download", url: url, filename: filename }, function (reply) {
          done(!chrome.runtime.lastError && !!reply && reply.ok === true);
        });
      } catch (err) {
        done(false);
      }
    });
  }

  // One message per file, in order, so download managers see each one.
  async function downloadEach(item, code, takenAt) {
    var list = pickEvery(item);
    var ok = 0;
    var skipped = 0;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || p.error || typeof p.url !== "string") {
        skipped += 1;
        continue;
      }
      var index = Number.isInteger(p.index) ? p.index : i;
      var filename = IY.buildFilename(item.user.username, code, index, p.ext, true, takenAt);
      if (await sendDownload(p.url, filename)) ok += 1;
      else skipped += 1;
    }
    if (!ok) {
      showToast(freshToast("err"));
      return;
    }
    var text = tSub("toastStartedAll", ok, ok + " dosya indiriliyor.");
    if (skipped) text += " " + tSub("toastSkipped", skipped, skipped + " atlandı.");
    showToast(text, 3600);
  }

  // DM media has no post id: take the file the page already loaded, same CDN checks.
  async function downloadDm(el) {
    var url = el.currentSrc || el.src;
    if (!IY.isAllowedCdn(url)) {
      showToast(freshToast("err"));
      return;
    }
    var kind = el instanceof HTMLVideoElement ? "video" : "image";
    var filename = IY.buildDmFilename(Math.floor(Date.now() / 1000), IY.dmExt(kind, url));
    if (await sendDownload(url, filename)) showToast(freshToast("started"));
    else showToast(freshToast("err"));
  }

  async function download(el, all) {
    if (!live || inFlight || !(el instanceof Element) || leaveCallAlone()) return;
    inFlight = true;
    try {
      if (onDmPath()) {
        await downloadDm(el);
        return;
      }
      var info = identityFrom(el);
      if (onStoryPath() && IY.actions && (all || !validInfo(info))) {
        await (all ? IY.actions.downloadAll(el) : IY.actions.downloadOne(el));
        return;
      }
      if (!validInfo(info)) {
        showToast(freshToast("err"));
        return;
      }
      var pk = info.kind === "story" ? String(info.pk) : IY.shortcodeToPk(info.code);
      var res = await fetch("https://www.instagram.com/api/v1/media/" + encodeURIComponent(pk) + "/info/", {
        credentials: "include",
        headers: {
          "x-ig-app-id": "936619743392459",
          "x-requested-with": "XMLHttpRequest"
        }
      });
      if (!res.ok) throw new Error("http");
      var data = await res.json();
      var item = data && data.items && data.items[0];
      if (!item) throw new Error("empty");
      var code = item.code != null ? item.code : info.code;
      var takenAt = Number.isFinite(item.taken_at) ? item.taken_at : undefined;
      if (all && Array.isArray(item.carousel_media) && item.carousel_media.length > 1) {
        await downloadEach(item, code, takenAt);
        return;
      }
      var index = slideIndex(el);
      var picked = IY.pickMedia(item, index);
      if (!picked || picked.error) {
        if (picked && picked.error === "dash-only") showToast(freshToast("dash"), 5200);
        else showToast(freshToast("err"));
        return;
      }
      var filename = IY.buildFilename(item.user.username, code, index, picked.ext, !!item.carousel_media, takenAt);
      chrome.runtime.sendMessage({ type: "iy:download", url: picked.url, filename: filename }, function (reply) {
        try {
          if (chrome.runtime.lastError || !reply || reply.ok !== true) {
            showToast(freshToast("err"));
            return;
          }
          showToast(freshToast("started"));
        } catch (err) {}
      });
    } catch (err) {
      showToast(freshToast("err"));
    } finally {
      inFlight = false;
    }
  }

  function inPhotoZone(img) {
    if (img.closest("article, [role='dialog']")) return true;
    if (onDmPath()) return true;
    if (location.pathname.indexOf("/stories/") === -1) return false;
    return true;
  }

  function showPhoto(img) {
    if (!live || callMedia(img) || !inPhotoZone(img) || leaveCallAlone()) return;
    if (photoToolbar && !onStoryPath() && !onDmPath() && (!IY.hover || IY.hover.isOnTopLayer(img))) return;
    if (photoImg !== img && openAnchor === photoButton && downloadMenu) closeMenu();
    var rect = img.getBoundingClientRect();
    // imageFromStack already applied the size rule (200 px, or 120 px in DMs).
    if (rect.width < 1 || rect.height < 1) return;
    photoLift = onStoryPath() ? storyLift(rect, img) : 0;
    if (!photoHost) {
      buildPhoto();
      placeHost(photoHost);
      applyTheme();
    }
    photoTop = onStoryPath() ? Math.max(rect.top, storyBounds(img).top + 64) : rect.top;
    photoImg = img;
    photoOn = true;
    photoHost.classList.add("iy-on");
    photoHost.setAttribute("aria-hidden", "false");
    placePhoto(rect);
  }

  function hidePhoto() {
    if (photoButton && openAnchor === photoButton) closeMenu();
    photoOn = false;
    photoImg = null;
    if (!photoHost) return;
    photoHost.classList.remove("iy-on");
    photoHost.setAttribute("aria-hidden", "true");
  }

  function placePhoto(known) {
    if (leaveCallAlone()) return;
    if (!photoOn || !photoHost || !photoImg || !photoImg.isConnected) {
      hidePhoto();
      return;
    }
    var rect = known || photoImg.getBoundingClientRect();
    if (!photoSized(rect) || rect.bottom <= 0 || rect.top >= window.innerHeight) {
      hidePhoto();
      return;
    }
    var x = Math.round(rect.right - 40);
    var y = Math.round(onStoryPath() ? rect.bottom - photoLift - 40 : rect.top + 8);
    if (onStoryPath()) photoHost.style.setProperty("--iy-menu-room", Math.max(32, y - Math.max(0, photoTop) - 6) + "px");
    if (onStoryPath() && y < photoTop) { hidePhoto(); return; }
    if (x === photoX && y === photoY) return;
    photoX = x;
    photoY = y;
    photoHost.style.transform = "translate3d(" + x + "px," + y + "px,0)";
  }

  function grabPlaying() {
    if (leaveCallAlone()) return;
    var vids = document.getElementsByTagName("video");
    for (var i = 0; i < vids.length; i++) {
      var video = vids[i];
      if (video.paused || video.ended || callMedia(video)) continue;
      var rect = video.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      if (onDmPath() && !IY.isDmSized(rect.width, rect.height)) continue;
      activate(video);
      return;
    }
  }

  IY.playerOwnsMedia = function (el) {
    if (!live || !el || callMedia(el)) return false;
    var rect = el.getBoundingClientRect();
    if (el instanceof HTMLVideoElement) return rect.width >= MIN_W && rect.height >= MIN_H;
    return el instanceof HTMLImageElement && (onStoryPath() || onDmPath()) && photoSized(rect);
  };

  function readEnabled(cfg) {
    if (!cfg || typeof cfg !== "object") return true;
    if (typeof cfg.video === "boolean") return cfg.video;
    return true;
  }

  var offRoute;
  function bindDocument() {
    document.addEventListener("pointermove", onPointerMove, { capture: true, passive: true });
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("visibilitychange", onVisibility);
    offRoute = IY.core.route(function () { closeMenu(); hidePhoto(); syncDownloadButton(downloadButton); syncDownloadButton(photoButton); onVisibility(); });
    document.addEventListener("pointerdown", onGesture, { capture: true, passive: true });
    document.addEventListener("keydown", onGesture, true);
    document.addEventListener("pointerdown", onApGesture, { capture: true, passive: true });
    document.addEventListener("keydown", onApGesture, true);
    document.addEventListener("pointerdown", onStoryUser, { capture: true, passive: true });
    document.addEventListener("keydown", onStoryUser, true);
    document.addEventListener("volumechange", onAnyVolume, true);
    document.addEventListener("pointerout", onPointerOut, true);
    document.addEventListener("play", onPlay, true);
    document.addEventListener("loadedmetadata", onMeta, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    document.addEventListener("enterpictureinpicture", onPipEvent, true);
    document.addEventListener("leavepictureinpicture", onPipEvent, true);
  }

  function unbindDocument() {
    document.removeEventListener("pointermove", onPointerMove, true);
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("visibilitychange", onVisibility);
    if (offRoute) offRoute();
    offRoute = null;
    document.removeEventListener("pointerdown", onGesture, true);
    document.removeEventListener("keydown", onGesture, true);
    document.removeEventListener("pointerdown", onApGesture, true);
    document.removeEventListener("keydown", onApGesture, true);
    document.removeEventListener("pointerdown", onStoryUser, true);
    document.removeEventListener("keydown", onStoryUser, true);
    document.removeEventListener("volumechange", onAnyVolume, true);
    document.removeEventListener("pointerout", onPointerOut, true);
    document.removeEventListener("play", onPlay, true);
    document.removeEventListener("loadedmetadata", onMeta, true);
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("fullscreenchange", onFullscreen);
    document.removeEventListener("focusin", onFocusIn, true);
    document.removeEventListener("focusout", onFocusOut, true);
    document.removeEventListener("enterpictureinpicture", onPipEvent, true);
    document.removeEventListener("leavepictureinpicture", onPipEvent, true);
  }

  function install() {
    if (live) return;
    live = true;
    callAt = -Infinity;
    inCall(true);
    loadLabels();
    bindDocument();
    setAutoAdvance(advanceWanted);
    syncStoryPause();
    grabPlaying();
  }

  function uninstall() {
    restoreNativeSounds();
    soundCandidates = [];
    gestureVideo = null;
    soundVideo = null;
    setAutoAdvance(false);
    live = false;
    syncStoryPause();
    if (playRaf) cancelAnimationFrame(playRaf);
    playRaf = 0;
    playNode = null;
    stackTarget = stackVid = stackImg = null;
    barVisible = false;
    if (moveRaf) {
      cancelAnimationFrame(moveRaf);
      moveRaf = 0;
    }
    if (posRaf) {
      cancelAnimationFrame(posRaf);
      posRaf = 0;
    }
    clearStill();
    if (pillTimer) {
      clearTimeout(pillTimer);
      pillTimer = 0;
    }
    if (shortcutTimer) {
      clearTimeout(shortcutTimer);
      shortcutTimer = 0;
    }
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = 0;
    }
    shortcutUntil = 0;
    dropTools(null);
    bindView(false);
    unbindDocument();
    unbindActive();
    active = null;
    hovered = null;
    photoImg = null;
    photoOn = false;
    overVideo = false;
    overBar = false;
    overField = false;
    barFocused = false;
    closeMenu();
    downloadButton = photoButton = null;
    openEl = null;
    openAnchor = null;
    scrubbing = false;
    hasCache = false;
    cacheW = 0;
    cacheH = 0;
    wasReel = false;
    wasStory = false;
    liftPx = 0;
    lastTx = NaN;
    lastTy = NaN;
    lastTw = 0;
    lastTh = 0;
    photoX = NaN;
    photoY = NaN;
    if (host && host.parentNode) host.parentNode.removeChild(host);
    if (photoHost && photoHost.parentNode) photoHost.parentNode.removeChild(photoHost);
    if (toastHost && toastHost.parentNode) toastHost.parentNode.removeChild(toastHost);
    host = null;
    bar = null;
    chip = null;
    menu = null;
    menuItems = [];
    progress = null;
    buffer = null;
    fill = null;
    tooltip = null;
    timeEl = null;
    volume = null;
    loopBtn = null;
    pipBtn = null;
    playBtn = null;
    muteBtn = null;
    toolsBtn = null;
    toolsMenu = null;
    toolItems = {};
    playIcon = null;
    pauseIcon = null;
    muteIcon = null;
    soundIcon = null;
    pill = null;
    photoHost = null;
    toastHost = null;
    toastText = null;
  }

  IY.core.feature("video", {
    keys: ["cfg", "ui", "speed", "shortcuts"],
    enabled: ({ cfg }) => readEnabled(cfg),
    start(settings) {
      speed = nearestSpeed(settings.speed);
      readUi(settings.ui, settings.cfg);
      readShortcuts(settings.shortcuts);
      install();
    },
    update(settings, changed) {
      if (changed.includes("shortcuts")) readShortcuts(settings.shortcuts);
      if (changed.includes("speed")) {
        const next = nearestSpeed(settings.speed);
        if (next !== speed) applySpeed(next, false);
        else updateChip();
      }
      if (changed.includes("ui") || changed.includes("cfg")) readUi(settings.ui, settings.cfg);
    },
    stop: uninstall
  });
})();
