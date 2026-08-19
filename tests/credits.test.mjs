// Credits suite — keeps the attribution honest against the data it describes.
//
// Attribution is a licence CONDITION for TMDB, Wikipedia and Wikimedia, not a
// courtesy, and the failure mode is silent: prose written once and never checked
// against the catalogue it claims to describe. That already happened twice here.
// The TMDB line read "Official trailers" while TMDB was also behind most film
// synopses, and IMDb was credited for "Film ratings and directors" — which was
// true, and was exactly the licence problem, since their datasets are offered for
// personal and non-commercial use.
//
// So these tests derive what the credits SHOULD say from src/data and fail when
// the copy and the data disagree.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SOURCE_CREDITS, CREDITS_SUMMARY, TMDB_DISCLAIMER, TMDB_LOGO } from "../src/engine/credits.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "src", "data");

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) pass++; else { fail++; console.log(`FAIL  ${name}${extra ? "  " + extra : ""}`); }
};

const load = (f) => {
  const r = JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));
  return Array.isArray(r) ? r : (r.items || []);
};
const DOMAIN_FILES = ["books.json", "movies.json", "tv.json", "music.json", "restaurants.json"];
const named = new Set(SOURCE_CREDITS.map((c) => c.name));
const creditFor = (n) => SOURCE_CREDITS.find((c) => c.name === n);

// ---- 1. TMDB's disclaimer must be verbatim ----
// Their terms specify the wording. Paraphrasing it is a breach, and it is the one
// string in this file that must never be "improved".
check("TMDB disclaimer is exactly the required sentence",
  TMDB_DISCLAIMER === "This product uses the TMDB API but is not endorsed or certified by TMDB.",
  JSON.stringify(TMDB_DISCLAIMER));
check("the TMDB credit carries the disclaimer", creditFor("TMDB")?.note === TMDB_DISCLAIMER);
check("nothing in the credits implies endorsement",
  !/endorse[sd]? by|official partner|in partnership/i.test(
    [CREDITS_SUMMARY, ...SOURCE_CREDITS.map((c) => `${c.provides} ${c.note || ""}`)].join(" ")
      .replace(TMDB_DISCLAIMER, "")));

