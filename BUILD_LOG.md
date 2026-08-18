# Decluttered — build log

A taste-profile recommender for five kinds of decision, on one engine.
Web (Vite + React) and native (React Native / Expo) clients share the engine.

- **Live web:** https://decluttered-livid.vercel.app
- **Native:** Expo SDK 54 — TestFlight-ready (see `mobile/TESTFLIGHT.md`)
- **Status:** 873 tests green (812 shared/web + 61 native), web build clean

The thesis: every app you own is optimised to keep you choosing. This one is
built to get you to *one good pick* — a book, a film, a show, a song, a table —
and then get out of the way.

---

## Significant outputs

1. **Two clients — iOS and web — on one engine.** The web app (Vite + React) is
   deployed; the native app (React Native / Expo, runs on iPhone via Expo Go)
   was added second. The taste engine is *shared, not ported*: Metro points at
   the same `src/engine` the web build uses, so **0 lines of engine logic are
   duplicated** across platforms. Two things were extracted mid-port rather than
   copied — every state transition (`session.mjs`) and the score→percentage
   mapping (`present.mjs`) — after the native client briefly showed 78% where
   web showed 73% for the same card.

2. **A preview on every craving, plus the image and swipe defects behind them.**
   One prominent "try it" control per card, playing in place rather than
   navigating away: 30-second track previews (1178/1178), inline looping YouTube
   trailers (1738/1800 films, 260/700 shows), and swipeable restaurant photo
   galleries (395/449). Debugged along the way:
   - Deezer's preview URLs expire monthly — every baked URL is 403 today — so
     previews resolve a freshly-signed URL at play time. On native that path had
     never once run, because `AbortSignal.timeout` does not exist in React
     Native and threw instantly.
   - Pause was being undone in milliseconds by a status listener that read
     "not playing" as "should be playing".
   - A swipe left the music playing over the next card: `remove()` releases the
     native player but does not stop it.
   - Artwork backfilled to 386/386 books, 1753/1800 films, 700/700 shows,
     1176/1178 tracks, 411/449 restaurants; food galleries rebuilt after the
     first version returned scanned 19th-century cookbooks.
   - A fast flick was silently dropped, because the release handler read
     rendered state that was still stale; the drag→verdict decision is now a
     shared, tested function used by both clients.

3. **Catalogues grown from dozens to hundreds and thousands.** 4,513 items
   total, every one from a real source:

   | Craving | Seed | Now |
   |---|---|---|
   | Screen (movies) | ~1,200 | **1,800** |
   | Queue (music) | 107 | **1,178** |
   | Series (TV) | 250 | **700** |
   | Table (restaurants) | 44 | **449** |
   | Shelf (books) | 80 | **386** |

4. **APIs linked across entertainment and reference data.** TMDB (official
   trailers), Wikipedia REST + pageviews (critical reception, readership),
   Wikidata SPARQL (notable restaurants, provenance), Wikimedia Commons
   (restaurant and dish photography, with author and licence retained),
   Open Library (books), IMDb bulk datasets (ratings, directors), TVMaze
   (shows, run detail, principal cast), Deezer (charts, previews), iTunes
   (Apple Music links). Google Places and Yelp are supported but their content
   is never committed, because their terms forbid it.

---

## Key features

### The core loop
- **A ranked deck, one card at a time.** No infinite grid. Swipe right to save,
  left to pass, or use buttons — a swipe-only deck is unusable for anyone who
  can't make the gesture.
- **Every card explains itself.** A match percentage, a four-part breakdown
  (genre fit / what you weigh / mood / similarity to things you loved), and the
  named item that drove it: *"Because you liked Harry Potter."*
- **An honest counterpoint.** Cards name the one reason a pick might not land —
  *"Much more buzzy than your usual"*, *"Shares a lot with restaurants you've
  passed on."* A recommender that only ever argues in favour is a salesman.
- **Undo.** Sorting is reversible for 8 seconds; the profile is restored from a
  snapshot, because it's derived from the whole history and can't be un-updated.

### Try before you decide
The highest-value control on the deck, one per craving, pinned in the card footer:

