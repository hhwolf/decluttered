// Describe suite — the words we put on a card, derived from vectors we already
// compute. Pure functions, no network.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { vibeWords, strengths, counterpoint, commitment, runStatus, castLine, factChips, distinctQuotes,
         timeCommitment, totalMinutes, similarTo, lookupLinks, creditLine,
         trailerEmbedUrl, trailerWatchUrl } from "../src/engine/describe.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = (f) => JSON.parse(fs.readFileSync(path.join(root, "src/data", f), "utf8"));

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) pass++; else { fail++; console.log(`FAIL  ${name}${extra ? "  " + extra : ""}`); }
};

const rest = {
  key: "restaurants",
  tones: ["liveliness", "formality", "adventure"],
  toneLabels: {
    liveliness: (v) => (v < 0.4 ? "calm" : v > 0.6 ? "buzzy" : "relaxed"),
    formality: (v) => (v < 0.4 ? "casual" : v > 0.6 ? "upscale" : "smart-casual"),
    adventure: (v) => (v < 0.4 ? "familiar" : v > 0.6 ? "adventurous" : "open-minded"),
  },
  factors: ["food", "ambiance", "service", "value", "creativity", "comfort"],
  factorLabels: { food: "Food & flavor", ambiance: "Ambiance", service: "Service",
    value: "Value", creativity: "Creativity", comfort: "Comfort factor" },
  genreLabel: "Cuisines", nounPlural: "restaurants",
};

// ---- vibe words -----------------------------------------------------------
check("names the distinctive axes", (() => {
  const w = vibeWords({ tone: { liveliness: 0.9, formality: 0.1, adventure: 0.85 } }, rest);
  return w.includes("Buzzy") && w.includes("Casual") && w.includes("Adventurous");
})(), JSON.stringify(vibeWords({ tone: { liveliness: 0.9, formality: 0.1, adventure: 0.85 } }, rest)));

// A mid-band word is only worth a chip if it actually describes something.
const books = {
  tones: ["darkness", "complexity", "emotion"],
  toneLabels: {
    darkness: (v) => (v < 0.4 ? "lighter" : v > 0.6 ? "darker" : "balanced"),
    complexity: (v) => (v < 0.4 ? "breezy" : v > 0.6 ? "demanding" : "moderate"),
    emotion: (v) => (v < 0.4 ? "cerebral" : v > 0.6 ? "emotional" : "even"),
  },
};
check("drops hedge middles — 'balanced, moderate, even' says nothing",
  vibeWords({ tone: { darkness: 0.5, complexity: 0.52, emotion: 0.48 } }, books).length === 0);
check("keeps informative middles — 'smart-casual' tells you how to dress",
  (() => {
    const w = vibeWords({ tone: { liveliness: 0.5, formality: 0.52, adventure: 0.48 } }, rest);
    return w.includes("Smart-casual") && w.includes("Relaxed") && w.includes("Open-minded");
  })(), JSON.stringify(vibeWords({ tone: { liveliness: 0.5, formality: 0.52, adventure: 0.48 } }, rest)));
check("a hedge is dropped even next to informative axes",
  !vibeWords({ tone: { darkness: 0.5, complexity: 0.9, emotion: 0.1 } }, books).includes("Balanced"));
check("keeps neutrals only when asked",
  vibeWords({ tone: { liveliness: 0.5, formality: 0.5, adventure: 0.5 } }, rest, { includeNeutral: true }).length === 3);
check("most distinctive trait leads",
  vibeWords({ tone: { liveliness: 0.65, formality: 0.02, adventure: 0.5 } }, rest)[0] === "Casual");
check("respects the max", vibeWords({ tone: { liveliness: 0.95, formality: 0.05, adventure: 0.95 } }, rest, { max: 2 }).length === 2);
check("capitalises for display", vibeWords({ tone: { liveliness: 0.95 } }, rest)[0] === "Buzzy");
check("missing tone is safe", vibeWords({}, rest).length === 0);
check("missing domain is safe", vibeWords({ tone: { liveliness: 1 } }, null).length === 0);

