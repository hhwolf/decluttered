// ============================================================================
// patch-tv-detail.mjs — add the fact people actually decide a show on.
//
// The catalogue said "60 min eps" and nothing else, so the deck could not
// answer the first question anyone asks before starting a series: how much of
// my life is this? Seasons, episode count and whether it has finished are all
// in TVMaze already, keyless and fast — two extra calls per show.
//
// Idempotent and resumable: cached per show id, only fetches what is missing.
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, "../src/data/tv.json");
const CACHE = path.join(DIR, ".cache/tv-detail.json");
const UA = { "User-Agent": "decluttered-seed/0.5 (personal project; contact via github hhwolf)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(12000) });
      if (res.ok) return await res.json();
      if (res.status === 404) return null;
    } catch { /* retry */ }
    await sleep(600 * (i + 1));
  }
  return null;
}

async function detailFor(tvmazeId) {
  const show = await api(`https://api.tvmaze.com/shows/${tvmazeId}`);
  if (!show) return null;
  const seasonsRaw = await api(`https://api.tvmaze.com/shows/${tvmazeId}/seasons`);
  // episodeOrder is null for a season still airing; fall back to counting.
  const seasons = Array.isArray(seasonsRaw) ? seasonsRaw.length : null;
  const episodes = Array.isArray(seasonsRaw)
    ? seasonsRaw.reduce((a, s) => a + (s.episodeOrder || 0), 0) || null
    : null;
  return {
    seasons,
    episodes,
    status: show.status || null,          // "Running" | "Ended" | "To Be Determined"
    ended: show.ended ? +show.ended.slice(0, 4) : null,
    runtime: show.averageRuntime || null,
  };
}

async function main() {
  const list = JSON.parse(fs.readFileSync(OUT, "utf8"));
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};

  const todo = list.filter((s) => cache[s.id] === undefined);
  console.log(`${list.length} shows, ${todo.length} needing detail`);
  let done = 0;

  for (const show of list) {
    if (cache[show.id] === undefined) {
      const tvmazeId = String(show.id).replace(/^tv_/, "");
      cache[show.id] = await detailFor(tvmazeId);
      if (++done % 25 === 0) {
        fs.writeFileSync(CACHE, JSON.stringify(cache));
        console.log(`  ${done}/${todo.length}`);
      }
      await sleep(120);
    }
    const d = cache[show.id];
    if (!d) continue;
    if (d.seasons) show.seasons = d.seasons;
    if (d.episodes) show.episodes = d.episodes;
    if (d.status) show.status = d.status;
    if (d.ended) show.endedYear = d.ended;
    // A runtime alone was never the useful part; lead with the commitment.
    const parts = [];
    if (d.seasons) parts.push(`${d.seasons} season${d.seasons === 1 ? "" : "s"}`);
    if (d.episodes) parts.push(`${d.episodes} eps`);
    if (d.runtime) parts.push(`${d.runtime} min`);
    if (parts.length) show.meta = parts.join(" · ");
  }

  fs.writeFileSync(CACHE, JSON.stringify(cache));
  fs.writeFileSync(OUT, JSON.stringify(list, null, 1) + "\n");
  const withSeasons = list.filter((s) => s.seasons).length;
  const ended = list.filter((s) => s.status === "Ended").length;
  console.log(`done: ${withSeasons}/${list.length} have season counts · ${ended} finished, ${list.length - ended} still going`);
}

const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (runDirectly) main().catch((e) => { console.error(e); process.exit(1); });
