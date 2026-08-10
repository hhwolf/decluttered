// ForYou.js — the seven suggestion mechanisms, each saying why it exists.
// Rows come from the shared engine/suggest.mjs, so web and native surface the
// same things for the same reasons.
//
// Row contract, taken from the engine rather than assumed: `row.items` is an
// array of plain catalogue items (not {item, score} pairs) and the mechanism
// label lives on `row.mechanism`. Getting that wrong crashed the screen on
// first render, which is why there are tests for it now.
import React, { useMemo } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { buildSuggestionRows } from "../../../src/engine/suggest.mjs";
import { scoreItem } from "../../../src/engine/engine.mjs";
import { C, F, text, accentFor } from "../theme";
import { Cover, ExtRating, matchTag, displayScore } from "../components/bits";

const MECHANISM_LABEL = {
  pattern: "taste match", priority: "your priorities", consensus: "crowd acclaim",
  gems: "hidden gems", mood: "mood", stretch: "anti-pattern", goal: "your goal",
};

function SugCard({ domain, item, profile, onOpen }) {
  const s = scoreItem(item, profile, domain);
  const tag = matchTag(s.score);
  return (
    <Pressable onPress={() => onOpen(item)} accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${displayScore(s.score)} percent match`}
      style={{ width: 112, marginRight: 12 }}>
      <Cover item={item} width={112} height={158} />
      <Text numberOfLines={2} style={{ fontFamily: F.display, fontWeight: "700", fontSize: 13, lineHeight: 15, marginTop: 5 }}>
        {item.title}
      </Text>
      <Text numberOfLines={1} style={text.catNo}>{item.subtitle}</Text>
      <Text style={[text.catNo, { color: tag.c, fontWeight: "700" }]}>{displayScore(s.score)}% · {tag.t}</Text>
      <ExtRating item={item} compact />
    </Pressable>
  );
}

export default function ForYou({ domain, profile, shelf, onOpen }) {
  const rows = useMemo(
    () => buildSuggestionRows(domain.items, profile, domain, { excludeIds: Object.keys(shelf) }),
    [domain, profile, shelf]
  );
  const accent = accentFor(domain.key);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={text.eyebrow}>Suggested, with reasons</Text>
      <Text style={[text.h1, { marginTop: 6 }]}>For you</Text>
      <Text style={[text.body, { marginBottom: 6 }]}>
        Seven different mechanisms, not one algorithm — every row says why it exists.
      </Text>

      {rows.length === 0 && (
        <Text style={[text.body, { marginTop: 24, textAlign: "center" }]}>
          You've sorted the whole catalogue — nothing left to suggest.
        </Text>
      )}

      {rows.map((row) => (
        <View key={row.key} style={{ marginTop: 18 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
            <Text style={[text.h2, { fontSize: 17, flexShrink: 1 }]} numberOfLines={1}>{row.title}</Text>
            <View style={{ backgroundColor: accent.hl, borderWidth: 1.5, borderColor: C.ink, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1, marginLeft: 8 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 8.5, fontWeight: "700", textTransform: "uppercase" }}>
                {MECHANISM_LABEL[row.mechanism] || row.mechanism}
              </Text>
            </View>
          </View>
          <Text style={[text.catNo, { marginBottom: 9, lineHeight: 15 }]}>{row.reason}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {row.items.map((it) => (
              <SugCard key={it.id} domain={domain} item={it} profile={profile} onOpen={onOpen} />
            ))}
          </ScrollView>
        </View>
      ))}
    </ScrollView>
  );
}
