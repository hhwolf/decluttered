// ============================================================================
// describe.mjs — turn the numbers we already compute into words a person can
// decide on.
//
// Every item carries a tone vector (how it feels) and a factor vector (what
// it's strong at), and until now neither was ever shown: a card offered a
// match percentage and a blurb, which is not enough to judge "would I enjoy
// this?". These helpers read those existing vectors — no new data, no new
// fetches — and say what they mean.
//
// Pure functions; unit-tested in tests/describe.test.mjs.
// ============================================================================

// Mid-band labels that describe nothing. Each domain's toneLabels returns a
// middle word for the 0.4-0.6 band, but those words are not equally useful:
// "smart-casual" tells you how to dress and "mid-tempo" is a real description,
// while "balanced" and "moderate" are hedges that fill space and make three
// chips read as noise. We drop only the empty ones — an unlisted new label
// shows by default, which is the safe direction to fail in.
const HEDGES = new Set(["balanced", "moderate", "even", "mixed", "steady"]);

/**
 * The item's feel, in the domain's own vocabulary: "Buzzy · Casual ·
 * Adventurous" for a restaurant, "Darker · Demanding · Edge-of-seat" for a
 * show. Axes whose mid-band word says nothing are dropped entirely.
 */
export function vibeWords(item, domain, { max = 3, includeNeutral = false } = {}) {
  if (!item?.tone || !domain?.tones) return [];
  const out = [];
  for (const k of domain.tones) {
    const v = item.tone[k];
    if (typeof v !== "number") continue;
    const label = domain.toneLabels?.[k]?.(v);
    if (!label) continue;
    if (!includeNeutral && HEDGES.has(label.toLowerCase())) continue;
    // strength orders the list so the most distinctive trait leads
    out.push({ label: label[0].toUpperCase() + label.slice(1), strength: Math.abs(v - 0.5) });
  }
  return out.sort((a, b) => b.strength - a.strength).slice(0, max).map((x) => x.label);
}

/**
 * What this item is best at, by its own craft axes — "Strong on food, value".
 * Only genuinely high axes qualify, so a flat item says nothing rather than
 * claiming a strength it doesn't have.
 */
export function strengths(item, domain, { threshold = 0.78, max = 2 } = {}) {
  if (!item?.factors || !domain?.factors) return [];
  return domain.factors
    .map((k) => ({ k, v: item.factors[k] }))
    .filter((x) => typeof x.v === "number" && x.v >= threshold)
    .sort((a, b) => b.v - a.v)
    .slice(0, max)
    .map((x) => (domain.factorLabels?.[x.k] || x.k).toLowerCase());
}

/**
 * The honest caveat. A recommender that only ever argues in favour is a
 * salesman; naming the one reason this might not land is what makes the
 * other 90% believable. Returns null when there is genuinely nothing to flag.
 */
export function counterpoint(item, domain, profile, breakdown) {
  if (!breakdown) return null;
  // Resembles things they have actively rejected — the most useful warning.
  if (breakdown.avoid > 45) return `Shares a lot with ${domain.nounPlural} you've passed on.`;
  // Way off their usual mood.
  if (breakdown.tone < 35 && profile?.toneTarget && item?.tone) {
    let worst = null, gap = 0;
    for (const k of domain.tones) {
      const d = Math.abs((item.tone[k] ?? 0.5) - (profile.toneTarget[k] ?? 0.5));
      if (d > gap) { gap = d; worst = k; }
    }
    if (worst && gap > 0.25) {
      return `Much more ${domain.toneLabels[worst](item.tone[worst])} than your usual.`;
    }
  }
  // Outside the genres they've shown any interest in.
  if (breakdown.genre < 30) return `Not a ${domain.genreLabel.toLowerCase().replace(/s$/, "")} you normally reach for.`;
  // Nothing solid to warn about.
  return null;
}

/** "5 seasons · 62 episodes · Ended" — the commitment, for domains that have one. */
export function commitment(item) {
  const bits = [];
  if (item?.seasons) bits.push(`${item.seasons} season${item.seasons === 1 ? "" : "s"}`);
  if (item?.episodes) bits.push(`${item.episodes} episodes`);
  // TVMaze uses "To Be Determined" when it simply doesn't know. Printing that
  // beside real counts reads as a fact about the show; it isn't one.
  if (item?.status === "Ended" || item?.status === "Running") bits.push(item.status);
  return bits.length ? bits.join(" · ") : null;
}

/**
 * Whether a series is finished, phrased as the thing the viewer actually wants
 * to know before starting it: is there an ending, or am I signing up to wait?
 * Null when we don't know — silence beats a guess.
 */
export function runStatus(item) {
  if (item?.status === "Ended") return "Complete series";
  if (item?.status === "Running") return "Still airing";
  return null;
}

/**
 * Who's in it. After "is it any good", this is the strongest appeal signal a
 * show has — it's why trailers lead with faces. Three names, because a fourth
 * stops being a reason and starts being a credits roll.
 */
export function castLine(item, { max = 3 } = {}) {
  const names = (item?.cast || []).filter(Boolean).slice(0, max);
  if (!names.length) return null;
  if (names.length === 1) return names[0];
  return names.slice(0, -1).join(", ") + " & " + names[names.length - 1];
}

/**
 * Pull-quotes worth showing beneath the reception summary.
 *
 * The summary is the opening sentences of the reception section and the quotes
 * are mined from that same section, so the strongest line usually appears in
 * both — printing it twice makes two sources look like one repeated itself.
 * Filtering here rather than at fetch time means the cached prose we already
 * hold is cleaned up too, with no re-crawl.
 */
export function distinctQuotes(reception) {
  const quotes = reception?.quotes || [];
  const summary = (reception?.summary || "").replace(/\s+/g, " ").toLowerCase();
  const seen = new Set();
  return quotes.filter((q) => {
    const text = (q?.text || "").replace(/\s+/g, " ").trim();
    if (text.length < 12) return false;
    const key = text.toLowerCase();
    if (summary.includes(key)) return false;   // already said, verbatim
    if (seen.has(key)) return false;           // two outlets, one sentence
    seen.add(key);
    return true;
  });
}

/**
 * Short, checkable facts that argue for an item on their own — a Michelin
 * star, a finished run, a room that's been serving since 1927. Every one of
 * these is stated in the source data; none is inferred.
 */
export function factChips(item, domain) {
  const out = [];
  const status = runStatus(item);
  if (status) out.push(status);
  for (const a of item?.awards || []) if (a) out.push(a);
  // `year` means "released" everywhere else; only for a restaurant does it
  // mean "has been open since", which is the bit worth boasting about.
  if (domain?.key === "restaurants" && item?.year) out.push(`Serving since ${item.year}`);
  return out;
}
