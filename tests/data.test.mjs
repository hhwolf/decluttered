// Dataset validation — every catalogue the fetchers produce must satisfy the
// item contract the engine and UI rely on.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = (f) => JSON.parse(fs.readFileSync(path.join(root, "src/data", f), "utf8"));

const DOMAINS = [
  ["books.json", ["writing", "plot", "pacing", "character", "originality", "atmosphere"], ["darkness", "complexity", "emotion"], 40],
  ["restaurants.json", ["food", "ambiance", "service", "value", "creativity", "comfort"], ["liveliness", "formality", "adventure"], 30],
  ["music.json", ["melody", "lyrics", "production", "rhythm", "vocals", "originality"], ["energy", "darkness", "density"], 40],
  ["movies.json", ["story", "acting", "direction", "visuals", "pacing", "originality"], ["darkness", "intensity", "emotion"], 500],
  ["tv.json", ["story", "characters", "writing", "acting", "production", "bingeability"], ["darkness", "complexity", "comfort"], 50],
];

let pass = 0, fail = 0;
const bad = [];
function check(name, cond, detail = "") {
  if (cond) pass++;
  else { fail++; bad.push(`FAIL  ${name}  ${detail}`); }
}
const in01 = (x) => typeof x === "number" && x >= 0 && x <= 1;

for (const [file, factors, tones, minCount] of DOMAINS) {
  const items = load(file);
  const t = (n) => `[${file}] ${n}`;
  check(t(`catalogue has >= ${minCount} items`), items.length >= minCount, `${items.length}`);
  check(t("ids unique"), new Set(items.map((i) => i.id)).size === items.length);
  check(t("titles present"), items.every((i) => i.title && i.title.length > 0));
  check(t("subtitles present"), items.every((i) => i.subtitle && i.subtitle.length > 0));
  check(t("every item has 1-3 genres"), items.every((i) => Array.isArray(i.genres) && i.genres.length >= 1 && i.genres.length <= 3));
  check(t("factors complete & in 0..1"), items.every((i) => factors.every((k) => in01(i.factors?.[k]))));
  check(t("tones complete & in 0..1"), items.every((i) => tones.every((k) => in01(i.tone?.[k]))));
  check(t("popularity in 0..1"), items.every((i) => in01(i.popularity)));
  check(t("rating object present"), items.every((i) => i.rating && i.rating.source));
  check(t("rating values sane"), items.every((i) => {
    const v = i.rating.value;
    if (v == null) return false;
    const scale = i.rating.scale || (i.rating.source === "Deezer" ? 100 : 5);
    return v >= 0 && v <= scale;
  }));
  check(t("blurbs present"), items.every((i) => i.blurb && i.blurb.length > 8));
  // variance sanity: derived vectors must not be flat
  const spread = (k) => {
    const vs = items.map((i) => i.factors[k]);
    return Math.max(...vs) - Math.min(...vs);
  };
  check(t("factor axes have spread"), factors.every((k) => spread(k) > 0.15),
    factors.map((k) => `${k}:${spread(k).toFixed(2)}`).join(" "));
  const genreCount = new Set(items.flatMap((i) => i.genres)).size;
  check(t("genre variety >= 8"), genreCount >= 8, `${genreCount}`);
}

// music-specific: links for streaming
{
  const music = load("music.json");
  const withPreview = music.filter((m) => m.links?.preview).length;
  const withApple = music.filter((m) => m.links?.appleMusic).length;
  check("[music.json] most tracks have a 30s preview", withPreview / music.length > 0.8, `${withPreview}/${music.length}`);
  check("[music.json] >40% have Apple Music links", withApple / music.length > 0.4, `${withApple}/${music.length}`);
  check("[music.json] artwork present", music.filter((m) => m.image).length / music.length > 0.9);
}
// books-specific: real reader ratings
{
  const books = load("books.json");
  check("[books.json] real rating counts", books.every((b) => b.rating.count >= 20));
  check("[books.json] covers present", books.filter((b) => b.image).length / books.length > 0.8);
}

console.log(bad.join("\n"));
console.log(`\n=== data: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
