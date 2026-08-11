// Enrichment suite — the pure helpers behind the patch scripts, and the
// write-path guard that stops a fetcher re-run from deleting work a later
// pass added. That guard exists because it already failed once: expanding the
// catalogues wiped 653 of 677 critical-reception records in a single commit.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writePretty, ENRICHED_KEYS } from "../scripts/lib/derive.mjs";
import { showIdFromLink, principalCast } from "../scripts/patch-tv-cast.mjs";
import { notableAward, inceptionYear, idFor } from "../scripts/patch-restaurant-provenance.mjs";
import { isTruncated, recut } from "../scripts/patch-truncated-blurbs.mjs";
import { tconstFromLink, parseDirectors } from "../scripts/patch-movie-directors.mjs";
import { cleanVideoId, pickTrailer, isPlayableEmbed, isThrottled } from "../scripts/patch-trailers.mjs";
import { splitSentences } from "../scripts/lib/reception.mjs";

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) pass++; else { fail++; console.log(`FAIL  ${name}${extra ? "  " + extra : ""}`); }
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "decl-enrich-"));
const file = path.join(tmp, "cat.json");
const read = () => JSON.parse(fs.readFileSync(file, "utf8"));

// ---- writePretty carries enrichment forward -------------------------------
{
  // What a fetcher wrote, then what a later pass added on top.
  writePretty(fs, file, [{ id: "a", title: "A", image: "a.jpg" }]);
  const enriched = read();
  enriched[0].reception = { summary: "Widely praised." };
  enriched[0].seasons = 3;
  fs.writeFileSync(file, JSON.stringify(enriched, null, 1));

  // The fetcher re-runs and knows nothing about reception or seasons.
  writePretty(fs, file, [{ id: "a", title: "A (updated)", image: "a2.jpg" }]);
  const after = read();
  check("reception survives a fetcher re-run", after[0].reception?.summary === "Widely praised.");
  check("TV run detail survives a fetcher re-run", after[0].seasons === 3);
  check("the fetcher's own fields still update", after[0].title === "A (updated)" && after[0].image === "a2.jpg");
}

// ---- a transient miss must not erase a backfilled poster ------------------
{
  writePretty(fs, file, [{ id: "b", title: "B", image: "found-by-backfill.jpg" }]);
  writePretty(fs, file, [{ id: "b", title: "B", image: null }]);
  check("a null image does not wipe an existing one", read()[0].image === "found-by-backfill.jpg");
  writePretty(fs, file, [{ id: "b", title: "B", image: "" }]);
  check("an empty-string image does not wipe one either", read()[0].image === "found-by-backfill.jpg");
}

// ---- but a real new value always wins -------------------------------------
{
  writePretty(fs, file, [{ id: "c", image: "old.jpg", reception: { summary: "old" } }]);
  writePretty(fs, file, [{ id: "c", image: "new.jpg", reception: { summary: "new" } }]);
  const r = read()[0];
  check("a fresh image replaces the old one", r.image === "new.jpg");
  check("a fresh reception replaces the old one", r.reception.summary === "new");
}

// ---- matching is by id, so growth and reordering are safe -----------------
{
  writePretty(fs, file, [{ id: "x", dish: "the burger" }, { id: "y", dish: "the pie" }]);
  writePretty(fs, file, [{ id: "y" }, { id: "z" }, { id: "x" }]);
  const byId = Object.fromEntries(read().map((i) => [i.id, i]));
  check("enrichment follows the item, not its position", byId.x.dish === "the burger" && byId.y.dish === "the pie");
  check("a brand-new item is left alone", byId.z.dish === undefined);
  check("a dropped item does not come back", read().length === 3);
}

// ---- an unreadable existing file must not abort the write -----------------
{
  const broken = path.join(tmp, "broken.json");
  fs.writeFileSync(broken, "{ not json");
  writePretty(fs, broken, [{ id: "a", title: "A" }]);
  check("a corrupt file on disk is overwritten rather than fatal",
    JSON.parse(fs.readFileSync(broken, "utf8"))[0].title === "A");
}

check("every field a patch script writes is on the preserve list",
  ["reception", "overview", "dish", "seasons", "episodes", "status", "cast", "awards"]
    .every((k) => ENRICHED_KEYS.includes(k)),
  ENRICHED_KEYS.join(","));

