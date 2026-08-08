import { useState, useRef } from "react";
import { Flame, Share2, Award, Check, Upload } from "lucide-react";
import { computeStreak, recentDays, milestoneProgress, tasteReview, DAILY_GOAL, dayKey } from "../engine/stats.mjs";
import { parseExport, matchToCatalogue, toShelfEntries } from "../engine/importer.mjs";
import { paletteFor } from "../domains.js";

/* ---- daily ritual: streak, today's progress, last 7 days ------------------ */
export function StreakCard({ domain, activity }) {
  const today = dayKey(Date.now());
  const s = computeStreak(activity, today);
  const days = recentDays(activity, today);
  const pct = Math.min(100, Math.round((s.today / DAILY_GOAL) * 100));
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <div className="eyebrow"><Flame size={12} style={{ verticalAlign: "-1px" }} /> Daily streak</div>
        <span className="cat-no">best {s.longest}</span>
      </div>
      <div className="row" style={{ gap: 12, marginBottom: 12 }}>
        <div className="h1" style={{ fontSize: 34, lineHeight: 1 }}>{s.current}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>
            {s.current === 0 ? "Start a streak today" : `${s.current} day${s.current === 1 ? "" : "s"} in a row`}
          </div>
          <div className="cat-no" style={{ marginTop: 2, lineHeight: 1.4 }}>
            {s.atRisk
              ? `Sort one ${domain.noun} today to keep it alive.`
              : s.today >= DAILY_GOAL
                ? `Today's ${DAILY_GOAL} done. Anything more is bonus.`
                : `${s.today}/${DAILY_GOAL} sorted today.`}
          </div>
        </div>
      </div>
      <div className="progress" style={{ margin: "0 0 12px" }}><span style={{ width: pct + "%" }} /></div>
      <div className="dots">
        {days.map((d) => (
          <i key={d.key} className={(d.count > 0 ? "on" : "") + (d.isToday ? " today" : "")}
            title={`${d.key}: ${d.count} sorted`} />
        ))}
      </div>
      <p className="cat-no" style={{ marginTop: 8 }}>Last 7 days · a filled block is a day you sorted something.</p>
    </div>
  );
}

/* ---- milestones ----------------------------------------------------------- */
export function MilestoneCard({ domain, total }) {
  const m = milestoneProgress(total);
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <div className="eyebrow"><Award size={12} style={{ verticalAlign: "-1px" }} /> Milestones</div>
        <span className="cat-no">{total} sorted</span>
      </div>
      {m.earned && (
        <div className="row" style={{ gap: 7, marginBottom: 8 }}>
          <Check size={14} color="var(--hl-deep)" strokeWidth={3} />
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>{m.earned.label}</span>
          <span className="cat-no">at {m.earned.at}</span>
        </div>
      )}
      {m.next ? (
        <>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 13 }}>Next · {m.next.label}</span>
            <span className="cat-no">{total}/{m.next.at}</span>
          </div>
          <div className="bar"><span style={{ width: m.pct + "%", background: "var(--hl-deep)" }} /></div>
        </>
      ) : (
        <p className="sub" style={{ margin: 0 }}>Every milestone cleared. You have sorted more {domain.nounPlural} than anyone should admit to.</p>
      )}
    </div>
  );
}

