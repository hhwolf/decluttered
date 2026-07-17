// ============================================================================
// Domain descriptors — everything domain-specific lives here.
// The engine only needs { key, factors, tones }; the rest is UI vocabulary.
// ============================================================================
import booksData from "./data/books.json";
import restaurantsData from "./data/restaurants.json";
import musicData from "./data/music.json";

export const DOMAINS = {
  books: {
    key: "books",
    name: "Shelf",
    noun: "book",
    nounPlural: "books",
    catalogueNo: "№ 001 · Books",
    genreLabel: "Genres",
    factors: ["writing", "plot", "pacing", "character", "originality", "atmosphere"],
    factorLabels: {
      writing: "Prose & style", plot: "Plot & structure", pacing: "Pacing",
      character: "Characters", originality: "Originality", atmosphere: "Atmosphere",
    },
    tones: ["darkness", "complexity", "emotion"],
    toneLabels: {
      darkness: (v) => (v < 0.4 ? "lighter" : v > 0.6 ? "darker" : "balanced"),
      complexity: (v) => (v < 0.4 ? "breezy" : v > 0.6 ? "demanding" : "moderate"),
      emotion: (v) => (v < 0.4 ? "cerebral" : v > 0.6 ? "emotional" : "even"),
    },
    actions: { want: "Want to read", consumed: "Read it", pass: "Pass", consumedShort: "Read" },
    stamps: { want: "Want to read", pass: "Pass" },
    libraryTabs: { want: "Want to read", consumed: "Read", pass: "Passed" },
    craftPrompt: "Rate the craft",
    weighTitle: "What you weigh in a book",
    moodTitle: "The mood you read for",
    heroTitle: ["Stop scrolling.", "Start reading", "what's actually yours."],
    heroSub: "Too many books, too little signal. Shelf builds a profile of your taste — the genres, the prose, the mood you fall for — then hands you a deck worth swiping.",
    ratingSource: "Open Library readers",
    items: booksData,
  },

  restaurants: {
    key: "restaurants",
    name: "Table",
    noun: "restaurant",
    nounPlural: "restaurants",
    catalogueNo: "№ 002 · Restaurants",
    genreLabel: "Cuisines",
    factors: ["food", "ambiance", "service", "value", "creativity", "comfort"],
    factorLabels: {
      food: "Food & flavor", ambiance: "Ambiance", service: "Service",
      value: "Value", creativity: "Creativity", comfort: "Comfort factor",
    },
    tones: ["liveliness", "formality", "adventure"],
    toneLabels: {
      liveliness: (v) => (v < 0.4 ? "calm" : v > 0.6 ? "buzzy" : "relaxed"),
      formality: (v) => (v < 0.4 ? "casual" : v > 0.6 ? "upscale" : "smart-casual"),
      adventure: (v) => (v < 0.4 ? "familiar" : v > 0.6 ? "adventurous" : "open-minded"),
    },
    actions: { want: "Want to try", consumed: "Been there", pass: "Pass", consumedShort: "Visited" },
    stamps: { want: "Want to try", pass: "Pass" },
    libraryTabs: { want: "Want to try", consumed: "Visited", pass: "Passed" },
    craftPrompt: "Rate the experience",
    weighTitle: "What you weigh in a restaurant",
    moodTitle: "The vibe you dine for",
    heroTitle: ["Stop doomscrolling menus.", "Start eating", "where you belong."],
    heroSub: "Endless listicles, five-star noise. Table learns your palate — the cuisines, the vibe, the price of a good night — then deals you a deck of places worth trying.",
    ratingSource: "Google rating",
    items: restaurantsData,
  },

  music: {
    key: "music",
    name: "Queue",
    noun: "track",
    nounPlural: "tracks",
    catalogueNo: "№ 003 · Music",
    genreLabel: "Genres",
    factors: ["melody", "lyrics", "production", "rhythm", "vocals", "originality"],
    factorLabels: {
      melody: "Melody & hooks", lyrics: "Lyrics", production: "Production",
      rhythm: "Rhythm & groove", vocals: "Vocals", originality: "Originality",
    },
    tones: ["energy", "darkness", "density"],
    toneLabels: {
      energy: (v) => (v < 0.4 ? "mellow" : v > 0.6 ? "high-energy" : "mid-tempo"),
      darkness: (v) => (v < 0.4 ? "bright" : v > 0.6 ? "moody" : "balanced"),
      density: (v) => (v < 0.4 ? "sparse" : v > 0.6 ? "lush" : "layered"),
    },
    actions: { want: "Add to queue", consumed: "Heard it", pass: "Pass", consumedShort: "Heard" },
    stamps: { want: "Queue it", pass: "Pass" },
    libraryTabs: { want: "Queued", consumed: "Listened", pass: "Passed" },
    craftPrompt: "Rate the craft",
    weighTitle: "What you weigh in a track",
    moodTitle: "The sound you reach for",
    heroTitle: ["Stop shuffling.", "Start hearing", "what's actually yours."],
    heroSub: "Algorithms chase plays, not taste. Queue learns what a song has to do to move you — the hooks, the words, the energy — then deals you tracks worth queueing.",
    ratingSource: "Deezer listeners",
    items: musicData,
  },
};

export const DOMAIN_KEYS = ["books", "restaurants", "music"];