// ---- strengths ------------------------------------------------------------
check("reports genuinely high axes", (() => {
  const s = strengths({ factors: { food: 0.9, ambiance: 0.4, service: 0.5, value: 0.85, creativity: 0.3, comfort: 0.4 } }, rest);
  return s[0] === "food & flavor" && s[1] === "value";
})(), JSON.stringify(strengths({ factors: { food: 0.9, ambiance: 0.4, service: 0.5, value: 0.85, creativity: 0.3, comfort: 0.4 } }, rest)));
check("a flat item claims nothing",
  strengths({ factors: { food: 0.5, ambiance: 0.5, service: 0.5, value: 0.5, creativity: 0.5, comfort: 0.5 } }, rest).length === 0);
check("missing factors is safe", strengths({}, rest).length === 0);

// ---- counterpoint ---------------------------------------------------------
check("warns when it resembles rejected items",
  /passed on/.test(counterpoint({ tone: {} }, rest, {}, { avoid: 60, tone: 80, genre: 80 }) || ""));
check("warns when the mood is far off", (() => {
  const c = counterpoint({ tone: { liveliness: 0.95, formality: 0.5, adventure: 0.5 } }, rest,
    { toneTarget: { liveliness: 0.2, formality: 0.5, adventure: 0.5 } }, { avoid: 10, tone: 20, genre: 80 });
  return /buzzy/.test(c || "");
})(), counterpoint({ tone: { liveliness: 0.95, formality: 0.5, adventure: 0.5 } }, rest,
  { toneTarget: { liveliness: 0.2, formality: 0.5, adventure: 0.5 } }, { avoid: 10, tone: 20, genre: 80 }));
check("warns when outside their genres",
  /normally reach for/.test(counterpoint({ tone: {} }, rest, {}, { avoid: 10, tone: 80, genre: 15 }) || ""));
check("says nothing when there is nothing to flag",
  counterpoint({ tone: {} }, rest, {}, { avoid: 10, tone: 80, genre: 80 }) === null);
check("no breakdown means no claim", counterpoint({}, rest, {}, null) === null);
check("avoid warning outranks the others",
  /passed on/.test(counterpoint({ tone: {} }, rest, {}, { avoid: 90, tone: 10, genre: 10 }) || ""));

// ---- commitment -----------------------------------------------------------
check("reads as a commitment", commitment({ seasons: 5, episodes: 62, status: "Ended" }) === "5 seasons · 62 episodes · Ended");
check("singular season", commitment({ seasons: 1, episodes: 8, status: "Ended" }).startsWith("1 season ·"));
check("partial data still reads", commitment({ status: "Running" }) === "Running");
check("nothing known yields null", commitment({}) === null);
check("undefined item is safe", commitment() === null);
// TVMaze's placeholder is an absence of information, not a status.
check("'To Be Determined' is not reported as a status",
  commitment({ seasons: 3, episodes: 30, status: "To Be Determined" }) === "3 seasons · 30 episodes");
check("a placeholder-only item yields null", commitment({ status: "To Be Determined" }) === null);

// ---- run status -----------------------------------------------------------
check("finished series reads as complete", runStatus({ status: "Ended" }) === "Complete series");
check("ongoing series warns of the wait", runStatus({ status: "Running" }) === "Still airing");
check("unknown status stays silent", runStatus({ status: "To Be Determined" }) === null);
check("statusless item stays silent", runStatus({ seasons: 4 }) === null);
check("undefined item is safe for runStatus", runStatus() === null);

// ---- cast -----------------------------------------------------------------
check("two names are joined with an ampersand",
  castLine({ cast: ["Benedict Cumberbatch", "Martin Freeman"] }) === "Benedict Cumberbatch & Martin Freeman");
check("three names use commas then an ampersand",
  castLine({ cast: ["A", "B", "C"] }) === "A, B & C");
