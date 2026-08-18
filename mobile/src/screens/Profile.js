// Profile.js — the retention surfaces: streak, daily goal, milestones, the
// cross-domain panel, the explore dial, and the location preference.
// All the maths comes from the shared engine/stats.mjs.
import React from "react";
import { View, Text, ScrollView, Pressable, Alert } from "react-native";
import { computeStreak, recentDays, DAILY_GOAL, milestoneProgress, dayKey } from "../../../src/engine/stats.mjs";
import { allCities } from "../../../src/engine/location.mjs";
import { SOURCE_CREDITS, CREDITS_SUMMARY } from "../../../src/engine/credits.mjs";
import { C, F, text, accentFor, ACCENT, BORDER } from "../theme";
import { Card, Btn, Chip } from "../components/bits";

export default function Profile({ domain, profile, shelf, activity, states, domainKeys, domains,
                                  onSwitchDomain, onExplore, onCities, onReset }) {
  const accent = accentFor(domain.key);
  const today = dayKey(Date.now());
  const streak = computeStreak(activity, today);
  const days = recentDays(activity, today);
  const todayCount = activity?.[today] || 0;
  const sorted = Object.keys(shelf).length;
  const ms = milestoneProgress(sorted);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={text.eyebrow}>Your taste, so far</Text>
      <Text style={[text.h1, { marginTop: 6, marginBottom: 4 }]}>Profile</Text>

      {/* ---- streak ---- */}
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Text style={text.eyebrow}>Daily streak</Text>
            <Text style={[text.h2, { marginTop: 4 }]}>
              {streak.current} day{streak.current === 1 ? "" : "s"}
            </Text>
          </View>
          <Text style={text.catNo}>{todayCount}/{DAILY_GOAL} today</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 6, marginTop: 12 }}>
          {days.map((d) => (
            <View key={d.key} style={{
              flex: 1, height: 26, borderRadius: 6, borderWidth: 1.5, borderColor: C.ink,
              backgroundColor: d.count > 0 ? accent.hl : C.paper2,
              alignItems: "center", justifyContent: "center",
              ...(d.key === today ? { borderWidth: 3 } : null),
            }}>
              <Text style={{ fontFamily: F.mono, fontSize: 9, fontWeight: "700" }}>{d.count || ""}</Text>
            </View>
          ))}
        </View>
        <View style={{ marginTop: 12 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={text.catNo}>{ms.next ? `Next · ${ms.next.label}` : "Every milestone cleared"}</Text>
            <Text style={text.catNo}>{sorted}{ms.next ? `/${ms.next.at}` : ""}</Text>
          </View>
          <View style={{ height: 8, backgroundColor: C.paper2, borderWidth: 1.5, borderColor: C.line, borderRadius: 999, overflow: "hidden" }}>
            <View style={{ width: `${ms.pct}%`, height: "100%", backgroundColor: accent.hl }} />
          </View>
        </View>
      </Card>

      {/* ---- all five cravings ---- */}
      <Card>
        <Text style={[text.eyebrow, { marginBottom: 8 }]}>All five cravings</Text>
        {domainKeys.map((k) => {
          const st = states[k];
          const d = domains[k];
          const n = Object.keys(st.shelf || {}).length;
          const on = k === domain.key;
          return (
            <Pressable key={k} onPress={() => onSwitchDomain(k)} accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.line }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 10, height: 10, borderRadius: 3, borderWidth: 1.5, borderColor: C.ink, backgroundColor: ACCENT[k].hl }} />
                <Text style={{ fontFamily: F.ui, fontSize: 14, fontWeight: on ? "700" : "500" }}>{d.name}</Text>
              </View>
              <Text style={text.catNo}>
                {st.onboarded ? `${n} sorted` : "not started"}
              </Text>
            </Pressable>
          );
        })}
      </Card>

      {/* ---- explore dial ---- */}
      <Card>
        <Text style={[text.eyebrow, { marginBottom: 4 }]}>How far to stray</Text>
        <Text style={[text.catNo, { marginBottom: 10 }]}>
          This changes what surfaces, never the match percentage.
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {[["Stay aligned", 0.3], ["Expand my taste", 0.75]].map(([label, v]) => (
            <Btn key={label} style={{ flex: 1 }} accent={accent.hl}
              kind={(v < 0.55 ? profile.explore < 0.55 : profile.explore >= 0.55) ? "hl" : "ghost"}
              label={<Text style={{ fontFamily: F.ui, fontWeight: "700", fontSize: 13 }}>{label}</Text>}
              onPress={() => onExplore(v)} />
          ))}
        </View>
      </Card>

      {/* ---- location ---- */}
      {domain.hasLocation && (
        <Card>
          <Text style={[text.eyebrow, { marginBottom: 4 }]}>Where you eat</Text>
          <Text style={[text.catNo, { marginBottom: 10 }]}>Your deck only shows places in these cities.</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {allCities(domain.items).slice(0, 12).map(({ city, count }) => {
              const on = (profile.cities || []).includes(city);
              return (
                <Chip key={city} label={`${city} ${count}`} on={on} accent={accent.hl}
                  onPress={() => {
                    const cur = profile.cities || [];
                    const next = on ? cur.filter((c) => c !== city) : [...cur, city];
                    // Never let the last city be removed — an empty selection
                    // silently means "everywhere", which is the thing Table
                    // exists to avoid.
                    if (!next.length) { Alert.alert("Keep at least one city", "Your deck needs somewhere to look."); return; }
                    onCities(next);
                  }} />
              );
            })}
          </View>
        </Card>
      )}

      {/* Attribution is a licence CONDITION for several of these sources, not a
          courtesy — TMDB's disclaimer in particular is required verbatim. */}
      <Card>
        <Text style={[text.eyebrow, { marginBottom: 8 }]}>Where this comes from</Text>
        <Text style={[text.catNo, { marginBottom: 10, lineHeight: 15 }]}>{CREDITS_SUMMARY}</Text>
        {SOURCE_CREDITS.map((c) => (
          <View key={c.name} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.line }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
              <Text style={{ fontFamily: F.ui, fontSize: 13, fontWeight: "600" }}>{c.name}</Text>
              <Text style={[text.catNo, { flexShrink: 1, textAlign: "right" }]}>{c.provides}</Text>
            </View>
            {c.note ? <Text style={[text.catNo, { marginTop: 3, lineHeight: 14 }]}>{c.note}</Text> : null}
          </View>
        ))}
      </Card>

      {/* ---- reset ---- */}
      <Card>
        <Text style={[text.eyebrow, { marginBottom: 6 }]}>Start over</Text>
        <Text style={[text.catNo, { marginBottom: 10 }]}>
          Clears this craving's profile, library and streak. Nothing leaves your device either way.
        </Text>
        <Btn accent={accent.hl} label={`Reset ${domain.name}`} onPress={() => Alert.alert(
          `Reset ${domain.name}?`,
          `This deletes ${sorted} sorted ${domain.nounPlural}, your profile and your streak. It cannot be undone.`,
          [{ text: "Keep my data", style: "cancel" }, { text: "Reset", style: "destructive", onPress: onReset }],
        )} />
      </Card>
    </ScrollView>
  );
}
