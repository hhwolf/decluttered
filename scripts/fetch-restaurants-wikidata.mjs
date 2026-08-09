// ============================================================================
// fetch-restaurants-wikidata.mjs — widen the Table catalogue without a key.
//
// The other four cravings scale because one keyless API returns the item AND
// a ranking signal. Restaurants have no such source: Google and Yelp have the
// ratings but forbid persisting them, and OpenStreetMap has millions of places
// with no quality signal at all. Wikidata sits in between — it knows which
// restaurants are notable enough to have an encyclopedia article, and that
// article brings a photo, a description, and (via the reception pipeline)
// real criticism.
//
// What this does NOT invent: a star rating. These places carry a Wikipedia
// READER-INTEREST score derived from real monthly pageviews, labelled as such
// throughout the UI. Star ratings only ever come from the keyed cross-
// reference (see fetch-restaurant-ratings.mjs), which writes to a gitignored
// side file because Google's and Yelp's terms forbid shipping their content.
//
// Additive and idempotent: curated entries always win, and re-running only
// fetches what is missing.
//
//   node scripts/fetch-restaurants-wikidata.mjs
//   CITIES="Boston,Chicago" node scripts/fetch-restaurants-wikidata.mjs
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deriveAxes, logPopularity, sleep, writePretty } from "./lib/derive.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, "../src/data/restaurants.json");
const CACHE = path.join(DIR, ".cache/wikidata-restaurants.json");
const UA = { "User-Agent": "decluttered-seed/0.5 (personal project; contact via github hhwolf)" };

// metro label (must match the curated `city` values) -> Wikidata entity
const CITY_QID = {
  "New York": "Q60", "Boston": "Q100", "Chicago": "Q1297", "San Francisco": "Q62",
  "Los Angeles": "Q65", "Seattle": "Q5083", "Washington": "Q61", "Philadelphia": "Q1345",
  "New Orleans": "Q34404", "Austin": "Q16559", "Portland": "Q6106", "Miami": "Q8652",
  "Atlanta": "Q23556", "Houston": "Q16555", "Nashville": "Q23197", "Denver": "Q16554",
  "Las Vegas": "Q23768", "San Diego": "Q16552", "Minneapolis": "Q36091", "Detroit": "Q12439",
  "Phoenix": "Q16556", "Baltimore": "Q5092", "St. Louis": "Q38022", "Pittsburgh": "Q1342",
  "Memphis": "Q16563", "San Antonio": "Q975", "Charleston": "Q47716", "Louisville": "Q43668",
};
const STATE_OF = {
  "New York": "NY", "Boston": "MA", "Chicago": "IL", "San Francisco": "CA", "Los Angeles": "CA",
  "Seattle": "WA", "Washington": "DC", "Philadelphia": "PA", "New Orleans": "LA", "Austin": "TX",
  "Portland": "OR", "Miami": "FL", "Atlanta": "GA", "Houston": "TX", "Nashville": "TN",
  "Denver": "CO", "Las Vegas": "NV", "San Diego": "CA", "Minneapolis": "MN", "Detroit": "MI",
  "Phoenix": "AZ", "Baltimore": "MD", "St. Louis": "MO", "Pittsburgh": "PA", "Memphis": "TN",
  "San Antonio": "TX", "Charleston": "SC", "Louisville": "KY",
};

