# Decluttered — debug checklist

Every bug that reached a user in this project passed a green check somewhere else
first. A compiling bundle did not prove the build server had the files. Expo Go
did not prove a release build. The simulator proved the app launches but not that
audio plays. So this checklist is ordered by **runtime**, not by feature, and each
layer states what it does and does **not** prove.

Run top to bottom before any upload. Times are wall-clock on this machine.

---

## 0. What proves what

| Green here | Proves | Does **not** prove |
|---|---|---|
| `npm test` | shared engine logic | anything about native |
| `npx jest` (mobile) | React components render | that the app starts |
| `expo export` | JS resolves **on your disk** | that the builder has those files |
| EAS build succeeds | it compiled and signed | that it launches |
| Simulator release build launches | startup, native modules linked, layout | audio, trailers, real network |
| Device (TestFlight) | the actual product | — |

Skipping a row is how build 2 and build 3 shipped broken.

---

## 1. Local — 60 seconds

```bash
cd /Users/henryhe/conductor/workspaces/decluttered/cebu
npm test                      # 882 checks across 14 suites
npm run build                 # Vite, should say "built in <1s"
cd mobile && npx jest         # 61 native component tests
```

Expected: **882 shared/web + 61 native = 943**, zero failures.

Four suites are regression guards for bugs that already shipped once — if one of
these fails, read its header comment before "fixing" it:

- `optional-data` (18) — a statically imported JSON that isn't committed
- `native-deps` (19) — two copies of an Expo module (the build-3 launch crash)
- `privacy` (33) — the two privacy-policy copies disagreeing
- `enrich` (104) — a re-fetch silently dropping enrichment

There is no linter or typechecker in this project. Don't look for one.

---

## 2. Bundle layer — what the builder actually receives

EAS uploads **git-tracked files only**. Your working tree has files it never
sees, and EAS reports the resulting failure as bare *"Unknown error. See logs of
the Bundle JavaScript build phase"* — naming neither module nor file.

```bash
cd mobile
npx eas-cli@latest build:inspect -p ios -s archive -o /tmp/eas-archive --force
diff <(cd ../src && find . -type f | sort) <(cd /tmp/eas-archive/src && find . -type f | sort)
```

Expected difference, and **only** this:

```
./data/google-reviews.json
./data/live-ratings.json
```

Both are gitignored on purpose (Google/Yelp licence their review text for display,
not redistribution) and are generated as `{}` by `eas-build-pre-install`. Anything
else in that diff is a file the builder lacks and the bundle will fail on.

To see the real Metro error instead of guessing:

```bash
cd /tmp/eas-archive/mobile
ln -s /Users/henryhe/conductor/workspaces/decluttered/cebu/mobile/node_modules node_modules
npm run eas-build-pre-install
npx expo export --platform ios --output-dir /tmp/out
```

Seconds, not the 70 the cloud build takes to say nothing.

---

## 3. Release runtime — the layer that catches launch crashes

A release build differs from Expo Go in ways that matter: Hermes bytecode, no dev
server, `__DEV__` false, and **expo-updates active**. That last one converts an
unhandled startup JS throw into a native crash, so on device the app simply closes
with nothing to read. Reproduce it locally:

```bash
cd mobile
npx eas-cli@latest build --platform ios --profile simulator-release --non-interactive
# download the .tar.gz from the Application Archive URL, then:
tar xzf app.tar.gz
SIM=$(xcrun simctl list devices booted | grep -oE '[0-9A-F-]{36}' | head -1)
xcrun simctl uninstall $SIM com.decluttered.app
xcrun simctl install   $SIM Decluttered.app
xcrun simctl launch --console-pty $SIM com.decluttered.app | tee /tmp/console.txt
```

Confirm it is genuinely a release build, not a dev client:

```bash
[ -f Decluttered.app/main.jsbundle ] && echo release || echo "dev client — wrong profile"
```

Then, 30 seconds after launch:

