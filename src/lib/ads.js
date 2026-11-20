(function () {
  "use strict";
  // MAIN world: page scripts run after document_start and may patch built-ins.
  // Use only copies captured here (RegExp internals stay a documented residual).
  const uncurry = Function.prototype.bind.bind(Function.prototype.call);
  const JSONparse = JSON.parse;
  const JSONstringify = JSON.stringify;
  const isArray = Array.isArray;
  const objectKeys = Object.keys;
  const strIncludes = uncurry(String.prototype.includes);
  const strStartsWith = uncurry(String.prototype.startsWith);
  const strSlice = uncurry(String.prototype.slice);
  const strSplit = uncurry(String.prototype.split);
  const strReplace = uncurry(String.prototype.replace);
  const strTrim = uncurry(String.prototype.trim);
  const strLower = uncurry(String.prototype.toLowerCase);
  const strLocaleLower = uncurry(String.prototype.toLocaleLowerCase);
  const strIndexOf = uncurry(String.prototype.indexOf);
  const regexExec = uncurry(RegExp.prototype.exec);
  function muteEntry(value, account) {
    if (typeof value !== "string" || value.length > 102) return "";
    let clean = strTrim(value);
    if (account && clean[0] === "@") clean = strSlice(clean, 1);
    if (!clean || clean.length > 50) return "";
    if (account) {
      if (!regexExec(/^[A-Za-z0-9_](?:[A-Za-z0-9_.]{0,28}[A-Za-z0-9_])?$/, clean) || strIncludes(clean, "..")) return "";
      return strLower(clean);
    }
    return strLocaleLower(clean, "tr");
  }
  function normalizeMute(value) {
    const result = { words: [], accounts: [] };
    if (!value || typeof value !== "object" || isArray(value)) return result;
    for (let k = 0, names = ["words", "accounts"]; k < names.length; k++) {
      const key = names[k], list = value[key], out = result[key];
      if (!isArray(list)) continue;
      for (let i = 0; i < list.length && i < 100; i++) {
        const clean = muteEntry(list[i], key === "accounts");
        if (!clean) continue;
        let duplicate = false;
        for (let j = 0; j < out.length; j++) if (out[j] === clean) duplicate = true;
        if (!duplicate) out[out.length] = clean;
      }
    }
    return result;
  }
  function validMute(value) {
    if (!value || typeof value !== "object" || isArray(value) || objectKeys(value).length !== 2) return false;
    const normalized = normalizeMute(value);
    for (let k = 0, names = ["words", "accounts"]; k < names.length; k++) {
      const key = names[k], list = value[key];
      if (!isArray(list) || list.length > 100 || list.length !== normalized[key].length) return false;
      for (let i = 0; i < list.length; i++) if (list[i] !== normalized[key][i]) return false;
    }
    return true;
  }
  function matchesMutedWords(text, words) {
    if (typeof text !== "string" || text.length > 100000) return false;
    const folded = strLocaleLower(text, "tr");
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      let from = 0, at;
      while (word && (at = strIndexOf(folded, word, from)) !== -1) {
        const end = at + word.length;
        if (!regexExec(/(?:\p{L}|\p{M}|\p{N}|_)$/u, strSlice(folded, at > 1 ? at - 2 : 0, at)) &&
            !regexExec(/^(?:\p{L}|\p{M}|\p{N}|_)/u, strSlice(folded, end, end + 2))) return true;
        // Advance one char, not past the match: an overlapping later match may be a whole word.
        from = at + 1;
      }
    }
    return false;
  }
  // Value-aware markers: `"ad_id":null` or `"is_ad":false` must not force a full parse.
  // sponsor_tags and is_paid_partnership are organic partnership fields and never count.
  const MARKER = /"ad_media_items"\s*:\s*\[\s*\{|"ad_metadata"\s*:\s*(?:\{|\[\s*\{)|"ad_id"\s*:\s*(?!\s|null\b|0\b|"")|"is_ad"\s*:\s*(?:true|1\b)|"product_type"\s*:\s*"ad"|"ad"\s*:\s*(?:\{|true)|"ad_action"\s*:\s*"|"dr_ad_type"\s*:\s*[1-9"]/;
  const XSSI = "for (;;);";
  function hasAdMarker(text) {
    return typeof text === "string" && MARKER.test(text);
  }
  function hasUnsafeInt(text) {
    if (!regexExec(/\d{16,}/, text)) return false;
    let inString = false;
    let escaped = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch !== "-" && (ch < "0" || ch > "9")) continue;
      const start = i;
      if (ch === "-") {
        if (text[i + 1] < "0" || text[i + 1] > "9") continue;
        i++;
      }
      while (i + 1 < text.length && text[i + 1] >= "0" && text[i + 1] <= "9") i++;
      const end = i + 1;
      const token = strSlice(text, start, end);
      const before = start ? text[start - 1] : "";
      const after = end < text.length ? text[end] : "";
      if (strReplace(token, "-", "").length >= 16 &&
          !regexExec(/[A-Za-z0-9_$.-]/, before) && !regexExec(/[A-Za-z0-9_$.-]/, after)) return true;
    }
    return false;
  }
  // Ad-only markers on a single object. A bare `injected` flag also sits on organic
  // suggested units, so it counts only when it carries its own ad id.
  function hasAdProps(obj) {
    if (!obj || typeof obj !== "object") return false;
    const meta = obj.ad_metadata;
    const hasAdMeta = isArray(meta) ? meta.length > 0 : Boolean(meta && typeof meta === "object");
    const inj = obj.injected;
    return Boolean(
      obj.ad ||
      obj.ad_id ||
      obj.is_ad ||
      obj.ad_action ||
      hasAdMeta ||
      (inj && typeof inj === "object" && inj.ad_id) ||
      obj.dr_ad_type ||
      obj.product_type === "ad"
    );
  }
  function isAdItem(item) {
    if (!item || typeof item !== "object" || isArray(item)) return false;
    if (hasAdProps(item) || hasAdProps(item.media) || hasAdProps(item.media_or_ad)) return true;
    // A feed edge can hide the creative under ad_item. end_of_feed_demarcator
    // and suggested_users are not ads and are never consulted here.
    const wrapped = item.ad_item;
    if (wrapped && typeof wrapped === "object" && !isArray(wrapped)) {
      if (hasAdProps(wrapped) || hasAdProps(wrapped.media) || hasAdProps(wrapped.media_or_ad)) return true;
    }
    const es = item.explore_story;
    if (es && typeof es === "object") {
      if (hasAdProps(es) || hasAdProps(es.media) || hasAdProps(es.media_or_ad)) return true;
    }
    return false;
  }
  function isAdEdge(edge) {
    if (!edge || typeof edge !== "object") return false;
    return isAdItem(edge.node || edge);
  }
  function stripArray(list, test) {
    if (!isArray(list)) return 0;
    let removed = 0;
    let write = 0;
    for (let i = 0; i < list.length; i++) {
      if (test(list[i])) { removed++; continue; }
      list[write++] = list[i];
    }
    list.length = write;
    return removed;
  }
  function stripInnerLists(list) {
    if (!isArray(list)) return 0;
    let removed = 0;
    for (let i = 0; i < list.length; i++) {
      const entry = list[i];
      if (!entry || typeof entry !== "object") continue;
      const item = entry.node && typeof entry.node === "object" ? entry.node : entry;
      removed += stripArray(item.items, isAdItem) + stripArray(item.feed_items, isAdItem);
    }
    return removed;
  }
  function stripContainer(container) {
    if (!container || typeof container !== "object" || isArray(container)) return 0;
    return stripArray(container.edges, isAdEdge) +
      stripArray(container.items, isAdItem) +
      stripArray(container.feed_items, isAdItem) +
      stripInnerLists(container.edges) +
      stripInnerLists(container.items) +
      stripInnerLists(container.feed_items);
  }
  function holdsContainer(obj) {
    return !!obj && typeof obj === "object" && !isArray(obj) &&
      (isArray(obj.edges) || isArray(obj.items) || isArray(obj.feed_items));
  }
  // Known roots that are not a plain edges/items/feed_items connection.
  function stripKnownRoots(node) {
    if (!node || typeof node !== "object" || isArray(node)) return 0;
    let removed = 0;
    for (let i1 = 0, a1 = objectKeys(node); i1 < a1.length; i1++) { const key = a1[i1];
      if (!/^xdt_injected_\w+_units$/.test(key)) continue;
      const unit = node[key];
      if (!unit || typeof unit !== "object") continue;
      if (isArray(unit.ad_media_items)) {
        removed += unit.ad_media_items.length;
        unit.ad_media_items = [];
      }
      removed += stripContainer(unit);
    }
    const tray = node.xdt_api__v1__feed__reels_tray;
    if (isArray(tray)) removed += stripArray(tray, isAdItem);
    else if (tray && isArray(tray.tray)) removed += stripArray(tray.tray, isAdItem);
    const explore = node.xdt_api__v1__discover__topical_explore;
    const sections = explore && explore.sectional_items;
    if (isArray(sections)) {
      for (let i2 = 0, a2 = sections; i2 < a2.length; i2++) { const section = a2[i2];
        const content = section && section.layout_content;
        if (content) removed += stripArray(content.medias, isAdItem);
      }
    }
    return removed;
  }
  // Descend only toward list containers, or through viewer/user (and one
  // nameless wrapper that itself leads to a container). Depth is capped so
  // post media is never walked. filterAds only reaches this after the marker
  // matches; the XHR json path calls stripPayload on an already-parsed body.
  function stripTree(node, depth) {
    if (!node || typeof node !== "object" || isArray(node)) return 0;
    let removed = stripKnownRoots(node) + stripContainer(node);
    if (depth >= 3) return removed;
    const keys = objectKeys(node);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const child = node[key];
      if (!child || typeof child !== "object" || isArray(child)) continue;
      let descend = key === "viewer" || key === "user" || holdsContainer(child);
      if (!descend) {
        const inner = objectKeys(child);
        for (let j = 0; j < inner.length; j++) {
          if (holdsContainer(child[inner[j]])) { descend = true; break; }
        }
      }
      if (descend) removed += stripTree(child, depth + 1);
    }
    return removed;
  }
  // One Relay @defer patch: {path:[...], data:{...}}. A patch that is itself
  // an ad is nulled; a patch that is a connection keeps its organic edges.
  function stripDeferredEntry(entry) {
    if (!entry || typeof entry !== "object" || !isArray(entry.path)) return 0;
    const data = entry.data;
    if (!data || typeof data !== "object" || isArray(data)) return 0;
    const removed = stripTree(data, 0);
    if (!holdsContainer(data) && isAdEdge(data)) {
      entry.data = null;
      return removed || 1;
    }
    let extra = 0;
    if (data.node && typeof data.node === "object") {
      extra += stripArray(data.node.items, isAdItem) + stripArray(data.node.feed_items, isAdItem);
    }
    return removed + extra;
  }
  // Mutates one parsed GraphQL or REST payload; returns how many ad items it removed.
  function stripPayload(parsed) {
    if (!parsed || typeof parsed !== "object" || isArray(parsed)) return 0;
    let removed = stripContainer(parsed);
    const incremental = parsed.incremental;
    if (isArray(incremental)) {
      for (let i = 0; i < incremental.length; i++) removed += stripDeferredEntry(incremental[i]);
    }
    // A lone {path, data} chunk has no envelope .data connection to walk.
    if (isArray(parsed.path)) return removed + stripDeferredEntry(parsed);
    const data = parsed.data;
    if (!data || typeof data !== "object" || isArray(data)) return removed;
    return removed + stripTree(data, 0);
  }
  // Handles a plain JSON body, an XSSI-prefixed body, and newline-delimited
  // streamed payloads (@defer). A bad line stays as-is; sibling lines are still filtered.
  // Bootstrap-only: one nested JSON-string layer, capped before parsing.
  const NESTED_CAP = 1024 * 1024;
  function hasBootstrapMarker(text) {
    return typeof text === "string" && text.length <= NESTED_CAP && hasAdMarker(strReplace(text, /\\"/g, '"'));
  }
  function stripNested(root) {
    let removed = 0;
    let budget = 10000;
    function visit(node, depth) {
      if (!node || typeof node !== "object" || depth > 20 || --budget < 0) return;
      for (let i3 = 0, a3 = objectKeys(node); i3 < a3.length; i3++) { const key = a3[i3];
        const value = node[key];
        if (typeof value === "string" && value.length <= NESTED_CAP && hasAdMarker(value)) {
          if (hasUnsafeInt(value)) continue;
          try {
            const nested = JSONparse(value);
            const n = stripPayload(nested);
            if (n) { node[key] = JSONstringify(nested); removed += n; }
          } catch (_) { /* Invalid nested JSON stays untouched. */ }
        } else if (value && typeof value === "object") visit(value, depth + 1);
      }
    }
    visit(root, 0);
    return removed;
  }
  // Both a suggestion marker and explicit non-followed evidence are required; followed evidence wins.
  const SUGGESTED_MARKER = /"(?:is_suggested_post|is_recommended)"\s*:\s*true|"(?:recommendation_type|feed_item_type)"\s*:\s*"suggested_post"|"inventory_source"\s*:\s*"mixed_unconnected"/;
  function hasSuggestedMarker(text) {
    return typeof text === "string" && !!regexExec(SUGGESTED_MARKER, text);
  }
  function isSuggestedItem(entry) {
    if (!entry || typeof entry !== "object" || isArray(entry)) return false;
    const item = entry.node || entry;
    if (!item || typeof item !== "object" || isArray(item)) return false;
    // Grouped units are filtered member by member, never dropped with their posts.
    if ((isArray(item.items) && item.items.length) || (isArray(item.feed_items) && item.feed_items.length)) return false;
    const es = item.explore_story && typeof item.explore_story === "object" && !isArray(item.explore_story) ? item.explore_story : null;
    const candidates = [entry, item, item.media, item.media_or_ad, es, es && es.media, es && es.media_or_ad];
    let suggested = false, nonFollowed = false;
    for (let i4 = 0, a4 = candidates; i4 < a4.length; i4++) { const candidate = a4[i4];
      if (!candidate || typeof candidate !== "object" || isArray(candidate)) continue;
      // is_followed_by_viewer / following can also occur on the unit or author.
      for (let i5 = 0, a5 = [candidate, candidate.user, candidate.owner]; i5 < a5.length; i5++) { const subject = a5[i5];
        if (!subject || typeof subject !== "object") continue;
        for (let i6 = 0, a6 = [subject, subject.friendship_status]; i6 < a6.length; i6++) { const status = a6[i6];
          if (!status || typeof status !== "object") continue;
          if (status.following === true || status.is_followed_by_viewer === true) return false;
          if (status.following === false || status.is_followed_by_viewer === false) nonFollowed = true;
        }
      }
      if (candidate.is_suggested_post === true || candidate.is_recommended === true ||
          candidate.recommendation_type === "suggested_post" || candidate.feed_item_type === "suggested_post" ||
          candidate.inventory_source === "mixed_unconnected") suggested = true;
    }
    return suggested && nonFollowed;
  }
  // [Tahmin] Only home-feed roots/connections and their immediate grouped units.
  // Never walk arbitrary media trees or remove an unrecognised recommendation shape.
  const FEED_ROOT = /^(?:feed|home_feed|xdt_api__v1__feed__timeline(?:__connection)?)$/;
  function hasFeedRootPath(path) {
    for (let i = 0; i < path.length; i++) if (typeof path[i] === "string" && FEED_ROOT.test(path[i])) return true;
    return false;
  }
  function stripSuggestedContainer(container) {
    if (!container || typeof container !== "object" || isArray(container)) return 0;
    let removed = 0;
    for (let i7 = 0, a7 = ["edges", "items", "feed_items"]; i7 < a7.length; i7++) { const key = a7[i7];
      const list = container[key];
      removed += stripArray(list, isSuggestedItem);
      if (!isArray(list)) continue;
      for (let i8 = 0, a8 = list; i8 < a8.length; i8++) { const entry = a8[i8];
        const item = entry && (entry.node || entry);
        if (!item || typeof item !== "object") continue;
        removed += stripArray(item.items, isSuggestedItem) + stripArray(item.feed_items, isSuggestedItem);
      }
    }
    return removed;
  }
  function stripSuggestedPayload(parsed) {
    if (!parsed || typeof parsed !== "object" || isArray(parsed)) return 0;
    function roots(node, depth) {
      if (!node || typeof node !== "object" || isArray(node) || depth > 3) return 0;
      let removed = 0;
      for (let i9 = 0, a9 = objectKeys(node); i9 < a9.length; i9++) { const key = a9[i9];
        if (FEED_ROOT.test(key)) removed += stripSuggestedContainer(node[key]);
        else if (key === "viewer" || key === "user") removed += roots(node[key], depth + 1);
      }
      return removed;
    }
    function patch(entry) {
      if (!entry || !isArray(entry.path) || !hasFeedRootPath(entry.path)) return 0;
      if (isSuggestedItem(entry.data)) { entry.data = null; return 1; }
      return stripSuggestedContainer(entry.data);
    }
    let removed = isArray(parsed.path) ? patch(parsed) : stripSuggestedContainer(parsed) + roots(parsed.data, 0);
    if (isArray(parsed.incremental)) for (let ii = 0; ii < parsed.incremental.length; ii++) removed += patch(parsed.incremental[ii]);
    return removed;
  }
  function filterBody(text, bootstrap, hasMarker, strip) {
    const result = { text, removed: 0, error: false };
    if (!hasMarker(text) && !(bootstrap && hasBootstrapMarker(text))) return result;
    try {
      const prefix = strStartsWith(text, XSSI) ? XSSI : "";
      const body = prefix ? strSlice(text, prefix.length) : text;
      if (hasUnsafeInt(body)) return result;
      let out;
      try {
        const parsed = JSONparse(body);
        result.removed = strip(parsed) + (bootstrap ? stripNested(parsed) : 0);
        if (result.removed) out = JSONstringify(parsed);
      } catch (_) {
        // A single-line body that failed to parse is not NDJSON; do not parse it twice.
        if (!strIncludes(body, "\n")) return { text, removed: 0, error: true };
        let removed = 0;
        let failed = false;
        const lines = strSplit(body, "\n");
        const mapped = [];
        for (let li = 0; li < lines.length; li++) {
          const line = lines[li];
          if (!line || !hasMarker(line) || hasUnsafeInt(line)) { mapped[li] = line; continue; }
          try {
            const parsed = JSONparse(line);
            const n = strip(parsed);
            removed += n;
            mapped[li] = n ? JSONstringify(parsed) : line;
          } catch (_) {
            failed = true;
            mapped[li] = line;
          }
        }
        result.removed = removed;
        result.error = failed;
        if (removed) {
          out = "";
          for (let li = 0; li < mapped.length; li++) out += (li ? "\n" : "") + mapped[li];
        }
      }
      if (out !== undefined) result.text = prefix + out;
      return result;
    } catch (_) {
      return { text, removed: 0, error: true };
    }
  }
  function filterAds(text, bootstrap = false) {
    return filterBody(text, bootstrap, hasAdMarker, stripPayload);
  }
  // Pure text-in/text-out function, with the same XSSI/NDJSON and integer guards as ads.
  function filterSuggested(text) {
    return filterBody(text, false, hasSuggestedMarker, stripSuggestedPayload);
  }
  // [Tahmin] Feed media: node/media/media_or_ad, user/owner.username and
  // caption.text (REST), caption (string), or edge_media_to_caption (GraphQL).
  // Comments: explicit comments/Relay comment connections, user/owner + text.
  function isMutedItem(entry, mute, comment) {
    if (!entry || typeof entry !== "object" || isArray(entry)) return false;
    const item = entry.node || entry;
    if (!item || typeof item !== "object" || isArray(item) ||
        isArray(item.items) || isArray(item.feed_items)) return false;
    const es = !comment && item.explore_story && typeof item.explore_story === "object" && !isArray(item.explore_story) ? item.explore_story : null;
    const candidates = comment ? [item] : [item, item.media, item.media_or_ad, es, es && es.media, es && es.media_or_ad];
    for (let i = 0; i < candidates.length; i++) {
      const media = candidates[i];
      if (!media || typeof media !== "object" || isArray(media)) continue;
      const authors = [media.user, media.owner];
      for (let a = 0; a < authors.length; a++) {
        const username = authors[a] && muteEntry(authors[a].username, true);
        if (username) for (let j = 0; j < mute.accounts.length; j++) if (username === mute.accounts[j]) return true;
      }
      let text = comment ? media.text : typeof media.caption === "string" ? media.caption : media.caption && media.caption.text;
      if (!comment && typeof text !== "string") {
        const edges = media.edge_media_to_caption && media.edge_media_to_caption.edges;
        text = isArray(edges) && edges[0] && edges[0].node && edges[0].node.text;
      }
      if (matchesMutedWords(text, mute.words)) return true;
    }
    return false;
  }
  const COMMENT_ROOT = /^(?:comments|edge_media_to_(?:parent_)?comment|edge_threaded_comments|xdt_api__v1__media__media_id__comments__connection)$/;
  function stripMutePayload(parsed, mute, kind) {
    if (!parsed || typeof parsed !== "object" || isArray(parsed)) return 0;
    const feedTest = entry => isMutedItem(entry, mute, false);
    const commentTest = entry => isMutedItem(entry, mute, true);
    function container(node, comment) {
      if (isArray(node)) return comment ? stripArray(node, commentTest) : 0;
      if (!node || typeof node !== "object") return 0;
      const test = comment ? commentTest : feedTest;
      let removed = 0;
      for (let k = 0, keys = comment ? ["edges", "comments"] : ["edges", "items", "feed_items"]; k < keys.length; k++) {
        const list = node[keys[k]];
        removed += stripArray(list, test);
        if (!comment && isArray(list)) for (let i = 0; i < list.length; i++) {
          const item = list[i] && (list[i].node || list[i]);
          if (item) removed += stripArray(item.items, test) + stripArray(item.feed_items, test);
        }
      }
      return removed;
    }
    function roots(node, depth) {
      if (!node || typeof node !== "object" || isArray(node) || depth > 3) return 0;
      let removed = 0;
      const keys = objectKeys(node);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (regexExec(FEED_ROOT, key)) removed += container(node[key], false);
        else if (regexExec(COMMENT_ROOT, key)) removed += container(node[key], true);
        else if (key === "data" || key === "viewer" || key === "user" || key === "shortcode_media" || key === "media") removed += roots(node[key], depth + 1);
      }
      return removed;
    }
    function patch(entry) {
      if (!entry || !isArray(entry.path) || entry.path.length > 50) return 0;
      let known = false, comment = false;
      for (let i = 0; i < entry.path.length; i++) {
        if (typeof entry.path[i] !== "string") continue;
        if (regexExec(FEED_ROOT, entry.path[i])) known = true;
        if (regexExec(COMMENT_ROOT, entry.path[i])) { known = true; comment = true; }
      }
      if (!known) return 0;
      if (isMutedItem(entry.data, mute, comment)) { entry.data = null; return 1; }
      return container(entry.data, comment);
    }
    let removed = isArray(parsed.path) ? patch(parsed) : roots(parsed, 0) + (kind === "feed" ? container(parsed, false) : 0);
    if (isArray(parsed.incremental)) for (let i = 0; i < parsed.incremental.length; i++) removed += patch(parsed.incremental[i]);
    return removed;
  }
  // Bodies above this size fail open: no scan, no parse.
  const MUTE_CAP = 2 * 1024 * 1024;
  // Known feed/comment root names as a JSON key or as a string in an incremental "path".
  const MUTE_ROOT_TEXT = /"(?:feed|home_feed|xdt_api__v1__feed__timeline(?:__connection)?|comments|edge_media_to_(?:parent_)?comment|edge_threaded_comments|xdt_api__v1__media__media_id__comments__connection)"\s*[:,\]]/;
  const MUTE_USER_TEXT = /"username"\s*:/;
  const MUTE_WORD_TEXT = /"(?:caption|text)"\s*:/;
  // Structural twin of the text gate for an already parsed body (no stringify needed).
  function hasMuteRoot(parsed, kind) {
    if (kind === "feed") return true;
    if (!parsed || typeof parsed !== "object" || isArray(parsed)) return false;
    if (isArray(parsed.path) || isArray(parsed.incremental)) return true;
    function walk(node, depth) {
      if (!node || typeof node !== "object" || isArray(node) || depth > 3) return false;
      const keys = objectKeys(node);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (regexExec(FEED_ROOT, key) || regexExec(COMMENT_ROOT, key)) return true;
        if ((key === "data" || key === "viewer" || key === "user" || key === "shortcode_media" || key === "media") && walk(node[key], depth + 1)) return true;
      }
      return false;
    }
    return walk(parsed, 0);
  }
  function filterMute(text, value, kind) {
    const mute = normalizeMute(value);
    const words = mute.words.length > 0, accounts = mute.accounts.length > 0;
    if (!words && !accounts) return { text, removed: 0, error: false };
    if (typeof text !== "string" || text.length > MUTE_CAP) return { text, removed: 0, error: false };
    // No parse unless a known root is present (timeline REST is already known by `kind`)
    // and a field the configured mute list can match occurs.
    return filterBody(text, false, body => typeof body === "string" &&
      (kind === "feed" || !!regexExec(MUTE_ROOT_TEXT, body)) &&
      ((accounts && !!regexExec(MUTE_USER_TEXT, body)) || (words && !!regexExec(MUTE_WORD_TEXT, body))),
      parsed => stripMutePayload(parsed, mute, kind));
  }
  // [Tahmin] Reel media markers: product_type="clips", or media_type=2 with
  // object-valued clips_metadata. Carousel children are never inspected.
  // [Tahmin] Feed-only carousel keys: clips_netego, reels_tray, xdt_reels_*.
  // Standalone story/reels trays and arbitrary unknown roots are never walked.
  const REELS_UNIT_KEY = /^(?:clips_netego|reels_tray|xdt_reels_\w+)$/;
  const REELS_MARKER = /"product_type"\s*:\s*"clips"|"clips_metadata"\s*:\s*\{|"(?:clips_netego|reels_tray|xdt_reels_\w+)"\s*:\s*[\[{]/;
  const REELS_ROOT_TEXT = /"(?:feed|home_feed|xdt_api__v1__feed__timeline(?:__connection)?)"\s*[:,\]]/;
  function isReelItem(entry) {
    if (!entry || typeof entry !== "object" || isArray(entry)) return false;
    const item = entry.node || entry;
    if (!item || typeof item !== "object" || isArray(item)) return false;
    const es = item.explore_story && typeof item.explore_story === "object" && !isArray(item.explore_story) ? item.explore_story : null;
    const candidates = [entry, item, item.media, item.media_or_ad, es, es && es.media, es && es.media_or_ad];
    for (let i = 0; i < candidates.length; i++) {
      const media = candidates[i];
      if (!media || typeof media !== "object" || isArray(media) || media.media_type === 8) continue;
      if (media.product_type === "clips" || (media.media_type === 2 && media.clips_metadata &&
          typeof media.clips_metadata === "object" && !isArray(media.clips_metadata))) return true;
      const keys = objectKeys(media);
      for (let k = 0; k < keys.length; k++) {
        const value = media[keys[k]];
        if (regexExec(REELS_UNIT_KEY, keys[k]) && value && typeof value === "object") return true;
      }
    }
    return false;
  }
  function stripReelsContainer(container) {
    if (!container || typeof container !== "object" || isArray(container)) return 0;
    let removed = 0;
    const keys = ["edges", "items", "feed_items"];
    for (let k = 0; k < keys.length; k++) {
      const list = container[keys[k]];
      removed += stripArray(list, isReelItem);
      if (!isArray(list)) continue;
      for (let i = 0; i < list.length; i++) {
        const item = list[i] && (list[i].node || list[i]);
        if (item && typeof item === "object") removed += stripArray(item.items, isReelItem) + stripArray(item.feed_items, isReelItem);
      }
    }
    return removed;
  }
  function reelsPath(path) {
    if (!isArray(path) || path.length > 50) return false;
    for (let i = 0; i < path.length; i++) {
      if (typeof path[i] !== "string" || !regexExec(FEED_ROOT, path[i])) continue;
      let at = i + 1;
      // A connection, one unit, or one immediate grouped list/unit. Never a
      // media child, carousel child, story tray, or arbitrary deferred subtree.
      for (let level = 0; level < 2 && at < path.length; level++) {
        const key = path[at++];
        if (key !== "items" && key !== "feed_items" && !(level === 0 && key === "edges")) return false;
        if (at === path.length) return true;
        const index = path[at++];
        if (typeof index !== "number" || index < 0 || index % 1 !== 0) return false;
        if (path[at] === "node") at++;
      }
      return at === path.length;
    }
    return false;
  }
  // Share the bounded root walk between filtering and the parsed-XHR fast gate.
  function walkReelsRoots(node, depth, strip) {
    if (!node || typeof node !== "object" || isArray(node) || depth > 3) return 0;
    let found = 0;
    const keys = objectKeys(node);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (regexExec(FEED_ROOT, key)) found += strip ? stripReelsContainer(node[key]) : 1;
      else if (key === "data" || key === "viewer" || key === "user") found += walkReelsRoots(node[key], depth + 1, strip);
    }
    return found;
  }
  function hasReelsRoot(parsed, kind) {
    if (kind === "feed") return true;
    if (!parsed || typeof parsed !== "object" || isArray(parsed)) return false;
    if (isArray(parsed.path)) return reelsPath(parsed.path);
    if (walkReelsRoots(parsed, 0, false)) return true;
    const patches = parsed.incremental;
    if (isArray(patches)) for (let i = 0; i < patches.length; i++) if (patches[i] && reelsPath(patches[i].path)) return true;
    return false;
  }
  function stripReelsPayload(parsed, kind) {
    if (!parsed || typeof parsed !== "object" || isArray(parsed)) return 0;
    function patch(entry) {
      if (!entry || !reelsPath(entry.path)) return 0;
      if (isReelItem(entry.data)) { entry.data = null; return 1; }
      return stripReelsContainer(entry.data);
    }
    let removed = isArray(parsed.path) ? patch(parsed) : walkReelsRoots(parsed, 0, true) + (kind === "feed" ? stripReelsContainer(parsed) : 0);
    if (isArray(parsed.incremental)) for (let i = 0; i < parsed.incremental.length; i++) removed += patch(parsed.incremental[i]);
    return removed;
  }
  function filterReels(text, kind) {
    if (typeof text !== "string" || text.length > MUTE_CAP) return { text, removed: 0, error: false };
    return filterBody(text, false, body => typeof body === "string" &&
      (kind === "feed" || !!regexExec(REELS_ROOT_TEXT, body)) && !!regexExec(REELS_MARKER, body),
      parsed => stripReelsPayload(parsed, kind));
  }
  const API = { hasMuteRoot, hasAdMarker, hasBootstrapMarker, hasUnsafeInt, filterAds, stripPayload, hasSuggestedMarker, filterSuggested,
    normalizeMute, validMute, matchesMutedWords, filterMute, hasReelsRoot, filterReels };
  if (typeof module !== "undefined") module.exports = API; else globalThis.IY = Object.assign(globalThis.IY || {}, API);
})();
