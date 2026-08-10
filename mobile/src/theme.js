// ============================================================================
// theme.js — the neo-brutalist skin, ported from the web client's CSS block.
//
// Same tokens, same per-domain accents, so the two clients are recognisably one
// product. Three things genuinely differ on native and are called out where
// they appear:
//
//   1. Hard offset shadows. CSS `box-shadow: 4px 4px 0 #111` has no direct RN
//      equivalent — iOS shadows are blurred and Android only has elevation. We
//      draw the offset block as a real View behind the content (see <Brut>),
//      which reproduces the look exactly instead of approximating it.
//   2. Fonts. The web loads Fraunces/Inter/IBM Plex Mono from Google. Rather
//      than ship an async font-loading state on a cold start, native uses the
//      closest system faces: Georgia for the display serif and Menlo for mono.
//   3. Safe areas. There is no notch on the web.
// ============================================================================
import { Platform } from "react-native";

export const C = {
  paper: "#FFF8E7",
  paper2: "#FCF0D4",
  card: "#FFFFFF",
  ink: "#111111",
  ink2: "#3A3A34",
  slate: "#111111",
  hl: "#FFD23F",
  hlDeep: "#8A6400",
  stamp: "#E63946",
  muted: "#6E6A5C",
  line: "#111111",
  soft: "#E7DDBE",
};

// Per-domain accent, matching .taste-root.dom-* on the web.
export const ACCENT = {
  books: { hl: "#FFD23F", hlDeep: "#8A6400" },
  restaurants: { hl: "#FF9F1C", hlDeep: "#A85E00" },
  music: { hl: "#53DD6C", hlDeep: "#0F7A2E" },
  movies: { hl: "#FF5D73", hlDeep: "#C1122F" },
  tv: { hl: "#4D9DE0", hlDeep: "#175E9E" },
};

export const accentFor = (key) => ACCENT[key] || ACCENT.books;

export const F = {
  display: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
  ui: Platform.select({ ios: "System", android: "sans-serif", default: "System" }),
  mono: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
};

// Cover palettes, keyed by genre exactly as the web's paletteFor does.
const PALETTES = [
  { bg: "#FFD23F", fg: "#111111" },
  { bg: "#FF9F1C", fg: "#111111" },
  { bg: "#53DD6C", fg: "#111111" },
  { bg: "#4D9DE0", fg: "#FFFFFF" },
  { bg: "#FF5D73", fg: "#FFFFFF" },
  { bg: "#111111", fg: "#FFF8E7" },
  { bg: "#E7DDBE", fg: "#111111" },
];

export function paletteFor(genre = "") {
  let h = 0;
  const s = String(genre);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973;
  return PALETTES[h % PALETTES.length];
}

export const text = {
  eyebrow: { fontFamily: F.mono, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, textTransform: "uppercase", color: C.ink },
  h1: { fontFamily: F.display, fontSize: 30, fontWeight: "700", lineHeight: 33, color: C.ink },
  h2: { fontFamily: F.display, fontSize: 21, fontWeight: "700", lineHeight: 24, color: C.ink },
  serif: { fontFamily: F.display, color: C.ink },
  body: { fontFamily: F.ui, fontSize: 14, lineHeight: 21, color: C.ink2 },
  catNo: { fontFamily: F.mono, fontSize: 10.5, letterSpacing: 0.6, color: C.muted, fontWeight: "500" },
};

// The offset-block shadow distance used throughout, so nothing drifts.
export const OFFSET = 4;
export const BORDER = 2;
export const RADIUS = 13;