// ---- 2. the logo their guidance asks for must actually ship ----
{
  const svg = path.join(ROOT, "public", "tmdb-logo.svg");
  const png = path.join(ROOT, "mobile", "assets", "tmdb-logo.png");
  check("TMDB entry is flagged to render the logo", creditFor("TMDB")?.logo === true);
  check("web logo ships (public/tmdb-logo.svg)", fs.existsSync(svg));
  check("native logo ships (mobile/assets/tmdb-logo.png)", fs.existsSync(png));

  if (fs.existsSync(svg)) {
    const body = fs.readFileSync(svg, "utf8");
    const vb = body.match(/viewBox="([\d.\s]+)"/)?.[1]?.trim().split(/\s+/).map(Number);
    check("the SVG is a real viewBox'd mark", Array.isArray(vb) && vb.length === 4);
    if (vb) {
      // Their guidelines forbid distorting the mark, so the aspect we lay out with
      // must be the aspect of the file itself.
      const real = vb[2] / vb[3];
      check("TMDB_LOGO.aspect matches the artwork", Math.abs(real - TMDB_LOGO.aspect) < 0.01,
        `file ${real.toFixed(3)} vs declared ${TMDB_LOGO.aspect.toFixed(3)}`);
    }
    check("the logo is unmodified TMDB artwork (brand gradient intact)",
      /#90cea1/i.test(body) && /#00b3e5/i.test(body));
  }
}

// ---- 3. every source the DATA names must be credited ----
// A rating labelled with a source nobody credits is an undisclosed dependency.
{
  const sources = new Set();
  for (const f of DOMAIN_FILES) for (const item of load(f)) {
    if (item.rating?.source) sources.add(item.rating.source);
  }
  check("found rating sources to check", sources.size > 0, [...sources].join(", "));
  for (const s of sources) {
    check(`"${s}" supplies ratings and is credited`, named.has(s),
      `data uses ${s} but SOURCE_CREDITS does not list it`);
  }
}

// ---- 4. a source credited for ratings must actually supply some ----
// This is the check that catches the IMDb migration going stale in either
// direction: crediting them after we stopped using them, or using TMDB ratings
// while the credit line still says trailers only.
{
  const countBySource = {};
  for (const f of DOMAIN_FILES) for (const item of load(f)) {
    const s = item.rating?.source;
    if (s) countBySource[s] = (countBySource[s] || 0) + 1;
  }
  for (const c of SOURCE_CREDITS) {
    if (!/\bratings?\b/i.test(c.provides)) continue;
    check(`${c.name} is credited for ratings and provides some`, (countBySource[c.name] || 0) > 0,
      `credit says "${c.provides}" but 0 items carry rating.source = ${c.name}`);
  }

  // The converse, narrowly. An earlier version of this test demanded the literal
  // word "ratings" from every source supplying more than 50 — which failed
  // "Charts and 30-second previews" and "Critical reception and overviews", both
  // accurate descriptions in their own terms. Policing vocabulary produces false
  // failures, and a guard that cries wolf gets switched off.
  //
  // So this is asserted only for TMDB, where attribution is a licence condition
  // and where the understatement actually happened.
  const tmdbRatings = countBySource["TMDB"] || 0;
  if (tmdbRatings > 0) {
    check("TMDB supplies ratings, so its credit line says so",
      /\bratings?\b/i.test(creditFor("TMDB").provides),
      `${tmdbRatings} items are TMDB-rated but the line reads "${creditFor("TMDB").provides}"`);
  }
}

// ---- 5. IMDb: dataset use must stay gone ----
// Their datasets are licensed for personal, non-commercial use. Ratings and
// directors were migrated to TMDB; a future fetch script must not quietly
// reintroduce them.
{
  const movies = load("movies.json");
  const imdbRated = movies.filter((m) => m.rating?.source === "IMDb").length;
  check("no film rating comes from IMDb's datasets", imdbRated === 0,
    `${imdbRated} of ${movies.length} still IMDb-rated — see scripts/patch-tmdb-credits.mjs`);
  const c = creditFor("IMDb");
  if (c) {
    check("the IMDb credit claims only linking, not data",
      !/\bratings?\b|\bdirectors?\b|dataset/i.test(c.provides), `reads "${c.provides}"`);
  }
}

// ---- 5b. no blurb may credit a source that did not supply that item's rating ----
// The IMDb migration left 49 film blurbs reading "rated 7.9 by 475k IMDb voters"
// while the rating on the record came from TMDB. Prose that names a source is
// attribution, and it has to match the data sitting next to it.
{
  const KNOWN = ["IMDb", "TMDB", "TVMaze", "Deezer", "Open Library", "Goodreads", "Rotten Tomatoes", "Metacritic"];
  const offenders = [];
  for (const f of DOMAIN_FILES) {
    for (const item of load(f)) {
      const blurb = item.blurb || "";
      // Only flag a source named in the same breath as a rating claim.
      if (!/\brated\b|\bvoters\b|\bratings?\b|\bscore\b/i.test(blurb)) continue;
      for (const k of KNOWN) {
        if (!new RegExp(`\\b${k.replace(" ", "\\s")}\\b`, "i").test(blurb)) continue;
        if (item.rating?.source !== k) offenders.push(`${f}: "${item.title}" blurb cites ${k}, rating.source is ${item.rating?.source}`);
      }
    }
  }
  check("no blurb credits a source that did not supply its rating",
    offenders.length === 0, offenders.slice(0, 4).join(" | ") + (offenders.length > 4 ? ` (+${offenders.length - 4})` : ""));
}

// ---- 6. the disclaimer must be rendered by both clients ----
// Centralising the wording is pointless if a screen stops importing it.
for (const f of ["src/ui/ItemSheet.jsx", "mobile/src/screens/ItemSheet.js"]) {
  const body = fs.readFileSync(path.join(ROOT, f), "utf8");
  check(`${path.basename(f)} renders TMDB_DISCLAIMER`, body.includes("TMDB_DISCLAIMER"));
}
for (const f of ["src/ui/Profile.jsx", "mobile/src/screens/Profile.js"]) {
  const body = fs.readFileSync(path.join(ROOT, f), "utf8");
  check(`${path.basename(f)} renders the credits list`, body.includes("SOURCE_CREDITS"));
  check(`${path.basename(f)} renders the TMDB logo`, body.includes("TMDB_LOGO"));
}

console.log(`\n=== credits: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
