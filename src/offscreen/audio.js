// Adapted from Glassgram's src/offscreen/mp3.ts and jobs.ts, GPL-3.0-only.
(() => {
  "use strict";
  const RATE = 44100;
  const BLOCK = 1152 * 8;
  const INPUT_LIMIT = 64 * 1024 * 1024;
  const PCM_LIMIT = 192 * 1024 * 1024;
  const SILENCE = 1e-4;
  const MAX_SOURCES = 4;
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));

  function makeProgress(cb) {
    if (typeof cb !== "function") return () => {};
    let lastStage = "";
    let lastPercent = -1;
    let lastAt = 0;
    return (stage, percent) => {
      const p = Number.isFinite(percent) ? Math.max(0, Math.min(100, Math.round(percent))) : -1;
      const now = Date.now();
      if (stage === lastStage && p === lastPercent) return;
      if (stage === lastStage && p >= 0 && p < 100 && Math.abs(p - lastPercent) < 5 && now - lastAt < 150) return;
      lastStage = stage;
      lastPercent = p;
      lastAt = now;
      try { cb({ stage, percent: p >= 0 ? p : undefined }); } catch (_) {}
    };
  }

  function hasAudibleSignal(audio) {
    const channels = Math.min(audio.numberOfChannels, 2);
    for (let c = 0; c < channels; c++) {
      const data = audio.getChannelData(c);
      for (let i = 0; i < data.length; i++) {
        if (Math.abs(data[i]) > SILENCE) return true;
      }
    }
    return false;
  }

  async function readTrack(url, signal, env, report) {
    report("fetch", 0);
    let response;
    try {
      response = await env.fetch(url, {
        credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", signal
      });
    } catch (error) {
      signal.throwIfAborted();
      throw new Error("fetch");
    }
    if (response.url && !env.IY.isAllowedCdn(response.url)) {
      await response.body?.cancel().catch(() => {});
      throw new Error("source");
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => {});
      throw new Error("fetch");
    }
    const reader = response.body.getReader();
    const total = Number(response.headers?.get("content-length")) || 0;
    let size = 0;
    const parts = [];
    try {
      if (total > INPUT_LIMIT) throw new Error("size");
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > INPUT_LIMIT) throw new Error("size");
        parts.push(value);
        if (total > 0) report("fetch", (size / total) * 100);
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      if (signal.aborted) throw error;
      throw error.message === "size" ? error : new Error("fetch");
    } finally {
      reader.releaseLock();
    }
    if (!size) throw new Error("decode");
    report("fetch", 100);
    return new Blob(parts).arrayBuffer();
  }

  async function decode(url, signal, env, report) {
    const bytes = await readTrack(url, signal, env, report);
    signal.throwIfAborted();
    report("decode");
    let audio;
    try {
      audio = await new env.OfflineAudioContext(1, 1, RATE).decodeAudioData(bytes);
    } catch {
      throw new Error("decode");
    }
    signal.throwIfAborted();
    if (!audio.numberOfChannels || !audio.length) throw new Error("silent");
    if (audio.length * audio.numberOfChannels * 4 > PCM_LIMIT) throw new Error("size");
    if (!hasAudibleSignal(audio)) throw new Error("silent");
    return audio;
  }

  async function encode(audio, Encoder, signal, pause = tick, onProgress) {
    signal.throwIfAborted();
    const report = makeProgress(onProgress);
    const channels = Math.min(audio.numberOfChannels, 2);
    const source = Array.from({ length: channels }, (_, i) => audio.getChannelData(i));
    const scratch = source.map(() => new Int16Array(BLOCK));
    const encoder = new Encoder(channels, audio.sampleRate, 192);
    const parts = [];
    let audible = false;
    report("encode", 0);
    for (let offset = 0; offset < audio.length; offset += BLOCK) {
      signal.throwIfAborted();
      const length = Math.min(BLOCK, audio.length - offset);
      for (let c = 0; c < channels; c++) {
        for (let i = 0; i < length; i++) {
          const sample = Math.max(-1, Math.min(1, source[c][offset + i]));
          if (Math.abs(sample) > SILENCE) audible = true;
          scratch[c][i] = sample * (sample < 0 ? 32768 : 32767);
        }
      }
      const chunk = encoder.encodeBuffer(...scratch.map(buffer => buffer.subarray(0, length)));
      if (chunk.length) parts.push(chunk.slice());
      report("encode", ((offset + length) / audio.length) * 100);
      await pause();
    }
    signal.throwIfAborted();
    if (!audible) throw new Error("silent");
    const tail = encoder.flush();
    if (tail.length) parts.push(tail.slice());
    report("encode", 100);
    return new Blob(parts, { type: "audio/mpeg" });
  }

  // The classic vendor IIFE sets window.lamejs. Only one conversion owns it at a time.
  async function withEncoder(run, env) {
    const script = env.document.createElement("script");
    try {
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = () => reject(new Error("encoder"));
        script.src = env.chrome.runtime.getURL("src/vendor/lame.min.js");
        env.document.head.appendChild(script);
      });
      if (!env.lamejs || typeof env.lamejs.Mp3Encoder !== "function") throw new Error("encoder");
      return await run(env.lamejs.Mp3Encoder);
    } finally {
      env.lamejs = undefined;
      script.remove();
    }
  }

  function createHost(env = globalThis) {
    let running;
    const urls = new Set();
    return {
      cancel() { running?.abort(); },
      urls() { return Array.from(urls); },
      release(url) { if (urls.delete(url)) env.URL.revokeObjectURL(url); },
      async build(sources, duration, onProgress) {
        if (running) throw new Error("busy");
        if (!Array.isArray(sources) || !sources.length || sources.length > MAX_SOURCES ||
            !sources.every(url => env.IY.isAllowedCdn(url))) throw new Error("source");
        // Even mono cannot fit this duration. The decoder reports the actual
        // channel count after decoding, including for media without metadata.
        if (Number.isFinite(duration) && duration * RATE * 4 > PCM_LIMIT) throw new Error("size");
        const report = makeProgress(onProgress);
        running = new AbortController();
        const { signal } = running;
        try {
          for (const [index, url] of sources.entries()) {
            let audio;
            try {
              audio = await decode(url, signal, env, report);
            } catch (error) {
              signal.throwIfAborted();
              if (index + 1 < sources.length) continue;
              throw error;
            }
            const blob = await withEncoder(Encoder => encode(audio, Encoder, signal, tick, onProgress), env);
            signal.throwIfAborted();
            const result = env.URL.createObjectURL(blob);
            urls.add(result);
            return result;
          }
        } finally {
          running = null;
        }
      }
    };
  }

  function listen(runtime, host) {
    runtime.onMessage.addListener((msg, sender, reply) => {
      if (msg?.type !== "iy:audio-host" || sender.id !== runtime.id || sender.tab ||
          (sender.url && sender.url !== runtime.getURL("src/bg/sw.js"))) return false;
      if (msg.op === "build") {
        // Incoming offscreen messages refresh Chromium's idle service-worker timer.
        const heartbeat = setInterval(() => {
          runtime.sendMessage({ type: "iy:audio-active" }).catch(() => {});
        }, 20000);
        const onProgress = progress => {
          runtime.sendMessage({ type: "iy:audio-progress", stage: progress.stage, percent: progress.percent }).catch(() => {});
        };
        host.build(msg.sources, msg.duration, onProgress).then(url => reply({ ok: true, url }),
          error => reply({ ok: false, error: error.message })).finally(() => clearInterval(heartbeat));
        return true;
      }
      if (msg.op === "cancel" || msg.op === "recover") host.cancel();
      if (msg.op === "release") host.release(msg.url);
      reply({ ok: true, urls: host.urls() });
      return false;
    });
  }

  const api = { createHost, encode, listen };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else {
    globalThis.IY.audio = api;
    const runtime = globalThis.chrome.runtime;
    if (location.href === runtime.getURL("src/offscreen/audio.html")) listen(runtime, createHost());
  }
})();
