// ============================================================================
// Discover.js — the deck. One card, swipe right to save, left to pass.
//
// Gesture note: this uses RN's built-in Animated + PanResponder rather than
// Reanimated/gesture-handler. A single dragged card is well within what the JS
// thread handles at 60fps, and it keeps the app running in Expo Go with no
// native rebuild — which is what makes it verifiable here. The tradeoff is that
// a JS stall would drop a frame mid-drag; worth revisiting if the card ever
// grows expensive to render.
//
// The threshold and the drag->verdict decision come from the SHARED
// engine/stats.mjs, so web and native agree on what counts as a swipe. That
// function exists because the web client had a real bug: a fast flick that
// delivered its last move and release in one frame read stale state and was
// silently dropped.
// ============================================================================
import React, { useMemo, useRef, useState } from "react";
import { View, Text, Animated, PanResponder, Pressable, ScrollView, Dimensions } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Image } from "react-native";
import Trailer from "../components/Trailer";
import { TMDB_DISCLAIMER } from "../../../src/engine/credits.mjs";
import { rankItems } from "../../../src/engine/engine.mjs";
import { resolveSwipe, SWIPE_THRESHOLD } from "../../../src/engine/stats.mjs";
import { vibeWords, counterpoint, factChips, castLine, creditLine,
         previewAction } from "../../../src/engine/describe.mjs";
import { C, F, text, accentFor, BORDER } from "../theme";
import { Btn, Cover, ExtRating, VibeChip, matchTag, displayScore } from "../components/bits";
import PreviewButton, { stopAllPreviews } from "../components/PreviewButton";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

// The deck used to be a hardcoded 468pt, which overflowed every phone shorter
// than the one it was designed on. Derive it from the screen and leave room for
// the header, domain bar, action buttons and tab bar.
const CHROME = 336;
const DECK_H = Math.max(360, Math.min(520, SCREEN_H - CHROME));
const ART_H = Math.round(DECK_H * 0.38);


