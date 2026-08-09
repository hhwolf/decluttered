// ============================================================================
// patch-movie-directors.mjs — add directors to src/data/movies.json.
//
// TV now carries principal cast and film carries nobody, which is backwards:
// a director is often the single strongest reason a person picks a film. IMDb
// publishes the mapping in its bulk exports, keylessly:
//
//   title.crew.tsv.gz   tconst -> director nconsts   (~85 MB)
//   name.basics.tsv.gz  nconst -> primaryName        (~280 MB)
//
// Both are streamed and filtered on the fly — first to the ~1,800 tconsts we
// actually hold, then to only the nconsts those name — so peak memory stays in
// the low megabytes rather than holding 14 million people in a Map.
//
//   node scripts/patch-movie-directors.mjs
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import readline from "node:readline";
import { Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sleep, writePretty } from "./lib/derive.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, "../src/data/movies.json");
const CACHE = path.join(DIR, ".cache/movie-directors.json");
const MAX_DIRECTORS = 2;

/** "https://www.imdb.com/title/tt0111161/" -> "tt0111161" */
export function tconstFromLink(link = "") {
  return String(link).match(/\/title\/(tt\d+)/)?.[1] || null;
}

/**
 * IMDb writes "\N" for null and comma-joins multiple ids. Two directors is the
 * useful ceiling: the Coens and the Wachowskis are a reason to watch, but a
 * six-name anthology credit is a list, not a reason.
 */
export function parseDirectors(field = "", max = MAX_DIRECTORS) {
  if (!field || field === "\\N") return [];
  return field.split(",").map((s) => s.trim()).filter((s) => /^nm\d+$/.test(s)).slice(0, max);
}

async function streamLines(url, onLine, tries = 4) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} for ${url}`);
      const body = Readable.fromWeb(res.body);
      const gunzip = zlib.createGunzip();
      const failed = new Promise((_, reject) => {
        body.on("error", reject);
        gunzip.on("error", reject);
      });
      const rl = readline.createInterface({ input: body.pipe(gunzip), crlfDelay: Infinity });
      await Promise.race([(async () => { for await (const line of rl) onLine(line); })(), failed]);
      return;
    } catch (e) {
      if (attempt === tries) throw e;
      console.warn(`  ! transfer failed (${e.message}) — retry ${attempt}/${tries - 1}`);
      await sleep(3000 * attempt);
    }
  }
}

async function main() {
  const list = JSON.parse(fs.readFileSync(OUT, "utf8"));
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};

  // Replaying the cache is free, so it happens before deciding to download.
  let restored = 0;
  for (const m of list) {
    if (cache[m.id]) { m.directors = cache[m.id]; restored++; }
  }
  if (restored) console.log(`replayed ${restored} cached lookups`);

  const want = new Map(); // tconst -> item
  for (const m of list) {
    if (m.directors) continue;
    const tt = tconstFromLink(m.links?.imdb);
    if (tt) want.set(tt, m);
  }
  if (!want.size) {
    writePretty(fs, OUT, list);
    console.log("nothing left to fetch");
    return;
  }
  console.log(`directors: ${want.size} films to resolve`);

  // Pass 1: tconst -> director nconsts, keeping only films we hold.
  const crew = new Map();   // tconst -> [nconst]
  const needed = new Set(); // every nconst we must name
  await streamLines("https://datasets.imdbws.com/title.crew.tsv.gz", (line) => {
    const tab = line.indexOf("\t");
    const tt = line.slice(0, tab);
    if (!want.has(tt)) return;
    const directors = parseDirectors(line.slice(tab + 1, line.indexOf("\t", tab + 1)));
    if (!directors.length) return;
    crew.set(tt, directors);
    directors.forEach((n) => needed.add(n));
  });
  console.log(`  crew: ${crew.size} films credited, ${needed.size} people to name`);

  // Pass 2: nconst -> name, keeping only the people pass 1 asked for.
  const names = new Map();
  await streamLines("https://datasets.imdbws.com/name.basics.tsv.gz", (line) => {
    const tab = line.indexOf("\t");
    const nm = line.slice(0, tab);
    if (!needed.has(nm)) return;
    names.set(nm, line.slice(tab + 1, line.indexOf("\t", tab + 1)));
  });
  console.log(`  names: resolved ${names.size}/${needed.size}`);

  let hit = 0;
  for (const [tt, item] of want) {
    const resolved = (crew.get(tt) || []).map((n) => names.get(n)).filter((n) => n && n !== "\\N");
    if (!resolved.length) continue;
    item.directors = resolved;
    cache[item.id] = resolved;
    hit++;
  }
  fs.writeFileSync(CACHE, JSON.stringify(cache));
  writePretty(fs, OUT, list);
  const total = list.filter((m) => m.directors?.length).length;
  console.log(`directors: +${hit} this run, ${total}/${list.length} films credited`);
}

// Guard: importing this module for a syntax check must not start a 365 MB download.
const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (runDirectly) main().catch((e) => { console.error(e); process.exit(1); });
