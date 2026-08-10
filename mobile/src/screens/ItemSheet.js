// ============================================================================
// ItemSheet.js — the full record for one item, as a native modal sheet.
//
// Carries every honesty rule the web sheet earned: reception is attributed and
// never presented as ours, Wikipedia readership and Deezer reach are labelled
// as attention rather than approval, and a duplicate pull-quote is dropped so
// two outlets can't look like one repeating itself.
// ============================================================================
import React from "react";
import { View, Text, Modal, ScrollView, Pressable, Linking, SafeAreaView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { scoreItem } from "../../../src/engine/engine.mjs";
import {
  vibeWords, strengths, counterpoint, commitment, factChips, castLine,
  creditLine, distinctQuotes, timeCommitment, similarTo, lookupLinks,
} from "../../../src/engine/describe.mjs";
import { C, F, text, accentFor, BORDER } from "../theme";
import { Cover, ExtRating, VibeChip, Card, Btn, matchTag, displayScore } from "../components/bits";

const LINK_LABELS = {
  imdb: "IMDb", tvmaze: "TVMaze", deezer: "Deezer", appleMusic: "Apple Music",
  openLibrary: "Open Library", google: "Google Maps",
};

function Bar({ value, accent }) {
  return (
    <View style={{ height: 8, backgroundColor: C.paper2, borderWidth: 1.5, borderColor: C.line, borderRadius: 999, overflow: "hidden" }}>
      <View style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: "100%", backgroundColor: accent }} />
    </View>
  );
}