/* ---- import an existing library from a CSV export ------------------------- */
export function ImportCard({ domain, onImport }) {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  const SOURCE = { books: "Goodreads", movies: "Letterboxd or IMDb", tv: "IMDb", music: "any CSV", restaurants: "any CSV" }[domain.key];

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setResult(null);
    try {
      const text = await file.text();
      const rows = parseExport(text);
      if (rows.length === 0) {
        setResult({ error: "No title column found. Export as CSV from your account's data-export page." });
        return;
      }
      const { matched, unmatched } = matchToCatalogue(rows, domain.items);
      if (matched.length === 0) {
        setResult({ error: `Read ${rows.length} rows but none are in our ${domain.items.length}-item catalogue yet.` });
        return;
      }
      onImport(toShelfEntries(matched));
      setResult({ rows: rows.length, matched: matched.length, unmatched: unmatched.length,
        sample: matched.slice(0, 3).map((m) => m.item.title) });
    } catch {
      setResult({ error: "Couldn't read that file." });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = ""; // allow re-importing the same file
    }
  };

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        <Upload size={12} style={{ verticalAlign: "-1px" }} /> Import your history
      </div>
      <p className="sub" style={{ margin: "0 0 12px" }}>
        Already track {domain.nounPlural} elsewhere? Drop in a {SOURCE} CSV export — we match it against the
        catalogue, shelf what we find, and keep your ratings so the engine starts warm.
      </p>
      <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: "none" }}
        id={"imp-" + domain.key} />
      <label className="btn btn-ghost btn-block" htmlFor={"imp-" + domain.key} style={{ cursor: "pointer", display: "block", textAlign: "center" }}>
        {busy ? "Reading…" : "Choose a CSV file"}
      </label>
      {result?.error && <p className="cat-no" style={{ color: "var(--stamp)", marginTop: 10 }}>{result.error}</p>}
      {result && !result.error && (
        <p className="cat-no" style={{ marginTop: 10, lineHeight: 1.5 }}>
          Imported <b style={{ color: "var(--ink)" }}>{result.matched}</b> of {result.rows} rows
          {result.unmatched > 0 ? ` (${result.unmatched} not in the catalogue)` : ""} — {result.sample.join(", ")}
          {result.matched > 3 ? "…" : ""}. Rate them in your library to sharpen the engine.
        </p>
      )}
    </div>
  );
}

/* ---- everything, across all five domains ---------------------------------- */
export function AllDomains({ states, domains, domainKeys, active, onSwitch }) {
  const rows = domainKeys.map((k) => {
    const st = states[k];
    const shelf = st?.shelf || {};
    return {
      key: k, name: domains[k].name, noun: domains[k].nounPlural,
      onboarded: !!st?.onboarded,
      sorted: st?.profile?.interactions || 0,
      saved: Object.values(shelf).filter((s) => s.status === "want").length,
      streak: computeStreak(st?.activity || {}).current,
    };
  });
  const total = rows.reduce((a, r) => a + r.sorted, 0);
  const started = rows.filter((r) => r.onboarded).length;

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <div className="eyebrow">All five cravings</div>
        <span className="cat-no">{total} sorted · {started}/{domainKeys.length} started</span>
      </div>
      {rows.map((r) => (
        <button key={r.key} className="domrow" onClick={() => onSwitch(r.key)}
          aria-label={`Switch to ${r.name}`}>
          <span style={{ fontSize: 13.5, fontWeight: r.key === active ? 700 : 500, flex: 1, textAlign: "left" }}>
            {r.name}{r.key === active ? " · here" : ""}
          </span>
          {r.onboarded ? (
            <span className="cat-no">
              {r.sorted} sorted{r.saved ? ` · ${r.saved} saved` : ""}{r.streak > 1 ? ` · ${r.streak}d` : ""}
            </span>
          ) : (
            <span className="cat-no">not started →</span>
          )}
        </button>
      ))}
      <p className="cat-no" style={{ marginTop: 10, lineHeight: 1.45 }}>
        Each craving keeps its own profile, streak and library — one engine, five separate tastes.
      </p>
    </div>
  );
}

