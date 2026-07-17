import { useState, useRef, useMemo, useEffect } from "react";
import { Heart, X, Info, Check, Play, Pause } from "lucide-react";
import { rankItems } from "../engine/engine.mjs";
import { paletteFor } from "../domains.js";
import { Cover, ExtRating, matchTag, displayScore, ringDegrees, clamp } from "./bits.jsx";

/* 30s preview player for tracks (music domain only). */
function PreviewButton({ url }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);
  // stop + drop the player whenever the track changes or the card unmounts
  useEffect(() => () => { audioRef.current?.pause(); audioRef.current = null; setPlaying(false); }, [url]);
  if (!url) return null;
  const toggle = (e) => {
    e.stopPropagation();
    if (!audioRef.current) {
      audioRef.current = new Audio(url);
      audioRef.current.onended = () => setPlaying(false);
    }
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play().catch(() => {}); setPlaying(true); }
  };
  return (
    <button className="iconbtn" onClick={toggle} onPointerDown={(e) => e.stopPropagation()}
      style={{ color: "var(--ink)", fontWeight: 600 }}>
      {playing ? <Pause size={15} /> : <Play size={15} />} {playing ? "Pause preview" : "Play 30s preview"}
    </button>
  );
}

export default function Discover({ domain, profile, shelf, onAction, onExplore }) {
  const seen = useMemo(() => new Set(Object.keys(shelf)), [shelf]);
  const deck = useMemo(
    () => rankItems(domain.items, profile, domain, { excludeIds: [...seen] }),
    [domain, profile, seen]
  );
  const [drag, setDrag] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [animOut, setAnimOut] = useState(null);
  const startX = useRef(null);

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

  const onDown = (e) => { startX.current = e.clientX ?? e.touches?.[0]?.clientX; };
  const onMove = (e) => {
    if (startX.current == null) return;
    const x = e.clientX ?? e.touches?.[0]?.clientX;
    setDrag(x - startX.current);
  };
  const onUp = () => {
    if (startX.current == null) return;
    if (drag > 110) fling("right");
    else if (drag < -110) fling("left");
    else setDrag(0);
    startX.current = null;
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
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
        <div>
          <div className="eyebrow">Your deck</div>
          <div className="cat-no">{deck.length} {domain.nounPlural} queued · {profile.interactions} sorted</div>
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
          <div className="stamp want" style={{ opacity: clamp(drag / 110) }}>{domain.stamps.want}</div>
          <div className="stamp pass" style={{ opacity: clamp(-drag / 110) }}>{domain.stamps.pass}</div>

          <div style={{ height: 236, background: pal.bg, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", overflow: "hidden" }}>
            <Cover item={top.item} size="lg" />
            <ExtRating item={top.item} dark />
            <div className="match-pill">
              <div style={{ width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                background: "conic-gradient(var(--hl-deep) " + ringDegrees(top.score) + "deg, var(--line) 0)" }}>
                <div style={{ width: 23, height: 23, borderRadius: "50%", background: "var(--paper2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 500 }}>{displayScore(top.score)}</span>
                </div>
              </div>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: tag.c }}>{tag.t}</span>
            </div>
          </div>

          <div style={{ padding: "16px 18px", overflowY: "auto", flex: 1 }}>
            <div className="row" style={{ flexWrap: "wrap", gap: 6, marginBottom: 9 }}>
              {top.item.genres.map((g) => <span key={g} className="cat-no" style={{ border: "1px solid var(--line)", borderRadius: 999, padding: "2px 8px" }}>{g}</span>)}
            </div>
            <div className="h2" style={{ fontSize: 23 }}>{top.item.title}</div>
            <div className="cat-no" style={{ margin: "3px 0 12px" }}>
              {top.item.subtitle}{top.item.year ? ` · ${top.item.year}` : ""}{top.item.meta ? ` · ${top.item.meta}` : ""}
            </div>
            <p className="serif" style={{ fontSize: 15.5, lineHeight: 1.5, color: "var(--ink2)" }}>{top.item.blurb}</p>

            {domain.key === "music" && <div style={{ marginTop: 10 }}><PreviewButton key={top.item.id} url={top.item.links?.preview} /></div>}

            {expanded && (
              <div style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
                <div className="eyebrow" style={{ marginBottom: 10 }}>Why it surfaced</div>
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
