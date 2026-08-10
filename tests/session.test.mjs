// Session suite — the state transitions both clients share. These used to live
// inside the web App.jsx component; the React Native client would have had to
// reimplement them, and the two copies would have drifted. Pure functions, so
// they are testable without React on either platform.
import {
  emptyDomainState, withDefaults, sortItem, undoSort, rateItem,
  moveShelfEntry, removeShelfEntry, setProfileField, importHistory,
} from "../src/engine/session.mjs";
import { buildInitialProfile } from "../src/engine/engine.mjs";

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) pass++; else { fail++; console.log(`FAIL  ${name}${extra ? "  " + extra : ""}`); }
};

const domain = {
  key: "books",
  factors: ["writing", "plot", "pacing", "character", "originality", "atmosphere"],
  tones: ["darkness", "complexity", "emotion"],
  items: [],
};
const mkItem = (id, genres = ["Mystery"]) => ({
  id, title: id, genres,
  factors: Object.fromEntries(domain.factors.map((k) => [k, 0.7])),
  tone: Object.fromEntries(domain.tones.map((k) => [k, 0.6])),
  popularity: 0.5,
});
const a = mkItem("a"), b = mkItem("b", ["Fantasy"]);
domain.items = [a, b];
const fresh = () => ({ ...emptyDomainState([]), profile: buildInitialProfile(domain, {}), onboarded: true });

// ---- shape ----------------------------------------------------------------
{
  const s = emptyDomainState(["seed"]);
  check("a fresh domain is not onboarded", s.onboarded === false);
  check("the seeded feed is injected, not hardcoded", s.feed[0] === "seed");
  check("activity and ranked exist so new surfaces never read undefined",
    s.activity && Array.isArray(s.ranked));
  // Saved states predate activity/ranked.
  const old = withDefaults({ onboarded: true, shelf: { x: {} } }, []);
  check("defaults backfill an old saved state", old.activity && Array.isArray(old.ranked));
  check("backfilling does not clobber saved data", old.shelf.x && old.onboarded === true);
}

// ---- sorting --------------------------------------------------------------
{
  const { state, undo } = sortItem(fresh(), a, "want", domain, null, 1000);
  check("a want lands on the shelf", state.shelf.a.status === "want");
  check("a want posts to the feed", state.feed.length === 1 && state.feed[0].type === "shelved");
  check("a want counts toward today's activity", Object.values(state.activity)[0] === 1);
  check("the profile learns from the sort", state.profile !== fresh().profile);
  check("undo carries a snapshot, not an inverse", !!undo.prev.profile && undo.prev.shelf.a === undefined);

  const passed = sortItem(fresh(), a, "pass", domain, null, 1000).state;
  check("a pass lands on the shelf", passed.shelf.a.status === "pass");
  // Passing is not an achievement; it should not post.
  check("a pass does not post to the feed", passed.feed.length === 0);
  check("a pass still counts as activity", Object.values(passed.activity)[0] === 1);

  const consumed = sortItem(fresh(), a, "consumed", domain, null, 1000).state;
  check("consumed maps to the consumed status", consumed.shelf.a.status === "consumed");
  check("consumed does not post to the feed", consumed.feed.length === 0);
}

// ---- addedAt is preserved across re-sorts ---------------------------------
{
  const first = sortItem(fresh(), a, "want", domain, null, 1000).state;
  const second = sortItem(first, a, "consumed", domain, null, 9999).state;
  check("re-sorting keeps the original addedAt", second.shelf.a.addedAt === 1000);
  check("re-sorting updates the status", second.shelf.a.status === "consumed");
}

// ---- activity accumulates within a day -----------------------------------
{
  let s = fresh();
  s = sortItem(s, a, "want", domain, null, 1000).state;
  s = sortItem(s, b, "pass", domain, null, 2000).state;
  check("two sorts on one day count twice", Object.values(s.activity)[0] === 2);
  check("both land on the shelf", Object.keys(s.shelf).length === 2);
}

