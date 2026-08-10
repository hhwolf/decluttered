// ============================================================================
// bits.js — the shared primitives, mirroring the web client's bits.jsx.
// ============================================================================
import React from "react";
import { View, Text, Pressable, Image, StyleSheet } from "react-native";
import { C, F, text, paletteFor, OFFSET, BORDER, RADIUS } from "../theme";
import { matchLabel } from "../../../src/engine/present.mjs";

/**
 * Brut — a hard offset shadow, the signature of this skin.
 *
 * CSS does this with `box-shadow: 4px 4px 0 #111`. React Native cannot: iOS
 * shadows are always blurred and Android only exposes `elevation`. So the
 * offset block is a real View sitting behind the content, which reproduces the
 * look exactly rather than approximating it with a soft shadow.
 */
export function Brut({ children, style, offset = OFFSET, radius = RADIUS, color = C.ink, bg = C.card, pressed = false }) {
  const shift = pressed ? offset : 0;
  return (
    <View style={[{ position: "relative" }, style]}>
      <View style={{
        position: "absolute", left: offset, top: offset, right: -offset + offset, bottom: -offset + offset,
        backgroundColor: color, borderRadius: radius,
      }} />
      <View style={{
        transform: [{ translateX: shift }, { translateY: shift }],
        backgroundColor: bg, borderWidth: BORDER, borderColor: C.line, borderRadius: radius,
        overflow: "hidden",
      }}>
        {children}
      </View>
    </View>
  );
}

/** A chunky press-down button. Press moves it onto its own shadow, as on the web. */
export function Btn({ label, onPress, kind = "ghost", disabled, style, accent = C.hl }) {
  const [down, setDown] = React.useState(false);
  const bg = kind === "primary" ? C.ink : kind === "hl" ? accent : C.card;
  const fg = kind === "primary" ? C.paper : C.ink;
  const shadow = kind === "primary" ? accent : C.ink;
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      accessibilityRole="button"
      accessibilityLabel={typeof label === "string" ? label : undefined}
      accessibilityState={{ disabled: !!disabled }}
      style={[{ opacity: disabled ? 0.45 : 1 }, style]}
    >
      <View style={{ position: "relative" }}>
        <View style={{ position: "absolute", left: OFFSET, top: OFFSET, right: 0, bottom: 0, backgroundColor: shadow, borderRadius: RADIUS }} />
        <View style={{
          transform: [{ translateX: down ? OFFSET : 0 }, { translateY: down ? OFFSET : 0 }],
          backgroundColor: bg, borderWidth: BORDER, borderColor: C.line, borderRadius: RADIUS,
          paddingVertical: 13, paddingHorizontal: 18, alignItems: "center",
        }}>
          {typeof label === "string"
            ? <Text style={{ fontFamily: F.ui, fontWeight: "700", fontSize: 15, color: fg }}>{label}</Text>
            : label}
        </View>
      </View>
    </Pressable>
  );
}

/** A selectable pill. */
export function Chip({ label, on, onPress, avoid = false, accent = C.hl }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      accessibilityState={{ selected: !!on }} accessibilityLabel={label}>
      <View style={{ position: "relative", marginRight: 9, marginBottom: 9 }}>
        {!on && <View style={{ position: "absolute", left: 2, top: 2, right: 0, bottom: 0, backgroundColor: C.ink, borderRadius: 999 }} />}
        <View style={{
          transform: on ? [{ translateX: 2 }, { translateY: 2 }] : [],
          backgroundColor: on ? (avoid ? C.stamp : accent) : C.card,
          borderWidth: BORDER, borderColor: C.line, borderRadius: 999,
          paddingVertical: 8, paddingHorizontal: 14,
        }}>
          <Text style={{ fontFamily: F.ui, fontSize: 13.5, fontWeight: "600", color: on && avoid ? "#fff" : C.ink }}>{label}</Text>
        </View>
      </View>
    </Pressable>
  );
}

/** A small uppercase tag. `fact` inverts it — see the web note on facts vs vibes. */
export function VibeChip({ label, fact = false }) {
  return (
    <View style={{
      backgroundColor: fact ? C.ink : C.paper2,
      borderWidth: 1.5, borderColor: C.ink, borderRadius: 999,
      paddingVertical: 2, paddingHorizontal: 8, marginRight: 5, marginBottom: 5,
    }}>
      <Text style={{
        fontFamily: F.mono, fontSize: 10, fontWeight: "700", letterSpacing: 0.6,
        textTransform: "uppercase", color: fact ? C.paper : C.ink,
      }}>{label}</Text>
    </View>
  );
}

