import { Heart, X, Check, ExternalLink, Play, Pause } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { scoreItem } from "../engine/engine.mjs";
import { paletteFor } from "../domains.js";
import { Sheet, Cover, ExtRating, Stars, MiniRate, displayScore, matchTag } from "./bits.jsx";
import { fetchTrackPreview } from "./preview.js";

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
 * Full item detail. Reachable from every surface that shows a cover, so a tap
 * on artwork is never a dead end. Shows the complete blurb (the deck card
 * truncates it), the score breakdown, craft axes, and the same actions the
 * deck offers — plus rating controls once the item is in the library.
 */
export default function ItemSheet({ domain, item, profile, shelfEntry, onAction, onRate, onClose }) {
  const s = profile ? scoreItem(item, profile, domain) : null;
  const tag = s ? matchTag(s.score) : null;
  const pal = paletteFor(item.genres?.[0]);
  const status = shelfEntry?.status;
  const elements = shelfEntry?.elements || {};
  const overall = shelfEntry?.rating || 0;
  const titleId = "sheet-title-" + item.id;

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
            {item.year && String(item.year) !== item.subtitle ? ` · ${item.year}` : ""}
            {item.meta ? ` · ${item.meta}` : ""}
          </div>
          <div style={{ marginTop: 6 }}><ExtRating item={item} /></div>
          {item.dish && <div className="cat-no" style={{ marginTop: 5 }}>Known for · {item.dish}</div>}
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
          {[[`${domain.genreLabel.replace(/s$/, "")} fit`, s.breakdown.genre], ["Matches what you weigh", s.breakdown.factor],
            ["Mood match", s.breakdown.tone], [`Like ${domain.nounPlural} you loved`, s.breakdown.similar]].map(([label, v]) => (
            <div key={label} style={{ marginBottom: 8 }}>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ fontSize: 12.5 }}>{label}</span><span className="cat-no">{v}</span>
              </div>
              <div className="bar"><span style={{ width: v + "%" }} /></div>
            </div>
          ))}
        </div>
      )}

      <p className="serif" style={{ fontSize: 15.5, lineHeight: 1.5, color: "var(--ink2)", margin: "14px 0 0" }}>{item.blurb}</p>
      {item.dish && (
        <p className="cat-no" style={{ marginTop: 8 }}>
          Dish photo is illustrative, via Wikipedia — not {item.title}'s own plate.
        </p>
      )}

      {domain.key === "music" && <div style={{ marginTop: 12 }}><SheetPreview item={item} /></div>}

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

      {links.length > 0 && (
        <p className="cat-no" style={{ marginTop: 14 }}>
          {links.map(([k, v], i) => (
            <span key={k}>
              {i > 0 && " · "}
              <a href={v} target="_blank" rel="noreferrer" style={{ color: "var(--slate)" }}>
                {LINK_LABELS[k]} <ExternalLink size={10} style={{ verticalAlign: "-1px" }} />
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
