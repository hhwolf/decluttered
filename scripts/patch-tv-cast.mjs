// ============================================================================
// patch-tv-cast.mjs — add principal cast to src/data/tv.json from TVMaze.
//
// After "is it any good", "who's in it" is the strongest appeal signal a show
// has; it is why trailers lead with faces. We already store a TVMaze link for
// every show, so the cast endpoint is one keyless call each.
//
// Only the top-billed few are kept. TVMaze returns the full company — 42 people
// for Game of Thrones — and a card that lists 42 names has not helped anyone
// decide anything.
//
//   node scripts/patch-tv-cast.mjs
//   LIMIT=50 node scripts/patch-tv-cast.mjs      # short run, for checking
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getJSON, sleep, writePretty } from "./lib/derive.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, "../src/data/tv.json");
const LIMIT = process.env.LIMIT ? +process.env.LIMIT : null;
const MAX_CAST = 4;

/** "https://www.tvmaze.com/shows/82/game-of-thrones" -> "82" */
export function showIdFromLink(link = "") {
  const m = String(link).match(/\/shows\/(\d+)/);
  return m ? m[1] : null;
}

/**
 * Top-billed names, de-duplicated. An actor playing two characters appears
 * twice in TVMaze's list, and "Tatiana Maslany, Tatiana Maslany" reads as a
 * bug rather than as the joke it actually is.
 */
export function principalCast(entries = [], max = MAX_CAST) {
  const names = [];
  for (const e of entries) {
    const n = e?.person?.name;
    if (!n || names.includes(n)) continue;
    names.push(n);
    if (names.length >= max) break;
  }
  return names;
}

async function main() {
  const list = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const todo = list.filter((s) => !s.cast && showIdFromLink(s.links?.tvmaze));
  const targets = LIMIT ? todo.slice(0, LIMIT) : todo;
  console.log(`tv cast: ${targets.length} to fetch (${list.length - todo.length} already done)`);

  let hit = 0, none = 0, failed = 0, done = 0;
  for (const show of targets) {
    const id = showIdFromLink(show.links.tvmaze);
    try {
      const entries = await getJSON(`https://api.tvmaze.com/shows/${id}/cast`, {
        signal: AbortSignal.timeout(15000),
      });
      const names = principalCast(entries);
      // An empty list is a real answer (documentaries, panel shows). Record it
      // as [] so a re-run doesn't ask again forever.
      show.cast = names;
      names.length ? hit++ : none++;
    } catch (e) {
      failed++;
      if (failed <= 5) console.warn(`  ! ${show.title}: ${e.message}`);
    }
    if (++done % 25 === 0) {
      writePretty(fs, OUT, list);
      console.log(`  ${done}/${targets.length} · ${hit} with cast, ${none} none, ${failed} failed`);
    }
    await sleep(220); // TVMaze asks for <20 calls per 10s
  }

  writePretty(fs, OUT, list);
  const withCast = list.filter((s) => s.cast?.length).length;
  console.log(`tv cast: ${withCast}/${list.length} shows have principal cast (${failed} failed)`);
}

// Guard: importing this module for a syntax check must not start a crawl.
const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (runDirectly) main().catch((e) => { console.error(e); process.exit(1); });
