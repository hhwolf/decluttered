# Taste — one engine, three cravings

*The idea framework, expanded from the books-only Shelf MVP (and the restaurant
opportunity assessment) to three domains: **books, restaurants, and music**.*

## The thesis

Choice overload is the same disease everywhere: too many books, too many
restaurants, too many songs, and recommendation surfaces that optimize for
engagement instead of taste. The original opportunity assessment concluded that
a *restaurant-only* swipe recommender is a crowded, capital-intensive wedge
(Beli, Zest, Umamii, DoorDash's Zesty) — but it also identified the durable
asset: **a domain-agnostic taste engine that generates proprietary preference
data from day one.** That is exactly what the Shelf MVP built and verified for
books.

This expansion executes on that finding: instead of racing incumbents in one
vertical, the same engine now profiles taste across three, and every swipe in
any vertical deepens one user-owned taste graph. Nobody bootstraps a
restaurant-data moat from zero — but a *cross-domain taste profile* ("you like
atmospheric fantasy, buzzy izakayas, and lush mid-tempo R&B") is a data asset
none of the single-vertical players are building.

## The engine (unchanged math, generalized surface)

Verified by the Shelf MVP test suite and re-verified across all three domains
(105 engine checks). Each item is a 9-dimension vector: 6 **craft factors** +
3 **tone axes**, plus genres and popularity. A profile learns four ways:

1. **Onboarding** — loved/avoided genres, 3+ favorite anchors, factor
   importance sliders, an explore dial.
2. **Swipes** — want/pass nudges genre weights + tone target, adds
   liked/avoid similarity anchors.
3. **Overall ratings** (1–5 stars) after consuming.
4. **Per-element craft ratings** — rating the *components* (prose, service,
   production…) teaches which factors matter to *you* and replaces the seed
   estimate with your perceived vector. Idempotent: re-rating reverts before
   reapplying.

Match % is pure alignment; the explore dial only re-surfaces, never fakes the
number.

## Domain vocabulary

| | **Shelf** (books) | **Table** (restaurants) | **Queue** (music) |
|---|---|---|---|
| Factors | writing, plot, pacing, character, originality, atmosphere | food, ambiance, service, value, creativity, comfort | melody, lyrics, production, rhythm, vocals, originality |
| Tones | darkness, complexity, emotion | liveliness, formality, adventure | energy, darkness, density |
| Genres | 14 genres | 22 cuisines | 14 genres |
| Verbs | want to read / read it | want to try / been there | add to queue / heard it |

## Seed databases & external APIs (researched + verified 2026-07-04)

| Domain | Source | Key? | What we take |
|---|---|---|---|
| Books | **Open Library search API** | none | real reader ratings (`ratings_average`, `ratings_count`), covers, first sentences → 80 books across 14 subjects |
| Books (alt) | Google Books API | shared anonymous quota (often exhausted) or key | `averageRating`/`ratingsCount`; drop-in alternative |
| Music | **Deezer charts + genre APIs** | none | per-genre chart tracks, `rank` (popularity 0–1M), album art, 30s preview MP3s → 107 tracks across 14 genres |
| Music (enrich) | **iTunes/Apple Music Search API** | none | Apple Music links, release year, artwork fallback (71/107 matched) |
| Music (later) | Spotify Web API | OAuth client creds | schema-compatible; add a keyed fetcher when creds exist |
| Restaurants | **Google Places API (New)** | `GOOGLE_PLACES_API_KEY` | real `rating`, `userRatingCount`, `priceLevel`, editorial summaries |
| Restaurants (bundled) | curated snapshot | none | 44 landmark US restaurants with public Google rating values (mid-2026 snapshot) |

Two constraints from the assessment carry over and are respected here:
Goodreads' public API has been dead since 2020 (hence Open Library/Google
Books), and Google/Yelp ToS prohibit training on or long-term caching of their
place data — so the Places fetcher is a refresh path, and the *taste graph*
(not the place data) is the moat.

The fetchers derive the 9-axis craft vectors from per-genre base profiles +
deterministic per-item jitter (real vectors would come from NLP on
reviews/audio analysis later — the engine doesn't care where vectors come
from).

## What stays true from the assessment

- **Monetization is the hard part** — nothing here changes that; this is a
  data-asset play first.
- **The wedge is the cross-domain profile**, not any single vertical.
- Proprietary signal starts at swipe #1: every action writes to a profile the
  user can see (Profile tab shows the live weights) — the transparency
  incumbents lack.
