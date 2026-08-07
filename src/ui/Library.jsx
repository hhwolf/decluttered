import { useState, useMemo } from "react";
import { Heart, X, Check, Sliders, Library as LibraryIcon, Search, Swords } from "lucide-react";
import { Cover, Stars, MiniRate, ExtRating } from "./bits.jsx";
import Rank from "./Rank.jsx";

function ConsumedCard({ domain, item, onRate, onRemove, onOpen }) {
  const [open, setOpen] = useState(false);
  const it = item.item;
  const overall = item.rating || 0;
  const elements = item.elements || {};
  const ratedCount = domain.factors.filter((k) => elements[k] != null).length;
  return (
    <div className="item-row" style={{ alignItems: "flex-start" }}>
      <button className="coverbtn" onClick={() => onOpen(it)} aria-label={`Open details for ${it.title}`}>
        <Cover item={it} size="sm" />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <button className="linkbtn serif" onClick={() => onOpen(it)}
          style={{ fontWeight: 600, fontSize: 16, lineHeight: 1.1, textAlign: "left" }}>{it.title}</button>
        <div className="cat-no" style={{ margin: "2px 0 8px" }}>{it.subtitle} · <ExtRating item={it} /></div>

        <div className="row" style={{ gap: 9, marginBottom: 6 }}>
          <span className="cat-no" style={{ width: 52 }}>Overall</span>
          <Stars value={overall} size={18} label={`Overall rating for ${it.title}`}
            onChange={(n) => onRate(it, { overall: n || 0, elements })} />
        </div>

        {overall > 0 ? (
          <>
            <button className="iconbtn" onClick={() => setOpen((v) => !v)} style={{ marginTop: 2 }}
              aria-expanded={open}>
              <Sliders size={13} /> {open ? "Hide" : domain.craftPrompt}{ratedCount ? ` · ${ratedCount}/${domain.factors.length} rated` : ""}
            </button>
            {open && (
              <div style={{ marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 11 }}>
                {domain.factors.map((k) => (
                  <div key={k} className="row" style={{ justifyContent: "space-between", gap: 10 }}>
                    <span style={{ fontSize: 13 }}>{domain.factorLabels[k]}</span>
                    <MiniRate value={elements[k] || 0} label={domain.factorLabels[k]}
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

const SORTS = {
  added: { label: "Recently added", cmp: (a, b) => (b.addedAt || 0) - (a.addedAt || 0) },
  rating: { label: "Your rating", cmp: (a, b) => (b.rating || 0) - (a.rating || 0) },
  external: { label: "Critics' rating", cmp: (a, b) => (b.item.rating?.value || 0) / (b.item.rating?.scale || 5) - (a.item.rating?.value || 0) / (a.item.rating?.scale || 5) },
  title: { label: "Title A–Z", cmp: (a, b) => a.item.title.localeCompare(b.item.title) },
  year: { label: "Newest first", cmp: (a, b) => (b.item.year || 0) - (a.item.year || 0) },
};

export default function LibraryView({ domain, shelf, ranked = [], onRanked, onMove, onRemove, onRate, onOpen }) {
  const [tab, setTab] = useState("want");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("added");
  const [ranking, setRanking] = useState(false);

  const items = Object.entries(shelf)
    .map(([id, v]) => ({ item: domain.items.find((b) => b.id === id), ...v }))
    .filter((x) => x.item);
  const groups = {
    want: items.filter((i) => i.status === "want"),
    consumed: items.filter((i) => i.status === "consumed"),
    pass: items.filter((i) => i.status === "pass"),
  };

  const needle = q.trim().toLowerCase();
  const visible = useMemo(() => {
    const list = groups[tab].filter((i) => !needle ||
      i.item.title.toLowerCase().includes(needle) ||
      i.item.subtitle?.toLowerCase().includes(needle) ||
      (i.item.genres || []).some((g) => g.toLowerCase().includes(needle)));
    return [...list].sort(SORTS[sort].cmp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, needle, sort, shelf, domain]);

  // Ranking only makes sense over items the user has actually consumed.
  const rankable = groups.consumed.map((i) => i.item);
  if (ranking) {
    return (
      <Rank domain={domain} items={rankable} order={ranked.filter((id) => rankable.some((i) => i.id === id))}
        onOrder={onRanked} onExit={() => setRanking(false)} />
    );
  }

  return (
    <div>
      <div className="eyebrow">Your shelves</div>
      <h2 className="h1" style={{ fontSize: 26, margin: "6px 0 14px" }}>The library</h2>
      <div className="seg" style={{ marginBottom: 12 }}>
        {["want", "consumed", "pass"].map((k) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {domain.libraryTabs[k]} <span style={{ opacity: .6 }}>{groups[k].length}</span>
          </button>
        ))}
      </div>

      {items.length > 0 && (
        <>
          <div className="searchwrap" style={{ marginBottom: 8 }}>
            <Search size={14} />
            <input className="searchinput" placeholder={`Search your ${domain.nounPlural}…`} value={q}
              onChange={(e) => setQ(e.target.value)} aria-label={`Search your ${domain.nounPlural}`} />
            {q && <button className="iconbtn" onClick={() => setQ("")} aria-label="Clear search"><X size={14} /></button>}
          </div>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
            <select className="selectbox" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort by">
              {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            {tab === "consumed" && rankable.length >= 2 && (
              <button className="btn btn-ghost" style={{ padding: "8px 12px", flex: "none" }} onClick={() => setRanking(true)}>
                <Swords size={13} style={{ verticalAlign: "-2px" }} /> Rank
              </button>
            )}
          </div>
        </>
      )}

      {ranked.length > 1 && tab === "consumed" && !needle && (
        <p className="cat-no" style={{ marginBottom: 10 }}>
          Your #1 is <b style={{ color: "var(--ink)" }}>{domain.items.find((i) => i.id === ranked[0])?.title}</b> · {ranked.length} ranked head-to-head.
        </p>
      )}

      {groups[tab].length === 0 ? (
        <div className="empty">
          <LibraryIcon size={26} style={{ opacity: .5, marginBottom: 10 }} />
          <p className="sub">
            {tab === "want" ? `Nothing saved yet. Swipe right in your deck to shelve ${domain.nounPlural} here.` :
             tab === "consumed" ? `Mark ${domain.nounPlural} as "${domain.actions.consumed}" from your deck or move them here, then rate them.` :
             `${domain.nounPlural[0].toUpperCase() + domain.nounPlural.slice(1)} you pass land here. Nothing to see — that's a good thing.`}
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="empty"><p className="sub">Nothing matches “{q}”.</p></div>
      ) : (
        visible.map((i) => (
          tab === "consumed" ? (
            <ConsumedCard key={i.item.id} domain={domain} item={i} onRate={onRate} onRemove={onRemove} onOpen={onOpen} />
          ) : (
            <div className="item-row" key={i.item.id}>
              <button className="coverbtn" onClick={() => onOpen(i.item)} aria-label={`Open details for ${i.item.title}`}>
                <Cover item={i.item} size="sm" />
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <button className="linkbtn serif" onClick={() => onOpen(i.item)}
                  style={{ fontWeight: 600, fontSize: 16, lineHeight: 1.1, textAlign: "left" }}>{i.item.title}</button>
                <div className="cat-no" style={{ margin: "2px 0 7px" }}>
                  {i.item.subtitle}{i.item.dish ? <> · known for {i.item.dish.toLowerCase()}</> : null} · <ExtRating item={i.item} />
                </div>
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
