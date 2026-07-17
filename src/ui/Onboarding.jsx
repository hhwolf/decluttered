import { useState, useMemo } from "react";
import { ChevronRight, ChevronLeft, Sparkles } from "lucide-react";
import { buildInitialProfile } from "../engine/engine.mjs";
import { allGenres } from "../domains.js";
import { ItemPicker, toggleSel } from "./bits.jsx";

export default function Onboarding({ domain, onDone }) {
  const [step, setStep] = useState(0);
  const [genres, setGenres] = useState([]);
  const [avoidGenres, setAvoidGenres] = useState([]);
  const [favIds, setFavIds] = useState([]);
  const [surpriseIds, setSurpriseIds] = useState([]);
  const [avoidIds, setAvoidIds] = useState([]);
  const [weights, setWeights] = useState(Object.fromEntries(domain.factors.map((k) => [k, 0.5])));
  const [explore, setExplore] = useState(0.3);

  const GENRES = useMemo(() => allGenres(domain), [domain]);
  // Picker shows the most recognizable slice of the catalogue.
  const pickerItems = useMemo(
    () => [...domain.items].sort((a, b) => b.popularity - a.popularity).slice(0, 27),
    [domain]
  );
  const byId = (id) => domain.items.find((b) => b.id === id);
  const noun = domain.noun, plural = domain.nounPlural;

  const steps = [
    { key: "intro" },
    { key: "genres", title: "What do you reach for?", eyebrow: `Step 1 · ${domain.genreLabel} you love`,
      sub: `Pick what you gravitate to. Broad strokes first — we'll get specific next.` },
    { key: "avoidGenres", title: "Anything you'd rather skip?", eyebrow: "Step 2 · Not for you",
      sub: `Optional. Mark ${domain.genreLabel.toLowerCase()} you actively avoid so we keep them out of your deck.` },
    { key: "fav", title: "Name a few you love", eyebrow: `Step 3 · Favourite ${plural}`,
      sub: `Choose 3 or more. These anchor your taste — the engine learns the feel of what you adore.` },
    { key: "surprise", title: "Any pleasant surprises?", eyebrow: "Step 4 · Loved against the odds",
      sub: `Optional. ${plural[0].toUpperCase() + plural.slice(1)} you enjoyed even though they're not your usual thing. This widens what we'll dare to show you.` },
    { key: "avoid", title: "Any that weren't for you?", eyebrow: "Step 5 · Bounced off",
      sub: `Optional. ${plural[0].toUpperCase() + plural.slice(1)} you disliked — we'll steer clear of their fingerprint.` },
    { key: "weights", title: `What makes a ${noun} for you?`, eyebrow: "Step 6 · What you weigh",
      sub: "Drag toward what matters most." },
    { key: "explore", title: "How far should we wander?", eyebrow: "Step 7 · The dial",
      sub: "Stay close to your taste, or let us push you somewhere new. You can change this any time." },
  ];
  const cur = steps[step];
  const last = steps.length - 1;

  const canNext =
    cur.key === "genres" ? genres.length >= 1 :
    cur.key === "fav" ? favIds.length >= 3 : true;

  const finish = () => {
    const profile = buildInitialProfile(domain, {
      genres, avoidGenres,
      favoriteItems: favIds.map(byId),
      surprisedLiked: surpriseIds.map(byId),
      avoidItems: avoidIds.map(byId),
      weights, explore,
    });
    onDone(profile, { genres, avoidGenres, favIds, surpriseIds, avoidIds, weights, explore });
  };

  return (
    <div className="taste-body" style={{ paddingTop: 14 }}>
      {step > 0 && (
        <>
          <div className="progress"><span style={{ width: `${(step / last) * 100}%` }} /></div>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
            <button className="iconbtn" onClick={() => setStep(step - 1)}><ChevronLeft size={16} /> Back</button>
            <span className="cat-no">{String(step).padStart(2, "0")} / {String(last).padStart(2, "0")}</span>
          </div>
        </>
      )}

      {cur.key === "intro" && (
        <div style={{ paddingTop: 36 }}>
          <div className="eyebrow">Catalogue {domain.catalogueNo}</div>
          <h1 className="h1" style={{ fontSize: 38, marginTop: 14 }}>
            {domain.heroTitle[0]}<br /><span className="hl">{domain.heroTitle[1]}</span><br />{domain.heroTitle[2]}
          </h1>
          <p className="sub" style={{ marginTop: 16, maxWidth: 340 }}>{domain.heroSub}</p>
          <button className="btn btn-primary btn-block" style={{ marginTop: 28 }} onClick={() => setStep(1)}>
            Build my taste profile <ChevronRight size={16} style={{ verticalAlign: "-3px" }} />
          </button>
          <p className="cat-no" style={{ marginTop: 14, textAlign: "center" }}>
            ~ 90 seconds · {domain.items.length} {plural} in the starter catalogue
          </p>
        </div>
      )}

      {cur.title && (
        <>
          <div className="eyebrow">{cur.eyebrow}</div>
          <h2 className="h1" style={{ fontSize: 27, marginTop: 8 }}>{cur.title}</h2>
          <p className="sub" style={{ margin: "8px 0 20px" }}>{cur.sub}</p>
        </>
      )}

      {cur.key === "genres" && (
        <div className="chips">
          {GENRES.map((g) => (
            <span key={g} className={"chip" + (genres.includes(g) ? " on" : "")}
              onClick={() => toggleSel(setGenres, g)}>{g}</span>
          ))}
        </div>
      )}
      {cur.key === "avoidGenres" && (
        <div className="chips">
          {GENRES.filter((g) => !genres.includes(g)).map((g) => (
            <span key={g} className={"chip avoid" + (avoidGenres.includes(g) ? " on" : "")}
              onClick={() => toggleSel(setAvoidGenres, g)}>{g}</span>
          ))}
        </div>
      )}
      {cur.key === "fav" && (
        <>
          <p className="cat-no" style={{ marginBottom: 12 }}>{favIds.length} selected · {Math.max(0, 3 - favIds.length)} more to continue</p>
          <ItemPicker items={pickerItems} selected={favIds} set={setFavIds} />
        </>
      )}
      {cur.key === "surprise" && <ItemPicker items={pickerItems} selected={surpriseIds} set={setSurpriseIds} exclude={favIds} />}
      {cur.key === "avoid" && <ItemPicker items={pickerItems} selected={avoidIds} set={setAvoidIds} exclude={[...favIds, ...surpriseIds]} />}

      {cur.key === "weights" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {domain.factors.map((k) => (
            <div key={k}>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 7 }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{domain.factorLabels[k]}</span>
                <span className="cat-no">{weights[k] < 0.34 ? "nice to have" : weights[k] < 0.67 ? "matters" : "essential"}</span>
              </div>
              <input className="range" type="range" min="0" max="1" step="0.01" value={weights[k]}
                onChange={(e) => setWeights({ ...weights, [k]: parseFloat(e.target.value) })} />
            </div>
          ))}
        </div>
      )}

      {cur.key === "explore" && (
        <div className="card" style={{ textAlign: "center", padding: "26px 18px" }}>
          <div className="h2" style={{ marginBottom: 4 }}>
            {explore < 0.25 ? "Stick to my lane" : explore < 0.55 ? "A little adventure" : explore < 0.8 ? "Surprise me" : "Throw me in the deep end"}
          </div>
          <p className="cat-no" style={{ marginBottom: 20 }}>
            {explore < 0.25 ? "Stay tight to what you already love" :
             explore < 0.55 ? "Mostly your taste, with the odd curveball" :
             explore < 0.8 ? "Plenty off the beaten path" : "Maximum range, minimum safety"}
          </p>
          <input className="range" type="range" min="0" max="1" step="0.01" value={explore}
            onChange={(e) => setExplore(parseFloat(e.target.value))} />
          <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
            <span className="cat-no">Stay aligned</span><span className="cat-no">Expand my taste</span>
          </div>
        </div>
      )}

      {step > 0 && (
        <button className={"btn btn-block " + (step === last ? "btn-hl" : "btn-primary")} disabled={!canNext}
          style={{ marginTop: 26, opacity: canNext ? 1 : 0.4 }}
          onClick={() => (step === last ? finish() : setStep(step + 1))}>
          {step === last ? <>Open {domain.name} <Sparkles size={16} style={{ verticalAlign: "-3px" }} /></> :
            <>Continue <ChevronRight size={16} style={{ verticalAlign: "-3px" }} /></>}
        </button>
      )}
    </div>
  );
}
