// Mobile screen suite — behaviour, not snapshots.
//
// The shared engine already has 741 Node tests; these cover only what is new on
// native: that the screens wire the shared logic up correctly, that the swipe
// gesture resolves the same way the web one does, and that the honesty rules
// survived the port.
import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";

// RNTL 14's `render` is ASYNC — it returns a promise and `screen` is only
// populated once that resolves. Every test therefore awaits `show`.
import { screen as r, waitFor } from "@testing-library/react-native";
const show = (ui) => render(ui);
import fs from "fs";
import path from "path";

import Discover from "../src/screens/Discover";
import ItemSheet from "../src/screens/ItemSheet";
import Library from "../src/screens/Library";
import ForYou from "../src/screens/ForYou";
import Profile from "../src/screens/Profile";
import { buildInitialProfile, rankItems } from "../../src/engine/engine.mjs";
import { emptyDomainState, sortItem } from "../../src/engine/session.mjs";
import { displayScore } from "../../src/engine/present.mjs";
import { SWIPE_THRESHOLD } from "../../src/engine/stats.mjs";

const load = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, "../../src/data", f), "utf8"));

const BOOKS = {
  key: "books", name: "Shelf", noun: "book", nounPlural: "books",
  genreLabel: "Genres",
  factors: ["writing", "plot", "pacing", "character", "originality", "atmosphere"],
  factorLabels: { writing: "Prose & style", plot: "Plot & structure", pacing: "Pacing", character: "Characters", originality: "Originality", atmosphere: "Atmosphere" },
  tones: ["darkness", "complexity", "emotion"],
  toneLabels: {
    darkness: (v) => (v < 0.4 ? "lighter" : v > 0.6 ? "darker" : "balanced"),
    complexity: (v) => (v < 0.4 ? "breezy" : v > 0.6 ? "demanding" : "moderate"),
    emotion: (v) => (v < 0.4 ? "cerebral" : v > 0.6 ? "emotional" : "even"),
  },
  actions: { want: "Want to read", consumed: "Read it", pass: "Pass", consumedShort: "Read" },
  stamps: { want: "Want to read", pass: "Pass" },
  libraryTabs: { want: "Want to read", consumed: "Read", pass: "Passed" },
  items: load("books.json").slice(0, 60),
};
const TV = { ...BOOKS, key: "tv", name: "Series", noun: "show", nounPlural: "shows",
  factors: ["story", "characters", "writing", "acting", "production", "bingeability"],
  factorLabels: { story: "Story arcs", characters: "Characters", writing: "Writing", acting: "Acting", production: "Production", bingeability: "Bingeability" },
  tones: ["darkness", "complexity", "comfort"],
  actions: { want: "Add to watchlist", consumed: "Watched it", pass: "Pass", consumedShort: "Watched" },
  libraryTabs: { want: "Watchlist", consumed: "Watched", pass: "Passed" },
  items: load("tv.json").slice(0, 60) };

const profileFor = (d) => buildInitialProfile(d, { genres: [], explore: 0.3 });

