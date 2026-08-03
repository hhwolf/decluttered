// ============================================================================
// fetch-movies.mjs — build src/data/movies.json. Three modes, best available:
//
// 1. TMDB LIVE (set TMDB_API_KEY, free at themoviedb.org): /discover/movie,
//    30 pages sorted by vote count -> ~600 films with official posters.
//
// 2. IMDB BULK (default, fully keyless): IMDb's official public datasets
//    (datasets.imdbws.com, refreshed daily) — title.basics + title.ratings —
//    streamed, joined, and filtered to the top ~MAX_MOVIES films by vote
//    count with real IMDb ratings. Posters + first-sentence blurbs come from
//    the keyless Wikipedia REST API, with a resume cache in scripts/.cache/
//    so re-runs only fetch what's missing. basics.tsv.gz is a ~220 MB
//    download (streamed, never fully held in memory) — expect a few minutes.
//
// 3. CURATED fallback: if the bulk download fails (offline), a hand-picked
//    69-film snapshot with real IMDb rating values ships regardless.
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import readline from "node:readline";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { deriveAxes, assignPercentilePopularity, getJSON, sleep, writePretty } from "./lib/derive.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, "../src/data/movies.json");
const CACHE = path.join(DIR, ".cache/movie-art.json");
const KEY = process.env.TMDB_API_KEY;
const MAX_MOVIES = +(process.env.MAX_MOVIES || 1200);
const MIN_VOTES = +(process.env.MIN_VOTES || 50000);
const MIN_RATING = +(process.env.MIN_RATING || 6.0);

// factors: [story, acting, direction, visuals, pacing, originality]
// tones:   [darkness, intensity, emotion]
const FACTOR_BASE = {
  "Drama":           [0.88, 0.90, 0.80, 0.60, 0.52, 0.62],
  "Crime":           [0.85, 0.85, 0.85, 0.65, 0.70, 0.65],
  "Action":          [0.58, 0.60, 0.70, 0.88, 0.92, 0.55],
  "Science Fiction": [0.80, 0.65, 0.80, 0.92, 0.65, 0.90],
  "Thriller":        [0.85, 0.72, 0.80, 0.70, 0.90, 0.70],
  "Comedy":          [0.70, 0.75, 0.62, 0.55, 0.80, 0.62],
  "Romance":         [0.75, 0.85, 0.65, 0.65, 0.58, 0.55],
  "Horror":          [0.65, 0.60, 0.75, 0.75, 0.78, 0.70],
  "Mystery":         [0.90, 0.70, 0.80, 0.65, 0.75, 0.75],
  "Animation":       [0.80, 0.60, 0.80, 0.95, 0.75, 0.80],
  "Family":          [0.70, 0.60, 0.65, 0.80, 0.72, 0.60],
  "Fantasy":         [0.75, 0.65, 0.75, 0.90, 0.65, 0.80],
  "War":             [0.85, 0.85, 0.88, 0.82, 0.60, 0.60],
  "History":         [0.85, 0.88, 0.80, 0.70, 0.50, 0.58],
  "Western":         [0.80, 0.80, 0.85, 0.82, 0.55, 0.60],
  "Adventure":       [0.70, 0.65, 0.70, 0.85, 0.80, 0.65],
  "Musical":         [0.70, 0.80, 0.70, 0.85, 0.70, 0.72],
  "Biography":       [0.85, 0.90, 0.78, 0.65, 0.52, 0.55],
  "Documentary":     [0.80, 0.40, 0.75, 0.70, 0.55, 0.70],
  "Sport":           [0.75, 0.78, 0.70, 0.68, 0.75, 0.50],
  "Film-Noir":       [0.85, 0.78, 0.85, 0.75, 0.60, 0.70],
};
const TONE_BASE = {
  "Drama":           [0.65, 0.55, 0.85],
  "Crime":           [0.80, 0.70, 0.55],
  "Action":          [0.55, 0.90, 0.50],
  "Science Fiction": [0.60, 0.70, 0.55],
  "Thriller":        [0.75, 0.85, 0.50],
  "Comedy":          [0.30, 0.60, 0.60],
  "Romance":         [0.35, 0.50, 0.90],
  "Horror":          [0.90, 0.85, 0.50],
  "Mystery":         [0.70, 0.70, 0.50],
  "Animation":       [0.30, 0.60, 0.80],
  "Family":          [0.20, 0.55, 0.80],
  "Fantasy":         [0.50, 0.65, 0.70],
  "War":             [0.88, 0.85, 0.80],
  "History":         [0.60, 0.60, 0.72],
  "Western":         [0.65, 0.65, 0.55],
  "Adventure":       [0.40, 0.75, 0.60],
  "Musical":         [0.28, 0.60, 0.85],
  "Biography":       [0.55, 0.55, 0.78],
  "Documentary":     [0.50, 0.50, 0.60],
  "Sport":           [0.45, 0.75, 0.70],
  "Film-Noir":       [0.82, 0.70, 0.55],
};
const FACTORS = ["story", "acting", "direction", "visuals", "pacing", "originality"];
const TONES = ["darkness", "intensity", "emotion"];
const GENRE_FIX = { "Sci-Fi": "Science Fiction", "Music": "Musical" };

