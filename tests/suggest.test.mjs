// Suggestion-engine suite — verifies each mechanism actually does what its
// row label claims, on the real catalogues, for every domain.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildInitialProfile, scoreItem } from "../src/engine/engine.mjs";
import { buildSuggestionRows, ratingFrac, GOAL_KEYS } from "../src/engine/suggest.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = (f) => JSON.parse(fs.readFileSync(path.join(root, "src/data", f), "utf8"));

// goalLabels normally live in domains.js (a UI module) — tests only need keys present
const mkLabels = () => Object.fromEntries(GOAL_KEYS.map((g) => [g, { chip: g, row: "Goal · " + g, reason: `stated goal: ${g} (test label)` }]));

const SUITES = [
  { domain: { key: "books", factors: ["writing", "plot", "pacing", "character", "originality", "atmosphere"], tones: ["darkness", "complexity", "emotion"],
      factorLabels: {}, toneLabels: { darkness: () => "d", complexity: () => "c", emotion: () => "e" }, nounPlural: "books", goalLabels: mkLabels() },
    items: load("books.json"), love: ["Fantasy", "Science Fiction"], avoid: ["Romance"] },
  { domain: { key: "movies", factors: ["story", "acting", "direction", "visuals", "pacing", "originality"], tones: ["darkness", "intensity", "emotion"],
      factorLabels: {}, toneLabels: { darkness: () => "d", intensity: () => "i", emotion: () => "e" }, nounPlural: "movies", goalLabels: mkLabels() },
    items: load("movies.json"), love: ["Science Fiction", "Thriller"], avoid: ["Musical"] },
  { domain: { key: "tv", factors: ["story", "characters", "writing", "acting", "production", "bingeability"], tones: ["darkness", "complexity", "comfort"],
      factorLabels: {}, toneLabels: { darkness: () => "d", complexity: () => "c", comfort: () => "co" }, nounPlural: "shows", goalLabels: mkLabels() },
    items: load("tv.json"), love: ["Crime", "Drama"], avoid: ["Family"] },
  { domain: { key: "music", factors: ["melody", "lyrics", "production", "rhythm", "vocals", "originality"], tones: ["energy", "darkness", "density"],
      factorLabels: {}, toneLabels: { energy: () => "e", darkness: () => "d", density: () => "de" }, nounPlural: "tracks", goalLabels: mkLabels() },
    items: load("music.json"), love: ["Pop", "Dance"], avoid: ["Classical"] },
  { domain: { key: "restaurants", factors: ["food", "ambiance", "service", "value", "creativity", "comfort"], tones: ["liveliness", "formality", "adventure"],
      factorLabels: {}, toneLabels: { liveliness: () => "l", formality: () => "f", adventure: () => "a" }, nounPlural: "restaurants", goalLabels: mkLabels() },
    items: load("restaurants.json"), love: ["Italian", "Pizza"], avoid: ["Steakhouse"] },
];

let pass = 0, fail = 0;
const bad = [];
function check(name, cond, detail = "") {
  if (cond) pass++;
  else { fail++; bad.push(`FAIL  ${name}  ${detail}`); }
}

// ratingFrac normalization
check("ratingFrac 4.5/5", Math.abs(ratingFrac({ rating: { value: 4.5, scale: 5 } }) - 0.9) < 1e-9);
check("ratingFrac 9/10", Math.abs(ratingFrac({ rating: { value: 9, scale: 10 } }) - 0.9) < 1e-9);
check("ratingFrac 90/100 (Deezer default)", Math.abs(ratingFrac({ rating: { value: 90, source: "Deezer" } }) - 0.9) < 1e-9);
check("ratingFrac missing -> 0.5", ratingFrac({}) === 0.5);

