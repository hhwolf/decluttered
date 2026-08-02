# Decluttered

One taste engine, five cravings: **Shelf** (books) · **Screen** (movies) ·
**Series** (TV) · **Queue** (music) · **Table** (restaurants). Swipe a ranked
deck, confirm your taste profile, set goals, rate what you consume down to the
individual craft elements — and browse a **For You** page built by seven
different suggestion mechanisms, each labeled with the reason it exists.

See [FRAMEWORK.md](FRAMEWORK.md) for the idea framework and
[BUILD_LOG.md](BUILD_LOG.md) for the build/verification history.

## Run it on your computer

```bash
git clone https://github.com/hhwolf/decluttered.git
cd decluttered
./run.sh
```

then open **http://localhost:5173**. That's it — `run.sh` installs
dependencies on first run and starts the dev server. (Prerequisite: Node.js;
on a Mac, `brew install node`.)

Equivalent manual commands:

```bash
npm install
npm run dev        # http://localhost:5173
```

## Test it

```bash
./run.sh test      # or: npm test
```

Runs 326 checks: the engine suite (175, parameterized across all 5 domains),
the dataset contract (70), and the suggestion-mechanism suite (81).

## The suggestion system (beyond pattern matching)

The deck ranks by taste-pattern similarity. The **For You** tab deliberately
does more — seven mechanisms, every row labeled with why:

| Mechanism | Row | What drives it |
|---|---|---|
| pattern | Closest to your taste | the learned profile (same math as the deck) |
| priority | Built on *\<your top factor\>* | your stated importance sliders |
| consensus | *\<Genre\>*, by acclaim | real-world ratings (IMDb/TVMaze/Google/Open Library), not our score |
| gems | Hidden gems | high external rating × low popularity |
| mood | Matches your mood | tone-target proximity — feel over genre |
| stretch | Stretch your range | best-rated items whose genres you've never engaged (anti-pattern) |
| goal | Goal · … | one row per stated goal, honored even against your pattern |

Taste profile, goals, and feedback stay first-class: onboarding ends with a
**confirm-your-profile** step, goals are editable in Profile (each becomes its
own row), and every swipe, star rating, and per-element craft rating keeps
retraining the profile.

## Refresh the seed databases

```bash
npm run fetch:books        # Open Library (keyless, real reader ratings)
npm run fetch:music        # Deezer charts + iTunes enrichment (keyless)
npm run fetch:tv           # TVMaze (keyless, real community ratings)
npm run fetch:movies       # curated IMDb-ratings snapshot + Wikipedia posters;
                           #   set TMDB_API_KEY for a live TMDB fetch
npm run fetch:restaurants  # curated snapshot; set GOOGLE_PLACES_API_KEY for live Google Places
npm run fetch:all
```

Fetchers are deterministic (seeded jitter) — same inputs, same catalogue.

## Layout

```
scripts/          fetchers that build src/data/*.json from external APIs
src/engine/       engine.mjs (taste math) + suggest.mjs (categorized suggestions)
src/domains.js    per-domain vocabulary: factors, tones, verbs, goals, palettes
src/ui/           Onboarding / Discover / ForYou / Library / Feed / Profile
tests/            engine + dataset + suggestion suites (plain node)
```
