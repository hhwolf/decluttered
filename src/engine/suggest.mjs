// ============================================================================
// suggest.mjs — categorized suggestion engine.
//
// The swipe deck ranks by pattern similarity. This module deliberately goes
// BEYOND pattern recognition: it assembles labeled suggestion rows, each
// produced by a DIFFERENT mechanism, each carrying a human-readable reason.
//
//   pattern    — closest to the learned taste profile (the deck's math)
//   priority   — driven by the single factor the user weighs most (their
//                stated priorities, not observed swipes)
//   consensus  — the crowd's verdict: best externally-rated in loved genres
//                (real Google/IMDb/TVMaze/Open Library ratings, not our score)
//   gems       — hidden gems: rated like the greats, seen by few
//   mood       — closest to the user's tone target (feel, not genre)
//   stretch    — the anti-pattern row: top-rated items from genres the user
//                has NEVER engaged (not loved, not avoided) — deliberate
//                taste expansion, the opposite of similarity matching
//   goal       — one row per user goal (classics, hidden gems, short, buzzy,
//                acclaimed, broaden), honoring what they SAY they want even
//                when it contradicts what they swipe
//
// Pure functions; UI-free; unit-tested in tests/suggest.test.mjs.
// ============================================================================
import { scoreItem } from "./engine.mjs";

const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

// External ratings arrive on different scales (5 / 10 / 100) — normalize to 0..1.
export function ratingFrac(item) {
  const r = item.rating;
  if (!r || r.value == null) return 0.5;
  const scale = r.scale || (r.source === "Deezer" ? 100 : r.source === "TVMaze" || r.source === "IMDb" || r.source === "TMDB" ? 10 : 5);
  return clamp(r.value / scale);
}

// ---- user goals -----------------------------------------------------------
// Goal definitions are domain-agnostic mechanisms; domains supply the labels
// (see domains.js goalLabels). A goal = a scorer over (item, ctx) — higher is
// better — plus an eligibility filter.
export const GOAL_DEFS = {
  classics: {
    // the canon: old enough to have survived, rated well
    filter: (it, ctx) => (it.year != null && it.year <= ctx.classicYear) || (it.genres || []).includes("Classics"),
    score: (it) => ratingFrac(it) + 0.2 * (it.popularity ?? 0.5),
  },
  hidden: {
    filter: (it, ctx) => (it.popularity ?? 0.5) <= ctx.medianPop && ratingFrac(it) >= 0.78,
    score: (it) => ratingFrac(it) - 0.3 * (it.popularity ?? 0.5),
  },
  short: {
    // "easy wins": the shortest things in the catalogue that are still good
    filter: (it, ctx) => it._minutes != null && it._minutes <= ctx.shortCutoff,
    score: (it, ctx) => ratingFrac(it) + 0.5 * (1 - it._minutes / (ctx.shortCutoff || 1)),
  },
  buzzy: {
    filter: (it, ctx) => (it.popularity ?? 0) >= 0.7 && (it.year == null || it.year >= ctx.recentYear),
    score: (it) => (it.popularity ?? 0) + 0.3 * ratingFrac(it),
  },
  acclaimed: {
    filter: (it) => ratingFrac(it) >= 0.86,
    score: (it) => ratingFrac(it),
  },
  broaden: {
    // maximize distance from the profile — the pure anti-pattern goal
    filter: () => true,
    score: (it, ctx) => 1 - ctx.scoreOf(it) / 100,
  },
};
export const GOAL_KEYS = Object.keys(GOAL_DEFS);

// Parse "512 pp" / "142 min" / "60 min eps" / "3:32" into comparable minutes
// (books: pages act as the length unit; music: track minutes).
function lengthMinutes(item) {
  const m = item.meta;
  if (!m) return null;
  let mm;
  if ((mm = /^(\d+)\s*pp/.exec(m))) return +mm[1];            // pages
  if ((mm = /^(\d+)\s*min/.exec(m))) return +mm[1];           // runtime
  if ((mm = /^(\d+):(\d\d)$/.exec(m))) return +mm[1] + +mm[2] / 60; // track
  return null;
}