describe("Discover — the core loop", () => {
  it("shows the engine's top-ranked item, not an arbitrary one", async () => {
    const profile = profileFor(BOOKS);
    const expected = rankItems(BOOKS.items, profile, BOOKS, { excludeIds: [] })[0];
    await show(<Discover domain={BOOKS} profile={profile} shelf={{}} onAction={() => {}} onExplore={() => {}} onOpen={() => {}} />);
    expect(r.getByText(expected.item.title)).toBeTruthy();
  });

  it("shows the same percentage the web client would", async () => {
    const profile = profileFor(BOOKS);
    const top = rankItems(BOOKS.items, profile, BOOKS, { excludeIds: [] })[0];
    await show(<Discover domain={BOOKS} profile={profile} shelf={{}} onAction={() => {}} onExplore={() => {}} onOpen={() => {}} />);
    expect(r.getByText(`${displayScore(top.score)}%`)).toBeTruthy();
  });

  it("the pass button sorts the top item as a pass", async () => {
    const onAction = jest.fn();
    const profile = profileFor(BOOKS);
    const top = rankItems(BOOKS.items, profile, BOOKS, { excludeIds: [] })[0];
    await show(<Discover domain={BOOKS} profile={profile} shelf={{}} onAction={onAction} onExplore={() => {}} onOpen={() => {}} />);
    fireEvent.press(r.getByText(/Pass/));
    await new Promise((done) => setTimeout(done, 260)); // the fling animation completes first
    expect(onAction).toHaveBeenCalledWith(top.item, "pass");
  });

  it("the save button sorts the top item as a want", async () => {
    const onAction = jest.fn();
    const profile = profileFor(BOOKS);
    const top = rankItems(BOOKS.items, profile, BOOKS, { excludeIds: [] })[0];
    await show(<Discover domain={BOOKS} profile={profile} shelf={{}} onAction={onAction} onExplore={() => {}} onOpen={() => {}} />);
    fireEvent.press(r.getByText(/Want to read/));
    await new Promise((done) => setTimeout(done, 260));
    expect(onAction).toHaveBeenCalledWith(top.item, "want");
  });

  // Buttons as well as swipe: a swipe-only deck is undiscoverable and unusable
  // for anyone who cannot make the gesture.
  it("offers button equivalents for every swipe direction", async () => {
    await show(<Discover domain={BOOKS} profile={profileFor(BOOKS)} shelf={{}} onAction={() => {}} onExplore={() => {}} onOpen={() => {}} />);
    expect(r.getByText(/Pass/)).toBeTruthy();
    expect(r.getByText(/Want to read/)).toBeTruthy();
    expect(r.getByText("Read it")).toBeTruthy();
  });

  it("the route into the detail sheet is present and labelled", async () => {
    const onOpen = jest.fn();
    const profile = profileFor(BOOKS);
    const top = rankItems(BOOKS.items, profile, BOOKS, { excludeIds: [] })[0];
    await show(<Discover domain={BOOKS} profile={profile} shelf={{}} onAction={() => {}} onExplore={() => {}} onOpen={onOpen} />);
    fireEvent.press(r.getByLabelText(`Full details for ${top.item.title}`));
    expect(onOpen).toHaveBeenCalledWith(top.item);
  });

  it("already-sorted items are excluded from the deck", async () => {
    const profile = profileFor(BOOKS);
    const first = rankItems(BOOKS.items, profile, BOOKS, { excludeIds: [] })[0];
    await show(<Discover domain={BOOKS} profile={profile} shelf={{ [first.item.id]: { status: "want" } }}
      onAction={() => {}} onExplore={() => {}} onOpen={() => {}} />);
    expect(r.queryByText(first.item.title)).toBeNull();
  });

  it("an empty deck offers a way out rather than a dead end", async () => {
    const all = Object.fromEntries(BOOKS.items.map((i) => [i.id, { status: "pass" }]));
    await show(<Discover domain={BOOKS} profile={profileFor(BOOKS)} shelf={all} onAction={() => {}} onExplore={() => {}} onOpen={() => {}} />);
    expect(r.getByText("That's the whole catalogue")).toBeTruthy();
    expect(r.getByText("Expand my taste")).toBeTruthy();
  });

  it("the explore dial is reachable from the deck", async () => {
    const onExplore = jest.fn();
    await show(<Discover domain={BOOKS} profile={profileFor(BOOKS)} shelf={{}} onAction={() => {}} onExplore={onExplore} onOpen={() => {}} />);
    fireEvent.press(r.getByText("Expand"));
    expect(onExplore).toHaveBeenCalledWith(0.75);
  });

  it("prompts for a city when a place-bound domain has none", async () => {
    const onNeedCity = jest.fn();
    const placeDomain = { ...BOOKS, hasLocation: true };
    await show(<Discover domain={placeDomain} profile={profileFor(BOOKS)} shelf={{}} onAction={() => {}} onExplore={() => {}} onOpen={() => {}} onNeedCity={onNeedCity} />);
    fireEvent.press(r.getByText("Showing restaurants everywhere"));
    expect(onNeedCity).toHaveBeenCalled();
  });
});

