// ============================================================================
// patch-trailers.mjs — attach a YouTube trailer id to films and shows.
//
// SOURCE: TMDB, which curates official trailers per title. Needs a free key in
// TMDB_API_KEY (read from .env, which is gitignored — the key must never be
// committed). Without a key it falls back to Wikidata P1651, which is keyless
// but, measured, nearly useless for this:
//
//                      coverage   playable in an embed   usable
//   Wikidata P1651        66%             13%             ~9%
//   TMDB                 100%             93%             ~93%
//
// Wikidata's ids are mostly deleted, region-locked or embed-disabled videos.
//
// EVERY id is still verified before it is stored, whatever the source. A
// trailer that renders "Video unavailable" is worse than no trailer, and
// neither oEmbed (200 even for dead videos) nor the embed page HTML can detect
// it — only the watch page carries a real `playabilityStatus`.
//
// We store the video id and play it through YouTube's official IFrame embed.
// Nothing is downloaded or re-hosted; that would breach YouTube's terms.
//
//   node scripts/patch-trailers.mjs              # fetch + verify
//   VERIFY=1 node scripts/patch-trailers.mjs     # re-check what is stored
//   RECHECK=1 VERIFY=1 ...                       # ignore cached verdicts
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sleep } from "./lib/derive.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(DIR, "../src/data");
const CACHE = path.join(DIR, ".cache/trailers.json");
const UA = { "User-Agent": "decluttered-seed/0.5 (personal project; contact via github hhwolf)" };
const DOMAINS = (process.env.DOMAINS || "movies,tv").split(",");
const BATCH = 250; // IMDb ids per SPARQL query; larger ones time out

/** Read TMDB_API_KEY from the environment, or from the gitignored .env. */
function tmdbKey() {
  if (process.env.TMDB_API_KEY) return process.env.TMDB_API_KEY;
  try {
    const env = fs.readFileSync(path.join(DIR, "../.env"), "utf8");
    return /^TMDB_API_KEY=(.+)$/m.exec(env)?.[1].trim() || null;
  } catch { return null; }
}

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

/**
 * The one video worth showing, from TMDB's list for a title.
 *
 * A full trailer beats a teaser, an official upload beats a fan re-post, and
 * English beats a dub — in that order, then newest. Clips and featurettes are
 * excluded: they spoil without selling.
 */
export function pickTrailer(videos = []) {
  const usable = (videos || [])
    .filter((v) => v?.site === "YouTube" && cleanVideoId(v.key))
    .filter((v) => v.type === "Trailer" || v.type === "Teaser");
  if (!usable.length) return null;
  const rank = (v) =>
    (v.type === "Trailer" ? 4 : 0) + (v.official ? 2 : 0) + (v.iso_639_1 === "en" ? 1 : 0);
  usable.sort((a, b) =>
    rank(b) - rank(a) || String(b.published_at || "").localeCompare(String(a.published_at || "")));
  return cleanVideoId(usable[0].key);
}

const BROWSER_UA = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

/**
 * Can this video actually play, embedded, right now? Requires BOTH a playable
 * status and explicit embed permission. Anything we cannot positively confirm
 * is unusable — a missing trailer is a non-event, a dead player is a defect.
 */
export function isPlayableEmbed(watchPageHtml = "") {
  return /"playabilityStatus":\{"status":"OK"/.test(watchPageHtml)
    && /"playableInEmbed":true/.test(watchPageHtml);
}

/**
 * Has YouTube stopped answering honestly?
 *
 * After a couple of thousand requests it starts serving a consent wall with
 * `"status":"LOGIN_REQUIRED"` and no `playableInEmbed` at all. That page looks
 * exactly like an unplayable video to a naive check, so a long run would
 * quietly mark every remaining title dead. Throttled means UNKNOWN, not dead.
 */
export function isThrottled(watchPageHtml = "") {
  return /"status":"LOGIN_REQUIRED"/.test(watchPageHtml)
    || /consent\.youtube|unusual traffic|Before you continue/i.test(watchPageHtml);
}

/** true = playable, false = definitely not, null = could not tell (retry later). */
async function verify(videoId) {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: BROWSER_UA, signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    if (isThrottled(html)) return null;
    return isPlayableEmbed(html);
  } catch { return null; }
}

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) });
      if (res.status === 429) { await sleep(2000 * (i + 1)); continue; }
      if (!res.ok) return null;
      return await res.json();
    } catch { if (i === tries - 1) return null; await sleep(1000 * (i + 1)); }
  }
  return null;
}

/** imdb id -> youtube id via TMDB, for one title. */
async function tmdbTrailer(imdb, key, kind) {
  const found = await getJson(`https://api.themoviedb.org/3/find/${imdb}?external_source=imdb_id&api_key=${key}`);
  const hit = kind === "tv" ? found?.tv_results?.[0] : found?.movie_results?.[0];
  if (!hit?.id) return null;
  const videos = await getJson(`https://api.themoviedb.org/3/${kind}/${hit.id}/videos?api_key=${key}`);
  return pickTrailer(videos?.results || []);
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

/** Keyless fallback: imdb id -> youtube id from Wikidata, in batches. */
async function wikidataTrailers(imdbIds) {
  const out = new Map();
  for (let i = 0; i < imdbIds.length; i += BATCH) {
    const values = imdbIds.slice(i, i + BATCH).map((x) => `"${x}"`).join(" ");
    const rows = await sparql(
      `SELECT ?imdb ?ytid WHERE { VALUES ?imdb { ${values} } ?item wdt:P345 ?imdb . ?item wdt:P1651 ?ytid }`
    );
    for (const r of rows) {
      const id = cleanVideoId(r.ytid?.value);
      if (id && !out.has(r.imdb.value)) out.set(r.imdb.value, id);
    }
    await sleep(1200);
  }
  return out;
}

/** TVMaze knows each show's IMDb id; both sources are keyed on that. */
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
    const j = await getJson(`https://api.tvmaze.com/shows/${tvmazeId}`);
    const imdb = j?.externals?.imdb || null;
    (cache.imdb = cache.imdb || {})[s.id] = imdb;
    if (imdb) out.set(s.id, imdb);
    if (++fetched % 50 === 0) fs.writeFileSync(CACHE, JSON.stringify(cache));
    await sleep(180);
  }
  fs.writeFileSync(CACHE, JSON.stringify(cache));
  return out;
}

