import { useState, useMemo } from "react";
import { Swords, Trophy, ArrowLeft } from "lucide-react";
import { Cover, ExtRating } from "./bits.jsx";
import { nextComparison, applyComparison, insertAt } from "../engine/stats.mjs";

/**
 * Head-to-head ranking. Absolute star ratings compress (everything is a 4);
 * forced pairwise choices don't. Each new item is placed by binary search
 * against the existing order, so ranking the Nth item costs ~log2(N)
 * questions, not N.
 */
export default function Rank({ domain, items, order, onOrder, onExit }) {
  // candidates = library items not yet placed in the ranked order
  const unranked = useMemo(() => items.filter((it) => !order.includes(it.id)), [items, order]);
  const [subject, setSubject] = useState(() => unranked[0] || null);
  const [win, setWin] = useState(() => ({ lo: 0, hi: order.length }));

  const byId = (id) => items.find((i) => i.id === id) || domain.items.find((i) => i.id === id);
  const ranked = order.map(byId).filter(Boolean);

  const startNext = (nextOrder) => {
    const remaining = items.filter((it) => !nextOrder.includes(it.id));
    setSubject(remaining[0] || null);
    setWin({ lo: 0, hi: nextOrder.length });
  };

  const place = (index, nextSubject = subject) => {
    const nextOrder = insertAt(order, nextSubject.id, index);
    onOrder(nextOrder);
    startNext(nextOrder);
  };

  const choose = (preferSubject) => {
    const pivotIndex = Math.floor((win.lo + win.hi) / 2);
    const next = applyComparison(win.lo, win.hi, pivotIndex, preferSubject);
    if (next.lo >= next.hi) place(next.lo);
    else setWin(next);
  };

  const pivotId = subject ? nextComparison(order, win.lo, win.hi) : null;
  const pivot = pivotId ? byId(pivotId) : null;

  // First item in an empty list needs no comparison at all.
  if (subject && order.length === 0) {
    return (
      <RankShell domain={domain} ranked={ranked} onExit={onExit}>
        <div className="card" style={{ textAlign: "center" }}>
          <p className="sub" style={{ marginTop: 0 }}>
            Start your ranking with <b>{subject.title}</b>. Everything else gets compared against it.
          </p>
          <button className="btn btn-hl btn-block" onClick={() => place(0)}>Start the ranking</button>
        </div>
      </RankShell>
    );
  }

  if (!subject || !pivot) {
    return (
      <RankShell domain={domain} ranked={ranked} onExit={onExit}>
        <div className="card" style={{ textAlign: "center" }}>
          <Trophy size={22} style={{ color: "var(--hl-deep)", marginBottom: 8 }} />
          <p className="sub" style={{ margin: "0 0 4px" }}>
            {ranked.length < 2
              ? `Rate a few more ${domain.nounPlural} as “${domain.actions.consumedShort}” to rank them head-to-head.`
              : "Everything in your library is ranked. Add more and come back."}
          </p>
        </div>
      </RankShell>
    );
  }

  return (
    <RankShell domain={domain} ranked={ranked} onExit={onExit}>
      <p className="cat-no" style={{ textAlign: "center", marginBottom: 10 }}>
        {unranked.length} left to place · {Math.max(1, Math.ceil(Math.log2(order.length + 1)))} question{Math.ceil(Math.log2(order.length + 1)) === 1 ? "" : "s"} each
      </p>
      <div className="h2" style={{ fontSize: 19, textAlign: "center", margin: "0 0 14px" }}>Which do you rate higher?</div>
      <div className="row" style={{ alignItems: "stretch", gap: 10 }}>
        {[{ it: subject, pick: true }, { it: pivot, pick: false }].map(({ it, pick }) => (
          <button key={it.id} className="card" onClick={() => choose(pick)}
            style={{ flex: 1, cursor: "pointer", textAlign: "center", padding: "12px 9px", display: "flex",
              flexDirection: "column", alignItems: "center", gap: 8 }}>
            <Cover item={it} size="md" />
            <div>
              <div className="serif" style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.2 }}>{it.title}</div>
              <div className="cat-no" style={{ marginTop: 2 }}>{it.subtitle}</div>
              <div style={{ marginTop: 4 }}><ExtRating item={it} /></div>
            </div>
          </button>
        ))}
      </div>
      <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }}
        onClick={() => place(Math.floor((win.lo + win.hi) / 2) + 1)}>
        Too close to call
      </button>
    </RankShell>
  );
}

function RankShell({ domain, ranked, onExit, children }) {
  return (
    <div>
      <button className="iconbtn" onClick={onExit} style={{ marginBottom: 10 }}>
        <ArrowLeft size={15} /> Back to library
      </button>
      <div className="eyebrow"><Swords size={12} style={{ verticalAlign: "-1px" }} /> Head to head</div>
      <h2 className="h1" style={{ fontSize: 26, margin: "6px 0 4px" }}>Rank your {domain.nounPlural}</h2>
      <p className="sub" style={{ margin: "0 0 16px" }}>
        Stars bunch up — forced choices don't. A few taps builds your true top list.
      </p>
      {children}
      {ranked.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Your ranking</div>
          {ranked.map((it, i) => (
            <div className="item-row" key={it.id}>
              <div className="h2" style={{ fontSize: 18, width: 26, flex: "none", textAlign: "right" }}>{i + 1}</div>
              <Cover item={it} size="sm" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="serif" style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.15 }}>{it.title}</div>
                <div className="cat-no">{it.subtitle}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
