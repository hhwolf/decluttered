import { useMemo, useState } from "react";
import { Heart, X, Compass, Fingerprint, Star, Gem, CloudMoon, Telescope, Target } from "lucide-react";
import { buildSuggestionRows } from "../engine/suggest.mjs";
import { scoreItem } from "../engine/engine.mjs";
import { Cover, ExtRating, displayScore, matchTag } from "./bits.jsx";

const MECHANISM_ICON = {
  pattern: Fingerprint, priority: Star, consensus: Compass,
  gems: Gem, mood: CloudMoon, stretch: Telescope, goal: Target,
};
const MECHANISM_LABEL = {
  pattern: "taste match", priority: "your priorities", consensus: "crowd acclaim",
  gems: "hidden gems", mood: "mood", stretch: "anti-pattern", goal: "your goal",
};

function SugCard({ domain, item, profile, onAction, onOpen }) {
  const [gone, setGone] = useState(null); // 'want' | 'pass' during exit anim
  const s = scoreItem(item, profile, domain);
  const tag = matchTag(s.score);
  const act = (a) => { setGone(a); setTimeout(() => onAction(item, a), 160); };
  return (
    <div className="sugcard" style={{ opacity: gone ? 0 : 1, transform: gone === "want" ? "translateY(-8px)" : gone === "pass" ? "translateY(8px)" : "none" }}>
      <button className="coverbtn" onClick={() => onOpen(item)} aria-label={`Open details for ${item.title}`}>
        <Cover item={item} size="md" />
      </button>
      <div className="sugmeta">
        <span className="cat-no" style={{ fontWeight: 600, color: tag.c }} title={`${displayScore(s.score)}% taste match`}>{displayScore(s.score)}% · {tag.t.replace(/ match$/, "")}</span>
        <button className="linkbtn sugtitle" onClick={() => onOpen(item)} style={{ textAlign: "left" }}>{item.title}</button>
        <div className="cat-no" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          title={item.dish ? `${item.subtitle} — known for ${item.dish}` : item.subtitle}>
          {item.subtitle}{item.dish ? ` · ${item.dish}` : ""}
        </div>
        <div style={{ marginTop: 3, overflow: "hidden", whiteSpace: "nowrap" }}><ExtRating item={item} compact /></div>
      </div>
      <div className="sugacts">
        <button className="iconbtn" title={domain.actions.pass} onClick={() => act("pass")}><X size={15} /></button>
        <button className="iconbtn" title={domain.actions.want} onClick={() => act("want")} style={{ color: "var(--hl-deep)" }}>
          <Heart size={15} fill="currentColor" />
        </button>
      </div>
    </div>
  );
}

export default function ForYou({ domain, profile, shelf, onAction, onOpen }) {
  const rows = useMemo(
    () => buildSuggestionRows(domain.items, profile, domain, { excludeIds: Object.keys(shelf), perRow: 6 }),
    [domain, profile, shelf]
  );

  return (
    <div>
      <div className="eyebrow">Suggested, with reasons</div>
      <h2 className="h1" style={{ fontSize: 26, margin: "6px 0 4px" }}>For you</h2>
      <p className="sub" style={{ margin: "0 0 8px" }}>
        Seven different mechanisms, not one algorithm — every row says why it exists. Hearts and passes here train your profile like the deck does.
      </p>
      {rows.map((row) => {
        const Icon = MECHANISM_ICON[row.mechanism] || Compass;
        return (
          <div key={row.key} style={{ margin: "18px 0 0" }}>
            <div className="row" style={{ gap: 7, marginBottom: 2 }}>
              <Icon size={14} style={{ color: "var(--hl-deep)", flex: "none" }} />
              <span className="h2" style={{ fontSize: 17 }}>{row.title}</span>
              <span className="cat-no" style={{ marginLeft: "auto", flex: "none" }}>{MECHANISM_LABEL[row.mechanism]}</span>
            </div>
            <p className="cat-no" style={{ margin: "2px 0 9px", lineHeight: 1.45 }}>{row.reason}</p>
            <div className="shelfrow">
              {row.items.map((it) => (
                <SugCard key={it.id} domain={domain} item={it} profile={profile} onAction={onAction} onOpen={onOpen} />
              ))}
            </div>
          </div>
        );
      })}
      {rows.length === 0 && (
        <div className="empty"><p className="sub">You've sorted the whole catalogue — nothing left to suggest.</p></div>
      )}
    </div>
  );
}
