// ============================================================================
// patch-truncated-blurbs.mjs — repair blurbs that were cut mid-sentence.
//
// The old sentence splitter broke on any period followed by a space, so a
// title containing "Dr.", "Jr." or "U.S." lost everything after it. One film's
// entire blurb read "Fantastic Mr." The splitter is fixed in lib/reception.mjs;
// this repairs the rows already written with the broken one.
//
// Re-cuts from the stored `overview` where we have one, and only asks
// Wikipedia for the rest.
//
//   node scripts/patch-truncated-blurbs.mjs
//   DRY=1 node scripts/patch-truncated-blurbs.mjs    # report, change nothing
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { splitSentences } from "./lib/reception.mjs";
import { sleep, writePretty } from "./lib/derive.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(DIR, "../src/data");
const UA = { "User-Agent": "decluttered-seed/0.5 (personal project; contact via github hhwolf)" };
const DRY = !!process.env.DRY;
const FILES = ["movies.json", "books.json", "tv.json", "restaurants.json", "music.json"];

// Honorifics that MUST be followed by a name — a blurb ending here was cut.
// Deliberately excludes Jr., Sr., Ltd., Inc., Co., U.S. and D.C., which all end
// real sentences: "...starring Robert Downey Jr." and "Produced by Lucasfilm
// Ltd." are complete, and "repairing" them replaces good prose with different
// prose.
const DANGLING = /\b(Mr|Mrs|Ms|Dr|Prof|St|Mt|Lt|Sgt|Capt|Col|Gen|Rev|Sen|Gov|Rep)\.$/;

/**
 * A blurb is broken if its last sentence never finished: it stops on an
 * honorific, or it has no terminal punctuation at all.
 */
export function isTruncated(blurb = "") {
  const t = blurb.trim();
  if (!t) return false;
  if (DANGLING.test(t)) return true;
  return !/[.!?…"')\]]$/.test(t);
}

/** Whole sentences from `text` up to a character budget, abbreviation-safe. */
export function recut(text = "", maxChars = 240) {
  const clean = text.replace(/\s*\n+\s*/g, " ").replace(/\[\d+\]/g, "").replace(/\s{2,}/g, " ").trim();
  let out = "";
  for (const s of splitSentences(clean)) {
    const next = out ? out + " " + s : s;
    if (next.length > maxChars) break;
    out = next;
  }
  return out.trim();
}

async function wikiSummary(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`;
  try {
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const j = await res.json();
    return j.extract || null;
  } catch { return null; }
}

async function main() {
  let totalFixed = 0, totalSkipped = 0;
  for (const file of FILES) {
    const full = path.join(DATA, file);
    const list = JSON.parse(fs.readFileSync(full, "utf8"));
    const broken = list.filter((i) => isTruncated(i.blurb));
    if (!broken.length) { console.log(`${file}: none truncated`); continue; }
    console.log(`${file}: ${broken.length} truncated`);

    let fixed = 0, skipped = 0;
    for (const item of broken) {
      // Prefer text we already hold — no request, and it's the same source.
      let source = item.overview && item.overview.length > item.blurb.length ? item.overview : null;
      if (!source && !DRY) {
        source = await wikiSummary(item.title);
        await sleep(300);
      }
      const better = source ? recut(source) : "";
      // Only replace when the result is genuinely a complete, longer sentence.
      if (better && better.length > item.blurb.trim().length && !isTruncated(better)) {
        console.log(`  ✓ ${item.title}: "${item.blurb.slice(-40)}" → "${better.slice(-50)}"`);
        if (!DRY) item.blurb = better;
        fixed++;
      } else {
        // Nothing better available: trim back to the last complete sentence
        // rather than leaving a dangling "Fantastic Mr."
        const whole = recut(item.blurb, item.blurb.length).replace(/\s+\S*\.$/, "").trim();
        const trimmed = splitSentences(item.blurb).slice(0, -1).join(" ").trim();
        const fallback = trimmed || whole;
        // "Dr. Seuss' Horton Hears a Who!" is a complete sentence and also just
        // the title — trimming there is technically correct and useless. A
        // dangling clause still tells the reader more than a bare title does,
        // so below this length we leave the original alone.
        if (fallback && fallback.length >= 60 && !isTruncated(fallback)) {
          console.log(`  ~ ${item.title}: trimmed to last whole sentence`);
          if (!DRY) item.blurb = fallback;
          fixed++;
        } else { console.log(`  ! ${item.title}: left as-is (nothing better)`); skipped++; }
      }
    }
    if (!DRY && fixed) writePretty(fs, full, list);
    console.log(`${file}: ${fixed} repaired, ${skipped} left`);
    totalFixed += fixed; totalSkipped += skipped;
  }
  console.log(`${DRY ? "[dry] " : ""}total: ${totalFixed} repaired, ${totalSkipped} left`);
}

// Guard: importing this module for a syntax check must not start a crawl.
const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (runDirectly) main().catch((e) => { console.error(e); process.exit(1); });
