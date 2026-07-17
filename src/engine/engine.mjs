// ============================================================================
// Taste — domain-agnostic taste engine (pure, framework-agnostic, unit-testable)
//
// This is the engine verified in the Shelf (books) MVP, generalized: every
// function now takes a `domain` descriptor so the same math serves books,
// restaurants, and music. A domain is:
//   { key: "books", factors: [6 strings], tones: [3 strings] }
// An item exposes { id, genres: string[], factors: {f:0..1}, tone: {t:0..1},
// popularity: 0..1 } plus domain-specific display fields.
// All numeric axes are normalized 0..1. Profiles are updated immutably.
// ============================================================================

const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
/* portable deep clone (profile is plain JSON; avoids structuredClone gaps) */
const deepClone = (x) => (typeof structuredClone === "function" ? structuredClone(x) : JSON.parse(JSON.stringify(x)));

// ---- Vectors --------------------------------------------------------------
// An item's "feel" vector is its 6 craft factors + 3 tone axes = 9 dims.
export function itemVector(item, domain) {
  const f = item.factors || {};
  const t = item.tone || {};
  return [
    ...domain.factors.map((k) => f[k] ?? 0.5),
    ...domain.tones.map((k) => t[k] ?? 0.5),
  ];
}

export function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function genreJaccard(aGenres = [], bGenres = []) {
  if (!aGenres.length || !bGenres.length) return 0;
  const A = new Set(aGenres);
  const B = new Set(bGenres);
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}

// Blended similarity between a candidate item and a stored taste anchor.
function anchorSim(item, anchor, domain) {
  const feel = cosineSim(itemVector(item, domain), anchor.vec);
  const gj = genreJaccard(item.genres, anchor.genres);
  return 0.7 * feel + 0.3 * gj;
}

// ---- Profile construction -------------------------------------------------
// onboarding = {
//   genres, avoidGenres: string[]
//   favoriteItems, avoidItems, surprisedLiked: item[]
//   weights: {factor: 0..1}, explore: 0..1
// }
export function buildInitialProfile(domain, onboarding = {}) {
  const genreWeights = {};
  (onboarding.genres || []).forEach((g) => { genreWeights[g] = (genreWeights[g] || 0) + 1.0; });
  (onboarding.avoidGenres || []).forEach((g) => { genreWeights[g] = (genreWeights[g] || 0) - 1.2; });

  const positives = [...(onboarding.favoriteItems || []), ...(onboarding.surprisedLiked || [])];
  positives.forEach((b) => (b.genres || []).forEach((g) => {
    genreWeights[g] = (genreWeights[g] || 0) + 0.4;
  }));

  const toneTarget = {};
  domain.tones.forEach((k) => {
    const vals = (onboarding.favoriteItems || []).map((b) => b.tone?.[k]).filter((x) => x != null);
    toneTarget[k] = vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : 0.5;
  });

  const baseTol = 0.22;
  const tolerance = clamp(baseTol + 0.05 * (onboarding.surprisedLiked || []).length, 0.18, 0.45);

  const weights = {};
  domain.factors.forEach((k) => { weights[k] = onboarding.weights?.[k] ?? 0.5; });

  const liked = positives.map((b) => ({ id: b.id, vec: itemVector(b, domain), genres: b.genres || [] }));
  const avoid = (onboarding.avoidItems || []).map((b) => ({ id: b.id, vec: itemVector(b, domain), genres: b.genres || [] }));

  return {
    domain: domain.key,
    genreWeights,
    factorWeights: weights,
    toneTarget,
    tolerance,
    likedVectors: liked,
    avoidVectors: avoid,
    explore: onboarding.explore ?? 0.3,
    interactions: 0,
    ratings: {}, // itemId -> { overall:1..5, elements:{factor:1..5}|null }
  };
}