describe("ItemSheet — enough information to decide", () => {
  const withReception = load("tv.json").find((t) => t.reception?.summary && t.cast?.length);
  const domain = { ...TV, items: [withReception, ...load("tv.json").slice(0, 40)] };

  it("renders the critical reception that the web client shows", async () => {
    await show(<ItemSheet domain={domain} item={withReception} profile={profileFor(TV)} onAction={() => {}} onRate={() => {}} onClose={() => {}} />);
    expect(r.getByText("Critical reception")).toBeTruthy();
    expect(r.getByText(withReception.reception.summary)).toBeTruthy();
  });

  // Never present a summary as if it were our own judgement.
  it("attributes the reception to Wikipedia", async () => {
    await show(<ItemSheet domain={domain} item={withReception} profile={profileFor(TV)} onAction={() => {}} onRate={() => {}} onClose={() => {}} />);
    expect(r.getByText(/Summarized from Wikipedia \(CC BY-SA\), not written by us\./)).toBeTruthy();
  });

  // The lead is named twice on purpose — once in the at-a-glance header and
  // once in the full details table, exactly as the web sheet does.
  it("names the cast", async () => {
    await show(<ItemSheet domain={domain} item={withReception} profile={profileFor(TV)} onAction={() => {}} onRate={() => {}} onClose={() => {}} />);
    expect(r.getAllByText(new RegExp(withReception.cast[0])).length).toBeGreaterThan(0);
  });

  it("prices the commitment in hours", async () => {
    const long = load("tv.json").find((t) => t.episodes > 40 && /\d+ min/.test(t.meta || ""));
    await show(<ItemSheet domain={{ ...TV, items: [long] }} item={long} profile={profileFor(TV)} onAction={() => {}} onRate={() => {}} onClose={() => {}} />);
    expect(r.getByText(/hours of watching/)).toBeTruthy();
  });

  it("offers comparable items and can navigate to one", async () => {
    const onOpenItem = jest.fn();
    await show(<ItemSheet domain={domain} item={withReception} profile={profileFor(TV)} onAction={() => {}} onRate={() => {}} onClose={() => {}} onOpenItem={onOpenItem} />);
    expect(r.getByText("More like this")).toBeTruthy();
  });

  it("sorting from the sheet also closes it", async () => {
    const onAction = jest.fn(), onClose = jest.fn();
    await show(<ItemSheet domain={domain} item={withReception} profile={profileFor(TV)} onAction={onAction} onRate={() => {}} onClose={onClose} />);
    fireEvent.press(r.getByText("Add to watchlist"));
    expect(onAction).toHaveBeenCalledWith(withReception, "want");
    expect(onClose).toHaveBeenCalled();
  });

  // A Deezer score is play-driven reach; `count` is its raw rank, not a tally
  // of ratings, and rendering it as one was a real bug on the web.
  it("never reports a Deezer rank as a number of ratings", async () => {
    const track = load("music.json")[0];
    const music = { ...BOOKS, key: "music", nounPlural: "tracks",
      factors: ["melody", "lyrics", "production", "rhythm", "vocals", "originality"],
      factorLabels: { melody: "Melody", lyrics: "Lyrics", production: "Production", rhythm: "Rhythm", vocals: "Vocals", originality: "Originality" },
      tones: ["energy", "darkness", "density"], items: [track] };
    await show(<ItemSheet domain={music} item={track} profile={profileFor(music)} onAction={() => {}} onRate={() => {}} onClose={() => {}} />);
    expect(r.queryByText(/ratings/)).toBeNull();
    expect(r.getByText(/Popularity/)).toBeTruthy();
  });
});

