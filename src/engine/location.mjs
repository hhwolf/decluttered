// ============================================================================
// location.mjs — the "where am I eating?" preference.
//
// Only the restaurants domain is place-bound: a perfect match in Memphis is
// useless to someone in Boston. These helpers narrow the discovery pool to the
// cities a user actually visits, without touching the catalogue itself (the
// library still has to resolve items from cities they later deselect).
//
// Pure functions; unit-tested in tests/location.test.mjs.
// ============================================================================

// Offered first in the picker. Everything else follows alphabetically.
export const FOCUS_CITIES = ["Boston", "New York", "Chicago", "San Francisco", "Los Angeles"];

/** The metro an item belongs to, falling back to its display location. */
export const cityOf = (item) => item?.city || (item?.subtitle || "").replace(/,\s*[A-Z]{2}$/, "") || null;

/**
 * Every city in the catalogue with a count, focus metros first (in their
 * curated order), then the rest alphabetically.
 */
export function allCities(items = []) {
  const counts = new Map();
  for (const it of items) {
    const c = cityOf(it);
    if (c) counts.set(c, (counts.get(c) || 0) + 1);
  }
  const rank = (c) => {
    const i = FOCUS_CITIES.indexOf(c);
    return i === -1 ? FOCUS_CITIES.length : i;
  };
  return [...counts.entries()]
    .map(([city, count]) => ({ city, count, focus: FOCUS_CITIES.includes(city) }))
    .sort((a, b) => rank(a.city) - rank(b.city) || a.city.localeCompare(b.city));
}

/**
 * Narrow to the chosen cities. An empty or missing selection means "anywhere",
 * so the deck never silently empties just because nothing was picked.
 */
export function filterByCities(items = [], cities) {
  if (!cities || cities.length === 0) return items;
  const want = new Set(cities);
  const kept = items.filter((it) => want.has(cityOf(it)));
  // A selection that matches nothing (stale city after a catalogue change)
  // falls back to the full pool rather than showing an empty deck.
  return kept.length > 0 ? kept : items;
}

/** Group for display: chosen cities first, then focus order, then A-Z. */
export function sortByCity(items = [], cities = []) {
  const chosen = new Set(cities);
  const rank = (c) => {
    if (chosen.has(c)) return -1;
    const i = FOCUS_CITIES.indexOf(c);
    return i === -1 ? FOCUS_CITIES.length : i;
  };
  return [...items].sort((a, b) => {
    const ca = cityOf(a) || "", cb = cityOf(b) || "";
    return rank(ca) - rank(cb) || ca.localeCompare(cb) || (b.popularity || 0) - (a.popularity || 0);
  });
}

/** How many items a given selection would leave to discover. */
export const countForCities = (items, cities) =>
  (!cities || cities.length === 0) ? items.length : items.filter((it) => cities.includes(cityOf(it))).length;