// ---- Scoring --------------------------------------------------------------
export function scoreItem(item, profile, domain) {
  const p = profile;

  // 1) Genre affinity -> squashed to 0..1 via logistic.
  let gRaw = 0;
  (item.genres || []).forEach((g) => { gRaw += p.genreWeights[g] || 0; });
  if (item.genres?.length) gRaw /= Math.sqrt(item.genres.length);
  const genreScore = 1 / (1 + Math.exp(-gRaw));

  // 2) Craft factors weighted by what the user says they care about.
  let fNum = 0, fDen = 0;
  domain.factors.forEach((k) => {
    const w = clamp(p.factorWeights[k] ?? 0.5, 0, 1); // clamp: weights may drift via element ratings
    fNum += w * (item.factors?.[k] ?? 0.5);
    fDen += w;
  });
  const factorScore = fDen ? fNum / fDen : 0.5;

  // 3) Tone proximity, scaled by tolerance (Gaussian falloff).
  let dist2 = 0;
  domain.tones.forEach((k) => {
    const d = (item.tone?.[k] ?? 0.5) - (p.toneTarget[k] ?? 0.5);
    dist2 += d * d;
  });
  const dist = Math.sqrt(dist2 / domain.tones.length);
  const toneScore = Math.exp(-(dist * dist) / (2 * p.tolerance * p.tolerance));

  // 4) Similarity to things they've loved (best-anchor + average blend).
  let simScore = 0.5;
  if (p.likedVectors.length) {
    const sims = p.likedVectors.map((a) => anchorSim(item, a, domain));
    const best = Math.max(...sims);
    const avg = sims.reduce((s, x) => s + x, 0) / sims.length;
    simScore = 0.6 * best + 0.4 * avg;
  }

  // 5) Penalty for resembling things they've rejected.
  let avoidPenalty = 0;
  if (p.avoidVectors.length) {
    avoidPenalty = Math.max(...p.avoidVectors.map((a) => anchorSim(item, a, domain)));
  }

  const novelty = 1 - (item.popularity ?? 0.5);

  // Headline match % is pure ALIGNMENT (no explore term). Positive weights sum to 1.0.
  const blended =
    0.30 * genreScore +
    0.20 * factorScore +
    0.18 * toneScore +
    0.32 * simScore -
    0.34 * avoidPenalty;

  const score = clamp(blended) * 100;
  return {
    score: Math.round(score * 10) / 10,
    breakdown: {
      genre: +(genreScore * 100).toFixed(0),
      factor: +(factorScore * 100).toFixed(0),
      tone: +(toneScore * 100).toFixed(0),
      similar: +(simScore * 100).toFixed(0),
      avoid: +(avoidPenalty * 100).toFixed(0),
      novelty: +(novelty * 100).toFixed(0),
    },
  };
}

// Deterministic-ish jitter so equal scores don't always tie in the same order.
function seededJitter(id, eps = 0.6) {
  let h = 0;
  const s = String(id);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973;
  return ((h / 9973) - 0.5) * eps;
}

export function rankItems(items, profile, domain, opts = {}) {
  const exclude = new Set(opts.excludeIds || []);
  const explore = profile.explore ?? 0.3;
  return items
    .filter((b) => !exclude.has(b.id))
    .map((b) => {
      const s = scoreItem(b, profile, domain);
      // Explore is a pure SURFACING dial: it nudges novel (obscure) and
      // tonally-distant items up the list without touching the match %.
      const noveltyFrac = s.breakdown.novelty / 100;
      const toneDistFrac = 1 - s.breakdown.tone / 100;
      const exploreBonus = explore * (20 * noveltyFrac + 12 * toneDistFrac);
      return { item: b, ...s, _sort: s.score + exploreBonus + seededJitter(b.id, explore * 4) };
    })
    .sort((a, b) => b._sort - a._sort);
}

// ---- Learning -------------------------------------------------------------
// action: "want" | "pass" | "consumed" | "more"; rating optional (1..5).
// ("consumed" = read / visited / listened, depending on the domain.)
export function updateProfileFromAction(profile, item, action, domain, rating = null) {
  const p = deepClone(profile);
  p.interactions = (p.interactions || 0) + 1;
  const lr = 0.12; // learning rate for tone target
  const gLr = 0.25; // genre nudge

  const reinforce = (sign, strength = 1) => {
    (item.genres || []).forEach((g) => {
      p.genreWeights[g] = (p.genreWeights[g] || 0) + sign * gLr * strength;
    });
    domain.tones.forEach((k) => {
      const target = p.toneTarget[k] ?? 0.5;
      const itemVal = item.tone?.[k] ?? 0.5;
      if (sign > 0) p.toneTarget[k] = clamp(target + lr * strength * (itemVal - target));
      // negative actions only add an avoid anchor (avoid overcorrecting the tone target)
    });
  };

  const anchor = { id: item.id, vec: itemVector(item, domain), genres: item.genres || [] };

  if (action === "want") {
    reinforce(+1, 1);
    if (!p.likedVectors.some((a) => a.id === item.id)) p.likedVectors.push(anchor);
  } else if (action === "pass") {
    reinforce(-1, 0.5);
    if (!p.avoidVectors.some((a) => a.id === item.id)) p.avoidVectors.push(anchor);
  } else if (action === "consumed") {
    if (rating != null) {
      if (rating >= 4) { reinforce(+1, (rating - 3) / 2); if (!p.likedVectors.some((a) => a.id === item.id)) p.likedVectors.push(anchor); }
      else if (rating <= 2) { reinforce(-1, (3 - rating) / 2); if (!p.avoidVectors.some((a) => a.id === item.id)) p.avoidVectors.push(anchor); }
    }
  }
  // "more" is neutral — a request for detail, not a taste signal.

  if (p.likedVectors.length > 40) p.likedVectors = p.likedVectors.slice(-40);
  if (p.avoidVectors.length > 40) p.avoidVectors = p.avoidVectors.slice(-40);
  return p;
}

