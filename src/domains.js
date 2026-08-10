// ============================================================================
// Domain descriptors — everything domain-specific lives here.
// The engine only needs { key, factors, tones }; the rest is UI vocabulary.
// ============================================================================
import booksData from "./data/books.json";
import restaurantsData from "./data/restaurants.json";
import musicData from "./data/music.json";
import moviesData from "./data/movies.json";
import tvData from "./data/tv.json";
// Live ratings and reviews, when a deployment has refreshed them. Google's and
// Yelp's terms forbid committing their content, so these files are gitignored
// and ship as {}. A real star rating supersedes whatever the committed
// catalogue carries — including the Wikipedia interest score on
// Wikidata-sourced places, which is readership, not approval.
import googleReviews from "./data/google-reviews.json";
import liveRatings from "./data/live-ratings.json";

for (const r of restaurantsData) {
  if (googleReviews[r.id]?.length) r.googleReviews = googleReviews[r.id];
  const live = liveRatings[r.id];
  if (live?.rating?.value) r.rating = { ...live.rating, scale: 5 };
  if (live?.price && !r.meta) r.meta = "$".repeat(live.price);
  if (live?.reviews?.length) r.googleReviews = live.reviews;
}

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
    goalLabels: {
      classics: { chip: "Read more classics", row: "Goal · the canon", reason: "You said you want more classics — the books that stuck around, whatever your usual lane." },
      hidden: { chip: "Find hidden gems", row: "Goal · off the bestseller list", reason: "You asked for hidden gems — loved hard by the few who found them." },
      short: { chip: "Finish more books", row: "Goal · short & finishable", reason: "You want to finish more — the shortest books in the catalogue still worth your time." },
      buzzy: { chip: "Keep up with the buzz", row: "Goal · what everyone's reading", reason: "You want to stay current — the big recent books people are actually talking about." },
      acclaimed: { chip: "Only the best-rated", row: "Goal · acclaim only", reason: "You asked for the top shelf — nothing under stellar reader ratings." },
      broaden: { chip: "Broaden my horizons", row: "Goal · furthest from home", reason: "You want range — picked precisely because they're least like your profile." },
    },
    items: booksData,
  },

  movies: {
    key: "movies",
    name: "Screen",
    noun: "movie",
    nounPlural: "movies",
    catalogueNo: "№ 004 · Movies",
    genreLabel: "Genres",
    factors: ["story", "acting", "direction", "visuals", "pacing", "originality"],
    factorLabels: {
      story: "Story & script", acting: "Acting", direction: "Direction",
      visuals: "Visuals & craft", pacing: "Pacing", originality: "Originality",
    },
    tones: ["darkness", "intensity", "emotion"],
    toneLabels: {
      darkness: (v) => (v < 0.4 ? "lighter" : v > 0.6 ? "darker" : "balanced"),
      intensity: (v) => (v < 0.4 ? "slow-burn" : v > 0.6 ? "gripping" : "steady"),
      emotion: (v) => (v < 0.4 ? "cerebral" : v > 0.6 ? "emotional" : "even"),
    },
    actions: { want: "Watchlist it", consumed: "Seen it", pass: "Pass", consumedShort: "Seen" },
    stamps: { want: "Watchlist", pass: "Pass" },
    libraryTabs: { want: "Watchlist", consumed: "Seen", pass: "Passed" },
    craftPrompt: "Rate the craft",
    weighTitle: "What you weigh in a movie",
    moodTitle: "The mood you watch for",
    heroTitle: ["Stop browsing trailers.", "Start watching", "what's actually yours."],
    heroSub: "Forty minutes of scrolling, zero minutes of watching. Screen learns what a film has to do to hold you — the story, the craft, the intensity — then deals you a deck worth queueing up.",
    ratingSource: "IMDb rating",
    goalLabels: {
      classics: { chip: "Watch the canon", row: "Goal · the canon", reason: "You said you want the classics — the films every list assumes you've seen." },
      hidden: { chip: "Find hidden gems", row: "Goal · under the radar", reason: "You asked for hidden gems — rated with the greats, seen by far fewer." },
      short: { chip: "Keep it under 2 hours", row: "Goal · tight runtimes", reason: "You want your evenings back — the best of the shortest." },
      buzzy: { chip: "Keep up with the buzz", row: "Goal · the conversation", reason: "You want to stay current — recent releases everyone's arguing about." },
      acclaimed: { chip: "Only the best-rated", row: "Goal · acclaim only", reason: "You asked for the top shelf — nothing below the high-8s." },
      broaden: { chip: "Broaden my horizons", row: "Goal · furthest from home", reason: "You want range — picked precisely because they're least like your profile." },
    },
    items: moviesData,
  },

  tv: {
    key: "tv",
    name: "Series",
    noun: "show",
    nounPlural: "shows",
    catalogueNo: "№ 005 · TV",
    genreLabel: "Genres",
    factors: ["story", "characters", "writing", "acting", "production", "bingeability"],
    factorLabels: {
      story: "Story arcs", characters: "Characters", writing: "Writing & dialogue",
      acting: "Acting", production: "World & production", bingeability: "Bingeability",
    },
    tones: ["darkness", "complexity", "comfort"],
    toneLabels: {
      darkness: (v) => (v < 0.4 ? "lighter" : v > 0.6 ? "darker" : "balanced"),
      complexity: (v) => (v < 0.4 ? "easy-watch" : v > 0.6 ? "demanding" : "moderate"),
      comfort: (v) => (v < 0.4 ? "edge-of-seat" : v > 0.6 ? "comfort watch" : "mixed"),
    },
    actions: { want: "Add to watchlist", consumed: "Watched it", pass: "Pass", consumedShort: "Watched" },
    stamps: { want: "Watchlist", pass: "Pass" },
    libraryTabs: { want: "Watchlist", consumed: "Watched", pass: "Passed" },
    craftPrompt: "Rate the craft",
    weighTitle: "What you weigh in a series",
    moodTitle: "The register you binge in",
    heroTitle: ["Stop rewatching.", "Start a series", "that's actually yours."],
    heroSub: "Three streamers, nine home screens, the same four shows. Series learns what keeps you pressing next episode — the arcs, the characters, the register — then deals you a deck worth committing to.",
    ratingSource: "TVMaze rating",
    goalLabels: {
      classics: { chip: "See the landmarks", row: "Goal · landmark television", reason: "You said you want the canon — the series that changed what TV could do." },
      hidden: { chip: "Find hidden gems", row: "Goal · under the radar", reason: "You asked for hidden gems — adored by small, loud audiences." },
      short: { chip: "Short episodes only", row: "Goal · easy episodes", reason: "You want light commitment — the best shows with the shortest episodes." },
      buzzy: { chip: "Keep up with the buzz", row: "Goal · the conversation", reason: "You want to stay current — what group chats are actually watching." },
      acclaimed: { chip: "Only the best-rated", row: "Goal · acclaim only", reason: "You asked for the top shelf — nothing below the high-8s." },
      broaden: { chip: "Broaden my horizons", row: "Goal · furthest from home", reason: "You want range — picked precisely because they're least like your profile." },
    },
    items: tvData,
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
    // Only this domain is place-bound — a perfect match in Memphis is no use
    // to someone in Boston, so onboarding asks where they eat.
    hasLocation: true,
    locationTitle: "Where are you eating?",
    locationSub: "Pick the cities you actually visit. Your deck and suggestions stay there; you can change this any time.",
    heroTitle: ["Stop doomscrolling menus.", "Start eating", "where you belong."],
    heroSub: "Endless listicles, five-star noise. Table learns your palate — the cuisines, the vibe, the price of a good night — then deals you a deck of places worth trying.",
    ratingSource: "Google rating",
    goalLabels: {
      classics: { chip: "Hit the institutions", row: "Goal · the institutions", reason: "You said you want the legends — the rooms that earned their lines decades ago." },
      hidden: { chip: "Find hidden gems", row: "Goal · neighborhood secrets", reason: "You asked for hidden gems — beloved locally, unknown nationally." },
      short: { chip: "Casual & easy", row: "Goal · low-key nights", reason: "You want easy wins — great food, no reservation gymnastics." },
      buzzy: { chip: "Keep up with the buzz", row: "Goal · the hot list", reason: "You want to stay current — where everyone is trying to get a table." },
      acclaimed: { chip: "Only the best-rated", row: "Goal · acclaim only", reason: "You asked for the top shelf — the highest Google ratings, full stop." },
      broaden: { chip: "Broaden my palate", row: "Goal · furthest from home", reason: "You want range — cuisines picked precisely because they're least like your profile." },
    },
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
    // Deezer's index counts plays, not listeners rating anything.
    ratingSource: "Deezer popularity",
    goalLabels: {
      classics: { chip: "Know the classics", row: "Goal · the songbook", reason: "You said you want the canon — the tracks everything since is quoting." },
      hidden: { chip: "Find hidden gems", row: "Goal · deep cuts", reason: "You asked for hidden gems — adored by the few who found them." },
      short: { chip: "Tight singles only", row: "Goal · no filler", reason: "You want it punchy — the best of the shortest." },
      buzzy: { chip: "Keep up with the charts", row: "Goal · charting now", reason: "You want to stay current — what's actually charting this week." },
      acclaimed: { chip: "Peak popularity only", row: "Goal · consensus hits", reason: "You asked for the sure things — top of the listener scores." },
      broaden: { chip: "Broaden my ears", row: "Goal · furthest from home", reason: "You want range — genres picked precisely because they're least like your profile." },
    },
    items: musicData,
  },
};

