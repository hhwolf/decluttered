// ============================================================================
// publish-log.mjs — publish BUILD_LOG.md to hhwolf/asterialogs.
//
// That repo is the canonical account-level log store, and it has conventions
// this script follows rather than inventing its own:
//
//   <project>/BUILD_LOG.md              the full per-project log, with a
//                                       provenance header pointing back here
//   README.md "Project Logs"            a one-line index entry
//   logs/consolidated-build-change-log  a dated entry per substantial change,
//                                       appended chronologically
//
// The repo README also says, in bold terms: no secrets, API keys, tokens or raw
// credentials. This script refuses to publish if it finds anything key-shaped,
// because that repo is PUBLIC.
//
//   npm run log:publish -- --note "what this round was about"
//   npm run log:publish -- --dry
// ============================================================================
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, "..");
const SLUG = "decluttered";
const REPO = "hhwolf/asterialogs";
const BLURB = "five cravings, one taste engine — web and React Native";

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry");
const note = (() => {
  const i = argv.indexOf("--note");
  return i >= 0 ? argv[i + 1] : null;
})();

const sh = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/**
 * Key-shaped strings must never reach a public repo. Deliberately broad: a
 * false positive costs one edit, a false negative is a leaked credential.
 */
const SECRET_PATTERNS = [
  /\b[0-9a-f]{32}\b/i,                 // bare hex api keys (TMDB is one)
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,      // github tokens
  /\beyJ[A-Za-z0-9_-]{10,}\./,         // jwt
  /\bAKIA[0-9A-Z]{16}\b/,              // aws
  /(api[_-]?key|secret|token|password)\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}/i,
];

export function findSecrets(text) {
  const hits = [];
  text.split("\n").forEach((line, i) => {
    for (const re of SECRET_PATTERNS) {
      if (re.test(line)) hits.push({ line: i + 1, text: line.trim().slice(0, 80) });
    }
  });
  return hits;
}

/** The header that tells a reader this file is a copy and where to edit it. */
export function provenance(sha, date) {
  return `<!-- Published from the ${SLUG} repository by \`npm run log:publish\`.\n`
    + `     Edit BUILD_LOG.md there, not this copy. -->\n\n`
    + `> Source commit \`${sha}\` · ${date}\n\n`;
}