export function setExplore(profile, explore) {
  return { ...profile, explore: clamp(explore) };
}

// ---- Per-element ratings ---------------------------------------------------
// After consuming an item the user can score it overall (1..5) AND rate each
// craft element (1..5). Learns element IMPORTANCE + a personalized anchor.
// Pure & idempotent — re-rating reverts the prior contribution, then applies.

const RATE_GENRE_SCALE = 0.30;  // overall enjoyment -> genre affinity
const RATE_FACTOR_SCALE = 0.45; // element strength x enjoyment -> factor importance

function rateContribution(item, r, domain) {
  const v = (r.overall - 3) / 2; // enjoyment valence, -1..1 (3 = neutral)
  const genreDelta = v * RATE_GENRE_SCALE;
  const factorDeltas = {};
  domain.factors.forEach((k) => {
    if (r.elements && r.elements[k] != null) {
      const e = (r.elements[k] - 1) / 4; // 0..1 perceived strength
      factorDeltas[k] = v * RATE_FACTOR_SCALE * (e - 0.5);
    } else {
      factorDeltas[k] = 0;
    }
  });
  // Perceived feel vector: factors from the user's ratings (fallback to seed),
  // tone kept from the item (tone isn't part of the manual element ratings).
  const vec = [
    ...domain.factors.map((k) => (r.elements && r.elements[k] != null ? (r.elements[k] - 1) / 4 : (item.factors?.[k] ?? 0.5))),
    ...domain.tones.map((k) => item.tone?.[k] ?? 0.5),
  ];
  const sign = r.overall >= 4 ? 1 : r.overall <= 2 ? -1 : 0;
  return { genreDelta, factorDeltas, vec, sign };
}

export function applyRating(profile, item, rating, domain) {
  // rating = { overall:1..5, elements?:{factor:1..5} }; overall 0/null clears it.
  const p = deepClone(profile);
  if (!p.ratings) p.ratings = {};
  const clearing = !rating || rating.overall == null || rating.overall === 0;

  // 1) Revert the previous rating for this item, if any (keeps it idempotent).
  const prev = p.ratings[item.id];
  if (prev) {
    const c = rateContribution(item, prev, domain);
    (item.genres || []).forEach((g) => { p.genreWeights[g] = (p.genreWeights[g] || 0) - c.genreDelta; });
    domain.factors.forEach((k) => { p.factorWeights[k] = (p.factorWeights[k] ?? 0.5) - c.factorDeltas[k]; });
  }
  // A rating supersedes any swipe-derived anchor for the same item.
  p.likedVectors = p.likedVectors.filter((a) => a.id !== item.id);
  p.avoidVectors = p.avoidVectors.filter((a) => a.id !== item.id);

  if (clearing) { delete p.ratings[item.id]; return normalizeWeights(p, domain); }

  // 2) Apply the new rating.
  const c = rateContribution(item, rating, domain);
  (item.genres || []).forEach((g) => { p.genreWeights[g] = (p.genreWeights[g] || 0) + c.genreDelta; });
  domain.factors.forEach((k) => { p.factorWeights[k] = (p.factorWeights[k] ?? 0.5) + c.factorDeltas[k]; });
  if (c.sign > 0) p.likedVectors.push({ id: item.id, vec: c.vec, genres: item.genres || [] });
  else if (c.sign < 0) p.avoidVectors.push({ id: item.id, vec: c.vec, genres: item.genres || [] });

  p.ratings[item.id] = { overall: rating.overall, elements: rating.elements ? { ...rating.elements } : null };

  if (p.likedVectors.length > 40) p.likedVectors = p.likedVectors.slice(-40);
  if (p.avoidVectors.length > 40) p.avoidVectors = p.avoidVectors.slice(-40);
  return normalizeWeights(p, domain);
}

// Round weight maps to a fixed grid and prune ~zero genre keys, so that
// revert (subtract) exactly cancels apply (add) — no drift over rate/clear cycles.
function normalizeWeights(p, domain) {
  const r6 = (x) => Math.round(x * 1e6) / 1e6;
  Object.keys(p.genreWeights).forEach((g) => {
    p.genreWeights[g] = r6(p.genreWeights[g]);
    if (Math.abs(p.genreWeights[g]) < 1e-9) delete p.genreWeights[g];
  });
  domain.factors.forEach((k) => { if (p.factorWeights[k] != null) p.factorWeights[k] = r6(p.factorWeights[k]); });
  return p;
}