check("a single name stands alone", castLine({ cast: ["Phoebe Waller-Bridge"] }) === "Phoebe Waller-Bridge");
check("the list is capped", castLine({ cast: ["A", "B", "C", "D", "E"] }) === "A, B & C");
check("an explicit max is honoured", castLine({ cast: ["A", "B", "C", "D"] }, { max: 4 }) === "A, B, C & D");
check("no cast yields null", castLine({ cast: [] }) === null);
check("missing cast is safe", castLine({}) === null);
check("undefined item is safe for castLine", castLine() === null);

// ---- fact chips -----------------------------------------------------------
check("run status becomes a fact", factChips({ status: "Ended" }, { key: "tv" }).includes("Complete series"));
check("awards become facts", factChips({ awards: ["Michelin", "James Beard"] }, { key: "restaurants" }).join() === "Michelin,James Beard");
check("a restaurant year reads as how long it has been open",
  factChips({ year: 1927 }, { key: "restaurants" }).includes("Serving since 1927"));
// `year` means "released" in every other domain and must not be reworded.
check("a film year is not a serving-since claim",
  factChips({ year: 1994 }, { key: "movies" }).length === 0);
check("nothing to state yields nothing", factChips({}, { key: "tv" }).length === 0);
check("undefined item is safe for factChips", factChips(undefined, { key: "tv" }).length === 0);

// ---- pull-quotes ----------------------------------------------------------
// The summary and the quotes are mined from the same paragraphs, so the best
// line lands in both and two sources look like one repeating itself.
check("a quote already in the summary is dropped", distinctQuotes({
  summary: "Bryan Miller said there is little substance.",
  quotes: [{ text: "Bryan Miller said there is little substance." }, { text: "The waitstaff were apathetic." }],
}).length === 1);
check("the surviving quote is the new one", distinctQuotes({
  summary: "Bryan Miller said there is little substance.",
  quotes: [{ text: "Bryan Miller said there is little substance." }, { text: "The waitstaff were apathetic." }],
})[0].text === "The waitstaff were apathetic.");
check("whitespace differences still count as duplicates", distinctQuotes({
  summary: "It  was   widely praised by critics.",
  quotes: [{ text: "It was widely praised by critics." }],
}).length === 0);
check("two outlets quoting one sentence collapse to one", distinctQuotes({
  summary: "",
  quotes: [{ text: "A landmark of the genre.", outlet: "A" }, { text: "A landmark of the genre.", outlet: "B" }],
}).length === 1);
check("a fragment too short to be a quote is dropped",
  distinctQuotes({ summary: "", quotes: [{ text: "Good." }] }).length === 0);
check("no reception yields no quotes", distinctQuotes(null).length === 0);
check("reception without quotes is safe", distinctQuotes({ summary: "x" }).length === 0);

// ---- time commitment ------------------------------------------------------
// "62 episodes" sounds like information but dodges the real question.
check("a long series is priced in hours",
  timeCommitment({ meta: "8 seasons · 73 eps · 61 min", episodes: 73 }, { key: "tv" }) === "About 74 hours of watching");
check("a miniseries reads very differently",
  timeCommitment({ meta: "1 season · 6 eps · 58 min", episodes: 6 }, { key: "tv" }) === "About 6 hours of watching");
check("a book is priced from its page count",
  timeCommitment({ meta: "322 pp" }, { key: "books" }) === "About 11 hours to read");
// A film already prints its runtime; repeating it as hours is noise.
check("a film says nothing extra", timeCommitment({ meta: "142 min" }, { key: "movies" }) === null);
check("no episode count means no claim",
  timeCommitment({ meta: "3 seasons · 60 min" }, { key: "tv" }) === null);
check("no page count means no claim", timeCommitment({ meta: "" }, { key: "books" }) === null);
check("an unknown domain says nothing", timeCommitment({ meta: "322 pp" }, { key: "music" }) === null);
check("totalMinutes multiplies episodes by runtime",
  totalMinutes({ meta: "2 seasons · 20 eps · 30 min", episodes: 20 }, { key: "tv" }) === 600);
check("undefined item is safe for timeCommitment", timeCommitment(undefined, { key: "tv" }) === null);