// Genre palette shared across domains; genres not listed get a hashed fallback.
export const GENRE_PALETTE = {
  // books
  "Fantasy": { bg: "#2E4F4A", fg: "#F0E9D6" }, "Science Fiction": { bg: "#1F2A44", fg: "#E7ECF5" },
  "Literary Fiction": { bg: "#E4DCC9", fg: "#23211C" }, "Mystery": { bg: "#3A2E28", fg: "#E8D9C7" },
  "Thriller": { bg: "#211F1E", fg: "#E4B23E" }, "Romance": { bg: "#7A2E3A", fg: "#F4DCDD" },
  "Horror": { bg: "#141414", fg: "#C9433A" }, "Historical Fiction": { bg: "#5A4632", fg: "#F2E6CF" },
  "Memoir": { bg: "#445C49", fg: "#EFE9D8" }, "Nonfiction": { bg: "#26424E", fg: "#E6EEF0" },
  "Philosophy": { bg: "#2B2A33", fg: "#D8D2C2" }, "Poetry": { bg: "#3E3550", fg: "#EBE3F2" },
  "Young Adult": { bg: "#1E5C66", fg: "#EAF6F5" }, "Classics": { bg: "#5C1F1A", fg: "#F1E3CE" },
  "Magical Realism": { bg: "#4A3B66", fg: "#F0E8D8" }, "Dystopian": { bg: "#2C2F2A", fg: "#CFD3B8" },
  // restaurants (cuisines)
  "Italian": { bg: "#5C1F1A", fg: "#F1E3CE" }, "Japanese": { bg: "#1F2A44", fg: "#E7ECF5" },
  "Mexican": { bg: "#7A3A1E", fg: "#F4E3CE" }, "Chinese": { bg: "#6E1F2A", fg: "#F2DCC9" },
  "Thai": { bg: "#445C49", fg: "#EFE9D8" }, "Indian": { bg: "#8A5A1E", fg: "#F6ECD6" },
  "American": { bg: "#26424E", fg: "#E6EEF0" }, "New American": { bg: "#3E5366", fg: "#E9EEF4" },
  "French": { bg: "#2B2A33", fg: "#D8D2C2" }, "Mediterranean": { bg: "#1E5C66", fg: "#EAF6F5" },
  "Korean": { bg: "#3E3550", fg: "#EBE3F2" }, "Vietnamese": { bg: "#2E4F4A", fg: "#F0E9D6" },
  "Barbecue": { bg: "#3A2E28", fg: "#E8D9C7" }, "Seafood": { bg: "#20505E", fg: "#DDEDF2" },
  "Pizza": { bg: "#6E3A1E", fg: "#F4E6CE" }, "Burgers": { bg: "#4A3320", fg: "#F0E4CB" },
  "Vegetarian": { bg: "#3D5A2E", fg: "#ECF2DC" }, "Bakery & Café": { bg: "#8A6A4A", fg: "#F7F0E2" },
  "Steakhouse": { bg: "#33201C", fg: "#EAD9C4" }, "Soul Food": { bg: "#5A4632", fg: "#F2E6CF" },
  "Deli": { bg: "#44503E", fg: "#ECEFDD" }, "Cajun & Creole": { bg: "#63301F", fg: "#F5E3CD" },
  // music
  "Pop": { bg: "#7A2E58", fg: "#F6DCE9" }, "Rock": { bg: "#2C2F2A", fg: "#CFD3B8" },
  "Hip-Hop": { bg: "#211F1E", fg: "#E4B23E" }, "R&B": { bg: "#4A3B66", fg: "#F0E8D8" },
  "Indie": { bg: "#445C49", fg: "#EFE9D8" }, "Electronic": { bg: "#1E5C66", fg: "#EAF6F5" },
  "Jazz": { bg: "#3A2E28", fg: "#E8D9C7" }, "Classical": { bg: "#E4DCC9", fg: "#23211C" },
  "Country": { bg: "#5A4632", fg: "#F2E6CF" }, "Folk": { bg: "#3D5A2E", fg: "#ECF2DC" },
  "Metal": { bg: "#141414", fg: "#C9433A" }, "Latin": { bg: "#7A3A1E", fg: "#F4E3CE" },
  "K-Pop": { bg: "#3E3550", fg: "#EBE3F2" }, "Soul": { bg: "#6E1F2A", fg: "#F2DCC9" },
  "Alternative": { bg: "#2E4F4A", fg: "#F0E9D6" }, "Dance": { bg: "#20505E", fg: "#DDEDF2" },
};

const FALLBACKS = [
  { bg: "#2B2A33", fg: "#D8D2C2" }, { bg: "#2E4F4A", fg: "#F0E9D6" },
  { bg: "#5A4632", fg: "#F2E6CF" }, { bg: "#1F2A44", fg: "#E7ECF5" },
  { bg: "#5C1F1A", fg: "#F1E3CE" }, { bg: "#3E3550", fg: "#EBE3F2" },
];
export function paletteFor(genre = "") {
  if (GENRE_PALETTE[genre]) return GENRE_PALETTE[genre];
  let h = 0;
  for (let i = 0; i < genre.length; i++) h = (h * 31 + genre.charCodeAt(i)) % 9973;
  return FALLBACKS[h % FALLBACKS.length];
}

// Genre list per domain, derived from the actual catalogue so chips never dead-end.
export function allGenres(domain) {
  const counts = {};
  domain.items.forEach((it) => (it.genres || []).forEach((g) => { counts[g] = (counts[g] || 0) + 1; }));
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
}
