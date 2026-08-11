// ============================================================================
// PreviewButton.js — the 30s track preview, natively.
//
// Uses the SHARED resolve policy (prefer a freshly-signed URL, fall back to the
// one baked into the catalogue). That policy exists because Deezer's preview
// URLs expire after about a month and every stored one had gone stale — the
// original bug in this app. Only the fetch mechanism differs from web: native
// has no CORS, so a plain fetch works where the browser needs JSONP.
// ============================================================================
import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAudioPlayer } from "expo-audio";
import { resolvePreview, deezerIdOf } from "../../../src/engine/preview.mjs";
import { C, F, BORDER } from "../theme";

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
  const [uri, setUri] = useState(null);
  const player = useAudioPlayer(uri ? { uri } : null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; try { player?.pause(); } catch { /* torn down */ } };
  }, [player]);

  // A new card means a new track: stop whatever was playing.
  useEffect(() => { setState("idle"); setUri(null); }, [item?.id]);

  const toggle = async () => {
    if (state === "loading") return;
    if (state === "playing") { try { player.pause(); } catch {} setState("idle"); return; }
    try {
      let url = uri;
      if (!url) {
        setState("loading");
        url = await resolvePreview(item, fetchFresh);
        if (!alive.current) return;
        if (!url) { setState("unavailable"); return; }
        setUri(url);
        // The player is created from `uri` on the next render, so the first tap
        // arms it and the effect below starts playback.
        return;
      }
      player.seekTo(0);
      player.play();
      setState("playing");
    } catch {
      if (alive.current) setState("unavailable");
    }
  };

  // Start as soon as a freshly-resolved url has produced a player.
  useEffect(() => {
    if (!uri || state !== "loading" || !player) return;
    try { player.play(); setState("playing"); } catch { setState("unavailable"); }
  }, [uri, player, state]);

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
