// ============================================================================
// fetch-music.mjs — build src/data/music.json from two keyless catalog APIs:
//   1. Deezer per-genre charts  -> tracks, album art, 30s previews, and `rank`
//      (Deezer's 0..1M popularity signal) which we surface as the listener score
//   2. iTunes Search API        -> Apple Music links + artwork for the same
//      tracks where a confident match exists (best-effort, throttled)
// Spotify's Web API needs OAuth client credentials, so it's not used for the
// bundled seed; the item schema (id/title/artist/preview/links) is compatible
// if a keyed Spotify fetcher is added later.
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveAxes, assignPercentilePopularity, getJSON, sleep, writePretty } from "./lib/derive.mjs";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/data/music.json");
const ENRICH_ITUNES = process.env.SKIP_ITUNES ? false : true;
// Deezer caps a genre chart around 100; 50 keeps the tail listenable.
const PER_GENRE = +(process.env.PER_GENRE || 50);

// our genre chip -> Deezer genre name (matched against /genre listing)
const GENRES = [
  ["Pop", "Pop"],
  ["Rock", "Rock"],
  ["Hip-Hop", "Rap/Hip Hop"],
  ["R&B", "R&B"],
  ["Electronic", "Electro"],
  ["Dance", "Dance"],
  ["Alternative", "Alternative"],
  ["Jazz", "Jazz"],
  ["Classical", "Classical"],
  ["Country", "Country"],
  ["Metal", "Metal"],
  ["Latin", "Latin Music"],
  ["Soul", "Soul & Funk"],
  ["Folk", "Folk"],
  ["K-Pop", "K-Pop"],
  ["Reggae", "Reggae"],
  ["Blues", "Blues"],
  ["Reggaeton", "Reggaeton"],
  ["Afrobeats", "African Music"],
  ["Brazilian", "Brazilian Music"],
  ["Indian", "Indian Music"],
  ["Asian", "Asian Music"],
  ["Salsa", "Salsa"],
  ["Cumbia", "Cumbia"],
  ["Gospel", "Christian"],
  ["Soundtrack", "Films/Games"],
];

// factors: [melody, lyrics, production, rhythm, vocals, originality]
// tones:   [energy, darkness, density]
const FACTOR_BASE = {
  "Pop":        [0.88, 0.55, 0.82, 0.72, 0.78, 0.50],
  "Rock":       [0.72, 0.62, 0.68, 0.75, 0.68, 0.62],
  "Hip-Hop":    [0.55, 0.88, 0.82, 0.90, 0.62, 0.68],
  "R&B":        [0.75, 0.68, 0.80, 0.78, 0.88, 0.58],
  "Electronic": [0.68, 0.30, 0.92, 0.88, 0.35, 0.72],
  "Dance":      [0.72, 0.35, 0.88, 0.92, 0.52, 0.55],
  "Alternative":[0.70, 0.72, 0.70, 0.65, 0.65, 0.78],
  "Jazz":       [0.78, 0.35, 0.72, 0.85, 0.55, 0.80],
  "Classical":  [0.90, 0.15, 0.75, 0.55, 0.25, 0.72],
  "Country":    [0.72, 0.82, 0.62, 0.62, 0.75, 0.45],
  "Metal":      [0.58, 0.55, 0.72, 0.80, 0.55, 0.62],
  "Latin":      [0.78, 0.58, 0.75, 0.92, 0.72, 0.55],
  "Soul":       [0.80, 0.70, 0.72, 0.78, 0.92, 0.60],
  "Folk":       [0.75, 0.88, 0.52, 0.48, 0.72, 0.62],
  "K-Pop":      [0.85, 0.48, 0.90, 0.82, 0.78, 0.60],
  "Reggae":     [0.78, 0.75, 0.62, 0.88, 0.72, 0.58],
  "Blues":      [0.75, 0.85, 0.55, 0.70, 0.85, 0.55],
  "Reggaeton":  [0.70, 0.55, 0.85, 0.95, 0.65, 0.50],
  "Afrobeats":  [0.78, 0.58, 0.80, 0.92, 0.72, 0.65],
  "Brazilian":  [0.82, 0.65, 0.68, 0.88, 0.78, 0.62],
  "Indian":     [0.85, 0.70, 0.72, 0.80, 0.88, 0.68],
  "Asian":      [0.82, 0.55, 0.85, 0.78, 0.78, 0.60],
  "Salsa":      [0.75, 0.60, 0.70, 0.95, 0.78, 0.55],
  "Cumbia":     [0.72, 0.58, 0.62, 0.92, 0.70, 0.52],
  "Gospel":     [0.80, 0.82, 0.68, 0.72, 0.95, 0.52],
  "Soundtrack": [0.85, 0.20, 0.88, 0.60, 0.30, 0.75],
};
const TONE_BASE = {
  "Pop":        [0.68, 0.35, 0.68],
  "Rock":       [0.70, 0.55, 0.62],
  "Hip-Hop":    [0.72, 0.58, 0.58],
  "R&B":        [0.48, 0.45, 0.68],
  "Electronic": [0.78, 0.48, 0.75],
  "Dance":      [0.88, 0.32, 0.72],
  "Alternative":[0.55, 0.62, 0.58],
  "Jazz":       [0.42, 0.45, 0.55],
  "Classical":  [0.35, 0.45, 0.62],
  "Country":    [0.52, 0.38, 0.48],
  "Metal":      [0.92, 0.82, 0.85],
  "Latin":      [0.82, 0.30, 0.65],
  "Soul":       [0.52, 0.42, 0.62],
  "Folk":       [0.35, 0.45, 0.32],
  "K-Pop":      [0.82, 0.30, 0.80],
  "Reggae":     [0.55, 0.38, 0.55],
  "Blues":      [0.45, 0.62, 0.45],
  "Reggaeton":  [0.88, 0.40, 0.70],
  "Afrobeats":  [0.80, 0.30, 0.68],
  "Brazilian":  [0.70, 0.35, 0.60],
  "Indian":     [0.68, 0.35, 0.72],
  "Asian":      [0.72, 0.38, 0.72],
  "Salsa":      [0.88, 0.28, 0.75],
  "Cumbia":     [0.78, 0.30, 0.62],
  "Gospel":     [0.65, 0.25, 0.70],
  "Soundtrack": [0.55, 0.55, 0.80],
};
const FACTORS = ["melody", "lyrics", "production", "rhythm", "vocals", "originality"];
const TONES = ["energy", "darkness", "density"];

