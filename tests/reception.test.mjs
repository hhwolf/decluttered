// Reception-extraction suite — pulls critical prose out of Wikipedia plaintext.
// Pure string work, no network.
import { splitSections, pickReception, leadParagraphs, firstSentences, pullQuotes,
  matchesKind, foldTitle, isArticleForItem, rankTitles } from "../scripts/lib/reception.mjs";

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) pass++; else { fail++; console.log(`FAIL  ${name}${extra ? "  " + extra : ""}`); }
};

const ARTICLE = `Parasite is a 2019 South Korean black comedy thriller film directed by Bong Joon-ho. It follows a poor family who scheme to become employed by a wealthy household.


== Plot ==
The Kim family lives in a semi-basement apartment.


== Reception ==


=== Box office ===
Parasite grossed $71.4 million in South Korea and $258.1 million worldwide.


=== Critical reception ===
Parasite received widespread critical acclaim, with praise for its screenplay, direction and performances. The Guardian called it a "gloriously spiteful satire" that never loses its footing. Writing for Variety, one critic said the film is a nerve-shredding tragicomedy. It holds a 99% approval rating on Rotten Tomatoes.


=== Accolades ===
The film won four Academy Awards.


== Legacy ==
It was the first non-English film to win Best Picture.`;

// ---- section splitting ----------------------------------------------------
const secs = splitSections(ARTICLE);
check("finds every heading", secs.length === 6, `${secs.length}`);
check("records heading levels", secs.find((s) => s.title === "Critical reception").level === 3);
check("attaches body to its heading", secs.find((s) => s.title === "Box office").body.startsWith("Parasite grossed"));
check("last section keeps its body", secs[secs.length - 1].body.includes("first non-English"));
check("empty input yields no sections", splitSections("").length === 0);
check("headingless text yields no sections", splitSections("just prose here").length === 0);

// ---- picking the right section -------------------------------------------
const r = pickReception(ARTICLE);
check("finds a reception section", r !== null);
check("prefers Critical reception over Reception", r.heading === "Critical reception", r?.heading);
check("does not return box office prose", !r.summary.includes("grossed"));
check("does not return accolades prose", !r.summary.includes("Academy Awards"));
check("starts with the critical verdict", r.summary.startsWith("Parasite received widespread critical acclaim"));

check("falls back to a Reception parent that holds prose", (() => {
  const a = `Lead.\n\n\n== Reception ==\nThe book was met with almost unanimously favourable reviews from publications in Britain and America, and was reprinted twice within a year.\n\n\n== Legacy ==\nx`;
  const p = pickReception(a);
  return p && p.summary.startsWith("The book was met");
})());

check("borrows a subsection when Reception itself is empty", (() => {
  const a = `Lead.\n\n\n== Reception ==\n\n\n=== Critical response ===\nCritics praised the record for its warmth and ambition, calling it the strongest work of the artist's career so far.\n\n\n== Track listing ==\nx`;
  const p = pickReception(a);
  return p && p.summary.startsWith("Critics praised the record");
})());

check("skips a Reception whose only child is box office", (() => {
  const a = `Lead.\n\n\n== Reception ==\n\n\n=== Box office ===\nIt grossed $10 million against a $5 million budget worldwide, a modest success.\n\n\n== Cast ==\nx`;
  return pickReception(a) === null;
})());

check("returns null when there is no reception section", pickReception(`Lead.\n\n\n== Plot ==\nStuff happens here and then more stuff happens.`) === null);
check("returns null on empty input", pickReception("") === null);
check("respects the character budget", (() => {
  const p = pickReception(ARTICLE, 120);
  return p.summary.length <= 121;
})(), `${pickReception(ARTICLE, 120)?.summary.length}`);

// ---- lead paragraphs ------------------------------------------------------
const lead = leadParagraphs(ARTICLE);
check("lead stops before the first heading", !lead.includes("The Kim family"));
check("lead starts at the top", lead.startsWith("Parasite is a 2019 South Korean"));
check("lead on a headingless article still works", leadParagraphs("Only prose, no headings at all here.").length > 0);

// ---- sentence trimming ----------------------------------------------------
check("keeps whole sentences", firstSentences("One. Two. Three.", 9) === "One. Two.");
check("collapses newlines", firstSentences("a\n\nb.", 50) === "a b.");
check("strips citation markers", firstSentences("Great film.[12] Really.", 50) === "Great film. Really.");
check("never ends mid-word when nothing fits", (() => {
  const out = firstSentences("supercalifragilistic expialidocious sentence that never ends", 20);
  return out.endsWith("…") && !out.includes("expialidociou ");
})());
check("empty in, empty out", firstSentences("") === "");
check("single long sentence is hard-trimmed", firstSentences("x".repeat(500) + ".", 50).length <= 51);

