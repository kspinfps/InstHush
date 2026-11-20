// Adapted from Glassgram (github.com/jewdev/glassgram), GPL-3.0-only
// Copyright jewdev
(function () {
  "use strict";

  const iy = globalThis.IY = globalThis.IY || {};
  const isNode = typeof module !== "undefined" && module.exports;
  const api = isNode ? require("./api.js") : iy.api;
  const resolve = isNode ? require("./resolve.js") : iy.resolve;
  const QUERY = "PolarisProfilePostsQuery";
  const CONNECTION = "xdt_api__v1__feed__user_timeline_graphql_connection";
  const USERNAME = /^[a-z0-9._]{1,30}$/i;
  const COLLECTION = /^\d{1,40}$/;
  const CODE = /^[a-z0-9_-]{1,64}$/i;

  function cursorString(value) {
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
    return typeof value === "string" && value.trim() ? value : undefined;
  }

  function mediaKind(media) {
    if (media?.product_type === "clips") return "reel";
    if (media?.media_type === 2 || media?.is_video || media?.__typename === "GraphVideo" ||
        media?.video_url || media?.video_versions || media?.video_dash_manifest) return "video";
    if (media?.media_type === 1 || media?.__typename === "GraphImage" ||
        media?.image_versions2 || media?.display_url || media?.display_resources) return "photo";
    return undefined;
  }

  function normalizePost(raw, username, normalizeMedia) {
    if (!raw || typeof raw !== "object") return null;
    const post = normalizeMedia(raw);
    if (!CODE.test(post.shortcode)) post.shortcode = "";
    if (!post.id && !post.shortcode) return null;
    if (username && post.username === "unknown") post.username = username;

    const children = raw.carousel_media || raw.edge_sidecar_to_children?.edges?.map?.(edge => edge?.node);
    const parentKind = mediaKind(raw);
    const childrenById = new Map();
    const kinds = new Set();
    if (Array.isArray(children)) {
      for (const child of children) {
        const kind = mediaKind(child);
        if (!kind) continue;
        const declared = kind === "reel" ? "video" : kind;
        kinds.add(declared);
        const id = String(child.pk ?? child.id ?? "").split("_")[0];
        if (id) childrenById.set(id, declared);
      }
    }
    const itemKinds = post.items.map(item => {
      const declared = post.isCarousel ? childrenById.get(item.id) : parentKind;
      if (item.dashOnly || item.type === "audio") return undefined;
      if (item.type === "image" && declared !== "video" && declared !== "reel") return "photo";
      if (item.type === "video") return declared === "reel" ? "reel" : "video";
      return undefined;
    });
    for (const kind of itemKinds) if (kind) kinds.add(kind);
    if (parentKind && !post.isCarousel) kinds.add(parentKind);
    return {
      ...post,
      kind: post.isCarousel ? "carousel" : parentKind || itemKinds[0] || "unknown",
      itemKinds,
      kinds: [...kinds],
      pinned: raw.is_pinned === true || (Array.isArray(raw.pinned_for_users) && raw.pinned_for_users.length > 0)
    };
  }

  function createPageApi(client, normalizeMedia = resolve.normalizeMedia) {
    let getProfileQuery;

    function error(message, code, status = 0) {
      return new client.ApiError(message, status, { code, rateLimited: code === "challenge" });
    }

    // The provider supplies a snapshot of Instagram's current request template via the private bridge.
    function setProfileQueryProvider(provider) {
      getProfileQuery = typeof provider === "function" ? provider : undefined;
    }

    async function checkBody(data) {
      if (data?.checkpoint_url || data?.checkpoint || data?.checkpoint_required === true ||
          data?.challenge_url || data?.challenge || data?.challenge_required === true) {
        await client.startCooldown();
        throw error("Instagram requires account verification", "challenge", 403);
      }
    }

    function page(items, more, candidate, username, cursor) {
      if (!Array.isArray(items)) throw error("Invalid post list", "invalid_response");
      const next = more === false ? undefined : cursorString(candidate);
      if ((more === true && !next) || (next && next === cursor)) {
        throw error("Invalid pagination cursor", "invalid_response");
      }
      return { posts: items.map(raw => normalizePost(raw, username, normalizeMedia)).filter(Boolean), next };
    }

    async function getProfilePostsPage(username, cursor, { signal } = {}) {
      if (typeof username !== "string" || !USERNAME.test(username) || /^\.+$/.test(username)) {
        throw error("Invalid username", "invalid_input", 400);
      }
      signal?.throwIfAborted();
      const left = await client.cooldownLeft();
      signal?.throwIfAborted();
      if (left > 0) {
        throw new client.ApiError("Instagram requests are paused", 429,
          { code: "rate_limited", rateLimited: true, remainingMs: left });
      }
      const query = await getProfileQuery?.(username, { signal });
      signal?.throwIfAborted();
      if (query?.friendlyName !== QUERY || !/^\d{1,40}$/.test(query.docId || "") ||
          !query.variables || Array.isArray(query.variables) || typeof query.variables !== "object") {
        throw error("Instagram's profile request format is unavailable", "profile_query_unavailable");
      }
      const variables = { ...query.variables, username };
      if (cursor) Object.assign(variables, { after: cursor, before: null, first: 12, last: null });
      else delete variables.after;
      const data = await client.igGraphql({
        friendlyName: QUERY,
        docId: query.docId,
        variables,
        fbDtsg: query.fbDtsg,
        lsd: query.lsd
      }, { signal });
      await checkBody(data);
      signal?.throwIfAborted();
      const connection = data?.data?.[CONNECTION];
      return page(connection?.edges?.map?.(edge => edge?.node), connection?.page_info?.has_next_page === true,
        connection?.page_info?.end_cursor, username, cursor);
    }

    async function getSavedPostsPage(collection = "all", cursor, { signal } = {}) {
      if (collection !== "all" && (typeof collection !== "string" || !COLLECTION.test(collection))) {
        throw error("Invalid collection", "invalid_input", 400);
      }
      const path = collection === "all" ? "/api/v1/feed/saved/posts/" : `/api/v1/feed/collection/${collection}/posts/`;
      signal?.throwIfAborted();
      const data = await client.igGet(cursor ? path + "?" + new URLSearchParams({ max_id: cursor }) : path, { signal });
      await checkBody(data);
      signal?.throwIfAborted();
      const items = data?.items ?? (data?.more_available === false ? [] : undefined);
      return page(items?.map?.(item => item?.media), data?.more_available, data?.next_max_id, undefined, cursor);
    }

    return { getProfilePostsPage, getSavedPostsPage, setProfileQueryProvider };
  }

  Object.assign(api, createPageApi(api));
  if (!isNode) api.setProfileQueryProvider(iy.getProfileQuery);
  if (isNode) module.exports = { createPageApi, QUERY, CONNECTION };
})();
