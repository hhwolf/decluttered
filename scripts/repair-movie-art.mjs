// Patch pass: fill in any movies.json entries whose Wikipedia art/blurb fetch
// was throttled during the main run. Slow and polite on purpose; idempotent.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getJSON, sleep } from "./lib/derive.mjs";

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/data/movies.json");
// wiki titles for entries whose plain title is ambiguous (kept in sync with fetch-movies.mjs)
const WIKI = {
  "12 Angry Men": "12 Angry Men (1957 film)", "Se7en": "Seven (1995 film)", "Interstellar": "Interstellar (film)",
  "The Silence of the Lambs": "The Silence of the Lambs (film)", "The Green Mile": "The Green Mile (film)",
  "City of God": "City of God (2002 film)", "Parasite": "Parasite (2019 film)", "Gladiator": "Gladiator (2000 film)",
  "The Prestige": "The Prestige (film)", "Whiplash": "Whiplash (2014 film)", "The Pianist": "The Pianist (2002 film)",
  "Alien": "Alien (film)", "Casablanca": "Casablanca (film)", "Psycho": "Psycho (1960 film)",
  "Apocalypse Now": "Apocalypse Now", "Memento": "Memento (film)", "The Shining": "The Shining (film)",
  "Coco": "Coco (2017 film)", "Come and See": "Come and See", "Oldboy": "Oldboy (2003 film)",
  "Braveheart": "Braveheart", "2001: A Space Odyssey": "2001: A Space Odyssey (film)",
  "Lawrence of Arabia": "Lawrence of Arabia (film)", "Heat": "Heat (1995 film)", "Oppenheimer": "Oppenheimer (film)",
  "Jurassic Park": "Jurassic Park (film)", "Jaws": "Jaws (film)", "Her": "Her (film)",
  "Arrival": "Arrival (film)", "Titanic": "Titanic (1997 film)",
};
const firstSentence = (s = "") => { const m = s.match(/^.+?[.!?](?=\s|$)/); return m ? m[0] : s.slice(0, 160); };

const movies = JSON.parse(fs.readFileSync(FILE, "utf8"));
let fixed = 0, still = 0;
for (const m of movies) {
  if (m.image) continue;
  const wikiTitle = WIKI[m.title] || m.title;
  let ok = false;
  for (let attempt = 0; attempt < 4 && !ok; attempt++) {
    try {
      const w = await getJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`,
        { headers: { "User-Agent": "decluttered-seed/0.3 (personal project)" } });
      if (w.thumbnail?.source) { m.image = w.thumbnail.source; fixed++; ok = true; }
      if (w.extract && / landmark from \d{4}\.$/.test(m.blurb)) m.blurb = firstSentence(w.extract);
      if (!ok) break; // page exists but no thumbnail — nothing to retry
    } catch { await sleep(1200 * (attempt + 1)); }
  }
  if (!ok) { still++; console.log(`  still missing: ${m.title}`); }
  await sleep(800);
}
fs.writeFileSync(FILE, JSON.stringify(movies, null, 1) + "\n");
console.log(`repaired ${fixed}, still missing ${still}, total ${movies.length}`);
