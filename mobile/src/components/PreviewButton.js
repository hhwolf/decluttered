// ============================================================================
// PreviewButton.js — the 30s track preview, natively.
//
// Three separate things had to be true before a sound came out, and the first
// two versions of this got each of them wrong in a way that looked identical
// from the outside: a button that says "Pause" while nothing plays.
//
//   1. iOS honours the SILENT SWITCH. Without
//      `setAudioModeAsync({ playsInSilentMode: true })` a muted phone plays
//      nothing and reports no error. Most phones live on silent.
//   2. `play()` must wait for the source to LOAD. Calling it straight after
//      createAudioPlayer() is a no-op on a remote URL — there is nothing to
//      play yet — so playback silently never starts.
//   3. The UI must read the player's real status, not assume success. Every
//      baked Deezer URL in the catalogue is currently 403 (they expire in about
//      a month), so "the URL resolved" is not the same as "audio exists".
//
// State therefore comes from the player's `playbackStatusUpdate` events, and a
// source that never loads becomes an honest "Preview unavailable".
//
// The resolve policy is shared with web (prefer a freshly-signed URL, fall back
// to the catalogue's). Only the fetch differs: native has no CORS, so a plain
// fetch works where the browser needs JSONP.
// ============================================================================
import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { resolvePreview, deezerIdOf } from "../../../src/engine/preview.mjs";
import { C, F, BORDER } from "../theme";

const LOAD_TIMEOUT_MS = 12000;

// Once per app run. Without this a phone on silent plays nothing.
let audioModeReady = null;
const ensureAudioMode = () => (audioModeReady =
  audioModeReady || setAudioModeAsync({ playsInSilentMode: true }).catch(() => {}));

/**
 * React Native polyfills AbortSignal from the `abort-controller` package, which
 * has NO static `AbortSignal.timeout()`. Calling it throws a TypeError, and
 * that was the whole bug: fetchFresh died instantly, resolvePreview fell back
 * to the URL baked into the catalogue, and every one of those is 403 now — so
 * the player sat on "Loading…" and then reported unavailable. The fresh-resolve
 * path, which is the entire point of this component, never ran once on device.
 *
 * AbortController + setTimeout exists everywhere, so use that.
 */
async function fetchFresh(deezerId) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`https://api.deezer.com/track/${deezerId}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(String(res.status));
    const json = await res.json();
    if (!json?.preview) throw new Error("no preview");
    return json.preview;
  } finally {
    clearTimeout(timer);
  }
}

export default function PreviewButton({ item, label = "Play 30s preview", accent = C.hl }) {
  const [state, setState] = useState("idle"); // idle | loading | playing | unavailable
  const playerRef = useRef(null);
  const subRef = useRef(null);
  const timerRef = useRef(null);
  const alive = useRef(true);
  // What the USER wants, kept separately from what the player reports. The
  // listener may not infer intent from status: `playing:false` after a pause is
  // indistinguishable from `playing:false` before the first play, and guessing
  // made the listener restart playback the instant Pause was tapped.
  const wantPlay = useRef(false);
  const started = useRef(false); // the initial play has been issued for this player

  const teardown = () => {
    clearTimeout(timerRef.current);
    wantPlay.current = false;
    started.current = false;
    try { subRef.current?.remove(); } catch { /* already gone */ }
    try { playerRef.current?.remove(); } catch { /* already gone */ }
    subRef.current = null;
    playerRef.current = null;
  };

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; teardown(); };
  }, []);

  // A new card is a new track: drop the old player rather than leaving it
  // playing over the next one.
  useEffect(() => { teardown(); setState("idle"); }, [item?.id]);

  const start = async () => {
    wantPlay.current = true;
    started.current = false;
    setState("loading");
    try {
      await ensureAudioMode();
      const url = await resolvePreview(item, fetchFresh);
      if (!alive.current) return;
      if (!url) { setState("unavailable"); return; }

      const player = createAudioPlayer({ uri: url });
      playerRef.current = player;

      // Start once the source is loaded, exactly once, and only while the user
      // still wants it playing.
      subRef.current = player.addListener("playbackStatusUpdate", (st) => {
        if (!alive.current || playerRef.current !== player) return;
        if (st?.isLoaded) {
          clearTimeout(timerRef.current);
          if (wantPlay.current && !started.current) {
            started.current = true;
            try { player.play(); } catch { /* the watchdog reports it */ }
          }
        }
        // Mirror the player while the user wants sound; never override a pause.
        if (st?.playing && wantPlay.current) setState("playing");
        else if (!wantPlay.current) setState("idle");
        // A finished 30s clip should offer to play again, not sit on "Pause".
        if (st?.didJustFinish) {
          wantPlay.current = false;
          started.current = false;
          setState("idle");
        }
      });

      // If it never loads — a 403 preview URL, no network — say so instead of
      // showing a Pause button over silence.
      timerRef.current = setTimeout(() => {
        if (!alive.current || playerRef.current !== player) return;
        if (!player.currentStatus?.isLoaded) { teardown(); setState("unavailable"); }
      }, LOAD_TIMEOUT_MS);

      // If it is already loaded there will be no further status event to react
      // to, so kick it off here too; `started` keeps that from double-playing.
      if (wantPlay.current && !started.current && player.currentStatus?.isLoaded) {
        started.current = true;
        try { player.play(); } catch { /* the listener will settle the state */ }
      }
    } catch {
      if (alive.current) { teardown(); setState("unavailable"); }
    }
  };

  const toggle = () => {
    if (state === "loading") return;
    const player = playerRef.current;
    if (state === "playing" && player) {
      // Clear intent FIRST: a status event can land between here and the next
      // render, and it must not read as "still wants sound".
      wantPlay.current = false;
      try { player.pause(); } catch { /* nothing to pause */ }
      setState("idle");
      return;
    }
    if (player?.currentStatus?.isLoaded) {
      wantPlay.current = true;
      started.current = true;
      try {
        // A clip that ran to the end sits at its end; rewind before replaying.
        if (player.currentStatus?.didJustFinish) player.seekTo(0);
        player.play();
        setState("playing");
      } catch { setState("unavailable"); }
      return;
    }
    start();
  };

  if (!deezerIdOf(item) && !item?.links?.preview) return null;
  if (state === "unavailable") {
    return (
      <View style={{ flex: 1, paddingVertical: 10, alignItems: "center" }}>
        <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.muted }}>Preview unavailable</Text>
      </View>
    );
  }
  return (
    <Pressable onPress={toggle} accessibilityRole="button"
      accessibilityLabel={state === "playing" ? "Pause preview" : label}
      style={{
        flex: 1, borderWidth: BORDER, borderColor: C.ink, borderRadius: 11,
        backgroundColor: accent, paddingVertical: 10, flexDirection: "row",
        alignItems: "center", justifyContent: "center", gap: 7,
      }}>
      <Feather name={state === "playing" ? "pause" : "play"} size={15} color={C.ink} />
      <Text numberOfLines={1} style={{ fontFamily: F.ui, fontSize: 14, fontWeight: "700" }}>
        {state === "playing" ? "Pause" : state === "loading" ? "Loading…" : label}
      </Text>
    </Pressable>
  );
}