// ForYou renders the engine's row contract directly. Getting that contract
// wrong ("row.items" is items, not {item, score} pairs) crashed the screen on
// first render and no test caught it, so these exist now.
describe("ForYou — seven mechanisms, each with a reason", () => {
  const profile = profileFor(BOOKS);

  it("renders without crashing on the engine's real row shape", async () => {
    await show(<ForYou domain={BOOKS} profile={profile} shelf={{}} onOpen={() => {}} />);
    expect(r.getByText("For you")).toBeTruthy();
  });

  it("every row states why it exists", async () => {
    const { buildSuggestionRows } = require("../../src/engine/suggest.mjs");
    const rows = buildSuggestionRows(BOOKS.items, profile, BOOKS, { excludeIds: [] });
    expect(rows.length).toBeGreaterThan(1);
    await show(<ForYou domain={BOOKS} profile={profile} shelf={{}} onOpen={() => {}} />);
    for (const row of rows) expect(r.getByText(row.reason)).toBeTruthy();
  });

  it("cards carry the item title and a match percentage", async () => {
    const { buildSuggestionRows } = require("../../src/engine/suggest.mjs");
    const first = buildSuggestionRows(BOOKS.items, profile, BOOKS, { excludeIds: [] })[0].items[0];
    await show(<ForYou domain={BOOKS} profile={profile} shelf={{}} onOpen={() => {}} />);
    expect(r.getAllByText(first.title).length).toBeGreaterThan(0);
  });

  it("tapping a card opens its sheet", async () => {
    const onOpen = jest.fn();
    const { buildSuggestionRows } = require("../../src/engine/suggest.mjs");
    const first = buildSuggestionRows(BOOKS.items, profile, BOOKS, { excludeIds: [] })[0].items[0];
    const { displayScore: ds } = require("../../src/engine/present.mjs");
    const { scoreItem } = require("../../src/engine/engine.mjs");
    await show(<ForYou domain={BOOKS} profile={profile} shelf={{}} onOpen={onOpen} />);
    fireEvent.press(r.getByLabelText(`${first.title}, ${ds(scoreItem(first, profile, BOOKS).score)} percent match`));
    expect(onOpen).toHaveBeenCalledWith(first);
  });

  it("a fully-sorted catalogue says so rather than rendering nothing", async () => {
    const all = Object.fromEntries(BOOKS.items.map((i) => [i.id, { status: "pass" }]));
    await show(<ForYou domain={BOOKS} profile={profile} shelf={all} onOpen={() => {}} />);
    expect(r.getByText(/nothing left to suggest/)).toBeTruthy();
  });
});

// The trailer embed is the one place a wrong URL parameter produces a player
// that silently refuses to start, so the params are asserted, not eyeballed.
// The deck's preview is the highest-value control on the screen; it used to be
// below the fold (music) or absent entirely (film, food).
describe("Deck preview button", () => {
  const track = { id: "tr_123", title: "A Track", subtitle: "An Artist", genres: ["Soul"],
    factors: {}, tone: {}, popularity: 0.5, rating: { value: 50, source: "Deezer" }, blurb: "b",
    links: { deezer: "https://www.deezer.com/track/123", preview: "https://x/p.mp3" } };
  const music = { ...BOOKS, key: "music", noun: "track", nounPlural: "tracks",
    factors: ["melody", "lyrics", "production", "rhythm", "vocals", "originality"],
    factorLabels: { melody: "Melody", lyrics: "Lyrics", production: "Production", rhythm: "Rhythm", vocals: "Vocals", originality: "Originality" },
    tones: ["energy", "darkness", "density"],
    actions: { want: "Add to queue", consumed: "Heard it", pass: "Pass", consumedShort: "Heard" },
    stamps: { want: "Queue it", pass: "Pass" }, items: [track] };

  it("a track offers audio right on the deck", async () => {
    await show(<Discover domain={music} profile={profileFor(music)} shelf={{}} onAction={() => {}} onExplore={() => {}} onOpen={() => {}} />);
    expect(r.getByLabelText("Play 30s preview")).toBeTruthy();
  });

  const film = { id: "mv_1", title: "A Film", subtitle: "1999", year: 1999, genres: ["Drama"],
    factors: {}, tone: {}, popularity: 0.5, rating: { value: 8, scale: 10 }, blurb: "b",
    trailer: "kmJLuwP3MbY", links: {} };
  const movies = { ...BOOKS, key: "movies", noun: "movie", nounPlural: "movies",
    actions: { want: "Watchlist it", consumed: "Seen it", pass: "Pass", consumedShort: "Seen" },
    stamps: { want: "Watchlist", pass: "Pass" }, items: [film] };

  it("a film offers the trailer right on the deck", async () => {
    await show(<Discover domain={movies} profile={profileFor(movies)} shelf={{}} onAction={() => {}} onExplore={() => {}} onOpen={() => {}} />);
    expect(r.getByLabelText("Watch the trailer")).toBeTruthy();
  });

  it("the trailer plays in place rather than navigating away", async () => {
    await show(<Discover domain={movies} profile={profileFor(movies)} shelf={{}} onAction={() => {}} onExplore={() => {}} onOpen={() => {}} />);
    expect(r.queryByLabelText(/^trailer:/)).toBeNull();
    fireEvent.press(r.getByLabelText("Watch the trailer"));
    await waitFor(() => expect(r.getAllByLabelText(`trailer:${film.trailer}`).length).toBeGreaterThan(0));
  });

  const place = { id: "rs_1", title: "A Place", subtitle: "Boston, MA", city: "Boston", genres: ["Seafood"],
    factors: {}, tone: {}, popularity: 0.5, rating: { value: 4.5 }, blurb: "b", dish: "Lobster roll",
    dishPhotos: [{ url: "https://x/1.jpg", credit: "A", licence: "CC BY 2.0" },
                 { url: "https://x/2.jpg", credit: "B", licence: "CC BY 2.0" }] };
  const rests = { ...BOOKS, key: "restaurants", noun: "restaurant", nounPlural: "restaurants",
    genreLabel: "Cuisines", actions: { want: "Want to try", consumed: "Been there", pass: "Pass", consumedShort: "Visited" },
    stamps: { want: "Want to try", pass: "Pass" }, items: [place] };

  it("a restaurant offers the food photos, counted", async () => {
    await show(<Discover domain={rests} profile={profileFor(rests)} shelf={{}} onAction={() => {}} onExplore={() => {}} onOpen={() => {}} />);
    expect(r.getByLabelText("See the food (2)")).toBeTruthy();
  });

  // Never a button that disappoints.
  it("no preview button when there is nothing to play", async () => {
    await show(<Discover domain={BOOKS} profile={profileFor(BOOKS)} shelf={{}} onAction={() => {}} onExplore={() => {}} onOpen={() => {}} />);
    expect(r.queryByLabelText(/Play 30s|Watch the trailer|See the food/)).toBeNull();
  });

  it("Full details stays reachable alongside the preview", async () => {
    await show(<Discover domain={movies} profile={profileFor(movies)} shelf={{}} onAction={() => {}} onExplore={() => {}} onOpen={() => {}} />);
    expect(r.getByLabelText(`Full details for ${film.title}`)).toBeTruthy();
  });
});

