// ============================================================================
// patch-tmdb-credits.mjs — move film ratings and directors from IMDb to TMDB.
//
// WHY. IMDb's public datasets are offered for "personal and non-commercial use".
// The app displayed IMDb ratings for all 1,800 films and IMDb-sourced directors,
// and App Review asks about rights to third-party catalogues (Guideline 5.2).
// TMDB permits app use under terms we already satisfy — their disclaimer is shown
// beside every trailer and in the credits panel — so moving these two fields
// removes the conflict without adding a source we have to disclose.
//
// This is a PATCH, not a refetch. Every id, blurb, poster, trailer, Wikipedia
// overview and reception quote stays exactly as it is; only `rating` and
// `directors` change. Rebuilding the catalogue is what previously deleted 653
// enriched records, and there is no reason to risk it for two fields.
//
// HOW. Every film already carries links.imdb, and TMDB resolves an IMDb id
// directly:
//
//   /find/{tt}?external_source=imdb_id      -> TMDB id
//   /movie/{id}?append_to_response=credits  -> vote_average, vote_count, crew
//
// Films TMDB cannot resolve, or that have too few votes to be meaningful, KEEP
// their IMDb values and are reported at the end. A silent partial migration would
// be worse than none: it would leave the licence question open while looking
// closed.
//
// Usage:
//   node scripts/patch-tmdb-credits.mjs            # migrate
//   DRY=1 node scripts/patch-tmdb-credits.mjs      # report, change nothing
//   LIMIT=25 node scripts/patch-tmdb-credits.mjs   # trial run
//
// Resumable: every resolution is cached, so a re-run costs no requests.
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, "../src/data/movies.json");
const CACHE = path.join(DIR, ".cache/tmdb-credits.json");
const DRY = process.env.DRY === "1";
const LIMIT = Number(process.env.LIMIT || 0);
const MAX_DIRECTORS = 2;
/** Below this, TMDB's average is noise and IMDb's is the better number. */
const MIN_VOTES = 50;

/** Read TMDB_API_KEY from the environment, or from the gitignored .env. */
export function tmdbKey() {
  if (process.env.TMDB_API_KEY) return process.env.TMDB_API_KEY.trim();
  try {
    const env = fs.readFileSync(path.join(DIR, "../.env"), "utf8");
    return env.match(/^TMDB_API_KEY\s*=\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, "") || null;
  } catch { return null; }
}

/** "https://www.imdb.com/title/tt0111161/" -> "tt0111161" */
export function tconstFromLink(link = "") {
  return String(link).match(/\/title\/(tt\d+)/)?.[1] || null;
}

/**
 * TMDB's vote_average has three decimals; a rating shown to one decimal is as
 * much precision as the UI ever displays, and rounding here keeps the committed
 * catalogue stable across refreshes.
 */
export function normaliseRating(voteAverage, voteCount) {
  if (typeof voteAverage !== "number" || !voteCount || voteCount < MIN_VOTES) return null;
  return { value: Math.round(voteAverage * 10) / 10, count: voteCount, scale: 10, source: "TMDB" };
}

/** Directors from a TMDB credits payload, in billing order, capped. */
export function directorsFrom(credits) {
  return (credits?.crew || [])
    .filter((c) => c.job === "Director" && c.name)
    .map((c) => c.name)
    .slice(0, MAX_DIRECTORS);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (res.status === 429) return { retry: true };
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; } finally { clearTimeout(timer); }
}

/** Resolve one film: IMDb id -> { tmdbId, rating, directors }. */
async function resolve(tconst, key) {
  const found = await getJson(`https://api.themoviedb.org/3/find/${tconst}?external_source=imdb_id&api_key=${key}`);
  if (found?.retry) return { retry: true };
  const hit = (found?.movie_results || [])[0];
  if (!hit?.id) return null;

  const full = await getJson(`https://api.themoviedb.org/3/movie/${hit.id}?append_to_response=credits&api_key=${key}`);
  if (full?.retry) return { retry: true };
  if (!full) return null;

  return {
    tmdbId: hit.id,
    rating: normaliseRating(full.vote_average, full.vote_count),
    directors: directorsFrom(full.credits),
  };
}

async function main() {
  const key = tmdbKey();
  if (!key) {
    console.error("No TMDB_API_KEY (env or .env). Nothing written.");
    process.exit(1);
  }

  const list = JSON.parse(fs.readFileSync(OUT, "utf8"));
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};

  const before = list.filter((m) => m.rating?.source === "IMDb").length;
  console.log(`${list.length} films, ${before} currently rated by IMDb${DRY ? " (DRY: nothing will be written)" : ""}`);

  let migrated = 0, ratingKept = 0, unresolved = 0, fetched = 0, dirChanged = 0;
  const stuck = [];
  const todo = LIMIT ? list.slice(0, LIMIT) : list;

  for (const m of todo) {
    const tt = tconstFromLink(m.links?.imdb);
    if (!tt) { unresolved++; stuck.push(`${m.title} (no imdb link)`); continue; }

    let info = cache[tt];
    if (info === undefined) {
      let attempt = await resolve(tt, key);
      if (attempt?.retry) { await sleep(2000); attempt = await resolve(tt, key); }
      info = attempt && !attempt.retry ? attempt : null;
      cache[tt] = info;
      fetched++;
      if (fetched % 50 === 0) {
        fs.writeFileSync(CACHE, JSON.stringify(cache));
        console.log(`  ...${fetched} resolved`);
      }
      await sleep(60); // polite; TMDB allows far more
    }

    if (!info) { unresolved++; stuck.push(`${m.title} (${tt}: no TMDB match)`); continue; }

    if (info.rating) {
      if (!DRY) m.rating = info.rating;
      migrated++;
    } else {
      // Keep IMDb rather than show a number nobody voted on. Reported below,
      // because these are exactly the records the licence question still touches.
      ratingKept++;
      stuck.push(`${m.title} (${tt}: TMDB has <${MIN_VOTES} votes)`);
    }

    if (info.directors?.length) {
      const changed = JSON.stringify(info.directors) !== JSON.stringify(m.directors || []);
      if (!DRY) m.directors = info.directors;
      if (changed) dirChanged++;
    }
  }

  fs.writeFileSync(CACHE, JSON.stringify(cache));

  if (!DRY) {
    // NOT writePretty: `directors` is on its enrichment preserve list, and we are
    // deliberately replacing that field rather than backfilling it.
    fs.writeFileSync(OUT, JSON.stringify(list, null, 1) + "\n");
  }

  const after = list.filter((m) => m.rating?.source === "IMDb").length;
  console.log(`\nratings moved to TMDB : ${migrated}`);
  console.log(`ratings left on IMDb  : ${DRY ? ratingKept + unresolved : after}`);
  console.log(`director lists changed: ${dirChanged}`);
  console.log(`requests made         : ${fetched * 2}`);
  if (stuck.length) {
    console.log(`\n${stuck.length} film(s) still on IMDb data:`);
    stuck.slice(0, 15).forEach((s) => console.log(`  - ${s}`));
    if (stuck.length > 15) console.log(`  ...and ${stuck.length - 15} more`);
  }
  if (!DRY && after === 0) console.log("\nNo film rating is IMDb-sourced any more.");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
