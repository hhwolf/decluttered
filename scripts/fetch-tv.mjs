// ============================================================================
// fetch-tv.mjs — build src/data/tv.json from the TVMaze API (fully keyless).
//
// TVMaze serves real community ratings (`rating.average`, 0-10), genres,
// poster images, summaries, and a 0-100 popularity `weight`. Strategy:
//   1. sweep the paged /shows index for well-rated, well-known series
//   2. top up with a curated search list of modern landmark shows the early
//      index pages don't reach (TVMaze pages are ordered by id = age)
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveAxes, assignPercentilePopularity, getJSON, sleep, writePretty, clamp, hash01 } from "./lib/derive.mjs";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/data/tv.json");

// factors: [story, characters, writing, acting, production, bingeability]
// tones:   [darkness, complexity, comfort]
const FACTOR_BASE = {
  "Drama":           [0.85, 0.90, 0.85, 0.88, 0.70, 0.65],
  "Comedy":          [0.62, 0.85, 0.88, 0.75, 0.55, 0.80],
  "Crime":           [0.88, 0.80, 0.82, 0.80, 0.70, 0.85],
  "Thriller":        [0.88, 0.72, 0.78, 0.75, 0.72, 0.90],
  "Science Fiction": [0.85, 0.70, 0.78, 0.70, 0.90, 0.75],
  "Fantasy":         [0.82, 0.75, 0.72, 0.70, 0.92, 0.75],
  "Horror":          [0.72, 0.65, 0.68, 0.68, 0.80, 0.78],
  "Mystery":         [0.90, 0.72, 0.80, 0.72, 0.70, 0.88],
  "Romance":         [0.70, 0.88, 0.72, 0.75, 0.60, 0.75],
  "Action":          [0.62, 0.62, 0.60, 0.65, 0.85, 0.82],
  "Adventure":       [0.72, 0.68, 0.65, 0.65, 0.88, 0.78],
  "Family":          [0.65, 0.78, 0.70, 0.68, 0.62, 0.72],
  "Animation":       [0.78, 0.75, 0.82, 0.60, 0.90, 0.78],
  "Anime":           [0.80, 0.78, 0.75, 0.60, 0.88, 0.82],
  "History":         [0.85, 0.80, 0.82, 0.85, 0.80, 0.60],
  "War":             [0.85, 0.82, 0.82, 0.85, 0.88, 0.62],
  "Western":         [0.80, 0.80, 0.80, 0.82, 0.78, 0.62],
  "Supernatural":    [0.75, 0.72, 0.68, 0.68, 0.78, 0.82],
  "Espionage":       [0.85, 0.72, 0.78, 0.78, 0.75, 0.85],
  "Legal":           [0.82, 0.80, 0.85, 0.82, 0.60, 0.75],
  "Medical":         [0.75, 0.85, 0.75, 0.80, 0.62, 0.80],
  "Music":           [0.65, 0.78, 0.70, 0.75, 0.72, 0.68],
};
const TONE_BASE = {
  "Drama":           [0.68, 0.72, 0.40],
  "Comedy":          [0.28, 0.42, 0.85],
  "Crime":           [0.80, 0.70, 0.35],
  "Thriller":        [0.82, 0.72, 0.28],
  "Science Fiction": [0.62, 0.80, 0.40],
  "Fantasy":         [0.58, 0.68, 0.50],
  "Horror":          [0.90, 0.60, 0.22],
  "Mystery":         [0.72, 0.75, 0.38],
  "Romance":         [0.32, 0.45, 0.80],
  "Action":          [0.55, 0.45, 0.60],
  "Adventure":       [0.45, 0.52, 0.62],
  "Family":          [0.22, 0.35, 0.90],
  "Animation":       [0.35, 0.50, 0.75],
  "Anime":           [0.50, 0.62, 0.60],
  "History":         [0.65, 0.75, 0.42],
  "War":             [0.88, 0.75, 0.25],
  "Western":         [0.70, 0.60, 0.42],
  "Supernatural":    [0.72, 0.55, 0.45],
  "Espionage":       [0.68, 0.75, 0.35],
  "Legal":           [0.55, 0.68, 0.50],
  "Medical":         [0.55, 0.55, 0.55],
  "Music":           [0.35, 0.45, 0.72],
};
const FACTORS = ["story", "characters", "writing", "acting", "production", "bingeability"];
const TONES = ["darkness", "complexity", "comfort"];

