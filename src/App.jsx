import { useState, useEffect, useRef, useMemo } from "react";
import { Compass, Library as LibraryIcon, Users, User, BookOpen, UtensilsCrossed, Music, Film, Tv, Sparkles } from "lucide-react";
import { DOMAINS, DOMAIN_KEYS } from "./domains.js";
import {
  emptyDomainState as blankDomain, withDefaults as fillDefaults, sortItem, undoSort,
  rateItem, moveShelfEntry, removeShelfEntry, setProfileField, importHistory,
} from "./engine/session.mjs";
import { filterByCities } from "./engine/location.mjs";
import { CSS, clamp, Toast } from "./ui/bits.jsx";
import ItemSheet from "./ui/ItemSheet.jsx";
import Onboarding from "./ui/Onboarding.jsx";
import Discover from "./ui/Discover.jsx";
import ForYou from "./ui/ForYou.jsx";
import LibraryView from "./ui/Library.jsx";
import Feed, { seedFeed } from "./ui/Feed.jsx";
import ProfileView from "./ui/Profile.jsx";
import Landing from "./ui/Landing.jsx";

/* ---- persistence (localStorage, never throws) ----------------------------- */
const KEY = "taste:state:v1";
const store = {
  get() {
    try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
  },
  set(v) {
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode etc. */ }
  },
};

const DOMAIN_ICONS = { books: BookOpen, movies: Film, tv: Tv, restaurants: UtensilsCrossed, music: Music };

