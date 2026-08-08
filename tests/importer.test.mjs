// Importer suite — CSV parsing and catalogue matching for Goodreads /
// Letterboxd / IMDb exports, exercised against the real catalogues.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCSV, foldTitle, parseExport, matchToCatalogue, toShelfEntries } from "../src/engine/importer.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = (f) => JSON.parse(fs.readFileSync(path.join(root, "src/data", f), "utf8"));

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) pass++; else { fail++; console.log(`FAIL  ${name}${extra ? "  " + extra : ""}`); }
};

// ---- CSV parsing ----------------------------------------------------------
check("splits simple rows", parseCSV("a,b\n1,2").length === 2);
check("keeps quoted commas together", parseCSV('t\n"Hello, World"')[1][0] === "Hello, World");
check("unescapes doubled quotes", parseCSV('t\n"She said ""hi"""')[1][0] === 'She said "hi"');
check("handles embedded newline in quotes", parseCSV('t\n"line1\nline2"')[1][0] === "line1\nline2");
check("handles CRLF", parseCSV("a,b\r\n1,2")[1][1] === "2");
check("strips a UTF-8 BOM", parseCSV("﻿title\nx")[0][0] === "title");
check("drops blank lines", parseCSV("a\n\n\nb").length === 2);

// ---- title folding --------------------------------------------------------
check("fold drops leading article", foldTitle("The Hobbit") === "hobbit");
check("fold drops parentheticals", foldTitle("Dune (Dune, #1)") === "dune");
check("fold drops subtitle after colon", foldTitle("Sapiens: A Brief History") === "sapiens");
check("fold is punctuation-insensitive", foldTitle("Harry Potter & the Philosopher's Stone") === foldTitle("Harry Potter and the Philosophers Stone"));
check("fold is case-insensitive", foldTitle("ANIMAL FARM") === foldTitle("Animal Farm"));

// ---- Goodreads-shaped export ---------------------------------------------
const goodreads = [
  "Title,Author,My Rating,Exclusive Shelf,Original Publication Year",
  '"The Hobbit","Tolkien, J.R.R.",5,read,1937',
  '"Dune (Dune, #1)","Herbert, Frank",4,read,1965',
  '"A Game of Thrones","Martin, George R. R.",0,to-read,1996',
].join("\n");
const grRows = parseExport(goodreads);
check("parses every data row", grRows.length === 3, `${grRows.length}`);
check("reads titles", grRows[0].title === "The Hobbit");
check("reads authors", grRows[0].author.includes("Tolkien"));
check("reads year", grRows[0].year === 1937);
check("maps 5-star rating as-is", grRows[0].rating === 5);
check("treats 0 rating as unrated", grRows[2].rating === null);
check("maps to-read to want", grRows[2].status === "want");
check("maps read to consumed", grRows[0].status === "consumed");

// ---- Letterboxd-shaped export (10-point ratings) -------------------------
const letterboxd = ["Name,Year,Rating", "The Shawshank Redemption,1994,9", "Parasite,2019,10"].join("\n");
const lbRows = parseExport(letterboxd);
check("accepts Name as the title column", lbRows[0].title === "The Shawshank Redemption");
check("halves a 10-point rating", lbRows[0].rating === 5, `${lbRows[0].rating}`);
check("caps converted rating at 5", lbRows[1].rating === 5);

// ---- malformed input ------------------------------------------------------
check("no title column yields nothing", parseExport("foo,bar\n1,2").length === 0);
check("empty file yields nothing", parseExport("").length === 0);
check("header-only file yields nothing", parseExport("Title,Author").length === 0);
check("rows without a title are dropped", parseExport("Title\n\nx").length === 1);

// ---- matching against the real catalogues --------------------------------
const books = load("books.json");
const movies = load("movies.json");

const b0 = books[0], b1 = books[1];
const csv = `Title,Author,My Rating,Exclusive Shelf,Original Publication Year
"${b0.title.replace(/"/g, '""')}","${b0.subtitle}",5,read,${b0.year || ""}
"${b1.title.replace(/"/g, '""')}","${b1.subtitle}",4,to-read,${b1.year || ""}
"Definitely Not A Real Book At All","Nobody",3,read,1900`;
const { matched, unmatched } = matchToCatalogue(parseExport(csv), books);
check("matches real catalogue titles", matched.length === 2, `${matched.length}`);
check("reports the unmatched row", unmatched.length === 1 && /Definitely Not/.test(unmatched[0].title));
check("matched to the right items", matched[0].item.id === b0.id && matched[1].item.id === b1.id);

check("year disambiguates same-title films", (() => {
  // pick a title that appears more than once in the movie catalogue, if any
  const counts = {};
  for (const m of movies) { const k = foldTitle(m.title); counts[k] = (counts[k] || 0) + 1; }
  const dupKey = Object.keys(counts).find((k) => counts[k] > 1 && k);
  if (!dupKey) return true; // nothing to disambiguate in this snapshot
  const dupes = movies.filter((m) => foldTitle(m.title) === dupKey);
  const target = dupes[dupes.length - 1];
  const rows = parseExport(`Name,Year\n"${target.title.replace(/"/g, '""')}",${target.year}`);
  const res = matchToCatalogue(rows, movies);
  return res.matched.length === 1 && res.matched[0].item.year === target.year;
})());

check("one catalogue item is never claimed twice", (() => {
  const dup = `Title,Author\n"${b0.title.replace(/"/g, '""')}","${b0.subtitle}"\n"${b0.title.replace(/"/g, '""')}","${b0.subtitle}"`;
  const res = matchToCatalogue(parseExport(dup), books);
  return res.matched.length === 1 && res.unmatched.length === 1;
})());

// ---- shelf entries --------------------------------------------------------
const shelf = toShelfEntries(matched, 1000);
check("builds one entry per match", Object.keys(shelf).length === 2);
check("carries status through", shelf[b0.id].status === "consumed" && shelf[b1.id].status === "want");
check("carries rating through", shelf[b0.id].rating === 5);
check("omits rating when unrated", (() => {
  const s = toShelfEntries(matchToCatalogue(parseExport(`Title\n"${b0.title.replace(/"/g, '""')}"`), books).matched, 1000);
  return s[b0.id].rating === undefined;
})());
check("addedAt preserves file order", shelf[b0.id].addedAt > shelf[b1.id].addedAt);

console.log(`\n=== importer: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
