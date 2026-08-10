// Library.js — everything sorted, with search and the three status tabs.
import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput } from "react-native";
import { Feather } from "@expo/vector-icons";
import { C, F, text, accentFor, BORDER } from "../theme";
import { Cover, ExtRating } from "../components/bits";

export default function Library({ domain, shelf, onMove, onRemove, onOpen }) {
  const [tab, setTab] = useState("want");
  const [q, setQ] = useState("");
  const accent = accentFor(domain.key);

  const entries = useMemo(() => {
    const byId = new Map(domain.items.map((i) => [i.id, i]));
    return Object.entries(shelf)
      .map(([id, e]) => ({ ...e, item: byId.get(id) }))
      .filter((e) => e.item && e.status === tab)
      .filter((e) => !q || `${e.item.title} ${e.item.subtitle}`.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  }, [domain, shelf, tab, q]);

  const tabs = [
    ["want", domain.libraryTabs.want],
    ["consumed", domain.libraryTabs.consumed],
    ["pass", domain.libraryTabs.pass],
  ];
  const countFor = (k) => Object.values(shelf).filter((e) => e.status === k).length;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Text style={text.eyebrow}>Everything you've sorted</Text>
      <Text style={[text.h1, { marginTop: 6, marginBottom: 12 }]}>Library</Text>

      <View style={{ flexDirection: "row", borderWidth: BORDER, borderColor: C.line, borderRadius: 11, overflow: "hidden", marginBottom: 12 }}>
        {tabs.map(([k, label]) => (
          <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab"
            accessibilityState={{ selected: tab === k }}
            style={{ flex: 1, paddingVertical: 9, alignItems: "center", backgroundColor: tab === k ? accent.hl : C.card }}>
            <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: 9.5, fontWeight: "700", textTransform: "uppercase" }}>
              {label} {countFor(k)}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, borderWidth: BORDER, borderColor: C.line,
        borderRadius: 11, paddingHorizontal: 12, backgroundColor: C.card, marginBottom: 14 }}>
        <Feather name="search" size={14} color={C.muted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search your library"
          placeholderTextColor={C.muted} accessibilityLabel="Search your library"
          style={{ flex: 1, paddingVertical: 10, fontFamily: F.ui, fontSize: 14, color: C.ink }} />
      </View>

      {entries.length === 0 ? (
        <Text style={[text.body, { textAlign: "center", marginTop: 30 }]}>
          {q ? "Nothing matches that." : `Nothing here yet — swipe a few ${domain.nounPlural}.`}
        </Text>
      ) : entries.map(({ item, rating }) => (
        <Pressable key={item.id} onPress={() => onOpen(item)} accessibilityRole="button"
          style={{ flexDirection: "row", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
          <Cover item={item} width={54} height={76} radius={5} />
          <View style={{ flex: 1, justifyContent: "center" }}>
            <Text numberOfLines={2} style={{ fontFamily: F.display, fontWeight: "700", fontSize: 15 }}>{item.title}</Text>
            <Text numberOfLines={1} style={text.catNo}>{item.subtitle}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 3 }}>
              <ExtRating item={item} compact />
              {rating ? <Text style={text.catNo}>{"★".repeat(rating)}</Text> : null}
            </View>
          </View>
          <View style={{ justifyContent: "center", gap: 6 }}>
            {tab !== "consumed" && (
              <Pressable onPress={() => onMove(item.id, "consumed")} hitSlop={8} accessibilityRole="button"
                accessibilityLabel={`Mark ${item.title} as ${domain.libraryTabs.consumed}`}>
                <Feather name="check" size={17} color={C.ink} />
              </Pressable>
            )}
            <Pressable onPress={() => onRemove(item.id)} hitSlop={8} accessibilityRole="button"
              accessibilityLabel={`Remove ${item.title}`}>
              <Feather name="trash-2" size={16} color={C.muted} />
            </Pressable>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}
