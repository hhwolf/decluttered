// ============================================================================
// present.mjs — score-to-human mappings shared by every client.
//
// These are display-only translations of the engine's true 0..100 score. They
// live here rather than in a UI file because the web and native clients must
// never show two different numbers for the same item: while porting, the mobile
// client was briefly given a re-derived formula and the same card read 73% in
// one place and 78% in the other.
//
// Ranking, matching, learning and the match label all use the TRUE score.
// ============================================================================
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

/**
 * The readable percentage. Deliberately never reads 100: an honest ceiling
 * (~true 80 -> 86%) keeps the number believable before the user has swiped
 * anything, and never promises a perfect match.
 */
export const displayScore = (score) => Math.round(clamp(0.72 * score + 28, 8, 97));

export const ringDegrees = (score) => displayScore(score) * 3.6;

/**
 * The wording next to the percentage. Returns a semantic `tone` rather than a
 * colour so each platform can map it to its own token — CSS custom properties
 * on the web, a JS palette on native.
 */
export function matchLabel(score) {
  if (score >= 60) return { text: "Strong match", tone: "strong" };
  if (score >= 45) return { text: "Good match", tone: "good" };
  if (score >= 32) return { text: "Worth a look", tone: "ok" };
  return { text: "A stretch", tone: "weak" };
}
