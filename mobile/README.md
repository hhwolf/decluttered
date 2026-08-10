# Decluttered — native client

React Native (Expo SDK 57). The taste engine is **shared with the web client,
not ported**: `metro.config.js` points `watchFolders` at `../src`, so both
clients import the same `engine.mjs`, `describe.mjs`, `suggest.mjs`,
`stats.mjs`, `location.mjs`, `session.mjs` and the same catalogue JSON. Zero
engine logic is re-implemented here — a rule fixed on one platform is fixed on
both.

```
npx expo start            # Metro
npx expo start --ios      # and open a simulator
npx jest                  # 36 native tests
```

From the repo root, `npm run test:all` runs the shared/web suites and these.

## What is native-specific

- **Storage.** AsyncStorage instead of localStorage, so loading is async and
  there is a real "Opening the catalogue…" state.
- **Gestures.** `Animated` + `PanResponder` rather than Reanimated: a single
  dragged card is comfortably within the JS thread's budget, and it keeps the
  app runnable in Expo Go with no native rebuild. The drag→verdict decision
  itself is shared with the web client.
- **Hard shadows.** `box-shadow: 4px 4px 0 #111` has no RN equivalent (iOS
  blurs, Android only has elevation), so the offset block is drawn as a real
  View behind the content. See `Brut` in `src/components/bits.js`.
- **Fonts.** Georgia/system/Menlo stand in for Fraunces/Inter/IBM Plex Mono to
  avoid an async font-load state on cold start.

## Jest notes

Three pieces of config exist for reasons that are not obvious:

- `transform` handles `.mjs` explicitly, because the shared engine lives outside
  this package and Babel's root config does not reach it.
- `moduleNameMapper` redirects `@babel/runtime/*` here, because Node resolution
  from `../src` walks straight past `mobile/node_modules`. Metro solves the same
  problem with `resolver.nodeModulesPaths`.
- `@expo/vector-icons` is mocked. Installing `expo-asset`/`expo-font` to satisfy
  its resolver broke the real app, since Expo Go ships its own natives.

## Not ported yet

Feed, head-to-head ranking, taste-in-review, CSV import. All four are
presentation over maths that already lives in the shared engine.
