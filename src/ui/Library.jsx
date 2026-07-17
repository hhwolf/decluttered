import { useState } from "react";
import { Heart, X, Check, Sliders, Library as LibraryIcon } from "lucide-react";
import { Cover, Stars, MiniRate, ExtRating } from "./bits.jsx";

function ConsumedCard({ domain, item, onRate, onRemove }) {
  const [open, setOpen] = useState(false);
  const it = item.item;
  const overall = item.rating || 0;
  const elements = item.elements || {};
  const ratedCount = domain.factors.filter((k) => elements[k] != null).length;
  return (
    <div className="item-row" style={{ alignItems: "flex-start" }}>
      <Cover item={it} size="sm" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="serif" style={{ fontWeight: 600, fontSize: 16, lineHeight: 1.1 }}>{it.title}</div>
        <div className="cat-no" style={{ margin: "2px 0 8px" }}>{it.subtitle} · <ExtRating item={it} /></div>

        <div className="row" style={{ gap: 9, marginBottom: 6 }}>
          <span className="cat-no" style={{ width: 52 }}>Overall</span>
          <Stars value={overall} size={18} onChange={(n) => onRate(it, { overall: n || 0, elements })} />
        </div>

        {overall > 0 ? (
          <>
            <button className="iconbtn" onClick={() => setOpen((v) => !v)} style={{ marginTop: 2 }}>
              <Sliders size={13} /> {open ? "Hide" : domain.craftPrompt}{ratedCount ? ` · ${ratedCount}/${domain.factors.length} rated` : ""}
            </button>
            {open && (
              <div style={{ marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 11 }}>
                {domain.factors.map((k) => (
                  <div key={k} className="row" style={{ justifyContent: "space-between", gap: 10 }}>
                    <span style={{ fontSize: 13 }}>{domain.factorLabels[k]}</span>
                    <MiniRate value={elements[k] || 0}
                      onChange={(n) => onRate(it, { overall, elements: { ...elements, [k]: n || undefined } })} />
                  </div>
                ))}
                <p className="cat-no" style={{ marginTop: 1, lineHeight: 1.45 }}>
                  Scoring the elements teaches the engine which ones matter to you — strong elements in {domain.nounPlural} you
                  loved gain weight, and your scores reshape what counts as "{domain.nounPlural} like this." It feeds your deck directly.
                </p>
              </div>
            )}
          </>
        ) : (
          <span className="cat-no">Give it an overall rating to unlock element ratings.</span>
        )}

        <div style={{ marginTop: 9 }}>
          <button className="iconbtn" onClick={() => onRemove(it.id)}><X size={14} /> Remove</button>
        </div>
      </div>
    </div>
  );
}

export default function LibraryView({ domain, shelf, onMove, onRemove, onRate }) {
  const [tab, setTab] = useState("want");
  const items = Object.entries(shelf)
    .map(([id, v]) => ({ item: domain.items.find((b) => b.id === id), ...v }))
    .filter((x) => x.item);
  const groups = {
    want: items.filter((i) => i.status === "want"),
    consumed: items.filter((i) => i.status === "consumed"),
    pass: items.filter((i) => i.status === "pass"),
  };

  return (
    <div>
      <div className="eyebrow">Your shelves</div>
      <h2 className="h1" style={{ fontSize: 26, margin: "6px 0 14px" }}>The library</h2>
      <div className="seg" style={{ marginBottom: 16 }}>
        {["want", "consumed", "pass"].map((k) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {domain.libraryTabs[k]} <span style={{ opacity: .6 }}>{groups[k].length}</span>
          </button>
        ))}
      </div>

      {groups[tab].length === 0 ? (
        <div className="empty">
          <LibraryIcon size={26} style={{ opacity: .5, marginBottom: 10 }} />
          <p className="sub">
            {tab === "want" ? `Nothing saved yet. Swipe right in your deck to shelve ${domain.nounPlural} here.` :
             tab === "consumed" ? `Mark ${domain.nounPlural} as "${domain.actions.consumed}" from your deck or move them here, then rate them.` :
             `${domain.nounPlural[0].toUpperCase() + domain.nounPlural.slice(1)} you pass land here. Nothing to see — that's a good thing.`}
          </p>
        </div>
      ) : (
        groups[tab].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)).map((i) => (
          tab === "consumed" ? (
            <ConsumedCard key={i.item.id} domain={domain} item={i} onRate={onRate} onRemove={onRemove} />
          ) : (
            <div className="item-row" key={i.item.id}>
              <Cover item={i.item} size="sm" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="serif" style={{ fontWeight: 600, fontSize: 16, lineHeight: 1.1 }}>{i.item.title}</div>
                <div className="cat-no" style={{ margin: "2px 0 7px" }}>{i.item.subtitle} · <ExtRating item={i.item} /></div>
                <div className="row" style={{ gap: 8 }}>
                  {tab === "pass"
                    ? <button className="iconbtn" onClick={() => onMove(i.item.id, "want")} style={{ color: "var(--hl-deep)" }}><Heart size={14} /> {domain.actions.want}</button>
                    : <button className="iconbtn" onClick={() => onMove(i.item.id, "consumed")} style={{ color: "var(--slate)" }}><Check size={14} /> {domain.actions.consumed}</button>}
                  <button className="iconbtn" onClick={() => onRemove(i.item.id)}><X size={14} /> Remove</button>
                </div>
              </div>
            </div>
          )
        ))
      )}
    </div>
  );
}
