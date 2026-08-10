// ============================================================================
// patch-dish-photos.mjs — a small gallery of dish photos per restaurant.
//
// Source is Wikimedia Commons, keyless. Each photo keeps its author and licence
// because these are CC-licensed works and attribution is a condition of use,
// not a nicety.
//
// WHAT THESE PHOTOS ARE, precisely: pictures of the DISH, not of the plate this
// restaurant serves. A photo of a cannoli is not a photo of Mike's cannoli. The
// UI has to say so, or a gallery of stock food shots reads as the restaurant's
// own photography — which would be the most convincing lie in the app.
//
// Only places with a named signature dish, or a visually specific cuisine, get
// a gallery. A search for "American" returns noise, and a wrong photo is worse
// than a missing one.
//
//   node scripts/patch-dish-photos.mjs
//   LIMIT=20 node scripts/patch-dish-photos.mjs     # short run
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sleep, writePretty } from "./lib/derive.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, "../src/data/restaurants.json");
const CACHE = path.join(DIR, ".cache/dish-photos.json");
const UA = { "User-Agent": "decluttered-seed/0.5 (personal project; contact via github hhwolf)" };
const LIMIT = process.env.LIMIT ? +process.env.LIMIT : null;
const WANT = 4; // a swipeable handful, not a gallery to get lost in

// Cuisines whose name alone returns recognisable food. Deliberately excludes
// "American", "Contemporary", "Fusion" and similar, which return noise.
const SPECIFIC_CUISINES = new Set([
  "Sushi", "Japanese", "Ramen", "Thai", "Vietnamese", "Korean", "Chinese", "Dim Sum",
  "Indian", "Italian", "Pizza", "Mexican", "Tacos", "Barbecue", "Seafood", "Steakhouse",
  "French", "Greek", "Spanish", "Ethiopian", "Turkish", "Lebanese", "Middle Eastern",
  "Caribbean", "Peruvian", "Brazilian", "Soul Food", "Cajun", "Creole", "Deli",
  "Bakery", "Dessert", "Burgers", "Sandwiches", "Noodles", "Dumplings", "Vegetarian",
]);

/** The search phrase for an item, or null when nothing specific enough exists. */
export function queryFor(item) {
  if (item?.dish) return item.dish;
  const cuisine = (item?.genres || []).find((g) => SPECIFIC_CUISINES.has(g));
  return cuisine || null;
}

/**
 * Commons markup is HTML. Strip tags for a plain credit line, and give up
 * rather than print raw markup if the field is unusable.
 */
export function plainCredit(html = "") {
  const t = String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return t && t.length <= 80 ? t : t ? t.slice(0, 77).trimEnd() + "…" : null;
}

/** Photos are decoration only if they're of food; skip obvious non-food files. */
const REJECT = /\b(map|logo|coat of arms|flag|portrait|signature|diagram|poster|chart)\b/i;

async function search(query) {
  const url = "https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search"
    + `&gsrsearch=${encodeURIComponent("filetype:bitmap " + query)}&gsrnamespace=6&gsrlimit=10`
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
      const j = await res.json();
      return Object.values(j.query?.pages || {});
    } catch (e) {
      if (i === 2) return [];
      await sleep(2000 * (i + 1));
    }
  }
  return [];
}

export function toPhotos(pages, want = WANT) {
  const out = [];
  for (const p of pages) {
    const name = String(p.title || "").replace(/^File:/, "");
    if (REJECT.test(name)) continue;
    const ii = p.imageinfo?.[0];
    const url = ii?.thumburl || ii?.url;
    if (!url) continue;
    const em = ii.extmetadata || {};
    out.push({
      url,
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
  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};

  // Replaying the cache is free; queries are shared across restaurants that
  // serve the same dish, so this saves most of the work on a re-run.
  let restored = 0;
  for (const r of list) {
    const q = queryFor(r);
    if (q && cache[q]?.length) { r.dishPhotos = cache[q]; restored++; }
  }
  if (restored) console.log(`replayed ${restored} cached galleries`);

  const todo = list.filter((r) => !r.dishPhotos && queryFor(r) && cache[queryFor(r)] === undefined);
  const queries = [...new Set(todo.map(queryFor))];
  const targets = LIMIT ? queries.slice(0, LIMIT) : queries;
  console.log(`${targets.length} distinct dishes to look up (covering ${todo.length} places)`);

  let done = 0, found = 0;
  for (const q of targets) {
    const photos = toPhotos(await search(q));
    cache[q] = photos;
    if (photos.length) found++;
    if (++done % 10 === 0) {
      fs.writeFileSync(CACHE, JSON.stringify(cache));
      console.log(`  ${done}/${targets.length} · ${found} with photos`);
    }
    await sleep(700); // Commons throttles bursts
  }
  fs.writeFileSync(CACHE, JSON.stringify(cache));

  for (const r of list) {
    const q = queryFor(r);
    if (q && cache[q]?.length) r.dishPhotos = cache[q];
  }
  writePretty(fs, OUT, list);
  const withGallery = list.filter((r) => r.dishPhotos?.length).length;
  console.log(`dish photos: ${withGallery}/${list.length} places have a gallery`);
}

// Guard: importing this module for a syntax check must not start a crawl.
const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (runDirectly) main().catch((e) => { console.error(e); process.exit(1); });
