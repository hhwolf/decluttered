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

// Rank-percentile popularity: position within THIS catalogue (0.05..1).
//
// This is the only popularity function, deliberately. A log-of-count-over-max
// scale used to live here and silently broke three catalogues: it only spreads
// values when counts span many orders of magnitude, and none of ours do. Books
// range 20..1400 reads (everything floored at 0.42), Deezer hands us an index
// that is *already* normalised 0..1M (median landed at 0.95). In both cases
// novelty collapsed to ~0 and the hidden-gems row quietly had nothing to show.
//
// Every catalogue here is a curated canon or a chart sweep, so absolute counts
// only say "all of these are famous". Rank within the set is the real signal.
// Pass items from ONE source at a time: review counts, pageviews and play
// indexes are different units and must not be percentiled against each other.
export function assignPercentilePopularity(list, countOf) {
  const sorted = [...list].sort((a, b) => countOf(a) - countOf(b));
  const n = Math.max(sorted.length - 1, 1);
  sorted.forEach((it, i) => {
    it.popularity = Math.round((0.05 + 0.95 * (i / n)) * 100) / 100;
  });
}

export async function getJSON(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Fields a LATER pass adds to a catalogue the fetcher owns: critical reception,
// TV run detail, signature dishes, artwork backfills. The fetcher knows nothing
// about them, so a plain rewrite deletes them — which is exactly what happened
// when the catalogues were expanded: 653 of 677 reception records vanished in
// one commit and the "what critics said" line silently rendered nothing for
// months. Re-running a fetcher must be safe.
export const ENRICHED_KEYS = [
  "reception", "overview", "googleReviews", "dish",
  "seasons", "episodes", "status", "endedYear", "watchOn", "cast", "awards", "directors",
];
// Fields a fetcher does own but must never downgrade to empty: a transient API
// miss shouldn't wipe a poster that a backfill pass worked to find.
const KEEP_IF_EMPTY = ["image"];

const isEmpty = (v) => v === undefined || v === null || v === "";

/**
 * Merge enrichment from whatever is already on disk into `data`, then write.
 * Matching is by id, so reordering and growing the catalogue are both fine.
 */
export function writePretty(fs, path, data) {
  let carried = 0, kept = 0;
  if (fs.existsSync(path)) {
    let prev = [];
    try { prev = JSON.parse(fs.readFileSync(path, "utf8")); } catch { prev = []; }
    const byId = new Map(prev.map((x) => [x.id, x]));
    for (const item of data) {
      const old = byId.get(item.id);
      if (!old) continue;
      for (const k of ENRICHED_KEYS) {
        if (item[k] === undefined && old[k] !== undefined) { item[k] = old[k]; carried++; }
      }
      for (const k of KEEP_IF_EMPTY) {
        if (isEmpty(item[k]) && !isEmpty(old[k])) { item[k] = old[k]; kept++; }
      }
    }
  }
  fs.writeFileSync(path, JSON.stringify(data, null, 1) + "\n");
  const note = [carried && `carried ${carried} enriched fields`, kept && `kept ${kept} existing images`]
    .filter(Boolean).join(", ");
  console.log(`wrote ${path} (${data.length} items${note ? ", " + note : ""})`);
}
