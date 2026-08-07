// ============================================================================
// preview.js — 30s track previews.
//
// Deezer preview URLs are signed and expire (~30 days), so the ones baked into
// the catalogue eventually 403. Resolve a fresh one at play time via Deezer's
// JSONP API (api.deezer.com sends no CORS headers but supports ?output=jsonp),
// falling back to the stored URL when the network is unavailable.
// ============================================================================

const inflight = new Map();

function fetchFreshPreview(deezerId) {
  if (inflight.has(deezerId)) return inflight.get(deezerId);
  const p = new Promise((resolve, reject) => {
    const cb = "__dzPreview" + deezerId + "_" + Math.floor(Math.random() * 1e6);
    const script = document.createElement("script");
    const cleanup = () => { delete window[cb]; script.remove(); };
    const timer = setTimeout(() => { cleanup(); reject(new Error("jsonp timeout")); }, 8000);
    window[cb] = (data) => {
      clearTimeout(timer); cleanup();
      data?.preview ? resolve(data.preview) : reject(new Error("no preview"));
    };
    script.onerror = () => { clearTimeout(timer); cleanup(); reject(new Error("jsonp failed")); };
    script.src = `https://api.deezer.com/track/${deezerId}?output=jsonp&callback=${cb}`;
    document.head.appendChild(script);
  });
  inflight.set(deezerId, p);
  p.catch(() => inflight.delete(deezerId));
  return p;
}

export const deezerIdOf = (item) =>
  (String(item.id).match(/^tr_(\d+)$/) || String(item.links?.deezer || "").match(/track\/(\d+)/) || [])[1];

/** Resolved playable URL for a track, or null when nothing is available. */
export async function fetchTrackPreview(item) {
  const id = deezerIdOf(item);
  const fresh = id ? await fetchFreshPreview(id).catch(() => null) : null;
  return fresh || item.links?.preview || null;
}