// Wikidata cuisine labels / article keywords -> our 22 cuisine chips
const CUISINE_MAP = [
  [/jewish delicatessen|delicatessen|\bdeli\b/i, "Deli"],
  [/steakhouse|steak house/i, "Steakhouse"],
  [/pizzeria|\bpizza\b/i, "Pizza"],
  [/barbecue|barbeque|\bbbq\b/i, "Barbecue"],
  [/soul food/i, "Soul Food"],
  [/cajun|creole/i, "Cajun & Creole"],
  [/hamburger|burger/i, "Burgers"],
  [/bakery|caf[eé]|coffee|pâtisserie|patisserie|doughnut|ice cream/i, "Bakery & Café"],
  [/seafood|oyster|fish/i, "Seafood"],
  [/vegetarian|vegan/i, "Vegetarian"],
  [/new american/i, "New American"],
  [/italian/i, "Italian"], [/french/i, "French"], [/chinese|cantonese|szechuan/i, "Chinese"],
  [/japanese|sushi|ramen|izakaya/i, "Japanese"], [/korean/i, "Korean"], [/thai/i, "Thai"],
  [/indian/i, "Indian"], [/vietnamese|pho\b/i, "Vietnamese"], [/mexican|taqueria|taco/i, "Mexican"],
  [/mediterranean|greek|lebanese|israeli|turkish/i, "Mediterranean"],
  [/cuban|latin|peruvian|puerto rican/i, "Latin"],
  [/american|diner/i, "American"],
];

const FACTORS = ["food", "ambiance", "service", "value", "creativity", "comfort"];
const TONES = ["liveliness", "formality", "adventure"];

// Reuse the curated axis tables so a Wikidata place scores on the same basis.
async function loadAxisTables() {
  const src = fs.readFileSync(path.join(DIR, "fetch-restaurants.mjs"), "utf8");
  const grab = (name) => {
    const start = src.indexOf(`const ${name} = {`);
    const end = src.indexOf("\n};", start);
    return JSON.parse(src.slice(src.indexOf("{", start), end + 2)
      .replace(/\/\/[^\n]*/g, "").replace(/,(\s*[}\]])/g, "$1")
      .replace(/([{,]\s*)"?([A-Za-z &'-]+)"?\s*:/g, '$1"$2":'));
  };
  return { FACTOR_BASE: grab("FACTOR_BASE"), TONE_BASE: grab("TONE_BASE") };
}

let cooldownUntil = 0;
async function api(url, tries = 5, timeoutMs = 15000) {
  for (let i = 0; i < tries; i++) {
    const wait = cooldownUntil - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) return await res.json();
      if (res.status === 404) return null;
      if (res.status === 429 || res.status >= 500) {
        const ra = +(res.headers.get("retry-after") || 0);
        const pause = ra > 0 ? ra * 1000 : 4000 * Math.pow(2, i);
        cooldownUntil = Date.now() + pause;
        console.log(`  … throttled (${res.status}), pausing ${Math.round(pause / 1000)}s`);
        continue;
      }
      return null;
    } catch { /* timeout / network -> retry */ }
    await sleep(1000 * (i + 1));
  }
  return null;
}

/**
 * Notable restaurants with an English Wikipedia article, batched by metro.
 *
 * Two shapes of this query time out on Wikidata's public endpoint: adding
 * `OPTIONAL { ?item wdt:P2012 ?cuisine }` alongside the transitive
 * `wdt:P131*`, and excluding chains with a `MINUS` over `P279*`. Both are
 * dropped — cuisine is read from the article text instead, and chains are
 * filtered in JS, which costs nothing and cannot 504.
 */
async function sparqlCities(cities) {
  const values = cities.map((c) => `wd:${CITY_QID[c]}`).join(" ");
  const byQid = Object.fromEntries(cities.map((c) => [CITY_QID[c], c]));
  const query = `SELECT ?itemLabel ?city ?article WHERE {
  ?item wdt:P31/wdt:P279* wd:Q11707 .
  ?item wdt:P131* ?city .
  VALUES ?city { ${values} }
  ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 800`;
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
  const data = await api(url, 4, 60000);
  if (!data) return [];
  const out = new Map();
  for (const r of data.results.bindings) {
    const name = r.itemLabel?.value;
    const article = r.article?.value;
    const city = byQid[(r.city?.value || "").split("/").pop()];
    if (!name || !article || !city || /^Q\d+$/.test(name)) continue;
    const key = name + "|" + city;
    if (!out.has(key)) out.set(key, { name, city, article });
  }
  return [...out.values()];
}