// ---- more like this -------------------------------------------------------
// Built on measured attributes only. The factor/tone vectors are derived from
// genre plus a hash jitter, so ranking by them would rank the hash.
{
  const mk = (id, genres, year, value) => ({ id, title: id, genres, year, rating: { value, scale: 10 } });
  const target = mk("t", ["Crime", "Drama"], 2008, 9.2);
  const items = [
    target,
    mk("closest", ["Crime", "Drama"], 2010, 9.0),   // same genres, era, acclaim
    mk("olderLesser", ["Crime", "Drama"], 1968, 5.0),
    mk("noOverlap", ["Comedy"], 2008, 9.2),          // shares nothing
  ];
  const dom = { key: "tv", items };
  const out = similarTo(target, dom);
  check("the item never matches itself", out.every((x) => x.item.id !== "t"));
  check("an item sharing no genre is excluded", out.every((x) => x.item.id !== "noOverlap"),
    JSON.stringify(out.map((x) => x.item.id)));
  check("closest on era and acclaim leads", out[0].item.id === "closest", JSON.stringify(out.map((x) => x.item.id)));
  check("results are ordered by similarity", out.every((x, i) => i === 0 || out[i - 1].sim >= x.sim));
  check("max is respected", similarTo(target, dom, { max: 1 }).length === 1);
  check("a one-item catalogue yields nothing", similarTo(target, { key: "tv", items: [target] }).length === 0);
  check("an item with no genres yields nothing",
    similarTo({ id: "x", genres: [] }, dom).length === 0);
  check("a missing item is safe", similarTo(null, dom).length === 0);
  // A great room you cannot get to is not a useful comparison.
  const places = [
    { id: "a", genres: ["Italian"], city: "Boston", rating: { value: 4.5 } },
    { id: "b", genres: ["Italian"], city: "Boston", rating: { value: 4.4 } },
    { id: "c", genres: ["Italian"], city: "Chicago", rating: { value: 4.5 } },
  ];
  const out2 = similarTo(places[0], { key: "restaurants", items: places });
  check("restaurant comparisons stay in the same city",
    out2.length === 1 && out2[0].item.id === "b", JSON.stringify(out2.map((x) => x.item.id)));
  // Two Open Library works share the bare title "Saga" by the same author.
  const dupes = [
    mk("t2", ["Graphic Novels"], 2015, 4.6),
    { id: "s1", title: "Saga", subtitle: "Brian K. Vaughan", genres: ["Graphic Novels"], year: 2012, rating: { value: 4.5, scale: 10 } },
    { id: "s2", title: "Saga", subtitle: "Brian K. Vaughan", genres: ["Graphic Novels"], year: 2013, rating: { value: 4.5, scale: 10 } },
    { id: "o1", title: "Awkward", subtitle: "Svetlana Chmakova", genres: ["Graphic Novels"], year: 2015, rating: { value: 4.2, scale: 10 } },
  ];
  const out3 = similarTo(dupes[0], { key: "books", items: dupes });
  check("the same visible label never appears twice",
    new Set(out3.map((x) => x.item.title)).size === out3.length,
    JSON.stringify(out3.map((x) => x.item.title)));
  check("deduping still fills the row from other candidates",
    out3.some((x) => x.item.title === "Awkward"), JSON.stringify(out3.map((x) => x.item.title)));

  // An unknown year should not be scored as a perfect era match.
  const undated = [target, mk("nodate", ["Crime", "Drama"], null, 9.2), mk("closest", ["Crime", "Drama"], 2009, 9.2)];
  check("a dated near-match beats an undated one",
    similarTo(target, { key: "tv", items: undated })[0].item.id === "closest");
}

// ---- director credit ------------------------------------------------------
check("a single director reads plainly", creditLine({ directors: ["Frank Darabont"] }) === "Directed by Frank Darabont");
check("a pair is joined with an ampersand",
  creditLine({ directors: ["Joel Coen", "Ethan Coen"] }) === "Directed by Joel Coen & Ethan Coen");
