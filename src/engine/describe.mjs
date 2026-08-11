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
 * How much of your life this is, in hours.
 *
 * "5 seasons · 62 episodes" sounds like information but dodges the actual
 * question. 62 episodes at 60 minutes is 62 hours — a different decision
 * entirely from a 6-hour miniseries, though both read as "a show" today.
 *
 * Rates are conventional and disclosed rather than precise, so everything is
 * hedged with "about" and rounded: books at ~2 minutes a page, screen time
 * straight from the runtime we already store.
 */
const MINUTES_PER_PAGE = 2;

export function timeCommitment(item, domain) {
  const mins = totalMinutes(item, domain);
  if (!mins) return null;
  // A film already prints its runtime in `meta`; saying it twice is noise.
  const verb = { books: "to read", tv: "of watching" }[domain?.key];
  if (!verb) return null;
  const amount = mins < 90
    ? `${Math.round(mins / 5) * 5} minutes`
    : mins / 60 < 10 ? `${Math.round((mins / 60) * 2) / 2} hours`
    : `${Math.round(mins / 60)} hours`;
  return `About ${amount} ${verb}`;
}

/** Total minutes, or null when we can't say honestly. */
export function totalMinutes(item, domain) {
  const key = domain?.key;
  if (key === "books") {
    const pages = parseInt(String(item?.meta || "").match(/(\d+)\s*pp/)?.[1] || "", 10);
    return Number.isFinite(pages) && pages > 0 ? pages * MINUTES_PER_PAGE : null;
  }
  if (key === "tv") {
    // The per-episode runtime lives at the end of meta: "8 seasons · 73 eps · 61 min".
    const per = parseInt(String(item?.meta || "").match(/(\d+)\s*min/)?.[1] || "", 10);
    if (!item?.episodes || !Number.isFinite(per) || per <= 0) return null;
    return item.episodes * per;
  }
  return null;
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
 * Who made it. The film counterpart to the cast line: for a lot of people a
 * director is the single strongest reason to pick one film over another.
 */
export function creditLine(item) {
  const names = (item?.directors || []).filter(Boolean);
  if (!names.length) return null;
  return `Directed by ${names.length === 1 ? names[0] : names.slice(0, -1).join(", ") + " & " + names[names.length - 1]}`;
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

/**
 * Three items from the same catalogue worth comparing this one against.
 *
 * Deliberately NOT built on the factor/tone vectors, even though they are right
 * there and would have been a one-liner. Those vectors are *derived* — a blend
 * of per-genre base profiles plus a ±0.09 hash jitter — so two shows with the
 * same genres have near-identical vectors by construction. Measured: within a
 * genre group the axis range is 0.17, which is exactly the jitter, against 0.44
 * to 0.58 across the whole catalogue. Ranking neighbours by them would be
 * ranking the hash and presenting the result as a judgement.
 *
 * So this uses only things somebody actually measured: shared genres, how
 * closely the crowd rates them, and how close in time they are. Restaurants
 * additionally must be in the same city — a great room you can't get to is not
 * a useful comparison.
 */
const ERA_SPAN = 40; // years, beyond which "same era" stops meaning anything

export function similarTo(item, domain, { max = 3, minShared = 1 } = {}) {
  const pool = domain?.items || [];
  if (!item || pool.length < 2) return [];
  const mine = new Set(item.genres || []);
  if (!mine.size) return [];
  const scale = (i) => i?.rating?.scale || (i?.rating?.source === "Deezer" ? 100 : 5);
  const norm = (i) => (i?.rating?.value == null ? null : i.rating.value / scale(i));
  const myRating = norm(item);

  const scored = [];
  for (const other of pool) {
    if (other.id === item.id) continue;
    if (domain.key === "restaurants" && other.city !== item.city) continue;
    const theirs = new Set(other.genres || []);
    let shared = 0;
    for (const g of mine) if (theirs.has(g)) shared++;
    // Sharing no genre at all means it simply isn't "like this".
    if (shared < minShared) continue;
    const jaccard = shared / (mine.size + theirs.size - shared);

    // Unknown values score neutral rather than being treated as a match.
    const theirRating = norm(other);
    const ratingClose = myRating == null || theirRating == null
      ? 0.5 : 1 - Math.abs(myRating - theirRating);
    const eraClose = !item.year || !other.year
      ? 0.5 : 1 - Math.min(Math.abs(item.year - other.year) / ERA_SPAN, 1);

    scored.push({
      item: other,
      sim: 0.5 * jaccard + 0.3 * ratingClose + 0.2 * eraClose,
    });
  }
  // Tie-break on id so the row is stable between renders.
  scored.sort((a, b) => b.sim - a.sim || (a.item.id < b.item.id ? -1 : 1));

  // Two Open Library works are both filed under the bare title "Saga" by the
  // same author. They are genuinely different records, but a three-row list
  // showing the same label twice reads as a rendering bug, so only the
  // best-scoring one of each visible label gets a row.
  const out = [], labels = new Set();
  for (const cand of scored) {
    const label = `${cand.item.title}\u0000${cand.item.subtitle}`.toLowerCase();
    if (labels.has(label)) continue;
    labels.add(label);
    out.push(cand);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Somewhere to go and look for yourself.
 *
 * Books had no outbound link at all, which is the one domain where you most
 * want to read a page before committing — but the Open Library work key was
 * already sitting inside our own item id ("bk_OL17930368W"). A trailer is how
 * people actually decide on a film, and a YouTube *search* needs no key and
 * promises no particular result, so it is labelled as a search.
 */
export function lookupLinks(item, domain) {
  const out = [];
  const key = domain?.key;
  if (key === "books") {
    const work = String(item?.id || "").match(/^bk_(OL\d+W)$/)?.[1];
    if (work) out.push({ label: "Open Library", url: `https://openlibrary.org/works/${work}` });
  }
  if (key === "movies" || key === "tv") {
    const q = [item?.title, key === "movies" ? item?.year : null, "trailer"].filter(Boolean).join(" ");
    out.push({ label: "Search for a trailer", url: `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}` });
  }
  return out;
}

/**
 * A YouTube IFrame embed URL for an item's trailer, or null if we have none.
 *
 * Shared so both clients build the exact same URL. Details that are not
 * optional:
 *   - `playlist=<id>` is what makes `loop=1` work for a single video; without
 *     it the video simply stops at the end.
 *   - `mute=1` is required for autoplay on iOS and in most browsers. An
 *     unmuted autoplay is silently blocked, which looks like a broken player.
 *   - `playsinline=1` stops iOS taking the video fullscreen on play.
 *
 * We only ever embed. Downloading or re-hosting YouTube video would breach
 * their terms; the IFrame player is the sanctioned route and keeps the view
 * count, branding and ads with the uploader.
 */
export function trailerEmbedUrl(item, { muted = true, loop = true, autoplay = true, origin } = {}) {
  // `origin` matters on native: the player validates it, and a WebView with no
  // referrer gets "Error 153 — video player configuration error".
  const id = item?.trailer;
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  const p = new URLSearchParams({
    autoplay: autoplay ? "1" : "0",
    mute: muted ? "1" : "0",
    controls: "1",
    playsinline: "1",
    modestbranding: "1",
    rel: "0",
    iv_load_policy: "3",
  });
  if (loop) { p.set("loop", "1"); p.set("playlist", id); }
  if (origin) p.set("origin", origin);
  return `https://www.youtube.com/embed/${id}?${p.toString()}`;
}

/** Where to go if the embed is blocked by the uploader. */
export function trailerWatchUrl(item) {
  const id = item?.trailer;
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? `https://www.youtube.com/watch?v=${id}` : null;
}

/**
 * The one "try it before you decide" action a card can offer, per domain.
 *
 * Each craving has a different way of letting you sample the thing rather than
 * read about it: hear the track, watch the trailer, look at the food. This is
 * the highest-value control on the deck, so it gets a single, named, primary
 * action instead of being buried in the detail sheet.
 *
 * Returns null when we have nothing real to play — never a button that
 * disappoints.
 */
export function previewAction(item, domain) {
  const key = domain?.key;
  if (key === "music" && (item?.links?.preview || item?.links?.deezer)) {
    return { kind: "audio", label: "Play 30s preview" };
  }
  if ((key === "movies" || key === "tv") && item?.trailer) {
    return { kind: "trailer", label: "Watch the trailer" };
  }
  if (key === "restaurants" && item?.dishPhotos?.length) {
    return { kind: "photos", label: `See the food (${item.dishPhotos.length})` };
  }
  return null;
}

/**
 * What the photo gallery is actually showing, said plainly.
 *
 * Galleries now mix two things and the difference matters: a photo found by
 * searching the restaurant's own name IS that restaurant, while a photo of its
 * signature dish is only illustrative. Captioning both as "not this kitchen"
 * undersells the real ones; captioning both as the restaurant would be a lie.
 */
export function photoCaption(photos = []) {
  const place = photos.some((p) => p?.kind === "place");
  const dish = photos.some((p) => p?.kind !== "place");
  if (place && dish) return "Photos of the restaurant, plus the dish it's known for (those are of the dish, not this kitchen).";
  if (place) return "Photos of this restaurant, from Wikimedia Commons.";
  return "Photos of the dish, not of this kitchen.";
}
