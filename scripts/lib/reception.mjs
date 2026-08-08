// ============================================================================
// reception.mjs — pull "what critics said" out of a Wikipedia plaintext dump.
//
// Wikipedia's plain extract is a flat string with wiki-style headings:
//   == Reception ==
//   === Critical reception ===
//   ...body...
//   === Box office ===
//
// We want the critical-response prose specifically — not box office, not
// awards lists. Pure string work so it is unit-testable without the network.
// ============================================================================

/** Split a plaintext extract into { level, title, body } sections, in order. */
export function splitSections(text = "") {
  const out = [];
  const re = /^(=+)\s*(.+?)\s*=+\s*$/gm;
  let m, prev = null;
  while ((m = re.exec(text)) !== null) {
    if (prev) prev.body = text.slice(prev.end, m.index).trim();
    prev = { level: m[1].length, title: m[2].trim(), end: re.lastIndex };
    out.push(prev);
  }
  if (prev) prev.body = text.slice(prev.end).trim();
  return out.map(({ level, title, body }) => ({ level, title, body: body || "" }));
}

// Headings whose prose is the critical verdict, best first.
const WANTED = [
  /^critical (reception|response|reaction|appraisal|commentary)$/i,
  /^(reception and legacy|critical and public reception)$/i,
  /^(reviews|critical acclaim|contemporary reviews|initial reception)$/i,
  /^reception$/i,
];
// Headings that live under Reception but are not opinion prose.
const UNWANTED = /^(box office|accolades|awards|awards and nominations|sales|chart performance|charts|commercial performance|ratings|viewership|legacy|home media|release)$/i;

/**
 * Best available critical-reception prose.
 * Returns { summary, heading } or null when the article has no such section.
 */
export function pickReception(text = "", maxChars = 420) {
  const sections = splitSections(text);
  if (sections.length === 0) return null;

  for (const want of WANTED) {
    const hit = sections.find((s) => want.test(s.title) && !UNWANTED.test(s.title));
    if (!hit) continue;
    // A bare "Reception" heading often holds nothing but subsections; in that
    // case borrow the first child subsection that is actual opinion prose.
    let body = hit.body;
    if (body.length < 80) {
      const idx = sections.indexOf(hit);
      for (let i = idx + 1; i < sections.length && sections[i].level > hit.level; i++) {
        if (!UNWANTED.test(sections[i].title) && sections[i].body.length >= 80) { body = sections[i].body; break; }
      }
    }
    const summary = firstSentences(body, maxChars);
    if (summary) return { summary, heading: hit.title, body };
  }
  return null;
}

// An article can share a title with a work of a different kind (the Harry
// Potter *film* and *video game* both outrank the *novel* in search). Require
// the lead to describe the kind we asked for, and to NOT describe a different
// adaptation of the same name.
export const KIND_PATTERNS = {
  books: /\b(novel|novella|book|memoir|autobiography|biography|non-?fiction|short story collection)\b/i,
  movies: /\b(film|movie|directed by|screenplay)\b/i,
  tv: /\b(television series|tv series|television programme|television program|sitcom|miniseries|anime series|drama series|streaming series|television show)\b/i,
  music: /\b(song|single|track|recorded by|album)\b/i,
  restaurants: /\b(restaurant|delicatessen|deli|diner|eatery|bakery|steakhouse|caf[eé]|pizzeria|market|barbecue|bar)\b/i,
};
// If the lead leads with one of these, it is a different work of the same name.
export const ANTI_KIND = {
  books: /\b(video game|film directed|is a \d{4} (american |british |[a-z]+ )*film|television series)\b/i,
  movies: /\b(video game|is a novel|television series)\b/i,
  tv: /\b(video game|is a \d{4} (american |british |[a-z]+ )*film|is a novel)\b/i,
  music: /\b(video game|is a novel|is a \d{4} (american |british |[a-z]+ )*film)\b/i,
  restaurants: /\b(video game|is a novel|is a \d{4} (american |british |[a-z]+ )*film)\b/i,
};

export function matchesKind(text = "", domainKey) {
  const lead = text.slice(0, 700);
  const re = KIND_PATTERNS[domainKey];
  if (!re) return true;
  if (ANTI_KIND[domainKey]?.test(lead)) return false;
  return re.test(lead);
}