const firstSentence = (s = "") => {
  // require >=30 chars before the terminator so "L.A." / "Dr." / "E.T." don't
  // truncate the sentence at an abbreviation
  const m = s.match(/^[\s\S]{30,}?[.!?](?=\s|$)/);
  return m ? m[0] : s.slice(0, 160);
};

// ---- IMDb bulk mode -------------------------------------------------------
async function streamLines(url, onLine) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  const rl = readline.createInterface({
    input: Readable.fromWeb(res.body).pipe(zlib.createGunzip()),
    crlfDelay: Infinity,
  });
  for await (const line of rl) onLine(line);
}

async function imdbBulkItems() {
  console.log("  downloading title.ratings (~8 MB)…");
  const rated = new Map(); // tconst -> [rating, votes]
  await streamLines("https://datasets.imdbws.com/title.ratings.tsv.gz", (line) => {
    const [tconst, rating, votes] = line.split("\t");
    const v = +votes;
    if (v >= MIN_VOTES && +rating >= MIN_RATING) rated.set(tconst, [+rating, v]);
  });
  console.log(`  ${rated.size} titles pass votes>=${MIN_VOTES} & rating>=${MIN_RATING}`);

  console.log("  streaming title.basics (~220 MB, filtered on the fly)…");
  const rows = [];
  await streamLines("https://datasets.imdbws.com/title.basics.tsv.gz", (line) => {
    const f = line.split("\t");
    // tconst, titleType, primaryTitle, originalTitle, isAdult, startYear, endYear, runtimeMinutes, genres
    if (f[1] !== "movie" || f[4] === "1") return;
    const r = rated.get(f[0]);
    if (!r) return;
    const year = +f[5];
    if (!year || year < 1920) return;
    const genres = (f[8] || "").split(",").filter((g) => g && g !== "\\N")
      .map((g) => GENRE_FIX[g] || g).slice(0, 3);
    if (!genres.length) return;
    rows.push({
      tconst: f[0], title: f[2], year,
      runtime: f[7] !== "\\N" ? +f[7] : null,
      genres, rating: r[0], votes: r[1],
    });
  });
  console.log(`  ${rows.length} movies joined; keeping top ${MAX_MOVIES} by votes`);
  rows.sort((a, b) => b.votes - a.votes);
  const keep = rows.slice(0, MAX_MOVIES);

  const list = keep.map((m) => {
    const id = "mv_" + m.tconst;
    return {
      id,
      title: m.title,
      subtitle: String(m.year),
      year: m.year,
      meta: m.runtime ? `${m.runtime} min` : null,
      genres: m.genres,
      rating: { value: m.rating, count: m.votes, scale: 10, source: "IMDb" },
      image: null,
      blurb: null,
      links: { imdb: `https://www.imdb.com/title/${m.tconst}/` },
      factors: deriveAxes(id, m.genres, FACTOR_BASE, FACTORS),
      tone: deriveAxes(id, m.genres, TONE_BASE, TONES),
      _votes: m.votes,
    };
  });
  assignPercentilePopularity(list, (m) => m._votes);
  list.forEach((m) => delete m._votes);
  return list;
}

