// Describe suite — the words we put on a card, derived from vectors we already
// compute. Pure functions, no network.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { vibeWords, strengths, counterpoint, commitment, runStatus } from "../src/engine/describe.mjs";

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

// ---- against the real catalogues -----------------------------------------
const restaurants = load("restaurants.json");
const withVibe = restaurants.filter((r) => vibeWords(r, rest).length > 0);
check("most real restaurants produce a vibe", withVibe.length / restaurants.length > 0.5,
  `${withVibe.length}/${restaurants.length}`);
check("vibe words are never empty strings", restaurants.every((r) => vibeWords(r, rest).every((w) => w && w.length > 2)));

console.log(`\n=== describe: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
