// ============================================================================
// fetch-movies.mjs — build src/data/movies.json.
//
// LIVE MODE (set TMDB_API_KEY): TMDB /discover/movie sorted by vote count,
// real vote_average / vote_count / popularity and poster URLs. TMDB keys are
// free (themoviedb.org -> settings -> API).
//
// DEFAULT MODE (no key): curated snapshot of ~64 landmark films with their
// public IMDb rating values (mid-2026 snapshot), enriched at fetch time with
// poster art + first-sentence synopses from the keyless Wikipedia REST API.
// (iTunes Search no longer returns movies; Wikipedia is the keyless art path.)
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveAxes, assignPercentilePopularity, getJSON, sleep, writePretty, clamp } from "./lib/derive.mjs";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/data/movies.json");
const KEY = process.env.TMDB_API_KEY;

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
};
const FACTORS = ["story", "acting", "direction", "visuals", "pacing", "originality"];
const TONES = ["darkness", "intensity", "emotion"];

// [title, wikipediaTitle, year, genres, imdbRating, votesK, runtimeMin]
const CURATED = [
  ["The Shawshank Redemption", "The Shawshank Redemption", 1994, ["Drama"], 9.3, 2900, 142],
  ["The Godfather", "The Godfather", 1972, ["Crime", "Drama"], 9.2, 2000, 175],
  ["The Dark Knight", "The Dark Knight", 2008, ["Action", "Crime", "Drama"], 9.0, 2900, 152],
  ["12 Angry Men", "12 Angry Men (1957 film)", 1957, ["Drama"], 9.0, 900, 96],
  ["Pulp Fiction", "Pulp Fiction", 1994, ["Crime", "Drama"], 8.9, 2200, 154],
  ["Inception", "Inception", 2010, ["Science Fiction", "Action", "Thriller"], 8.8, 2600, 148],
  ["Fight Club", "Fight Club", 1999, ["Drama", "Thriller"], 8.8, 2400, 139],
  ["Forrest Gump", "Forrest Gump", 1994, ["Drama", "Romance"], 8.8, 2300, 142],
  ["The Matrix", "The Matrix", 1999, ["Science Fiction", "Action"], 8.7, 2100, 136],
  ["Interstellar", "Interstellar (film)", 2014, ["Science Fiction", "Drama"], 8.7, 2300, 169],
  ["Goodfellas", "Goodfellas", 1990, ["Crime", "Drama"], 8.7, 1300, 145],
  ["Se7en", "Seven (1995 film)", 1995, ["Crime", "Mystery", "Thriller"], 8.6, 1800, 127],
  ["Spirited Away", "Spirited Away", 2001, ["Animation", "Fantasy", "Family"], 8.6, 900, 125],
  ["The Silence of the Lambs", "The Silence of the Lambs (film)", 1991, ["Thriller", "Horror", "Crime"], 8.6, 1600, 118],
  ["Saving Private Ryan", "Saving Private Ryan", 1998, ["War", "Drama"], 8.6, 1600, 169],
  ["The Green Mile", "The Green Mile (film)", 1999, ["Drama", "Fantasy"], 8.6, 1500, 189],
  ["City of God", "City of God (2002 film)", 2002, ["Crime", "Drama"], 8.6, 800, 130],
  ["Parasite", "Parasite (2019 film)", 2019, ["Thriller", "Drama", "Comedy"], 8.5, 1000, 132],
  ["Gladiator", "Gladiator (2000 film)", 2000, ["Action", "Adventure", "Drama"], 8.5, 1700, 155],
  ["The Prestige", "The Prestige (film)", 2006, ["Mystery", "Thriller", "Drama"], 8.5, 1500, 130],
  ["The Lion King", "The Lion King", 1994, ["Animation", "Family", "Drama"], 8.5, 1200, 88],
  ["Back to the Future", "Back to the Future", 1985, ["Science Fiction", "Comedy", "Adventure"], 8.5, 1400, 116],
  ["Whiplash", "Whiplash (2014 film)", 2014, ["Drama", "Musical"], 8.5, 1100, 106],
  ["The Departed", "The Departed", 2006, ["Crime", "Thriller"], 8.5, 1500, 151],
  ["The Pianist", "The Pianist (2002 film)", 2002, ["Drama", "War"], 8.5, 1000, 150],
  ["Alien", "Alien (film)", 1979, ["Horror", "Science Fiction"], 8.5, 1000, 117],
  ["Django Unchained", "Django Unchained", 2012, ["Western", "Drama"], 8.5, 1800, 165],
  ["Casablanca", "Casablanca (film)", 1942, ["Romance", "Drama", "War"], 8.5, 620, 102],
  ["Psycho", "Psycho (1960 film)", 1960, ["Horror", "Thriller", "Mystery"], 8.5, 750, 109],
  ["Rear Window", "Rear Window", 1954, ["Mystery", "Thriller"], 8.5, 550, 112],
  ["Dune: Part Two", "Dune: Part Two", 2024, ["Science Fiction", "Adventure"], 8.5, 700, 166],
  ["Apocalypse Now", "Apocalypse Now", 1979, ["War", "Drama"], 8.4, 700, 147],
  ["Memento", "Memento (film)", 2000, ["Mystery", "Thriller"], 8.4, 1400, 113],
  ["WALL-E", "WALL-E", 2008, ["Animation", "Family", "Science Fiction"], 8.4, 1200, 98],
  ["The Shining", "The Shining (film)", 1980, ["Horror", "Drama"], 8.4, 1200, 146],
  ["Coco", "Coco (2017 film)", 2017, ["Animation", "Family", "Fantasy"], 8.4, 970, 105],
  ["Avengers: Endgame", "Avengers: Endgame", 2019, ["Action", "Adventure", "Science Fiction"], 8.4, 1300, 181],
  ["Spider-Man: Into the Spider-Verse", "Spider-Man: Into the Spider-Verse", 2018, ["Animation", "Action", "Adventure"], 8.4, 700, 117],
  ["Come and See", "Come and See", 1985, ["War", "Drama"], 8.4, 100, 142],
  ["Oldboy", "Oldboy (2003 film)", 2003, ["Thriller", "Mystery", "Action"], 8.3, 650, 120],
  ["Amélie", "Amélie", 2001, ["Comedy", "Romance"], 8.3, 800, 122],
  ["Toy Story", "Toy Story", 1995, ["Animation", "Family", "Comedy"], 8.3, 1100, 81],
  ["Braveheart", "Braveheart", 1995, ["War", "Drama", "History"], 8.3, 1100, 178],
  ["Good Will Hunting", "Good Will Hunting", 1997, ["Drama", "Romance"], 8.3, 1100, 126],
  ["Requiem for a Dream", "Requiem for a Dream", 2000, ["Drama"], 8.3, 900, 102],
  ["Eternal Sunshine of the Spotless Mind", "Eternal Sunshine of the Spotless Mind", 2004, ["Romance", "Science Fiction", "Drama"], 8.3, 1100, 108],
  ["2001: A Space Odyssey", "2001: A Space Odyssey (film)", 1968, ["Science Fiction"], 8.3, 750, 149],
  ["Reservoir Dogs", "Reservoir Dogs", 1992, ["Crime", "Thriller"], 8.3, 1100, 99],
  ["Lawrence of Arabia", "Lawrence of Arabia (film)", 1962, ["Adventure", "History", "Drama"], 8.3, 330, 218],
  ["Singin' in the Rain", "Singin' in the Rain", 1952, ["Musical", "Comedy", "Romance"], 8.3, 260, 103],
  ["Heat", "Heat (1995 film)", 1995, ["Crime", "Thriller", "Drama"], 8.3, 750, 170],
  ["Oppenheimer", "Oppenheimer (film)", 2023, ["Drama", "History", "Thriller"], 8.3, 900, 180],
  ["Jurassic Park", "Jurassic Park (film)", 1993, ["Adventure", "Science Fiction", "Thriller"], 8.2, 1100, 127],
  ["No Country for Old Men", "No Country for Old Men", 2007, ["Crime", "Thriller", "Drama"], 8.2, 1100, 122],
  ["The Truman Show", "The Truman Show", 1998, ["Comedy", "Drama", "Science Fiction"], 8.2, 1200, 103],
  ["Pan's Labyrinth", "Pan's Labyrinth", 2006, ["Fantasy", "Drama", "War"], 8.2, 700, 118],
  ["Mad Max: Fury Road", "Mad Max: Fury Road", 2015, ["Action", "Adventure", "Science Fiction"], 8.1, 1100, 120],
  ["Jaws", "Jaws (film)", 1975, ["Thriller", "Adventure", "Horror"], 8.1, 700, 124],
  ["The Grand Budapest Hotel", "The Grand Budapest Hotel", 2014, ["Comedy", "Drama"], 8.1, 950, 99],
  ["Portrait of a Lady on Fire", "Portrait of a Lady on Fire", 2019, ["Romance", "Drama"], 8.1, 130, 122],
  ["La La Land", "La La Land", 2016, ["Romance", "Drama", "Musical"], 8.0, 700, 128],
  ["Blade Runner 2049", "Blade Runner 2049", 2017, ["Science Fiction", "Drama"], 8.0, 700, 164],
  ["Her", "Her (film)", 2013, ["Romance", "Science Fiction", "Drama"], 8.0, 700, 126],
  ["Arrival", "Arrival (film)", 2016, ["Science Fiction", "Drama"], 7.9, 800, 116],
  ["Knives Out", "Knives Out", 2019, ["Mystery", "Comedy", "Crime"], 7.9, 800, 130],
  ["Titanic", "Titanic (1997 film)", 1997, ["Romance", "Drama"], 7.9, 1300, 195],
  ["Get Out", "Get Out", 2017, ["Horror", "Mystery", "Thriller"], 7.8, 750, 104],
  ["Everything Everywhere All at Once", "Everything Everywhere All at Once", 2022, ["Science Fiction", "Comedy", "Drama"], 7.8, 600, 139],
  ["The Social Network", "The Social Network", 2010, ["Drama", "History"], 7.8, 800, 120],
];