// The transitions live in engine/session.mjs and are shared with the React
// Native client; these wrappers only supply the seeded feed, which is UI copy.
const emptyDomainState = (key) => blankDomain(seedFeed(DOMAINS[key]));
const withDefaults = (s, key) => fillDefaults(s, seedFeed(DOMAINS[key]));

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState("music");
  const [states, setStates] = useState(() =>
    Object.fromEntries(DOMAIN_KEYS.map((k) => [k, emptyDomainState(k)]))
  );
  const [view, setView] = useState("discover");
  const [sheetItem, setSheetItem] = useState(null); // item shown in the detail sheet
  const [undo, setUndo] = useState(null);           // last sort action, for the undo toast
  const [seenLanding, setSeenLanding] = useState(false);
  const [quickStart, setQuickStart] = useState(false); // landing asked to bypass setup
  const [showAbout, setShowAbout] = useState(false);   // pitch reopened from the header/profile
  const firstSave = useRef(true);

  useEffect(() => {
    const raw = store.get();
    if (raw?.states) {
      setStates((prev) => {
        const merged = { ...prev };
        for (const k of DOMAIN_KEYS) if (raw.states[k]?.onboarded) merged[k] = withDefaults(raw.states[k], k);
        return merged;
      });
      if (DOMAIN_KEYS.includes(raw.active)) setActive(raw.active);
      if (raw.seenLanding) setSeenLanding(true);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (firstSave.current) { firstSave.current = false; return; }
    store.set({ active, states, seenLanding });
  }, [loaded, active, states, seenLanding]);

  const domain = DOMAINS[active];
  const ds = states[active];
  // Discovery pool honours the location preference; `domain.items` stays whole
  // so the library can still resolve places in cities since deselected.
  const discoverDomain = useMemo(() => (
    domain.hasLocation && ds.profile?.cities?.length
      ? { ...domain, items: filterByCities(domain.items, ds.profile.cities) }
      : domain
  ), [domain, ds.profile?.cities]);
  const anyOnboarded = DOMAIN_KEYS.some((k) => states[k].onboarded);
  // Shown automatically to newcomers, and on demand to everyone else.
  const showLanding = showAbout || (!seenLanding && !anyOnboarded);
  const patch = (partial) => setStates((s) => ({ ...s, [active]: { ...s[active], ...partial } }));

  const finishOnboarding = (prof, data) => {
    patch({ profile: prof, onboardingData: data, onboarded: true });
    setView("discover");
  };

  const handleAction = (item, action, rating = null) => {
    // Computed outside the updater on purpose: setState inside another
    // setState's updater is a side effect in a reducer, and StrictMode runs
    // updaters twice. Sorts are user-initiated one at a time, so reading the
    // current state here is safe — and it is what the pre-refactor code did.
    const { state, undo: u } = sortItem(states[active], item, action, domain, rating);
    setStates((s) => ({ ...s, [active]: state }));
    setUndo({ ...u, domainKey: active });
  };

  const undoLast = () => {
    if (!undo) return;
    setStates((s) => ({ ...s, [undo.domainKey]: undoSort(s[undo.domainKey], undo) }));
    setUndo(null);
  };

  const moveShelf = (id, status) => setStates((s) => ({ ...s, [active]: moveShelfEntry(s[active], id, status) }));
  const removeShelf = (id) => setStates((s) => ({ ...s, [active]: removeShelfEntry(s[active], id) }));

  const handleRate = (item, rating) =>
    setStates((s) => ({ ...s, [active]: rateItem(s[active], item, rating, domain) }));

  const setExplore = (v) => setStates((s) => ({ ...s, [active]: setProfileField(s[active], "explore", clamp(v)) }));
  const setCities = (cities) => setStates((s) => ({ ...s, [active]: setProfileField(s[active], "cities", cities) }));
  const setGoals = (goals) => setStates((s) => ({ ...s, [active]: setProfileField(s[active], "goals", goals) }));
  const setFeed = (feed) => patch({ feed });
  const setRanked = (ranked) => patch({ ranked });

  // Imported CSV rows: merge into the shelf and let every rated row teach the
  // profile, so the deck reflects an imported history immediately.
  const importEntries = (entries) =>
    setStates((s) => ({ ...s, [active]: importHistory(s[active], entries, domain) }));

  const reset = () => { patch(emptyDomainState(active)); setView("discover"); setUndo(null); };

  const tabs = [
    { k: "discover", label: "Discover", Icon: Compass },
    { k: "foryou", label: "For you", Icon: Sparkles },
    { k: "library", label: "Library", Icon: LibraryIcon },
    { k: "feed", label: "Feed", Icon: Users },
    { k: "profile", label: "Profile", Icon: User },
  ];

  return (
    <div className={"taste-root dom-" + active}>
      <style>{CSS}</style>
      <div className="taste-shell">
        <div className="taste-top">
          <button className="taste-mark markbtn" onClick={() => setShowAbout(true)}
            title="What is Decluttered?" aria-label="What is Decluttered?">
            Decluttered <span className="dot">/ ONE ENGINE, FIVE CRAVINGS</span>
          </button>
          {ds.onboarded && <span className="cat-no">№ {String(ds.profile?.interactions || 0).padStart(3, "0")}</span>}
        </div>

        {!showLanding && <div className="dombar">
          {DOMAIN_KEYS.map((k) => {
            const Icon = DOMAIN_ICONS[k];
            return (
              <button key={k} className={"dombtn" + (active === k ? " on" : "")}
                onClick={() => { setActive(k); setView("discover"); }}>
                <Icon size={14} /> {DOMAINS[k].name}
                {states[k].onboarded && <span className="dnum">✓</span>}
              </button>
            );
          })}
        </div>}

        {!loaded ? (
          <div className="empty" style={{ paddingTop: 120 }}><span className="cat-no">Opening the catalogue…</span></div>
        ) : showLanding ? (
          <Landing
            revisiting={showAbout}
            onPick={(k) => { setSeenLanding(true); setShowAbout(false); setActive(k); setView("discover"); }}
            onSkip={() => { setSeenLanding(true); setShowAbout(false); setQuickStart(true); }}
            onClose={anyOnboarded ? () => setShowAbout(false) : null} />
        ) : !ds.onboarded ? (
          <Onboarding key={active} domain={domain} onDone={finishOnboarding}
            autoQuickStart={quickStart} onAutoQuickStart={() => setQuickStart(false)} />
        ) : (
          <>
            <div className="taste-body">
              {view === "discover" && (
                <Discover domain={discoverDomain} profile={ds.profile} shelf={ds.shelf}
                  onAction={handleAction} onExplore={setExplore} onOpen={setSheetItem}
                  onNeedCity={() => setView("profile")} />
              )}
              {view === "foryou" && (
                <ForYou domain={discoverDomain} profile={ds.profile} shelf={ds.shelf} onAction={handleAction} onOpen={setSheetItem} />
              )}
              {view === "library" && (
                <LibraryView domain={domain} shelf={ds.shelf} ranked={ds.ranked} onRanked={setRanked}
                  onMove={moveShelf} onRemove={removeShelf} onRate={handleRate} onOpen={setSheetItem} />
              )}
              {view === "feed" && <Feed domain={domain} feed={ds.feed} setFeed={setFeed} shelf={ds.shelf} onOpen={setSheetItem} />}
              {view === "profile" && (
                <ProfileView domain={domain} profile={ds.profile} shelf={ds.shelf} activity={ds.activity}
                  states={states} onSwitchDomain={(k) => { setActive(k); setView("discover"); }} onImport={importEntries}
                  onExplore={setExplore} onGoals={setGoals} onCities={setCities} onReset={reset} onAbout={() => setShowAbout(true)} />
              )}
            </div>
            {undo && (
              <Toast
                message={<>{undo.action === "want" ? domain.actions.want : undo.action === "pass" ? "Passed" : domain.actions.consumedShort} · <b>{undo.item.title}</b></>}
                actionLabel="Undo" onAction={undoLast} onDismiss={() => setUndo(null)} ms={8000} />
            )}
            <div className="tabbar">
              {tabs.map(({ k, label, Icon }) => (
                <button key={k} className={"tab" + (view === k ? " on" : "")} onClick={() => setView(k)}>
                  <Icon size={20} strokeWidth={view === k ? 2.3 : 1.8} />
                  <span>{label}</span>
                  <span className="ind" />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      {sheetItem && ds.onboarded && (
        <ItemSheet domain={domain} item={sheetItem} profile={ds.profile} shelfEntry={ds.shelf[sheetItem.id]}
          onAction={handleAction} onRate={handleRate} onClose={() => setSheetItem(null)}
          onOpenItem={setSheetItem} />
      )}
    </div>
  );
}