const norm = (s) => s.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

async function main() {
  // Resolve Deezer genre ids by name so hardcoded ids can't go stale.
  const { data: deezerGenres } = await getJSON("https://api.deezer.com/genre");
  const idByName = Object.fromEntries(deezerGenres.map((g) => [g.name.toLowerCase(), g.id]));

  const seen = new Map(); // "artist|title" -> item
  for (const [chip, deezerName] of GENRES) {
    const gid = idByName[deezerName.toLowerCase()];
    if (gid == null) { console.warn(`  ! no Deezer genre for ${deezerName}`); continue; }
    let data = [];
    try {
      ({ data = [] } = await getJSON(`https://api.deezer.com/chart/${gid}/tracks?limit=${PER_GENRE}`));
    } catch (e) { console.warn(`  ! chart ${deezerName}: ${e.message}`); continue; }
    for (const [pos, t] of data.entries()) {
      const key = norm(t.artist.name) + "|" + norm(t.title);
      if (seen.has(key)) {
        const it = seen.get(key);
        if (!it.genres.includes(chip) && it.genres.length < 3) it.genres.push(chip);
        continue;
      }
      seen.set(key, {
        id: "tr_" + t.id,
        title: t.title,
        subtitle: t.artist.name,
        year: null,
        meta: `${Math.floor(t.duration / 60)}:${String(t.duration % 60).padStart(2, "0")}`,
        genres: [chip],
        rating: {
          value: null, // music has no star rating — popularity is the signal
          count: t.rank, // Deezer rank, 0..~1,000,000
          source: "Deezer",
        },
        image: t.album?.cover_medium || null,
        blurb: t.album?.title && norm(t.album.title) !== norm(t.title)
          ? `#${pos + 1} on Deezer's ${chip} chart — ${t.artist.name}, from the album “${t.album.title}”.`
          : `#${pos + 1} on Deezer's ${chip} chart — a standalone ${t.artist.name} single, ${Math.floor(t.duration / 60)}:${String(t.duration % 60).padStart(2, "0")} long.`,
        links: { deezer: t.link, preview: t.preview || null },
        _rank: t.rank,
      });
    }
    console.log(`  ${chip}: kept ${data.length}`);
    await sleep(250);
  }

  const list = [...seen.values()];
  // Deezer's `rank` is ALREADY a 0..1,000,000 popularity index, so the log
  // scaling this used to apply compressed everything into the top: half the
  // catalogue read 95+ and every track looked equally huge, which also
  // flattened novelty to ~0.05 and quietly broke the hidden-gems row.
  //   - popularity: percentile within this chart sweep, matching how TV does
  //     it, so the explore dial and gems have a real spread to work with
  //   - rating.value: Deezer's own index rescaled 1..100, not a curve of ours
  assignPercentilePopularity(list, (t) => t._rank);
  for (const t of list) {
    t.rating.value = Math.max(1, Math.min(100, Math.round(t._rank / 10000)));
    t.factors = deriveAxes(t.id, t.genres, FACTOR_BASE, FACTORS);
    t.tone = deriveAxes(t.id, t.genres, TONE_BASE, TONES);
    delete t._rank;
  }

  // Best-effort Apple Music enrichment (throttled; failures are non-fatal).
  if (ENRICH_ITUNES) {
    let hits = 0;
    for (const t of list) {
      try {
        const q = encodeURIComponent(`${t.subtitle} ${t.title}`.slice(0, 80));
        const { results = [] } = await getJSON(`https://itunes.apple.com/search?term=${q}&entity=song&limit=1`);
        const m = results[0];
        if (m && norm(m.artistName).includes(norm(t.subtitle).split(" ")[0])) {
          t.links.appleMusic = m.trackViewUrl;
          t.year = t.year || (m.releaseDate ? +m.releaseDate.slice(0, 4) : null);
          if (!t.image && m.artworkUrl100) t.image = m.artworkUrl100;
          hits++;
        }
      } catch { /* rate-limited or no match — keep Deezer data */ }
      await sleep(350);
    }
    console.log(`  iTunes enrichment: ${hits}/${list.length} matched`);
  }

  list.sort((a, b) => b.popularity - a.popularity);
  writePretty(fs, OUT, list);
}

main().catch((e) => { console.error(e); process.exit(1); });
