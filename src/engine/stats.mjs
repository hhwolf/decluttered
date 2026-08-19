// ============================================================================
// stats.mjs — retention & reflection math: activity streaks, milestones, and
// the "taste in review" summary. Pure functions over (activity, shelf, items);
// no UI, no Date.now() reads except through an injected `now` so tests are
// deterministic. Unit-tested in tests/stats.test.mjs.
// ============================================================================

// Local (not UTC) day key — a user sorting at 11pm should not roll the streak.
export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const DAY = 86400000;
export const shiftDay = (key, delta) => {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d).getTime() + delta * DAY);
};

/**
 * activity: { "YYYY-MM-DD": count } — items sorted per day.
 * Returns current streak (only "live" if it includes today or yesterday, so a
 * user who sorted yesterday still has today to save it), longest run, and
 * whether today is already logged.
 */
export function computeStreak(activity = {}, today = dayKey(Date.now())) {
  const days = Object.keys(activity).filter((k) => activity[k] > 0).sort();
  if (days.length === 0) return { current: 0, longest: 0, today: 0, doneToday: false, atRisk: false };

  let longest = 1, run = 1;
  for (let i = 1; i < days.length; i++) {
    run = shiftDay(days[i - 1], 1) === days[i] ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  const yesterday = shiftDay(today, -1);
  const last = days[days.length - 1];
  let current = 0;
  if (last === today || last === yesterday) {
    current = 1;
    for (let i = days.length - 1; i > 0; i--) {
      if (shiftDay(days[i - 1], 1) === days[i]) current++;
      else break;
    }
  }
  return {
    current,
    longest: Math.max(longest, current),
    today: activity[today] || 0,
    doneToday: (activity[today] || 0) > 0,
    // sorted yesterday but not yet today: the streak is one missed day from zero
    atRisk: current > 0 && last === yesterday,
  };
}

// Last 7 local days, oldest first — drives the little streak dot row.
export function recentDays(activity = {}, today = dayKey(Date.now()), n = 7) {
  return Array.from({ length: n }, (_, i) => {
    const key = shiftDay(today, i - (n - 1));
    return { key, count: activity[key] || 0, isToday: key === today };
  });
}

export const DAILY_GOAL = 10;

export const MILESTONES = [
  { at: 1, label: "First sort" },
  { at: 10, label: "Getting warm" },
  { at: 25, label: "Profile taking shape" },
  { at: 50, label: "Half a hundred" },
  { at: 100, label: "Century club" },
  { at: 250, label: "Serious taste" },
  { at: 500, label: "Certified obsessive" },
];

// Next milestone + progress toward it (null once every milestone is cleared).
export function milestoneProgress(total) {
  const next = MILESTONES.find((m) => m.at > total);
  const prev = [...MILESTONES].reverse().find((m) => m.at <= total);
  if (!next) return { earned: prev || null, next: null, pct: 100 };
  const from = prev ? prev.at : 0;
  return { earned: prev || null, next, pct: Math.round(((total - from) / (next.at - from)) * 100) };
}

/**
 * "Taste in review" — the reflection surface. Derived entirely from the user's
 * own shelf, so it is honest even offline.
 */
export function tasteReview(domain, shelf = {}, profile = null) {
  const entries = Object.entries(shelf)
    .map(([id, s]) => ({ ...s, item: domain.items.find((i) => i.id === id) }))
    .filter((e) => e.item);

  const byStatus = (st) => entries.filter((e) => e.status === st);
  const rated = entries.filter((e) => e.rating > 0);

  const genreCount = {};
  for (const e of entries) {
    if (e.status === "pass") continue;
    for (const g of e.item.genres || []) genreCount[g] = (genreCount[g] || 0) + 1;
  }
  const topGenres = Object.entries(genreCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // average rating per genre, but only where there's enough signal to mean anything
  const genreRating = {};
  for (const e of rated) {
    for (const g of e.item.genres || []) {
      (genreRating[g] = genreRating[g] || []).push(e.rating);
    }
  }
  const bestGenre = Object.entries(genreRating)
    .filter(([, rs]) => rs.length >= 2)
    .map(([g, rs]) => [g, rs.reduce((a, b) => a + b, 0) / rs.length])
    .sort((a, b) => b[1] - a[1])[0] || null;

  const years = entries.map((e) => e.item.year).filter((y) => typeof y === "number");
  const decades = {};
  for (const y of years) { const d = Math.floor(y / 10) * 10; decades[d] = (decades[d] || 0) + 1; }
  const topDecade = Object.entries(decades).sort((a, b) => b[1] - a[1])[0] || null;

  // element ratings the user actually filled in, averaged per factor
  const elementAvg = {};
  for (const k of domain.factors) {
    const vals = entries.map((e) => e.elements?.[k]).filter((v) => v > 0);
    if (vals.length) elementAvg[k] = vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  const toughestOn = Object.entries(elementAvg).sort((a, b) => a[1] - b[1])[0] || null;
  const softestOn = Object.entries(elementAvg).sort((a, b) => b[1] - a[1])[0] || null;

  return {
    total: entries.length,
    want: byStatus("want").length,
    consumed: byStatus("consumed").length,
    pass: byStatus("pass").length,
    ratedCount: rated.length,
    avgRating: rated.length ? rated.reduce((a, e) => a + e.rating, 0) / rated.length : null,
    fiveStars: rated.filter((e) => e.rating === 5).length,
    topGenres,
    bestGenre,
    topDecade: topDecade ? { decade: +topDecade[0], count: topDecade[1] } : null,
    yearSpan: years.length >= 2 ? [Math.min(...years), Math.max(...years)] : null,
    toughestOn,
    softestOn,
    pickiness: entries.length ? byStatus("pass").length / entries.length : null,
    explore: profile?.explore ?? null,
  };
}

/**
 * Swipe gesture resolution. Extracted from the Discover card so the commit rule
 * is unit-testable: a drag past the threshold commits, anything short of it
 * snaps back. The caller passes the distance from a REF, not from render state
 * — a fast flick can deliver its last pointermove and the pointerup in the same
 * frame, and reading rendered state there silently drops the swipe.
 */
export const SWIPE_THRESHOLD = 110;

/**
 * Native passes a threshold derived from the card width instead of this constant.
 * 110 fixed points is ~30% of a phone card, so a drag well short of halfway
 * committed — reported from a device as "half swipes wrongly commit". A fraction
 * keeps the gesture feeling the same on every screen size.
 */
export const SWIPE_FRACTION = 0.42;

/**
 * A deliberate throw commits even when it is short, so raising the distance
 * threshold does not make the deck feel laborious. Points per millisecond, which
 * is what PanResponder's vx reports.
 */
export const FLICK_VELOCITY = 0.55;

/**
 * `velocity` is optional and defaults to 0, so existing callers keep the pure
 * distance rule. A flick still has to travel a little, or a fast tap with jitter
 * would count as a swipe.
 */
export function resolveSwipe(distance, threshold = SWIPE_THRESHOLD, velocity = 0) {
  const far = Math.abs(distance) > threshold;
  const flicked = Math.abs(velocity) >= FLICK_VELOCITY && Math.abs(distance) > threshold * 0.4;
  if (!far && !flicked) return null; // snap back
  return distance > 0 ? "want" : "pass";
}

/**
 * Head-to-head ranking (Beli-style). `order` is the user's ranked list of ids,
 * best first. A new item is placed by binary search: each comparison halves
 * the candidate window, so inserting into a list of n costs ceil(log2(n+1))
 * questions instead of n.
 */
export function nextComparison(order, lo, hi) {
  if (lo >= hi) return null;
  return order[Math.floor((lo + hi) / 2)];
}

export function applyComparison(lo, hi, pivotIndex, preferNew) {
  // preferNew: the incoming item beat the pivot, so it belongs above it
  return preferNew ? { lo, hi: pivotIndex } : { lo: pivotIndex + 1, hi };
}

export function insertAt(order, id, index) {
  const next = order.filter((x) => x !== id);
  next.splice(index, 0, id);
  return next;
}