// ---- row builders ---------------------------------------------------------
export function buildSuggestionRows(items, profile, domain, opts = {}) {
  const excluded = new Set(opts.excludeIds || []);
  const goals = opts.goals || profile.goals || [];
  const perRow = opts.perRow ?? 6;

  const pool = items.filter((it) => !excluded.has(it.id));
  if (!pool.length) return [];

  const scored = new Map(pool.map((it) => [it.id, scoreItem(it, profile, domain).score]));
  const scoreOf = (it) => scored.get(it.id) ?? 0;

  // shared context for goal scorers
  const pops = pool.map((it) => it.popularity ?? 0.5).sort((a, b) => a - b);
  const medianPop = pops[Math.floor(pops.length / 2)];
  const years = pool.map((it) => it.year).filter((y) => y != null).sort((a, b) => a - b);
  const classicYear = years.length ? years[Math.floor(years.length * 0.25)] : 1990;
  const recentYear = years.length ? Math.max(years[years.length - 1] - 6, years[Math.floor(years.length * 0.75)]) : 2018;
  const withMinutes = pool.map((it) => ({ it, m: lengthMinutes(it) })).filter((x) => x.m != null);
  const mins = withMinutes.map((x) => x.m).sort((a, b) => a - b);
  const shortCutoff = mins.length ? mins[Math.floor(mins.length * 0.35)] : null;
  const ctx = { medianPop, classicYear, recentYear, shortCutoff, scoreOf };
  pool.forEach((it) => { it._minutes = lengthMinutes(it); });

  const taken = new Set(); // each item appears in at most one row
  const claim = (list, n = perRow) => {
    const out = [];
    for (const it of list) {
      if (taken.has(it.id)) continue;
      out.push(it); taken.add(it.id);
      if (out.length >= n) break;
    }
    return out;
  };
  const byDesc = (fn) => [...pool].sort((a, b) => fn(b) - fn(a));

  const lovedGenres = Object.entries(profile.genreWeights).filter(([, v]) => v > 0.3)
    .sort((a, b) => b[1] - a[1]).map(([g]) => g);
  const avoidedGenres = new Set(Object.entries(profile.genreWeights).filter(([, v]) => v < 0).map(([g]) => g));
  const hasGenre = (it, g) => (it.genres || []).includes(g);

  const rows = [];

  // 1) PATTERN — the profile's closest matches (what the deck would deal next)
  rows.push({
    key: "pattern", mechanism: "pattern",
    title: "Closest to your taste",
    reason: lovedGenres.length
      ? `Pure profile match — the ${domain.nounPlural} nearest everything you've told us and shown us.`
      : "Pure profile match, straight from your swipes.",
    items: claim(byDesc(scoreOf)),
  });

  // 2) PRIORITY — driven by the user's single most-weighted factor
  const topFactor = domain.factors.reduce((best, k) =>
    (profile.factorWeights[k] ?? 0.5) > (profile.factorWeights[best] ?? 0.5) ? k : best, domain.factors[0]);
  if ((profile.factorWeights[topFactor] ?? 0.5) > 0.55) {
    rows.push({
      key: "priority", mechanism: "priority",
      title: `Built on ${domain.factorLabels[topFactor].toLowerCase()}`,
      reason: `You weigh ${domain.factorLabels[topFactor].toLowerCase()} above everything — these are the catalogue's strongest on exactly that.`,
      items: claim(byDesc((it) => (it.factors?.[topFactor] ?? 0) + 0.15 * (scoreOf(it) / 100))
        .filter((it) => (it.factors?.[topFactor] ?? 0) >= 0.75)),
    });
  }

  // 3) CONSENSUS — the crowd's verdict in a genre the user loves
  const consGenre = lovedGenres.find((g) => pool.some((it) => hasGenre(it, g) && !taken.has(it.id)));
  if (consGenre) {
    rows.push({
      key: "consensus", mechanism: "consensus",
      title: `${consGenre}, by acclaim`,
      reason: `Not our algorithm — the crowd's. The highest real-world ratings in ${consGenre.toLowerCase()}.`,
      items: claim(byDesc((it) => ratingFrac(it)).filter((it) => hasGenre(it, consGenre))),
    });
  }

  // 4) GEMS — rated like the greats, seen by few
  rows.push({
    key: "gems", mechanism: "gems",
    title: "Hidden gems",
    reason: "Rated like the famous ones, discovered by far fewer people.",
    items: claim(byDesc((it) => ratingFrac(it) - 0.35 * (it.popularity ?? 0.5))
      .filter((it) => (it.popularity ?? 0.5) <= medianPop && ratingFrac(it) >= 0.75)),
  });

  // 5) MOOD — tone-target proximity (feel over genre)
  const toneDist = (it) => Math.sqrt(domain.tones.reduce((s, k) => {
    const d = (it.tone?.[k] ?? 0.5) - (profile.toneTarget[k] ?? 0.5);
    return s + d * d;
  }, 0) / domain.tones.length);
  const moodDesc = domain.tones.map((k) => domain.toneLabels[k](profile.toneTarget[k] ?? 0.5)).join(", ");
  rows.push({
    key: "mood", mechanism: "mood",
    title: "Matches your mood",
    reason: `Feel over genre: closest to the ${moodDesc} register you gravitate to.`,
    items: claim(byDesc((it) => -toneDist(it) + 0.1 * ratingFrac(it))),
  });

  // 6) STRETCH — top-rated items whose EVERY genre the user has never engaged
  // (no positive weight, no negative weight): the genuine anti-pattern row.
  const stretchPool = pool.filter((it) =>
    (it.genres || []).length &&
    (it.genres || []).every((g) => !(profile.genreWeights[g] || 0)));
  if (stretchPool.length) {
    rows.push({
      key: "stretch", mechanism: "stretch",
      title: "Stretch your range",
      reason: "Deliberately outside your pattern: the best of what you've never told us about — kept clear of what you avoid.",
      items: claim(byDesc((it) => ratingFrac(it)).filter((it) => stretchPool.includes(it))),
    });
  }

  // 7) GOALS — one row per stated goal, even against the taste pattern
  for (const g of goals) {
    const def = GOAL_DEFS[g];
    if (!def) continue;
    const label = domain.goalLabels?.[g];
    if (!label) continue;
    const eligible = pool.filter((it) => def.filter(it, ctx) && !(it.genres || []).some((x) => avoidedGenres.has(x)));
    const items = claim(eligible.sort((a, b) => def.score(b, ctx) - def.score(a, ctx)), perRow);
    rows.push({
      key: "goal:" + g, mechanism: "goal", goal: g,
      title: label.row,
      reason: label.reason,
      items,
    });
  }

  pool.forEach((it) => { delete it._minutes; });
  return rows.filter((r) => r.items.length >= 3);
}
