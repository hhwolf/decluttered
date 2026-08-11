// ============================================================================
// PreviewButton.js — the 30s track preview, natively.
//
// Two things broke the first version, and both are invisible on a desktop:
//
//   1. iOS honours the SILENT SWITCH. Without
//      `setAudioModeAsync({ playsInSilentMode: true })` a muted phone plays
//      nothing at all, with no error — which reads exactly like a bug in the
//      app. Most phones live on silent.
//   2. The player was created by `useAudioPlayer(uri)` and started from an
//      effect, so the first tap only armed it. Now the player is created
//      imperatively when we actually have a URL, which is deterministic.
//
// Uses the SHARED resolve policy (prefer a freshly-signed URL, fall back to
// the catalogue's). That policy exists because Deezer's preview URLs expire
// after about a month — every baked URL in this repo is currently 403 — and it
// must not exist in two versions. Only the fetch differs from web: native has
// no CORS, so a plain fetch works where the browser needs JSONP.
// ============================================================================
import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { resolvePreview, deezerIdOf } from "../../../src/engine/preview.mjs";
import { C, F, BORDER } from "../theme";

// Once per app run: allow playback when the ringer is off, and don't fight
// other apps for the audio session any harder than necessary.
let audioModeReady = null;
function ensureAudioMode() {
  audioModeReady = audioModeReady || setAudioModeAsync({
    playsInSilentMode: true,
    interruptionMode: "mixWithOthers",
  }).catch(() => {});
  return audioModeReady;
}

async function fetchFresh(deezerId) {
  const res = await fetch(`https://api.deezer.com/track/${deezerId}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(String(res.status));
  const json = await res.json();
  if (!json?.preview) throw new Error("no preview");
  return json.preview;
}

export default function PreviewButton({ item, label = "Play 30s preview", accent = C.hl }) {
  const [state, setState] = useState("idle"); // idle | loading | playing | unavailable
  const playerRef = useRef(null);
  const alive = useRef(true);

  const release = () => {
    try { playerRef.current?.remove(); } catch { /* already gone */ }
    playerRef.current = null;
  };

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; release(); };
  }, []);

  // A new card is a new track: drop the old player rather than leaving it
  // playing over the next one.
  useEffect(() => { release(); setState("idle"); }, [item?.id]);

  const toggle = async () => {
    if (state === "loading") return;
    if (state === "playing") {
      try { playerRef.current?.pause(); } catch { /* nothing to pause */ }
      setState("idle");
      return;
    }
    // Resume a player we already built for this track.
    if (playerRef.current) {
      try {
        playerRef.current.play();
        setState("playing");
      } catch { setState("unavailable"); }
      return;
    }
    setState("loading");
    try {
      await ensureAudioMode();
      const url = await resolvePreview(item, fetchFresh);
      if (!alive.current) return;
      if (!url) { setState("unavailable"); return; }
      const player = createAudioPlayer({ uri: url });
      playerRef.current = player;
      player.play();
      if (alive.current) setState("playing");
    } catch {
      if (alive.current) { release(); setState("unavailable"); }
    }
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
