import { Stack, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { describeTarget, formatPeriod } from "@shared/filter.ts";
import { ExternalIcon } from "@/components/icons";
import { EmptyText, Section } from "@/components/section";
import { useData } from "@/data";
import { radius, useColors } from "@/theme";

// 공고 상세 (지난 공고·댓글·관심 표시는 다음 단계에서 붙인다)
export default function ProgramScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { programs, meta } = useData();
  const program = programs.find((p) => p.id === id);

  if (!program) {
    return (
      <View style={{ flex: 1, paddingTop: 16 }}>
        <Section>
          <EmptyText>공고를 찾지 못했어요. 마감되어 목록에서 빠졌을 수 있어요.</EmptyText>
        </Section>
      </View>
    );
  }

  const year = new Date().getFullYear();
  const schoolNames = Object.fromEntries((meta?.schools ?? []).map((s) => [s.id, s.name]));
  const rows: [string, string | null][] = [
    ["모집 기간", formatPeriod(program.recruitPeriod, year)],
    ["활동 기간", formatPeriod(program.activityPeriod, year)],
    ["모집 대상", describeTarget(program, schoolNames)],
    ["주최", program.organizer && `${program.organizer}${program.organizerType ? ` (${program.organizerType})` : ""}`],
  ];
  // 원문은 출처마다 하나씩, http(s) 주소만
  const links = program.links
    .filter((l) => /^https?:\/\//.test(l.url))
    .filter((l, i, all) => all.findIndex((x) => x.sourceId === l.sourceId) === i);

  return (
    <>
      <Stack.Screen options={{ title: "" }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.head}>
          <Text style={{ color: c.text3, fontSize: 15, fontWeight: "600" }}>{program.organizer ?? "주최 미확인"}</Text>
          <Text style={[styles.title, { color: c.text }]}>{program.title}</Text>
        </View>
        <Section>
          {rows.map(([label, value]) => (
            <View key={label} style={styles.infoRow}>
              <Text style={[styles.label, { color: c.text3 }]}>{label}</Text>
              <Text style={[styles.value, { color: value ? c.text : c.text3 }]}>{value ?? "원문에서 확인해 주세요"}</Text>
            </View>
          ))}
        </Section>
      </ScrollView>
      <View style={[styles.cta, { backgroundColor: c.bg }]}>
        {links.map((link, index) => (
          <Pressable
            key={link.url}
            onPress={() => WebBrowser.openBrowserAsync(link.url)}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: index === 0 ? c.accent : c.surface, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={{ color: index === 0 ? "#fff" : c.text, fontSize: 17, fontWeight: "700" }}>
              {links.length > 1 ? `${meta?.sourceNames[link.sourceId] ?? link.sourceId}에서 보기` : "원문에서 신청하기"}
            </Text>
            <ExternalIcon color={index === 0 ? "#fff" : c.text} />
          </Pressable>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20, gap: 6 },
  title: { fontSize: 24, fontWeight: "800", lineHeight: 33, letterSpacing: -0.6 },
  infoRow: { flexDirection: "row", paddingHorizontal: 20, paddingVertical: 12, gap: 12 },
  label: { width: 72, fontSize: 15 },
  value: { flex: 1, fontSize: 15, fontWeight: "600" },
  cta: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 28, gap: 8 },
  button: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 56, borderRadius: radius.card - 4 },
});
