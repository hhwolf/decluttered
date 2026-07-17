// Shared helpers for the seed-catalogue fetchers.
//
// The external APIs give us real items, real ratings, and real popularity —
// but no "craft vectors". Factors/tones are derived from a per-genre base
// profile blended across the item's genres, plus a deterministic jitter seeded
// by the item id so every run of the fetcher produces the same catalogue.

export const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

// Deterministic hash -> [0,1). Stable across runs and platforms.
export function hash01(str, salt = "") {
  let h = 2166136261;
  const s = salt + String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h / 4294967296;
}

// Blend per-genre base vectors (equal weight), then jitter each axis ±spread.
export function deriveAxes(id, genres, baseProfiles, axes, spread = 0.09) {
  const out = {};
  const used = genres.filter((g) => baseProfiles[g]);
  axes.forEach((axis, i) => {
    let base = 0.5;
    if (used.length) {
      base = used.reduce((s, g) => s + (baseProfiles[g][i] ?? 0.5), 0) / used.length;
    }
    const j = (hash01(id, axis) - 0.5) * 2 * spread;
    out[axis] = Math.round(clamp(base + j) * 100) / 100;
  });
  return out;
}

// Normalize a count into 0..1 popularity on a log scale.
export function logPopularity(count, maxCount) {
  if (!count || count <= 0) return 0.05;
  const v = Math.log10(1 + count) / Math.log10(1 + maxCount);
  return Math.round(clamp(v, 0.05, 1) * 100) / 100;
}

export async function getJSON(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function writePretty(fs, path, data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 1) + "\n");
  console.log(`wrote ${path} (${data.length} items)`);
}