// ---- Wikipedia art + blurb enrichment (resumable, throttle-aware) ---------
// A 404 is a real "this page doesn't exist" -> try the next title pattern and
// cache the miss. A 429/5xx/network error is throttling -> back off and retry
// the SAME pattern, and NEVER cache the failure (so a re-run picks it up).
async function wikiSummary(title) {
  const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
    { headers: { "User-Agent": "decluttered-seed/0.4 (personal project; contact via github hhwolf)" } });
  if (res.ok) return { status: 200, data: await res.json() };
  return { status: res.status, data: null };
}
const looksLikeFilm = (w) =>
  w?.type === "standard" && /\bfilms?\b|\bmovie\b|\bdirected\b/i.test((w.extract || "").slice(0, 400));

async function enrichArt(list) {
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
  let hit = 0, miss = 0, deferred = 0, done = 0;
  for (const m of list) {
    done++;
    if (cache[m.id] !== undefined) {
      if (cache[m.id]) { m.image = cache[m.id].image; m.blurb = cache[m.id].blurb; hit++; } else miss++;
      continue;
    }
    const candidates = [m.title, `${m.title} (film)`, `${m.title} (${m.year} film)`];
    let found = null;
    let definitive = true; // all failures were real 404s / non-film pages
    for (const cand of candidates) {
      let w = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        let r;
        try { r = await wikiSummary(cand); }
        catch { r = { status: 0 }; } // network hiccup -> treat as throttle
        if (r.status === 200) { w = r.data; break; }
        if (r.status === 404) break; // real miss for this pattern
        await sleep(1500 * (attempt + 1)); // throttled -> back off, same pattern
        if (attempt === 3) definitive = false;
      }
      if (w && looksLikeFilm(w) && w.thumbnail?.source) {
        found = { image: w.thumbnail.source, blurb: firstSentence(w.extract) };
        break;
      }
      await sleep(150);
    }
    if (found) { cache[m.id] = found; m.image = found.image; m.blurb = found.blurb; hit++; }
    else if (definitive) { cache[m.id] = null; miss++; }
    else deferred++; // uncached: next run retries
    if (done % 50 === 0) {
      fs.writeFileSync(CACHE, JSON.stringify(cache));
      console.log(`  art ${done}/${list.length} (${hit} found, ${deferred} deferred)`);
    }
    await sleep(250);
  }
  fs.writeFileSync(CACHE, JSON.stringify(cache));
  console.log(`  wikipedia art: ${hit}/${list.length} (${miss} true misses, ${deferred} deferred to next run)`);
  for (const m of list) {
    if (!m.blurb) m.blurb = `${m.genres.join(" / ")} — ${m.year}, rated ${m.rating.value} by ${Math.round(m.rating.count / 1000)}k IMDb voters.`;
  }
}

