// Wikidata-sourced restaurants — the filters that decide what is allowed in.
// Pure predicates, no network.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { looksClosed } from "../scripts/fetch-restaurants-wikidata.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const restaurants = JSON.parse(fs.readFileSync(path.join(root, "src/data/restaurants.json"), "utf8"));

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) pass++; else { fail++; console.log(`FAIL  ${name}${extra ? "  " + extra : ""}`); }
};

// ---- closed-restaurant detection -----------------------------------------
// Wikipedia keeps articles long after a place shuts. Sending someone to a
// closed restaurant is worse than omitting it, so these are real examples
// pulled from the sweep.
check("past-tense venue is closed",
  looksClosed("Durgin-Park was a restaurant at 340 Faneuil Hall Marketplace in Downtown Boston that was a popular tourist destination."));
check("past-tense with adjectives is closed",
  looksClosed("The Jacob Wirth Restaurant was a historic German-American restaurant and bar in Boston, Massachusetts."));
check("explicit permanent closure is closed",
  looksClosed("Some Place is a diner in Chicago. The location permanently closed in 2021."));
check("closed in <year> is closed",
  looksClosed("A Place is a restaurant in Miami. It closed in 2019 after a fire."));
check("ceased operations is closed",
  looksClosed("Old Room is a bistro. The business ceased operations last spring."));
check("demolished is closed",
  looksClosed("The Grand is a tavern in Detroit; the building was demolished in 2016."));

// Real leaks from the first sweep: a venue-noun list missed all three because
// none of them says "was a restaurant" in so many words.
check("a dining COMPLEX in the past tense is closed",
  looksClosed("Windows on the World was a complex of dining, meeting, and entertainment venues on the top floors of the North Tower of the original World Trade Center."));
check("a food EMPORIUM in the past tense is closed",
  looksClosed("El Faro Restaurant was a small Spanish food emporium located at 823 Greenwich Street in the West Village of Manhattan."));
check("shuttered counts as closed",
  looksClosed("Somewhere is a spot in Manhattan. El Faro opened in 1927 and shuttered in 2012 after failing to pay fines."));
check("a nightclub in the past tense is closed",
  looksClosed("Angels & Kings was a nightclub in New York City, located at 500 East 11th Street."));
check("an open place with a past-tense ACCOLADE stays open",
  !looksClosed("Mixtli is a Mexican restaurant in San Antonio, Texas. It was a semifinalist in the Outstanding Restaurant category of the James Beard Foundation Awards."));

check("present tense stays open",
  !looksClosed("Fox & the Knife is a restaurant specializing in Italian cuisine and enoteca, founded on February 4, 2019."));
check("past-tense FOUNDING does not mean closed",
  !looksClosed("Katz's Delicatessen is a delicatessen in New York City. It was founded in 1888."));
check("was established does not mean closed",
  !looksClosed("Tadich Grill is a restaurant in San Francisco, California, that was established in 1849."));
check("a past-tense award does not mean closed",
  !looksClosed("Zahav is a restaurant in Philadelphia. It was awarded Outstanding Restaurant in 2019."));
check("empty text is not closed", !looksClosed(""));
check("missing text is not closed", !looksClosed());

// ---- what actually shipped ------------------------------------------------
const wd = restaurants.filter((r) => r.id.startsWith("rs_wd_"));
if (wd.length) {
  check("no shipped Wikidata place reads as closed",
    wd.every((r) => !looksClosed(r.overview || r.blurb || "")),
    wd.filter((r) => looksClosed(r.overview || r.blurb || "")).map((r) => r.title).join(", "));
  check("every Wikidata place has a city", wd.every((r) => r.city));
  check("every Wikidata place has 1-3 genres", wd.every((r) => r.genres.length >= 1 && r.genres.length <= 3));
  check("interest score is on the 100 scale", wd.every((r) => r.rating.scale === 100 && r.rating.value >= 1 && r.rating.value <= 100));
  check("interest is attributed to Wikipedia, never presented as stars",
    wd.every((r) => r.rating.source === "Wikipedia"));
  check("readership count is real", wd.every((r) => typeof r.rating.count === "number" && r.rating.count >= 0));
  check("ids cannot collide with curated ones", wd.every((r) => r.id.startsWith("rs_wd_")));
}

// curated places must keep their real star ratings
const curated = restaurants.filter((r) => !r.id.startsWith("rs_wd_"));
check("curated places keep Google star ratings",
  curated.every((r) => r.rating.source === "Google" && r.rating.value <= 5), `${curated.length} curated`);

console.log(`\n=== wikidata: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