/* ---- taste in review: the reflection surface ------------------------------ */
export function TasteReview({ domain, shelf, profile }) {
  const r = tasteReview(domain, shelf, profile);
  const [shared, setShared] = useState(null);

  if (r.total === 0) {
    return (
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Your {domain.name} in review</div>
        <p className="sub" style={{ margin: 0 }}>
          Sort a few {domain.nounPlural} and this fills in: your genres, your average rating, what you're toughest on.
        </p>
      </div>
    );
  }

  const lines = [
    ["Sorted", `${r.total} ${domain.nounPlural}`],
    [domain.libraryTabs.want, `${r.want}`],
    [domain.libraryTabs.consumed, `${r.consumed}`],
    r.avgRating != null && ["Your average", `${r.avgRating.toFixed(1)} ★ over ${r.ratedCount} rated`],
    r.fiveStars > 0 && ["Five-star picks", `${r.fiveStars}`],
    r.topGenres.length > 0 && [`Top ${domain.genreLabel.toLowerCase()}`, r.topGenres.map(([g]) => g).slice(0, 3).join(", ")],
    r.bestGenre && ["Rates highest", `${r.bestGenre[0]} · ${r.bestGenre[1].toFixed(1)} ★ avg`],
    r.topDecade && ["Favourite era", `${r.topDecade.decade}s (${r.topDecade.count})`],
    r.toughestOn && ["Toughest on", domain.factorLabels[r.toughestOn[0]]],
    r.softestOn && r.softestOn[0] !== r.toughestOn?.[0] && ["Most generous on", domain.factorLabels[r.softestOn[0]]],
    r.pickiness != null && ["Pass rate", `${Math.round(r.pickiness * 100)}%`],
  ].filter(Boolean);

  // Share: copy a plain-text taste card. Clipboard needs a user gesture and can
  // be blocked, so fall back to a visible textarea the user can copy manually.
  const shareText = [
    `My ${domain.name} taste on Decluttered`,
    r.topGenres.length ? `· ${domain.genreLabel}: ${r.topGenres.map(([g]) => g).slice(0, 3).join(", ")}` : null,
    r.avgRating != null ? `· Average rating: ${r.avgRating.toFixed(1)}★ over ${r.ratedCount}` : null,
    r.bestGenre ? `· Rates highest: ${r.bestGenre[0]}` : null,
    r.topDecade ? `· Favourite era: ${r.topDecade.decade}s` : null,
    `· ${r.total} ${domain.nounPlural} sorted, ${Math.round((r.pickiness || 0) * 100)}% passed`,
  ].filter(Boolean).join("\n");

  const share = async () => {
    try {
      if (navigator.share) { await navigator.share({ text: shareText }); setShared("shared"); return; }
      await navigator.clipboard.writeText(shareText);
      setShared("copied");
    } catch { setShared("manual"); }
  };

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <div className="eyebrow">Your {domain.name} in review</div>
        <button className="iconbtn" onClick={share} style={{ color: "var(--ink)" }}>
          <Share2 size={14} /> Share
        </button>
      </div>

      <div className="sharecard" style={{ marginBottom: 12 }}>
        <div className="sc-k" style={{ marginBottom: 6 }}>Decluttered · {domain.catalogueNo}</div>
        <div className="sc-v">
          {r.topGenres.length > 0
            ? r.topGenres.map(([g]) => g).slice(0, 3).join(" · ")
            : `${r.total} ${domain.nounPlural} sorted`}
        </div>
        <div className="row" style={{ gap: 16, marginTop: 12, flexWrap: "wrap" }}>
          <div>
            <div className="sc-k">Sorted</div>
            <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 16 }}>{r.total}</div>
          </div>
          {r.avgRating != null && (
            <div>
              <div className="sc-k">Average</div>
              <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 16 }}>{r.avgRating.toFixed(1)}★</div>
            </div>
          )}
          <div>
            <div className="sc-k">Pass rate</div>
            <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 16 }}>{Math.round((r.pickiness || 0) * 100)}%</div>
          </div>
        </div>
      </div>

      {shared === "copied" && <p className="cat-no" style={{ marginBottom: 10 }}>Copied to your clipboard.</p>}
      {shared === "manual" && (
        <textarea className="input" rows={4} readOnly value={shareText} style={{ marginBottom: 10 }}
          onFocus={(e) => e.target.select()} />
      )}

      {r.topGenres.length > 0 && (
        <div className="row" style={{ gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
          {r.topGenres.map(([g, n]) => (
            <span key={g} className="cat-no" style={{ background: paletteFor(g).bg, color: paletteFor(g).fg,
              borderRadius: 999, padding: "3px 9px" }}>{g} {n}</span>
          ))}
        </div>
      )}

      {lines.map(([k, v]) => (
        <div key={k} className="row" style={{ justifyContent: "space-between", padding: "6px 0",
          borderBottom: "1px solid var(--line)" }}>
          <span className="cat-no">{k}</span>
          <span style={{ fontSize: 13.5, fontWeight: 500, textAlign: "right" }}>{v}</span>
        </div>
      ))}
    </div>
  );
}