// ---- undo ----------------------------------------------------------------
{
  const start = fresh();
  const { state, undo } = sortItem(start, a, "want", domain, null, 1000);
  const back = undoSort(state, undo);
  check("undo clears the shelf entry", back.shelf.a === undefined);
  check("undo restores the profile", back.profile === start.profile);
  check("undo removes the feed post", back.feed.length === 0);
  check("undo restores the activity count", Object.keys(back.activity).length === 0);
  check("undo with no payload is a no-op", undoSort(state, null) === state);
  // Undo must not resurrect a shelf entry that predated the sort.
  const twice = sortItem(state, b, "pass", domain, null, 2000);
  check("undoing the second sort keeps the first", undoSort(twice.state, twice.undo).shelf.a?.status === "want");
}

// ---- rating --------------------------------------------------------------
{
  const rated = rateItem(fresh(), a, { overall: 5 }, domain, 1000);
  check("rating marks the item consumed", rated.shelf.a.status === "consumed");
  check("the rating is stored", rated.shelf.a.rating === 5);
  check("a high first rating posts to the feed", rated.feed[0]?.type === "rated" && rated.feed[0].rating === 5);

  const low = rateItem(fresh(), a, { overall: 2 }, domain, 1000);
  check("a low rating does not post", low.feed.length === 0);
  check("a low rating is still stored", low.shelf.a.rating === 2);

  // Editing a rating must not spam the timeline.
  const edited = rateItem(rated, a, { overall: 4 }, domain, 2000);
  check("re-rating does not post again", edited.feed.length === 1, `${edited.feed.length}`);
  check("re-rating updates the value", edited.shelf.a.rating === 4);
  check("re-rating keeps the original addedAt", edited.shelf.a.addedAt === 1000);

  // A zero overall means "elements only" and must not be stored as a 0-star.
  const elementsOnly = rateItem(fresh(), a, { overall: 0, elements: { plot: 4 } }, domain, 1000);
  check("a zero overall is not stored as a rating", elementsOnly.shelf.a.rating === undefined);
  check("element ratings are kept", elementsOnly.shelf.a.elements.plot === 4);
}

// ---- shelf moves ---------------------------------------------------------
{
  const s = sortItem(fresh(), a, "want", domain, null, 1000).state;
  check("a shelf entry can be moved", moveShelfEntry(s, "a", "consumed", 2000).shelf.a.status === "consumed");
  check("moving refreshes addedAt", moveShelfEntry(s, "a", "consumed", 2000).shelf.a.addedAt === 2000);
  // Moving an id that isn't there must not invent one.
  check("moving an absent id is a no-op", moveShelfEntry(s, "zz", "want", 2000) === s);
  check("an entry can be removed", removeShelfEntry(s, "a").shelf.a === undefined);
  check("removing an absent id is a no-op", removeShelfEntry(s, "zz") === s);
  check("removal does not mutate the input", s.shelf.a.status === "want");
}

// ---- profile fields ------------------------------------------------------
{
  const s = fresh();
  check("explore can be set", setProfileField(s, "explore", 0.75).profile.explore === 0.75);
  check("cities can be set", setProfileField(s, "cities", ["Boston"]).profile.cities[0] === "Boston");
  check("setting a field does not mutate the input", s.profile.explore !== 0.75);
  check("other profile fields survive", setProfileField(s, "explore", 0.9).profile.toneTarget !== undefined);
}

// ---- imported history ----------------------------------------------------
{
  const s = fresh();
  const out = importHistory(s, { a: { status: "consumed", rating: 5 }, b: { status: "want" } }, domain);
  check("imported rows land on the shelf", Object.keys(out.shelf).length === 2);
  check("an imported rating is kept", out.shelf.a.rating === 5);
  check("the profile learns from imported rows", out.profile !== s.profile);
  // A row naming something we don't carry is skipped, not guessed at.
  const unknown = importHistory(s, { nope: { status: "want" } }, domain);
  check("an unmatched row is skipped", unknown.shelf.nope === undefined);
  check("an unmatched row leaves the profile alone", unknown.profile === s.profile);
  check("importing nothing is a no-op on the shelf", Object.keys(importHistory(s, {}, domain).shelf).length === 0);
}

// ---- immutability --------------------------------------------------------
{
  const s = fresh();
  const snapshot = JSON.stringify(s);
  sortItem(s, a, "want", domain, null, 1000);
  rateItem(s, a, { overall: 5 }, domain, 1000);
  moveShelfEntry(s, "a", "want", 1000);
  importHistory(s, { a: { status: "want" } }, domain);
  check("no transition mutates the state it was given", JSON.stringify(s) === snapshot);
}

console.log(`\n=== session: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