const titleFromArticle = (url) => decodeURIComponent(url.split("/wiki/")[1] || "").replace(/_/g, " ");

/** Real monthly readership — the honest popularity signal for a notable place. */
async function monthlyViews(title) {
  const end = new Date(Date.now() - 3 * 86400000);
  const start = new Date(end.getTime() - 90 * 86400000);
  const fmt = (d) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(title.replace(/ /g, "_"))}/daily/${fmt(start)}/${fmt(end)}`;
  const data = await api(url, 3);
  if (!data?.items?.length) return null;   // unknown, not zero
  const total = data.items.reduce((a, x) => a + (x.views || 0), 0);
  return Math.round((total / data.items.length) * 30); // ~monthly
}

async function summary(title) {
  const data = await api(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`);
  if (!data || data.type === "disambiguation") return null;
  let img = data.thumbnail?.source || null;
  if (img && data.originalimage?.width >= 550) img = img.replace(/\/(\d+)px-/, "/500px-");
  return { extract: (data.extract || "").replace(/\s+/g, " ").trim(), image: img };
}

/**
 * Wikipedia keeps articles on restaurants long after they shut, and sending
 * someone to a closed restaurant is worse than not listing it.
 *
 * Matching venue nouns turned out to be far too brittle — "Windows on the
 * World was a complex of dining venues" and "El Faro was a food emporium"
 * both slipped through a list of restaurant/diner/bakery. The reliable signal
 * is grammatical: Wikipedia opens with "X IS a restaurant" for a going
 * concern and "X WAS a restaurant" for a dead one. So take the tense of the
 * FIRST copula in the lead sentence and trust it.
 *
 * That also disposes of the false positive that a naive past-tense search
 * hits: "Katz's Delicatessen is a delicatessen... It was founded in 1888"
 * leads with `is`, so it reads as open, correctly.
 */
export function looksClosed(extract = "") {
  const first = (extract.split(/(?<=[.!?])\s+/)[0] || "");
  const copula = first.match(/\b(is|are|was|were)\b/i);
  if (copula && /was|were/i.test(copula[1])) return true;
  if (/\b(permanently closed|now closed|has since closed|shuttered|closed (?:its doors|permanently|in \d{4})|ceased operations|went out of business|defunct|demolished)\b/i.test(extract)) return true;
  return false;
}