for (const { domain, items, love, avoid } of SUITES) {
  const t = (n) => `[${domain.key}] ${n}`;
  domain.factorLabels = Object.fromEntries(domain.factors.map((k) => [k, k]));

  const loved = items.filter((i) => (i.genres || []).some((g) => love.includes(g)) && !(i.genres || []).some((g) => avoid.includes(g)));
  const profile = buildInitialProfile(domain, {
    genres: love, avoidGenres: avoid,
    favoriteItems: loved.slice(0, 3),
    weights: Object.fromEntries(domain.factors.map((k, i) => [k, i === 0 ? 0.9 : 0.5])),
    explore: 0.3,
  });
  profile.goals = ["classics", "hidden", "acclaimed", "broaden"];

  const excludeIds = [loved[0].id];
  const rows = buildSuggestionRows(items, profile, domain, { excludeIds, perRow: 6 });

  // structural
  check(t("produces multiple mechanisms"), new Set(rows.map((r) => r.mechanism)).size >= 5,
    rows.map((r) => r.mechanism).join(","));
  check(t("every row has >=3 items and a reason"), rows.every((r) => r.items.length >= 3 && r.reason?.length > 10));
  const all = rows.flatMap((r) => r.items.map((i) => i.id));
  check(t("no item appears in two rows"), new Set(all).size === all.length);
  check(t("excluded ids never surface"), !all.includes(excludeIds[0]));

  const rowOf = (k) => rows.find((r) => r.key === k);

  // pattern row is score-ordered
  const pat = rowOf("pattern");
  check(t("pattern row exists & is score-sorted"), !!pat &&
    scoreItem(pat.items[0], profile, domain).score >= scoreItem(pat.items[pat.items.length - 1], profile, domain).score);

  // priority row honors the top-weighted factor
  const pri = rowOf("priority");
  const topFactor = domain.factors[0]; // weighted 0.9 above
  check(t("priority row items are strong on the weighted factor"),
    !!pri && pri.items.every((i) => (i.factors?.[topFactor] ?? 0) >= 0.75));

  // consensus row: single loved genre, rating-sorted
  const cons = rowOf("consensus");
  if (cons) {
    const genre = cons.title.split(",")[0];
    check(t("consensus row stays in its genre"), cons.items.every((i) => i.genres.includes(genre)));
    check(t("consensus row is rating-sorted"), ratingFrac(cons.items[0]) >= ratingFrac(cons.items[cons.items.length - 1]));
  }

  // gems: below-median popularity, well rated
  const pops = items.filter((i) => !excludeIds.includes(i.id)).map((i) => i.popularity).sort((a, b) => a - b);
  const median = pops[Math.floor(pops.length / 2)];
  const gems = rowOf("gems");
  if (gems) check(t("gems are below-median popularity & well-rated"),
    gems.items.every((i) => i.popularity <= median && ratingFrac(i) >= 0.75));

  // stretch: never loved, never avoided genres
  const st = rowOf("stretch");
  if (st) check(t("stretch row avoids loved AND avoided genres"),
    st.items.every((i) => !(i.genres || []).some((g) => love.includes(g) || avoid.includes(g))));

  // goals
  const acc = rowOf("goal:acclaimed");
  if (acc) check(t("acclaimed goal row is top-rated only"), acc.items.every((i) => ratingFrac(i) >= 0.86));
  const hid = rowOf("goal:hidden");
  if (hid) check(t("hidden goal row is low-popularity"), hid.items.every((i) => i.popularity <= median));
  const br = rowOf("goal:broaden");
  if (br && pat) {
    const avgBr = br.items.reduce((s, i) => s + scoreItem(i, profile, domain).score, 0) / br.items.length;
    const avgPat = pat.items.reduce((s, i) => s + scoreItem(i, profile, domain).score, 0) / pat.items.length;
    check(t("broaden goal row sits far from the taste pattern"), avgBr < avgPat, `broaden=${avgBr.toFixed(1)} pattern=${avgPat.toFixed(1)}`);
  }
  check(t("goal rows carry goal metadata"), rows.filter((r) => r.mechanism === "goal").every((r) => r.goal && r.title.startsWith("Goal")));

  // no goals -> no goal rows
  const noGoalRows = buildSuggestionRows(items, { ...profile, goals: [] }, domain, { excludeIds });
  check(t("no goals means no goal rows"), noGoalRows.every((r) => r.mechanism !== "goal"));

  // determinism
  const again = buildSuggestionRows(items, profile, domain, { excludeIds, perRow: 6 });
  check(t("suggestions are deterministic"),
    JSON.stringify(rows.map((r) => [r.key, r.items.map((i) => i.id)])) ===
    JSON.stringify(again.map((r) => [r.key, r.items.map((i) => i.id)])));
}

console.log(bad.join("\n"));
console.log(`\n=== suggest: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
