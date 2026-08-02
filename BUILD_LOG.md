# Taste — build & troubleshooting log

*(Continues the Shelf MVP build log — see `../files_extracted/BUILD_LOG.md` for
the books-only MVP history: 35/18/11/9/4 suites green, structuredClone
portability fix, BookPicker hoist, idempotent element ratings, display-score
remap.)*

## Update — expansion to three domains (2026-07-04)

Shelf (books-only, single-file artifact) became **Taste**: a real Vite + React
project with three domains — **Shelf** (books), **Table** (restaurants),
**Queue** (music) — running on one generalized engine.

### Final status: ALL GREEN

| Gate | Scope | Result |
|---|---|---|
| `tests/engine.test.mjs` | Full ported engine suite, parameterized ×3 domains, run against the REAL fetched catalogues | **105 / 105** |
| `tests/data.test.mjs` | Item contract for all 3 datasets (ids, vectors in 0..1, ratings sane, spread, previews/covers/links) | **44 / 44** |
| `vite build` | Production bundle | clean, 103 kB gz |
| Live click-through (preview browser) | Onboarding ×3 domains → swipe (want/pass/consumed) → breakdown panel → library tabs → star + 2 craft ratings → profile weights shift → feed posts → localStorage reload persistence → domain switching → 30s audio preview | all verified, **zero console errors/warnings** |

### API research (all endpoints hit live before committing)

- **Open Library** search API: keyless, real reader ratings — chosen for books.
  (Google Books anonymous quota was exhausted at test time → documented as alt.)
- **Deezer** genre + chart APIs: keyless — 107 tracks, rank→popularity, 30s previews.
- **iTunes Search**: keyless — Apple Music links/year/artwork enrichment (71/107).
- **Google Places (New)**: verified it refuses keyless callers (403) → fetcher
  supports `GOOGLE_PLACES_API_KEY`, bundled curated 44-restaurant snapshot
  (real Google rating values) is the default DB.
- Goodreads API: dead since 2020, not used. Spotify: needs OAuth creds, schema
  kept compatible.

### Engine generalization

`engine.mjs` functions now take a `domain` descriptor `{key, factors[6],
tones[3]}`; books/restaurants/music differ only in vocabulary (domains.js).
Action `"read"` became `"consumed"` (read/visited/heard). All math unchanged
from the verified MVP.

### Bugs found & fixed while building

1. **Preview audio ghost-resume** — `PreviewButton` kept its `Audio` object in
   a ref; after swiping to the next track the old ref survived, so Play would
   resume the *previous* song. Fixed: keyed the component per track id and the
   effect cleanup now pauses AND nulls the ref.