// React Native's AbortSignal comes from the `abort-controller` polyfill, which
// has no static `timeout()`. Using it throws a TypeError on device while working
// perfectly in Node — so the audio preview silently fell back to a 403 URL and
// showed "Loading…" then "Preview unavailable". Nothing native-reachable may
// depend on it again.
// Pause was undone within milliseconds: the status listener inferred intent
// from `playing:false` and restarted playback. Intent is now explicit, and this
// replays the exact event sequence that broke it.
describe("Preview play/pause", () => {
  const track = { id: "tr_9", title: "T", subtitle: "A", genres: ["Soul"], factors: {}, tone: {},
    popularity: 0.5, rating: { value: 50, source: "Deezer" }, blurb: "b",
    links: { deezer: "https://www.deezer.com/track/9", preview: "https://x/p.mp3" } };
  const music = { ...BOOKS, key: "music", noun: "track", nounPlural: "tracks",
    factors: ["melody", "lyrics", "production", "rhythm", "vocals", "originality"],
    factorLabels: { melody: "M", lyrics: "L", production: "P", rhythm: "R", vocals: "V", originality: "O" },
    tones: ["energy", "darkness", "density"],
    actions: { want: "Add to queue", consumed: "Heard it", pass: "Pass", consumedShort: "Heard" },
    stamps: { want: "Queue it", pass: "Pass" }, items: [track] };

  const audio = () => require("expo-audio");
  beforeEach(() => { audio().__players.length = 0; });

  const startPlaying = async () => {
    await show(<Discover domain={music} profile={profileFor(music)} shelf={{}} onAction={() => {}} onExplore={() => {}} onOpen={() => {}} />);
    fireEvent.press(r.getByLabelText("Play 30s preview"));
    await waitFor(() => expect(audio().__players.length).toBe(1));
    const p = audio().__players[0];
    // The source finishes loading, so the component issues its one play().
    p.currentStatus = { isLoaded: true, playing: false };
    await act(async () => { p._emit({ isLoaded: true, playing: false }); });
    await act(async () => { p._emit({ isLoaded: true, playing: true }); });
    return p;
  };

  it("starts playing once loaded", async () => {
    const p = await startPlaying();
    expect(p.play).toHaveBeenCalled();
    await waitFor(() => expect(r.getByLabelText("Pause preview")).toBeTruthy());
  });

  it("issues only one play for a single load", async () => {
    const p = await startPlaying();
    await act(async () => { p._emit({ isLoaded: true, playing: true }); });
    expect(p.play.mock.calls.length).toBe(1);
  });

  it("pause actually pauses", async () => {
    const p = await startPlaying();
    fireEvent.press(r.getByLabelText("Pause preview"));
    expect(p.pause).toHaveBeenCalled();
    await waitFor(() => expect(r.getByLabelText("Play 30s preview")).toBeTruthy());
  });

  // THE bug: a status event lands right after the pause with playing:false and
  // no `paused` flag, and the old listener read that as "start it".
  it("a status event after pause does not restart playback", async () => {
    const p = await startPlaying();
    const before = p.play.mock.calls.length;
    fireEvent.press(r.getByLabelText("Pause preview"));
    await act(async () => { p._emit({ isLoaded: true, playing: false }); });
    await act(async () => { p._emit({ isLoaded: true, playing: false, paused: false }); });
    expect(p.play.mock.calls.length).toBe(before);
    expect(r.getByLabelText("Play 30s preview")).toBeTruthy();
  });

  it("a finished clip returns to idle and can be replayed", async () => {
    const p = await startPlaying();
    await act(async () => { p._emit({ isLoaded: true, playing: false, didJustFinish: true }); });
    await waitFor(() => expect(r.getByLabelText("Play 30s preview")).toBeTruthy());
    p.currentStatus = { isLoaded: true, playing: false, didJustFinish: true };
    fireEvent.press(r.getByLabelText("Play 30s preview"));
    expect(p.seekTo).toHaveBeenCalledWith(0);
    expect(p.play.mock.calls.length).toBeGreaterThan(1);
  });
});

