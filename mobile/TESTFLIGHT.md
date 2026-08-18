# Shipping Decluttered to TestFlight

Everything that can be prepared without Apple credentials is done. This is the
remaining path, and what has now been confirmed on real hardware.

## What is already in place

| | |
|---|---|
| `eas.json` | development / simulator / preview / production profiles |
| `app.json` | bundle id `com.decluttered.app`, `buildNumber`, export-compliance flag set so TestFlight stops asking on every upload |
| App icon | real 1024×1024 icon in the app's own visual language, not Expo's placeholder |
| Splash | matching mark on the app's cream |
| Attributions | TMDB's required disclaimer beside every trailer, plus a "Where this comes from" credits panel in Profile — attribution is a licence condition for TMDB, Wikipedia and Wikimedia, not a courtesy |
| `PRIVACY.md` | ready to publish; answers the App Privacy questionnaire as "Data Not Collected", which is accurate |

## What you need to do

**1. Apple Developer Program — done.** EAS reports *"All credentials are ready
to build"*: a distribution certificate and a provisioning profile
(`W357QT77XZ`, valid to 18 Aug 2027) exist under Apple team `59MGA3685P`
(Asteria Labs, Inc.). That team ID is now filled into `eas.json`; it is not a
secret and is useless without the signing key, which stays on EAS.

**2. Privacy policy — done.** Live at
https://decluttered-livid.vercel.app/privacy.html, on the product's own domain
rather than a gist. Source is `public/privacy.html`, mirrored from
`mobile/PRIVACY.md`; `tests/privacy.test.mjs` fails if the two drift on the date,
the core promise, or which third parties receive data.

**3. App record — done.** Apple ID `6802823441`, bundle `com.decluttered.app`,
SKU `decluttered.rn.001`. Both identifiers are in `eas.json`, so no placeholders
remain.

**4. Build and upload.** Use the absolute path — this is a Conductor workspace,
and two of the four workspaces sit on a branch that predates the mobile app, so a
bare `cd mobile` fails there with no obvious reason why. `npx` avoids a global
install; eas-cli 22 is verified working on this machine's Node 26.

```bash
cd /Users/henryhe/conductor/workspaces/decluttered/cebu/mobile
npx eas-cli@latest login
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios --latest
```

If `cd` still fails, you are outside the workspace entirely; `git rev-parse
--show-toplevel` from anywhere inside a checkout prints its root, and `mobile`
lives directly beneath it on branch `fix-preview-song-playback`.

The build runs on EAS infrastructure, so no local Xcode project or CocoaPods
install is needed.

**5. In App Store Connect → TestFlight,** add yourself as an internal tester.
Internal testing needs no review and is usually available within ~15 minutes of
the upload finishing. External testers (up to 10,000) need a short Beta App
Review first, typically a day.

## If EAS Submit is down

It was, on 18 Aug 2026 — *"iOS Submissions hanging on App Store Connect build
uploads"*. `eas submit` is only a convenience wrapper; the `.ipa` EAS produced is
an ordinary store-signed archive, so Apple's own uploader takes it directly.

Download the artifact from `eas build:view <id>`, then either drag it into
**Transporter** (free, Mac App Store), or use `altool`, which full Xcode already
provides:

```bash
xcrun altool --validate-app --type ios --file Decluttered.ipa \
  --username "<apple-id-email>" --password "@env:ASC_PW"   # dry run first
xcrun altool --upload-app   --type ios --file Decluttered.ipa \
  --username "<apple-id-email>" --password "@env:ASC_PW"
```

`ASC_PW` is an **app-specific password** from appleid.apple.com → Sign-In and
Security → App-Specific Passwords, not the Apple ID password. Pass it via
`@env:` so it never lands in shell history or a file. It is a live credential for
the whole Apple account: never commit it, and revoke it from the same page when
you are done.

`--validate-app` runs every check the upload does without uploading, so it catches
a bad signature or missing icon in seconds. Both succeeded here on the first try:
`VERIFY SUCCEEDED`, then `UPLOAD SUCCEEDED` — 11.97 MB in 5.6s.