2. **Card art overlapped the genre chips** — the lg cover (224px × 1.15 scale)
   overflowed its 196px header band and sat on top of the chip row (visible
   with real cover images; the MVP's stylized covers masked it). Fixed: 236px
   band, no scale-up, `overflow:hidden`.
3. **Non-English blurbs from Open Library** — `first_sentence` can come from
   any edition, so 1984 arrived with a Spanish opening line. Fixed: fetcher
   accepts a first sentence only if it passes an English-stopword +
   no-diacritics + length check, else falls back to a generated blurb.
4. **Fetcher syntax slip** — music TONE_BASE object closed with `]` instead of
   `}`; caught on first run.
5. *(Test-harness only, not app bugs)* driving the UI via injected JS needed
   longer waits after step transitions — the 27-cover picker takes >300 ms to
   mount, so early queries found 0 buttons; and tab labels are uppercased by
   CSS (`text-transform`), so text matching had to use DOM case.

### Notes

- Personalization state is per-domain (profile, shelf, feed each keyed under
  `states[domain]` in `localStorage["taste:state:v1"]`), so tastes never bleed
  across domains; the header switcher shows ✓ per onboarded domain.
- Match-score display remap (`0.8·true + 36`) and matchTag thresholds carried
  over unchanged; external ratings render as their own badge (★ Google/Open
  Library, ▶ Deezer charts) so the app's match % and the world's rating never
  get conflated.
- Deezer has no K-Pop genre — chip dropped by the fetcher automatically (14
  music genres shipped).

---

## Update — media expansion: movies + TV, goals, and the For You suggester (2026-08-02)

Taste became **Decluttered** (this repo): five domains on one engine, plus a
categorized suggestion system that goes beyond pattern recognition.

### Final status: ALL GREEN

| Gate | Scope | Result |
|---|---|---|
| `tests/engine.test.mjs` | Ported engine suite ×5 domains (books/restaurants/music/movies/tv) on real data | **175 / 175** |
| `tests/data.test.mjs` | Item contract for all 5 datasets | **70 / 70** |
| `tests/suggest.test.mjs` | Every suggestion mechanism does what its label claims | **81 / 81** |
| `vite build` | Production bundle | clean, 132 kB gz |
| Live click-through | Movies + TV onboarding (goals + confirm steps) → decks → For You rows → quick-actions → goal editing in Profile → reload persistence with 5 domains | verified, no new console errors |

### API research (verified live 2026-08-02)

- **TVMaze**: keyless, real community ratings + art + popularity weight → 90-show catalogue (16-page index sweep + curated search top-up of modern landmarks).
- **TMDB**: confirmed key-required → live fetch path behind `TMDB_API_KEY`.
- **iTunes Search**: no longer returns movies at all (0 results for every query) — documented dead end.
- **Wikipedia REST summary**: keyless poster thumbnails + first-sentence synopses → default movie art path over a curated 69-film snapshot carrying real IMDb rating values. ("Her" has no lead image on its page — stylized fallback cover, by design.)

### What's new

- **Domains**: Screen (movies: story/acting/direction/visuals/pacing/originality; darkness/intensity/emotion) and Series (TV: story/characters/writing/acting/production/bingeability; darkness/complexity/comfort), media-first ordering, per-domain accents.
- **`src/engine/suggest.mjs`**: seven labeled mechanisms (pattern / priority / consensus / gems / mood / stretch / goal) with cross-row dedupe, exclusion of shelved items, and normalized external ratings (`ratingFrac` handles 5/10/100 scales).
- **User goals**: six goal types (classics/hidden/short/buzzy/acclaimed/broaden) with per-domain labels; picked in onboarding (step 7, max 3), editable in Profile, each rendered as its own For-You row honored even against the taste pattern.
- **Taste-profile confirmation**: onboarding step 9 reads the derived profile back (genres, tone reading, essential factors, goals) before opening the deck.
- **For You view**: horizontal suggestion shelves with reason lines, match badges, external ratings, and heart/pass quick-actions that train the profile like deck swipes.
- **`run.sh`**: one-command local test run.

### Bugs found & fixed while building

1. **Blank page on first boot** — `seedFeed` had seed-post copy only for the original three domains, so movies/tv threw `undefined[0]` inside App's `useState` initializer and React unmounted the whole tree. Diagnosed by replaying the init sequence in the browser console (React had swallowed the original error). Fixed with per-domain copy + a generic fallback.
2. **Explore dial dead for movies/TV** — caught by the ported engine tests: log-scaled popularity compressed the uniformly-famous curated/chart catalogues into 0.77–1.0, leaving no novelty spread (aligned and exploring top-10s were identical). Fixed with rank-percentile popularity (`assignPercentilePopularity`), patched into existing data without re-fetching.
3. **Stretch row leaked pattern items** — caught by the suggest suite: items mixing an untouched genre with a *loved* genre qualified as "outside your pattern". Now every genre on a stretch item must be unengaged.
4. **Wikipedia burst throttling** — poster fetches failed intermittently under load (42/69 → art). Added retry-with-backoff in the fetcher plus an idempotent `repair-movie-art.mjs` patch pass → 68/69 (the one miss is a page with no lead image).
5. **Rating badge assumed 5-star scales** — `ExtRating` and the data contract now key off `rating.scale` (5/10/100), so "★ 9/10 · 2.9M on IMDb" renders instead of nonsense.

---

## Update — neo-brutalist reskin (2026-08-02)

Swapped the editorial skin for a neo-brutalist one; tokens & chrome only, in
`src/ui/bits.jsx` (plus two inline-chrome lines in Discover). Layout,
components, and behavior untouched.

- Cream paper (#FFF8E7), white cards, 2px #111 borders, hard offset shadows
  (no blur), chunky buttons/chips that translate down and swallow their shadow
  on press, rotated sticker-style match/IMDb badges, bold uppercase mono labels.
- Loud per-domain accents: yellow #FFD23F books, red #FF5D73 movies, blue
  #4D9DE0 tv, green #53DD6C music, orange #FF9F1C restaurants — active domain
  chip fills with its accent; primary CTA carries an accent shadow.
- Match ring redrawn as bright accent arc on a soft cream track inside a
  bordered pill (old track used var(--line), which is now black).

Bugs found & fixed during verification:
1. Hero highlighter vanished — the pseudo-element relied on the old skin's
   `opacity:.92` to stay visible; with it removed, `z-index:-1` dropped the
   block behind the shell background. Fixed by giving `.hl` its own stacking
   context (`z-index:0`).
2. Movies deck meta read "2003 · 2003 · 120 min" (subtitle for movies IS the
   year) — year now skipped when it duplicates the subtitle.

Verified: all 5 domain accents checked via computed styles; deck / For You /
Profile / onboarding screenshots reviewed; no new console errors; tests
175 + 70 + 81 all green; production build clean.
