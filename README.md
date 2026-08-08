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
npm run fetch:movies       # IMDb official bulk datasets (keyless, refreshed daily)
                           #   posters via Wikipedia (resumable cache);
                           #   set TMDB_API_KEY for a live TMDB fetch instead
npm run fetch:restaurants  # curated snapshot; set GOOGLE_PLACES_API_KEY for live Google Places
npm run fetch:reception    # Wikipedia critical reception + overviews for every domain
npm run fetch:all
```

Fetchers are deterministic (seeded jitter) — same inputs, same catalogue.

### Growing a catalogue

Every fetcher's size is an env knob, so a domain grows without touching its
sweep logic. Defaults in brackets.

| Craving | Knobs | Ceiling before quality drops |
|---|---|---|
| Shelf (books) | `PER_SUBJECT` [28] · 28 Open Library subjects | subjects are the real lever — add rows to `SUBJECTS` |
| Screen (movies) | `MAX_MOVIES` [1800] · `MIN_VOTES` [30000] · `MIN_RATING` [6.0] | ~7k IMDb titles clear 30k votes; posters are the bottleneck, not data |
| Series (TV) | `MAX_SHOWS` [700] · `TV_PAGES` [90] · `TV_MIN_RATING` [7.4] · `TV_MIN_WEIGHT` [85] | the sweep finds ~1,000 qualifying shows today |
| Queue (music) | `PER_GENRE` [50] · 26 Deezer genre charts | Deezer caps a genre chart near 100 |
| Table (restaurants) | curated list in the fetcher | hand-written; `GOOGLE_PLACES_API_KEY` switches to live Places |

Poster/cover art comes straight from Open Library, TVMaze and Deezer, so those
three grow cheaply. Movie posters and all critical-reception prose come from
Wikipedia, which rate-limits hard — both are resumable and cached, so a big
expansion fills in over several runs rather than one.

## Layout

```
scripts/          fetchers that build src/data/*.json from external APIs
src/engine/       engine.mjs (taste math) + suggest.mjs (categorized suggestions)
src/domains.js    per-domain vocabulary: factors, tones, verbs, goals, palettes
src/ui/           Onboarding / Discover / ForYou / Library / Feed / Profile
tests/            engine + dataset + suggestion suites (plain node)
```
