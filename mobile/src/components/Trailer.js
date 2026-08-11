// ============================================================================
// Trailer.js — a looping, muted YouTube trailer, natively.
//
// Uses react-native-youtube-iframe rather than a hand-rolled iframe in a
// WebView. That was tried first and YouTube refused it: pointing the WebView at
// the embed URL gives "Error 153", and hosting the iframe in a document with a
// youtube.com baseUrl (plus an `origin` param, plus a real Safari user-agent)
// gives "Error 152-4". The same video plays fine in a desktop browser.
//
// It is NOT a simulator limitation — a plain H.264 <video> plays perfectly in
// the same WebView, which rules that out. YouTube is rejecting the embed's
// origin handshake specifically, and this library exists to perform that
// handshake properly through the IFrame Player API.
//
// onError is wired up, because uploaders can disable embedding and the honest
// response is a link out rather than a dead black box.
// ============================================================================
import React, { useState } from "react";
import { View, Text, Pressable, Linking } from "react-native";
import { Feather } from "@expo/vector-icons";
import YoutubePlayer from "react-native-youtube-iframe";
import { trailerWatchUrl } from "../../../src/engine/describe.mjs";
import { C, F, text, BORDER } from "../theme";

export default function Trailer({ item, width, height, muted = true, onRequestClose }) {
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const id = item?.trailer;
  const watch = trailerWatchUrl(item);
  if (!id) return null;

  if (failed) {
    return (
      <View style={{ width, height, backgroundColor: C.ink, alignItems: "center", justifyContent: "center", padding: 16, gap: 8 }}>
        <Text style={{ fontFamily: F.ui, fontSize: 13, color: C.paper, textAlign: "center" }}>
          The uploader has embedding turned off.
        </Text>
        <Pressable onPress={() => watch && Linking.openURL(watch)} accessibilityRole="link"
          accessibilityLabel="Watch on YouTube"
          style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: BORDER,
            borderColor: C.paper, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 }}>
          <Feather name="external-link" size={13} color={C.paper} />
          <Text style={{ fontFamily: F.ui, fontSize: 13, fontWeight: "700", color: C.paper }}>Watch on YouTube</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ width, height, backgroundColor: "#000" }} accessibilityLabel={`trailer:${id}`}>
      <YoutubePlayer
        height={height}
        width={width}
        videoId={id}
        play
        mute={muted}
        // A single video needs its own id as the playlist or `loop` does nothing.
        playList={[id]}
        initialPlayerParams={{ controls: true, modestbranding: true, rel: false, loop: true }}
        webViewProps={{ allowsInlineMediaPlayback: true, mediaPlaybackRequiresUserAction: false }}
        onReady={() => setReady(true)}
        onError={() => setFailed(true)}
        onChangeState={(s) => { if (s === "ended" && onRequestClose) onRequestClose(); }}
      />
      {!ready && (
        <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
          <Text style={[text.catNo, { color: C.paper }]}>Loading trailer…</Text>
        </View>
      )}
    </View>
  );
}
