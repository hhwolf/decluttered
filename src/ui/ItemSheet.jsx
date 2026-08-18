import { Heart, X, Check, ExternalLink, Play, Pause, Users, Clock } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { scoreItem } from "../engine/engine.mjs";
import { paletteFor } from "../domains.js";
import { Sheet, Cover, ExtRating, Stars, MiniRate, displayScore, matchTag } from "./bits.jsx";
import { fetchTrackPreview } from "./preview.js";
import { vibeWords, strengths, counterpoint, commitment, factChips, castLine, distinctQuotes,
         timeCommitment, similarTo, lookupLinks, creditLine,
         trailerEmbedUrl, trailerWatchUrl, photoCaption } from "../engine/describe.mjs";
import { TMDB_DISCLAIMER } from "../engine/credits.mjs";

/* Inline 30s preview control, shared shape with the deck's button. */
function SheetPreview({ item }) {
  const [state, setState] = useState("idle");
  const audioRef = useRef(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; audioRef.current?.pause(); audioRef.current = null; };
  }, []);
  const toggle = async () => {
    if (state === "loading") return;
    if (state === "playing") { audioRef.current?.pause(); setState("idle"); return; }
    try {
      if (!audioRef.current) {
        setState("loading");
        const url = await fetchTrackPreview(item);
        if (!alive.current) return;
        if (!url) { setState("unavailable"); return; }
        const audio = new Audio(url);
        audio.onended = () => { if (alive.current) setState("idle"); };
        audioRef.current = audio;
      }
      await audioRef.current.play();
      if (alive.current) setState("playing"); else audioRef.current?.pause();
    } catch {
      if (alive.current) { audioRef.current = null; setState("unavailable"); }
    }
  };
  if (state === "unavailable") return <span className="cat-no">Preview unavailable</span>;
  return (
    <button className="btn btn-ghost" style={{ padding: "9px 14px" }} onClick={toggle}>
      {state === "playing" ? <Pause size={14} style={{ verticalAlign: "-2px" }} /> : <Play size={14} style={{ verticalAlign: "-2px" }} />}
      {" "}{state === "playing" ? "Pause preview" : state === "loading" ? "Loading…" : "Play 30s preview"}
    </button>
  );
}

const LINK_LABELS = {
  imdb: "IMDb", tvmaze: "TVMaze", deezer: "Deezer", appleMusic: "Apple Music",
  openLibrary: "Open Library", google: "Google Maps",
};

/**
 * What other people think — the crowd's score, the critics' verdict, and any
 * live Google reviews. Every claim is attributed to where it came from; we
 * never present a summary as if it were our own judgement.
 */
