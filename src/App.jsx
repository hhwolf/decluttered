import { useState, useEffect, useRef } from "react";
import { Compass, Library as LibraryIcon, Users, User, BookOpen, UtensilsCrossed, Music, Film, Tv, Sparkles } from "lucide-react";
import { DOMAINS, DOMAIN_KEYS } from "./domains.js";
import { updateProfileFromAction, applyRating } from "./engine/engine.mjs";
import { CSS, clamp } from "./ui/bits.jsx";
import Onboarding from "./ui/Onboarding.jsx";
import Discover from "./ui/Discover.jsx";
import ForYou from "./ui/ForYou.jsx";
import LibraryView from "./ui/Library.jsx";
import Feed, { seedFeed } from "./ui/Feed.jsx";
import ProfileView from "./ui/Profile.jsx";

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

const emptyDomainState = (key) => ({
  onboarded: false, profile: null, onboardingData: null, shelf: {}, feed: seedFeed(DOMAINS[key]),
});

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState("books");
  const [states, setStates] = useState(() =>
    Object.fromEntries(DOMAIN_KEYS.map((k) => [k, emptyDomainState(k)]))
  );
  const [view, setView] = useState("discover");
  const firstSave = useRef(true);

  useEffect(() => {
    const raw = store.get();
    if (raw?.states) {
      setStates((prev) => {
        const merged = { ...prev };
        for (const k of DOMAIN_KEYS) if (raw.states[k]?.onboarded) merged[k] = raw.states[k];
        return merged;
      });
      if (DOMAIN_KEYS.includes(raw.active)) setActive(raw.active);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (firstSave.current) { firstSave.current = false; return; }
    store.set({ active, states });
  }, [loaded, active, states]);

  const domain = DOMAINS[active];
  const ds = states[active];
  const patch = (partial) => setStates((s) => ({ ...s, [active]: { ...s[active], ...partial } }));

  const finishOnboarding = (prof, data) => {
    patch({ profile: prof, onboardingData: data, onboarded: true });
    setView("discover");
  };

  const handleAction = (item, action, rating = null) => {
    setStates((s) => {
      const cur = s[active];
      const profile = updateProfileFromAction(cur.profile, item, action, domain, rating);
      const status = action === "want" ? "want" : action === "pass" ? "pass" : "consumed";
      const prev = cur.shelf[item.id] || {};
      const shelf = { ...cur.shelf, [item.id]: { status, rating: rating != null ? rating : prev.rating, addedAt: prev.addedAt || Date.now() } };
      let feed = cur.feed;
      if (action === "want") {
        feed = [{ id: "p" + Date.now(), userId: "me", type: "shelved", itemId: item.id, text: "", ts: Date.now(), likes: 0, likedByMe: false, comments: [] }, ...feed];
      }
      return { ...s, [active]: { ...cur, profile, shelf, feed } };
    });
  };

  const moveShelf = (id, status) => setStates((s) => {
    const cur = s[active];
    return { ...s, [active]: { ...cur, shelf: { ...cur.shelf, [id]: { ...cur.shelf[id], status, addedAt: Date.now() } } } };
  });
  const removeShelf = (id) => setStates((s) => {
    const cur = s[active];
    const shelf = { ...cur.shelf }; delete shelf[id];
    return { ...s, [active]: { ...cur, shelf } };
  });

  const handleRate = (item, rating) => {
    setStates((s) => {
      const cur = s[active];
      const profile = applyRating(cur.profile, item, rating, domain);
      const wasRated = !!(cur.shelf[item.id] && cur.shelf[item.id].rating);
      const prev = cur.shelf[item.id] || {};
      const overall = rating.overall || 0;
      const shelf = { ...cur.shelf, [item.id]: {
        ...prev, status: "consumed",
        rating: overall || undefined,
        elements: rating.elements || prev.elements,
        addedAt: prev.addedAt || Date.now(),
      } };
      let feed = cur.feed;
      // Post to the feed only the first time an item earns a high rating (no spam on edits).
      if (!wasRated && rating.overall >= 4) {
        feed = [{ id: "p" + Date.now(), userId: "me", type: "rated", itemId: item.id, rating: rating.overall, text: "", ts: Date.now(), likes: 0, likedByMe: false, comments: [] }, ...feed];
      }
      return { ...s, [active]: { ...cur, profile, shelf, feed } };
    });
  };

  const setExplore = (v) => setStates((s) => {
    const cur = s[active];
    return { ...s, [active]: { ...cur, profile: { ...cur.profile, explore: clamp(v) } } };
  });
  const setGoals = (goals) => setStates((s) => {
    const cur = s[active];
    return { ...s, [active]: { ...cur, profile: { ...cur.profile, goals } } };
  });
  const setFeed = (feed) => patch({ feed });
  const reset = () => { patch(emptyDomainState(active)); setView("discover"); };

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
          <div className="taste-mark">Decluttered <span className="dot">/ ONE ENGINE, FIVE CRAVINGS</span></div>
          {ds.onboarded && <span className="cat-no">№ {String(ds.profile?.interactions || 0).padStart(3, "0")}</span>}
        </div>

        <div className="dombar">
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
        </div>

        {!loaded ? (
          <div className="empty" style={{ paddingTop: 120 }}><span className="cat-no">Opening the catalogue…</span></div>
        ) : !ds.onboarded ? (
          <Onboarding key={active} domain={domain} onDone={finishOnboarding} />
        ) : (
          <>
            <div className="taste-body">
              {view === "discover" && (
                <Discover domain={domain} profile={ds.profile} shelf={ds.shelf}
                  onAction={handleAction} onExplore={setExplore} />
              )}
              {view === "foryou" && (
                <ForYou domain={domain} profile={ds.profile} shelf={ds.shelf} onAction={handleAction} />
              )}
              {view === "library" && (
                <LibraryView domain={domain} shelf={ds.shelf} onMove={moveShelf} onRemove={removeShelf} onRate={handleRate} />
              )}
              {view === "feed" && <Feed domain={domain} feed={ds.feed} setFeed={setFeed} shelf={ds.shelf} />}
              {view === "profile" && (
                <ProfileView domain={domain} profile={ds.profile} shelf={ds.shelf} onExplore={setExplore} onGoals={setGoals} onReset={reset} />
              )}
            </div>
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
    </div>
  );
}