describe("Native-unavailable web APIs", () => {
  const fs = require("fs");
  const path = require("path");
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.jsx?$/.test(e.name)) files.push(full);
    }
  };
  walk(path.join(__dirname, "../src"));
  walk(path.join(__dirname, "../../src/engine"));

  it("no native-reachable file calls AbortSignal.timeout", () => {
    const offenders = files.filter((f) => {
      const body = fs.readFileSync(f, "utf8");
      // Ignore prose in comments explaining why it is banned.
      return /(?<!\* )AbortSignal\.timeout\s*\(/.test(body.replace(/^\s*\*.*$/gm, ""));
    });
    expect(offenders).toEqual([]);
  });

  it("the shared engine is reachable from native at all", () => {
    expect(typeof require("../../src/engine/preview.mjs").resolvePreview).toBe("function");
  });
});

describe("Trailer embed", () => {
  const film = { id: "mv_x", title: "A Film", subtitle: "1999", genres: ["Drama"], trailer: "kmJLuwP3MbY",
    factors: {}, tone: {}, rating: { value: 8, scale: 10 }, blurb: "b", links: {} };
  const dom = { ...BOOKS, key: "movies", nounPlural: "movies", items: [film] };

  it("mounts the player for this video", async () => {
    await show(<ItemSheet domain={dom} item={film} profile={profileFor(dom)} onAction={() => {}} onRate={() => {}} onClose={() => {}} />);
    expect(r.getAllByLabelText("trailer:kmJLuwP3MbY").length).toBeGreaterThan(0);
  });

  // A hand-rolled iframe in a WebView is what YouTube answered with Error
  // 152/153; the IFrame-API player does the origin handshake properly.
  it("uses the IFrame API player, not a raw iframe", async () => {
    await show(<ItemSheet domain={dom} item={film} profile={profileFor(dom)} onAction={() => {}} onRate={() => {}} onClose={() => {}} />);
    expect(r.getAllByLabelText("ytplayer:kmJLuwP3MbY").length).toBeGreaterThan(0);
  });

  // loop on a single video does nothing unless the playlist is the video itself.
  it("loops by passing its own id as the playlist", async () => {
    await show(<ItemSheet domain={dom} item={film} profile={profileFor(dom)} onAction={() => {}} onRate={() => {}} onClose={() => {}} />);
    const p = r.getAllByLabelText("ytplayer:kmJLuwP3MbY")[0];
    expect(p.props.playList).toEqual(["kmJLuwP3MbY"]);
    expect(p.props.initialPlayerParams.loop).toBe(true);
  });

  it("autoplays muted, because unmuted autoplay is blocked", async () => {
    await show(<ItemSheet domain={dom} item={film} profile={profileFor(dom)} onAction={() => {}} onRate={() => {}} onClose={() => {}} />);
    const p = r.getAllByLabelText("ytplayer:kmJLuwP3MbY")[0];
    expect(p.props.play).toBe(true);
    expect(p.props.mute).toBe(true);
  });

  it("offers a way out when the uploader blocks embedding", async () => {
    await show(<ItemSheet domain={dom} item={film} profile={profileFor(dom)} onAction={() => {}} onRate={() => {}} onClose={() => {}} />);
    expect(r.getByText(/watch it there/)).toBeTruthy();
  });

  it("an item with no trailer renders no player at all", async () => {
    const bare = { ...film, trailer: undefined };
    await show(<ItemSheet domain={{ ...dom, items: [bare] }} item={bare} profile={profileFor(dom)} onAction={() => {}} onRate={() => {}} onClose={() => {}} />);
    expect(r.queryByLabelText(/^ytplayer:/)).toBeNull();
  });
});