| Craving | Preview | Coverage |
|---|---|---|
| Queue | 30-second track preview | 1178 / 1178 |
| Screen | YouTube trailer, inline and looping | 1738 / 1800 |
| Series | YouTube trailer, inline and looping | 260 / 700 |
| Table | Swipeable photos of the restaurant | 395 / 449 |
| Shelf | — (nothing real to play, so no button) | — |

Previews play **in place** — the artwork area becomes the player or gallery —
rather than navigating away.

### Enough information to decide
- **Critical reception** with attributed pull-quotes, summarised from Wikipedia
  (CC BY-SA) and labelled as such. 701 items.
- **Who's in it:** principal cast for 696/700 shows, directors for 1800/1800 films.
- **What it costs you:** *"About 74 hours of watching"* for a 73-episode series,
  *"About 11 hours to read"* for a 322-page book. "62 episodes" sounds like
  information but dodges the actual question.
- **Complete series vs Still airing** — half the decision on a show.
- **More like this:** three comparable items, each opening that item's sheet.
- **Vibe words** from the tone vectors — *Buzzy · Smart-casual · Adventurous.*

### Seven ways to surface things
Not one algorithm chasing similarity. `engine/suggest.mjs` builds rows by
distinct mechanism, and **each row states why it exists**: taste match, your
priorities, crowd acclaim, hidden gems, mood, anti-pattern (built to stretch
you), and your stated goal.

### Retention
Daily streak with a 7-day dot row, a 10-a-day goal, seven milestones, a
"taste in review" reflection card, head-to-head ranking by binary insertion, and
a cross-craving panel showing all five profiles at once.

### Local-first
No account, no tracking, no ad model. Everything lives in `localStorage` (web)
or AsyncStorage (native) under `taste:state:v1`, and can be wiped in two taps.
The two clients don't sync — by design.

### Location (Table only)
A perfect match in Memphis is no use in Boston, so a city is **required**, and
every path to the deck routes through that gate. 449 places across 33 metros.

---

## Catalogue

4,513 items, all from keyless or free APIs. Nothing invented.

| Craving | Items | Artwork | Reception | Notes |
|---|---|---|---|---|
| Shelf (books) | 386 | 386 | 92 | Open Library |
| Screen (movies) | 1800 | 1753 | 276 | IMDb bulk + Wikipedia + TMDB |
| Series (TV) | 700 | 700 | 229 | TVMaze |
| Queue (music) | 1178 | 1176 | 79 | Deezer charts + iTunes |
| Table (restaurants) | 449 | 411 | 25 | Curated + Wikidata SPARQL |

**Sources:** Open Library, IMDb bulk datasets, TVMaze, Deezer, Wikidata SPARQL,
Wikipedia REST + pageviews, Wikimedia Commons, TMDB (free key, in gitignored
`.env`). Google Places / Yelp content is **never committed** — their terms forbid
it, so those files are gitignored and ship empty.

---

## Architecture

The engine is **shared, not ported**. Metro's `watchFolders` points at `../src`,
so both clients import the same modules and the same catalogue JSON.

| | lines |
|---|---|
| shared engine + domain definitions | 1,790 |
| web-only UI | 3,356 |
| native-only UI | 1,901 |
| fetch / enrichment scripts | 3,883 |
| tests | 2,400 |
| **engine logic reimplemented per platform** | **0** |

Shared modules: `engine.mjs` (scoring, ranking, profile updates), `describe.mjs`
(vectors → words), `suggest.mjs` (the seven rows), `stats.mjs` (streaks,
milestones, swipe resolution), `session.mjs` (every state transition),
`present.mjs` (score → percentage), `preview.mjs` (preview resolve policy),
`location.mjs`, `importer.mjs` (Goodreads / Letterboxd / IMDb CSV).

Platform-specific by necessity: storage, gestures, hard offset shadows (RN can't
do un-blurred `box-shadow`, so the offset block is a real View), fonts.

---

## Key decisions

**Never fabricate.** Restaurant prices were left blank for 249 places rather
than inferred from cuisine or neighbourhood. Content warnings and rating
histograms were skipped outright — no keyless source, and a *guessed* content
warning is harmful, not merely wrong. Dish photos are labelled as photos of the
dish, not of that kitchen.

