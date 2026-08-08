import { useState, useEffect, useRef } from "react";
import { Compass, Library as LibraryIcon, Users, User, BookOpen, UtensilsCrossed, Music, Film, Tv, Sparkles } from "lucide-react";
import { DOMAINS, DOMAIN_KEYS } from "./domains.js";
import { updateProfileFromAction, applyRating } from "./engine/engine.mjs";
import { dayKey } from "./engine/stats.mjs";
import { CSS, clamp, Toast } from "./ui/bits.jsx";
import ItemSheet from "./ui/ItemSheet.jsx";
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
  activity: {}, // "YYYY-MM-DD" -> items sorted that day (drives the streak)
  ranked: [],   // ids, best first, from head-to-head comparisons
});

// Older saved states predate activity/ranked — fill them in on load so the new
// surfaces never read undefined.
const withDefaults = (s, key) => ({ ...emptyDomainState(key), ...s });

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState("books");
  const [states, setStates] = useState(() =>
    Object.fromEntries(DOMAIN_KEYS.map((k) => [k, emptyDomainState(k)]))
  );
  const [view, setView] = useState("discover");
  const [sheetItem, setSheetItem] = useState(null); // item shown in the detail sheet
  const [undo, setUndo] = useState(null);           // last sort action, for the undo toast
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
    // snapshot for undo — the profile is derived, so we restore it wholesale
    const cur = states[active];
    setUndo({
      domainKey: active, item, action,
      prev: { profile: cur.profile, shelf: cur.shelf, feed: cur.feed, activity: cur.activity },
    });
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
      const today = dayKey(Date.now());
      const activity = { ...cur.activity, [today]: (cur.activity?.[today] || 0) + 1 };
      return { ...s, [active]: { ...cur, profile, shelf, feed, activity } };
    });
  };

  const undoLast = () => {
    if (!undo) return;
    setStates((s) => ({ ...s, [undo.domainKey]: { ...s[undo.domainKey], ...undo.prev } }));
    setUndo(null);
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
  const setRanked = (ranked) => patch({ ranked });

  // Imported CSV rows: merge into the shelf and let every rated row teach the
  // profile, so the deck reflects an imported history immediately.
  const importEntries = (entries) => setStates((s) => {
    const cur = s[active];
    let profile = cur.profile;
    for (const [id, entry] of Object.entries(entries)) {
      const item = domain.items.find((i) => i.id === id);
      if (!item) continue;
      const action = entry.status === "want" ? "want" : "consumed";
      profile = updateProfileFromAction(profile, item, action, domain, null);
      if (entry.rating) profile = applyRating(profile, item, { overall: entry.rating }, domain);
    }
    return { ...s, [active]: { ...cur, profile, shelf: { ...cur.shelf, ...entries } } };
  });
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
                  onAction={handleAction} onExplore={setExplore} onOpen={setSheetItem} />
              )}
              {view === "foryou" && (
                <ForYou domain={domain} profile={ds.profile} shelf={ds.shelf} onAction={handleAction} onOpen={setSheetItem} />
              )}
              {view === "library" && (
                <LibraryView domain={domain} shelf={ds.shelf} ranked={ds.ranked} onRanked={setRanked}
                  onMove={moveShelf} onRemove={removeShelf} onRate={handleRate} onOpen={setSheetItem} />
              )}
              {view === "feed" && <Feed domain={domain} feed={ds.feed} setFeed={setFeed} shelf={ds.shelf} onOpen={setSheetItem} />}
              {view === "profile" && (
                <ProfileView domain={domain} profile={ds.profile} shelf={ds.shelf} activity={ds.activity}
                  states={states} onSwitchDomain={(k) => { setActive(k); setView("discover"); }} onImport={importEntries}
                  onExplore={setExplore} onGoals={setGoals} onReset={reset} />
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
          onAction={handleAction} onRate={handleRate} onClose={() => setSheetItem(null)} />
      )}
    </div>
  );
}