// ---- patch-tv-cast --------------------------------------------------------
check("show id is read out of a TVMaze url",
  showIdFromLink("https://www.tvmaze.com/shows/82/game-of-thrones") === "82");
check("a malformed link yields null", showIdFromLink("https://www.tvmaze.com/people/1") === null);
check("an absent link is safe", showIdFromLink() === null);
check("principal cast keeps billing order",
  principalCast([{ person: { name: "A" } }, { person: { name: "B" } }]).join() === "A,B");
check("principal cast is capped at four",
  principalCast(["A", "B", "C", "D", "E"].map((n) => ({ person: { name: n } }))).length === 4);
// One actor, two characters — TVMaze lists them twice.
check("a double-cast actor appears once",
  principalCast([{ person: { name: "Tatiana Maslany" } }, { person: { name: "Tatiana Maslany" } },
    { person: { name: "Jordan Gavaris" } }]).join() === "Tatiana Maslany,Jordan Gavaris");
check("entries without a person are skipped",
  principalCast([{ character: { name: "X" } }, { person: { name: "A" } }]).join() === "A");
check("no cast yields an empty list", principalCast([]).length === 0);

// ---- patch-restaurant-provenance ------------------------------------------
check("a Michelin star is notable", notableAward("Michelin star") === "Michelin");
check("a James Beard award is notable", notableAward("James Beard Foundation Award") === "James Beard");
check("Bib Gourmand is notable", notableAward("Bib Gourmand") === "Bib Gourmand");
// A card cluttered with minor local honours helps nobody choose dinner.
check("a minor local honour is dropped", notableAward("Best of Boston 2011") === null);
check("an empty label is dropped", notableAward("") === null);
check("a missing label is safe", notableAward() === null);

check("a year is read from a Wikidata time literal", inceptionYear("+1927-01-01T00:00:00Z") === 1927);
check("a bare year without the sign still parses", inceptionYear("1954-06-01T00:00:00Z") === 1954);
// A malformed date rendering as "Serving since 0201" would be worse than silence.
check("an implausible year is rejected", inceptionYear("+0201-01-01T00:00:00Z") === null);
check("a future year is rejected", inceptionYear("+3025-01-01T00:00:00Z") === null);
check("a non-date is rejected", inceptionYear("unknown") === null);
check("an absent value is safe", inceptionYear() === null);

// The id scheme must match fetch-restaurants-wikidata exactly, or the whole
// pass matches nothing and silently reports success.
check("ids match the wikidata fetcher's scheme",
  idFor("Fox & the Knife", "Boston") === "rs_wd_fox_and_knife_boston", idFor("Fox & the Knife", "Boston"));
check("city is part of the id so two metros can share a name",
  idFor("Crumbs and Whiskers", "Los Angeles") !== idFor("Crumbs and Whiskers", "Washington"));

// ---- sentence splitting ---------------------------------------------------
// A naive /(?<=[.!?])\s+/ cut these in half and left blurbs like "Fantastic Mr."
check("an honorific does not end a sentence",
  splitSentences("Fantastic Mr. Fox is a 2009 film. It stars George Clooney.").length === 2);
check("a suffix does not end a sentence",
  splitSentences("It stars Robert Downey Jr. as Holmes. A sequel followed.").length === 2);
check("an initialism does not end a sentence",
  splitSentences("Smith plays a U.S. Army virologist. It grossed a lot.").length === 2);
check("real sentence breaks still split", splitSentences("One. Two. Three.").length === 3);
check("empty text yields one empty part", splitSentences("").length === 1);

// ---- truncation detection -------------------------------------------------
check("a dangling honorific is truncated", isTruncated("based on the book by Dr.") === true);
// These end real sentences; "repairing" them would swap good prose for other prose.
check("a company suffix is not truncated", isTruncated("Produced by Lucasfilm Ltd.") === false);
check("a name suffix is not truncated", isTruncated("starring Robert Downey Jr.") === false);
check("missing punctuation is truncated", isTruncated("cut off mid thou") === true);
check("a complete sentence is not truncated", isTruncated("A complete sentence.") === false);
check("a closing quote counts as an ending", isTruncated('He said "no."') === false);
check("an ellipsis counts as an ending", isTruncated("trailing off…") === false);
check("empty is not flagged", isTruncated("") === false);