```bash
xcrun simctl spawn $SIM launchctl list | grep -i decluttered   # must print a line
grep -iE "Terminating|uncaught|Cannot find native module" /tmp/console.txt  # must be empty
xcrun simctl io $SIM screenshot /tmp/launch.png                # eyeball it
```

**Alive is not enough — screenshot it.** A blank cream screen also stays alive.
You should see the Queue tab selected, five craving tabs, icons drawn, artwork
loaded, and a catalogue count.

---

## 4. Device — the only place these are real

Everything below has failed at least once in this project, or is a thing only
hardware can answer. Work through it on the TestFlight build, not Expo Go.

### 4a. First launch, as a stranger would

- [ ] App opens to **Queue** (music is the primary tab, deliberately)
- [ ] No crash, no blank cream screen, no flash of an error before the deck
- [ ] Icon on the home screen is the yellow card-stack, not an Expo placeholder
- [ ] "Skip setup" reaches a deck in **one tap**
- [ ] "Build my taste profile" completes and the deck reflects the picks
- [ ] Catalogue count in the footer is plausible (1,178 tracks on Queue)

### 4b. Previews — the feature with the worst bug history

Four separate bugs shipped here: previews stuck on Loading, then "unavailable",
then pause not pausing, then audio surviving a swipe.

- [ ] **Queue**: a 30-second preview plays, and is audible with the ringer switch
      on silent (`playsInSilentMode`)
- [ ] The pause button actually pauses — press play again, it resumes
- [ ] **Audio stops the instant you swipe** a playing card. Not a second later
- [ ] Leaving the tab or backgrounding the app stops it
- [ ] **Screen**: a trailer plays inline and **loops**
- [ ] A trailer with embedding disabled falls back to a "Watch on YouTube" link
      rather than a dead black box
- [ ] **Table**: the dish gallery swipes through multiple photos
- [ ] Every dish photo carries its author and licence
- [ ] Rapidly tapping preview on card after card does not stack overlapping audio

### 4c. Swiping

- [ ] Half-swipes spring back instead of committing
- [ ] A committed swipe is undoable, and undo restores the same card
- [ ] The deck never shows the same item twice in one session
- [ ] Reaching the end of a deck shows an end state, not a blank screen

### 4d. Per-craving specifics

- [ ] **Table** refuses to open a deck until a city is chosen — deliberate, not a bug
- [ ] Removing the last city is blocked with an explanation
- [ ] **Screen / Series**: match percentage and its explanation agree with each other
- [ ] **Shelf**: covers load; a missing cover degrades to a placeholder, not a gap
- [ ] Switching cravings preserves each one's own profile and library

### 4e. Persistence and reset

- [ ] Force-quit and reopen: library, streak and profile survive
- [ ] Streak increments the next day rather than per session
- [ ] **Profile → Start over** clears that craving only, leaving the other four
- [ ] Reset asks for confirmation and states what will be lost

### 4f. Attribution, since it is a licence condition

- [ ] TMDB's disclaimer appears beside **every** trailer, verbatim
- [ ] TMDB's wordmark renders in Profile → "Where this comes from"
- [ ] The credits list names all sources and what each supplies
- [ ] No rating is labelled with a source that did not provide it

### 4g. Conditions the simulator never shows you

- [ ] **Airplane mode**: previews and trailers fail gracefully; the deck still works
      from the bundled catalogue
- [ ] Slow network: a preview shows Loading and then either plays or says
      unavailable — it must not hang forever
- [ ] Rotate the device: layout survives (portrait is locked, so nothing should move)
- [ ] Largest accessibility text size: the deck footer and buttons stay reachable
- [ ] Dark mode at OS level: the app is light-only by design and must stay legible
- [ ] Battery/thermals: leaving a trailer looping for a few minutes does not heat
      the phone or drain visibly

---

## 5. Secrets and licensed content

Read the key from `.env` rather than pasting it into a command. An earlier version
of this file hardcoded it, which put the secret in the repo — the exact thing these
checks exist to prevent. Reading it also means the checks keep working after a
rotation.

