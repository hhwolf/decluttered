// ============================================================================
// importer.mjs — bring an existing library in from Goodreads / Letterboxd /
// IMDb CSV exports. Pure functions: parse text -> match against a catalogue ->
// return the shelf entries to merge. No DOM, no fetch. Unit-tested.
// ============================================================================

/** RFC4180-ish CSV parser: handles quoted fields, embedded commas, "" escapes. */
export function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  const src = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// Column aliases across the three export formats we accept.
const COLS = {
  title: ["title", "name", "const_title", "original title"],
  author: ["author", "author l-f", "primary author", "directors", "director"],
  year: ["year", "year published", "original publication year", "release date", "date"],
  rating: ["my rating", "rating", "your rating"],
  shelf: ["exclusive shelf", "shelf", "bookshelves", "watched", "status"],
};

const normHeader = (h) => h.trim().toLowerCase().replace(/^"|"$/g, "");
const findCol = (headers, names) => headers.findIndex((h) => names.includes(h));

/** Fold a title for comparison: lowercase, strip articles/punctuation/subtitles. */
export function foldTitle(t = "") {
  return t.toLowerCase()
    .replace(/\([^)]*\)/g, " ")            // "(unabridged)", "(Book 2)"
    .replace(/\s*[:–—-]\s.*$/, "")         // subtitle after a colon or dash
    .replace(/[’']/g, "")                  // drop apostrophes, don't split the word
    .replace(/&/g, " and ")                // "X & Y" and "X and Y" must agree
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(the|a|an|and)\b/g, " ")   // leading/among-word articles
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse a CSV export into normalized rows.
 * Returns [] when the file has no recognizable title column.
 */
export function parseExport(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map(normHeader);
  const iTitle = findCol(headers, COLS.title);
  if (iTitle === -1) return [];
  const iAuthor = findCol(headers, COLS.author);
  const iYear = findCol(headers, COLS.year);
  const iRating = findCol(headers, COLS.rating);
  const iShelf = findCol(headers, COLS.shelf);

  return rows.slice(1).map((r) => {
    const yearRaw = iYear >= 0 ? r[iYear] || "" : "";
    const yearMatch = yearRaw.match(/\d{4}/);
    const ratingRaw = iRating >= 0 ? parseFloat(r[iRating]) : NaN;
    // Letterboxd/IMDb rate out of 10; Goodreads out of 5. Detect by magnitude.
    const rating = Number.isFinite(ratingRaw) && ratingRaw > 0
      ? Math.max(1, Math.min(5, Math.round(ratingRaw > 5 ? ratingRaw / 2 : ratingRaw)))
      : null;
    const shelfRaw = (iShelf >= 0 ? r[iShelf] || "" : "").toLowerCase();
    const status = /to-read|watchlist|want/.test(shelfRaw) ? "want" : "consumed";
    return {
      title: (r[iTitle] || "").trim(),
      author: iAuthor >= 0 ? (r[iAuthor] || "").trim() : "",
      year: yearMatch ? +yearMatch[0] : null,
      rating,
      status,
    };
  }).filter((x) => x.title);
}

/**
 * Match parsed rows against a catalogue. Title fold must match exactly; year
 * (±1, to absorb edition/release drift) and author surname break ties. Anything
 * unmatched is reported rather than silently dropped.
 */
export function matchToCatalogue(rows, items) {
  const index = new Map();
  for (const it of items) {
    const key = foldTitle(it.title);
    if (!key) continue;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(it);
  }

  const matched = [], unmatched = [];
  const used = new Set();
  for (const row of rows) {
    const cands = index.get(foldTitle(row.title)) || [];
    let best = null, bestScore = -1;
    for (const c of cands) {
      if (used.has(c.id)) continue;
      let score = 1;
      if (row.year && c.year) score += Math.abs(c.year - row.year) <= 1 ? 2 : -1;
      if (row.author && c.subtitle) {
        const surname = row.author.split(/[,\s]+/).filter(Boolean).pop()?.toLowerCase();
        if (surname && c.subtitle.toLowerCase().includes(surname)) score += 2;
      }
      if (score > bestScore) { bestScore = score; best = c; }
    }
    if (best && bestScore >= 1) { used.add(best.id); matched.push({ item: best, row }); }
    else unmatched.push(row);
  }
  return { matched, unmatched };
}

/** Turn matches into shelf entries, newest-first ordering preserved. */
export function toShelfEntries(matched, now = Date.now()) {
  const shelf = {};
  matched.forEach(({ item, row }, i) => {
    shelf[item.id] = {
      status: row.status,
      rating: row.rating || undefined,
      addedAt: now - i, // keep file order stable in "recently added"
    };
  });
  return shelf;
}