check("recut keeps whole sentences within budget",
  recut("One sentence here. A second one follows. A third.", 25) === "One sentence here.",
  JSON.stringify(recut("One sentence here. A second one follows. A third.", 25)));
check("recut fills the budget when a second sentence fits",
  recut("One sentence here. A second one follows. A third.", 41) === "One sentence here. A second one follows.");
check("recut does not split on an abbreviation",
  recut("Based on the book by Dr. Seuss and others. Next.", 45) === "Based on the book by Dr. Seuss and others.");

// ---- patch-movie-directors ------------------------------------------------
check("tconst is read out of an IMDb url",
  tconstFromLink("https://www.imdb.com/title/tt0111161/") === "tt0111161");
check("a non-title IMDb url yields null", tconstFromLink("https://www.imdb.com/name/nm0000209/") === null);
check("an absent link is safe", tconstFromLink() === null);
// IMDb writes a literal backslash-N for null.
check("IMDb's null marker yields no directors", parseDirectors("\\N").length === 0);
check("an empty field yields no directors", parseDirectors("").length === 0);
check("a single director parses", parseDirectors("nm0001104").join() === "nm0001104");
check("the Coens both survive", parseDirectors("nm0001053,nm0001054").length === 2);
// A six-name anthology credit is a list, not a reason to watch.
check("credits are capped at two", parseDirectors("nm1,nm2,nm3".replace(/nm(\d)/g, "nm000000$1")).length === 2);
check("malformed ids are dropped", parseDirectors("notanid,nm0001053").join() === "nm0001053");

// ---- patch-trailers -------------------------------------------------------
check("a bare 11-char id is accepted", cleanVideoId("kmJLuwP3MbY") === "kmJLuwP3MbY");
// Wikidata's crowd-edited field really does contain URLs.
check("a url is rejected rather than half-parsed", cleanVideoId("https://youtu.be/kmJLuwP3MbY") === null);
check("a short id is rejected", cleanVideoId("abc") === null);
check("whitespace is trimmed", cleanVideoId("  kmJLuwP3MbY  ") === "kmJLuwP3MbY");

// A full trailer beats a teaser; official beats a fan re-post; English beats a dub.
check("a full official English trailer wins", pickTrailer([
  { site: "YouTube", key: "aaaaaaaaaaa", type: "Teaser", official: true, iso_639_1: "en" },
  { site: "YouTube", key: "bbbbbbbbbbb", type: "Trailer", official: true, iso_639_1: "en" },
]) === "bbbbbbbbbbb");
check("official beats unofficial at the same type", pickTrailer([
  { site: "YouTube", key: "aaaaaaaaaaa", type: "Trailer", official: false, iso_639_1: "en" },
  { site: "YouTube", key: "bbbbbbbbbbb", type: "Trailer", official: true, iso_639_1: "en" },
]) === "bbbbbbbbbbb");
// Clips and featurettes spoil without selling.
check("clips and featurettes are not trailers", pickTrailer([
  { site: "YouTube", key: "aaaaaaaaaaa", type: "Clip", official: true },
  { site: "YouTube", key: "bbbbbbbbbbb", type: "Featurette", official: true },
]) === null);
check("non-YouTube videos are ignored",
  pickTrailer([{ site: "Vimeo", key: "aaaaaaaaaaa", type: "Trailer", official: true }]) === null);
check("an empty list yields nothing", pickTrailer([]) === null);
check("a missing list is safe", pickTrailer() === null);

check("a playable embeddable video passes",
  isPlayableEmbed('x"playabilityStatus":{"status":"OK","x":1} y"playableInEmbed":true z') === true);
// Playable but embedding disabled by the uploader.
check("embed-disabled fails even when playable",
  isPlayableEmbed('"playabilityStatus":{"status":"OK"} "playableInEmbed":false') === false);
check("an unplayable video fails",
  isPlayableEmbed('"playabilityStatus":{"status":"UNPLAYABLE"} "playableInEmbed":true') === false);

// YouTube starts serving a consent wall after a couple of thousand requests.
// It looks exactly like an unplayable video, and treating it as one would
// quietly mark the rest of the catalogue dead.
check("a consent wall is throttling, not a dead video",
  isThrottled('"playabilityStatus":{"status":"LOGIN_REQUIRED"}') === true);