// modern landmarks the early index pages (old ids) can't reach
const SEARCH_TOPUP = [
  "Severance", "The Bear", "Succession", "The Last of Us", "Andor",
  "The White Lotus", "Ted Lasso", "Chernobyl", "Fleabag", "The Crown",
  "Dark", "Squid Game", "Arcane", "The Mandalorian", "House of the Dragon",
  "Better Call Saul", "Peaky Blinders", "The Boys", "Shogun", "The Wire",
  "Atlanta", "Mindhunter", "The Queen's Gambit", "When They See Us", "Narcos",
];

const GENRE_FIX = { "Science-Fiction": "Science Fiction" };
const mapGenres = (gs = []) => [...new Set(gs.map((g) => GENRE_FIX[g] || g))].slice(0, 3);
const stripHTML = (s = "") => s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

function toItem(sh) {
  if (!sh?.rating?.average || !sh.genres?.length || sh.type !== "Scripted") return null;
  if (sh.language && sh.language !== "English" && sh.rating.average < 8.4) return null;
  const genres = mapGenres(sh.genres);
  if (!genres.length) return null;
  const id = "tv_" + sh.id;
  const summary = stripHTML(sh.summary || "");
  return {
    id,
    title: sh.name,
    subtitle: sh.network?.name || sh.webChannel?.name || "TV",
    year: sh.premiered ? +sh.premiered.slice(0, 4) : null,
    meta: sh.averageRuntime ? `${sh.averageRuntime} min eps` : null,
    genres,
    rating: { value: sh.rating.average, count: null, scale: 10, source: "TVMaze" },
    image: sh.image?.medium || null,
    blurb: summary ? summary.slice(0, 200) + (summary.length > 200 ? "…" : "") : `${genres[0]} series on ${sh.network?.name || "TV"}.`,
    links: { tvmaze: sh.url },
    _weight: sh.weight ?? 50,
  };
}

async function main() {
  const seen = new Map();

  // 1) paged index sweep (ids are age-ordered; 40 pages ≈ first ~10,000 shows)
  for (let page = 0; page < 40; page++) {
    let shows;
    try { shows = await getJSON(`https://api.tvmaze.com/shows?page=${page}`); }
    catch (e) { console.warn(`  ! page ${page}: ${e.message}`); continue; }
    for (const sh of shows) {
      const it = toItem(sh);
      if (it && sh.rating.average >= 7.8 && (sh.weight ?? 0) >= 90) seen.set(it.id, it);
    }
    await sleep(120);
  }
  console.log(`  index sweep: ${seen.size} shows`);

  // 2) curated modern landmarks via search
  for (const q of SEARCH_TOPUP) {
    try {
      const res = await getJSON(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`);
      const hit = res.find((r) => r.show?.name?.toLowerCase() === q.toLowerCase()) || res[0];
      const it = toItem(hit?.show);
      if (it) seen.set(it.id, it);
    } catch (e) { console.warn(`  ! search ${q}: ${e.message}`); }
    await sleep(150);
  }
  console.log(`  after top-up: ${seen.size} shows`);

  let list = [...seen.values()];
  // keep it a deck, not a database: best blend of quality x popularity
  list.sort((a, b) => (b.rating.value * 0.6 + b._weight * 0.04) - (a.rating.value * 0.6 + a._weight * 0.04));
  list = list.slice(0, 250);

  assignPercentilePopularity(list, (t) => t._weight * 1000 + t.rating.value); // rating as tiebreak within equal weights
  for (const t of list) {
    t.factors = deriveAxes(t.id, t.genres, FACTOR_BASE, FACTORS);
    t.tone = deriveAxes(t.id, t.genres, TONE_BASE, TONES);
    // long-running comfort shows bingey-up a touch; prestige minis skew complex
    t.factors.bingeability = Math.round(clamp(t.factors.bingeability + 0.06 * t.popularity - 0.04 * hash01(t.id, "b")) * 100) / 100;
    delete t._weight;
  }
  list.sort((a, b) => b.popularity - a.popularity);
  writePretty(fs, OUT, list);
}

main().catch((e) => { console.error(e); process.exit(1); });
