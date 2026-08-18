// ============================================================================
// credits.mjs — required attributions, in one place, worded once.
//
// These are not decoration. Several sources make attribution a CONDITION of
// use, and shipping to TestFlight or the App Store without them is both a
// licence breach and an App Review risk (Guideline 5.2, intellectual property):
//
//   TMDB      requires the exact disclaimer below, and specifically that we do
//             not imply endorsement.
//   Wikipedia
//   Wikimedia CC BY-SA — attribution and licence must travel with the content.
//             Per-photo credit and licence are also shown on the item itself.
//   Deezer    previews are streamed from their CDN under their API terms.
//   TVMaze    free API, attribution requested.
//
// The wording lives here so the web and native clients cannot drift into saying
// different things about someone else's data.
// ============================================================================

/** TMDB's required disclaimer, verbatim. Do not paraphrase this one. */
export const TMDB_DISCLAIMER =
  "This product uses the TMDB API but is not endorsed or certified by TMDB.";

/**
 * Where everything on a card comes from. Shown as a credits list; each entry is
 * one source, what it provides, and the licence when the licence matters.
 */
export const SOURCE_CREDITS = [
  { name: "TMDB", provides: "Official trailers", note: TMDB_DISCLAIMER },
  { name: "Wikipedia", provides: "Critical reception and overviews", note: "Text under CC BY-SA." },
  { name: "Wikimedia Commons", provides: "Restaurant and dish photography", note: "Each photo credits its author and licence." },
  { name: "Open Library", provides: "Books, covers and reader ratings" },
  { name: "IMDb", provides: "Film ratings and directors", note: "From IMDb's public datasets." },
  { name: "TVMaze", provides: "Shows, run detail and cast" },
  { name: "Deezer", provides: "Charts and 30-second previews" },
  { name: "Apple Music", provides: "Track links" },
  { name: "Wikidata", provides: "Notable restaurants" },
];

/** One line summarising the position, for tight spaces. */
export const CREDITS_SUMMARY =
  "Decluttered summarises and links to other people's data. Every rating, quote "
  + "and photo is attributed to its source, and nothing here is presented as our "
  + "own judgement.";
