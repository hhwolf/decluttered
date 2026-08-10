// ============================================================================
// App.js — the native root.
//
// Every state transition comes from ../src/engine/session.mjs, the same module
// the web client uses, so a rule fixed on one platform is fixed on both. The
// only genuinely platform-specific things here are storage (AsyncStorage rather
// than localStorage, and therefore async) and the safe-area chrome.
// ============================================================================
import React, { useState, useEffect, useRef, useMemo } from "react";
import { View, Text, Pressable, StatusBar, SafeAreaView, ActivityIndicator, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";

import { DOMAINS, DOMAIN_KEYS } from "../src/domains.js";
import { filterByCities } from "../src/engine/location.mjs";
import {
  emptyDomainState, withDefaults, sortItem, undoSort, rateItem,
  moveShelfEntry, removeShelfEntry, setProfileField,
} from "../src/engine/session.mjs";

import { C, F, text, accentFor, BORDER } from "./src/theme";
import Discover from "./src/screens/Discover";
import ItemSheet from "./src/screens/ItemSheet";
import ForYou from "./src/screens/ForYou";
import Library from "./src/screens/Library";
import Profile from "./src/screens/Profile";
import Onboarding from "./src/screens/Onboarding";

const KEY = "taste:state:v1";

/** Storage never throws; a corrupt or absent blob just means "new user". */
const store = {
  async get() {
    try { return JSON.parse(await AsyncStorage.getItem(KEY)); } catch { return null; }
  },
  async set(v) {
    try { await AsyncStorage.setItem(KEY, JSON.stringify(v)); } catch { /* full disk, etc. */ }
  },
};

const DOMAIN_ICON = { books: "book", movies: "film", tv: "monitor", restaurants: "coffee", music: "music" };

const TABS = [
  { k: "discover", label: "Discover", icon: "compass" },
  { k: "foryou", label: "For you", icon: "star" },
  { k: "library", label: "Library", icon: "bookmark" },
  { k: "profile", label: "Profile", icon: "user" },
];

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState("music");
  const [view, setView] = useState("discover");
  const [sheetItem, setSheetItem] = useState(null);
  const [undo, setUndo] = useState(null);
  const [quickStart, setQuickStart] = useState(false);
  const [states, setStates] = useState(() =>
    Object.fromEntries(DOMAIN_KEYS.map((k) => [k, emptyDomainState([])]))
  );
  const firstSave = useRef(true);
  const undoTimer = useRef(null);

  useEffect(() => {
    (async () => {
      const raw = await store.get();
      if (raw?.states) {
        setStates((prev) => {
          const merged = { ...prev };
          for (const k of DOMAIN_KEYS) if (raw.states[k]?.onboarded) merged[k] = withDefaults(raw.states[k], []);
          return merged;
        });
        if (DOMAIN_KEYS.includes(raw.active)) setActive(raw.active);
      }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (firstSave.current) { firstSave.current = false; return; }
    store.set({ active, states });
  }, [loaded, active, states]);

  // The undo toast is time-boxed; clear the timer on unmount so a pending
  // callback can't fire against a torn-down tree.
  useEffect(() => () => clearTimeout(undoTimer.current), []);

  const domain = DOMAINS[active];
  const ds = states[active];
  const accent = accentFor(active);

  // The deck honours the location preference; domain.items stays whole so the
  // library can still resolve places in cities since deselected.
  const discoverDomain = useMemo(() => (
    domain.hasLocation && ds.profile?.cities?.length
      ? { ...domain, items: filterByCities(domain.items, ds.profile.cities) }
      : domain
  ), [domain, ds.profile?.cities]);

  const patch = (partial) => setStates((s) => ({ ...s, [active]: { ...s[active], ...partial } }));

  const handleAction = (item, action, rating = null) => {
    // Outside the updater: setState inside another setState's updater is a side
    // effect in a reducer and StrictMode runs updaters twice.
    const { state, undo: u } = sortItem(states[active], item, action, domain, rating);
    setStates((s) => ({ ...s, [active]: state }));
    setUndo({ ...u, domainKey: active });
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 8000);
  };
  const undoLast = () => {
    if (!undo) return;
    setStates((s) => ({ ...s, [undo.domainKey]: undoSort(s[undo.domainKey], undo) }));
    setUndo(null);
  };
  const handleRate = (item, rating) =>
    setStates((s) => ({ ...s, [active]: rateItem(s[active], item, rating, domain) }));

  const body = () => {
    if (!loaded) {
      return (
        <View style={{ paddingTop: 120, alignItems: "center" }}>
          <ActivityIndicator color={C.ink} />
          <Text style={[text.catNo, { marginTop: 10 }]}>Opening the catalogue…</Text>
        </View>
      );
    }
    if (!ds.onboarded) {
      return (
        <Onboarding key={active} domain={domain}
          autoQuickStart={quickStart} onAutoQuickStart={() => setQuickStart(false)}
          onDone={(prof, data) => { patch({ profile: prof, onboardingData: data, onboarded: true }); setView("discover"); }} />
      );
    }
    if (view === "discover") {
      return (
        <Discover domain={discoverDomain} profile={ds.profile} shelf={ds.shelf}
          onAction={handleAction}
          onExplore={(v) => setStates((s) => ({ ...s, [active]: setProfileField(s[active], "explore", v) }))}
          onOpen={setSheetItem} onNeedCity={() => setView("profile")} />
      );
    }
    if (view === "foryou") {
      return <ForYou domain={discoverDomain} profile={ds.profile} shelf={ds.shelf} onOpen={setSheetItem} />;
    }
    if (view === "library") {
      return (
        <Library domain={domain} shelf={ds.shelf} onOpen={setSheetItem}
          onMove={(id, st) => setStates((s) => ({ ...s, [active]: moveShelfEntry(s[active], id, st) }))}
          onRemove={(id) => setStates((s) => ({ ...s, [active]: removeShelfEntry(s[active], id) }))} />
      );
    }
    return (
      <Profile domain={domain} profile={ds.profile} shelf={ds.shelf} activity={ds.activity}
        states={states} domainKeys={DOMAIN_KEYS} domains={DOMAINS}
        onSwitchDomain={(k) => { setActive(k); setView("discover"); }}
        onExplore={(v) => setStates((s) => ({ ...s, [active]: setProfileField(s[active], "explore", v) }))}
        onCities={(c) => setStates((s) => ({ ...s, [active]: setProfileField(s[active], "cities", c) }))}
        onReset={() => { patch(emptyDomainState([])); setView("discover"); setUndo(null); }} />
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.paper }}>
      <StatusBar barStyle="dark-content" />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 18, paddingTop: Platform.OS === "android" ? 14 : 6, paddingBottom: 8 }}>
          <Text style={{ fontFamily: F.display, fontWeight: "700", fontSize: 23 }}>Decluttered</Text>
          {ds.onboarded && (
            <Text style={text.catNo}>№ {String(ds.profile?.interactions || 0).padStart(3, "0")}</Text>
          )}
        </View>

        {/* domain switcher */}
        <View style={{ flexDirection: "row", gap: 5, paddingHorizontal: 14, paddingBottom: 10 }}>
          {DOMAIN_KEYS.map((k) => {
            const on = active === k;
            return (
              <Pressable key={k} onPress={() => { setActive(k); setView("discover"); }}
                accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={DOMAINS[k].name}
                style={{
                  flex: 1, alignItems: "center", justifyContent: "center", gap: 2,
                  borderWidth: BORDER, borderColor: C.line, borderRadius: 10, paddingVertical: 7,
                  backgroundColor: on ? accentFor(k).hl : C.card,
                }}>
                <Feather name={DOMAIN_ICON[k]} size={13} color={C.ink} />
                <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: 8, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" }}>
                  {DOMAINS[k].name}{states[k].onboarded ? " ✓" : ""}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ flex: 1, paddingHorizontal: 18 }}>{body()}</View>

        {undo && (
          <View style={{
            position: "absolute", left: 16, right: 16, bottom: 86,
            backgroundColor: C.ink, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14,
            flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12,
          }}>
            <Text numberOfLines={1} style={{ color: C.paper, fontFamily: F.ui, fontSize: 13.5, flex: 1 }}>
              {undo.action === "want" ? domain.actions.want : undo.action === "pass" ? "Passed" : domain.actions.consumedShort}
              {" · "}{undo.item.title}
            </Text>
            <Pressable onPress={undoLast} accessibilityRole="button" hitSlop={10}>
              <Text style={{ color: accent.hl, fontFamily: F.ui, fontWeight: "700", fontSize: 13.5 }}>Undo</Text>
            </Pressable>
          </View>
        )}

        {loaded && ds.onboarded && (
          <View style={{ flexDirection: "row", borderTopWidth: BORDER, borderTopColor: C.line, backgroundColor: C.card, paddingBottom: 6 }}>
            {TABS.map((t) => {
              const on = view === t.k;
              return (
                <Pressable key={t.k} onPress={() => setView(t.k)} accessibilityRole="tab"
                  accessibilityState={{ selected: on }} accessibilityLabel={t.label}
                  style={{ flex: 1, alignItems: "center", paddingVertical: 9, gap: 2 }}>
                  <Feather name={t.icon} size={20} color={on ? C.ink : C.muted} />
                  <Text style={{ fontFamily: F.mono, fontSize: 8.5, fontWeight: "700", textTransform: "uppercase", color: on ? C.ink : C.muted }}>
                    {t.label}
                  </Text>
                  <View style={{ height: 3, width: 22, borderRadius: 2, backgroundColor: on ? accent.hl : "transparent" }} />
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {sheetItem && ds.onboarded && (
        <ItemSheet domain={domain} item={sheetItem} profile={ds.profile}
          onAction={handleAction} onRate={handleRate}
          onClose={() => setSheetItem(null)} onOpenItem={setSheetItem} />
      )}
    </SafeAreaView>
  );
}
