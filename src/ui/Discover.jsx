import { useState, useRef, useMemo, useEffect } from "react";
import { Heart, X, Info, Check, Play, Pause, Quote, MapPin } from "lucide-react";
import { rankItems } from "../engine/engine.mjs";
import { paletteFor } from "../domains.js";
import { Cover, ExtRating, matchTag, displayScore, ringDegrees, clamp } from "./bits.jsx";
import { fetchTrackPreview, deezerIdOf } from "./preview.js";
import { resolveSwipe, SWIPE_THRESHOLD } from "../engine/stats.mjs";

/* 30s preview player for tracks (music domain only). */
function PreviewButton({ item }) {
  const [state, setState] = useState("idle"); // idle | loading | playing | unavailable
  const audioRef = useRef(null);
  const alive = useRef(true);
  // stop the player when the card unmounts (button is keyed by track id)
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; audioRef.current?.pause(); audioRef.current = null; };
  }, []);
  if (!deezerIdOf(item) && !item.links?.preview) return null;
  const toggle = async (e) => {
    e.stopPropagation();
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
      await audioRef.current.play(); // rejects if the URL is expired/unplayable
      if (alive.current) setState("playing");
      else audioRef.current?.pause();
    } catch {
      if (alive.current) { audioRef.current = null; setState("unavailable"); }
    }
  };
  if (state === "unavailable") return <span className="cat-no">Preview unavailable</span>;
  return (
    <button className="iconbtn" onClick={toggle} onPointerDown={(e) => e.stopPropagation()}
      style={{ color: "var(--ink)", fontWeight: 600 }}>
      {state === "playing" ? <Pause size={15} /> : <Play size={15} />}
      {state === "playing" ? "Pause preview" : state === "loading" ? "Loading…" : "Play 30s preview"}
    </button>
  );
}