/**
 * Re-check every trailer already stored and drop the ones that no longer play.
 * Videos get pulled and regions change, so this is not a one-off.
 */
async function verifyExisting(cache) {
  cache.playable = cache.playable || {};
  cache.trailer = cache.trailer || {};
  for (const domainKey of DOMAINS) {
    const file = path.join(DATA, `${domainKey}.json`);
    const list = JSON.parse(fs.readFileSync(file, "utf8"));
    const ids = [...new Set(list.filter((i) => i.trailer).map((i) => i.trailer))];
    console.log(`${domainKey}: re-verifying ${ids.length} distinct video ids`);
    let done = 0, ok = 0;
    for (const id of ids) {
      if (cache.playable[id] === undefined || process.env.RECHECK) {
        const verdict = await verify(id);
        await sleep(300);
        if (verdict === null) {
          console.warn("  ! YouTube is refusing to answer; stopping so nothing is wrongly dropped.");
          break;
        }
        cache.playable[id] = verdict;
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
    // restore from disk every id just deleted — the enrichment guard working
    // exactly as designed, against us. This pass owns the whole file.
    fs.writeFileSync(file, JSON.stringify(list, null, 1) + "\n");
    console.log(`${domainKey}: dropped ${dropped} unplayable, ${list.filter((i) => i.trailer).length}/${list.length} keep a trailer`);
  }
}

async function main() {
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
  if (process.env.VERIFY) return verifyExisting(cache);

  const key = tmdbKey();
  console.log(key
    ? "source: TMDB (curated official trailers)"
    : "source: Wikidata P1651 — no TMDB_API_KEY set, expect ~9% usable");

  cache.trailer = cache.trailer || {};
  cache.playable = cache.playable || {};
  // Switching source invalidates the misses: a title Wikidata had nothing for
  // says nothing about whether TMDB has one.
  const sourceTag = key ? "tmdb" : "wikidata";
  if (cache.source !== sourceTag) {
    console.log(`source changed (${cache.source || "none"} -> ${sourceTag}); re-asking every title`);
    cache.trailer = {};
    cache.source = sourceTag;
  }

  for (const domainKey of DOMAINS) {
    const file = path.join(DATA, `${domainKey}.json`);
    const list = JSON.parse(fs.readFileSync(file, "utf8"));

    let restored = 0;
    for (const it of list) {
      if (cache.trailer[it.id]) { it.trailer = cache.trailer[it.id]; restored++; }
      else if (cache.trailer[it.id] === null) delete it.trailer;
    }
    if (restored) console.log(`${domainKey}: replayed ${restored} cached trailers`);

    const todo = list.filter((i) => !i.trailer && cache.trailer[i.id] === undefined);
    if (!todo.length) {
      fs.writeFileSync(file, JSON.stringify(list, null, 1) + "\n");
      console.log(`${domainKey}: nothing new`);
      continue;
    }

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
    console.log(`${domainKey}: ${imdbOf.size} of ${todo.length} have an IMDb id`);

    const kind = domainKey === "tv" ? "tv" : "movie";
    const byImdb = key ? null : await wikidataTrailers([...new Set(imdbOf.values())]);

    let hit = 0, none = 0, rejected = 0, unknown = 0, done = 0;
    for (const it of todo) {
      const imdb = imdbOf.get(it.id);
      if (!imdb) { cache.trailer[it.id] = null; continue; }
      const yt = key ? await tmdbTrailer(imdb, key, kind) : byImdb.get(imdb);
      if (!yt) { cache.trailer[it.id] = null; none++; }
      else {
        if (cache.playable[yt] === undefined) {
          const verdict = await verify(yt);
          await sleep(250);
          if (verdict === null) {
            // Throttled: stop rather than mark the rest of the catalogue dead.
            console.warn("  ! YouTube is refusing to answer (consent wall). Stopping;");
            console.warn("    re-run later to pick up where this left off.");
            unknown++;
            break;
          }
          cache.playable[yt] = verdict;
        }
        if (cache.playable[yt]) { it.trailer = yt; cache.trailer[it.id] = yt; hit++; }
        else { cache.trailer[it.id] = null; rejected++; }
      }
      if (++done % 25 === 0) {
        fs.writeFileSync(CACHE, JSON.stringify(cache));
        fs.writeFileSync(file, JSON.stringify(list, null, 1) + "\n");
        console.log(`  ${done}/${todo.length} · ${hit} playable, ${none} no trailer, ${rejected} unplayable`);
      }
      if (key) await sleep(60); // TMDB asks for reasonable use, not a hard cap
    }
    fs.writeFileSync(CACHE, JSON.stringify(cache));
    fs.writeFileSync(file, JSON.stringify(list, null, 1) + "\n");
    console.log(`${domainKey}: +${hit} playable (${none} had none, ${rejected} unplayable${unknown ? ", stopped early on throttling" : ""}) · ${list.filter((i) => i.trailer).length}/${list.length} total`);
  }
}

// Guard: importing this module for a syntax check must not start a crawl.
const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (runDirectly) main().catch((e) => { console.error(e); process.exit(1); });
