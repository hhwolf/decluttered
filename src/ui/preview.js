// ============================================================================
// preview.js — 30s track previews.
//
// Deezer preview URLs are signed and expire (~30 days), so the ones baked into
// the catalogue eventually 403. Resolve a fresh one at play time via Deezer's
// JSONP API (api.deezer.com sends no CORS headers but supports ?output=jsonp),
// falling back to the stored URL when the network is unavailable.
// ============================================================================

import { resolvePreview } from "../engine/preview.mjs";

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

// The policy (prefer fresh, fall back to the stored URL) is shared with the
// native client; only the JSONP mechanism above is web-specific.
export { deezerIdOf } from "../engine/preview.mjs";

/** Resolved playable URL for a track, or null when nothing is available. */
export async function fetchTrackPreview(item) {
  return resolvePreview(item, fetchFreshPreview);
}
