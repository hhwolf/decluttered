// ============================================================================
// patch-restaurant-provenance.mjs — add "opened in" years and awards to the
// 249 Wikidata-sourced places in src/data/restaurants.json.
//
// A place that has been serving since 1927, or holds a Michelin star, tells you
// something decisive that a match percentage cannot. Both are stated facts on
// the Wikidata item — inception (P571) and award received (P166) — so we are
// reporting a source, not inferring from cuisine or neighbourhood the way a
// guessed price band would.
//
// Price stays blank on purpose. There is no keyless source for it, and a
// confidently wrong "$$$" is exactly the failure this app exists to avoid.
//
//   node scripts/patch-restaurant-provenance.mjs
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sleep, writePretty } from "./lib/derive.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, "../src/data/restaurants.json");
const UA = { "User-Agent": "decluttered-seed/0.5 (personal project; contact via github hhwolf)" };

const CITY_QID = {
  "New York": "Q60", "Boston": "Q100", "Chicago": "Q1297", "San Francisco": "Q62",
  "Los Angeles": "Q65", "Seattle": "Q5083", "Washington": "Q61", "Philadelphia": "Q1345",
  "New Orleans": "Q34404", "Austin": "Q16559", "Portland": "Q6106", "Miami": "Q8652",
  "Atlanta": "Q23556", "Houston": "Q16555", "Nashville": "Q23197", "Denver": "Q16554",
  "Las Vegas": "Q23768", "San Diego": "Q16552", "Minneapolis": "Q36091", "Detroit": "Q12439",
  "Phoenix": "Q16556", "Baltimore": "Q5092", "St. Louis": "Q38022", "Pittsburgh": "Q1342",
  "Memphis": "Q16563", "San Antonio": "Q975", "Charleston": "Q47716", "Louisville": "Q43668",
};

// Must stay identical to the id scheme in fetch-restaurants-wikidata.mjs, or
// nothing matches and the whole pass silently writes nothing.
const foldName = (t) => t.toLowerCase().replace(/[’']/g, "").replace(/&/g, " and ")
  .replace(/[^a-z0-9\s]/g, " ").replace(/\b(the|a|an|restaurant|cafe|caf)\b/g, " ")
  .replace(/\s+/g, " ").trim();
export const idFor = (name, city) =>
  "rs_wd_" + foldName(name).replace(/\s+/g, "_") + "_" + city.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * Awards worth a line on a card. Wikidata hangs a lot of local and defunct
 * honours off P166; "Michelin star" earns a chip, "listed in a 2011 city
 * guide" does not, and a card cluttered with minor awards is noise.
 */
export function notableAward(label = "") {
  const l = label.toLowerCase();
  if (/michelin/.test(l)) return "Michelin";
  if (/james beard/.test(l)) return "James Beard";
  if (/bib gourmand/.test(l)) return "Bib Gourmand";
  if (/world'?s 50 best|50 best restaurants/.test(l)) return "World's 50 Best";
  return null;
}

/**
 * A four-digit year from a Wikidata time literal ("+1927-01-01T00:00:00Z").
 * Rejects anything outside a plausible range so a malformed or placeholder
 * date never renders as "Serving since 0201".
 */
export function inceptionYear(value = "") {
  const m = String(value).match(/^[+-]?(\d{4})-/);
  if (!m) return null;
  const y = +m[1];
  const now = new Date().getUTCFullYear();
  return y >= 1600 && y <= now ? y : null;
}

async function sparql(query, tries = 4) {
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(60000) });
      if (res.status === 429) {
        const wait = +(res.headers.get("retry-after") || 0) * 1000 || 5000 * (i + 1);
        console.log(`  … rate-limited, pausing ${Math.round(wait / 1000)}s`);
        await sleep(wait);
        continue;
      }
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    } catch (e) {
      if (i === tries - 1) { console.warn(`  ! sparql failed: ${e.message}`); return null; }
      await sleep(2000 * (i + 1));
    }
  }
  return null;
}

/** One metro at a time — the all-cities version of this query 504s. */
async function forCity(city) {
  const qid = CITY_QID[city];
  if (!qid) return [];
  const query = `SELECT ?itemLabel ?inception ?awardLabel WHERE {
  ?item wdt:P31/wdt:P279* wd:Q11707 .
  ?item wdt:P131* wd:${qid} .
  ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> .
  OPTIONAL { ?item wdt:P571 ?inception }
  OPTIONAL { ?item wdt:P166 ?award }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 2000`;
  const data = await sparql(query);
  if (!data) return [];

  // One row per (place, award), so fold them back into one record per place.
  const byName = new Map();
  for (const r of data.results.bindings) {
    const name = r.itemLabel?.value;
    if (!name || /^Q\d+$/.test(name)) continue;
    if (!byName.has(name)) byName.set(name, { name, city, year: null, awards: new Set() });
    const rec = byName.get(name);
    const y = inceptionYear(r.inception?.value);
    // Keep the earliest date: Wikidata sometimes records a relocation or a
    // rebuild alongside the original founding.
    if (y && (!rec.year || y < rec.year)) rec.year = y;
    const a = notableAward(r.awardLabel?.value || "");
    if (a) rec.awards.add(a);
  }
  return [...byName.values()];
}

async function main() {
  const list = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const byId = new Map(list.map((r) => [r.id, r]));
  const cities = [...new Set(list.filter((r) => r.id.startsWith("rs_wd_")).map((r) => r.city))];
  console.log(`provenance: ${cities.length} metros, ${byId.size} places on file`);

  let years = 0, awarded = 0;
  for (const city of cities) {
    const rows = await forCity(city);
    let matched = 0;
    for (const row of rows) {
      const item = byId.get(idFor(row.name, row.city));
      if (!item) continue;
      matched++;
      if (row.year && !item.year) { item.year = row.year; years++; }
      if (row.awards.size) { item.awards = [...row.awards]; awarded++; }
    }
    console.log(`  ${city}: ${rows.length} from Wikidata, ${matched} matched`);
    await sleep(1500);
  }

  writePretty(fs, OUT, list);
  console.log(`provenance: +${years} opening years, +${awarded} with awards`);
}

// Guard: importing this module for a syntax check must not start a crawl.
const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (runDirectly) main().catch((e) => { console.error(e); process.exit(1); });
