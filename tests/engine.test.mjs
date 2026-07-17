// Engine test suite — the Shelf MVP's verified cases, generalized: the whole
// suite runs once per domain (books / restaurants / music) against the REAL
// fetched catalogue, so regressions in either the engine or the data surface.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildInitialProfile, scoreItem, rankItems, updateProfileFromAction,
  applyRating, itemVector, cosineSim, setExplore,
} from "../src/engine/engine.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = (f) => JSON.parse(fs.readFileSync(path.join(root, "src/data", f), "utf8"));

// disjoint genre pairs chosen per domain so love/avoid assertions are clean
const SUITES = [
  {
    domain: { key: "books", factors: ["writing", "plot", "pacing", "character", "originality", "atmosphere"], tones: ["darkness", "complexity", "emotion"] },
    items: load("books.json"),
    love: ["Fantasy", "Science Fiction"], avoid: ["Romance", "Memoir"],
    altLove: ["Philosophy", "Classics"], altAvoid: ["Young Adult", "Fantasy"],
  },
  {
    domain: { key: "restaurants", factors: ["food", "ambiance", "service", "value", "creativity", "comfort"], tones: ["liveliness", "formality", "adventure"] },
    items: load("restaurants.json"),
    love: ["Italian", "Pizza"], avoid: ["Steakhouse", "French"],
    altLove: ["Japanese", "Korean"], altAvoid: ["Pizza", "Burgers"],
  },
  {
    domain: { key: "music", factors: ["melody", "lyrics", "production", "rhythm", "vocals", "originality"], tones: ["energy", "darkness", "density"] },
    items: load("music.json"),
    love: ["Pop", "Dance"], avoid: ["Jazz", "Classical"],
    altLove: ["Metal", "Rock"], altAvoid: ["Pop", "Latin"],
  },
];

let pass = 0, fail = 0;
const log = [];
function check(name, cond, detail = "") {
  if (cond) { pass++; }
  else { fail++; log.push(`FAIL  ${name}  ${detail}`); }
}

const hasAny = (item, genres) => (item.genres || []).some((g) => genres.includes(g));
const onlyIn = (items, genres, notIn = []) =>
  items.filter((i) => hasAny(i, genres) && !hasAny(i, notIn));
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

