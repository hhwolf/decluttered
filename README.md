# Taste

One taste engine, three cravings: **Shelf** (books) · **Table** (restaurants) ·
**Queue** (music). Swipe a ranked deck, rate what you consume — down to the
individual craft elements — and watch your profile learn in the open.

See [FRAMEWORK.md](FRAMEWORK.md) for the idea framework and
[BUILD_LOG.md](BUILD_LOG.md) for the build/verification history.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

## Test it

```bash
npm test           # engine suite (105, ×3 domains) + data contract (44)
npm run build      # production bundle
```

## Refresh the seed databases

```bash
npm run fetch:books        # Open Library (keyless, real reader ratings)
npm run fetch:music        # Deezer charts + iTunes enrichment (keyless)
npm run fetch:restaurants  # curated snapshot; set GOOGLE_PLACES_API_KEY for live Google Places
npm run fetch:all
```

Fetchers are deterministic (seeded jitter) — same inputs, same catalogue.

## Layout

```
scripts/          fetchers that build src/data/*.json from external APIs
src/engine/       domain-agnostic taste engine (pure, unit-tested)
src/domains.js    per-domain vocabulary: factors, tones, verbs, palettes
src/ui/           Onboarding / Discover (swipe deck) / Library / Feed / Profile
tests/            engine + dataset suites (node, no framework)
```