**Attention is not approval.** Wikipedia readership and Deezer's play index are
labelled "interest" and "popularity", never stars. A track low on the chart is
not "divisive" — it just isn't being played much.

**One definition per concept.** `displayScore` and the match wording live in
shared code because the native client briefly had a re-derived formula and the
same card read 73% on web and 78% on native.

**Verify in the runtime that ships.** Repeatedly the expensive lesson — see below.

---

## Bugs worth remembering

- **Popularity was a curve, not a measurement.** A log-of-count-over-max scale
  put 51% of tracks at 95+ and floored every book at 0.42. Deezer's rank is
  *already* normalised 0–1M. Three catalogues were wrong and the hidden-gems row
  had nothing to draw on. Now rank-percentile within each source cohort.
- **The reception block was built, wired, shipped — and empty.** Expanding the
  catalogues deleted 653 of 677 records, because enrichment lives in the same
  JSON a fetcher rewrites. `writePretty` now merges enrichment forward by id.
- **"More like this" nearly shipped a coin flip.** The factor/tone vectors are
  *derived* from genre plus a hash jitter, so ranking neighbours by them ranks
  the hash. Measured: 0.17 axis range within a genre group (exactly the jitter)
  vs 0.44–0.58 across the catalogue. Rebuilt on measured signals only.
- **Wikidata's YouTube IDs are 87% dead.** 66% coverage × 13% actually playable.
  A free TMDB key took that to 1,738/1,800. Playability is now verified before
  an ID is stored, and the verifier detects YouTube's consent wall so throttling
  can't be recorded as "video dead".
- **`AbortSignal.timeout` does not exist in React Native.** It threw instantly,
  so the fresh-preview resolve never ran on device and fell back to URLs that are
  all 403 now. Worked in every Node check. A test now walks all
  native-reachable files and fails if anything uses it again.
- **Food galleries returned scanned books.** Commons search matches file *text*:
  "French" → crowds on the Champs Elysees, "Korean" → Book of Mormon. Also
  `\bbook\b` never matched `Book_of_Mormon`, because underscore is a word
  character. Queries are anchored and results must earn their place.
- **Pause was undone in milliseconds.** The status listener read
  `playing:false` as "should be playing". Intent is now explicit, never inferred.

---

## Test & build status

```
engine     175    data        85    suggest   82    stats     60
importer    37    reception   55    location  38    wikidata  25
describe    99    enrich     104    session   52
                                        shared + web  =  812
native (jest-expo, @testing-library/react-native)  =   61
                                              TOTAL  =  873
```

`npm test` · `npm run test:mobile` · `npm run test:all` · `npm run build`

Data-level guards, not just unit tests: popularity distributions can't pin to an
extreme, a fetcher re-run can't drop enrichment, every stored trailer ID is a
bare 11-char YouTube ID, every dish photo carries its credit and licence, and
blurbs can't regress into mid-sentence truncation.

---

## Shipped to TestFlight

Build 3 is uploaded to App Store Connect — `VERIFY SUCCEEDED` then `UPLOAD
SUCCEEDED`, 11.97 MB in 5.6s, delivery UUID `245895b6-2f48-4026-8436-8a86ce13fc7d`.
App record `6802823441`, bundle `com.decluttered.app`, Apple team `59MGA3685P`.
The privacy policy is live at
https://decluttered-livid.vercel.app/privacy.html — on the product's own domain
rather than a gist, in the app's own visual language.

