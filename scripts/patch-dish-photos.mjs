// ============================================================================
// patch-dish-photos.mjs — a small photo gallery per restaurant, from Wikimedia
// Commons. Keyless. Every photo keeps its author and licence, because these are
// CC works and attribution is a condition of use.
//
// Two kinds of photo, and the UI must not confuse them:
//   kind:"place"  a photo OF THIS RESTAURANT — found by searching its exact
//                 name. Real, specific, and what people actually want.
//   kind:"dish"   a photo of the dish it is known for. Illustrative only: a
//                 cannoli is not Mike's cannoli.
//
// The first version of this shipped junk, because a free-text Commons search
// for a vague phrase matches the text of scanned books, not photographs:
//   "French"                    -> Crowds of French patriots on the Champs Elysees
//   "Korean"                    -> Book of Mormon - Korean
//   "Seasonal American cooking" -> The Horsford 1887 Almanac and Cook Book
//   "Coal-fired pie"            -> Canadian foundryman (1921)
//
// So queries are now anchored ("<dish> food", "<cuisine> food dish") and every
// result must earn its place: a significant word from the query has to appear
// in the filename, and a long reject list drops book scans, signs, buildings,
// portraits and crowds.
//
//   node scripts/patch-dish-photos.mjs
//   FRESH=1 node scripts/patch-dish-photos.mjs    # ignore the cache
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sleep, writePretty } from "./lib/derive.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, "../src/data/restaurants.json");
const CACHE = path.join(DIR, ".cache/dish-photos.json");
const UA = { "User-Agent": "decluttered-seed/0.5 (personal project; contact via github hhwolf)" };
const WANT = 4;

// Cuisines whose name plus "food" returns recognisable dishes. Excludes
// "American", "Contemporary", "Fusion" and friends, which return noise.
const SPECIFIC_CUISINES = new Set([
  "Sushi", "Japanese", "Ramen", "Thai", "Vietnamese", "Korean", "Chinese", "Dim Sum",
  "Indian", "Italian", "Pizza", "Mexican", "Tacos", "Barbecue", "Seafood", "Steakhouse",
  "French", "Greek", "Spanish", "Ethiopian", "Turkish", "Lebanese", "Middle Eastern",
  "Caribbean", "Peruvian", "Brazilian", "Soul Food", "Cajun", "Creole", "Deli",
  "Bakery", "Dessert", "Burgers", "Sandwiches", "Noodles", "Dumplings", "Vegetarian",
]);

// Anything whose filename looks like a document, a building, a sign or people.
const REJECT = new RegExp([
  "cook.?book", "almanac", "recipe.?book", "\\bbook\\b", "\\bpage\\b", "DPLA",
  "\\b1[89]\\d\\d\\b", "advert", "poster", "label", "\\bmap\\b", "diagram", "chart",
  "\\bsign\\b", "signage", "billboard", "logo", "coat.of.arms", "\\bflag\\b",
  "building", "factory", "manufacturing", "warehouse", "\\bstreet\\b", "\\bplaque\\b",
  "portrait", "\\bcrowd", "patriots", "parade", "protest", "\\bmenu\\b",
  // A short restaurant name can collide with a person: "Cosme" matched a
  // Brazilian election candidate's campaign photo.
  "candidato", "prefeito", "\\bTSE\\b", "senator", "congress", "election", "campaign",
  "\\bmap\\b", "postcard", "stamp", "coin", "\\bchef\\b", "\\bstaff\\b",
].join("|"), "i");

/** Words worth matching on: drops articles and generic filler. */
const STOP = new Set(["the", "a", "an", "of", "and", "with", "on", "in", "at", "for",
  "restaurant", "cafe", "bar", "food", "dish", "style", "house", "kitchen", "co", "inc"]);
export function keyWords(phrase = "") {
  return String(phrase).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));
}

/**
 * Does this filename plausibly depict what we asked for?
 *
 * Commons search matches file *text*, not content, so this is the check that
 * keeps a 1921 foundry photo out of a gallery about coal-fired pizza.
 */
export function looksRelevant(fileName = "", phrase = "") {
  // Underscores and hyphens are word characters, so `\bbook\b` never matches
  // "Book_of_Mormon". Normalise separators to spaces before testing — that one
  // detail was letting a Book of Mormon scan into a Korean food gallery.
  const name = String(fileName).toLowerCase().replace(/[_\-.]+/g, " ");
  if (REJECT.test(name)) return false;
  const words = keyWords(phrase);
  if (!words.length) return false;
  return words.some((w) => name.includes(w));
}