/** Normalize a title for comparison: drop parentheticals, punctuation, articles. */
export function foldTitle(t = "") {
  return t.toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(the|a|an|and|of)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Is this article actually about this item? Title equality alone is not enough
 * ("It Ends With Us" once matched "A Dance with Dragons" on the word "with"),
 * so require the folded titles to match and the lead to corroborate the
 * creator (author/artist) or the year.
 */
export function isArticleForItem(item, articleTitle, text, domainKey) {
  const want = foldTitle(item.title);
  const got = foldTitle(articleTitle);
  if (!want || !got) return false;
  if (got !== want && !got.startsWith(want + " ") && !want.startsWith(got + " ")) return false;
  if (!matchesKind(text, domainKey)) return false;

  const lead = text.slice(0, 1200).toLowerCase();
  // books/music: the creator's surname should appear; tv/movies: the year.
  if (domainKey === "books" || domainKey === "music") {
    const surname = (item.subtitle || "").split(/[,\s]+/).filter(Boolean).pop()?.toLowerCase();
    if (surname && surname.length > 2 && !lead.includes(surname)) return false;
  } else if ((domainKey === "movies" || domainKey === "tv") && item.year) {
    const near = [item.year - 1, item.year, item.year + 1].some((y) => lead.includes(String(y)));
    if (!near) return false;
  }
  return true;
}

/** Prefer a disambiguated article title that names the kind we want. */
export function rankTitles(titles = [], domainKey) {
  const hint = { books: /\((novel|book|novella|memoir)\)/i, movies: /\(.*film\)/i,
    tv: /\(.*(TV series|television series)\)/i, music: /\((song|.*single)\)/i, restaurants: /\(restaurant\)/i }[domainKey];
  const wrongKind = { books: /\(.*film\)|\(.*TV series\)/i, movies: /\((novel|book|song)\)/i,
    tv: /\(.*film\)|\((novel|book)\)/i, music: /\(.*film\)|\((novel|book)\)/i, restaurants: /\(.*film\)/i }[domainKey];
  return [...titles].sort((a, b) => score(b) - score(a));
  function score(t) {
    let s = 0;
    if (hint?.test(t)) s += 2;
    if (wrongKind?.test(t)) s -= 3;
    return s;
  }
}

/** Leading prose of the article — a fuller overview than the one-line blurb. */
export function leadParagraphs(text = "", maxChars = 420) {
  const firstHeading = text.search(/^=+\s*.+?\s*=+\s*$/m);
  return firstSentences(firstHeading === -1 ? text : text.slice(0, firstHeading), maxChars);
}

// Abbreviations that end in a period but do not end a sentence, so the
// naive split has to be stitched back together.
const ABBREV = /\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|No|Vol|Inc|Ltd|Co|approx|U\.S|U\.K|A\.V)\.$/;

/** Trim to whole sentences within a character budget. */
export function firstSentences(text = "", maxChars = 420) {
  const clean = text
    .replace(/\s*\n+\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\[\d+\]/g, "")      // stray citation markers
    .trim();
  if (!clean) return "";

  // Re-join fragments that were split at an abbreviation, not a full stop.
  const parts = clean.split(/(?<=[.!?])\s+/).reduce((acc, p) => {
    if (acc.length && ABBREV.test(acc[acc.length - 1])) acc[acc.length - 1] += " " + p;
    else acc.push(p);
    return acc;
  }, []);

  let out = "";
  for (const p of parts) {
    const candidate = out ? out + " " + p : p;
    if (candidate.length > maxChars) break;
    out = candidate;
  }
  // A single sentence longer than the whole budget still has to fit: cut it at
  // a word boundary rather than returning nothing or splitting mid-word.
  if (!out) out = clean.slice(0, maxChars).replace(/\s+\S*$/, "").trim() + "…";
  return out.trim();
}

/**
 * Pull attributable one-liners: sentences that name a publication or critic
 * AND carry a verdict. These render as pull-quotes in the UI.
 */
const OUTLETS = /\b(The Guardian|The New York Times|Rolling Stone|Pitchfork|Variety|The Hollywood Reporter|Empire|IGN|Roger Ebert|Chicago Sun-Times|The Telegraph|The Times|NPR|Entertainment Weekly|The Atlantic|The New Yorker|Kirkus|Publishers Weekly|The Washington Post|Los Angeles Times|Time|Slant|AV Club|The A\.V\. Club|Metacritic|Rotten Tomatoes|BBC|NME|Billboard)\b/;

export function pullQuotes(text = "", limit = 2, maxChars = 220) {
  const clean = text.replace(/\s*\n+\s*/g, " ").replace(/\[\d+\]/g, "");
  const sentences = clean.split(/(?<=[.!?])\s+/);
  const picked = [];
  for (const s of sentences) {
    const t = s.trim();
    if (t.length < 40 || t.length > maxChars) continue;
    if (!OUTLETS.test(t)) continue;
    if (picked.some((p) => p.text === t)) continue;
    picked.push({ text: t, outlet: (t.match(OUTLETS) || [])[0] || null });
    if (picked.length >= limit) break;
  }
  return picked;
}