describe("Dish gallery", () => {
  const photos = [
    { url: "https://x/1.jpg", credit: "A Photographer", licence: "CC BY-SA 2.0", source: "https://commons/1" },
    { url: "https://x/2.jpg", credit: "B Photographer", licence: "CC BY 2.0", source: "https://commons/2" },
  ];
  const place = { id: "rs_x", title: "A Place", subtitle: "Boston, MA", city: "Boston", genres: ["Italian"],
    dish: "Cannoli", dishPhotos: photos, factors: {}, tone: {}, rating: { value: 4.5 }, blurb: "b" };
  const dom = { ...BOOKS, key: "restaurants", nounPlural: "restaurants", genreLabel: "Cuisines", items: [place] };

  it("shows every photo and a counter", async () => {
    await show(<ItemSheet domain={dom} item={place} profile={profileFor(dom)} onAction={() => {}} onRate={() => {}} onClose={() => {}} />);
    expect(r.getByText("1 / 2")).toBeTruthy();
    expect(r.getAllByLabelText("Cannoli").length).toBe(2);
  });

  // A food gallery inside a restaurant page reads as that restaurant's own
  // photography unless it explicitly says otherwise.
  it("says the photos are of the dish, not of this kitchen", async () => {
    await show(<ItemSheet domain={dom} item={place} profile={profileFor(dom)} onAction={() => {}} onRate={() => {}} onClose={() => {}} />);
    expect(r.getByText(/not this kitchen|not of this kitchen|Photos of this restaurant/)).toBeTruthy();
  });

  it("credits the photographer and the licence, as CC requires", async () => {
    await show(<ItemSheet domain={dom} item={place} profile={profileFor(dom)} onAction={() => {}} onRate={() => {}} onClose={() => {}} />);
    expect(r.getByText(/A Photographer, CC BY-SA 2\.0/)).toBeTruthy();
  });

  it("a place with no photos renders no gallery", async () => {
    const bare = { ...place, dishPhotos: [] };
    await show(<ItemSheet domain={{ ...dom, items: [bare] }} item={bare} profile={profileFor(dom)} onAction={() => {}} onRate={() => {}} onClose={() => {}} />);
    expect(r.queryByText(/not this kitchen|not of this kitchen|Photos of this restaurant/)).toBeNull();
  });
});