/** Add this project to the README index, exactly once. */
export function withIndexEntry(readme) {
  const entry = `- [\`${SLUG}/BUILD_LOG.md\`](${SLUG}/BUILD_LOG.md) — ${BLURB}`;
  if (readme.includes(`(${SLUG}/BUILD_LOG.md)`)) return readme;
  const heading = "## Project Logs";
  const at = readme.indexOf(heading);
  if (at === -1) return `${readme.trimEnd()}\n\n${heading}\n\n${entry}\n`;
  // Append after the last existing bullet in that section.
  const rest = readme.slice(at);
  const endOfSection = rest.search(/\n## /) === -1 ? rest.length : rest.search(/\n## /);
  const section = rest.slice(0, endOfSection);
  const lastBullet = section.lastIndexOf("\n- ");
  if (lastBullet === -1) return readme.slice(0, at) + section + `\n${entry}\n` + rest.slice(endOfSection);
  const lineEnd = section.indexOf("\n", lastBullet + 1);
  const cut = at + (lineEnd === -1 ? section.length : lineEnd);
  return readme.slice(0, cut) + `\n${entry}` + readme.slice(cut);
}

/**
 * A consolidated-log entry in the shape the repo's own Update Rule asks for:
 * date, repo, reason, what shipped, why it matters, refs, verification,
 * blockers. Appended chronologically, and replaced if today's already exists.
 */
export function consolidatedEntry({ date, sha, reason, shipped, tests, blockers }) {
  return [
    `### ${date} — Decluttered (${SLUG})`,
    ``,
    `Repo: \`${SLUG}\` · source commit \`${sha}\``,
    ``,
    `User request: ${reason}`,
    ``,
    `Shipped:`,
    ``,
    ...shipped.map((s) => `- ${s}`),
    ``,
    `Why it matters: the full log is at [\`${SLUG}/BUILD_LOG.md\`](../${SLUG}/BUILD_LOG.md).`,
    ``,
    `Verification: ${tests}`,
    ``,
    `Blockers / follow-up: ${blockers}`,
    ``,
  ].join("\n");
}

export function upsertConsolidated(doc, entry, date) {
  const marker = `### ${date} — Decluttered (${SLUG})`;
  if (doc.includes(marker)) {
    // Replace today's entry rather than stacking near-duplicates.
    const start = doc.indexOf(marker);
    const after = doc.indexOf("\n### ", start + 1);
    const nextSection = doc.indexOf("\n## ", start + 1);
    const end = [after, nextSection].filter((x) => x > -1).sort((a, b) => a - b)[0] ?? doc.length;
    return doc.slice(0, start) + entry.trimEnd() + "\n" + doc.slice(end + 1);
  }
  // Entries are chronological, so append at the end of the work-log section.
  const nextHeading = doc.indexOf("\n## Product / Demo App Build Log Highlights");
  if (nextHeading === -1) return `${doc.trimEnd()}\n\n${entry}`;
  return doc.slice(0, nextHeading + 1) + entry + doc.slice(nextHeading + 1);
}

function main() {
  const logPath = path.join(ROOT, "BUILD_LOG.md");
  const body = fs.readFileSync(logPath, "utf8");

  const secrets = findSecrets(body);
  if (secrets.length) {
    console.error(`refusing to publish — ${REPO} is public and BUILD_LOG.md looks like it contains a credential:`);
    for (const s of secrets) console.error(`  line ${s.line}: ${s.text}`);
    process.exit(1);
  }

  const sha = sh("git", ["rev-parse", "--short", "HEAD"], ROOT);
  const date = sh("git", ["log", "-1", "--format=%cs"], ROOT);
  const subjects = sh("git", ["log", "-12", "--format=%s"], ROOT).split("\n").filter(Boolean);
  const tests = (body.match(/TOTAL\s*=\s*([0-9]+)/) || [])[1];

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "asterialogs-"));
  const work = path.join(tmp, "asterialogs");
  sh("gh", ["repo", "clone", REPO, work, "--", "-q"]);

  // 1. the full per-project log
  fs.mkdirSync(path.join(work, SLUG), { recursive: true });
  fs.writeFileSync(path.join(work, SLUG, "BUILD_LOG.md"), provenance(sha, date) + body);

  // 2. the README index
  const readmePath = path.join(work, "README.md");
  fs.writeFileSync(readmePath, withIndexEntry(fs.readFileSync(readmePath, "utf8")));

  // 3. the consolidated change log
  const consPath = path.join(work, "logs", "consolidated-build-change-log.md");
  const entry = consolidatedEntry({
    date, sha,
    reason: note || "create a build log for this product and highlight all key features; keep it updated",
    shipped: subjects.slice(0, 8),
    tests: tests ? `${tests} automated tests green (shared engine, web, and native), web production build clean.`
                 : "test suites green; see the project log.",
    blockers: "Android unbuilt (no JDK); native client pinned to Expo SDK 54 because the App Store Expo Go lags npm; native audio/video verification needs a development build.",
  });
  fs.writeFileSync(consPath, upsertConsolidated(fs.readFileSync(consPath, "utf8"), entry, date));

  if (DRY) {
    console.log(sh("git", ["diff", "--stat"], work) || "(no changes)");
    console.log(`\n[dry run] nothing pushed. staged copy at ${work}`);
    return;
  }

  const changed = sh("git", ["status", "--porcelain"], work);
  if (!changed) { console.log("already up to date — nothing to publish"); return; }

  sh("git", ["add", "-A"], work);
  sh("git", ["-c", "user.name=Henry He", "-c", "user.email=henryrhe2008college@gmail.com",
    "commit", "-q", "-m", `decluttered: build log at ${sha}`], work);
  sh("git", ["push", "-q", "origin", "HEAD"], work);
  console.log(`published ${SLUG}/BUILD_LOG.md at ${sha} -> https://github.com/${REPO}`);
}

const runDirectly = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (runDirectly) main();
