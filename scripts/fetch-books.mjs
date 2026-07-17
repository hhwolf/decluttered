// ============================================================================
// fetch-books.mjs — build src/data/books.json from the Open Library search API
// (keyless; real reader ratings via ratings_average / ratings_count).
// Google Books is a drop-in alternative (set GOOGLE_BOOKS=1) but its anonymous
// quota is shared and frequently exhausted, so Open Library is the default.
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveAxes, logPopularity, getJSON, sleep, writePretty, clamp, hash01 } from "./lib/derive.mjs";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/data/books.json");

// subject queried on Open Library -> genre chip shown in the app
const SUBJECTS = [
  ["fantasy", "Fantasy"],
  ["science_fiction", "Science Fiction"],
  ["literary_fiction", "Literary Fiction"],
  ["mystery", "Mystery"],
  ["thriller", "Thriller"],
  ["romance", "Romance"],
  ["horror", "Horror"],
  ["historical_fiction", "Historical Fiction"],
  ["biography", "Memoir"],
  ["philosophy", "Philosophy"],
  ["young_adult_fiction", "Young Adult"],
  ["classic_literature", "Classics"],
  ["magical_realism", "Magical Realism"],
  ["dystopia", "Dystopian"],
];

// Map raw Open Library subject strings onto our genre chips.
const SUBJECT_MATCH = [
  [/magical realism/i, "Magical Realism"],
  [/dystopia/i, "Dystopian"],
  [/science fiction/i, "Science Fiction"],
  [/fantasy/i, "Fantasy"],
  [/horror|ghost stories/i, "Horror"],
  [/thriller|suspense/i, "Thriller"],
  [/mystery|detective/i, "Mystery"],
  [/romance|love stories/i, "Romance"],
  [/historical fiction/i, "Historical Fiction"],
  [/young adult|juvenile fiction/i, "Young Adult"],
  [/biography|autobiography|memoir/i, "Memoir"],
  [/philosophy|stoicism/i, "Philosophy"],
  [/classic/i, "Classics"],
  [/literary|fiction, general|general fiction/i, "Literary Fiction"],
];

// factors: [writing, plot, pacing, character, originality, atmosphere]
// tones:   [darkness, complexity, emotion]
const FACTOR_BASE = {
  "Fantasy":            [0.72, 0.75, 0.65, 0.72, 0.72, 0.85],
  "Science Fiction":    [0.68, 0.80, 0.68, 0.62, 0.85, 0.72],
  "Literary Fiction":   [0.90, 0.55, 0.50, 0.85, 0.72, 0.78],
  "Mystery":            [0.62, 0.88, 0.78, 0.68, 0.62, 0.70],
  "Thriller":           [0.58, 0.90, 0.92, 0.62, 0.62, 0.62],
  "Romance":            [0.66, 0.62, 0.70, 0.88, 0.55, 0.62],
  "Horror":             [0.68, 0.70, 0.72, 0.62, 0.68, 0.92],
  "Historical Fiction": [0.78, 0.68, 0.58, 0.78, 0.62, 0.82],
  "Memoir":             [0.75, 0.55, 0.62, 0.88, 0.62, 0.58],
  "Philosophy":         [0.78, 0.35, 0.42, 0.45, 0.78, 0.55],
  "Young Adult":        [0.58, 0.82, 0.88, 0.75, 0.60, 0.62],
  "Classics":           [0.88, 0.62, 0.48, 0.80, 0.72, 0.75],
  "Magical Realism":    [0.90, 0.55, 0.48, 0.75, 0.90, 0.90],
  "Dystopian":          [0.72, 0.78, 0.70, 0.65, 0.80, 0.78],
};
const TONE_BASE = {
  "Fantasy":            [0.50, 0.62, 0.62],
  "Science Fiction":    [0.55, 0.75, 0.48],
  "Literary Fiction":   [0.62, 0.72, 0.82],
  "Mystery":            [0.70, 0.60, 0.50],
  "Thriller":           [0.78, 0.55, 0.55],
  "Romance":            [0.32, 0.42, 0.88],
  "Horror":             [0.90, 0.58, 0.60],
  "Historical Fiction": [0.58, 0.62, 0.75],
  "Memoir":             [0.55, 0.50, 0.85],
  "Philosophy":         [0.42, 0.85, 0.35],
  "Young Adult":        [0.48, 0.40, 0.70],
  "Classics":           [0.58, 0.72, 0.68],
  "Magical Realism":    [0.52, 0.78, 0.72],
  "Dystopian":          [0.85, 0.68, 0.58],
};
const FACTORS = ["writing", "plot", "pacing", "character", "originality", "atmosphere"];
const TONES = ["darkness", "complexity", "emotion"];