const foldName = (t) => t.toLowerCase().replace(/[’']/g, "").replace(/&/g, " and ")
  .replace(/[^a-z0-9\s]/g, " ").replace(/\b(the|a|an|restaurant|cafe|caf)\b/g, " ")
  .replace(/\s+/g, " ").trim();

function mapCuisines(labels, extract) {
  const hay = [...labels, extract || ""].join(" ");
  const out = [];
  for (const [re, chip] of CUISINE_MAP) {
    if (re.test(hay) && !out.includes(chip)) out.push(chip);
    if (out.length === 3) break;
  }
  return out.length ? out : ["American"];
}

async function main() {
  const { FACTOR_BASE, TONE_BASE } = await loadAxisTables();
  const existing = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const seen = new Set(existing.map((r) => foldName(r.title) + "|" + r.city));
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};

  const cities = (process.env.CITIES || Object.keys(CITY_QID).join(",")).split(",").map((s) => s.trim())
    .filter((c) => { if (CITY_QID[c]) return true; console.warn(`  ! unknown city ${c}`); return false; });
  const added = [];

  // Batched: one query for every eight metros keeps each well inside the
  // endpoint's timeout while making a fraction of the requests.
  const batches = [];
  for (let i = 0; i < cities.length; i += 8) batches.push(cities.slice(i, i + 8));

  for (const batch of batches) {
    const rows = await sparqlCities(batch);
    console.log(`${batch.join(", ")}: ${rows.length} notable places on Wikidata`);
    let kept = 0, skipped = 0;
    for (const row of rows) {
      const key = foldName(row.name) + "|" + row.city;
      if (seen.has(key)) { skipped++; continue; }   // curated wins, and no dupes
      seen.add(key);

      const title = titleFromArticle(row.article);
      let rec = cache[title];
      if (rec === undefined) {
        const s2 = await summary(title);
        if (!s2 || !s2.extract) { cache[title] = null; await sleep(120); continue; }
        const lead = s2.extract.slice(0, 400);
        // must be an eatery, and not a chain we would be listing generically
        const isEatery = /\b(restaurant|delicatessen|diner|eatery|bakery|steakhouse|caf[e\u00e9]|pizzeria|bar|tavern|barbecue|food)\b/i.test(lead);
        const isChain = /\b(chain|franchise|locations in|outlets)\b/i.test(lead);
        const notFood = /\b(nightclub|night club|music venue|hotel|casino|museum|theater|theatre)\b/i.test(lead);
        if (!isEatery || isChain || notFood) { cache[title] = null; await sleep(120); continue; }
        const views = await monthlyViews(title);
        rec = { extract: s2.extract, image: s2.image, views };
        // Only persist a record whose readership actually resolved; otherwise a
        // throttled lookup would freeze in as a permanent zero.
        if (views != null) { cache[title] = rec; fs.writeFileSync(CACHE, JSON.stringify(cache)); }
        await sleep(150);
      }
      if (!rec || rec.views == null) continue;   // retry unresolved readership next run
      if (looksClosed(rec.extract)) continue;   // applies to cached records too

      const genres = mapCuisines([], rec.extract);
      // Two metros can hold the same name (Crumbs and Whiskers is in both LA
      // and DC), so the city has to be part of the id or they collide.
      const id = "rs_wd_" + foldName(row.name).replace(/\s+/g, "_")
        + "_" + row.city.toLowerCase().replace(/[^a-z0-9]+/g, "");
      added.push({
        id,
        title: row.name,
        subtitle: `${row.city}, ${STATE_OF[row.city] || ""}`.replace(/, $/, ""),
        city: row.city,
        year: null,
        meta: null,                       // price unknown — better blank than invented
        genres,
        // Readership, not approval. Scaled 0..100 and labelled "Wikipedia
        // interest" wherever it appears; a real star rating only arrives via
        // the keyed Google/Yelp cross-reference.
        rating: { value: 0, count: rec.views, scale: 100, source: "Wikipedia" },
        image: rec.image,
        blurb: rec.extract.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ").slice(0, 220),
        overview: rec.extract.slice(0, 420),
        _views: rec.views,
      });
      kept++;
    }
    console.log(`  +${kept} new (${skipped} already curated)`);
  }

  if (added.length === 0) { console.log("nothing new to add"); return; }

  // Popularity + the interest score come from the same readership figure.
  const maxViews = Math.max(...added.map((r) => r._views), 1);
  for (const r of added) {
    r.popularity = logPopularity(r._views, maxViews);
    r.rating.value = Math.max(1, Math.round(r.popularity * 100));
    r.factors = deriveAxes(r.id, r.genres, FACTOR_BASE, FACTORS);
    r.tone = deriveAxes(r.id, r.genres, TONE_BASE, TONES);
    delete r._views;
  }

  const merged = [...existing, ...added];
  const FOCUS = ["Boston", "New York", "Chicago", "San Francisco", "Los Angeles"];
  const rank = (c) => (FOCUS.indexOf(c) === -1 ? FOCUS.length : FOCUS.indexOf(c));
  merged.sort((a, b) => rank(a.city) - rank(b.city) || a.city.localeCompare(b.city) || b.popularity - a.popularity);
  writePretty(fs, OUT, merged);
  console.log(`\nrestaurants: ${existing.length} -> ${merged.length} (+${added.length} from Wikidata)`);
}

// Only sweep when run directly. Importing this module (the tests do, for the
// predicates) must never kick off a fetch — an earlier `node -e "import(...)"`
// meant as a syntax check did exactly that and rewrote a catalogue.
const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (runDirectly) main().catch((e) => { console.error(e); process.exit(1); });
