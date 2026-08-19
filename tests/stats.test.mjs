// Stats suite — streaks, milestones, taste review, and head-to-head insertion.
// All time-dependent functions take an explicit `today`, so this suite is
// deterministic and never flakes at midnight.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  dayKey, shiftDay, computeStreak, recentDays, milestoneProgress, MILESTONES,
  tasteReview, nextComparison, applyComparison, insertAt, resolveSwipe, SWIPE_THRESHOLD,
  SWIPE_FRACTION, FLICK_VELOCITY,
} from "../src/engine/stats.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = (f) => JSON.parse(fs.readFileSync(path.join(root, "src/data", f), "utf8"));

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) { pass++; } else { fail++; console.log(`FAIL  ${name}${extra ? "  " + extra : ""}`); }
};

// ---- day keys -------------------------------------------------------------
const T = "2026-08-07";
check("dayKey is local, not UTC", dayKey(new Date(2026, 7, 7, 23, 30).getTime()) === T);
check("shiftDay forward", shiftDay(T, 1) === "2026-08-08");
check("shiftDay back over month boundary", shiftDay("2026-08-01", -1) === "2026-07-31");
check("shiftDay back over year boundary", shiftDay("2026-01-01", -1) === "2025-12-31");
check("shiftDay handles leap day", shiftDay("2028-02-28", 1) === "2028-02-29");

// ---- streaks --------------------------------------------------------------
check("empty activity has no streak", computeStreak({}, T).current === 0);
check("sorting today starts a streak", computeStreak({ [T]: 3 }, T).current === 1);
check("zero-count day does not count", computeStreak({ [T]: 0 }, T).current === 0);

const three = { "2026-08-05": 4, "2026-08-06": 2, "2026-08-07": 9 };
check("consecutive days accumulate", computeStreak(three, T).current === 3);
check("doneToday true when today logged", computeStreak(three, T).doneToday === true);
check("today count surfaced", computeStreak(three, T).today === 9);
check("not at risk when today is logged", computeStreak(three, T).atRisk === false);

const upToYesterday = { "2026-08-05": 1, "2026-08-06": 1 };
const y = computeStreak(upToYesterday, T);
check("streak survives until end of today", y.current === 2);
check("streak flagged at risk when today missing", y.atRisk === true);
check("doneToday false when today missing", y.doneToday === false);

check("gap breaks the current streak", computeStreak({ "2026-08-01": 5, "2026-08-02": 5 }, T).current === 0);
check("longest streak survives a later gap",
  computeStreak({ "2026-07-01": 1, "2026-07-02": 1, "2026-07-03": 1, "2026-07-04": 1, "2026-08-07": 1 }, T).longest === 4);
check("longest is never below current", (() => {
  const s = computeStreak(three, T); return s.longest >= s.current;
})());

// ---- recent days ----------------------------------------------------------
const rd = recentDays(three, T);
check("recentDays returns 7 days", rd.length === 7);
check("recentDays ends on today", rd[6].key === T && rd[6].isToday === true);
check("recentDays starts 6 days back", rd[0].key === "2026-08-01");
check("recentDays carries counts", rd[6].count === 9 && rd[0].count === 0);
check("recentDays marks exactly one today", rd.filter((d) => d.isToday).length === 1);

// ---- milestones -----------------------------------------------------------
check("first milestone is ahead at zero", milestoneProgress(0).next.at === 1);
check("no milestone earned at zero", milestoneProgress(0).earned === null);
check("milestone earned once reached", milestoneProgress(10).earned.at === 10);
check("next milestone after 10 is 25", milestoneProgress(10).next.at === 25);
check("progress is a percentage 0..100", (() => {
  const p = milestoneProgress(17); return p.pct > 0 && p.pct < 100;
})(), `${milestoneProgress(17).pct}`);
check("progress halfway between 10 and 25 reads ~47%", milestoneProgress(17).pct === 47);
check("all milestones cleared caps at 100", (() => {
  const p = milestoneProgress(MILESTONES[MILESTONES.length - 1].at + 1);
  return p.next === null && p.pct === 100;
})());
check("milestones are strictly ascending", MILESTONES.every((m, i) => i === 0 || m.at > MILESTONES[i - 1].at));

// ---- taste review (against the real catalogue) ----------------------------
const books = load("books.json");
const domain = {
  key: "books", items: books,
  factors: ["writing", "plot", "pacing", "character", "originality", "atmosphere"],
};
const [a, b, c, d, e] = books;
const shelf = {
  [a.id]: { status: "consumed", rating: 5, elements: { writing: 5, pacing: 2 } },
  [b.id]: { status: "consumed", rating: 3, elements: { writing: 4, pacing: 3 } },
  [c.id]: { status: "want" },
  [d.id]: { status: "pass" },
  [e.id]: { status: "consumed", rating: 4 },
};
const rev = tasteReview(domain, shelf, { explore: 0.4 });
check("review counts every shelved item", rev.total === 5, `${rev.total}`);
check("review splits statuses", rev.want === 1 && rev.consumed === 3 && rev.pass === 1);
check("review counts ratings", rev.ratedCount === 3);
check("review averages ratings", Math.abs(rev.avgRating - 4) < 1e-9, `${rev.avgRating}`);
check("review counts five stars", rev.fiveStars === 1);
check("review excludes passes from top genres",
  rev.topGenres.every(([g]) => !(d.genres || []).includes(g) || rev.topGenres.length > 0));