```bash
# the TMDB key must never be in a commit or a binary
KEY=$(grep -E '^TMDB_API_KEY' .env | cut -d= -f2 | tr -d ' "')
[ -n "$KEY" ] || echo "no key in .env — the checks below prove nothing"
git grep -l "$KEY"                                      # must be empty
git check-ignore -q .env && echo "gitignored" || echo "PROBLEM"
rm -rf /tmp/chk && unzip -q ~/Downloads/Decluttered-build4.ipa -d /tmp/chk
grep -rl "$KEY" /tmp/chk && echo LEAKED || echo clean

# Google/Yelp content must never be committed — their terms forbid redistribution
git ls-files | grep -E "google-reviews|live-ratings" && echo "PROBLEM" || echo "correctly untracked"
```

`tests/optional-data.test.mjs` asserts the last one, so a normal `npm test`
catches it too.

---

## 6. App Store Connect

- [x] Icon, 1024×1024, no alpha — Apple rejects builds without one
- [x] `ITSAppUsesNonExemptEncryption: false` — verified inside the binary, stops
      TestFlight asking on every upload
- [x] Privacy policy live at https://decluttered-livid.vercel.app/privacy.html
- [x] App Privacy questionnaire → **Data Not Collected** (accurate: no account,
      no analytics, no backend)
- [ ] **Category** → App Information → right column. *Lifestyle* recommended
- [ ] **Content Rights** → answer **yes**, the app displays third-party content
- [ ] Age rating → 12+ (catalogues include mature films and shows)

Verify the shipped binary rather than `app.json`:

```bash
APP=$(ls -d /tmp/chk/Payload/*.app)
for k in CFBundleIdentifier CFBundleVersion ITSAppUsesNonExemptEncryption MinimumOSVersion; do
  echo "$k = $(/usr/libexec/PlistBuddy -c "Print :$k" "$APP/Info.plist")"
done
```

---

## 7. Rights and attribution

Attribution is a **licence condition** for several of these, not a courtesy. The
wording lives in `src/engine/credits.mjs` so the two clients cannot drift.

| Source | Provides | Obligation | Status |
|---|---|---|---|
| TMDB | Trailer IDs, and likely many film synopses | Exact disclaimer + logo | see below |
| Wikipedia | Reception, overviews | CC BY-SA attribution | shown |
| Wikimedia Commons | Restaurant/dish photos | Per-photo author + licence | shown per photo |
| Open Library | Books, covers, ratings | Courtesy | shown |
| TVMaze | Shows, cast, run detail | Attribution requested | shown |
| Deezer | Charts, 30s previews | API terms | shown |
| IMDb | **Film ratings and directors** | *Personal, non-commercial use* | **unresolved** |

### TMDB in detail

What is actually used: **bare 11-character YouTube video IDs** (1,738 films, 260
shows) and, per `fetch-movies.mjs`, film `blurb` text from TMDB's `overview` field.
No TMDB images, no TMDB links, no TMDB ratings. The API key is read only by fetch
scripts at build time from a gitignored `.env`, and is absent from every commit and
from the shipped binary.

Checklist against their terms — read their page, do not trust this table alone:
<https://www.themoviedb.org/about/logos-attribution> and
<https://www.themoviedb.org/api-terms-of-use>

- [x] The disclaimer, verbatim and unparaphrased: *"This product uses the TMDB API
      but is not endorsed or certified by TMDB."* Rendered beside every trailer in
      both clients and in the Profile credits panel.
- [x] Nothing implies TMDB endorsement.
- [x] No bulk redistribution of their database — only per-item video IDs are stored.
- [ ] **Their logo is not shipped.** Their attribution guidance asks for the logo
      alongside the notice. Verify the current requirement, then add it to the
      credits card and the trailer notice.
- [ ] **The credits line understates them.** It reads *"Official trailers"*, but
      roughly 1,500 film blurbs appear to be TMDB synopsis text. Understating a
      source is exactly what an attribution requirement exists to prevent.