**`altool` cannot read a keychain item from a non-interactive shell.**
`--password "@keychain:NAME"` fails with

    Failed to read legacy keychain item 'NAME' … User canceled the operation. (-128)

because macOS needs to show an authorisation dialog and there is nobody to answer
it. That is not a wrong password. `security` itself can read the item without a
prompt, so hand it over in one hop instead — the secret reaches only altool's
environment and is never written anywhere:

```bash
ASC_PW=$(security find-generic-password -s "ALTOOL_ASC" -w) \
xcrun altool --upload-app --type ios --file Decluttered.ipa \
  --username "<apple-id-email>" --password "@env:ASC_PW"
```

Store it once with `security add-generic-password -a "<email>" -s "ALTOOL_ASC" -w`
(bare `-w` prompts, keeping it out of shell history).

## If the Bundle JavaScript phase fails

EAS reports bundling failures as bare *"Unknown error. See logs of the Bundle
JavaScript build phase"*, which names neither the module nor the file. Build 2
died this way. Do not guess from the summary — reproduce the builder locally,
because the difference is almost always a file the builder does not have:

```bash
npx eas-cli@latest build:inspect -p ios -s archive -o /tmp/eas-archive --force
diff <(cd src && find . -type f | sort) <(cd /tmp/eas-archive/src && find . -type f | sort)
```

`build:inspect` writes the exact archive EAS uploads — git-tracked files only.
Diffing it against the working tree shows what the builder is missing. To see the
real error, bundle inside that archive:

```bash
cd /tmp/eas-archive/mobile
ln -s /path/to/real/mobile/node_modules node_modules   # skip a fresh install
npm run eas-build-pre-install                           # what the builder runs
npx expo export --platform ios --output-dir /tmp/out
```

That surfaced `Unable to resolve module ./data/google-reviews.json` in seconds,
where the cloud build took 70 and said nothing useful. Note the shape of the
mistake: a local `expo export` in the working tree passed, because the working
tree has two gitignored files the builder never receives. A green local bundle is
not evidence about the builder.

## Suggested "What to Test" notes

Paste into **App Store Connect → TestFlight → Builds → iOS → 1.0.0 → build N**,
in the **What to Test** box on that build's page, then Save. It belongs to the
build, not the app, so each upload gets its own. Testers see it in the TestFlight
app and in the "new build available" notification. Limit 4,000 characters.

Not to be confused with **Test Information** in the same sidebar — that holds the
beta description, feedback email and privacy policy URL, and only external testers
need it.

> Five cravings share one taste engine: books, films, shows, music and
> restaurants. Skip setup to get to the deck in one tap, then swipe.
>
> Worth hammering:
> - The swipe itself, including half-swipes that should spring back.
> - The preview button on each craving: a 30-second track preview, an inline
>   looping trailer, a restaurant photo gallery. Check that a preview stops
>   the moment you swipe to the next card.
> - Table refuses to open a deck until you pick a city. That is deliberate.
> - Profile → Start over should genuinely clear that craving.
>
> Known gaps: 17 of 4,513 blurbs end mid-sentence; restaurant prices are
> missing for 249 places; Feed, head-to-head ranking and CSV import are
> web-only so far.

## Confirmed on device, TestFlight build 4

**Audio and trailer playback work in a release build**, and **a preview stops the
moment you swipe**. Both confirmed on a real iPhone. These were the last things
carried as unknowns: they worked in Expo Go, but a release build is compiled
differently, and Expo Go's first-run overlay hid the deck footer in the simulator
so the controls were never observable there. The device settled it.

That closes every item that could only be answered outside a development client.
What remains is App Store Connect paperwork and the IMDb licence question.

**IMDb's dataset licence.** Their public datasets are offered for *personal and
non-commercial use*. The app uses IMDb ratings and directors. A free app may be
arguable, but "non-commercial" is their wording, and App Review does ask about
rights to third-party catalogues (Guideline 5.2). This is a question to settle
rather than a legal conclusion from me.

The clean fix, if you want it gone: TMDB provides both ratings and credits under
terms that permit app use with the attribution we now display. Swapping those two
fields over is a contained change to the fetch scripts — say the word and I'll do
it. Nothing else in the app depends on IMDb.