check("no directors yields null", creditLine({ directors: [] }) === null);
check("missing directors is safe", creditLine({}) === null);
check("undefined item is safe for creditLine", creditLine() === null);

// ---- lookup links ---------------------------------------------------------
// The Open Library work key was already inside our own id all along.
check("a book links to its Open Library work",
  lookupLinks({ id: "bk_OL17930368W" }, { key: "books" })[0].url === "https://openlibrary.org/works/OL17930368W");
check("a non-Open-Library book id yields no link",
  lookupLinks({ id: "bk_custom_1" }, { key: "books" }).length === 0);
check("a film offers a trailer search",
  /youtube\.com\/results/.test(lookupLinks({ id: "mv_1", title: "Heat", year: 1995 }, { key: "movies" })[0].url));
check("the trailer query carries title and year",
  decodeURIComponent(lookupLinks({ id: "mv_1", title: "Heat", year: 1995 }, { key: "movies" })[0].url).includes("Heat 1995 trailer"));
// It is a search, not a promise that this exact video exists.
check("the trailer link is labelled as a search",
  lookupLinks({ id: "mv_1", title: "Heat" }, { key: "movies" })[0].label === "Search for a trailer");
check("a restaurant gets no invented link", lookupLinks({ id: "rs_1", title: "X" }, { key: "restaurants" }).length === 0);
check("music gets no invented link", lookupLinks({ id: "tr_1", title: "X" }, { key: "music" }).length === 0);

// ---- trailer embeds -------------------------------------------------------
// These params are not cosmetic. Getting any of them wrong produces a player
// that silently refuses to start, which looks identical to a broken feature.
{
  const u = new URL(trailerEmbedUrl({ trailer: "kmJLuwP3MbY" }));
  check("embeds via youtube.com/embed", u.origin + u.pathname === "https://www.youtube.com/embed/kmJLuwP3MbY");
  // loop=1 alone does nothing for a single video; it needs playlist=<same id>.
  check("loop is paired with a playlist or it will not loop",
    u.searchParams.get("loop") === "1" && u.searchParams.get("playlist") === "kmJLuwP3MbY");
  // Browsers and iOS block unmuted autoplay outright.
  check("autoplay is muted by default",
    u.searchParams.get("autoplay") === "1" && u.searchParams.get("mute") === "1");
  check("plays inline rather than hijacking fullscreen", u.searchParams.get("playsinline") === "1");
}
check("unmuting is possible",
  new URL(trailerEmbedUrl({ trailer: "kmJLuwP3MbY" }, { muted: false })).searchParams.get("mute") === "0");
check("loop can be turned off",
  new URL(trailerEmbedUrl({ trailer: "kmJLuwP3MbY" }, { loop: false })).searchParams.get("playlist") === null);
check("no trailer yields no embed", trailerEmbedUrl({}) === null);
check("undefined item is safe for the embed", trailerEmbedUrl() === null);
// Wikidata is crowd-edited and does contain URLs in this field.
check("a non-id is rejected rather than half-parsed",
  trailerEmbedUrl({ trailer: "https://youtu.be/kmJLuwP3MbY" }) === null);
check("a wrong-length id is rejected", trailerEmbedUrl({ trailer: "abc" }) === null);
check("the watch link is a real youtube url",
  trailerWatchUrl({ trailer: "kmJLuwP3MbY" }) === "https://www.youtube.com/watch?v=kmJLuwP3MbY");
check("no trailer yields no watch link", trailerWatchUrl({}) === null);

// ---- against the real catalogues -----------------------------------------
const restaurants = load("restaurants.json");
const withVibe = restaurants.filter((r) => vibeWords(r, rest).length > 0);
check("most real restaurants produce a vibe", withVibe.length / restaurants.length > 0.5,
  `${withVibe.length}/${restaurants.length}`);
check("vibe words are never empty strings", restaurants.every((r) => vibeWords(r, rest).every((w) => w && w.length > 2)));

console.log(`\n=== describe: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