function WhatOthersSay({ item }) {
  const r = item.rating;
  const scale = r?.scale || (r?.source === "Deezer" ? 100 : 5);
  const pct = r?.value != null ? Math.round((r.value / scale) * 100) : null;
  const rec = item.reception;
  const isInterest = r?.source === "Wikipedia";
  const isPopularity = scale === 100 && !isInterest;
  const quotes = distinctQuotes(rec);
  if (!r?.value && !rec) return null;

  return (
    <Card>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
        <Text style={text.eyebrow}>What others say</Text>
        {/* Deezer stores its raw rank in `count`, not a tally of ratings. */}
        {r?.count > 0 && !isPopularity && (
          <Text style={text.catNo}>{r.count.toLocaleString()} {isInterest ? "readers/mo" : "ratings"}</Text>
        )}
      </View>
      {pct != null && (
        <View style={{ marginBottom: rec ? 14 : 0 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={{ fontFamily: F.ui, fontSize: 13.5, fontWeight: "500" }}>
              {isInterest ? "Reader interest" : isPopularity ? "Popularity" : "Average rating"} · {r.source}
            </Text>
            <Text style={text.catNo}>{scale === 100 ? `${r.value}/100` : `${r.value}/${scale}`}</Text>
          </View>
          <Bar value={pct} accent={C.slate} />
          <Text style={[text.catNo, { marginTop: 5, lineHeight: 15 }]}>
            {isInterest
              ? `How often people look this place up — roughly ${(r.count || 0).toLocaleString()} readers a month. It measures fame, not whether the food is good.`
              : isPopularity
              ? `How widely ${r.source} is playing this right now, scored out of 100 — reach, not quality.`
              : pct >= 90 ? "Near-universal approval." : pct >= 80 ? "Strongly liked by the crowd."
              : pct >= 70 ? "Well liked, with some dissent." : pct >= 55 ? "Mixed but positive."
              : "Divisive — read the reviews before committing."}
          </Text>
        </View>
      )}
      {rec?.summary && (
        <View style={{ borderTopWidth: pct != null ? 1 : 0, borderTopColor: C.line, paddingTop: pct != null ? 12 : 0 }}>
          <Text style={[text.eyebrow, { marginBottom: 6 }]}>Critical reception</Text>
          <Text style={[text.serif, { fontSize: 14.5, lineHeight: 21, color: C.ink2 }]}>{rec.summary}</Text>
          {quotes.map((q, i) => (
            <View key={i} style={{ marginTop: 10, paddingLeft: 10, borderLeftWidth: 3, borderLeftColor: C.hl }}>
              <Text style={[text.serif, { fontSize: 13.5, lineHeight: 19 }]}>{q.text}</Text>
              {q.outlet ? <Text style={text.catNo}>— via {q.outlet}</Text> : null}
            </View>
          ))}
          <Text style={[text.catNo, { marginTop: 8 }]}>Summarized from Wikipedia (CC BY-SA), not written by us.</Text>
        </View>
      )}
    </Card>
  );
}

export default function ItemSheet({ domain, item, profile, onAction, onRate, onClose, onOpenItem }) {
  if (!item) return null;
  const s = profile ? scoreItem(item, profile, domain) : null;
  const tag = s ? matchTag(s.score) : null;
  const accent = accentFor(domain.key);
  const vibe = vibeWords(item, domain);
  const facts = factChips(item, domain);
  const strong = strengths(item, domain);
  const cast = castLine(item, { max: 4 });
  const credit = creditLine(item);
  const caveat = s ? counterpoint(item, domain, profile, s.breakdown) : null;
  const anchor = s?.bestAnchorId ? domain.items.find((i) => i.id === s.bestAnchorId) : null;
  const alike = similarTo(item, domain);
  const lookups = lookupLinks(item, domain);
  const links = Object.entries(item.links || {}).filter(([k, v]) => v && k !== "preview" && LINK_LABELS[k]);
  const hours = timeCommitment(item, domain);

  const rows = [
    [{ books: "Author", movies: "Released", tv: "Network", music: "Artist", restaurants: "Where" }[domain.key], item.subtitle],
    item.year && String(item.year) !== item.subtitle && domain.key !== "restaurants" &&
      [{ books: "First published", movies: "Year", tv: "Premiered", music: "Released", restaurants: "Opened" }[domain.key], String(item.year)],
    item.meta && [{ books: "Length", movies: "Runtime", tv: "Episodes", music: "Duration", restaurants: "Price" }[domain.key], item.meta],
    item.dish && ["Known for", item.dish],
    item.cast?.length && ["Cast", item.cast.join(", ")],
    item.directors?.length && ["Director" + (item.directors.length > 1 ? "s" : ""), item.directors.join(", ")],
    [domain.genreLabel, (item.genres || []).join(", ")],
  ].filter((r) => r && r[0] && r[1]);

  const act = (a) => { onAction(item, a); onClose(); };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.paper }}>
        <View style={{ flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 16, paddingTop: 8 }}>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close"
            hitSlop={12} style={{ padding: 6 }}>
            <Feather name="x" size={22} color={C.ink} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
          <View style={{ flexDirection: "row", gap: 14 }}>
            <Cover item={item} width={104} height={148} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 5 }}>
                {(item.genres || []).map((g) => (
                  <View key={g} style={{ borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8, marginRight: 5, marginBottom: 4 }}>
                    <Text style={text.catNo}>{g}</Text>
                  </View>
                ))}
              </View>
              <Text style={[text.h2, { fontSize: 20 }]}>{item.title}</Text>
              <Text style={[text.catNo, { marginTop: 3 }]}>
                {item.subtitle}
                {item.year && domain.key !== "restaurants" && String(item.year) !== item.subtitle ? ` · ${item.year}` : ""}
                {item.meta ? ` · ${item.meta}` : ""}
              </Text>
              <View style={{ marginTop: 6 }}><ExtRating item={item} /></View>
              {commitment(item) ? <Text style={[text.catNo, { marginTop: 4 }]}>{commitment(item)}</Text> : null}
              {hours ? (
                <Text style={[text.catNo, { marginTop: 4, fontWeight: "700", color: C.ink }]}>◷ {hours}</Text>
              ) : null}
              {item.dish ? <Text style={[text.catNo, { marginTop: 5 }]}>Known for · {item.dish}</Text> : null}
              {cast ? <Text style={[text.catNo, { marginTop: 5 }]}>With {cast}</Text> : null}
              {credit ? <Text style={[text.catNo, { marginTop: 3 }]}>{credit}</Text> : null}
              <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 7 }}>
                {vibe.map((w) => <VibeChip key={w} label={w} />)}
                {facts.map((f) => <VibeChip key={f} label={f} fact />)}
              </View>
            </View>
          </View>

          {s && (
            <Card>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
                <Text style={text.eyebrow}>Why it matches</Text>
                <Text style={[text.catNo, { color: tag.c, fontWeight: "700" }]}>{displayScore(s.score)}% · {tag.t}</Text>
              </View>
              {[
                [`${domain.genreLabel.replace(/s$/, "")} fit`, s.breakdown.genre],
                ["Matches what you weigh", s.breakdown.factor],
                ["Mood match", s.breakdown.tone],
                [`Like ${domain.nounPlural} you loved`, s.breakdown.similar],
              ].map(([label, v]) => (
                <View key={label} style={{ marginBottom: 9 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
                    <Text style={{ fontFamily: F.ui, fontSize: 13 }}>{label}</Text>
                    <Text style={text.catNo}>{v}</Text>
                  </View>
                  <Bar value={v} accent={accent.hl} />
                </View>
              ))}
              {strong.length > 0 && (
                <Text style={[text.body, { marginTop: 4 }]}>Strongest on {strong.join(" and ")}.</Text>
              )}
              {anchor && (
                <Text style={[text.catNo, { marginTop: 8 }]}>
                  ✦ Because you liked <Text style={{ color: C.ink, fontWeight: "700" }}>{anchor.title}</Text>
                </Text>
              )}
              {caveat && <Text style={[text.catNo, { marginTop: 6, color: C.stamp }]}>Heads up · {caveat}</Text>}
            </Card>
          )}

          <Card><Text style={[text.serif, { fontSize: 15, lineHeight: 22, color: C.ink2 }]}>{item.blurb}</Text></Card>

          <WhatOthersSay item={item} />

          <Card>
            <Text style={[text.eyebrow, { marginBottom: 10 }]}>The details</Text>
            {rows.map(([k, v]) => (
              <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", gap: 14, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.line }}>
                <Text style={text.catNo}>{k}</Text>
                <Text style={{ fontFamily: F.ui, fontSize: 13, flexShrink: 1, textAlign: "right" }}>{v}</Text>
              </View>
            ))}
          </Card>

          {alike.length > 0 && (
            <Card>
              <Text style={[text.eyebrow, { marginBottom: 8 }]}>More like this</Text>
              {alike.map(({ item: other }) => (
                <Pressable key={other.id} onPress={() => onOpenItem?.(other)} accessibilityRole="button"
                  style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.line }}>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ fontFamily: F.ui, fontSize: 13.5, fontWeight: "600" }}>{other.title}</Text>
                    <Text numberOfLines={1} style={text.catNo}>{other.subtitle}</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={C.muted} />
                </Pressable>
              ))}
            </Card>
          )}

          {(links.length > 0 || lookups.length > 0) && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 14, gap: 14 }}>
              {[...links.map(([k, v]) => ({ label: LINK_LABELS[k], url: v })), ...lookups].map((l) => (
                <Pressable key={l.url} onPress={() => Linking.openURL(l.url)} accessibilityRole="link">
                  <Text style={[text.catNo, { textDecorationLine: "underline" }]}>{l.label} ↗</Text>
                </Pressable>
              ))}
            </View>
          )}

          <View style={{ flexDirection: "row", gap: 8, marginTop: 20 }}>
            <Btn style={{ flex: 1 }} label={domain.actions.pass} onPress={() => act("pass")} accent={accent.hl} />
            <Btn style={{ flex: 1 }} label={domain.actions.consumedShort} onPress={() => act("consumed")} accent={accent.hl} />
            <Btn style={{ flex: 1 }} kind="primary" accent={accent.hl}
              label={<Text style={{ fontFamily: F.ui, fontWeight: "700", fontSize: 14, color: C.paper }}>{domain.actions.want}</Text>}
              onPress={() => act("want")} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
