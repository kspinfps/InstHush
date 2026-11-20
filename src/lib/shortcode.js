(function () {
  "use strict";
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  function shortcodeToPk(code) {
    if (typeof code !== "string" || !code.length) throw new TypeError("Invalid shortcode");
    let pk = 0n;
    for (const char of code.slice(0, 11)) {
      const digit = alphabet.indexOf(char);
      if (digit < 0) throw new TypeError("Invalid shortcode");
      pk = pk * 64n + BigInt(digit);
    }
    return pk.toString();
  }
  function codeFromPath(pathname) {
    if (typeof pathname !== "string") return null;
    // /stories/highlights/<id>/ is a highlight reel id, not a story media pk.
    const story = /^\/stories\/([^/]+)\/(\d+)\/?$/.exec(pathname);
    if (story) return story[1] === "highlights" ? null : { kind: "story", pk: story[2] };
    const post = /^\/(?:[^/]+\/)?(p|reel|reels)\/([A-Za-z0-9_-]+)\/?$/.exec(pathname);
    if (!post) return null;
    return { kind: post[1] === "p" ? "post" : "reel", code: post[2] };
  }
  const API = { shortcodeToPk, codeFromPath };
  if (typeof module !== "undefined") module.exports = API; else globalThis.IY = Object.assign(globalThis.IY || {}, API);
})();
