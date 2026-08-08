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

// Omnibus/collection artifacts ("Works (Carrie / Night Shift / ...)") read as
// junk in a picker — one canonical book per card only.
const isOmnibus = (t) => / \/ /.test(t) || /^(works|collected|complete|omnibus|boxed|trilogy|box set)\b/i.test(t) || /\d+ books? in/i.test(t);

// Open Library returns whichever EDITION title matched, so an English-language
// work can still surface as "Um casamento arranjado". `language:eng` in the
// query removes most; these two guards remove the rest.
//  1. any letter outside plain English Latin (ě, ü, ñ, Cyrillic, CJK, …)
//  2. words that are unmistakably not English (kept deliberately narrow — no
//     "la"/"der"/"um", which all appear in real English titles)
const NON_ENGLISH_LETTERS = /[^\x00-\x7f‘’“”–—…]/;
// Unambiguous non-English tokens: one is enough to reject. Deliberately EXCLUDES
// words that are also English or common in English titles (die, sin, con, lo,
// les, no, me) so a real English book is never thrown out.
const FOREIGN_STRONG = /\b(alla|allo|degli|delle|della|dello|nella|nello|nelle|cioccolato|corte|trotzdem|geschichte|nicht|und|fur|uber|ein|eine|casamento|arranjado|voce|nao|muito|hombre|mujer|corazon|ciudad|nuestra|nuestro|vydani|hrabe|dil|avec|pour|dans|chez|sous|jahre|liebe|welt|zwischen|wojna)\b/i;
// Weaker signals: two or more together indicate a non-English title.
const FOREIGN_WEAK = /\b(el|los|las|una|uno|del|por|para|como|donde|cuando|il|che|non|sono|mio|mia|suo|sua|les|des|une|sur|entre|der|das|mit|auch|aber|uma|ao|aos|dos|sobre|zum|zur|nas)\b/gi;
function looksEnglishTitle(t) {
  if (NON_ENGLISH_LETTERS.test(t)) return false;
  if (FOREIGN_STRONG.test(t)) return false;
  return (t.match(FOREIGN_WEAK) || []).length < 2;
}

const CACHE = path.join(path.dirname(fileURLToPath(import.meta.url)), ".cache/ol-descriptions.json");

// Work-level description from Open Library, cached across runs.
async function fetchDescription(workKey, cache) {
  if (workKey in cache) return cache[workKey];
  let out = null;
  try {
    const w = await getJSON(`https://openlibrary.org${workKey}.json`, { headers: { "User-Agent": "taste-app-seed/0.2 (personal project)" } });
    let d = typeof w.description === "string" ? w.description : w.description?.value;
    if (d) {
      d = d.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
      d = d.split(/(?<=[.!?])\s+/).reduce((acc, s) => (acc.length + s.length <= 220 ? (acc ? acc + " " : "") + s : acc), "");
      out = d.length >= 40 ? d : null;
    }
  } catch { /* missing work page — fall through */ }
  cache[workKey] = out;
  return out;
}

async function main() {
  const perSubject = 24;
  let descCache = {};
  try { descCache = JSON.parse(fs.readFileSync(CACHE, "utf8")); } catch { /* first run */ }
  const seen = new Map(); // workKey -> item
  for (const [subject, genre] of SUBJECTS) {
    const fields = "key,title,author_name,first_publish_year,ratings_average,ratings_count,subject,number_of_pages_median,cover_i,first_sentence";
    const url = `https://openlibrary.org/search.json?q=subject%3A${subject}+language%3Aeng&limit=40&fields=${encodeURIComponent(fields)}&sort=rating`;
    let docs = [];
    // Open Library 504s under load — retry with backoff before giving up.
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        ({ docs = [] } = await getJSON(url, { headers: { "User-Agent": "taste-app-seed/0.2 (personal project)" } }));
        break;
      } catch (e) {
        if (attempt === 4) console.warn(`  ! ${subject}: ${e.message} — skipping`);
        else await sleep(1500 * attempt);
      }
    }
    if (!docs.length) continue;
    // Keep well-known, actually-rated books so the picker feels recognizable.
    const good = docs.filter((d) =>
      d.title && d.author_name?.length && d.ratings_count >= 20 && d.ratings_average >= 3.2 &&
      d.first_publish_year && d.title.length <= 60 && !isOmnibus(d.title) && looksEnglishTitle(d.title)
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
        // ?default=false: 404 instead of OL's blank placeholder image, so the
        // UI's onError fallback can render a stylized card in its place.
        image: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg?default=false` : null,
        blurb: null, // filled below: description > first sentence > honest fallback
        _firstSentence: firstSentence,
        _ratingsCount: d.ratings_count,
      });
    }
    console.log(`  ${subject}: kept ${good.length}`);
    await sleep(1200); // be polite to the API — it 504s when hammered
  }

  const list = [...seen.values()];
  console.log(`  fetching descriptions for ${list.length} works…`);
  for (const b of list) {
    const key = "/works/" + b.id.replace("bk_", "");
    const wasCached = key in descCache;
    const desc = await fetchDescription(key, descCache);
    b.blurb = desc
      || (b._firstSentence ? `“${b._firstSentence.trim()}”` : null)
      || `${b.subtitle}'s ${b.year} ${b.genres[0].toLowerCase()} — ★ ${b.rating.value} from ${b.rating.count.toLocaleString()} Open Library readers.`;
    delete b._firstSentence;
    if (!wasCached) await sleep(120);
  }
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify(descCache));
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
