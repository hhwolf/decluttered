// ============================================================================
// patch-trailers.mjs — attach a YouTube trailer id to films and shows.
//
// Source is Wikidata P1651 ("YouTube video ID"), matched via P345 (IMDb id),
// which is keyless. Films already carry an IMDb id; shows do not, so their id
// comes from TVMaze's `externals.imdb` first.
//
// We store only the video ID and play it through YouTube's official IFrame
// embed. Nothing is downloaded, re-hosted or extracted — that would breach
// YouTube's terms, and the embed is the sanctioned path.
//
// EVERY id is verified before it is stored, because most of them are junk.
// Measured on a 30-title sample of what Wikidata returned: 26 were dead,
// region-locked or embed-disabled and rendered "Video unavailable" in the
// player. 13% usable. Neither oEmbed (200 for dead videos) nor the embed page
// HTML can tell you this; only the watch page carries a real
// `playabilityStatus`, so that is what we check.
//
//   node scripts/patch-trailers.mjs
//   DOMAINS=movies node scripts/patch-trailers.mjs
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sleep, writePretty } from "./lib/derive.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(DIR, "../src/data");
const CACHE = path.join(DIR, ".cache/trailers.json");
const UA = { "User-Agent": "decluttered-seed/0.5 (personal project; contact via github hhwolf)" };
const DOMAINS = (process.env.DOMAINS || "movies,tv").split(",");
const BATCH = 250; // IMDb ids per SPARQL query; larger ones time out

/** "https://www.imdb.com/title/tt0111161/" -> "tt0111161" */
export const imdbIdFrom = (link = "") => String(link).match(/(tt\d+)/)?.[1] || null;

/**
 * A YouTube id is exactly 11 chars of [A-Za-z0-9_-]. Wikidata is crowd-edited
 * and does contain full URLs and stray whitespace in this field; anything that
 * isn't a bare id is dropped rather than half-parsed into a broken embed.
 */
export function cleanVideoId(raw = "") {
  const v = String(raw).trim();
  return /^[A-Za-z0-9_-]{11}$/.test(v) ? v : null;
}

const BROWSER_UA = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

/**
 * Can this video actually play, embedded, right now?
 *
 * Requires BOTH a playable status and explicit embed permission. Anything we
 * cannot positively confirm is treated as unusable — a missing trailer is a
 * non-event, a dead player is a visible defect.
 */
export function isPlayableEmbed(watchPageHtml = "") {
  return /"playabilityStatus":\{"status":"OK"/.test(watchPageHtml)
    && /"playableInEmbed":true/.test(watchPageHtml);
}

async function verify(videoId) {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: BROWSER_UA, signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return false;
    return isPlayableEmbed(await res.text());
  } catch { return false; }
}

async function sparql(query, tries = 3) {
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(90000) });
      if (res.status === 429) { await sleep(5000 * (i + 1)); continue; }
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()).results.bindings;
    } catch (e) {
      if (i === tries - 1) { console.warn(`  ! sparql failed: ${e.message}`); return []; }
      await sleep(3000 * (i + 1));
    }
  }
  return [];
}

/** imdb id -> youtube id, for a batch of imdb ids. */
async function trailersFor(imdbIds) {
  const out = new Map();
  for (let i = 0; i < imdbIds.length; i += BATCH) {
    const slice = imdbIds.slice(i, i + BATCH);
    const values = slice.map((x) => `"${x}"`).join(" ");
    const rows = await sparql(
      `SELECT ?imdb ?ytid WHERE { VALUES ?imdb { ${values} } ?item wdt:P345 ?imdb . ?item wdt:P1651 ?ytid }`
    );
    for (const r of rows) {
      const id = cleanVideoId(r.ytid?.value);
      // First id wins: Wikidata often lists several (trailer, teaser, clip).
      if (id && !out.has(r.imdb.value)) out.set(r.imdb.value, id);
    }
    console.log(`  ${Math.min(i + BATCH, imdbIds.length)}/${imdbIds.length} queried · ${out.size} found`);
    await sleep(1200);
  }
  return out;
}

/** TVMaze knows each show's IMDb id; Wikidata is keyed on that, not on TVMaze. */
async function imdbIdsForShows(shows, cache) {
  const out = new Map();
  let fetched = 0;
  for (const s of shows) {
    if (cache.imdb?.[s.id] !== undefined) {
      if (cache.imdb[s.id]) out.set(s.id, cache.imdb[s.id]);
      continue;
    }
    const tvmazeId = String(s.links?.tvmaze || "").match(/\/shows\/(\d+)/)?.[1];
    if (!tvmazeId) continue;
    try {
      const res = await fetch(`https://api.tvmaze.com/shows/${tvmazeId}`, { headers: UA, signal: AbortSignal.timeout(15000) });
      const j = res.ok ? await res.json() : null;
      const imdb = j?.externals?.imdb || null;
      (cache.imdb = cache.imdb || {})[s.id] = imdb;
      if (imdb) out.set(s.id, imdb);
    } catch { /* transient; retried on the next run */ }
    if (++fetched % 50 === 0) {
      fs.writeFileSync(CACHE, JSON.stringify(cache));
      console.log(`  tvmaze: ${fetched} looked up`);
    }
    await sleep(180);
  }
  fs.writeFileSync(CACHE, JSON.stringify(cache));
  return out;
}