export default function Discover({ domain, profile, shelf, onAction, onExplore, onOpen, onNeedCity }) {
  const seen = useMemo(() => new Set(Object.keys(shelf)), [shelf]);
  const deck = useMemo(
    () => rankItems(domain.items, profile, domain, { excludeIds: [...seen] }),
    [domain, profile, seen]
  );
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const dragRef = useRef(0);
  const [dragging, setDragging] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  // Which dish photo is showing, so its author and licence can be credited.
  const [photoIdx, setPhotoIdx] = useState(0);
  // The responder is memoised per card, so it reads this ref rather than state:
  // a WebView or photo gallery inside the card must win the gesture, not the deck.
  const previewingRef = useRef(false);
  const accent = accentFor(domain.key);

  const top = deck[0];
  const next = deck[1];
  const needsCity = domain.hasLocation && !(profile.cities?.length);

  const commit = (action) => {
    stopAllPreviews();
    pan.setValue({ x: 0, y: 0 });
    dragRef.current = 0;
    setDragging(0);
    setPreviewing(false);
    previewingRef.current = false;
    setPhotoIdx(0);   // the next card's credit must not describe this card's photo
    onAction(top.item, action);
  };

  const fling = (dir) => {
    // Stop now, not when the card unmounts 180ms later.
    stopAllPreviews();
    Animated.timing(pan, {
      toValue: { x: dir === "right" ? SCREEN_W : -SCREEN_W, y: 0 },
      duration: 180,
      useNativeDriver: true,
    }).start(() => commit(dir === "right" ? "want" : "pass"));
  };

  const responder = useMemo(() => PanResponder.create({
    // Claim the gesture only once it is clearly horizontal, so the card body
    // can still be scrolled vertically.
    onMoveShouldSetPanResponder: (_e, g) =>
      !previewingRef.current && Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderMove: (_e, g) => {
      dragRef.current = g.dx;
      setDragging(g.dx);
      pan.setValue({ x: g.dx, y: 0 });
    },
    onPanResponderRelease: () => {
      // Read the ref, not the rendered state — same reason as the web client.
      const verdict = resolveSwipe(dragRef.current);
      if (verdict === "want") fling("right");
      else if (verdict === "pass") fling("left");
      else {
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true, friction: 7 }).start();
        dragRef.current = 0;
        setDragging(0);
      }
    },
    onPanResponderTerminate: () => {
      Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
      dragRef.current = 0;
      setDragging(0);
    },
  }), [top?.item?.id]);

  if (!top) {
    return (
      <View style={{ paddingTop: 60, alignItems: "center", paddingHorizontal: 24 }}>
        <Text style={[text.h2, { marginBottom: 6, textAlign: "center" }]}>That's the whole catalogue</Text>
        <Text style={[text.body, { textAlign: "center", marginBottom: 18 }]}>
          You've sorted every {domain.noun} in the starter set. Turn the dial up or check your library.
        </Text>
        <Btn label="Expand my taste" kind="hl" accent={accent.hl} onPress={() => onExplore(0.75)} />
      </View>
    );
  }

  const tag = matchTag(top.score);
  const vibe = vibeWords(top.item, domain);
  const facts = factChips(top.item, domain);
  const caveat = counterpoint(top.item, domain, profile, top.breakdown);
  const anchor = top.bestAnchorId ? domain.items.find((i) => i.id === top.bestAnchorId) : null;
  const people = castLine(top.item) || creditLine(top.item);
  const preview = previewAction(top.item, domain);
  const togglePreview = () => {
    const next = !previewingRef.current;
    previewingRef.current = next;
    setPreviewing(next);
    if (next) setPhotoIdx(0);
  };

  const rotate = pan.x.interpolate({ inputRange: [-SCREEN_W, 0, SCREEN_W], outputRange: ["-9deg", "0deg", "9deg"], extrapolate: "clamp" });
  const wantOpacity = Math.min(Math.max(dragging / SWIPE_THRESHOLD, 0), 1);
  const passOpacity = Math.min(Math.max(-dragging / SWIPE_THRESHOLD, 0), 1);

  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8 }}>
        <View style={{ flexShrink: 1 }}>
          <Text style={text.eyebrow}>Your deck</Text>
          <Text style={text.catNo} numberOfLines={1}>
            {deck.length} {domain.nounPlural} queued · {profile.interactions} sorted
            {domain.hasLocation && profile.cities?.length > 0
              ? ` · ${profile.cities.length <= 2 ? profile.cities.join(", ") : `${profile.cities[0]} +${profile.cities.length - 1}`}`
              : ""}
          </Text>
        </View>
        <View style={{ flexDirection: "row", borderWidth: BORDER, borderColor: C.line, borderRadius: 10, overflow: "hidden" }}>
          {[["Aligned", 0.3], ["Expand", 0.75]].map(([label, v]) => {
            const on = v < 0.55 ? profile.explore < 0.55 : profile.explore >= 0.55;
            return (
              <Pressable key={label} onPress={() => onExplore(v)} accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={{ paddingVertical: 7, paddingHorizontal: 11, backgroundColor: on ? accent.hl : C.card }}>
                <Text style={{ fontFamily: F.mono, fontSize: 9.5, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {needsCity && (
        <Pressable onPress={onNeedCity} accessibilityRole="button" style={{
          backgroundColor: C.card, borderWidth: BORDER, borderColor: C.line, borderRadius: 12,
          padding: 12, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 8,
        }}>
          <Feather name="map-pin" size={14} color={accent.hlDeep} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.ui, fontSize: 13.5, fontWeight: "600" }}>Showing restaurants everywhere</Text>
            <Text style={[text.catNo, { marginTop: 2 }]}>Pick your cities so the deck only has places you can get to →</Text>
          </View>
        </Pressable>
      )}

      <View style={{ height: DECK_H }}>
        {/* the card underneath, so the deck reads as a stack */}
        {next && (
          <View style={{ position: "absolute", left: 6, right: 6, top: 8, bottom: 0, opacity: 0.55 }}>
            <View style={{ flex: 1, backgroundColor: C.card, borderWidth: BORDER, borderColor: C.line, borderRadius: 16 }} />
          </View>
        )}

        <Animated.View
          {...responder.panHandlers}
          style={{
            position: "absolute", left: 0, right: 0, top: 0, bottom: 0,
            transform: [{ translateX: pan.x }, { rotate }],
          }}
        >
          <View style={{ flex: 1, position: "relative" }}>
            <View style={{ position: "absolute", left: 7, top: 7, right: -7, bottom: -7, backgroundColor: C.ink, borderRadius: 16 }} />
            <View style={{ flex: 1, backgroundColor: C.card, borderWidth: BORDER, borderColor: C.line, borderRadius: 16, overflow: "hidden" }}>
              <View style={{ height: ART_H, backgroundColor: C.paper2, position: "relative" }}>
                {previewing && preview?.kind === "trailer" ? (
                  <Trailer item={top.item} width={SCREEN_W - 36} height={ART_H}
                    onRequestClose={() => { previewingRef.current = false; setPreviewing(false); }} />
                ) : previewing && preview?.kind === "photos" ? (
                  <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
                    onMomentumScrollEnd={(e) =>
                      setPhotoIdx(Math.round(e.nativeEvent.contentOffset.x / (SCREEN_W - 36)))}>
                    {top.item.dishPhotos.map((p) => (
                      <Image key={p.url} source={{ uri: p.url }} style={{ width: SCREEN_W - 36, height: ART_H }}
                        resizeMode="cover" accessibilityLabel={top.item.dish || "Dish photo"} />
                    ))}
                  </ScrollView>
                ) : (
                  // contain, not cover: a book cover or film poster is portrait and
                  // this box is not, so cropping ate the title. The palette shows
                  // through the letterbox, which is the look anyway.
                  <Cover item={top.item} width="100%" height={ART_H} radius={0} fit="contain" />
                )}

                {/* Attribution on the DECK, not just the detail sheet. Both of
                    these are licence conditions — TMDB requires their notice
                    wherever their data appears, and Wikimedia's CC terms require
                    per-photo credit wherever the photo is shown. The sheet had
                    both; the deck, which is where people actually look, had
                    neither. */}
                {previewing && preview?.kind === "trailer" && (
                  <View style={{
                    position: "absolute", left: 0, right: 0, bottom: 0,
                    backgroundColor: "rgba(255,248,231,0.94)", paddingVertical: 4, paddingHorizontal: 9,
                    borderTopWidth: 1.5, borderTopColor: C.line,
                  }}>
                    <Text numberOfLines={2} style={[text.catNo, { fontSize: 8.5, lineHeight: 11 }]}>
                      Trailer via TMDB. {TMDB_DISCLAIMER}
                    </Text>
                  </View>
                )}
                {previewing && preview?.kind === "photos" && top.item.dishPhotos?.[photoIdx] && (
                  <View style={{
                    position: "absolute", left: 0, right: 0, bottom: 0,
                    backgroundColor: "rgba(255,248,231,0.94)", paddingVertical: 4, paddingHorizontal: 9,
                    borderTopWidth: 1.5, borderTopColor: C.line,
                  }}>
                    <Text numberOfLines={2} style={[text.catNo, { fontSize: 8.5, lineHeight: 11 }]}>
                      {photoIdx + 1}/{top.item.dishPhotos.length} · {top.item.dishPhotos[photoIdx].credit},{" "}
                      {top.item.dishPhotos[photoIdx].licence}, via Wikimedia Commons
                    </Text>
                  </View>
                )}
                <View style={{ position: "absolute", top: 14, left: 12 }}>
                  <ExtRating item={top.item} dark />
                </View>
                <View style={{
                  position: "absolute", top: 12, right: 12, backgroundColor: C.card,
                  borderWidth: BORDER, borderColor: C.line, borderRadius: 12,
                  paddingVertical: 6, paddingHorizontal: 10, transform: [{ rotate: "4deg" }],
                }}>
                  <Text style={{ fontFamily: F.mono, fontSize: 13, fontWeight: "700" }}>{displayScore(top.score)}%</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: 8, color: tag.c, fontWeight: "700" }}>{tag.t}</Text>
                </View>

                {/* Swipe intent, revealed proportionally to the drag. */}
                <Animated.View style={{
                  position: "absolute", top: 26, left: 18, opacity: wantOpacity,
                  borderWidth: 3, borderColor: accent.hlDeep, borderRadius: 9,
                  backgroundColor: C.card, paddingVertical: 5, paddingHorizontal: 11, transform: [{ rotate: "-12deg" }],
                }}>
                  <Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: 16, letterSpacing: 1.4, color: accent.hlDeep }}>
                    {domain.stamps.want.toUpperCase()}
                  </Text>
                </Animated.View>
                <Animated.View style={{
                  position: "absolute", top: 26, right: 18, opacity: passOpacity,
                  borderWidth: 3, borderColor: C.stamp, borderRadius: 9,
                  backgroundColor: C.card, paddingVertical: 5, paddingHorizontal: 11, transform: [{ rotate: "12deg" }],
                }}>
                  <Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: 16, letterSpacing: 1.4, color: C.stamp }}>PASS</Text>
                </Animated.View>
              </View>

              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 8 }}>
                  {top.item.genres.map((g) => (
                    <View key={g} style={{ borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8, marginRight: 6, marginBottom: 4 }}>
                      <Text style={text.catNo}>{g}</Text>
                    </View>
                  ))}
                </View>
                <Text style={[text.h2, { fontSize: 23 }]}>{top.item.title}</Text>
                <Text style={[text.catNo, { marginTop: 3, marginBottom: 8 }]}>
                  {top.item.subtitle}
                  {top.item.year && String(top.item.year) !== top.item.subtitle ? ` · ${top.item.year}` : ""}
                  {top.item.meta ? ` · ${top.item.meta}` : ""}
                </Text>

                {(vibe.length > 0 || facts.length > 0) && (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 6 }}>
                    {vibe.map((w) => <VibeChip key={w} label={w} />)}
                    {facts.map((f) => <VibeChip key={f} label={f} fact />)}
                  </View>
                )}

                <Text numberOfLines={3} style={[text.serif, { fontSize: 15.5, lineHeight: 22, color: C.ink2, marginBottom: 8 }]}>
                  {top.item.blurb}
                </Text>

                {people && (
                  <Text style={[text.catNo, { marginBottom: 6 }]}>
                    {people.startsWith("Directed by") ? people : `With ${people}`}
                  </Text>
                )}
                {anchor && (
                  <Text style={[text.catNo, { marginBottom: 6 }]}>
                    ✦ Because you liked <Text style={{ color: C.ink, fontWeight: "700" }}>{anchor.title}</Text>
                  </Text>
                )}
                {caveat && (
                  <Text style={[text.catNo, { marginBottom: 6, color: C.stamp }]}>Heads up · {caveat}</Text>
                )}
                {top.item.reception?.summary && (
                  <Text numberOfLines={2} style={[text.catNo, { marginBottom: 6, lineHeight: 15 }]}>
                    ❝ {top.item.reception.summary}
                  </Text>
                )}

              </ScrollView>

              {/* Pinned, not in the scroll. The preview leads: hearing the
                  track or watching the trailer decides more than any
                  percentage, and it used to be reachable only from the sheet. */}
              <View style={{ borderTopWidth: BORDER, borderTopColor: C.line, backgroundColor: C.card,
                flexDirection: "row", alignItems: "center", gap: 8, padding: 9 }}>
                {preview && (preview.kind === "audio"
                  ? <PreviewButton key={top.item.id} item={top.item} label={preview.label} accent={accent.hl} />
                  : (
                    <Pressable onPress={togglePreview} accessibilityRole="button"
                      accessibilityLabel={previewing ? "Close preview" : preview.label}
                      style={{ flex: 1, borderWidth: BORDER, borderColor: C.ink, borderRadius: 11,
                        backgroundColor: accent.hl, paddingVertical: 10, flexDirection: "row",
                        alignItems: "center", justifyContent: "center", gap: 7 }}>
                      <Feather name={previewing ? "x" : "play"} size={15} color={C.ink} />
                      <Text numberOfLines={1} style={{ fontFamily: F.ui, fontSize: 14, fontWeight: "700" }}>
                        {previewing ? "Close" : preview.label}
                      </Text>
                    </Pressable>
                  ))}
                <Pressable onPress={() => onOpen(top.item)} accessibilityRole="button"
                  accessibilityLabel={`Full details for ${top.item.title}`}
                  style={{ flex: preview ? 0 : 1, borderWidth: BORDER, borderColor: C.ink, borderRadius: 11,
                    backgroundColor: C.card, paddingVertical: 10, paddingHorizontal: 12,
                    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 }}>
                  <Feather name="info" size={13} color={C.ink} />
                  <Text numberOfLines={1} style={{ fontFamily: F.ui, fontSize: 13, fontWeight: "600" }}>Full details</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Animated.View>
      </View>

      {/* Buttons as well as swipe: a swipe-only deck is undiscoverable and
          unusable one-handed for anyone who can't make the gesture. */}
      <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
        <Btn style={{ flex: 1 }} onPress={() => fling("left")} accent={accent.hl}
          label={<Text style={{ fontFamily: F.ui, fontWeight: "700", fontSize: 15 }}>✕  {domain.actions.pass}</Text>} />
        <Btn style={{ flex: 1 }} kind="primary" accent={accent.hl} onPress={() => fling("right")}
          label={<Text style={{ fontFamily: F.ui, fontWeight: "700", fontSize: 15, color: C.paper }}>♥  {domain.actions.want}</Text>} />
      </View>
      <Btn style={{ marginTop: 10 }} onPress={() => onAction(top.item, "consumed")}
        label={domain.actions.consumed} accent={accent.hl} />
    </View>
  );
}
