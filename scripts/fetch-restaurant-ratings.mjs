// ============================================================================
// fetch-restaurant-ratings.mjs — cross-reference the Table catalogue against
// live review platforms to fill in real star ratings and review text.
//
// WHY THIS IS A SEPARATE, KEYED STEP
// Google's Places terms and Yelp's API terms both forbid persisting their
// content: you may display it to a user in response to their request, but you
// may not build a durable copy. So nothing this script fetches can live in the
// committed catalogue. It writes to src/data/live-ratings.json, which is
// gitignored and ships as {} — a deployment refreshes it on its own cadence,
// and the app degrades to the committed data when it is absent.
//
// WHAT EACH SOURCE GIVES
//   Google Places (New)  GOOGLE_PLACES_API_KEY  rating, review count, price, 5 reviews
//   Yelp Fusion          YELP_API_KEY           rating, review count, price
//   Beli                 —                      no public API exists; a private
//                                               app with no developer program,
//                                               so it cannot be cross-referenced
//                                               without scraping a service that
//                                               does not offer the data.
//
// Curated entries already carry hand-checked Google ratings; the Wikidata-
// sourced ones carry only a Wikipedia interest score. Both are upgraded here
// when a key is present, and matches are confirmed by name AND city so a
// same-named place in another state is never silently substituted.
//
//   GOOGLE_PLACES_API_KEY=... node scripts/fetch-restaurant-ratings.mjs
//   YELP_API_KEY=... node scripts/fetch-restaurant-ratings.mjs
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(DIR, "../src/data/restaurants.json");
const OUT = path.join(DIR, "../src/data/live-ratings.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const GOOGLE = process.env.GOOGLE_PLACES_API_KEY;
const YELP = process.env.YELP_API_KEY;

/** Names differ across platforms ("Katz's Delicatessen" vs "Katz's Deli"). */
export function nameMatches(a = "", b = "") {
  const fold = (t) => t.toLowerCase().replace(/[’']/g, "").replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(the|a|an|restaurant|delicatessen|deli|cafe|caf|bar|grill|co|inc)\b/g, " ")
    .replace(/\s+/g, " ").trim();
  const x = fold(a), y = fold(b);
  if (!x || !y) return false;
  return x === y || x.startsWith(y) || y.startsWith(x);
}

/** The place must be in the city we think it is, or it is a different venue. */
export function cityMatches(expectedCity, address = "") {
  if (!expectedCity) return true;
  return address.toLowerCase().includes(expectedCity.toLowerCase());
}

const PRICE_MAP = {
  PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

async function fromGoogle(place) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    signal: AbortSignal.timeout(12000),
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE,
      "X-Goog-FieldMask": "places.displayName,places.rating,places.userRatingCount,places.priceLevel,places.formattedAddress,places.reviews",
    },
    body: JSON.stringify({ textQuery: `${place.title} ${place.subtitle}`, maxResultCount: 3 }),
  });
  if (!res.ok) throw new Error(`google ${res.status}`);
  const hit = ((await res.json()).places || []).find((p) =>
    nameMatches(place.title, p.displayName?.text || "") && cityMatches(place.city, p.formattedAddress || ""));
  if (!hit?.rating) return null;
  return {
    rating: { value: hit.rating, count: hit.userRatingCount || 0, source: "Google" },
    price: PRICE_MAP[hit.priceLevel] || null,
    reviews: (hit.reviews || []).slice(0, 4).map((v) => ({
      author: v.authorAttribution?.displayName || "A Google user",
      rating: v.rating,
      text: (v.text?.text || "").slice(0, 400),
      when: v.relativePublishTimeDescription || "",
      source: "Google",
    })),
  };
}

async function fromYelp(place) {
  const q = new URLSearchParams({ term: place.title, location: place.subtitle, limit: "3" });
  const res = await fetch(`https://api.yelp.com/v3/businesses/search?${q}`, {
    headers: { Authorization: `Bearer ${YELP}` },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`yelp ${res.status}`);
  const hit = ((await res.json()).businesses || []).find((b) =>
    nameMatches(place.title, b.name || "") && cityMatches(place.city, (b.location?.city || "")));
  if (!hit?.rating) return null;
  return {
    rating: { value: hit.rating, count: hit.review_count || 0, source: "Yelp" },
    price: hit.price ? hit.price.length : null,
    reviews: [], // Yelp's terms do not permit storing review text
  };
}

async function main() {
  if (!GOOGLE && !YELP) {
    console.log("No GOOGLE_PLACES_API_KEY or YELP_API_KEY set — nothing to cross-reference.");
    console.log("The app runs on the committed catalogue: hand-checked Google ratings for");
    console.log("curated places, and a Wikipedia interest score for Wikidata-sourced ones.");
    if (!fs.existsSync(OUT)) fs.writeFileSync(OUT, "{}\n");
    return;
  }
  const places = JSON.parse(fs.readFileSync(SRC, "utf8"));
  const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  let google = 0, yelp = 0, missed = 0;

  for (const place of places) {
    let found = null;
    if (GOOGLE) {
      try { found = await fromGoogle(place); if (found) google++; }
      catch (e) { console.warn(`  ! google ${place.title}: ${e.message}`); }
      await sleep(180);
    }
    if (!found && YELP) {
      try { found = await fromYelp(place); if (found) yelp++; }
      catch (e) { console.warn(`  ! yelp ${place.title}: ${e.message}`); }
      await sleep(180);
    }
    if (found) out[place.id] = found; else missed++;
  }

  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log(`cross-referenced ${google} via Google, ${yelp} via Yelp, ${missed} unmatched`);
  console.log(`-> ${path.relative(process.cwd(), OUT)} (gitignored: these platforms forbid shipping their content)`);
}

const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (runDirectly) main().catch((e) => { console.error(e); process.exit(1); });