function mapGenres(subjects = [], primary) {
  const found = new Set([primary]);
  for (const s of subjects) {
    for (const [re, g] of SUBJECT_MATCH) {
      if (re.test(s)) { found.add(g); break; }
    }
    if (found.size >= 3) break;
  }
  return [...found].slice(0, 3);
}

async function main() {
  const perSubject = 8;
  const seen = new Map(); // workKey -> item
  for (const [subject, genre] of SUBJECTS) {
    const fields = "key,title,author_name,first_publish_year,ratings_average,ratings_count,subject,number_of_pages_median,cover_i,first_sentence";
    const url = `https://openlibrary.org/search.json?q=subject%3A${subject}&limit=24&fields=${encodeURIComponent(fields)}&sort=rating`;
    let docs = [];
    try {
      ({ docs = [] } = await getJSON(url, { headers: { "User-Agent": "taste-app-seed/0.2 (personal project)" } }));
    } catch (e) {
      console.warn(`  ! ${subject}: ${e.message} — skipping`);
      continue;
    }
    // Keep well-known, actually-rated books so the picker feels recognizable.
    const good = docs.filter((d) =>
      d.title && d.author_name?.length && d.ratings_count >= 20 && d.ratings_average >= 3.2 &&
      d.first_publish_year && d.title.length <= 60
    ).slice(0, perSubject);
    for (const d of good) {
      if (seen.has(d.key)) {
        // merge: a book found under several subjects gains that genre
        const it = seen.get(d.key);
        if (!it.genres.includes(genre) && it.genres.length < 3) it.genres.push(genre);
        continue;
      }
      const id = "bk_" + d.key.replace("/works/", "");
      const genres = mapGenres(d.subject, genre);
      // first_sentence may come from ANY edition (often translated) — only use
      // it when it plausibly reads as English and isn't a wall of text.
      const rawFs = Array.isArray(d.first_sentence) ? d.first_sentence[0] : d.first_sentence;
      const looksEnglish = (s) => s && s.length <= 220 &&
        !/[áéíóúñüàèìòùâêîôûäëïöçß]/i.test(s) &&
        /\b(the|a|an|of|and|was|is|in|it|he|she|I|you|there|when|on)\b/i.test(s);
      const firstSentence = looksEnglish(rawFs) ? rawFs : null;
      seen.set(d.key, {
        id,
        title: d.title,
        subtitle: d.author_name[0],
        year: d.first_publish_year,
        meta: d.number_of_pages_median ? `${d.number_of_pages_median} pp` : null,
        genres,
        rating: {
          value: Math.round(d.ratings_average * 10) / 10,
          count: d.ratings_count,
          source: "Open Library",
        },
        image: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
        blurb: firstSentence ? `“${firstSentence.trim()}”` : `A ${genres[0].toLowerCase()} standout readers keep coming back to.`,
        _ratingsCount: d.ratings_count,
      });
    }
    console.log(`  ${subject}: kept ${good.length}`);
    await sleep(400); // be polite to the API
  }

  const list = [...seen.values()];
  const maxCount = Math.max(...list.map((b) => b._ratingsCount));
  for (const b of list) {
    b.popularity = logPopularity(b._ratingsCount, maxCount);
    b.factors = deriveAxes(b.id, b.genres, FACTOR_BASE, FACTORS);
    b.tone = deriveAxes(b.id, b.genres, TONE_BASE, TONES);
    // nudge tone by rating count: mega-popular books skew a touch less demanding
    b.tone.complexity = Math.round(clamp(b.tone.complexity - 0.05 * b.popularity + 0.05 * hash01(b.id, "c")) * 100) / 100;
    delete b._ratingsCount;
  }
  list.sort((a, b) => b.popularity - a.popularity);
  writePretty(fs, OUT, list);
}

main().catch((e) => { console.error(e); process.exit(1); });
