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
 * TMDB's attribution guidance asks for their logo as well as the notice above.
 * Web uses the SVG they publish; native uses a raster of the same file, because
 * rendering SVG on React Native would mean adding react-native-svg for one image.
 *
 *   web    public/tmdb-logo.svg
 *   native mobile/assets/tmdb-logo.png
 *
 * Both are their official "blue short" wordmark, downloaded unmodified from
 * themoviedb.org on 18 Aug 2026. Do not recolour, stretch or crop it — their
 * guidelines forbid altering the mark, and the aspect ratio below is the real one.
 */
export const TMDB_LOGO = { src: "/tmdb-logo.svg", aspect: 273.42 / 35.52, alt: "TMDB" };

/**
 * Where everything on a card comes from. Shown as a credits list; each entry is
 * one source, what it provides, and the licence when the licence matters.
 */
export const SOURCE_CREDITS = [
  // `logo: true` renders their wordmark alongside the name. Listing every field
  // they supply matters: understating a source is the thing an attribution
  // requirement exists to prevent, and this line previously read "Official
  // trailers" while TMDB was also behind most film synopses.
  { name: "TMDB", logo: true, provides: "Film trailers, ratings, directors and synopses", note: TMDB_DISCLAIMER },
  { name: "Wikipedia", provides: "Critical reception and overviews", note: "Text under CC BY-SA." },
  { name: "Wikimedia Commons", provides: "Restaurant and dish photography", note: "Each photo credits its author and licence." },
  { name: "Open Library", provides: "Books, covers and reader ratings" },
  { name: "TVMaze", provides: "Shows, run detail and cast" },
  { name: "Deezer", provides: "Charts and 30-second previews" },
  { name: "Apple Music", provides: "Track links" },
  { name: "Wikidata", provides: "Notable restaurants" },
  // 200 committed restaurant ratings carry rating.source "Google". Crediting them
  // is the minimum; whether those values should be committed AT ALL is an open
  // question, because Google Places content is licensed for display with limits on
  // caching and redistribution — the very reason src/data/google-reviews.json is
  // gitignored. See DEBUG_CHECKLIST.md, open items.
  { name: "Google", provides: "Some restaurant star ratings", note: "Ratings shown as supplied by Google Places." },
  // Only a hyperlink to their title page — no IMDb dataset is used any more, so
  // their "personal and non-commercial use" terms no longer apply to us.
  { name: "IMDb", provides: "Links to title pages" },
];

/** One line summarising the position, for tight spaces. */
export const CREDITS_SUMMARY =
  "Decluttered summarises and links to other people's data. Every rating, quote "
  + "and photo is attributed to its source, and nothing here is presented as our "
  + "own judgement.";
