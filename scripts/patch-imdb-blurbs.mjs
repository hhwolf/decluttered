// ============================================================================
// patch-imdb-blurbs.mjs — replace blurbs that credit IMDb for a TMDB rating.
//
// fetch-movies.mjs generates a fallback blurb when a film has no real synopsis:
//
//   "Adventure / Family — 1982, rated 7.9 by 475k IMDb voters."
//
// After patch-tmdb-credits.mjs moved every rating to TMDB, 49 of those sentences
// were left naming IMDb and quoting a number no longer on the record. That is
// worse than a stale string: it attributes a rating to a source that did not
// supply it, which is the one thing an attribution must never do.
//
// Preference order for the replacement:
//   1. TMDB's own synopsis — real prose, correctly attributed, and better than a
//      stat line for deciding whether to watch something.
//   2. Failing that, the same stat line rebuilt from the rating actually on the
//      record, naming TMDB.
//
// Usage:
//   node scripts/patch-imdb-blurbs.mjs
//   DRY=1 node scripts/patch-imdb-blurbs.mjs
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmdbKey, tconstFromLink } from "./patch-tmdb-credits.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, "../src/data/movies.json");
const DRY = process.env.DRY === "1";
const MAX_CHARS = 200;

/** Does this blurb name IMDb? Those are the only ones we touch. */
export function creditsImdb(blurb = "") {
  return /\bIMDb\b/i.test(blurb);
}

/** Trim to whole sentences within the budget, so nothing ends mid-clause. */
export function fitSentences(text = "", max = MAX_CHARS) {
  const clean = String(text).replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (clean.length <= max) return clean;
  let out = "";
  for (const s of clean.split(/(?<=[.!?])\s+/)) {
    if (!out) { out = s; if (out.length > max) break; continue; }
    if ((out + " " + s).length > max) break;
    out += " " + s;
  }
  return (out || clean.slice(0, max)).trim();
}

/** The fallback stat line, naming the source that actually supplied the rating. */
export function statLine(item) {
  const g = (item.genres || []).join(" / ");
  const r = item.rating;
  const k = r?.count >= 1000 ? `${Math.round(r.count / 1000)}k` : r?.count;
  const who = r?.source || "TMDB";
  return `${g}${g ? " — " : ""}${item.year || ""}${item.year ? ", " : ""}rated ${r?.value} by ${k} ${who} voters.`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overviewFor(tconst, key) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const find = await fetch(`https://api.themoviedb.org/3/find/${tconst}?external_source=imdb_id&api_key=${key}`,
      { signal: ctrl.signal });
    if (!find.ok) return null;
    const hit = ((await find.json()).movie_results || [])[0];
    return hit?.overview || null;
  } catch { return null; } finally { clearTimeout(timer); }
}

async function main() {
  const key = tmdbKey();
  if (!key) { console.error("No TMDB_API_KEY. Nothing written."); process.exit(1); }

  const list = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const targets = list.filter((m) => creditsImdb(m.blurb));
  console.log(`${targets.length} blurb(s) credit IMDb${DRY ? " (DRY)" : ""}`);

  let fromSynopsis = 0, fromStat = 0;
  for (const m of targets) {
    const tt = tconstFromLink(m.links?.imdb);
    const overview = tt ? await overviewFor(tt, key) : null;
    const next = fitSentences(overview) || statLine(m);
    if (overview && fitSentences(overview)) fromSynopsis++; else fromStat++;
    if (!DRY) m.blurb = next;
    await sleep(60);
  }

  if (!DRY) fs.writeFileSync(OUT, JSON.stringify(list, null, 1) + "\n");

  const left = list.filter((m) => creditsImdb(m.blurb)).length;
  console.log(`replaced with a TMDB synopsis : ${fromSynopsis}`);
  console.log(`replaced with a TMDB stat line: ${fromStat}`);
  console.log(`blurbs still naming IMDb      : ${DRY ? targets.length : left}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
