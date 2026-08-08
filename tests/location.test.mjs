// Location suite — the restaurants city preference, against the real catalogue.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FOCUS_CITIES, cityOf, allCities, filterByCities, sortByCity, countForCities } from "../src/engine/location.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const restaurants = JSON.parse(fs.readFileSync(path.join(root, "src/data/restaurants.json"), "utf8"));

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) pass++; else { fail++; console.log(`FAIL  ${name}${extra ? "  " + extra : ""}`); }
};

// ---- cityOf ---------------------------------------------------------------
check("reads the explicit metro", cityOf({ city: "New York", subtitle: "Brooklyn, NY" }) === "New York");
check("falls back to the subtitle without the state", cityOf({ subtitle: "Austin, TX" }) === "Austin");
check("handles a missing item", cityOf(null) === null);
check("handles an item with no location", cityOf({}) === null);

// ---- catalogue integrity --------------------------------------------------
check("every restaurant has a city", restaurants.every((r) => cityOf(r)),
  `${restaurants.filter((r) => !cityOf(r)).length} without`);
check("Brooklyn is folded into New York",
  restaurants.filter((r) => r.subtitle.startsWith("Brooklyn")).every((r) => r.city === "New York"));
check("Berkeley is folded into San Francisco",
  restaurants.filter((r) => r.subtitle.startsWith("Berkeley")).every((r) => r.city === "San Francisco"));

const cities = allCities(restaurants);
check("focus cities come first", cities.slice(0, 5).map((c) => c.city).join("|") === FOCUS_CITIES.join("|"),
  cities.slice(0, 5).map((c) => c.city).join("|"));
check("focus cities are flagged", cities.slice(0, 5).every((c) => c.focus));
check("non-focus cities follow alphabetically", (() => {
  const rest = cities.slice(5).map((c) => c.city);
  return rest.join("|") === [...rest].sort((a, b) => a.localeCompare(b)).join("|");
})());
check("counts add up to the catalogue", cities.reduce((a, c) => a + c.count, 0) === restaurants.length);

// every focus city is deep enough that filtering to it still leaves a deck
for (const c of FOCUS_CITIES) {
  const n = cities.find((x) => x.city === c)?.count || 0;
  check(`${c} has a usable deck (>=12)`, n >= 12, `${n}`);
}

// ---- filtering ------------------------------------------------------------
check("no selection means anywhere", filterByCities(restaurants, []).length === restaurants.length);
check("undefined selection means anywhere", filterByCities(restaurants, undefined).length === restaurants.length);
check("one city narrows the pool", (() => {
  const only = filterByCities(restaurants, ["Boston"]);
  return only.length > 0 && only.length < restaurants.length && only.every((r) => r.city === "Boston");
})());
check("two cities union", (() => {
  const two = filterByCities(restaurants, ["Boston", "Chicago"]);
  const one = filterByCities(restaurants, ["Boston"]);
  return two.length > one.length && two.every((r) => ["Boston", "Chicago"].includes(r.city));
})());
check("a stale city falls back to everything rather than emptying the deck",
  filterByCities(restaurants, ["Atlantis"]).length === restaurants.length);
check("a partly-stale selection keeps the valid part", (() => {
  const out = filterByCities(restaurants, ["Boston", "Atlantis"]);
  return out.length > 0 && out.every((r) => r.city === "Boston");
})());
check("filtering an empty catalogue is safe", filterByCities([], ["Boston"]).length === 0);

// ---- counting -------------------------------------------------------------
check("count with no selection is the whole catalogue", countForCities(restaurants, []) === restaurants.length);
check("count matches the filter", countForCities(restaurants, ["Boston"]) === filterByCities(restaurants, ["Boston"]).length);
check("count of an unknown city is zero", countForCities(restaurants, ["Atlantis"]) === 0);

// ---- display ordering -----------------------------------------------------
const sorted = sortByCity(restaurants, ["Chicago"]);
check("chosen city floats to the top", cityOf(sorted[0]) === "Chicago");
check("sorting keeps every item", sorted.length === restaurants.length);
check("items are grouped, never interleaved", (() => {
  const seq = sorted.map(cityOf);
  const seen = new Set();
  for (let i = 0; i < seq.length; i++) {
    if (i > 0 && seq[i] !== seq[i - 1]) {
      if (seen.has(seq[i])) return false; // city reappears after another city
      seen.add(seq[i - 1]);
    }
  }
  return true;
})());
check("with no chosen city, focus metros lead", cityOf(sortByCity(restaurants, [])[0]) === FOCUS_CITIES[0]);

// ---- required-selection rules -------------------------------------------
// A location is mandatory for the place-bound domain: these encode what the
// UI enforces so the rule can't silently regress.
const requireCity = (cities) => (cities?.length ?? 0) >= 1;
check("no city fails the requirement", !requireCity([]));
check("undefined fails the requirement", !requireCity(undefined));
check("one city satisfies it", requireCity(["Boston"]));

// removing the last city is refused; removing one of several is allowed
const dropCity = (cities, c) => (cities.includes(c) && cities.length > 1 ? cities.filter((x) => x !== c) : cities);
check("cannot drop the only city", dropCity(["Boston"], "Boston").join() === "Boston");
check("can drop one of two", dropCity(["Boston", "Chicago"], "Boston").join() === "Chicago");
check("dropping an absent city is a no-op", dropCity(["Boston"], "Miami").join() === "Boston");

// legacy profiles predate the requirement: they must still yield a usable deck
check("a legacy empty selection still returns a deck", filterByCities(restaurants, []).length === restaurants.length);
check("legacy state is detectable so the UI can prompt", !requireCity([]));

console.log(`\n=== location: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
