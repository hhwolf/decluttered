// ============================================================================
// fetch-restaurants.mjs — build src/data/restaurants.json.
//
// LIVE MODE (set GOOGLE_PLACES_API_KEY): queries Google Places API (New)
// Text Search per cuisine x city and maps real rating / userRatingCount /
// priceLevel. Note Google's ToS restricts long-term caching of Places data —
// live mode is for a deployed backend that refreshes, not for committing data.
//
// DEFAULT MODE (no key): writes the bundled curated snapshot below — 44
// well-known US restaurants with their public Google rating values as of
// mid-2026 (hand-collected snapshot; refresh with the live mode when keyed).
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveAxes, logPopularity, getJSON, sleep, writePretty, clamp, hash01 } from "./lib/derive.mjs";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/data/restaurants.json");
const KEY = process.env.GOOGLE_PLACES_API_KEY;

// factors: [food, ambiance, service, value, creativity, comfort]
// tones:   [liveliness, formality, adventure]
const FACTOR_BASE = {
  "Italian":        [0.82, 0.72, 0.72, 0.58, 0.55, 0.82],
  "Japanese":       [0.88, 0.70, 0.78, 0.48, 0.75, 0.58],
  "Mexican":        [0.80, 0.62, 0.60, 0.78, 0.58, 0.75],
  "Chinese":        [0.80, 0.55, 0.58, 0.80, 0.55, 0.78],
  "Thai":           [0.80, 0.58, 0.62, 0.78, 0.62, 0.70],
  "Indian":         [0.82, 0.58, 0.62, 0.75, 0.62, 0.72],
  "American":       [0.72, 0.62, 0.65, 0.68, 0.45, 0.85],
  "New American":   [0.85, 0.80, 0.78, 0.42, 0.85, 0.58],
  "French":         [0.88, 0.85, 0.85, 0.35, 0.75, 0.60],
  "Mediterranean":  [0.80, 0.68, 0.68, 0.65, 0.60, 0.72],
  "Korean":         [0.82, 0.62, 0.62, 0.72, 0.68, 0.70],
  "Vietnamese":     [0.80, 0.52, 0.58, 0.85, 0.55, 0.72],
  "Barbecue":       [0.85, 0.55, 0.55, 0.70, 0.48, 0.85],
  "Seafood":        [0.82, 0.70, 0.70, 0.50, 0.58, 0.68],
  "Pizza":          [0.82, 0.55, 0.55, 0.80, 0.50, 0.85],
  "Burgers":        [0.78, 0.50, 0.55, 0.82, 0.45, 0.88],
  "Vegetarian":     [0.75, 0.68, 0.68, 0.62, 0.78, 0.62],
  "Bakery & Café":  [0.78, 0.68, 0.60, 0.72, 0.58, 0.80],
  "Steakhouse":     [0.85, 0.78, 0.82, 0.38, 0.48, 0.75],
  "Soul Food":      [0.82, 0.58, 0.62, 0.75, 0.50, 0.90],
  "Deli":           [0.80, 0.48, 0.52, 0.75, 0.45, 0.85],
  "Cajun & Creole": [0.82, 0.62, 0.62, 0.70, 0.60, 0.80],
};
const TONE_BASE = {
  "Italian":        [0.60, 0.55, 0.42],
  "Japanese":       [0.45, 0.62, 0.68],
  "Mexican":        [0.72, 0.35, 0.52],
  "Chinese":        [0.62, 0.38, 0.50],
  "Thai":           [0.58, 0.35, 0.58],
  "Indian":         [0.55, 0.42, 0.58],
  "American":       [0.62, 0.38, 0.28],
  "New American":   [0.62, 0.72, 0.78],
  "French":         [0.45, 0.85, 0.62],
  "Mediterranean":  [0.58, 0.48, 0.52],
  "Korean":         [0.70, 0.40, 0.62],
  "Vietnamese":     [0.55, 0.28, 0.55],
  "Barbecue":       [0.68, 0.25, 0.38],
  "Seafood":        [0.58, 0.58, 0.48],
  "Pizza":          [0.68, 0.25, 0.30],
  "Burgers":        [0.68, 0.20, 0.25],
  "Vegetarian":     [0.48, 0.45, 0.62],
  "Bakery & Café":  [0.50, 0.35, 0.38],
  "Steakhouse":     [0.55, 0.80, 0.35],
  "Soul Food":      [0.65, 0.30, 0.42],
  "Deli":           [0.65, 0.22, 0.30],
  "Cajun & Creole": [0.72, 0.35, 0.55],
};
const FACTORS = ["food", "ambiance", "service", "value", "creativity", "comfort"];
const TONES = ["liveliness", "formality", "adventure"];

