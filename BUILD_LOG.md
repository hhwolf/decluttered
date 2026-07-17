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