// media-first ordering: books, movies, tv, music, then restaurants
// Queue leads: music is the primary craving, so it is both the first tab and
// the one a cold start opens on.
export const DOMAIN_KEYS = ["music", "books", "movies", "tv", "restaurants"];

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
  // movies & tv
  "Drama": { bg: "#3E3550", fg: "#EBE3F2" }, "Crime": { bg: "#211F1E", fg: "#E4B23E" },
  "Action": { bg: "#5C1F1A", fg: "#F1E3CE" }, "Adventure": { bg: "#445C49", fg: "#EFE9D8" },
  "Comedy": { bg: "#8A6A1E", fg: "#F7F0D8" }, "Animation": { bg: "#1E5C66", fg: "#EAF6F5" },
  "Family": { bg: "#3D5A2E", fg: "#ECF2DC" }, "History": { bg: "#5A4632", fg: "#F2E6CF" },
  "War": { bg: "#33201C", fg: "#EAD9C4" }, "Western": { bg: "#6E3A1E", fg: "#F4E6CE" },
  "Musical": { bg: "#7A2E58", fg: "#F6DCE9" }, "Supernatural": { bg: "#2B2A33", fg: "#D8D2C2" },
  "Espionage": { bg: "#26424E", fg: "#E6EEF0" }, "Anime": { bg: "#20505E", fg: "#DDEDF2" },
  "Legal": { bg: "#3E5366", fg: "#E9EEF4" }, "Medical": { bg: "#44503E", fg: "#ECEFDD" },
  // books (expanded subjects)
  "Short Stories": { bg: "#4A4038", fg: "#EFE6D9" },
  "Humor": { bg: "#8A7A1E", fg: "#F8F3D6" },
  "Science": { bg: "#1B4C5A", fg: "#E2F0F4" },
  "Psychology": { bg: "#4A3B66", fg: "#F0E8D8" },
  "Business": { bg: "#33414D", fg: "#E7EDF2" },
  "Self-Help": { bg: "#3D6B52", fg: "#EAF5EE" },
  "Travel": { bg: "#1F6B73", fg: "#E3F4F5" },
  "Graphic Novels": { bg: "#6E2140", fg: "#F7DEE8" },
  "Children's": { bg: "#C97E1E", fg: "#2B1C05" },
  // music (expanded genres)
  "Reggae": { bg: "#2E6B33", fg: "#EAF6E8" },
  "Blues": { bg: "#1E3A5F", fg: "#E3ECF7" },
  "Reggaeton": { bg: "#7A2E58", fg: "#F6DCE9" },
  "Afrobeats": { bg: "#8A4A1E", fg: "#F8E7D3" },
  "Brazilian": { bg: "#2F6B4F", fg: "#E8F5EE" },
  "Asian": { bg: "#5C2340", fg: "#F5DEEA" },
  "Salsa": { bg: "#A33A1E", fg: "#FBE7DA" },
  "Cumbia": { bg: "#6E5A1E", fg: "#F5EED2" },
  "Gospel": { bg: "#4A3B66", fg: "#F0E8D8" },
  "Soundtrack": { bg: "#2B2A33", fg: "#D8D2C2" },
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