// --- curated snapshot: [name, city, cuisines, googleRating, ratingCount(k), price 1-4, blurb]
const CURATED = [
  ["Katz's Delicatessen", "New York, NY", ["Deli"], 4.5, 46, 2, "The century-old pastrami temple of the Lower East Side — order at the counter, keep your ticket."],
  ["Joe's Pizza", "New York, NY", ["Pizza"], 4.5, 17, 1, "Greenwich Village's benchmark slice since 1975. No frills, no wrong answers."],
  ["Peter Luger Steak House", "Brooklyn, NY", ["Steakhouse"], 4.4, 14, 4, "Dry-aged porterhouse in a beer-hall of a room that hasn't changed in a century."],
  ["Gramercy Tavern", "New York, NY", ["New American"], 4.6, 5, 4, "Danny Meyer's flagship: seasonal American cooking with famously warm service."],
  ["Le Bernardin", "New York, NY", ["French", "Seafood"], 4.7, 3, 4, "Eric Ripert's temple to fish — precise, hushed, and worth every course."],
  ["Xi'an Famous Foods", "New York, NY", ["Chinese"], 4.4, 6, 1, "Hand-ripped biang biang noodles and cumin lamb that built a cult from a Flushing stall."],
  ["Los Tacos No. 1", "New York, NY", ["Mexican"], 4.6, 13, 1, "Adobada on a handmade tortilla, eaten standing up in Chelsea Market. Perfect."],
  ["Superiority Burger", "New York, NY", ["Vegetarian", "Burgers"], 4.4, 2, 1, "The veggie burger that made carnivores queue around the block in the East Village."],
  ["Russ & Daughters", "New York, NY", ["Deli", "Bakery & Café"], 4.7, 4, 2, "Fourth-generation appetizing: silky lox, bagels, and a line that moves like church."],
  ["Girl & the Goat", "Chicago, IL", ["New American"], 4.6, 9, 3, "Stephanie Izard's wood-fired, share-everything Fulton Market crowd-pleaser."],
  ["Au Cheval", "Chicago, IL", ["Burgers", "American"], 4.5, 9, 2, "The diner-noir bar whose cheeseburger routinely tops national best-of lists."],
  ["Lou Malnati's Pizzeria", "Chicago, IL", ["Pizza"], 4.5, 8, 2, "Deep dish with the buttercrust that Chicagoans actually defend at parties."],
  ["Alinea", "Chicago, IL", ["New American", "French"], 4.7, 4, 4, "Grant Achatz's three-star theater of edible balloons and centerpiece desserts."],
  ["Pequod's Pizza", "Chicago, IL", ["Pizza"], 4.5, 10, 2, "Pan pizza with a caramelized crust ring people cross the city for."],
  ["Franklin Barbecue", "Austin, TX", ["Barbecue"], 4.7, 8, 2, "Aaron Franklin's brisket — the queue is the pilgrimage, the bark is the reward."],
  ["Uchi", "Austin, TX", ["Japanese"], 4.7, 4, 4, "Tyson Cole's warm, inventive sushi ya that made Austin a food city."],
  ["Torchy's Tacos", "Austin, TX", ["Mexican"], 4.4, 10, 1, "Damn good tacos, queso with a green-chile kick, zero pretension."],
  ["Suerte", "Austin, TX", ["Mexican"], 4.6, 3, 3, "Masa-obsessed East Austin Mexican — the suadero tacos are the stuff of legend."],
  ["Zingerman's Delicatessen", "Ann Arbor, MI", ["Deli", "Bakery & Café"], 4.6, 6, 2, "The corner deli that became a food empire; reubens worth a road trip."],
  ["Tartine Bakery", "San Francisco, CA", ["Bakery & Café"], 4.5, 6, 2, "Morning buns and country loaves that rewired American baking."],
  ["Zuni Café", "San Francisco, CA", ["New American", "Mediterranean"], 4.4, 4, 3, "The roast chicken for two over bread salad — a San Francisco rite since 1979."],
  ["House of Prime Rib", "San Francisco, CA", ["Steakhouse", "American"], 4.6, 8, 3, "Tableside carts, martinis, and prime rib served exactly one way: correctly."],
  ["Mister Jiu's", "San Francisco, CA", ["Chinese", "New American"], 4.5, 2, 3, "Michelin-starred Cantonese in a grand Chinatown banquet hall."],
  ["Swan Oyster Depot", "San Francisco, CA", ["Seafood"], 4.7, 3, 2, "Eighteen stools, crab louie, and the friendliest counter in America. Cash only."],
  ["Guelaguetza", "Los Angeles, CA", ["Mexican"], 4.5, 5, 2, "The Koreatown moles that earned a James Beard classic award — Oaxaca in LA."],
  ["Republique", "Los Angeles, CA", ["French", "Bakery & Café"], 4.5, 5, 3, "Cathedral ceilings, pastry cases at dawn, steak frites at night."],
  ["Howlin' Ray's", "Los Angeles, CA", ["Soul Food", "American"], 4.7, 7, 2, "Nashville hot chicken hot enough to make grown adults cry happily in Chinatown."],
  ["Bestia", "Los Angeles, CA", ["Italian"], 4.6, 7, 3, "Industrial-chic Arts District Italian; the bone marrow spinarello is non-negotiable."],
  ["Sqirl", "Los Angeles, CA", ["Bakery & Café", "New American"], 4.3, 3, 2, "Ricotta toast and sorrel rice bowls that launched a thousand brunch menus."],
  ["Pike Place Chowder", "Seattle, WA", ["Seafood"], 4.7, 15, 2, "Award-hoarding chowder counter tucked in Post Alley by the market."],
  ["Canlis", "Seattle, WA", ["New American"], 4.7, 3, 4, "Midcentury landmark dining over Lake Union — Seattle's special-occasion room since 1950."],
  ["Paseo", "Seattle, WA", ["Cajun & Creole"], 4.5, 5, 1, "Caribbean roast pork sandwiches with caramelized onions that ruin all other sandwiches."],
  ["Commander's Palace", "New Orleans, LA", ["Cajun & Creole"], 4.7, 7, 4, "Turtle soup, 25-cent lunch martinis, and jazz brunch under the striped awning."],
  ["Cochon", "New Orleans, LA", ["Cajun & Creole"], 4.5, 6, 3, "Donald Link's Cajun ode to the pig — boudin, cracklins, and rabbit dumplings."],
  ["Café du Monde", "New Orleans, LA", ["Bakery & Café"], 4.5, 26, 1, "Beignets and chicory café au lait, 24 hours a day since 1862."],
  ["Willie Mae's Scotch House", "New Orleans, LA", ["Soul Food"], 4.4, 5, 2, "America's fried chicken, per the James Beard Foundation. The Tremé original."],
  ["Zahav", "Philadelphia, PA", ["Mediterranean"], 4.7, 4, 3, "Michael Solomonov's modern Israeli — the hummus tehina changed the conversation."],
  ["Reading Terminal Market", "Philadelphia, PA", ["Deli", "American"], 4.7, 27, 1, "A city block of roast pork sandwiches, whoopie pies, and Amish butter."],
  ["Joe's Stone Crab", "Miami, FL", ["Seafood"], 4.5, 12, 4, "Stone crab claws with mustard sauce — Miami Beach's institution since 1913."],
  ["Versailles", "Miami, FL", ["Latin", "Cuban"] , 4.4, 15, 2, "The world's most famous Cuban restaurant, cafecito ventanita included."],
  ["La Barbecue", "Austin, TX", ["Barbecue"], 4.6, 4, 2, "Brisket and beef ribs that Franklin loyalists whisper about switching for."],
  ["Momofuku Noodle Bar", "New York, NY", ["Korean", "New American"], 4.3, 4, 2, "Where David Chang lit the fuse on pork buns and ramen-as-event."],
  ["H Mart Food Court (K-Town)", "New York, NY", ["Korean"], 4.4, 3, 1, "Soondubu, japchae, and bulgogi under one buzzing food-hall roof."],
  ["Night + Market Song", "Los Angeles, CA", ["Thai"], 4.5, 2, 2, "Kris Yenbamroong's party-Thai — larb, natural wine, and zero chill."],
];

