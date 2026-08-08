// ============================================================================
// fetch-reception.mjs — attach "what others said" to every catalogue.
//
// KEYLESS DEFAULT (what ships): Wikipedia's own "Critical reception" prose,
// which is sourced, attributable, and freely licensed (CC BY-SA — the UI
// credits Wikipedia and links the article). Also grabs a fuller overview
// paragraph than the one-line blurb, plus attributable pull-quotes when a
// named outlet appears.
//
// GOOGLE REVIEWS (opt-in, restaurants): with GOOGLE_PLACES_API_KEY set, also
// pulls up to 5 real Google reviews per restaurant. Google's ToS forbids
// caching Places content long-term, so these are written to a SEPARATE
// gitignored file (src/data/google-reviews.json) that a deployment can
// refresh; the committed catalogue never contains them.
//
// Resumable: results are cached per item id, throttle failures are never
// cached, so re-running picks up where it left off.
//
//   node scripts/fetch-reception.mjs                # all domains, default caps
//   DOMAINS=movies,tv LIMIT=400 node scripts/...    # scoped
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pickReception, leadParagraphs, pullQuotes, isArticleForItem, rankTitles } from "./lib/reception.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(DIR, "../src/data");
const CACHE = path.join(DIR, ".cache/reception.json");
const UA = { "User-Agent": "decluttered-seed/0.5 (personal project; contact via github hhwolf)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// How many items per domain to enrich, most popular first. Reception prose only
// exists for notable works, so chasing the long tail mostly burns requests.
const CAPS = { movies: 300, tv: 250, books: 209, music: 150, restaurants: 101 };
const DOMAINS = (process.env.DOMAINS || "books,movies,tv,music,restaurants").split(",");
const LIMIT = process.env.LIMIT ? +process.env.LIMIT : null;

async function api(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (res.ok) return { ok: true, data: await res.json() };
      if (res.status === 404) return { ok: false, definitive: true };
    } catch { /* network hiccup */ }
    await sleep(1200 * (i + 1));
  }
  return { ok: false, definitive: false };
}

/** Search Wikipedia for the article that is actually about this item. */
async function findArticle(item, kind) {
  const q = encodeURIComponent(`${item.title} ${item.year || ""} ${kind}`.trim());
  const s = await api(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${q}&srlimit=5&format=json&origin=*`);
  if (!s.ok) return { titles: [], definitive: !!s.definitive };
  return { titles: (s.data?.query?.search || []).map((h) => h.title), definitive: true };
}

async function plaintext(title) {
  const r = await api(`https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exsectionformat=wiki&redirects=1&titles=${encodeURIComponent(title)}&format=json&origin=*`);
  if (!r.ok) return { text: null, definitive: !!r.definitive };
  const page = Object.values(r.data?.query?.pages || {})[0];
  return { text: page?.extract || null, definitive: true };
}

const KIND = { books: "novel book", movies: "film", tv: "television series", music: "song", restaurants: "restaurant" };

async function enrich(domainKey) {
  const file = path.join(DATA, `${domainKey}.json`);
  const list = JSON.parse(fs.readFileSync(file, "utf8"));
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};

  const cap = LIMIT || CAPS[domainKey] || 200;
  const targets = [...list].sort((a, b) => (b.popularity || 0) - (a.popularity || 0)).slice(0, cap);
  console.log(`${domainKey}: enriching ${targets.length} of ${list.length}`);

  let hit = 0, miss = 0, deferred = 0, done = 0;
  for (const item of targets) {
    done++;
    if (cache[item.id] !== undefined) {
      if (cache[item.id]) { Object.assign(item, cache[item.id]); hit++; } else miss++;
      continue;
    }

    const { titles, definitive: searchOk } = await findArticle(item, KIND[domainKey]);
    let found = null, sawThrottle = !searchOk;
    for (const t of rankTitles(titles, domainKey).slice(0, 2)) {
      const { text, definitive } = await plaintext(t);
      if (!definitive) { sawThrottle = true; continue; }
      if (!text) continue;
      // The novel, the film, and the video game all share a name — only trust
      // an article whose title AND lead corroborate this exact item.
      if (!isArticleForItem(item, t, text, domainKey)) { await sleep(80); continue; }
      const rec = pickReception(text);
      const overview = leadParagraphs(text);
      if (rec || overview) {
        found = {
          reception: rec ? {
            summary: rec.summary,
            quotes: pullQuotes(rec.body || ""), // quotes come from the reception prose only
            source: "Wikipedia",
            url: `https://en.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, "_"))}`,
          } : null,
          overview: overview || null,
        };
        if (rec) break;          // a real reception section wins outright
      }
      await sleep(80);
    }

    if (found && (found.reception || found.overview)) {
      cache[item.id] = found; Object.assign(item, found); hit++;
    } else if (!sawThrottle) { cache[item.id] = null; miss++; }
    else deferred++;

    if (done % 25 === 0) {
      fs.writeFileSync(CACHE, JSON.stringify(cache));
      fs.writeFileSync(file, JSON.stringify(list, null, 1) + "\n");
      console.log(`  ${done}/${targets.length} · ${hit} enriched, ${miss} none, ${deferred} deferred`);
    }
    await sleep(120);
  }

  fs.writeFileSync(CACHE, JSON.stringify(cache));
  fs.writeFileSync(file, JSON.stringify(list, null, 1) + "\n");
  const withRec = list.filter((i) => i.reception?.summary).length;
  console.log(`${domainKey}: ${withRec}/${list.length} have critical reception (${miss} none, ${deferred} deferred)`);
}

// ---- optional: real Google reviews for restaurants ------------------------
async function googleReviews() {
  const KEY = process.env.GOOGLE_PLACES_API_KEY;
  if (!KEY) { console.log("restaurants: no GOOGLE_PLACES_API_KEY — skipping Google reviews (Wikipedia reception still applied)"); return; }
  const file = path.join(DATA, "restaurants.json");
  const list = JSON.parse(fs.readFileSync(file, "utf8"));
  const out = {};
  for (const r of list) {
    try {
      const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": KEY,
          "X-Goog-FieldMask": "places.id,places.displayName,places.rating,places.userRatingCount,places.reviews" },
        body: JSON.stringify({ textQuery: `${r.title} ${r.subtitle}`, maxResultCount: 1 }),
      });
      if (!res.ok) throw new Error(res.status);
      const pl = (await res.json()).places?.[0];
      if (pl?.reviews?.length) {
        out[r.id] = pl.reviews.slice(0, 5).map((v) => ({
          author: v.authorAttribution?.displayName || "A Google user",
          rating: v.rating, text: v.text?.text || "", when: v.relativePublishTimeDescription || "",
        }));
      }
    } catch (e) { console.warn(`  ! ${r.title}: ${e.message}`); }
    await sleep(200);
  }
  // Separate, gitignored file: Google forbids long-term caching of this content.
  fs.writeFileSync(path.join(DATA, "google-reviews.json"), JSON.stringify(out, null, 1) + "\n");
  console.log(`restaurants: ${Object.keys(out).length} places with live Google reviews -> src/data/google-reviews.json (gitignored)`);
}

async function main() {
  for (const d of DOMAINS) {
    if (!CAPS[d]) { console.warn(`unknown domain ${d}`); continue; }
    await enrich(d);
  }
  if (DOMAINS.includes("restaurants")) await googleReviews();
}

main().catch((e) => { console.error(e); process.exit(1); });