/** Cover art, or a generated typographic cover when there is no image. */
export function Cover({ item, width = 112, height = 158, radius = 7 }) {
  const pal = paletteFor(item.genres?.[0]);
  if (item.image) {
    return (
      <View style={{ width, height, borderRadius: radius, borderWidth: BORDER, borderColor: C.line, overflow: "hidden", backgroundColor: pal.bg }}>
        <Image source={{ uri: item.image }} style={{ width: "100%", height: "100%" }} resizeMode="cover"
          accessibilityLabel={`Cover of ${item.title}`} />
      </View>
    );
  }
  return (
    <View style={{
      width, height, borderRadius: radius, borderWidth: BORDER, borderColor: C.line,
      backgroundColor: pal.bg, padding: 12, justifyContent: "space-between",
    }}>
      <Text numberOfLines={4} style={{ fontFamily: F.display, fontWeight: "700", fontSize: width > 150 ? 19 : 13, lineHeight: width > 150 ? 21 : 15, color: pal.fg }}>
        {item.title}
      </Text>
      <View>
        <View style={{ height: 2, backgroundColor: pal.fg, opacity: 0.5, marginBottom: 6 }} />
        <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: 9, color: pal.fg, opacity: 0.9 }}>{item.subtitle}</Text>
      </View>
    </View>
  );
}

/**
 * The external rating badge. Carries over the web client's hard-won rule: a
 * Wikipedia score is readership and a Deezer score is play-driven reach, so
 * neither may render as stars or read like a rating.
 */
export function ExtRating({ item, dark = false, compact = false }) {
  const r = item.rating;
  if (!r || r.value == null) return null;
  const fmt = (c) => (c >= 1e6 ? (c / 1e6).toFixed(1) + "M" : c >= 1000 ? Math.round(c / 1000) + "k" : c);
  const scale = r.scale || (r.source === "Deezer" ? 100 : 5);
  const isInterest = r.source === "Wikipedia";
  const isPopularity = scale === 100 && !isInterest;
  const terse = dark || compact;
  let body;
  if (isInterest) body = terse ? `◆ ${r.value}` : `◆ ${r.value} · Wikipedia interest`;
  else if (isPopularity) body = terse ? `▶ ${r.value}` : `▶ ${r.value} · ${r.source} popularity`;
  else if (scale === 10) body = terse ? `★ ${r.value}/10` : `★ ${r.value}/10 · ${r.count ? fmt(r.count) + " on " : ""}${r.source}`;
  else body = terse ? `★ ${r.value}${r.count ? ` · ${fmt(r.count)}` : ""}` : `★ ${r.value} · ${r.count ? fmt(r.count) + " on " : ""}${r.source}`;

  if (dark) {
    return (
      <View style={{
        backgroundColor: C.ink, borderWidth: BORDER, borderColor: C.ink, borderRadius: 10,
        // A percentage here collapses: the absolutely-positioned parent has no
        // resolved width to be a percentage OF. Points, not percent.
        paddingVertical: 6, paddingHorizontal: 10, transform: [{ rotate: "-3deg" }], maxWidth: 190,
      }}>
        <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: 11, fontWeight: "700", color: C.paper }}>{body}</Text>
      </View>
    );
  }
  return <Text style={text.catNo}>{body}</Text>;
}

// Wording and the percentage come from the shared engine so one item can never
// show two different numbers across clients. Only the colour token is native.
const TONE_COLOR = { strong: C.hlDeep, good: C.slate, ok: C.ink2, weak: C.muted };
export function matchTag(score) {
  const { text: t, tone } = matchLabel(score);
  return { t, c: TONE_COLOR[tone] };
}
export { displayScore, ringDegrees } from "../../../src/engine/present.mjs";

export function Card({ children, style }) {
  return (
    <View style={[{
      backgroundColor: C.card, borderWidth: BORDER, borderColor: C.line, borderRadius: 12,
      padding: 14, marginTop: 14,
    }, style]}>{children}</View>
  );
}

export const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  wrap: { flexDirection: "row", flexWrap: "wrap" },
});