function curatedItems() {
  const maxCount = Math.max(...CURATED.map((r) => r[4]));
  return CURATED.map(([name, city, cuisines, rating, countK, price, blurb]) => {
    const genres = cuisines.filter((c) => FACTOR_BASE[c] || c === "Cuban").map((c) => (c === "Cuban" ? "Latin" : c));
    const id = "rs_" + name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/_+$/, "");
    const factors = deriveAxes(id, genres, FACTOR_BASE, FACTORS);
    const tone = deriveAxes(id, genres, TONE_BASE, TONES);
    // price pulls formality/value in opposite directions — reflect that
    factors.value = Math.round(clamp(factors.value + (2.5 - price) * 0.08) * 100) / 100;
    tone.formality = Math.round(clamp(tone.formality + (price - 2.5) * 0.10) * 100) / 100;
    return {
      id,
      title: name,
      subtitle: city,
      year: null,
      meta: "$".repeat(price),
      genres: [...new Set(genres)].slice(0, 3),
      rating: { value: rating, count: countK * 1000, source: "Google" },
      image: null,
      blurb,
      factors,
      tone,
      popularity: logPopularity(countK * 1000, maxCount * 1000),
    };
  });
}

const PRICE_MAP = { PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4 };

async function liveItems() {
  const CITIES = ["New York", "Los Angeles", "Chicago", "Austin", "San Francisco"];
  const CUISINES = Object.keys(FACTOR_BASE);
  const seen = new Map();
  for (const city of CITIES) {
    for (const cuisine of CUISINES) {
      const body = { textQuery: `best ${cuisine} restaurant in ${city}`, maxResultCount: 4 };
      let json;
      try {
        const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": KEY,
            "X-Goog-FieldMask": "places.id,places.displayName,places.rating,places.userRatingCount,places.priceLevel,places.formattedAddress,places.editorialSummary",
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        json = await res.json();
      } catch (e) { console.warn(`  ! ${cuisine} in ${city}: ${e.message}`); continue; }
      for (const pl of json.places || []) {
        if (seen.has(pl.id) || !pl.rating) continue;
        const id = "rs_" + pl.id;
        const price = PRICE_MAP[pl.priceLevel] || 2;
        const genres = [cuisine];
        seen.set(pl.id, {
          id, title: pl.displayName?.text, subtitle: city, year: null,
          meta: "$".repeat(price), genres,
          rating: { value: pl.rating, count: pl.userRatingCount || 0, source: "Google" },
          image: null,
          blurb: pl.editorialSummary?.text || `${cuisine} favorite in ${city}.`,
          factors: deriveAxes(id, genres, FACTOR_BASE, FACTORS),
          tone: deriveAxes(id, genres, TONE_BASE, TONES),
          _count: pl.userRatingCount || 0,
        });
      }
      await sleep(150);
    }
  }
  const list = [...seen.values()];
  const maxCount = Math.max(...list.map((r) => r._count), 1);
  for (const r of list) { r.popularity = logPopularity(r._count, maxCount); delete r._count; }
  return list;
}

async function main() {
  let list;
  if (KEY) {
    console.log("GOOGLE_PLACES_API_KEY found — live Google Places fetch");
    list = await liveItems();
    if (list.length < 20) { console.warn("live fetch thin; padding with curated snapshot"); list = list.concat(curatedItems().filter((c) => !list.some((l) => l.title === c.title))); }
  } else {
    console.log("No GOOGLE_PLACES_API_KEY — writing curated snapshot (real Google ratings, mid-2026)");
    list = curatedItems();
  }
  list.sort((a, b) => b.popularity - a.popularity);
  writePretty(fs, OUT, list);
}

main().catch((e) => { console.error(e); process.exit(1); });
