import { useState } from "react";
import { RotateCcw, Sliders, Target, MapPin, Info } from "lucide-react";
import { paletteFor } from "../domains.js";
import { GOAL_KEYS } from "../engine/suggest.mjs";
import { allCities, countForCities } from "../engine/location.mjs";
import { Chip } from "./bits.jsx";
import { StreakCard, MilestoneCard, TasteReview, AllDomains, ImportCard } from "./Stats.jsx";
import { DOMAINS, DOMAIN_KEYS } from "../domains.js";

export default function ProfileView({ domain, profile, shelf, activity, states, onSwitchDomain, onImport, onExplore, onGoals, onCities, onReset, onAbout }) {
  const [confirmReset, setConfirmReset] = useState(false);
  const goals = profile.goals || [];
  const cities = profile.cities || [];
  const cityOptions = domain.hasLocation ? allCities(domain.items) : [];
  // A location is required, so the last one can't be turned off.
  const toggleCity = (c) => {
    if (cities.includes(c)) { if (cities.length > 1) onCities(cities.filter((x) => x !== c)); }
    else onCities([...cities, c]);
  };
  const toggleGoal = (g) => {
    if (goals.includes(g)) onGoals(goals.filter((x) => x !== g));
    else if (goals.length < 3) onGoals([...goals, g]);
  };
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

      <StreakCard domain={domain} activity={activity} />
      <MilestoneCard domain={domain} total={profile.interactions || 0} />
      <TasteReview domain={domain} shelf={shelf} profile={profile} />
      {onImport && <ImportCard domain={domain} onImport={onImport} />}
      {states && (
        <AllDomains states={states} domains={DOMAINS} domainKeys={DOMAIN_KEYS}
          active={domain.key} onSwitch={onSwitchDomain} />
      )}

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

      {domain.hasLocation && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <div className="eyebrow"><MapPin size={12} style={{ verticalAlign: "-1px" }} /> Where you eat</div>
            <span className="cat-no">
              {cities.length === 0 ? "none picked" : `${countForCities(domain.items, cities)} in range`}
            </span>
          </div>
          <div className="chips">
            {cityOptions.filter((c) => c.focus || cities.includes(c.city)).map((c) => (
              <Chip key={c.city} on={cities.includes(c.city)} onClick={() => toggleCity(c.city)}>
                {c.city} <span style={{ opacity: .55 }}>{c.count}</span>
              </Chip>
            ))}
          </div>
          <details style={{ marginTop: 10 }}>
            <summary className="cat-no" style={{ cursor: "pointer" }}>Add another city</summary>
            <div className="chips" style={{ marginTop: 8 }}>
              {cityOptions.filter((c) => !c.focus && !cities.includes(c.city)).map((c) => (
                <Chip key={c.city} on={false} onClick={() => toggleCity(c.city)}>
                  {c.city} <span style={{ opacity: .55 }}>{c.count}</span>
                </Chip>
              ))}
            </div>
          </details>
          <p className="cat-no" style={{ marginTop: 10, lineHeight: 1.45 }}>
            {cities.length === 0
              ? "Pick a city to keep your deck to places you can actually get to."
              : cities.length === 1
                ? "Your deck and suggestions stay here. Add a second city to widen it; the last one can't be removed."
                : "Your deck and suggestions stay in these cities. Places you saved elsewhere remain in your library."}
          </p>
        </div>
      )}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <div className="eyebrow"><Target size={12} style={{ verticalAlign: "-1px" }} /> Your goals</div>
          <span className="cat-no">{goals.length}/3 · each gets a For-you row</span>
        </div>
        <div className="chips">
          {GOAL_KEYS.map((g) => (
            <Chip key={g} on={goals.includes(g)} onClick={() => toggleGoal(g)}>{domain.goalLabels[g].chip}</Chip>
          ))}
        </div>
        <p className="cat-no" style={{ marginTop: 10, lineHeight: 1.45 }}>
          Goals are promises we keep even when they cut against your pattern — each one becomes its own labeled suggestion row.
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

      {onAbout && (
        <button className="btn btn-ghost btn-block" style={{ marginBottom: 14 }} onClick={onAbout}>
          <Info size={14} style={{ verticalAlign: "-2px" }} /> What is Decluttered?
        </button>
      )}

      <p className="cat-no" style={{ textAlign: "center", marginBottom: 10 }}>{profile.interactions} {domain.nounPlural} sorted · taste updated live</p>
      {confirmReset ? (
        <div className="card" style={{ borderColor: "var(--stamp)" }}>
          <p className="sub" style={{ margin: "0 0 12px" }}>
            This erases your {domain.name} profile, all {Object.keys(shelf).length} shelved {domain.nounPlural}, your ratings, and your streak. It can't be undone.
          </p>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setConfirmReset(false)}>Keep my data</button>
            <button className="btn btn-primary" style={{ flex: 1, background: "var(--stamp)", borderColor: "var(--stamp)" }}
              onClick={() => { setConfirmReset(false); onReset(); }}>Erase {domain.name}</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-ghost btn-block" onClick={() => setConfirmReset(true)}>
          <RotateCcw size={14} style={{ verticalAlign: "-2px" }} /> Start {domain.name} over
        </button>
      )}
    </div>
  );
}
