// Privacy suite — keeps the two copies of the policy telling the same story.
//
// The policy exists twice: mobile/PRIVACY.md (the source, reviewed in the repo)
// and public/privacy.html (the public URL App Store Connect requires). Two
// copies of a legal document that disagree is worse than one, and the failure is
// silent — nobody rereads a privacy policy after shipping it.
//
// These tests do not compare wording; that would fail on every reflow. They pin
// the claims that would actually matter if they drifted: the date, the core
// promise, which third parties receive data, and the age rating.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const md = fs.readFileSync(path.join(ROOT, "mobile", "PRIVACY.md"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "public", "privacy.html"), "utf8");

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) pass++; else { fail++; console.log(`FAIL  ${name}${extra ? "  " + extra : ""}`); }
};

// Strip tags so claims can be matched against rendered text, not markup.
const htmlText = html.replace(/<style[\s\S]*?<\/style>/g, " ")
                     .replace(/<!--[\s\S]*?-->/g, " ")
                     .replace(/<[^>]+>/g, " ")
                     .replace(/\s+/g, " ");
const mdText = md.replace(/\s+/g, " ");

// ---- the date must match, or the public page silently claims to be current ----
{
  const dateOf = (s) => (s.match(/(\d{1,2}\s+\w+\s+20\d\d)/) || [])[1];
  const a = dateOf(mdText), b = dateOf(htmlText);
  check("both copies carry a date", Boolean(a) && Boolean(b), `md=${a} html=${b}`);
  check("the two dates agree", a === b, `md=${a} html=${b}`);
}

// ---- the core promise, which is the whole reason "Data Not Collected" is honest ----
for (const [label, claim] of [
  ["collects nothing", /does not collect, transmit or store any personal information/i],
  ["no account or analytics", /no account, no sign-in, no analytics and no advertising/i],
  ["profile stays local", /never leaves your device/i],
  ["no backend", /no backend of its own/i],
  ["nothing sold or shared", /do not share, sell or transfer/i],
  ["IP address disclosed honestly", /will see your IP address/i],
  ["YouTube cookies disclosed", /cookies/i],
  ["in-app erasure route", /Start over/i],
  ["age rating", /12\+/],
]) {
  check(`markdown states: ${label}`, claim.test(mdText));
  check(`public page states: ${label}`, claim.test(htmlText));
}

// ---- every third party named in one must be named in the other ----
// Adding a data recipient to the app and not to the public page is the drift
// that actually gets a listing pulled.
{
  const PARTIES = ["Deezer", "YouTube", "Wikimedia", "Wikipedia", "Open Library", "IMDb", "TVMaze", "TMDB"];
  for (const p of PARTIES) {
    const inMd = mdText.includes(p), inHtml = htmlText.includes(p);
    check(`${p} is disclosed in both copies`, inMd === inHtml && inMd,
      `md=${inMd} html=${inHtml}`);
  }
}

// ---- the public page has to actually be publishable ----
{
  check("public page is a complete HTML document",
    /^<!DOCTYPE html>/i.test(html.trim()) && /<\/html>\s*$/i.test(html.trim()));
  check("public page declares a viewport, so it is readable on a phone",
    /name="viewport"/.test(html));
  check("public page has a title naming the app",
    /<title>[^<]*Decluttered[^<]*<\/title>/i.test(html));
  check("public page needs no JavaScript", !/<script/i.test(html));
  // Vite copies public/ verbatim; anything outside it would need a router entry.
  check("page lives in public/ so Vite ships it",
    fs.existsSync(path.join(ROOT, "public", "privacy.html")));
}

console.log(`\n=== privacy: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