- [ ] Confirm whether this use counts as commercial under their terms, and whether
      that needs their sign-off.

### IMDb — the one with real exposure

`rating.source` is `"IMDb"` across the film catalogue, and directors come from
their bulk datasets, which are offered for *personal and non-commercial use*. App
Review asks about rights to third-party catalogues (Guideline 5.2). This is a
question to settle, not a legal conclusion.

The clean fix is contained: TMDB supplies both ratings and credits under terms that
permit app use with the attribution already displayed, nothing else depends on
IMDb, and it changes only the fetch scripts.

---

## 8. Known gaps — expected, not bugs

Don't spend time rediscovering these:

- 17 of 4,513 blurbs end mid-sentence — 12 books, 3 films, 2 restaurants. Count
  them with the project's own predicate, not a hand-rolled regex; `isTruncated` in
  `scripts/patch-truncated-blurbs.mjs` accounts for `…`, `)`, `]` and dangling
  honorifics, and a naive `/[.!?]$/` check reports 566 false positives:
  ```bash
  node -e "import('./scripts/patch-truncated-blurbs.mjs').then(m=>{
    const r=require('./src/data/books.json');
    console.log((Array.isArray(r)?r:r.items).filter(x=>m.isTruncated(x.blurb||'')).length)})"
  ```
- 249 of 449 restaurants have no price level
- Restaurants: 449 have a rating and blurb, 395 have dish photos, but only 25 have
  critic reception and 7 have quotes. Google review text can **never** ship,
  because that file cannot be committed. Table is the thinnest evidence base in the
  app for actually deciding.
- Feed, head-to-head ranking and CSV import are web-only
- 440 of 700 shows have no trailer (TVMaze coverage, not a bug)

---

## 9. Crash triage — symptom to cause

| Symptom | Almost certainly | Go to |
|---|---|---|
| EAS: "Unknown error… Bundle JavaScript" | a file the builder lacks | §2 |
| App closes instantly on launch, no UI | unhandled startup throw, escalated by expo-updates | §3 |
| `Cannot find native module 'X'` | two copies of an Expo module, JS and pod disagree | `npm test` → `native-deps` |
| Works in Expo Go, dies in TestFlight | release-only: Hermes, `__DEV__`, expo-updates | §3 |
| Blank screen but process alive | render throw after mount — screenshot, don't trust `launchctl` | §3 |
| Preview spins then "unavailable" | a Web API missing in React Native | `PreviewButton.js` header |
| `altool`: "User canceled the operation. (-128)" | keychain prompt with nobody to answer it | `mobile/TESTFLIGHT.md` |

---

## Open items

1. Category and Content Rights in App Store Connect
2. **200 committed restaurant ratings are labelled `source: "Google"`.** Found by
   `tests/credits.test.mjs`, which noticed Google was supplying ratings while being
   credited nowhere. Now credited, but two things are unresolved:
   - They come from `CURATED`, a hand-transcribed literal list in
     `fetch-restaurants.mjs`, **not** cached API responses. So this is not the
     caching problem that `google-reviews.json` is gitignored to avoid — but it is
     still Google's figure, presented as Google's, with no date.
   - They are **frozen**. Whatever was true when they were typed is what ships.
     A star rating that says "Google" and is a year stale is an accuracy problem
     independent of any licence question.

   The existing design already has the right answer — `fetch-restaurant-ratings.mjs`
   writes live ratings to the gitignored `live-ratings.json`, which supersedes the
   catalogue at runtime. Making that the *only* source of Google ratings would fix
   both points. The cost is real: 200 of 449 restaurants would fall back to a
   Wikipedia interest score, which measures fame rather than approval, and Table is
   already the thinnest craving for deciding. **Product call, not a code call.**
3. Restaurant decision-quality generally: reception for 25 of 449, quotes for 7
4. Confirm with TMDB whether this use counts as commercial under their terms
