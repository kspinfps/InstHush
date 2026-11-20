(function () {
  "use strict";
  // Existing InstHush selectors shared by the feed, comment and keyboard features.
  const selectors = {
    article: "article",
    dialog: '[role="dialog"]',
    postScope: 'article, [role="dialog"]',
    time: "time[datetime]",
    profileAnchor: 'a[href^="/"]',
    permalink: 'a[href^="/p/"], a[href^="/reel/"]',
    storyPause: '[aria-label="Pause" i], [aria-label="Duraklat" i], [aria-label="Durdur" i]',
    suggestedRegions: ['section[aria-label="Suggested for you"]', 'section[aria-label="Senin için önerilenler"]',
      '[role="region"][aria-label="Suggested for you"]', '[role="region"][aria-label="Senin için önerilenler"]'],
    reply: {
      "yanıtla": 1,
      "reply": 1,
      "responder": 1,
      "antworten": 1,
      "répondre": 1,
      "repondre": 1,
      "rispondi": 1,
      "ответить": 1,
      "رد": 1,
      "返信": 1,
      "답글": 1,
      "답글 달기": 1,
      "beantwoorden": 1,
      "odpowiedz": 1,
      "odpovědět": 1,
      "balas": 1,
      "回复": 1,
      "回覆": 1,
      "जवाब दें": 1,
      "trả lời": 1,
      "ตอบ": 1,
      "απάντηση": 1,
      "הגב": 1,
      "پاسخ": 1,
      "svar": 1,
      "svara": 1,
      "vastaa": 1,
      "válasz": 1,
      "răspunde": 1,
      "відповісти": 1,
      "উত্তর দিন": 1
    },
    nextPost: ["Next", "Next post", "İleri", "Sonraki", "Sonraki gönderi"],
    previousPost: ["Previous", "Previous post", "Go back", "Geri", "Önceki", "Önceki gönderi"]
  };
  if (typeof module !== "undefined" && module.exports) module.exports = selectors;
  else (globalThis.IY ||= {}).selectors = selectors;
})();
