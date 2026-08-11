// ============================================================================
// preview.mjs — the 30s-track-preview policy, shared by both clients.
//
// Deezer's preview URLs are signed and expire after roughly a month, so the
// ones baked into the catalogue eventually 403. That was the original bug in
// this app: every stored URL had gone stale and the UI faked success. The fix
// is to resolve a fresh URL at play time and only fall back to the stored one.
//
// HOW that fresh URL is fetched differs per platform and is injected:
//   - web    JSONP, because api.deezer.com sends no CORS headers
//   - native a plain fetch, because there is no CORS in an app
// The policy itself must not differ, which is why it lives here.
// ============================================================================

/** Deezer's numeric track id, from our own item id or its Deezer link. */
export const deezerIdOf = (item) =>
  (String(item?.id || "").match(/^tr_(\d+)$/)
    || String(item?.links?.deezer || "").match(/track\/(\d+)/)
    || [])[1];

/**
 * A playable URL for a track, or null when nothing is available.
 * `fetchFresh(deezerId)` returns a URL or rejects; rejection is not an error,
 * it just means we fall back to whatever the catalogue shipped.
 */
export async function resolvePreview(item, fetchFresh) {
  const id = deezerIdOf(item);
  const fresh = id && fetchFresh ? await fetchFresh(id).catch(() => null) : null;
  return fresh || item?.links?.preview || null;
}
