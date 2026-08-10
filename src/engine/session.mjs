// ============================================================================
// session.mjs — every state transition the app can make, as pure functions.
//
// Extracted from App.jsx when the React Native client arrived. The transitions
// (sort an item, rate it, undo, move a shelf entry, import a history) are not
// web-specific in any way, and copying ~150 lines of them into a second client
// guarantees the two drift: a rule fixed on one platform stays broken on the
// other. Both clients now call these, so a fix lands once.
//
// Every function takes a domain state and returns a NEW one; nothing mutates,
// nothing touches storage, nothing imports React. Unit-tested in
// tests/session.test.mjs.
// ============================================================================
import { updateProfileFromAction, applyRating } from "./engine.mjs";
import { dayKey } from "./stats.mjs";

/** A fresh, un-onboarded domain. `feed` is injected so the seed stays in the UI layer. */
export function emptyDomainState(feed = []) {
  return {
    onboarded: false, profile: null, onboardingData: null, shelf: {}, feed,
    activity: {}, // "YYYY-MM-DD" -> items sorted that day (drives the streak)
    ranked: [],   // ids, best first, from head-to-head comparisons
  };
}

/** Saved states predate activity/ranked; fill them so new surfaces never read undefined. */
export function withDefaults(saved, feed = []) {
  return { ...emptyDomainState(feed), ...saved };
}

const post = (fields) => ({
  id: "p" + Date.now(), userId: "me", text: "", ts: Date.now(),
  likes: 0, likedByMe: false, comments: [], ...fields,
});

/**
 * Sort an item: want / pass / consumed. Returns { state, undo } — the undo
 * payload is a snapshot rather than an inverse operation, because the profile
 * is derived from the whole history and cannot be un-updated arithmetically.
 */
export function sortItem(ds, item, action, domain, rating = null, now = Date.now()) {
  const undo = { item, action, prev: { profile: ds.profile, shelf: ds.shelf, feed: ds.feed, activity: ds.activity } };
  const profile = updateProfileFromAction(ds.profile, item, action, domain, rating);
  const status = action === "want" ? "want" : action === "pass" ? "pass" : "consumed";
  const prev = ds.shelf[item.id] || {};
  const shelf = {
    ...ds.shelf,
    [item.id]: { status, rating: rating != null ? rating : prev.rating, addedAt: prev.addedAt || now },
  };
  const feed = action === "want"
    ? [post({ type: "shelved", itemId: item.id }), ...ds.feed]
    : ds.feed;
  const today = dayKey(now);
  const activity = { ...ds.activity, [today]: (ds.activity?.[today] || 0) + 1 };
  return { state: { ...ds, profile, shelf, feed, activity }, undo };
}

/** Restore the snapshot taken by sortItem. */
export function undoSort(ds, undo) {
  return undo?.prev ? { ...ds, ...undo.prev } : ds;
}

/**
 * Record a rating. Posts to the feed only the first time an item earns 4+, so
 * editing a rating later doesn't spam the timeline.
 */
export function rateItem(ds, item, rating, domain, now = Date.now()) {
  const profile = applyRating(ds.profile, item, rating, domain);
  const prev = ds.shelf[item.id] || {};
  const wasRated = !!prev.rating;
  const overall = rating.overall || 0;
  const shelf = {
    ...ds.shelf,
    [item.id]: {
      ...prev, status: "consumed",
      rating: overall || undefined,
      elements: rating.elements || prev.elements,
      addedAt: prev.addedAt || now,
    },
  };
  const feed = !wasRated && rating.overall >= 4
    ? [post({ type: "rated", itemId: item.id, rating: rating.overall }), ...ds.feed]
    : ds.feed;
  return { ...ds, profile, shelf, feed };
}

export function moveShelfEntry(ds, id, status, now = Date.now()) {
  if (!ds.shelf[id]) return ds;
  return { ...ds, shelf: { ...ds.shelf, [id]: { ...ds.shelf[id], status, addedAt: now } } };
}

export function removeShelfEntry(ds, id) {
  if (!ds.shelf[id]) return ds;
  const shelf = { ...ds.shelf };
  delete shelf[id];
  return { ...ds, shelf };
}

/** Patch one field of the profile (explore dial, cities, goals). */
export function setProfileField(ds, key, value) {
  return { ...ds, profile: { ...ds.profile, [key]: value } };
}

/**
 * Merge imported CSV rows and let every rated row teach the profile, so the
 * deck reflects an imported history immediately rather than after a re-sort.
 * Rows naming an item we don't carry are skipped, not guessed at.
 */
export function importHistory(ds, entries, domain) {
  let profile = ds.profile;
  const byId = new Map(domain.items.map((i) => [i.id, i]));
  const applied = {};
  for (const [id, entry] of Object.entries(entries)) {
    const item = byId.get(id);
    if (!item) continue;
    const action = entry.status === "want" ? "want" : "consumed";
    profile = updateProfileFromAction(profile, item, action, domain, null);
    if (entry.rating) profile = applyRating(profile, item, { overall: entry.rating }, domain);
    applied[id] = entry;
  }
  return { ...ds, profile, shelf: { ...ds.shelf, ...applied } };
}