check("an unusual-traffic page is throttling", isThrottled("We have detected unusual traffic") === true);
check("a normal page is not throttling",
  isThrottled('"playabilityStatus":{"status":"OK"} "playableInEmbed":true') === false);

// ---- the real catalogues --------------------------------------------------
const load = (f) => JSON.parse(fs.readFileSync(new URL(`../src/data/${f}`, import.meta.url), "utf8"));
{
  const tv = load("tv.json");
  const withCast = tv.filter((s) => s.cast?.length);
  check("most shows carry principal cast", withCast.length / tv.length > 0.9, `${withCast.length}/${tv.length}`);
  check("no cast list exceeds four names", tv.every((s) => !s.cast || s.cast.length <= 4));
  check("cast names are non-empty strings",
    withCast.every((s) => s.cast.every((n) => typeof n === "string" && n.trim().length > 1)));
  check("no cast list repeats a name", withCast.every((s) => new Set(s.cast).size === s.cast.length));
}
{
  const movies = load("movies.json");
  const credited = movies.filter((m) => m.directors?.length);
  check("nearly every film is credited", credited.length / movies.length > 0.95,
    `${credited.length}/${movies.length}`);
  check("no film lists more than two directors", movies.every((m) => !m.directors || m.directors.length <= 2));
  check("no director name is a null marker or blank",
    credited.every((m) => m.directors.every((d) => d && d !== "\\N" && d.trim().length > 1)));
  // The directors pass rewrites movies.json; reception must have survived it.
  check("the directors pass did not drop reception",
    movies.filter((m) => m.reception?.summary).length > 250,
    `${movies.filter((m) => m.reception?.summary).length}`);
}
{
  // Trailers: stored ids were verified playable-in-embed at fetch time.
  const movies = load("movies.json"), tv = load("tv.json");
  const ids = [...movies, ...tv].filter((i) => i.trailer).map((i) => i.trailer);
  check("every stored trailer id is a bare 11-char YouTube id",
    ids.every((id) => cleanVideoId(id) === id), `${ids.length} ids`);
  check("most films have a trailer", movies.filter((m) => m.trailer).length / movies.length > 0.8,
    `${movies.filter((m) => m.trailer).length}/${movies.length}`);
  // Dish photos are CC works; attribution is a licence condition, not a nicety.
  const withPhotos = load("restaurants.json").filter((r) => r.dishPhotos?.length);
  check("every dish photo carries a credit and a licence",
    withPhotos.every((r) => r.dishPhotos.every((p) => p.url && p.credit && p.licence)),
    `${withPhotos.length} galleries`);
  check("galleries are a handful, not a slideshow",
    withPhotos.every((r) => r.dishPhotos.length <= 4));
}
{
  const rest = load("restaurants.json");
  const withYear = rest.filter((r) => r.year);
  check("opening years are plausible",
    withYear.every((r) => r.year >= 1600 && r.year <= new Date().getUTCFullYear()),
    `${withYear.length} with a year`);
  check("awards are drawn from the notable set",
    rest.every((r) => !r.awards || r.awards.every((a) =>
      ["Michelin", "James Beard", "Bib Gourmand", "World's 50 Best"].includes(a))));
}

// ---- blurb quality across every catalogue ---------------------------------
// 128 blurbs were cut mid-sentence before the shared splitter landed.
for (const f of ["books.json", "movies.json", "tv.json", "music.json", "restaurants.json"]) {
  const list = load(f);
  const bad = list.filter((i) => isTruncated(i.blurb));
  check(`[${f}] under 4% of blurbs are truncated`, bad.length / list.length < 0.04,
    `${bad.length}/${list.length}`);
  // The worst-looking failure: a blurb that stops on "by Dr." or "Fantastic Mr."
  const dangling = list.filter((i) => /\b(Mr|Mrs|Ms|Dr|Prof|Lt|Sgt|Capt|Col|Gen|Rev)\.$/.test(i.blurb.trim()));
  check(`[${f}] at most one blurb dangles on an honorific`, dangling.length <= 1,
    dangling.map((i) => i.title).join(", "));
  check(`[${f}] no blurb is empty`, list.every((i) => i.blurb && i.blurb.trim().length > 8));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n=== enrich: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
