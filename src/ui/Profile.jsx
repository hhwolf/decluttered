import { RotateCcw, Sliders } from "lucide-react";
import { paletteFor } from "../domains.js";

export default function ProfileView({ domain, profile, shelf, onExplore, onReset }) {
  const topGenres = Object.entries(profile.genreWeights).filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]).slice(0, 6);
  const avoidG = Object.entries(profile.genreWeights).filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]).slice(0, 4);
  const maxW = Math.max(...topGenres.map(([, v]) => v), 1);
  const counts = Object.values(shelf).reduce((a, s) => (a[s.status] = (a[s.status] || 0) + 1, a), {});

  return (
    <div>
      <div className="eyebrow">Your taste, on the record</div>
      <h2 className="h1" style={{ fontSize: 26, margin: "6px 0 16px" }}>Profile · {domain.name}</h2>

      <div className="row" style={{ gap: 10, marginBottom: 16 }}>
        {["want", "consumed", "pass"].map((k) => (
          <div key={k} className="card" style={{ flex: 1, textAlign: "center", padding: "13px 4px" }}>
            <div className="h2" style={{ fontSize: 24 }}>{counts[k] || 0}</div>
            <div className="cat-no">{domain.libraryTabs[k]}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>{domain.genreLabel} you lean into</div>
        {topGenres.length === 0 ? <p className="sub">Keep swiping to develop your profile.</p> :
          topGenres.map(([g, v]) => (
            <div key={g} style={{ marginBottom: 10 }}>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13.5, fontWeight: 500 }}>{g}</span>
              </div>
              <div className="bar"><span style={{ width: (v / maxW) * 100 + "%", background: paletteFor(g).bg }} /></div>
            </div>
          ))}
        {avoidG.length > 0 && (
          <p className="cat-no" style={{ marginTop: 12 }}>Steering clear of: {avoidG.map(([g]) => g).join(", ")}</p>
        )}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>{domain.moodTitle}</div>
        {domain.tones.map((k) => (
          <div key={k} style={{ marginBottom: 10 }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 13.5, textTransform: "capitalize" }}>{k}</span>
              <span className="cat-no">{domain.toneLabels[k](profile.toneTarget[k])}</span>
            </div>
            <div className="bar"><span style={{ width: profile.toneTarget[k] * 100 + "%" }} /></div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <div className="eyebrow">{domain.weighTitle}</div>
          <span className="cat-no">{Object.keys(profile.ratings || {}).length} rated</span>
        </div>
        {domain.factors.map((k) => {
          const w = Math.max(0, Math.min(1, profile.factorWeights[k] ?? 0.5));
          const label = w < 0.34 ? "minor" : w < 0.67 ? "matters" : "essential";
          return (
            <div key={k} style={{ marginBottom: 10 }}>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13.5 }}>{domain.factorLabels[k]}</span>
                <span className="cat-no">{label}</span>
              </div>
              <div className="bar"><span style={{ width: w * 100 + "%", background: "var(--hl-deep)" }} /></div>
            </div>
          );
        })}
        <p className="cat-no" style={{ marginTop: 10, lineHeight: 1.45 }}>
          Rate the elements of {domain.nounPlural} you've {domain.actions.consumedShort.toLowerCase()} (in your library) to reshape these — they steer the "what you weigh" part of every match.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <div className="eyebrow"><Sliders size={12} style={{ verticalAlign: "-1px" }} /> Discovery dial</div>
          <span className="cat-no">{Math.round(profile.explore * 100)}% adventurous</span>
        </div>
        <input className="range" type="range" min="0" max="1" step="0.01" value={profile.explore}
          onChange={(e) => onExplore(parseFloat(e.target.value))} />
        <div className="row" style={{ justifyContent: "space-between", marginTop: 7 }}>
          <span className="cat-no">Stay aligned</span><span className="cat-no">Expand my taste</span>
        </div>
      </div>

      <p className="cat-no" style={{ textAlign: "center", marginBottom: 10 }}>{profile.interactions} {domain.nounPlural} sorted · taste updated live</p>
      <button className="btn btn-ghost btn-block" onClick={onReset}><RotateCcw size={14} style={{ verticalAlign: "-2px" }} /> Start {domain.name} over</button>
    </div>
  );
}
