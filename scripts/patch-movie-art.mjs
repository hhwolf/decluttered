// ============================================================================
// patch-movie-art.mjs — fill posters for films fetch-movies.mjs couldn't match.
//
// The main fetcher guesses article titles ("Title", "Title (film)",
// "Title (YYYY film)") and caches a definitive miss as null, so a re-run never
// retries them. This pass instead ASKS Wikipedia where the article is, via the
// keyless search API, which finds the disambiguated titles the guesser misses
// ("Nosferatu the Vampyre", "The Kid (1921 Chaplin film)", …).
//
// Idempotent: only touches items with no image, and caches its own results.
// ============================================================================
import fs from "node:fs";
import { splitSentences } from "./lib/reception.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, "../src/data/movies.json");
const CACHE = path.join(DIR, ".cache/movie-art-search.json");
const UA = { "User-Agent": "decluttered-seed/0.4 (personal project; contact via github hhwolf)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (res.ok) return { ok: true, data: await res.json() };
      if (res.status === 404) return { ok: false, definitive: true };
      // 429/5xx -> throttled, back off and retry
    } catch { /* network hiccup -> retry */ }
    await sleep(1200 * (i + 1));
  }
  return { ok: false, definitive: false };
}

const looksLikeFilm = (w) =>
  w?.type === "standard" && /\bfilms?\b|\bmovie\b|\bdirected\b/i.test((w.extract || "").slice(0, 500));

const firstSentence = (s = "") => {
  const t = s.replace(/\s+/g, " ").trim();
  const cut = splitSentences(t).reduce((acc, x) => (acc.length + x.length <= 240 ? (acc ? acc + " " : "") + x : acc), "");
  return cut || t.slice(0, 240);
};

async function findArt(movie) {
  // 1. ask Wikipedia which articles match this film
  const q = encodeURIComponent(`${movie.title} ${movie.year || ""} film`);
  const s = await getJSON(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${q}&srlimit=5&format=json&origin=*`);
  if (!s.ok) return { found: null, definitive: !!s.definitive };
  const hits = (s.data?.query?.search || []).map((h) => h.title);
  if (hits.length === 0) return { found: null, definitive: true };

  // 2. verify each candidate is actually the film, and grab its lead image
  let sawThrottle = false;
  for (const title of hits) {
    const r = await getJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`);
    if (!r.ok) { if (!r.definitive) sawThrottle = true; await sleep(150); continue; }
    const w = r.data;
    // guard against grabbing a different film with a similar name
    const titleWords = movie.title.toLowerCase().split(/\W+/).filter((x) => x.length > 2);
    const overlaps = titleWords.length === 0 || titleWords.some((x) => (w.title || "").toLowerCase().includes(x));
    if (looksLikeFilm(w) && w.thumbnail?.source && overlaps) {
      let img = w.thumbnail.source;
      if (w.originalimage?.width >= 550) img = img.replace(/\/(\d+)px-/, "/500px-");
      return { found: { image: img, blurb: firstSentence(w.extract) }, definitive: true };
    }
    await sleep(150);
  }
  return { found: null, definitive: !sawThrottle };
}

async function main() {
  const list = JSON.parse(fs.readFileSync(OUT, "utf8"));
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};

  const targets = list.filter((m) => !m.image);
  console.log(`${targets.length} films without a poster`);
  let fixed = 0, miss = 0, deferred = 0, done = 0;

  for (const m of targets) {
    done++;
    if (cache[m.id] !== undefined) {
      if (cache[m.id]) { m.image = cache[m.id].image; if (cache[m.id].blurb) m.blurb = cache[m.id].blurb; fixed++; }
      else miss++;
      continue;
    }
    const { found, definitive } = await findArt(m);
    if (found) {
      cache[m.id] = found; m.image = found.image; if (found.blurb) m.blurb = found.blurb; fixed++;
    } else if (definitive) { cache[m.id] = null; miss++; }
    else deferred++; // throttled: leave uncached so a re-run retries

    if (done % 25 === 0) {
      fs.writeFileSync(CACHE, JSON.stringify(cache));
      fs.writeFileSync(OUT, JSON.stringify(list, null, 1) + "\n");
      console.log(`  ${done}/${targets.length} · ${fixed} fixed, ${miss} true misses, ${deferred} deferred`);
    }
    await sleep(250);
  }

  fs.writeFileSync(CACHE, JSON.stringify(cache));
  fs.writeFileSync(OUT, JSON.stringify(list, null, 1) + "\n");
  const remaining = list.filter((m) => !m.image).length;
  console.log(`done: ${fixed} posters added, ${miss} genuinely absent, ${deferred} deferred — ${remaining}/${list.length} still without art`);
}

main().catch((e) => { console.error(e); process.exit(1); });