function WhatOthersSay({ domain, item }) {
  const r = item.rating;
  const scale = r?.scale || (r?.source === "Deezer" ? 100 : 5);
  const pct = r?.value != null ? Math.round((r.value / scale) * 100) : null;
  const rec = item.reception;
  const google = item.googleReviews || [];
  // Wikipedia readership and Deezer's play-driven index both measure attention,
  // not approval. They get their own copy: a track low on the chart isn't
  // "divisive", it just isn't being played much.
  const isInterest = r?.source === "Wikipedia";
  const isPopularity = scale === 100 && !isInterest;
  const quotes = distinctQuotes(rec);

  if (!r?.value && !rec && google.length === 0) return null;

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <div className="eyebrow"><Users size={12} style={{ verticalAlign: "-1px" }} /> What others say</div>
        {/* Deezer stores its raw rank in `count`, not a tally of ratings, so it
            has nothing to report here. */}
        {r?.count > 0 && !isPopularity && (
          <span className="cat-no">
            {r.count.toLocaleString()} {isInterest ? "readers/mo" : "ratings"}
          </span>
        )}
      </div>

      {pct != null && (
        <div style={{ marginBottom: rec || google.length ? 14 : 0 }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 13.5, fontWeight: 500 }}>
              {isInterest ? "Reader interest" : isPopularity ? "Popularity" : "Average rating"} · {r.source}
            </span>
            <span className="cat-no">
              {scale === 100 ? `${r.value}/100` : `${r.value}/${scale}`}
            </span>
          </div>
          <div className="bar"><span style={{ width: pct + "%", background: "var(--slate)" }} /></div>
          <p className="cat-no" style={{ marginTop: 5 }}>
            {isInterest
              ? `How often people look this place up — roughly ${(r.count || 0).toLocaleString()} readers a month. It measures fame, not whether the food is good.`
              : isPopularity
              // Careful not to say "barely charting" — a niche-genre track can
              // sit high on its own chart (the blurb says so) and still have
              // low global reach. Talk about reach, which is what this measures.
              ? `How widely ${r.source} is playing this right now, scored out of 100 — reach, not quality. ` + (
                  pct >= 85 ? "One of the biggest records going." : pct >= 60 ? "Widely played."
                  : pct >= 30 ? "Moderate reach — a deeper cut."
                  : "Little reach outside its own corner; you'd be early to it.")
              : pct >= 90 ? "Near-universal approval." : pct >= 80 ? "Strongly liked by the crowd."
              : pct >= 70 ? "Well liked, with some dissent." : pct >= 55 ? "Mixed but positive."
              : "Divisive — read the reviews before committing."}
          </p>
        </div>
      )}

      {rec?.summary && (
        <div style={{ borderTop: pct != null ? "1px solid var(--line)" : "none", paddingTop: pct != null ? 12 : 0 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Critical reception</div>
          <p className="serif" style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--ink2)", margin: 0 }}>{rec.summary}</p>
          {quotes.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {quotes.map((q, i) => (
                <blockquote key={i} style={{ margin: "0 0 8px", paddingLeft: 10, borderLeft: "3px solid var(--hl)" }}>
                  <p className="serif" style={{ fontSize: 13.5, lineHeight: 1.45, margin: 0, color: "var(--ink)" }}>{q.text}</p>
                  {q.outlet && <span className="cat-no">— via {q.outlet}</span>}
                </blockquote>
              ))}
            </div>
          )}
          <p className="cat-no" style={{ marginTop: 8 }}>
            Summarized from{" "}
            <a href={rec.url} target="_blank" rel="noreferrer" style={{ color: "var(--slate)" }}>
              Wikipedia <ExternalLink size={10} style={{ verticalAlign: "-1px" }} />
            </a>{" "}
            (CC BY-SA), not written by us.
          </p>
        </div>
      )}

      {google.length > 0 && (
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 12 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Recent Google reviews</div>
          {google.slice(0, 3).map((g, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div className="row" style={{ gap: 7, marginBottom: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{g.author}</span>
                <span className="cat-no">{"★".repeat(Math.round(g.rating))} · {g.when}</span>
              </div>
              <p style={{ fontSize: 13.5, lineHeight: 1.45, margin: 0, color: "var(--ink2)" }}>
                {g.text.length > 240 ? g.text.slice(0, 240).replace(/\s+\S*$/, "") + "…" : g.text}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Everything factual we hold about the item, laid out per domain. */
function FactSheet({ domain, item }) {
  const rows = [
    [{ books: "Author", movies: "Released", tv: "Network", music: "Artist", restaurants: "Where" }[domain.key], item.subtitle],
    // A film's subtitle IS its year, so row one already said it. Spending a
    // second row on "Year 2012" pushes real facts further down the table.
    item.year && String(item.year) !== item.subtitle &&
      [{ books: "First published", movies: "Year", tv: "Premiered", music: "Released", restaurants: "Opened" }[domain.key], item.year],
    item.meta && [{ books: "Length", movies: "Runtime", tv: "Episodes", music: "Duration", restaurants: "Price" }[domain.key], item.meta],
    item.dish && ["Known for", item.dish],
    item.cast?.length && ["Cast", item.cast.join(", ")],
    item.directors?.length && ["Director" + (item.directors.length > 1 ? "s" : ""), item.directors.join(", ")],
    item.awards?.length && ["Awards", item.awards.join(", ")],
    [domain.genreLabel, (item.genres || []).join(", ")],
    // Wikipedia and Deezer are 0-100 attention measures, not scores out of five.
    item.rating?.value != null && (
      item.rating.scale === 100 || item.rating.source === "Deezer"
        ? [`${item.rating.source} ${item.rating.source === "Wikipedia" ? "interest" : "popularity"}`,
           `${item.rating.value}/100`]
        : [`${item.rating.source} score`,
           `${item.rating.value}/${item.rating.scale || 5}${item.rating.count ? ` · ${item.rating.count.toLocaleString()} ratings` : ""}`]),
  ].filter((row) => row && row[0] && row[1] !== undefined && row[1] !== null && row[1] !== "");

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="eyebrow" style={{ marginBottom: 10 }}>The details</div>
      {rows.map(([k, v]) => (
        <div key={k} className="row" style={{ justifyContent: "space-between", gap: 14, padding: "6px 0",
          borderBottom: "1px solid var(--line)" }}>
          <span className="cat-no" style={{ flex: "none" }}>{k}</span>
          <span style={{ fontSize: 13.5, textAlign: "right" }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Full item detail. Reachable from every surface that shows a cover, so a tap
 * on artwork is never a dead end. Shows the complete blurb (the deck card
 * truncates it), the score breakdown, craft axes, and the same actions the
 * deck offers — plus rating controls once the item is in the library.
 */

/**
 * A looping, muted trailer clip via YouTube's official IFrame embed.
 *
 * Muted is not a style choice: browsers block unmuted autoplay outright, and a
 * blocked autoplay looks exactly like a broken player. Sound is one tap away.
 *
 * Uploaders can disable embedding, and there is no reliable way to detect that
 * before playback, so the "Watch on YouTube" link is always present rather than
 * being an error state we hope never renders.
 */
function Trailer({ item }) {
  const [muted, setMuted] = useState(true);
  const src = trailerEmbedUrl(item, { muted });
  const watch = trailerWatchUrl(item);
  if (!src) return null;
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <div className="eyebrow">Trailer</div>
        <button className="linkbtn" onClick={() => setMuted((m) => !m)}>
          {muted ? "Unmute" : "Mute"}
        </button>
      </div>
      <div style={{ position: "relative", paddingTop: "56.25%", border: "2px solid var(--ink)",
        borderRadius: 10, overflow: "hidden", background: "#000" }}>
        <iframe
          key={String(muted)}
          src={src}
          title={`${item.title} trailer`}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          loading="lazy"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
        />
      </div>
      <p className="cat-no" style={{ marginTop: 7 }}>
        {/* TMDB's terms require this disclaimer wherever their data appears. */}
        Trailer found via TMDB. {TMDB_DISCLAIMER} Plays from YouTube; if the
        uploader has embedding off,{" "}
        <a href={watch} target="_blank" rel="noreferrer" style={{ color: "var(--slate)" }}>
          watch it there <ExternalLink size={10} style={{ verticalAlign: "-1px" }} />
        </a>.
      </p>
    </div>
  );
}

/**
 * Swipeable photos of the signature dish.
 *
 * These are pictures of the DISH, from Wikimedia Commons — not of this
 * restaurant's plate. A gallery of food shots inside a restaurant's page reads
 * as the restaurant's own photography unless it says otherwise, so it says
 * otherwise, and every photo keeps its author and licence.
 */
function DishGallery({ item }) {
  const photos = item.dishPhotos || [];
  const [i, setI] = useState(0);
  if (!photos.length) return null;
  const p = photos[Math.min(i, photos.length - 1)];
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <div className="eyebrow">{item.dish ? `The ${item.dish.toLowerCase()}` : "The food"}</div>
        <span className="cat-no">{Math.min(i, photos.length - 1) + 1} / {photos.length}</span>
      </div>
      <div className="dishscroll" onScroll={(e) => {
        const w = e.currentTarget.clientWidth || 1;
        setI(Math.round(e.currentTarget.scrollLeft / w));
      }}>
        {photos.map((ph) => (
          <img key={ph.url} src={ph.url} alt={item.dish || "Dish"} className="dishshot" loading="lazy" />
        ))}
      </div>
      <p className="cat-no" style={{ marginTop: 7, lineHeight: 1.45 }}>
        {photoCaption(photos)} {p.credit}, {p.licence}, via{" "}
        <a href={p.source || "https://commons.wikimedia.org"} target="_blank" rel="noreferrer" style={{ color: "var(--slate)" }}>
          Wikimedia Commons
        </a>.
      </p>
    </div>
  );
}

export default function ItemSheet({ domain, item, profile, shelfEntry, onAction, onRate, onClose, onOpenItem }) {
  const s = profile ? scoreItem(item, profile, domain) : null;
  const tag = s ? matchTag(s.score) : null;
  const pal = paletteFor(item.genres?.[0]);
  const status = shelfEntry?.status;
  const elements = shelfEntry?.elements || {};
  const overall = shelfEntry?.rating || 0;
  const titleId = "sheet-title-" + item.id;
  const vibe = vibeWords(item, domain);
  const strong = strengths(item, domain);
  const facts = factChips(item, domain);
  const cast = castLine(item, { max: 4 });
  const caveat = s ? counterpoint(item, domain, profile, s.breakdown) : null;
  const anchor = s?.bestAnchorId ? domain.items.find((i) => i.id === s.bestAnchorId) : null;
  const alike = similarTo(item, domain);
  const lookups = lookupLinks(item, domain);

  const act = (a) => { onAction(item, a); onClose(); };

  const links = Object.entries(item.links || {}).filter(([k, v]) => v && k !== "preview" && LINK_LABELS[k]);

  return (
    <Sheet onClose={onClose} labelledBy={titleId}>
      <div className="row" style={{ alignItems: "flex-start", gap: 14 }}>
        <div style={{ background: pal.bg, borderRadius: 9, padding: 0, flex: "none" }}>
          <Cover item={item} size="md" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ flexWrap: "wrap", gap: 5, marginBottom: 6 }}>
            {(item.genres || []).map((g) => (
              <span key={g} className="cat-no" style={{ border: "1px solid var(--line)", borderRadius: 999, padding: "2px 8px" }}>{g}</span>
            ))}
          </div>
          <h3 id={titleId} className="h2" style={{ fontSize: 20, margin: "0 0 3px", lineHeight: 1.15 }}>{item.title}</h3>
          <div className="cat-no">
            {item.subtitle}
            {item.year && domain.key !== "restaurants" && String(item.year) !== item.subtitle ? ` · ${item.year}` : ""}
            {item.meta ? ` · ${item.meta}` : ""}
          </div>
          <div style={{ marginTop: 6 }}><ExtRating item={item} /></div>
          {commitment(item) && <div className="cat-no" style={{ marginTop: 4 }}>{commitment(item)}</div>}
          {/* What it actually costs you. "62 episodes" dodges the real question. */}
          {timeCommitment(item, domain) && (
            <div className="cat-no" style={{ marginTop: 4, fontWeight: 600, color: "var(--ink)" }}>
              <Clock size={11} style={{ verticalAlign: "-1px" }} /> {timeCommitment(item, domain)}
            </div>
          )}
          {item.dish && <div className="cat-no" style={{ marginTop: 5 }}>Known for · {item.dish}</div>}
          {cast && <div className="cat-no" style={{ marginTop: 5 }}>With {cast}</div>}
          {creditLine(item) && <div className="cat-no" style={{ marginTop: 3 }}>{creditLine(item)}</div>}
          {(vibe.length > 0 || facts.length > 0) && (
            <div className="row" style={{ flexWrap: "wrap", gap: 5, marginTop: 7 }}>
              {vibe.map((w) => <span key={w} className="vibe">{w}</span>)}
              {facts.map((f) => <span key={f} className="vibe fact">{f}</span>)}
            </div>
          )}
        </div>
      </div>

      {s && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <div className="eyebrow">Why it matches</div>
            <span className="cat-no" style={{ color: tag.c, fontWeight: 600 }}>
              {displayScore(s.score)}% · {tag.t.replace(/ match$/, "")}
            </span>
          </div>
          {anchor && (
            <p className="cat-no" style={{ margin: "0 0 10px" }}>
              Closest to <b style={{ color: "var(--ink)" }}>{anchor.title}</b>, which you liked.
            </p>
          )}
          {[[`${domain.genreLabel.replace(/s$/, "")} fit`, s.breakdown.genre], ["Matches what you weigh", s.breakdown.factor],
            ["Mood match", s.breakdown.tone], [`Like ${domain.nounPlural} you loved`, s.breakdown.similar]].map(([label, v]) => (
            <div key={label} style={{ marginBottom: 8 }}>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ fontSize: 12.5 }}>{label}</span><span className="cat-no">{v}</span>
              </div>
              <div className="bar"><span style={{ width: v + "%" }} /></div>
            </div>
          ))}
          {caveat && (
            <p className="cat-no" style={{ marginTop: 10, color: "var(--stamp)" }}>Heads up · {caveat}</p>
          )}
          {strong.length > 0 && (
            <p className="cat-no" style={{ marginTop: 6 }}>Strongest on {strong.join(" and ")}.</p>
          )}
        </div>
      )}

      <p className="serif" style={{ fontSize: 15.5, lineHeight: 1.5, color: "var(--ink2)", margin: "14px 0 0" }}>
        {item.overview || item.blurb}
      </p>
      {item.dish && (
        <p className="cat-no" style={{ marginTop: 8 }}>
          Dish photo is illustrative, via Wikipedia — not {item.title}'s own plate.
        </p>
      )}

      {domain.key === "music" && <div style={{ marginTop: 12 }}><SheetPreview item={item} /></div>}

      <WhatOthersSay domain={domain} item={item} />
      <FactSheet domain={domain} item={item} />

      <div className="card" style={{ marginTop: 14 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>How this {domain.noun} scores on craft</div>
        {domain.factors.map((k) => (
          <div key={k} style={{ marginBottom: 8 }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ fontSize: 12.5 }}>{domain.factorLabels[k]}</span>
              <span className="cat-no">{Math.round((item.factors?.[k] ?? 0.5) * 100)}</span>
            </div>
            <div className="bar"><span style={{ width: (item.factors?.[k] ?? 0.5) * 100 + "%", background: "var(--slate)" }} /></div>
          </div>
        ))}
        <p className="cat-no" style={{ marginTop: 8, lineHeight: 1.45 }}>
          Craft axes are estimated from genre and popularity, then corrected by your own element ratings.
        </p>
      </div>

      {status === "consumed" && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Your rating</div>
          <div className="row" style={{ gap: 10, marginBottom: 10 }}>
            <span className="cat-no" style={{ width: 52 }}>Overall</span>
            <Stars value={overall} size={20} onChange={(n) => onRate(item, { overall: n || 0, elements })} />
          </div>
          {overall > 0 ? domain.factors.map((k) => (
            <div key={k} className="row" style={{ justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 13 }}>{domain.factorLabels[k]}</span>
              <MiniRate value={elements[k] || 0}
                onChange={(n) => onRate(item, { overall, elements: { ...elements, [k]: n || undefined } })} />
            </div>
          )) : <span className="cat-no">Give it an overall rating to unlock element ratings.</span>}
        </div>
      )}

      <Trailer item={item} />
      <DishGallery item={item} />

      {/* Adjectives describe; comparisons calibrate. Three names you may already
          have an opinion about say more than any adjective can. */}
      {alike.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>More like this</div>
          {alike.map(({ item: other }) => (
            <button
              key={other.id}
              className="likerow"
              onClick={() => onOpenItem?.(other)}
              disabled={!onOpenItem}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, display: "block",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{other.title}</span>
                <span className="cat-no">{other.subtitle}</span>
              </span>
              <span className="cat-no" style={{ flex: "none" }}>{(other.genres || [])[0]}</span>
            </button>
          ))}
        </div>
      )}

      {(links.length > 0 || lookups.length > 0) && (
        <p className="cat-no" style={{ marginTop: 14 }}>
          {links.map(([k, v], i) => (
            <span key={k}>
              {i > 0 && " · "}
              <a href={v} target="_blank" rel="noreferrer" style={{ color: "var(--slate)" }}>
                {LINK_LABELS[k]} <ExternalLink size={10} style={{ verticalAlign: "-1px" }} />
              </a>
            </span>
          ))}
          {lookups.map((l, i) => (
            <span key={l.url}>
              {(links.length > 0 || i > 0) && " · "}
              <a href={l.url} target="_blank" rel="noreferrer" style={{ color: "var(--slate)" }}>
                {l.label} <ExternalLink size={10} style={{ verticalAlign: "-1px" }} />
              </a>
            </span>
          ))}
        </p>
      )}

      <div className="row" style={{ gap: 8, marginTop: 16 }}>
        <button className="btn btn-ghost" style={{ flex: 1, padding: "11px 8px" }} onClick={() => act("pass")}>
          <X size={14} style={{ verticalAlign: "-2px" }} /> {domain.actions.pass}
        </button>
        <button className="btn btn-ghost" style={{ flex: 1, padding: "11px 8px" }} onClick={() => act("consumed")}>
          <Check size={14} style={{ verticalAlign: "-2px" }} /> {domain.actions.consumedShort}
        </button>
        <button className="btn btn-hl" style={{ flex: 1.2, padding: "11px 8px" }} onClick={() => act("want")}>
          <Heart size={14} style={{ verticalAlign: "-2px" }} /> {domain.actions.want}
        </button>
      </div>
      {status && (
        <p className="cat-no" style={{ textAlign: "center", marginTop: 9 }}>
          Currently in your library as “{domain.libraryTabs[status]}”.
        </p>
      )}
    </Sheet>
  );
}
