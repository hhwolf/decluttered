# Shipping Decluttered to TestFlight

Everything that can be prepared without Apple credentials is done. This is the
remaining path, and the two things I could not verify.

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

**1. Apple Developer Program — $99/year.** Required for TestFlight, not just the
App Store. Individual enrolment is usually approved within 24–48h.

**2. Publish the privacy policy** at a public URL. `mobile/PRIVACY.md` is
written; a GitHub Pages page or a gist is enough.

**3. Create the app record** in App Store Connect with bundle id
`com.decluttered.app`. Note the numeric App ID and your Team ID, then put them
into the `submit.production` block of `eas.json` — it has placeholders.

**4. Build and upload:**

```bash
cd mobile
npm i -g eas-cli
eas login
eas build --platform ios --profile production
eas submit --platform ios --latest
```

EAS generates and stores the signing certificate and provisioning profile; say
yes when it offers. The build runs on their infrastructure, so no local Xcode
project or CocoaPods install is needed.

**5. In App Store Connect → TestFlight,** add yourself as an internal tester.
Internal testing needs no review and is usually available within ~15 minutes of
the upload finishing. External testers (up to 10,000) need a short Beta App
Review first, typically a day.

## Suggested "What to Test" notes

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

## Two things I could not verify

**Native audio and trailer playback in a release build.** You have confirmed
both work in Expo Go, but a production build is compiled differently (release
JS, no dev server), and Expo Go's first-run overlay covered the deck footer in
the simulator so I could never see the controls myself. The first TestFlight
build is the right place to check these.

**IMDb's dataset licence.** Their public datasets are offered for *personal and
non-commercial use*. The app uses IMDb ratings and directors. A free app may be
arguable, but "non-commercial" is their wording, and App Review does ask about
rights to third-party catalogues (Guideline 5.2). This is a question to settle
rather than a legal conclusion from me.

The clean fix, if you want it gone: TMDB provides both ratings and credits under
terms that permit app use with the attribution we now display. Swapping those two
fields over is a contained change to the fetch scripts — say the word and I'll do
it. Nothing else in the app depends on IMDb.