check("review reports a decade", rev.topDecade === null || typeof rev.topDecade.decade === "number");
check("review reports element extremes", rev.toughestOn?.[0] === "pacing" && rev.softestOn?.[0] === "writing",
  JSON.stringify([rev.toughestOn, rev.softestOn]));
check("review pickiness is a fraction", rev.pickiness > 0 && rev.pickiness < 1);
check("review passes through explore", rev.explore === 0.4);
check("empty shelf review is safe", (() => {
  const r = tasteReview(domain, {}, null);
  return r.total === 0 && r.avgRating === null && r.topGenres.length === 0 && r.pickiness === null;
})());
check("review ignores ids missing from the catalogue", (() => {
  const r = tasteReview(domain, { rs_not_a_real_id: { status: "want" } }, null);
  return r.total === 0;
})());
check("bestGenre needs 2+ ratings", (() => {
  const r = tasteReview(domain, { [a.id]: { status: "consumed", rating: 5 } }, null);
  return r.bestGenre === null;
})());

// ---- head-to-head ranking -------------------------------------------------
const order = ["i1", "i2", "i3", "i4"];
check("no comparison needed on empty window", nextComparison(order, 2, 2) === null);
check("first comparison is the midpoint", nextComparison(order, 0, 4) === "i3");
check("preferring the new item narrows upward", (() => {
  const w = applyComparison(0, 4, 2, true); return w.lo === 0 && w.hi === 2;
})());
check("preferring the pivot narrows downward", (() => {
  const w = applyComparison(0, 4, 2, false); return w.lo === 3 && w.hi === 4;
})());
check("insertAt places at the front", insertAt(order, "new", 0)[0] === "new");
check("insertAt places at the end", insertAt(order, "new", 4)[4] === "new");
check("insertAt moves an existing id without duplicating", (() => {
  const next = insertAt(order, "i4", 0);
  return next[0] === "i4" && next.length === 4 && new Set(next).size === 4;
})());

// binary insertion always terminates in <= ceil(log2(n+1)) questions
check("binary insertion converges", (() => {
  const list = Array.from({ length: 33 }, (_, i) => "x" + i);
  let lo = 0, hi = list.length, steps = 0;
  while (nextComparison(list, lo, hi) !== null) {
    const pivotIndex = Math.floor((lo + hi) / 2);
    ({ lo, hi } = applyComparison(lo, hi, pivotIndex, pivotIndex % 2 === 0));
    if (++steps > 8) return false;
  }
  return lo === hi && steps <= 6;
})());

// ---- swipe resolution -----------------------------------------------------
check("swipe past threshold to the right wants it", resolveSwipe(SWIPE_THRESHOLD + 1) === "want");
check("swipe past threshold to the left passes it", resolveSwipe(-SWIPE_THRESHOLD - 1) === "pass");
check("exactly at the threshold snaps back", resolveSwipe(SWIPE_THRESHOLD) === null);
check("negative exactly at threshold snaps back", resolveSwipe(-SWIPE_THRESHOLD) === null);
check("a tap (no movement) snaps back", resolveSwipe(0) === null);
check("a short drag snaps back", resolveSwipe(60) === null && resolveSwipe(-60) === null);
check("a long flick still resolves", resolveSwipe(900) === "want" && resolveSwipe(-900) === "pass");
check("threshold is overridable", resolveSwipe(50, 40) === "want");

// Reported from a device: a drag well short of halfway committed. 110 fixed
// points is ~30% of a phone card, so the native threshold is now a fraction of
// the card width and a flick carries the short gestures.
check("a slow half-drag under the native threshold snaps back",
  resolveSwipe(150, Math.round(366 * SWIPE_FRACTION), 0) === null);
check("a slow drag past the native threshold commits",
  resolveSwipe(160, Math.round(366 * SWIPE_FRACTION), 0) === "want");
check("a deliberate flick commits even when short",
  resolveSwipe(80, Math.round(366 * SWIPE_FRACTION), FLICK_VELOCITY) === "want");
check("a leftward flick passes", resolveSwipe(-80, 154, -FLICK_VELOCITY) === "pass");
check("a fast tap with jitter is not a swipe",
  resolveSwipe(9, 154, 3) === null);
check("velocity just under the flick bar does not commit",
  resolveSwipe(80, 154, FLICK_VELOCITY - 0.01) === null);
check("the native threshold is a real fraction", SWIPE_FRACTION > 0.3 && SWIPE_FRACTION < 0.6);

console.log(`\n=== stats: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