const firstSentence = (s = "") => {
  const m = s.match(/^.+?[.!?](?=\s|$)/);
  return m ? m[0] : s.slice(0, 160);
};

async function curatedItems() {
  const list = [];
  let art = 0;
  for (const [title, wikiTitle, year, genres, rating, votesK, runtime] of CURATED) {
    const id = "mv_" + title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/_+$/, "");
    let image = null, blurb = null;
    // Wikipedia throttles bursts — retry with backoff before giving up.
    for (let attempt = 0; attempt < 3 && !image; attempt++) {
      try {
        const w = await getJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`, {
          headers: { "User-Agent": "decluttered-seed/0.3 (personal project)" },
        });
        image = w.thumbnail?.source || null;
        blurb = firstSentence(w.extract) || blurb;
        break;
      } catch { await sleep(600 * (attempt + 1)); }
    }
    if (image) art++;
    list.push({
      id, title, subtitle: String(year), year,
      meta: `${runtime} min`,
      genres,
      rating: { value: rating, count: votesK * 1000, scale: 10, source: "IMDb" },
      image,
      blurb: blurb || `${genres.join(" / ").toLowerCase()} landmark from ${year}.`,
      factors: deriveAxes(id, genres, FACTOR_BASE, FACTORS),
      tone: deriveAxes(id, genres, TONE_BASE, TONES),
      _votes: votesK,
    });
    await sleep(300);
  }
  console.log(`  wikipedia art: ${art}/${CURATED.length}`);
  assignPercentilePopularity(list, (m) => m._votes);
  list.forEach((m) => delete m._votes);
  return list;
}

const TMDB_GENRES = { 28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History", 27: "Horror", 10402: "Musical", 9648: "Mystery", 10749: "Romance", 878: "Science Fiction", 53: "Thriller", 10752: "War", 37: "Western" };

async function liveItems() {
  const seen = new Map();
  for (let page = 1; page <= 5; page++) {
    const url = `https://api.themoviedb.org/3/discover/movie?api_key=${KEY}&sort_by=vote_count.desc&vote_count.gte=3000&page=${page}`;
    let json;
    try { json = await getJSON(url); } catch (e) { console.warn(`  ! page ${page}: ${e.message}`); continue; }
    for (const m of json.results || []) {
      const genres = (m.genre_ids || []).map((g) => TMDB_GENRES[g]).filter(Boolean).slice(0, 3);
      if (!genres.length || seen.has(m.id)) continue;
      const id = "mv_" + m.id;
      seen.set(m.id, {
        id, title: m.title, subtitle: (m.release_date || "").slice(0, 4), year: m.release_date ? +m.release_date.slice(0, 4) : null,
        meta: null, genres,
        rating: { value: Math.round(m.vote_average * 10) / 10, count: m.vote_count, scale: 10, source: "TMDB" },
        image: m.poster_path ? `https://image.tmdb.org/t/p/w342${m.poster_path}` : null,
        blurb: (m.overview || "").slice(0, 200),
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

async function main() {
  let list;
  if (KEY) {
    console.log("TMDB_API_KEY found — live TMDB fetch");
    list = await liveItems();
  } else {
    console.log("No TMDB_API_KEY — curated snapshot (real IMDb ratings) + Wikipedia art");
    list = await curatedItems();
  }
  list.sort((a, b) => b.popularity - a.popularity);
  writePretty(fs, OUT, list);
}

main().catch((e) => { console.error(e); process.exit(1); });