// ---- pull quotes ----------------------------------------------------------
const q = pullQuotes(ARTICLE);
check("finds attributable quotes", q.length > 0, `${q.length}`);
check("names the outlet", q[0].outlet === "The Guardian", JSON.stringify(q[0]));
check("quote text mentions the outlet", q[0].text.includes("The Guardian"));
check("respects the limit", pullQuotes(ARTICLE, 1).length === 1);
check("skips sentences with no outlet", pullQuotes("It was fine. People liked it well enough overall in the end.").length === 0);
check("skips overly long sentences", pullQuotes(`The Guardian said ${"x".repeat(400)}.`).length === 0);
check("does not duplicate identical sentences", (() => {
  const dup = "The Guardian called it a gloriously spiteful satire. The Guardian called it a gloriously spiteful satire.";
  return pullQuotes(dup, 5).length === 1;
})());

// ---- article matching (regressions from real mismatches) ------------------
const HP_BOOK = { title: "Harry Potter and the Philosopher's Stone", subtitle: "J. K. Rowling", year: 1997 };
const HP_GAME_LEAD = "Harry Potter and the Philosopher's Stone is a 2001 action-adventure video game published by Electronic Arts.";
const HP_FILM_LEAD = "Harry Potter and the Philosopher's Stone is a 2001 fantasy film directed by Chris Columbus.";
const HP_NOVEL_LEAD = "Harry Potter and the Philosopher's Stone is a 1997 fantasy novel by British author J. K. Rowling.";

check("rejects the video game for a book", !isArticleForItem(HP_BOOK, "Harry Potter and the Philosopher's Stone (PlayStation video game)", HP_GAME_LEAD, "books"));
check("rejects the film for a book", !isArticleForItem(HP_BOOK, "Harry Potter and the Philosopher's Stone (film)", HP_FILM_LEAD, "books"));
check("accepts the novel for a book", isArticleForItem(HP_BOOK, "Harry Potter and the Philosopher's Stone", HP_NOVEL_LEAD, "books"));

const ENDS = { title: "It Ends With Us", subtitle: "Colleen Hoover", year: 2016 };
check("rejects an unrelated title sharing one common word",
  !isArticleForItem(ENDS, "A Dance with Dragons", "A Dance with Dragons is a 2011 fantasy novel by American author George R. R. Martin.", "books"));
check("rejects a right-title article by the wrong author",
  !isArticleForItem(ENDS, "It Ends With Us", "It Ends With Us is a 2016 romance novel by Someone Else Entirely.", "books"));
check("accepts the right book", isArticleForItem(ENDS, "It Ends with Us", "It Ends with Us is a 2016 romance novel by Colleen Hoover.", "books"));

const FILM = { title: "Dune", subtitle: "2021", year: 2021 };
check("rejects the novel for a film",
  !isArticleForItem(FILM, "Dune (novel)", "Dune is a 1965 epic science fiction novel by American author Frank Herbert.", "movies"));
check("accepts the film of the right year",
  isArticleForItem(FILM, "Dune (2021 film)", "Dune is a 2021 epic science fiction film directed by Denis Villeneuve.", "movies"));
check("rejects a same-title film from the wrong era",
  !isArticleForItem(FILM, "Dune (1984 film)", "Dune is a 1984 epic science fiction film directed by David Lynch.", "movies"));

const SONG = { title: "Bohemian Rhapsody", subtitle: "Queen", year: 1975 };
check("rejects the biopic for a song",
  !isArticleForItem(SONG, "Bohemian Rhapsody (film)", "Bohemian Rhapsody is a 2018 biographical musical film directed by Bryan Singer.", "music"));
check("accepts the song with its artist named",
  isArticleForItem(SONG, "Bohemian Rhapsody", "Bohemian Rhapsody is a song by the British rock band Queen, released in 1975.", "music"));

// kind detection
check("kind: novel lead reads as a book", matchesKind("It is a 1997 fantasy novel by an author.", "books"));
check("kind: video-game lead is not a book", !matchesKind("It is a 2001 action-adventure video game published by EA.", "books"));
check("kind: film lead reads as a film", matchesKind("It is a 2019 thriller film directed by Bong Joon-ho.", "movies"));
check("kind: series lead reads as tv", matchesKind("It is an American television series created by someone.", "tv"));
check("kind: restaurant lead reads as a restaurant", matchesKind("Katz's Delicatessen is a delicatessen in New York City.", "restaurants"));
check("kind: unknown domain passes through", matchesKind("anything", "widgets"));

// title folding + candidate ranking
check("fold ignores parentheticals and articles", foldTitle("The Dune (2021 film)") === "dune");
check("fold unifies & and and", foldTitle("Sense & Sensibility") === foldTitle("Sense and Sensibility"));
check("ranking prefers the novel for books",
  rankTitles(["Dune (2021 film)", "Dune (novel)"], "books")[0] === "Dune (novel)");
check("ranking prefers the film for movies",
  rankTitles(["Dune (novel)", "Dune (2021 film)"], "movies")[0] === "Dune (2021 film)");
check("ranking is stable when nothing matches", rankTitles(["A", "B"], "books").length === 2);

console.log(`\n=== reception: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
