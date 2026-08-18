// ============================================================================
// ensure-optional-data.mjs — create the gitignored data files as {} if absent.
//
// Two enrichment files cannot be committed. Google's and Yelp's terms license
// their review text and star ratings for DISPLAY, not redistribution, so
// src/data/google-reviews.json and live-ratings.json are gitignored and a
// deployment refreshes them itself.
//
// But Metro and Vite resolve `import x from "./data/google-reviews.json"`
// STATICALLY, at bundle time. A machine holding only git-tracked files — every
// CI runner, every fresh clone, and every EAS Build worker — has no such file,
// and the bundle dies with:
//
//     Unable to resolve module ./data/google-reviews.json from src/domains.js
//
// which on EAS surfaces only as "Unknown error. See logs of the Bundle
// JavaScript build phase", giving no hint that the cause is a file that exists
// perfectly well on the developer's disk.
//
// domains.js was always written to tolerate `{}` — it reads these with `?.` and
// falls back to the committed catalogue. The empty file just has to EXIST. So
// this script creates it when missing and never, ever overwrites real content.
//
// Run automatically before builds, tests and EAS installs. Safe to run twice.
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "data");

/**
 * Files that are imported statically but deliberately not committed. Anything
 * added here must be read defensively by its consumer, because `{}` is exactly
 * what a fresh clone will get.
 */
export const OPTIONAL_DATA = [
  {
    file: "google-reviews.json",
    empty: "{}\n",
    why: "Google Places review text — licensed for display, not redistribution",
    refresh: "npm run fetch:reception",
  },
  {
    file: "live-ratings.json",
    empty: "{}\n",
    why: "Live Google/Yelp star ratings and price levels — same licence",
    refresh: "npm run fetch:restaurants:ratings",
  },
];

export function ensureOptionalData({ quiet = false } = {}) {
  const created = [];
  fs.mkdirSync(DATA, { recursive: true });
  for (const { file, empty, refresh } of OPTIONAL_DATA) {
    const full = path.join(DATA, file);
    if (fs.existsSync(full)) continue;
    fs.writeFileSync(full, empty);
    created.push(file);
    if (!quiet) console.log(`optional data: created empty src/data/${file} (refresh with ${refresh})`);
  }
  return created;
}

// Only act when run directly, so tests can import OPTIONAL_DATA without writing.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const created = ensureOptionalData();
  if (!created.length) console.log("optional data: all present, nothing to do");
}