/**
 * Re-check every trailer already in the catalogues and drop the ones that no
 * longer play. Videos get taken down and regions change, so this is not a
 * one-off: `VERIFY=1 npm run patch:trailers` should be run periodically.
 */
async function verifyExisting(cache) {
  cache.playable = cache.playable || {};
  for (const domainKey of DOMAINS) {
    const file = path.join(DATA, `${domainKey}.json`);
    const list = JSON.parse(fs.readFileSync(file, "utf8"));
    const withTrailer = list.filter((i) => i.trailer);
    const ids = [...new Set(withTrailer.map((i) => i.trailer))];
    console.log(`${domainKey}: re-verifying ${ids.length} distinct video ids`);
    let done = 0, ok = 0;
    for (const id of ids) {
      // Reuse a verdict we already have unless RECHECK asks for a fresh one.
      if (cache.playable[id] === undefined || process.env.RECHECK) {
        cache.playable[id] = await verify(id);
        await sleep(300);
      }
      if (cache.playable[id]) ok++;
      if (++done % 25 === 0) {
        fs.writeFileSync(CACHE, JSON.stringify(cache));
        console.log(`  ${done}/${ids.length} · ${ok} playable`);
      }
    }
    let dropped = 0;
    for (const it of list) {
      if (it.trailer && !cache.playable[it.trailer]) { delete it.trailer; dropped++; }
      cache.trailer[it.id] = it.trailer || null;
    }
    fs.writeFileSync(CACHE, JSON.stringify(cache));
    // NOT writePretty: `trailer` is on its preserve list, so it would helpfully
    // restore from disk every id we just deleted — the enrichment guard working
    // exactly as designed, against us. This pass owns the whole file, so there
    // is nothing to merge forward.
    fs.writeFileSync(file, JSON.stringify(list, null, 1) + "\n");
    console.log(`wrote ${file} (${list.length} items)`);
    const left = list.filter((i) => i.trailer).length;
    console.log(`${domainKey}: dropped ${dropped} unplayable, ${left}/${list.length} keep a trailer`);
  }
}

async function main() {
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
  if (process.env.VERIFY) { cache.trailer = cache.trailer || {}; return verifyExisting(cache); }

  for (const domainKey of DOMAINS) {
    const file = path.join(DATA, `${domainKey}.json`);
    const list = JSON.parse(fs.readFileSync(file, "utf8"));

    // Replaying the cache is free and never capped.
    let restored = 0;
    for (const it of list) {
      const hit = cache.trailer?.[it.id];
      if (hit) { it.trailer = hit; restored++; }
    }
    if (restored) console.log(`${domainKey}: replayed ${restored} cached trailers`);

    const todo = list.filter((i) => !i.trailer && cache.trailer?.[i.id] === undefined);
    if (!todo.length) { writePretty(fs, file, list); console.log(`${domainKey}: nothing new`); continue; }

    // Map each item to its IMDb id.
    let imdbOf = new Map();
    if (domainKey === "tv") {
      console.log(`${domainKey}: resolving IMDb ids from TVMaze for ${todo.length}`);
      imdbOf = await imdbIdsForShows(todo, cache);
    } else {
      for (const it of todo) {
        const id = imdbIdFrom(it.links?.imdb);
        if (id) imdbOf.set(it.id, id);
      }
    }
    console.log(`${domainKey}: ${imdbOf.size} have an IMDb id`);

    const found = await trailersFor([...new Set(imdbOf.values())]);
    cache.trailer = cache.trailer || {};
    cache.playable = cache.playable || {};
    let hit = 0, rejected = 0, checked = 0;
    for (const it of todo) {
      const imdb = imdbOf.get(it.id);
      const yt = imdb ? found.get(imdb) : null;
      if (!yt) { cache.trailer[it.id] = null; continue; }
      // Verify once per video id, not per item — sequels share trailers.
      if (cache.playable[yt] === undefined) {
        cache.playable[yt] = await verify(yt);
        if (++checked % 25 === 0) {
          fs.writeFileSync(CACHE, JSON.stringify(cache));
          console.log(`  verified ${checked} · ${hit} playable, ${rejected} rejected`);
        }
        await sleep(350);
      }
      if (cache.playable[yt]) { cache.trailer[it.id] = yt; it.trailer = yt; hit++; }
      else { cache.trailer[it.id] = null; rejected++; }
    }
    console.log(`${domainKey}: ${rejected} ids rejected as unplayable`);
    fs.writeFileSync(CACHE, JSON.stringify(cache));
    writePretty(fs, file, list);
    const total = list.filter((i) => i.trailer).length;
    console.log(`${domainKey}: +${hit} this run, ${total}/${list.length} have a trailer`);
  }
}

// Guard: importing this module for a syntax check must not start a crawl.
const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (runDirectly) main().catch((e) => { console.error(e); process.exit(1); });
