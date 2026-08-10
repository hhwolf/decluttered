// ============================================================================
// Onboarding.js — teach the profile once, then swipe.
//
// Mirrors the web flow's shape and its two hard-won rules:
//   1. Every step is skippable, and "skip setup" reaches the deck in one tap.
//   2. For Table, a city is REQUIRED — and the skip path must route through the
//      same gate. On the web, skip originally called quickStart directly and
//      bypassed the requirement entirely; that bug is not reproduced here.
// ============================================================================
import React, { useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { buildInitialProfile } from "../../../src/engine/engine.mjs";
import { allCities, FOCUS_CITIES } from "../../../src/engine/location.mjs";
import { C, F, text, accentFor } from "../theme";
import { Btn, Chip, Cover } from "../components/bits";

export default function Onboarding({ domain, onDone, autoQuickStart, onAutoQuickStart }) {
  const accent = accentFor(domain.key);
  const [step, setStep] = useState("intro"); // intro | city | genres | picks
  const [cities, setCities] = useState([]);
  const [genres, setGenres] = useState([]);
  const [picks, setPicks] = useState([]);
  const [cityError, setCityError] = useState(false);

  // allCities already returns focus metros first, each with its real count.
  const cityList = domain.hasLocation ? allCities(domain.items) : [];

  const finish = (extra = {}) => {
    const favoriteItems = domain.items.filter((i) => picks.includes(i.id));
    const profile = buildInitialProfile(domain, { genres, favoriteItems, explore: 0.3, ...extra });
    onDone({ ...profile, cities }, { genres, picks, cities });
  };

  // The single gate every path to the deck goes through.
  const toDeck = () => {
    if (domain.hasLocation && cities.length === 0) { setCityError(true); setStep("city"); return; }
    setCityError(false);
    finish();
  };

  // A landing "just start swiping" still has to satisfy the city requirement.
  React.useEffect(() => {
    if (!autoQuickStart) return;
    onAutoQuickStart?.();
    toDeck();
  }, [autoQuickStart]);

  const Header = ({ eyebrow, title, sub }) => (
    <View style={{ marginBottom: 16 }}>
      <Text style={text.eyebrow}>{eyebrow}</Text>
      <Text style={[text.h1, { marginTop: 6, marginBottom: 6 }]}>{title}</Text>
      {sub ? <Text style={text.body}>{sub}</Text> : null}
    </View>
  );

  if (step === "intro") {
    return (
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 60 }}>
        <Header eyebrow={`Catalogue ${domain.catalogueNo}`} title={(domain.heroTitle || []).join(" ")} sub={domain.heroSub} />
        <View style={{ flexDirection: "row", gap: 10, marginVertical: 18 }}>
          {domain.items.slice(0, 3).map((i) => <Cover key={i.id} item={i} width={96} height={136} />)}
        </View>
        <Btn kind="primary" accent={accent.hl} label="Build my taste profile"
          onPress={() => setStep(domain.hasLocation ? "city" : "genres")} />
        <Btn style={{ marginTop: 10 }} label={`Skip setup — just show me ${domain.nounPlural}`} onPress={toDeck} accent={accent.hl} />
        <Text style={[text.catNo, { marginTop: 12, textAlign: "center" }]}>
          ~60 seconds · {domain.items.length} {domain.nounPlural} in the catalogue
        </Text>
      </ScrollView>
    );
  }

  if (step === "city") {
    return (
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 60 }}>
        <Header eyebrow="Step 1 · Where you eat" title={domain.locationTitle} sub={domain.locationSub} />
        {cityError && (
          <Text style={{ color: C.stamp, fontFamily: F.ui, fontSize: 13.5, fontWeight: "600", marginBottom: 10 }}>
            Pick at least one — a great restaurant you can't get to is no use to you.
          </Text>
        )}
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {cityList.map(({ city, count }) => (
            <Chip key={city} label={`${city} ${count}`} accent={accent.hl} on={cities.includes(city)}
              onPress={() => setCities((cs) => cs.includes(city) ? cs.filter((x) => x !== city) : [...cs, city])} />
          ))}
        </View>
        <Btn style={{ marginTop: 16 }} kind="primary" accent={accent.hl}
          label={`Open ${domain.name}`}
          onPress={() => { if (!cities.length) { setCityError(true); return; } setStep("genres"); }} />
      </ScrollView>
    );
  }

  if (step === "genres") {
    const all = [...new Set(domain.items.flatMap((i) => i.genres))].sort();
    return (
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 60 }}>
        <Header eyebrow="Step 2 · Taste" title={`What ${domain.genreLabel.toLowerCase()} pull you in?`}
          sub="Pick a few. You can skip this and let the swipes do the talking." />
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {all.slice(0, 24).map((g) => (
            <Chip key={g} label={g} accent={accent.hl} on={genres.includes(g)}
              onPress={() => setGenres((gs) => gs.includes(g) ? gs.filter((x) => x !== g) : [...gs, g])} />
          ))}
        </View>
        <Btn style={{ marginTop: 16 }} kind="primary" accent={accent.hl} label="Next" onPress={() => setStep("picks")} />
        <Btn style={{ marginTop: 10 }} label="Skip — start swiping" onPress={toDeck} accent={accent.hl} />
      </ScrollView>
    );
  }

  // picks
  const pool = domain.items
    .filter((i) => !genres.length || i.genres.some((g) => genres.includes(g)))
    .slice(0, 12);
  return (
    <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 60 }}>
      <Header eyebrow="Step 3 · Anchors" title="Any of these a favourite?"
        sub="Naming even one gives the engine something real to compare against." />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {pool.map((i) => {
          const on = picks.includes(i.id);
          return (
            <Pressable key={i.id} accessibilityRole="button" accessibilityState={{ selected: on }}
              onPress={() => setPicks((p) => p.includes(i.id) ? p.filter((x) => x !== i.id) : [...p, i.id])}
              style={{ opacity: on ? 1 : 0.75, borderWidth: on ? 3 : 0, borderColor: accent.hlDeep, borderRadius: 9 }}>
              <Cover item={i} width={96} height={136} />
            </Pressable>
          );
        })}
      </View>
      <Btn style={{ marginTop: 16 }} kind="primary" accent={accent.hl} label="Open my deck" onPress={toDeck} />
    </ScrollView>
  );
}