// ---- TMDB live mode -------------------------------------------------------
const TMDB_GENRES = { 28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History", 27: "Horror", 10402: "Musical", 9648: "Mystery", 10749: "Romance", 878: "Science Fiction", 53: "Thriller", 10752: "War", 37: "Western" };

async function tmdbItems() {
  const seen = new Map();
  for (let page = 1; page <= 30; page++) {
    const url = `https://api.themoviedb.org/3/discover/movie?api_key=${KEY}&sort_by=vote_count.desc&vote_count.gte=500&page=${page}`;
    let json;
    try { json = await getJSON(url); } catch (e) { console.warn(`  ! page ${page}: ${e.message}`); continue; }
    for (const m of json.results || []) {
      const genres = (m.genre_ids || []).map((g) => TMDB_GENRES[g]).filter(Boolean).slice(0, 3);
      if (!genres.length || seen.has(m.id)) continue;
      const id = "mv_tmdb_" + m.id;
      seen.set(m.id, {
        id, title: m.title, subtitle: (m.release_date || "").slice(0, 4),
        year: m.release_date ? +m.release_date.slice(0, 4) : null,
        meta: null, genres,
        rating: { value: Math.round(m.vote_average * 10) / 10, count: m.vote_count, scale: 10, source: "TMDB" },
        image: m.poster_path ? `https://image.tmdb.org/t/p/w342${m.poster_path}` : null,
        blurb: (m.overview || "").slice(0, 200),
        links: {},
        factors: deriveAxes(id, genres, FACTOR_BASE, FACTORS),
        tone: deriveAxes(id, genres, TONE_BASE, TONES),
        _votes: m.vote_count,
      });
    }
    await sleep(200);
  }
  const list = [...seen.values()];
  assignPercentilePopularity(list, (m) => m._votes);
  list.forEach((m) => delete m._votes);
  return list;
}

// ---- curated last-resort fallback (real IMDb values, mid-2026 snapshot) ---
const CURATED = [
  ["The Shawshank Redemption", 1994, ["Drama"], 9.3, 2900, 142],
  ["The Godfather", 1972, ["Crime", "Drama"], 9.2, 2000, 175],
  ["The Dark Knight", 2008, ["Action", "Crime", "Drama"], 9.0, 2900, 152],
  ["12 Angry Men", 1957, ["Drama"], 9.0, 900, 96],
  ["Pulp Fiction", 1994, ["Crime", "Drama"], 8.9, 2200, 154],
  ["Inception", 2010, ["Science Fiction", "Action", "Thriller"], 8.8, 2600, 148],
  ["Fight Club", 1999, ["Drama", "Thriller"], 8.8, 2400, 139],
  ["Forrest Gump", 1994, ["Drama", "Romance"], 8.8, 2300, 142],
  ["The Matrix", 1999, ["Science Fiction", "Action"], 8.7, 2100, 136],
  ["Interstellar", 2014, ["Science Fiction", "Drama"], 8.7, 2300, 169],
  ["Goodfellas", 1990, ["Crime", "Drama"], 8.7, 1300, 145],
  ["Se7en", 1995, ["Crime", "Mystery", "Thriller"], 8.6, 1800, 127],
  ["Spirited Away", 2001, ["Animation", "Fantasy", "Family"], 8.6, 900, 125],
  ["The Silence of the Lambs", 1991, ["Thriller", "Horror", "Crime"], 8.6, 1600, 118],
  ["Saving Private Ryan", 1998, ["War", "Drama"], 8.6, 1600, 169],
  ["Parasite", 2019, ["Thriller", "Drama", "Comedy"], 8.5, 1000, 132],
  ["Gladiator", 2000, ["Action", "Adventure", "Drama"], 8.5, 1700, 155],
  ["Alien", 1979, ["Horror", "Science Fiction"], 8.5, 1000, 117],
  ["Casablanca", 1942, ["Romance", "Drama", "War"], 8.5, 620, 102],
  ["Psycho", 1960, ["Horror", "Thriller", "Mystery"], 8.5, 750, 109],
];
function curatedItems() {
  const list = CURATED.map(([title, year, genres, rating, votesK, runtime]) => {
    const id = "mv_" + title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/_+$/, "");
    return {
      id, title, subtitle: String(year), year, meta: `${runtime} min`, genres,
      rating: { value: rating, count: votesK * 1000, scale: 10, source: "IMDb" },
      image: null, blurb: `${genres.join(" / ")} landmark from ${year}.`, links: {},
      factors: deriveAxes(id, genres, FACTOR_BASE, FACTORS),
      tone: deriveAxes(id, genres, TONE_BASE, TONES),
      _votes: votesK,
    };
  });
  assignPercentilePopularity(list, (m) => m._votes);
  list.forEach((m) => delete m._votes);
  return list;
}

async function main() {
  let list;
  if (process.env.ART_ONLY) {
    console.log("ART_ONLY — re-running Wikipedia enrichment over existing movies.json");
    list = JSON.parse(fs.readFileSync(OUT, "utf8"));
    await enrichArt(list);
    writePretty(fs, OUT, list);
    return;
  }
  if (KEY) {
    console.log("TMDB_API_KEY found — live TMDB fetch (30 pages)");
    list = await tmdbItems();
  } else {
    console.log(`No TMDB_API_KEY — IMDb bulk datasets (top ${MAX_MOVIES} by votes)`);
    try {
      list = await imdbBulkItems();
      await enrichArt(list);
    } catch (e) {
      console.warn(`bulk mode failed (${e.message}) — writing curated fallback`);
      list = curatedItems();
    }
  }
  list.sort((a, b) => b.popularity - a.popularity);
  writePretty(fs, OUT, list);
}

main().catch((e) => { console.error(e); process.exit(1); });
