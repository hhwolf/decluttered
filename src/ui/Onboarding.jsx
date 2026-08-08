import { useState, useMemo, useEffect, useRef } from "react";
import { ChevronRight, ChevronLeft, Sparkles, Check } from "lucide-react";
import { buildInitialProfile } from "../engine/engine.mjs";
import { GOAL_KEYS } from "../engine/suggest.mjs";
import { allGenres, paletteFor } from "../domains.js";
import { allCities, filterByCities, countForCities } from "../engine/location.mjs";
import { Chip, Cover, ItemPicker, toggleSel } from "./bits.jsx";

export default function Onboarding({ domain, onDone, autoQuickStart = false, onAutoQuickStart }) {
  const [step, setStep] = useState(0);
  const [genres, setGenres] = useState([]);
  const [avoidGenres, setAvoidGenres] = useState([]);
  const [favIds, setFavIds] = useState([]);
  const [surpriseIds, setSurpriseIds] = useState([]);
  const [avoidIds, setAvoidIds] = useState([]);
  const [weights, setWeights] = useState(Object.fromEntries(domain.factors.map((k) => [k, 0.5])));
  const [goals, setGoals] = useState([]);
  const [explore, setExplore] = useState(0.3);

  const [cities, setCities] = useState([]);
  const [cityOnly, setCityOnly] = useState(false); // quick-start: ask location, then go

  // Once a location is chosen, every later step works from that pool only —
  // there is no point asking a Bostonian to rate a Memphis barbecue joint.
  const pool = useMemo(
    () => (domain.hasLocation ? filterByCities(domain.items, cities) : domain.items),
    [domain, cities]
  );
  const cityOptions = useMemo(() => (domain.hasLocation ? allCities(domain.items) : []), [domain]);
  const GENRES = useMemo(() => allGenres({ ...domain, items: pool }), [domain, pool]);
  // Picker shows the most recognizable slice of the (possibly narrowed) pool.
  const pickerItems = useMemo(
    () => [...pool].sort((a, b) => b.popularity - a.popularity).slice(0, 27),
    [pool]
  );
  const byId = (id) => domain.items.find((b) => b.id === id);
  const noun = domain.noun, plural = domain.nounPlural;

  const steps = [
    { key: "intro" },
    // Place-bound domains ask location first: everything downstream (the
    // favourites picker included) should only show reachable places.
    ...(domain.hasLocation
      ? [{ key: "cities", title: domain.locationTitle, eyebrow: "Where you eat", sub: domain.locationSub }]
      : []),
    { key: "genres", title: "What do you reach for?", eyebrow: `${domain.genreLabel} you love`,
      sub: `Pick what you gravitate to. Broad strokes first — we'll get specific next.` },
    { key: "avoidGenres", title: "Anything you'd rather skip?", eyebrow: "Not for you", optional: true,
      sub: `Optional. Mark ${domain.genreLabel.toLowerCase()} you actively avoid so we keep them out of your deck.` },
    { key: "fav", title: "Name a few you love", eyebrow: `Favourite ${plural}`,
      sub: `Choose 3 or more. These anchor your taste — the engine learns the feel of what you adore.` },
    { key: "edges", title: "Surprises and misses?", eyebrow: "The edges", optional: true,
      sub: `Optional. ${plural[0].toUpperCase() + plural.slice(1)} you loved against the odds widen what we'll dare to show you; ones you bounced off keep their fingerprint out of your deck.` },
    { key: "weights", title: `What makes a ${noun} for you?`, eyebrow: "What you weigh", optional: true,
      sub: "Drag toward what matters most — or skip, and your ratings will teach us." },
    { key: "goals", title: "What are you here for?", eyebrow: "Your goals", optional: true,
      sub: "Optional, up to 3. Goals get their own suggestion rows — honored even when they cut against your usual taste." },
    { key: "explore", title: "How far should we wander?", eyebrow: "The dial",
      sub: "Stay close to your taste, or let us push you somewhere new. You can change this any time." },
    { key: "confirm", title: "Here's what we heard", eyebrow: "Confirm your taste profile",
      sub: "This is the profile your deck and suggestions will run on. If something reads wrong, go back and fix it — or open the deck and correct it by swiping." },
  ];
  const cur = steps[step];
  const last = steps.length - 1;

  const canNext =
    cur.key === "cities" ? cities.length >= 1 :   // required: a deck you can't get to is useless
    cur.key === "genres" ? genres.length >= 1 :
    cur.key === "fav" ? favIds.length >= 3 : true;

  // "Skip for now" instead of "Continue" when an optional step has no input yet
  const stepEmpty =
    cur.key === "avoidGenres" ? avoidGenres.length === 0 :
    cur.key === "edges" ? surpriseIds.length + avoidIds.length === 0 :
    cur.key === "weights" ? Object.values(weights).every((v) => v === 0.5) :
    cur.key === "goals" ? goals.length === 0 : false;

  const buildProfile = () => {
    const profile = buildInitialProfile(domain, {
      genres, avoidGenres,
      favoriteItems: favIds.map(byId),
      surprisedLiked: surpriseIds.map(byId),
      avoidItems: avoidIds.map(byId),
      weights, explore,
    });
    profile.goals = goals; // engine ignores goals; the suggester honors them
    profile.cities = cities; // restaurants only; [] means "anywhere"
    return profile;
  };
  const finish = () => {
    onDone(buildProfile(), { genres, avoidGenres, favIds, surpriseIds, avoidIds, weights, goals, explore, cities });
  };
  // Zero-input path: a neutral profile with the dial opened up, so the deck
  // starts on broadly-loved items and learns entirely from swipes. Every
  // preference remains editable in Profile afterwards.
  const quickStart = (withCities = cities) => {
    const profile = buildInitialProfile(domain, {
      genres: [], avoidGenres: [], favoriteItems: [], surprisedLiked: [], avoidItems: [],
      weights: Object.fromEntries(domain.factors.map((k) => [k, 0.5])), explore: 0.5,
    });
    profile.goals = [];
    profile.cities = withCities;
    onDone(profile, { genres: [], avoidGenres: [], favIds: [], surpriseIds: [], avoidIds: [],
      weights: Object.fromEntries(domain.factors.map((k) => [k, 0.5])), goals: [], explore: 0.5,
      cities: withCities, quickStart: true });
  };
  // Skipping setup is fine everywhere except a place-bound craving: we still
  // need to know which city, so route to that one question instead.
  const skipSetup = () => {
    if (domain.hasLocation) { setCityOnly(true); setStep(steps.findIndex((x) => x.key === "cities")); }
    else quickStart();
  };
  // "Skip setup" on the landing lands here; run the zero-input path once so the
  // user goes straight from the pitch to a deck without seeing step 1.
  const firedQuickStart = useRef(false);
  useEffect(() => {
    if (autoQuickStart && !firedQuickStart.current) {
      firedQuickStart.current = true;
      onAutoQuickStart?.();
      skipSetup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoQuickStart]);

  // live preview of the derived profile for the confirmation step
  const preview = useMemo(
    () => (cur.key === "confirm" ? buildProfile() : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step]
  );

  return (
    <div className="taste-body" style={{ paddingTop: 14 }}>
      {step > 0 && !cityOnly && (
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
          <div className="row" style={{ marginTop: 24, gap: 0, justifyContent: "center" }}>
            {(pickerItems.filter((b) => b.image).length >= 3 ? pickerItems.filter((b) => b.image) : pickerItems).slice(0, 5).map((b, i) => (
              <div key={b.id} style={{ transform: `rotate(${(i - 2) * 4}deg) translateY(${Math.abs(i - 2) * 5}px)`,
                marginLeft: i === 0 ? 0 : -18, zIndex: 5 - Math.abs(i - 2),
                border: "2px solid var(--ink)", borderRadius: 9, boxShadow: "3px 3px 0 var(--ink)", overflow: "hidden" }}>
                <Cover item={b} size="md" />
              </div>
            ))}
          </div>
          <button className="btn btn-primary btn-block" style={{ marginTop: 26 }} onClick={() => setStep(1)}>
            Build my taste profile <ChevronRight size={16} style={{ verticalAlign: "-3px" }} />
          </button>
          <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={skipSetup}>
            Skip setup — just show me {plural}
          </button>
          <p className="cat-no" style={{ marginTop: 14, textAlign: "center", lineHeight: 1.5 }}>
            ~ 60 seconds · {domain.items.length.toLocaleString()} {plural} in the catalogue<br />
            Skipping starts from the crowd's favourites and learns purely from your swipes.
          </p>
        </div>
      )}

      {cur.title && (
        <>
          <div className="eyebrow">Step {step} · {cur.eyebrow}</div>
          <h2 className="h1" style={{ fontSize: 27, marginTop: 8 }}>{cur.title}</h2>
          <p className="sub" style={{ margin: "8px 0 20px" }}>{cur.sub}</p>
        </>
      )}

      {cur.key === "cities" && (
        <>
          <p className="cat-no" style={{ marginBottom: 12 }}>
            {cities.length === 0
              ? "Pick at least one — a great restaurant you can't get to is no use to you."
              : `${countForCities(domain.items, cities)} restaurants in ${cities.length} ${cities.length === 1 ? "city" : "cities"}.`}
          </p>
          <div className="chips" style={{ marginBottom: 14 }}>
            {cityOptions.filter((c) => c.focus).map((c) => (
              <Chip key={c.city} on={cities.includes(c.city)} onClick={() => toggleSel(setCities, c.city)}>
                {c.city} <span style={{ opacity: .55 }}>{c.count}</span>
              </Chip>
            ))}
          </div>
          <details>
            <summary className="cat-no" style={{ cursor: "pointer", marginBottom: 10 }}>
              Somewhere else? {cityOptions.length - 5} more cities
            </summary>
            <div className="chips">
              {cityOptions.filter((c) => !c.focus).map((c) => (
                <Chip key={c.city} on={cities.includes(c.city)} onClick={() => toggleSel(setCities, c.city)}>
                  {c.city} <span style={{ opacity: .55 }}>{c.count}</span>
                </Chip>
              ))}
            </div>
          </details>
        </>
      )}

      {cur.key === "genres" && (
        <div className="chips">
          {GENRES.map((g) => (
            <Chip key={g} on={genres.includes(g)} onClick={() => toggleSel(setGenres, g)}>{g}</Chip>
          ))}
        </div>
      )}
      {cur.key === "avoidGenres" && (
        <div className="chips">
          {GENRES.filter((g) => !genres.includes(g)).map((g) => (
            <Chip key={g} variant="avoid" on={avoidGenres.includes(g)} onClick={() => toggleSel(setAvoidGenres, g)}>{g}</Chip>
          ))}
        </div>
      )}
      {cur.key === "fav" && (
        <>
          <p className="cat-no" style={{ marginBottom: 12 }}>{favIds.length} selected · {Math.max(0, 3 - favIds.length)} more to continue</p>
          <ItemPicker items={pickerItems} selected={favIds} set={setFavIds} />
        </>
      )}
      {cur.key === "edges" && (
        <>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Loved against the odds</div>
          <ItemPicker items={pickerItems.slice(0, 12)} selected={surpriseIds} set={setSurpriseIds} exclude={favIds} />
          <div className="eyebrow" style={{ margin: "20px 0 10px" }}>Weren't for you</div>
          <ItemPicker items={pickerItems.slice(0, 12)} selected={avoidIds} set={setAvoidIds} exclude={[...favIds, ...surpriseIds]} />
        </>
      )}

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

      {cur.key === "goals" && (
        <>
          <p className="cat-no" style={{ marginBottom: 12 }}>{goals.length} of 3 selected</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {GOAL_KEYS.map((g) => {
              const on = goals.includes(g);
              return (
                <button key={g} onClick={() => toggleSel(setGoals, g, 3)}
                  className="card" style={{ textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center",
                    justifyContent: "space-between", gap: 10, padding: "13px 15px",
                    borderColor: on ? "var(--ink)" : "var(--line)", background: on ? "var(--paper2)" : "var(--card)" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14.5 }}>{domain.goalLabels[g].chip}</div>
                    <div className="cat-no" style={{ marginTop: 3, lineHeight: 1.4 }}>{domain.goalLabels[g].reason.replace(/^You (said you |asked for |want )/, "").replace(/^./, (c) => c.toUpperCase())}</div>
                  </div>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", flex: "none", border: "2px solid var(--ink)",
                    background: on ? "var(--hl)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {on && <Check size={13} color="#1c2406" strokeWidth={3} />}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {cur.key === "confirm" && preview && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {domain.hasLocation && (
            <div className="card">
              <div className="eyebrow" style={{ marginBottom: 10 }}>Where you eat</div>
              {cities.length === 0
                ? <p className="sub" style={{ margin: 0 }}>Everywhere — all {domain.items.length} restaurants are in play. Narrow it any time in Profile.</p>
                : <div className="chips">{cities.map((c) => <span key={c} className="chip on" style={{ cursor: "default" }}>{c}</span>)}</div>}
            </div>
          )}
          <div className="card">
            <div className="eyebrow" style={{ marginBottom: 10 }}>{domain.genreLabel} you lean into</div>
            <div className="chips">
              {genres.map((g) => <span key={g} className="chip on" style={{ background: paletteFor(g).bg, borderColor: paletteFor(g).bg, color: paletteFor(g).fg, cursor: "default" }}>{g}</span>)}
              {avoidGenres.map((g) => <span key={g} className="chip avoid on" style={{ cursor: "default" }}>not {g}</span>)}
            </div>
          </div>
          <div className="card">
            <div className="eyebrow" style={{ marginBottom: 10 }}>{domain.moodTitle}</div>
            <p className="sub" style={{ margin: 0 }}>
              Reading you as {domain.tones.map((k) => <b key={k}>{domain.toneLabels[k](preview.toneTarget[k])}</b>).reduce((acc, el, i) => (i === 0 ? [el] : [...acc, i === domain.tones.length - 1 ? " and " : ", ", el]), [])},
              anchored to {favIds.length} favourite{favIds.length === 1 ? "" : "s"}.
            </p>
          </div>
          <div className="card">
            <div className="eyebrow" style={{ marginBottom: 10 }}>{domain.weighTitle}</div>
            {domain.factors.filter((k) => weights[k] >= 0.6).length === 0 ? (
              <p className="sub" style={{ margin: 0 }}>Everything weighted evenly — your ratings will teach us what actually matters.</p>
            ) : (
              <p className="sub" style={{ margin: 0 }}>
                Essential: <b>{domain.factors.filter((k) => weights[k] >= 0.6).map((k) => domain.factorLabels[k].toLowerCase()).join(", ")}</b>
                {domain.factors.filter((k) => weights[k] < 0.4).length > 0 && (
                  <> · low-stakes: {domain.factors.filter((k) => weights[k] < 0.4).map((k) => domain.factorLabels[k].toLowerCase()).join(", ")}</>
                )}
              </p>
            )}
          </div>
          <div className="card">
            <div className="eyebrow" style={{ marginBottom: 10 }}>Your goals</div>
            {goals.length === 0
              ? <p className="sub" style={{ margin: 0 }}>None set — suggestions will run on taste alone. You can add goals any time in Profile.</p>
              : <div className="chips">{goals.map((g) => <span key={g} className="chip on" style={{ cursor: "default" }}>{domain.goalLabels[g].chip}</span>)}</div>}
          </div>
          <p className="cat-no" style={{ textAlign: "center" }}>
            Discovery dial: {Math.round(explore * 100)}% adventurous · every swipe and rating keeps refining this
          </p>
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
        <button className={"btn btn-block " + (step === last || cityOnly ? "btn-hl" : cur.optional && stepEmpty ? "btn-ghost" : "btn-primary")} disabled={!canNext}
          style={{ marginTop: 26, opacity: canNext ? 1 : 0.4 }}
          onClick={() => {
            if (cityOnly) return quickStart(cities);   // quick path: city was the only question
            if (step === last) return finish();
            setStep(step + 1);
          }}>
          {cityOnly ? <>Open {domain.name} <Sparkles size={16} style={{ verticalAlign: "-3px" }} /></> :
            step === last ? <>Looks right — open {domain.name} <Sparkles size={16} style={{ verticalAlign: "-3px" }} /></> :
            cur.optional && stepEmpty ? <>Skip for now <ChevronRight size={16} style={{ verticalAlign: "-3px" }} /></> :
            <>Continue <ChevronRight size={16} style={{ verticalAlign: "-3px" }} /></>}
        </button>
      )}
    </div>
  );
}