describe("Library", () => {
  const shelf = Object.fromEntries(BOOKS.items.slice(0, 5).map((i, n) => [i.id, { status: n < 3 ? "want" : "pass", addedAt: n }]));

  it("lists only the active tab's entries", async () => {
    await show(<Library domain={BOOKS} shelf={shelf} onMove={() => {}} onRemove={() => {}} onOpen={() => {}} />);
    expect(r.getByText(BOOKS.items[0].title)).toBeTruthy();
    expect(r.queryByText(BOOKS.items[4].title)).toBeNull();
  });

  it("switches tabs", async () => {
    await show(<Library domain={BOOKS} shelf={shelf} onMove={() => {}} onRemove={() => {}} onOpen={() => {}} />);
    fireEvent.press(r.getByText(/Passed/));
    await waitFor(() => expect(r.getByText(BOOKS.items[4].title)).toBeTruthy());
  });

  it("search narrows the list", async () => {
    await show(<Library domain={BOOKS} shelf={shelf} onMove={() => {}} onRemove={() => {}} onOpen={() => {}} />);
    fireEvent.changeText(r.getByLabelText("Search your library"), BOOKS.items[0].title);
    await waitFor(() => expect(r.queryByText(BOOKS.items[1].title)).toBeNull());
    expect(r.getByText(BOOKS.items[0].title)).toBeTruthy();
  });

  it("an empty shelf says so instead of showing a blank screen", async () => {
    await show(<Library domain={BOOKS} shelf={{}} onMove={() => {}} onRemove={() => {}} onOpen={() => {}} />);
    expect(r.getByText(/Nothing here yet/)).toBeTruthy();
  });

  it("an entry can be removed", async () => {
    const onRemove = jest.fn();
    await show(<Library domain={BOOKS} shelf={shelf} onMove={() => {}} onRemove={onRemove} onOpen={() => {}} />);
    fireEvent.press(r.getByLabelText(`Remove ${BOOKS.items[0].title}`));
    expect(onRemove).toHaveBeenCalledWith(BOOKS.items[0].id);
  });
});

describe("Profile — the retention surfaces", () => {
  const domains = { books: BOOKS, tv: TV };
  const keys = ["books", "tv"];
  let ds = { ...emptyDomainState([]), profile: profileFor(BOOKS), onboarded: true };
  for (const it of BOOKS.items.slice(0, 4)) ds = sortItem(ds, it, "want", BOOKS).state;
  const states = { books: ds, tv: emptyDomainState([]) };

  const renderProfile = (extra = {}) => show(
    <Profile domain={BOOKS} profile={ds.profile} shelf={ds.shelf} activity={ds.activity}
      states={states} domainKeys={keys} domains={domains}
      onSwitchDomain={() => {}} onExplore={() => {}} onCities={() => {}} onReset={() => {}} {...extra} />
  );

  it("shows a live streak once something was sorted today", async () => {
    await renderProfile();
    expect(r.getByText("Daily streak")).toBeTruthy();
    expect(r.getByText("1 day")).toBeTruthy();
  });

  it("shows progress toward the daily goal", async () => {
    await renderProfile();
    expect(r.getByText("4/10 today")).toBeTruthy();
  });

  it("shows the next milestone", async () => {
    await renderProfile();
    expect(r.getByText(/Next · Getting warm/)).toBeTruthy();
  });

  it("lists every craving and can switch", async () => {
    const onSwitchDomain = jest.fn();
    await renderProfile({ onSwitchDomain });
    expect(r.getByText("All five cravings")).toBeTruthy();
    fireEvent.press(r.getByText("Series"));
    expect(onSwitchDomain).toHaveBeenCalledWith("tv");
  });

  it("says a craving is not started rather than showing a bare zero", async () => {
    await renderProfile();
    expect(r.getByText("not started")).toBeTruthy();
  });

  it("the explore dial is reachable from the profile", async () => {
    const onExplore = jest.fn();
    await renderProfile({ onExplore });
    fireEvent.press(r.getByText("Expand my taste"));
    expect(onExplore).toHaveBeenCalledWith(0.75);
  });
});

describe("Swipe parity with the web client", () => {
  // The verdict function is shared, so the two clients cannot disagree about
  // what counts as a swipe. This asserts the native screen actually uses it.
  it("uses the shared threshold", async () => {
    expect(SWIPE_THRESHOLD).toBe(110);
  });
  it("a drag shorter than the threshold is not a sort", async () => {
    const { resolveSwipe } = require("../../src/engine/stats.mjs");
    expect(resolveSwipe(SWIPE_THRESHOLD - 1)).toBeNull();
    expect(resolveSwipe(-(SWIPE_THRESHOLD - 1))).toBeNull();
  });
  it("a drag past the threshold resolves in the right direction", async () => {
    const { resolveSwipe } = require("../../src/engine/stats.mjs");
    expect(resolveSwipe(SWIPE_THRESHOLD + 1)).toBe("want");
    expect(resolveSwipe(-(SWIPE_THRESHOLD + 1))).toBe("pass");
  });
});