`eas submit` could not do it: EAS Submit was in a partial outage that day ("iOS
Submissions hanging on App Store Connect build uploads"). It did not matter. The
artifact EAS builds is an ordinary store-signed `.ipa`, so Apple's own `altool`
uploaded it directly. Worth remembering that the wrapper being down does not block
shipping.

Remaining before public release, not before internal testing: Category and
Content Rights in App Store Connect, and the IMDb licence question below.

## TestFlight readiness

Everything that does not need Apple credentials is done: `eas.json` with four
build profiles, a completed iOS block (bundle id, build number, export-compliance
flag so TestFlight stops asking on every upload), a real 1024×1024 app icon and
matching splash in the app's own visual language, a privacy policy, and the
attributions several sources require as a **licence condition** — TMDB's
disclaimer verbatim beside every trailer, plus a "Where this comes from" credits
panel listing all nine sources.

**Build 2 failed and is fixed.** EAS died in the Bundle JavaScript phase,
reported only as "Unknown error", on `Unable to resolve module
./data/google-reviews.json`. `src/domains.js` statically imports two gitignored
files — Google's and Yelp's terms license their review text for display, not
redistribution — and EAS uploads git-tracked files, so the builder had neither.
A local `expo export` had passed because those files sit on the dev machine. The
same class of mistake as the earlier audio bugs: verifying in an environment that
has something the target does not.

`scripts/ensure-optional-data.mjs` now writes them as `{}` when absent, which is
what `domains.js` always claimed they shipped as, and never touches real fetched
content. Wired into prebuild, pretest, expo prestart, and `eas-build-pre-install`.
`tests/optional-data.test.mjs` walks every source file and fails if any statically
imports a JSON that is neither committed nor declared optional — the next such
import is caught locally, not 70 seconds into a cloud build.

Verified against the real thing: `eas build:inspect` reproduces the exact upload,
and bundling inside it — the two files genuinely absent — succeeds after the hook
runs.

**Build 3 succeeded.** A signed `.ipa` exists. Verified by unpacking the binary
itself rather than trusting config: bundle id `com.decluttered.app`, version
1.0.0 (3), `ITSAppUsesNonExemptEncryption: false`, icon embedded, code signature
and provisioning profile present, minimum iOS 15.1, and the TMDB key absent.
All five catalogues are inside the 6.7 MB Hermes bundle — 195 of 200 sampled
titles found directly, and the five misses are non-ASCII titles that Hermes
stores as UTF-16, confirmed present in that encoding.

What Table ships with, since it bears on the "not enough information" complaint:
rating and blurb for all 449 places, dish photography for 395, but critic
reception for only 25 and quotes for 7. Google review text is structurally never
in a shipped build — that file cannot be committed — so restaurants lean on
rating, blurb and photos. Unchanged by the build fix; the file was already empty.

Verified: the production iOS bundle compiles (7.05 MB Hermes bytecode, all
imports including the out-of-package shared engine), and the TMDB key is **not**
in it — the key is only ever used by fetch scripts, never at runtime.

Signing credentials are live under Apple team `59MGA3685P` (Asteria Labs, Inc.),
so the remaining steps are: publish the privacy policy at a URL, create the App
Store Connect record, put its App ID into `ascAppId`, then `eas submit`.

Two things to settle there:
- **Native audio and trailer playback in a release build** are unverified. Both
  work in Expo Go, but a release build is compiled differently, and Expo Go's
  first-run overlay hid the deck footer in the simulator throughout.
- **IMDb's datasets are licensed for personal, non-commercial use**, and the app
  uses their ratings and directors. Worth settling before a public listing;
  TMDB covers both fields under terms that permit app use with the attribution
  now displayed.

---

## Unresolved

- **Android is unbuilt.** No JDK on the build machine. No iOS-only APIs are
  used and `Platform.select` covers the differences, but "untested" is the
  honest word.
- **Expo Go pins the native client to SDK 54.** The App Store build of Expo Go
  is ~11 months behind npm, so an SDK 57 project reports "requires a newer
  version" on a real phone. Moving back to latest means a development build.
- **Reception coverage is thin outside movies/TV.** Wikipedia throttles hard;
  the lookup cache makes re-runs cheap and resumable.
- **Not ported to native:** Feed, head-to-head ranking, taste-in-review, CSV
  import. All are presentation over maths that already lives in the engine.
- **No push notifications** — the strongest retention tool native unlocks.
- **Restaurant prices** missing for 249 places, and **awards** unbuilt. Both
  need a source that doesn't require guessing.
- **17 blurbs** still truncate mid-sentence where no better source text exists.

### A note on verification
Four audio bugs in a row were found only on a real device. The simulator can't
report sound, and Expo Go's first-run overlay covers the deck footer. A
development build would remove both blind spots and is the next thing worth
doing before more native work.

An earlier version of this log — and several commit messages — cited "907
shared/web tests". The correct figure is 812; the suites sum to 812 + 61 = 873.