/** The queries to try for one restaurant, best first. */
export function queriesFor(item) {
  const out = [];
  // A photo of THIS restaurant is the best possible result.
  if (item?.title) out.push({ kind: "place", phrase: item.title, search: `"${item.title}"` });
  if (item?.dish) out.push({ kind: "dish", phrase: item.dish, search: `${item.dish} food` });
  const cuisine = (item?.genres || []).find((g) => SPECIFIC_CUISINES.has(g));
  if (cuisine) out.push({ kind: "dish", phrase: cuisine, search: `${cuisine} food dish` });
  return out;
}

/** Commons markup is HTML; a credit line has to be plain text. */
export function plainCredit(html = "") {
  const t = String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return t ? (t.length <= 80 ? t : t.slice(0, 77).trimEnd() + "…") : null;
}

async function search(term) {
  const url = "https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search"
    + `&gsrsearch=${encodeURIComponent("filetype:bitmap " + term)}&gsrnamespace=6&gsrlimit=12`
    + "&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=640";
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) });
      if (res.status === 429) {
        const wait = +(res.headers.get("retry-after") || 0) * 1000 || 4000 * (i + 1);
        console.log(`  … rate-limited, pausing ${Math.round(wait / 1000)}s`);
        await sleep(wait);
        continue;
      }
      if (!res.ok) throw new Error(String(res.status));
      return Object.values((await res.json()).query?.pages || {});
    } catch {
      if (i === 2) return [];
      await sleep(2000 * (i + 1));
    }
  }
  return [];
}

export function toPhotos(pages, { kind, phrase }, want = WANT) {
  const out = [];
  for (const p of pages) {
    const name = String(p.title || "").replace(/^File:/, "");
    if (!looksRelevant(name, phrase)) continue;
    const ii = p.imageinfo?.[0];
    const url = ii?.thumburl || ii?.url;
    if (!url) continue;
    const em = ii.extmetadata || {};
    out.push({
      url, kind,
      credit: plainCredit(em.Artist?.value) || "Wikimedia Commons",
      licence: em.LicenseShortName?.value || "see Commons",
      source: ii.descriptionurl || null,
    });
    if (out.length >= want) break;
  }
  return out;
}

async function main() {
  const list = JSON.parse(fs.readFileSync(OUT, "utf8"));
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  let cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
  // The old cache holds results from the unfiltered queries; they cannot be
  // salvaged by filtering, because the searches themselves were wrong.
  if (process.env.FRESH || !cache.__v2) cache = { __v2: true };

  let done = 0, withPlace = 0, withDish = 0;
  for (const item of list) {
    const queries = queriesFor(item);
    if (!queries.length) continue;

    const photos = [];
    for (const q of queries) {
      if (photos.length >= WANT) break;
      const ck = q.kind + "|" + q.search;
      if (cache[ck] === undefined) {
        cache[ck] = toPhotos(await search(q.search), q);
        await sleep(650);
      }
      for (const p of cache[ck]) {
        if (photos.length >= WANT) break;
        if (!photos.some((x) => x.url === p.url)) photos.push(p);
      }
    }

    if (photos.length) {
      item.dishPhotos = photos;
      if (photos.some((p) => p.kind === "place")) withPlace++;
      if (photos.some((p) => p.kind === "dish")) withDish++;
    } else {
      delete item.dishPhotos;
    }

    if (++done % 20 === 0) {
      fs.writeFileSync(CACHE, JSON.stringify(cache));
      fs.writeFileSync(OUT, JSON.stringify(list, null, 1) + "\n");
      console.log(`  ${done}/${list.length} · ${withPlace} with a photo of the place, ${withDish} with dish photos`);
    }
  }
  fs.writeFileSync(CACHE, JSON.stringify(cache));
  // NOT writePretty: dishPhotos is on its preserve list, so deletions of junk
  // galleries would be restored from disk.
  fs.writeFileSync(OUT, JSON.stringify(list, null, 1) + "\n");
  const g = list.filter((r) => r.dishPhotos?.length);
  console.log(`galleries: ${g.length}/${list.length} · ${withPlace} include a real photo of the restaurant`);
}

// Guard: importing this module for a syntax check must not start a crawl.
const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (runDirectly) main().catch((e) => { console.error(e); process.exit(1); });