export default function Discover({ domain, profile, shelf, onAction, onExplore, onOpen }) {
  const seen = useMemo(() => new Set(Object.keys(shelf)), [shelf]);
  const deck = useMemo(
    () => rankItems(domain.items, profile, domain, { excludeIds: [...seen] }),
    [domain, profile, seen]
  );
  const [drag, setDrag] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [animOut, setAnimOut] = useState(null);
  const startX = useRef(null);
  const dragRef = useRef(0); // authoritative drag distance, immune to render lag
  const whyRef = useRef(null);

  // The breakdown lives inside the card's scrollable body — bring it into
  // view when it opens, or tapping ⓘ looks like it did nothing.
  useEffect(() => {
    if (expanded) whyRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [expanded]);

  const top = deck[0];
  const next = deck[1];

  const commit = (action, rating = null) => {
    if (!top) return;
    onAction(top.item, action, rating);
    setExpanded(false);
    setDrag(0);
  };
  const fling = (dir) => {
    setAnimOut(dir);
    setTimeout(() => { setAnimOut(null); commit(dir === "right" ? "want" : "pass"); }, 180);
  };

  const onDown = (e) => { startX.current = e.clientX ?? e.touches?.[0]?.clientX; dragRef.current = 0; };
  const onMove = (e) => {
    if (startX.current == null) return;
    const x = e.clientX ?? e.touches?.[0]?.clientX;
    dragRef.current = x - startX.current;
    setDrag(dragRef.current);
  };
  const onUp = () => {
    if (startX.current == null) return;
    // Read the ref, not the rendered state: a fast flick can deliver its last
    // pointermove and the pointerup in the same frame, so `drag` may still be
    // stale here and the swipe would be silently dropped.
    const verdict = resolveSwipe(dragRef.current);
    if (verdict === "want") fling("right");
    else if (verdict === "pass") fling("left");
    else setDrag(0);
    startX.current = null;
    dragRef.current = 0;
  };

  if (!top) {
    return (
      <div className="empty">
        <div className="h2" style={{ marginBottom: 6 }}>That's the whole catalogue</div>
        <p className="sub" style={{ maxWidth: 280, margin: "0 auto 18px" }}>
          You've sorted every {domain.noun} in the starter set. Turn the dial up or check your library.
        </p>
        <div className="seg" style={{ maxWidth: 280, margin: "0 auto" }}>
          <button className={profile.explore < 0.55 ? "" : "on"} onClick={() => onExplore(0.75)}>Expand my taste</button>
          <button className={profile.explore < 0.55 ? "on" : ""} onClick={() => onExplore(0.3)}>Stay aligned</button>
        </div>
      </div>
    );
  }

  const rot = drag * 0.04;
  const outX = animOut === "right" ? 600 : animOut === "left" ? -600 : 0;
  const tx = animOut ? outX : drag;
  const tag = matchTag(top.score);
  const pal = paletteFor(top.item.genres[0]);

  return (
    <div>
      <div className="row deckhead" style={{ justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">Your deck</div>
          <div className="cat-no">
            {deck.length} {domain.nounPlural} queued · {profile.interactions} sorted
            {/* two names fit the line; beyond that count them so it never truncates */}
            {domain.hasLocation && profile.cities?.length > 0 && (
              <> · <MapPin size={9} style={{ verticalAlign: "-1px" }} />{" "}
                <span title={profile.cities.join(", ")}>
                  {profile.cities.length <= 2
                    ? profile.cities.join(", ")
                    : `${profile.cities[0]} +${profile.cities.length - 1} more`}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="seg" style={{ width: 188 }}>
          <button className={profile.explore < 0.55 ? "on" : ""} onClick={() => onExplore(0.3)}>Aligned</button>
          <button className={profile.explore >= 0.55 ? "on" : ""} onClick={() => onExplore(0.75)}>Expand</button>
        </div>
      </div>

      <div className="deck">
        {next && (
          <div className="swipecard" style={{ transform: "scale(.955) translateY(10px)", filter: "saturate(.9)", zIndex: 1 }}>
            <div style={{ height: 200, background: paletteFor(next.item.genres[0]).bg }} />
          </div>
        )}
        <div className="swipecard"
          style={{ zIndex: 2, transform: `translateX(${tx}px) rotate(${animOut ? (animOut === "right" ? 18 : -18) : rot}deg)`,
            transition: animOut || startX.current == null ? "transform .18s ease" : "none" }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
          <div className="stamp want" style={{ opacity: clamp(drag / SWIPE_THRESHOLD) }}>{domain.stamps.want}</div>
          <div className="stamp pass" style={{ opacity: clamp(-drag / SWIPE_THRESHOLD) }}>{domain.stamps.pass}</div>

          {/* tapping the artwork opens full detail; a drag is not a tap */}
          <div role="button" tabIndex={0} aria-label={`Open details for ${top.item.title}`}
            onClick={() => { if (Math.abs(drag) < 6) onOpen(top.item); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(top.item); } }}
            style={{ height: 236, background: pal.bg, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", overflow: "hidden", cursor: "pointer" }}>
            <Cover item={top.item} size="lg" />
            <ExtRating item={top.item} dark />
            {top.item.dish && (
              <div style={{ position: "absolute", left: 10, bottom: 10, zIndex: 3, background: "var(--card)",
                border: "2px solid var(--ink)", borderRadius: 10, padding: "5px 10px", boxShadow: "2px 2px 0 var(--ink)",
                fontSize: 11.5, fontWeight: 600, maxWidth: "70%" }}>
                Known for · {top.item.dish}
              </div>
            )}
            <div className="match-pill" title={`${displayScore(top.score)}% taste match — how closely this ${domain.noun} fits the profile you built. Tap ⓘ for the full breakdown.`}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                border: "2px solid var(--ink)",
                background: "conic-gradient(var(--hl) " + ringDegrees(top.score) + "deg, var(--soft) 0)" }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--card)", border: "1.5px solid var(--ink)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700 }}>{displayScore(top.score)}</span>
                </div>
              </div>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: tag.c }}>{displayScore(top.score)}% · {tag.t.replace(/ match$/, "")}</span>
            </div>
          </div>

          <div className="cardbody" style={{ padding: "16px 18px" }}>
            <div className="row" style={{ flexWrap: "wrap", gap: 6, marginBottom: 9 }}>
              {top.item.genres.map((g) => <span key={g} className="cat-no" style={{ border: "1px solid var(--line)", borderRadius: 999, padding: "2px 8px" }}>{g}</span>)}
            </div>
            <div className="h2" style={{ fontSize: 23 }}>{top.item.title}</div>
            <div className="cat-no" style={{ margin: "3px 0 12px" }}>
              {top.item.subtitle}
              {top.item.year && String(top.item.year) !== top.item.subtitle ? ` · ${top.item.year}` : ""}
              {top.item.meta ? ` · ${top.item.meta}` : ""}
            </div>
            {/* clamped so the card never cuts a sentence mid-word; full text in the sheet */}
            <p className="serif" style={{ fontSize: 15.5, lineHeight: 1.5, color: "var(--ink2)",
              margin: "0 0 8px",
              display: "-webkit-box", WebkitLineClamp: expanded ? "unset" : 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {top.item.blurb}
            </p>
            {/* one line of what critics actually said, before you have to ask */}
            {top.item.reception?.summary && !expanded && (
              <p className="cat-no" style={{ margin: "0 0 8px", lineHeight: 1.45,
                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                <Quote size={10} style={{ verticalAlign: "-1px" }} /> {top.item.reception.summary}
              </p>
            )}

            {domain.key === "music" && <div style={{ marginBottom: 4 }}><PreviewButton key={top.item.id} item={top.item} /></div>}

            {expanded && (
              <div ref={whyRef} style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
                <div className="eyebrow" style={{ marginBottom: 10 }}>Why it surfaced · {displayScore(top.score)}% match</div>
                {[[`${domain.genreLabel.replace(/s$/, "")} fit`, top.breakdown.genre], ["Matches what you weigh", top.breakdown.factor],
                  ["Mood match", top.breakdown.tone], [`Like ${domain.nounPlural} you loved`, top.breakdown.similar]].map(([label, v]) => (
                  <div key={label} style={{ marginBottom: 9 }}>
                    <div className="row" style={{ justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 12.5 }}>{label}</span><span className="cat-no">{v}</span>
                    </div>
                    <div className="bar"><span style={{ width: v + "%" }} /></div>
                  </div>
                ))}
                {top.breakdown.avoid > 35 && (
                  <p className="cat-no" style={{ color: "var(--stamp)", marginTop: 8 }}>
                    Heads up: shares some DNA with {domain.nounPlural} you've avoided.
                  </p>
                )}
                {top.item.dish && (
                  <p className="cat-no" style={{ marginTop: 8 }}>
                    Dish photo is illustrative, via Wikipedia — not {top.item.title}'s own plate.
                  </p>
                )}
                {(top.item.links?.appleMusic || top.item.links?.deezer) && (
                  <p className="cat-no" style={{ marginTop: 8 }}>
                    Listen on{" "}
                    {top.item.links.appleMusic && <a href={top.item.links.appleMusic} target="_blank" rel="noreferrer" style={{ color: "var(--slate)" }}>Apple Music</a>}
                    {top.item.links.appleMusic && top.item.links.deezer && " · "}
                    {top.item.links.deezer && <a href={top.item.links.deezer} target="_blank" rel="noreferrer" style={{ color: "var(--slate)" }}>Deezer</a>}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* pinned footer: always reachable, never pushed off by wrapped genres */}
          <button className="cardfoot" onClick={() => onOpen(top.item)}>
            <Info size={13} /> Full details
          </button>
        </div>
      </div>

      <div className="actions">
        <button className="act pass" onClick={() => fling("left")} title={domain.actions.pass}><X size={24} color="var(--stamp)" /></button>
        <button className="act consumed small" onClick={() => commit("consumed", null)} title={domain.actions.consumed}><Check size={20} color="var(--slate)" /></button>
        <button className="act more small" onClick={() => setExpanded((v) => !v)} title="Tell me more"><Info size={20} color="var(--ink2)" /></button>
        <button className="act want" onClick={() => fling("right")} title={domain.actions.want}><Heart size={24} color="var(--hl-deep)" fill="var(--hl-deep)" /></button>
      </div>
      <div className="row" style={{ justifyContent: "center", gap: 26, marginTop: 10 }}>
        {[domain.actions.pass, domain.actions.consumed, "More", domain.actions.want].map((l) => <span key={l} className="cat-no">{l}</span>)}
      </div>
    </div>
  );
}
