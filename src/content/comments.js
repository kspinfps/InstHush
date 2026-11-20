(function () {
  "use strict";

  var CLASS = "iy-comment-copy";
  var FEEDBACK_MS = 1200;
  var MAX_WALK = 14;
  var SCAN_BUDGET = 200;
  // Reply labels Instagram ships. Matching is exact after trim and Unicode
  // lowercasing, so a longer control ("View replies") does not qualify.
  let cachedSelectors = typeof module !== "undefined" && module.exports ? require("./core/selectors.js") : null;
  function getSelectors() {
    if (!cachedSelectors && globalThis.IY && globalThis.IY.selectors) cachedSelectors = globalThis.IY.selectors;
    return cachedSelectors || { reply: {}, postScope: 'article, [role="dialog"]' };
  }

  function elementOf(node) {
    if (!node) return null;
    if (node.nodeType === 1) return node;
    return node.parentElement || null;
  }

  function containsNode(ancestor, node) {
    var current = node;
    while (current) {
      if (current === ancestor) return true;
      current = current.parentElement;
    }
    return false;
  }

  function plainText(node) {
    if (!node) return "";
    if (node.nodeType === 3) return node.nodeValue || "";
    if (node.nodeType !== 1) return "";
    if (node.tagName === "BR") return "\n";
    var out = "";
    var kids = node.childNodes || [];
    for (var i = 0; i < kids.length; i++) out += plainText(kids[i]);
    return out;
  }

  function normLabel(value) {
    return String(value || "").replace(/[\u200b\u200c\u200d\ufeff]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function isReplyControl(el) {
    if (!el || el.nodeType !== 1) return false;
    var role = el.getAttribute && el.getAttribute("role");
    if (el.tagName !== "BUTTON" && role !== "button") return false;
    if (el.classList && el.classList.contains(CLASS)) return false;
    return Object.hasOwn(getSelectors().reply, normLabel(plainText(el)));
  }

  function hasAutoSpan(el, depth) {
    if (!el || el.nodeType !== 1 || depth > 12) return false;
    var kids = el.children || [];
    for (var i = 0; i < kids.length; i++) {
      var child = kids[i];
      if (child.tagName === "SPAN" && child.getAttribute("dir") === "auto") return true;
      if (hasAutoSpan(child, depth + 1)) return true;
    }
    return false;
  }

  function shallowFind(el, pred, maxDepth) {
    var found = null;
    function walk(node, depth) {
      if (found || depth > maxDepth) return;
      var kids = node.children || [];
      for (var i = 0; i < kids.length; i++) {
        if (pred(kids[i])) { found = kids[i]; return; }
        walk(kids[i], depth + 1);
      }
    }
    walk(el, 1);
    return found;
  }

  function looksLikeControl(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.tagName === "BUTTON" || el.tagName === "TIME") return true;
    if (el.getAttribute("role") === "button") return true;
    if (el.tagName === "A" || el.tagName === "SPAN" || el.tagName === "DIV") {
      return !!shallowFind(el, function (node) {
        return node.tagName === "TIME" || node.tagName === "BUTTON" || node.getAttribute("role") === "button";
      }, 3);
    }
    return false;
  }

  function textShorterThan(el, limit) {
    var count = 0;
    var over = false;
    function walk(node) {
      if (over) return;
      if (node.nodeType === 3) {
        count += (node.nodeValue || "").length;
        if (count > limit) over = true;
        return;
      }
      if (node.nodeType !== 1 || node.tagName === "BR") return;
      var kids = node.childNodes || [];
      for (var i = 0; i < kids.length; i++) walk(kids[i]);
    }
    walk(el);
    return !over;
  }

  // An action row is the small strip under a comment, not the comment itself
  // and not a single timestamp link. Class names are ignored.
  // It must:
  //   - not be a button, link, or time (those are controls inside the row)
  //   - not contain the comment body (`span[dir="auto"]`)
  //   - contain a `time`, or a button whose label is a reply word, within 4 levels
  //   - group at least two controls, so a lone composer "Reply" is skipped
  //   - stay short, so a whole thread cannot qualify
  function isActionRow(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = el.tagName;
    if (tag === "BUTTON" || tag === "A" || tag === "TIME" || tag === "INPUT" || tag === "TEXTAREA") return false;
    var kids = el.children || [];
    if (!kids.length || kids.length > 12) return false;
    if (hasAutoSpan(el, 0)) return false;
    var time = shallowFind(el, function (node) { return node.tagName === "TIME"; }, 4);
    var reply = shallowFind(el, isReplyControl, 4);
    if (!time && !reply) return false;
    var controls = 0;
    for (var i = 0; i < kids.length; i++) if (looksLikeControl(kids[i])) controls++;
    if (controls < 2) return false;
    return textShorterThan(el, 400);
  }

  function hasRow(el, depth) {
    if (!el || el.nodeType !== 1 || depth > 12) return false;
    var kids = el.children || [];
    for (var i = 0; i < kids.length; i++) {
      if (isActionRow(kids[i]) || hasRow(kids[i], depth + 1)) return true;
    }
    return false;
  }

  function isCommentUnit(el) {
    return !!(el && el.nodeType === 1 && hasAutoSpan(el, 0) && hasRow(el, 0));
  }

  // Rows owned by this element. A nested reply is its own comment unit: skip
  // it unless the pointer is inside it. A unit that is a direct sibling of the
  // pointer (the avatar sits beside the body) is still in this comment, so it
  // is scanned until the first row. Anything wider than one row is rejected
  // by the caller. The scan stops after SCAN_BUDGET nodes.
  function ownedRows(root, target) {
    var out = [];
    var seen = 0;
    var truncated = false;
    function walk(el) {
      if (truncated) return;
      var kids = el.children || [];
      var direct = false;
      for (var i = 0; i < kids.length; i++) if (kids[i] === target) direct = true;
      var seenRow = false;
      for (var j = 0; j < kids.length; j++) {
        if (++seen > SCAN_BUDGET) { truncated = true; return; }
        var child = kids[j];
        if (isActionRow(child)) { out.push(child); seenRow = true; continue; }
        var foreign = isCommentUnit(child) && !containsNode(child, target);
        if (foreign && !(direct && !seenRow)) continue;
        walk(child);
      }
    }
    walk(root);
    return truncated ? null : out;
  }

  function actionRowFor(target) {
    var el = elementOf(target);
    if (!el) return null;
    var up = el;
    for (var i = 0; up && i < MAX_WALK; i++, up = up.parentElement) {
      if (isActionRow(up)) return up;
      if (isPostRoot(up)) break;
    }
    up = el;
    for (var j = 0; up && j < MAX_WALK; j++, up = up.parentElement) {
      var rows = ownedRows(up, el);
      if (rows === null || rows.length > 1) return null;
      if (rows.length === 1) return rows[0];
      if (isPostRoot(up)) break;
    }
    return null;
  }

  function lastAutoSpan(el) {
    if (!el || el.nodeType !== 1 || isActionRow(el)) return null;
    var found = el.tagName === "SPAN" && el.getAttribute("dir") === "auto" ? el : null;
    var kids = el.children || [];
    for (var i = 0; i < kids.length; i++) {
      var span = lastAutoSpan(kids[i]);
      if (span) found = span;
    }
    return found;
  }

  // Nearest preceding `span[dir="auto"]` in the same comment. The previous
  // sibling is tried first, so a nested reply does not climb into its parent.
  // When several dir=auto spans sit in that sibling (username, then body),
  // the last one in tree order is the body.
  function commentBody(row) {
    var node = row;
    for (var depth = 0; node && depth < 5; depth++, node = node.parentElement) {
      var prev = node.previousElementSibling;
      while (prev) {
        var span = lastAutoSpan(prev);
        if (span) return span;
        prev = prev.previousElementSibling;
      }
    }
    return null;
  }

  function moreButton(row) {
    return shallowFind(row, function (node) {
      if (node.tagName !== "BUTTON" && node.getAttribute("role") !== "button") return false;
      var label = node.getAttribute("aria-label") || "";
      var glyph = shallowFind(node, function (child) { return !!child.getAttribute("aria-label"); }, 2);
      if (glyph) label += " " + glyph.getAttribute("aria-label");
      return /^(…|⋯|\.{3})$/.test(plainText(node).trim()) ||
        /\b(more|options)\b|seçenekler|daha fazla/i.test(label);
    }, 4);
  }

  // Caption "more" is a short control, not the comment ellipsis menu.
  // [Tahmin] Instagram uses "more" / "… more" / "daha fazla" on a button,
  // role=button, or role=link, sometimes a bare span next to the text.
  var MORE_LABEL = {
    "more": 1,
    "… more": 1,
    "... more": 1,
    "daha fazla": 1,
    "… daha fazla": 1,
    "... daha fazla": 1
  };

  function isMoreLabel(value) {
    var text = normLabel(value);
    if (MORE_LABEL[text]) return true;
    if (text.slice(0, 3) === "...") text = "…" + text.slice(3);
    return !!MORE_LABEL[text.trim()];
  }

  function isMoreControl(el) {
    if (!el || el.nodeType !== 1) return false;
    var role = el.getAttribute("role");
    var tag = el.tagName;
    var textual = tag === "BUTTON" || role === "button" || role === "link";
    if (!textual && tag !== "SPAN" && tag !== "DIV") return false;
    var label = plainText(el);
    var aria = el.getAttribute("aria-label") || "";
    if (!isMoreLabel(label) && !isMoreLabel(aria)) return false;
    if (textual) return true;
    return textShorterThan(el, 40) && !hasAutoSpan(el, 0);
  }

  function isCopyButton(el) {
    if (!el || el.nodeType !== 1 || el.tagName !== "BUTTON") return false;
    if (el.classList && el.classList.contains(CLASS)) return true;
    var name = el.className;
    return typeof name === "string" && (" " + name + " ").indexOf(" " + CLASS + " ") !== -1;
  }

  function isProfileAnchor(el) {
    if (!el || el.nodeType !== 1 || el.tagName !== "A") return false;
    var href = (el.getAttribute("href") || "").replace(/^https?:\/\/(?:www\.)?instagram\.com(?=\/|$)/i, "").split(/[?#]/)[0];
    if (!href || href.charAt(0) !== "/") return false;
    if (href.indexOf("/explore/") === 0 || href.indexOf("/p/") === 0) return false;
    if (href.indexOf("/reel/") === 0 || href.indexOf("/stories/") === 0) return false;
    var parts = href.split("/");
    var kept = [];
    for (var i = 0; i < parts.length; i++) if (parts[i]) kept.push(parts[i]);
    return kept.length === 1;
  }

  function isProfileLinkText(el) {
    var node = el;
    for (var i = 0; node && i < 4; i++, node = node.parentElement) {
      if (isProfileAnchor(node)) return true;
    }
    return false;
  }

  function isAutoText(el) {
    return !!(el && el.nodeType === 1 && (el.tagName === "SPAN" || el.tagName === "H1") && el.getAttribute("dir") === "auto");
  }

  function ancestorTag(el, tag) {
    var node = el ? el.parentElement : null;
    for (var i = 0; node && i < 6; i++, node = node.parentElement) {
      if (node.tagName === tag) return node;
    }
    return null;
  }

  function lastAutoIn(el) {
    var found = null;
    function walk(node, depth) {
      if (!node || depth > 6) return;
      var kids = node.children || [];
      for (var i = 0; i < kids.length; i++) {
        var child = kids[i];
        if (isAutoText(child) && !isProfileLinkText(child) && !isMoreControl(child)) found = child;
        walk(child, depth + 1);
      }
    }
    walk(el, 0);
    return found;
  }

  function hasHashtag(el) {
    var found = false;
    function walk(node, depth) {
      if (found || !node || depth > 6) return;
      if (node.nodeType === 1 && node.tagName === "A") {
        var href = node.getAttribute("href") || "";
        var text = plainText(node).replace(/^\s+|\s+$/g, "");
        if (href.indexOf("/explore/tags/") !== -1 || href.indexOf("/explore/search/") !== -1 || text.charAt(0) === "#") {
          found = true;
          return;
        }
      }
      var kids = node.children || [];
      for (var i = 0; i < kids.length; i++) walk(kids[i], depth + 1);
    }
    walk(el, 0);
    return found;
  }

  function associatedMore(span) {
    if (shallowFind(span, isMoreControl, 4)) return true;
    var parent = span.parentElement;
    if (!parent) return false;
    if (shallowFind(parent, isMoreControl, 2)) return true;
    var grand = parent.parentElement;
    if (!grand) return false;
    var kids = grand.children || [];
    for (var i = 0; i < kids.length; i++) if (isMoreControl(kids[i])) return true;
    return false;
  }

  function parentHasTimeNoReply(span) {
    var parent = span.parentElement;
    if (!parent || isActionRow(parent)) return false;
    if (shallowFind(parent, isReplyControl, 4)) return false;
    return !!shallowFind(parent, function (node) { return node.tagName === "TIME"; }, 2);
  }

  function besideAuthor(span) {
    if (captionExcluded(span)) return false;
    var parent = span.parentElement;
    if (!parent || isActionRow(parent)) return false;
    if (shallowFind(parent, isReplyControl, 3)) return false;
    var kids = parent.children || [];
    for (var i = 0; i < kids.length; i++) {
      var child = kids[i];
      if (child === span) continue;
      if (child.tagName === "HEADER") continue;
      if (isProfileAnchor(child) || shallowFind(child, function (node) {
        return !captionExcluded(node) && isProfileAnchor(node);
      }, 2)) return true;
    }
    return false;
  }

  function insideAnchor(el) {
    var node = el ? el.parentElement : null;
    for (var i = 0; node && i < 6; i++, node = node.parentElement) {
      if (node.tagName === "A") return true;
    }
    return false;
  }

  function isPostRoot(el) {
    return el.tagName === "ARTICLE" || el.getAttribute("role") === "dialog";
  }

  function captionExcluded(el) {
    var node = el;
    for (var i = 0; node && i < 24; i++, node = node.parentElement) {
      var role = node.getAttribute("role");
      if (node.tagName === "BUTTON" || role === "button" || role === "link" ||
          node.tagName === "HEADER" || node.tagName === "H2") return true;
      if (isPostRoot(node)) break;
    }
    return false;
  }

  // Bounded: at most CAPTION_UI_DEPTH levels and CAPTION_UI_NODES visited nodes. A
  // subtree that still has unvisited nodes when the budget runs out is not a plain
  // caption span, so it counts as UI (safe side: nothing is injected into it).
  var CAPTION_UI_DEPTH = 6;
  var CAPTION_UI_NODES = 400;

  function hasCaptionUI(el) {
    var budget = { left: CAPTION_UI_NODES };
    function walk(node, depth) {
      var kids = node.children || [];
      if (kids.length && depth >= CAPTION_UI_DEPTH) return true;
      for (var i = 0; i < kids.length; i++) {
        var child = kids[i];
        if (--budget.left < 0) return true;
        if (isMoreControl(child) || isCopyButton(child)) continue;
        if (child.tagName === "BUTTON" || child.getAttribute("role") === "button" ||
            child.tagName === "TIME" || walk(child, depth + 1)) return true;
      }
      return false;
    }
    return walk(el, 0);
  }

  // Post caption, not a comment. [Tahmin] Instagram puts the author text in
  // `h1 span[dir="auto"]` (username link first, caption last), beside the
  // author link or the post `time`, next to a "more" control, or as a hashtag
  // span. Expanded captions still need one of these structural signals.
  // The more control is never clicked; only
  // text already in the DOM is copied.
  // Cheap structural checks run first; captionText and actionRowFor only for a
  // span that would otherwise qualify. rowCovered: the caller already ran
  // actionRowFor for the pointer target and el is on its ancestor chain, so the
  // second lookup would repeat the same walk.
  function isCaptionSpan(el, rowCovered) {
    if (!isAutoText(el) || isMoreControl(el) || isProfileLinkText(el)) return false;
    if (captionExcluded(el) || hasCaptionUI(el)) return false;
    if (ancestorTag(el, "H3") || insideAnchor(el)) return false;
    var h1 = el.tagName === "H1" ? el : ancestorTag(el, "H1");
    var structural;
    if (h1) {
      var inner = lastAutoIn(h1);
      structural = inner ? el === inner : el.tagName === "H1";
    } else {
      structural = parentHasTimeNoReply(el) || associatedMore(el) || hasHashtag(el) || besideAuthor(el);
    }
    if (!structural) return false;
    if (!captionText(el)) return false;
    if (!rowCovered && actionRowFor(el)) return false;
    return true;
  }

  function captionCandidate(node) {
    if (isCaptionSpan(node, true)) return node;
    if (node.tagName === "H1") {
      var inner = lastAutoIn(node);
      if (inner && isCaptionSpan(inner)) return inner;
    }
    var kids = node.children || [];
    for (var i = 0; i < kids.length; i++) {
      var child = kids[i];
      if (isCaptionSpan(child)) return child;
      if (child.tagName === "H1") {
        var nested = lastAutoIn(child);
        if (nested && isCaptionSpan(nested)) return nested;
      }
    }
    return null;
  }

  function captionFor(target, knownRow) {
    var el = elementOf(target);
    if (!el) return null;
    if (knownRow === undefined ? actionRowFor(el) : knownRow) return null;
    var node = el;
    for (var i = 0; node && i < MAX_WALK; i++, node = node.parentElement) {
      if (isActionRow(node) || isCommentUnit(node)) return null;
      var found = captionCandidate(node);
      if (found) return found;
      if (isPostRoot(node)) break;
    }
    return null;
  }

  function captionText(node) {
    if (!node) return "";
    function walk(n) {
      if (!n) return "";
      if (n.nodeType === 3) return n.nodeValue || "";
      if (n.nodeType !== 1) return "";
      if (n.tagName === "BR") return "\n";
      if (n !== node) {
        var role = n.getAttribute("role");
        if (isMoreControl(n) || isCopyButton(n) || n.tagName === "BUTTON" ||
            role === "button" || role === "link" || n.tagName === "TIME") return "";
        if (isProfileAnchor(n) && plainText(n).trim().charAt(0) !== "@") return "";
      }
      var out = "";
      var kids = n.childNodes || [];
      for (var i = 0; i < kids.length; i++) out += walk(kids[i]);
      return out;
    }
    var text = walk(node);
    if (associatedMore(node)) text = text.replace(/\s*(?:\u2026|\.\.\.)\s*$/, "");
    return text.replace(/^\s+|\s+$/g, "");
  }

  function boot() {
    if (typeof document === "undefined") return;
    if (globalThis.__iyCommentsInstalled) return;
    globalThis.__iyCommentsInstalled = true;

    var seen = new WeakSet();
    var tokens = new WeakMap();
    var enabled = true;
    var queued = false;
    var pending = null;
    var lastTarget = null;
    var listenOpts = { capture: true, passive: true };

    function label(key, fallback) {
      try {
        if (typeof chrome !== "undefined" && chrome.i18n && chrome.i18n.getMessage) {
          var text = chrome.i18n.getMessage(key);
          if (text) return text;
        }
      } catch (err) {}
      return fallback;
    }

    function findButton(row) {
      var kids = row.children || [];
      for (var i = 0; i < kids.length; i++) {
        var child = kids[i];
        if (child.tagName === "BUTTON" && child.classList && child.classList.contains(CLASS)) return child;
      }
      return null;
    }

    function styleLike(button, row) {
      button.style.font = "inherit";
      button.style.color = "inherit";
      button.style.fontSize = "inherit";
      button.style.lineHeight = "inherit";
      button.style.background = "transparent";
      button.style.border = "0";
      button.style.padding = "0";
      button.style.margin = "0";
      button.style.cursor = "pointer";
      button.style.whiteSpace = "nowrap";
      button.style.flexShrink = "0";
      var sample = null;
      var kids = row.children || [];
      for (var i = 0; i < kids.length; i++) {
        if (kids[i] === button) continue;
        if (kids[i].tagName === "BUTTON" || kids[i].getAttribute("role") === "button") { sample = kids[i]; break; }
      }
      if (!sample || typeof getComputedStyle !== "function") return;
      var computed = getComputedStyle(sample);
      if (!computed) return;
      if (computed.font) button.style.font = computed.font;
      if (computed.color) button.style.color = computed.color;
      if (computed.fontSize) button.style.fontSize = computed.fontSize;
      if (computed.lineHeight) button.style.lineHeight = computed.lineHeight;
      if (computed.padding) button.style.padding = computed.padding;
      if (computed.marginRight) button.style.marginRight = computed.marginRight;
    }

    function legacyCopy(text) {
      var area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.setAttribute("aria-hidden", "true");
      area.tabIndex = -1;
      area.style.position = "fixed";
      area.style.top = "0";
      area.style.left = "-9999px";
      area.style.opacity = "0";
      document.documentElement.appendChild(area);
      area.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
      area.remove();
      return ok;
    }

    function copyText(text) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
        }
      } catch (err) {}
      return Promise.resolve(legacyCopy(text));
    }

    function showCopied(button) {
      var token = {};
      tokens.set(button, token);
      var done = label("commentCopied", "Kopyalandı");
      button.textContent = done;
      button.setAttribute("aria-label", done);
      setTimeout(function () {
        if (tokens.get(button) !== token || !button.isConnected) return;
        var idle = label("commentCopy", "Kopyala");
        button.textContent = idle;
        button.setAttribute("aria-label", idle);
      }, FEEDBACK_MS);
    }

    function inject(row) {
      var existing = findButton(row);
      if (existing) { seen.add(row); return; }
      if (seen.has(row)) seen.delete(row);
      if (!commentBody(row)) return;
      var idle = label("commentCopy", "Kopyala");
      var button = document.createElement("button");
      button.type = "button";
      button.className = CLASS;
      button.textContent = idle;
      button.setAttribute("aria-label", idle);
      styleLike(button, row);
      button.addEventListener("pointerdown", function (event) {
        if (!event.isTrusted) return;
        event.stopPropagation();
      });
      button.addEventListener("mousedown", function (event) {
        if (!event.isTrusted) return;
        event.stopPropagation();
      });
      button.addEventListener("click", function (event) {
        if (!event.isTrusted) return;
        event.preventDefault();
        event.stopPropagation();
        var body = commentBody(row);
        if (!body) return;
        copyText(plainText(body)).then(function (ok) { if (ok) showCopied(button); });
      });
      var more = moreButton(row);
      if (more) {
        // Use the row's direct child as the insertion anchor for wrapped controls.
        var anchor = more;
        while (anchor.parentElement && anchor.parentElement !== row) anchor = anchor.parentElement;
        row.style.flexWrap = "nowrap";
        // Instagram may absolutely position the native ellipsis; return it to
        // normal flow so it reserves space before the copy button.
        more.style.position = "static";
        more.style.marginRight = "0";
        anchor.style.position = "static";
        anchor.style.marginRight = "0";
        anchor.style.flexShrink = "0";
        button.style.marginLeft = "8px";
        row.insertBefore(button, anchor.nextSibling);
      } else {
        row.appendChild(button);
      }
      seen.add(row);
    }

    function injectCaption(span) {
      var host = span.parentElement;
      if (!host) return;
      var existing = findButton(host);
      if (existing) { seen.add(host); return; }
      if (seen.has(host)) seen.delete(host);
      var idle = label("commentCopy", "Kopyala");
      var button = document.createElement("button");
      button.type = "button";
      button.className = CLASS;
      button.textContent = idle;
      button.setAttribute("aria-label", idle);
      styleLike(button, host);
      button.style.marginLeft = "8px";
      button.addEventListener("pointerdown", function (event) {
        if (!event.isTrusted) return;
        event.stopPropagation();
      });
      button.addEventListener("mousedown", function (event) {
        if (!event.isTrusted) return;
        event.stopPropagation();
      });
      button.addEventListener("click", function (event) {
        if (!event.isTrusted) return;
        event.preventDefault();
        event.stopPropagation();
        var text = captionText(span);
        if (!text) return;
        copyText(text).then(function (ok) { if (ok) showCopied(button); });
      });
      if (span.nextSibling) host.insertBefore(button, span.nextSibling);
      else host.appendChild(button);
      seen.add(host);
    }

    function flush() {
      queued = false;
      var target = pending;
      pending = null;
      if (!enabled || !target || target.isConnected === false) return;
      if (lastTarget === target) return;
      lastTarget = target;
      var near = elementOf(target);
      for (var i = 0; near && i < 3; i++, near = near.parentElement) {
        if (isCopyButton(near)) return;
        if (seen.has(near)) {
          if (findButton(near)) return;
          seen.delete(near);
        }
      }
      try {
        var row = actionRowFor(target);
        if (row) inject(row);
        else {
          var cap = captionFor(target, row);
          if (cap) injectCaption(cap);
        }
      } catch (err) { lastTarget = null; throw err; }
    }

    function onOver(event) {
      if (!event.isTrusted) return;
      if (!event.target.closest || !event.target.closest(getSelectors().postScope)) return;
      pending = event.target;
      if (queued) return;
      queued = true;
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(IY.core.bind(flush));
      else flush();
    }


    function removeButtons() {
      var buttons = document.querySelectorAll("button." + CLASS);
      for (var i = 0; i < buttons.length; i++) {
        var button = buttons[i];
        if (button.parentElement) seen.delete(button.parentElement);
        button.remove();
      }
    }


    function readFlag(ui) {
      if (!ui || typeof ui.commentCopy !== "boolean") return true;
      return ui.commentCopy;
    }

    IY.core.feature("comments", {
      enabled: ({ ui }) => readFlag(ui),
      start() { enabled = true; IY.core.listen(document, "pointerover", onOver, listenOpts); },
      stop() { enabled = false; queued = false; pending = lastTarget = null; removeButtons(); }
    });
    (globalThis.IY = globalThis.IY || {}).commentsInspect = function (target) {
      if (!enabled || !target || !target.closest || !target.closest(getSelectors().postScope)) return;
      pending = target;
      flush();
    };

  }

  var api = { actionRowFor: actionRowFor, commentBody: commentBody, plainText: plainText, isActionRow: isActionRow, moreButton: moreButton, captionFor: captionFor, captionText: captionText, hasCaptionUI: hasCaptionUI };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else boot();
})();