for (const { domain, items, love, avoid, altLove, altAvoid } of SUITES) {
  const D = domain.key;
  const t = (n) => `[${D}] ${n}`;

  // --- primitives ---
  check(t("itemVector length is 9"), itemVector(items[0], domain).length === 9);
  check(t("cosine identical = 1"), Math.abs(cosineSim([1, 2, 3], [1, 2, 3]) - 1) < 1e-9);
  check(t("cosine zero-vector safe"), cosineSim([0, 0], [1, 1]) === 0);

  // --- profile construction ---
  const loved = onlyIn(items, love, avoid);
  const avoided = onlyIn(items, avoid, love);
  check(t("data: enough loved-genre items"), loved.length >= 4, `${loved.length}`);
  check(t("data: enough avoided-genre items"), avoided.length >= 2, `${avoided.length}`);
  const favs = loved.slice(0, 3);
  const surprise = [loved[3]];
  const user = buildInitialProfile(domain, {
    genres: love, avoidGenres: avoid,
    favoriteItems: favs, surprisedLiked: surprise, avoidItems: [avoided[0]],
    weights: Object.fromEntries(domain.factors.map((k, i) => [k, i % 2 ? 0.8 : 0.4])),
    explore: 0.25,
  });
  check(t("genre weights favor loved"), love.every((g) => user.genreWeights[g] > 0));
  check(t("avoid genres are negative"), avoid.every((g) => user.genreWeights[g] < 0));
  check(t("tone target populated"), domain.tones.every((k) => typeof user.toneTarget[k] === "number"));
  check(t("liked anchors recorded"), user.likedVectors.length === 4);
  check(t("avoid anchors recorded"), user.avoidVectors.length === 1);
  check(t("surprise widens tolerance"), user.tolerance > 0.22);

  // --- scoring sanity ---
  const ranked = rankItems(items, user, domain);
  check(t("ranking covers catalogue"), ranked.length === items.length);
  check(t("all scores in 0..100"), ranked.every((r) => r.score >= 0 && r.score <= 100));
  const lovedScores = onlyIn(items, love, avoid).map((i) => scoreItem(i, user, domain).score);
  const avoidScores = onlyIn(items, avoid, love).map((i) => scoreItem(i, user, domain).score);
  check(t("loved-genre items outscore avoided-genre items on average"),
    mean(lovedScores) > mean(avoidScores) + 5,
    `loved=${mean(lovedScores).toFixed(1)} avoided=${mean(avoidScores).toFixed(1)}`);
  check(t("a loved-genre item is in the top 5"), ranked.slice(0, 5).some((r) => hasAny(r.item, love)));

  // --- learning: liking an off-taste genre raises it ---
  const offGenre = altLove.filter((g) => !love.includes(g));
  const offItems = onlyIn(items, offGenre, [...love, ...avoid]);
  if (offItems.length >= 3) {
    let p2 = user;
    const before = scoreItem(offItems[2], p2, domain).score;
    p2 = updateProfileFromAction(p2, offItems[0], "want", domain);
    p2 = updateProfileFromAction(p2, offItems[1], "want", domain);
    p2 = updateProfileFromAction(p2, offItems[2], "consumed", domain, 5);
    const after = scoreItem(offItems[2], p2, domain).score;
    check(t("liking a genre raises its items' scores"), after > before, `before=${before} after=${after}`);
    check(t("interactions counted"), p2.interactions === 3);
  }

  // --- learning: passing lowers ---
  {
    const target = loved[1];
    const before = scoreItem(target, user, domain).score;
    const p3 = updateProfileFromAction(user, target, "pass", domain);
    const after = scoreItem(target, p3, domain).score;
    check(t("passing lowers score"), after < before, `before=${before} after=${after}`);
  }

  // --- "more" is neutral ---
  {
    const before = JSON.stringify(user.genreWeights);
    const p4 = updateProfileFromAction(user, loved[0], "more", domain);
    check(t("'tell me more' does not change genre weights"), JSON.stringify(p4.genreWeights) === before);
  }

  // --- explore: surfacing only, never the match % ---
  const aligned = setExplore(user, 0.05);
  const exploring = setExplore(user, 0.9);
  const lowPop = [...items].sort((a, b) => a.popularity - b.popularity)[0];
  check(t("explore does not change the match %"),
    scoreItem(lowPop, exploring, domain).score === scoreItem(lowPop, aligned, domain).score);
  const rankAligned = rankItems(items, aligned, domain);
  const rankExplore = rankItems(items, exploring, domain);
  const posOf = (rk, id) => rk.findIndex((r) => r.item.id === id);
  check(t("most obscure item ranks higher under high explore"),
    posOf(rankExplore, lowPop.id) < posOf(rankAligned, lowPop.id),
    `aligned#${posOf(rankAligned, lowPop.id)} explore#${posOf(rankExplore, lowPop.id)}`);
  const top10 = (rk) => new Set(rk.slice(0, 10).map((r) => r.item.id));
  const overlap = [...top10(rankAligned)].filter((id) => top10(rankExplore).has(id)).length;
  check(t("explore top-10 differs from aligned top-10"), overlap < 10, `overlap=${overlap}`);

  // --- excludeIds ---
  const r2 = rankItems(items, user, domain, { excludeIds: [ranked[0].item.id] });
  check(t("excludeIds removes an item"), !r2.some((r) => r.item.id === ranked[0].item.id));
  check(t("ranking is stable length"), r2.length === items.length - 1);

  // --- a different user gets different top results ---
  const altLoved = onlyIn(items, altLove, altAvoid);
  if (altLoved.length >= 3) {
    const other = buildInitialProfile(domain, {
      genres: altLove, avoidGenres: altAvoid,
      favoriteItems: altLoved.slice(0, 3),
      weights: Object.fromEntries(domain.factors.map((k, i) => [k, i % 2 ? 0.3 : 0.9])),
      explore: 0.3,
    });
    const otherRanked = rankItems(items, other, domain);
    check(t("two users get different #1 picks"), ranked[0].item.id !== otherRanked[0].item.id,
      `a=${ranked[0].item.title} b=${otherRanked[0].item.title}`);
  }

  // --- immutability of swipe learning ---
  {
    const snapshot = JSON.stringify(user);
    updateProfileFromAction(user, loved[0], "want", domain);
    check(t("updateProfileFromAction does not mutate input"), JSON.stringify(user) === snapshot);
  }

  // --- per-element ratings ---
  const base = buildInitialProfile(domain, {
    genres: [love[0]], favoriteItems: loved.slice(0, 3),
    weights: Object.fromEntries(domain.factors.map((k) => [k, 0.5])), explore: 0.3,
  });
  const item = avoided[1] || avoided[0];
  const F = domain.factors;

  {
    const snap = JSON.stringify(base);
    applyRating(base, item, { overall: 5, elements: { [F[5]]: 5 } }, domain);
    check(t("applyRating does not mutate input"), JSON.stringify(base) === snap);
  }
  {
    const rated = applyRating(base, item, { overall: 5, elements: { [F[5]]: 5, [F[2]]: 1 } }, domain);
    check(t("loved+strong element raises its weight"), rated.factorWeights[F[5]] > base.factorWeights[F[5]]);
    check(t("loved+weak element lowers its weight"), rated.factorWeights[F[2]] < base.factorWeights[F[2]]);
  }
  {
    const once = applyRating(base, item, { overall: 4, elements: { [F[0]]: 5, [F[1]]: 2 } }, domain);
    const twice = applyRating(once, item, { overall: 4, elements: { [F[0]]: 5, [F[1]]: 2 } }, domain);
    check(t("re-rating identically is idempotent"),
      JSON.stringify(once.factorWeights) === JSON.stringify(twice.factorWeights) &&
      JSON.stringify(once.genreWeights) === JSON.stringify(twice.genreWeights) &&
      once.likedVectors.length === twice.likedVectors.length);
  }
  {
    const hi = applyRating(base, item, { overall: 5, elements: { [F[0]]: 5 } }, domain);
    const hiThenLo = applyRating(hi, item, { overall: 1, elements: { [F[0]]: 5 } }, domain);
    const loDirect = applyRating(base, item, { overall: 1, elements: { [F[0]]: 5 } }, domain);
    check(t("re-rating replaces prior contribution"),
      Math.abs(hiThenLo.factorWeights[F[0]] - loDirect.factorWeights[F[0]]) < 1e-9 &&
      Math.abs((hiThenLo.genreWeights[item.genres[0]] || 0) - (loDirect.genreWeights[item.genres[0]] || 0)) < 1e-9);
    check(t("high overall creates one liked anchor"), hi.likedVectors.filter((a) => a.id === item.id).length === 1);
    check(t("low overall creates one avoid anchor (not two)"),
      loDirect.avoidVectors.filter((a) => a.id === item.id).length === 1 &&
      loDirect.likedVectors.filter((a) => a.id === item.id).length === 0);
  }
  {
    const before = scoreItem(item, base, domain).score;
    const glowing = applyRating(base, item, { overall: 5, elements: Object.fromEntries(F.map((k) => [k, 5])) }, domain);
    check(t("a glowing element rating raises the item's own match score"),
      scoreItem(item, glowing, domain).score > before);
  }
  {
    const approxSame = (a, b) => {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const k of keys) if (Math.abs((a[k] || 0) - (b[k] || 0)) > 1e-6) return false;
      return true;
    };
    const cleared = applyRating(
      applyRating(base, item, { overall: 5, elements: { [F[0]]: 5, [F[1]]: 4 } }, domain),
      item, { overall: 0 }, domain);
    check(t("clearing a rating reverts to base"),
      approxSame(cleared.factorWeights, base.factorWeights) &&
      approxSame(cleared.genreWeights, base.genreWeights) &&
      !cleared.ratings[item.id] &&
      cleared.likedVectors.filter((a) => a.id === item.id).length === 0);
  }
}

console.log(log.join("\n"));
console.log(`\n=== engine: ${pass} passed, ${fail} failed (3 domains) ===`);
process.exit(fail === 0 ? 0 : 1);
