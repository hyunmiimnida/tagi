import { Link } from "expo-router";
import { Fragment, useMemo } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { compareDeadline, daysUntil, isClosed, isNew } from "@shared/filter.ts";
import { ChevronIcon } from "@/components/icons";
import { ProgramRow } from "@/components/program-row";
import { Divider, EmptyText, Section } from "@/components/section";
import { todayString, useData } from "@/data";
import { radius, useColors } from "@/theme";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

// 홈: 오늘의 요약과 마감 임박 공고
export default function HomeScreen() {
  const c = useColors();
  const { programs, refreshing, refresh, error } = useData();
  const today = todayString();

  const open = useMemo(() => programs.filter((p) => !isClosed(p, today)), [programs, today]);
  const closingSoon = useMemo(
    () =>
      open
        .filter((p) => p.recruitPeriod.end && daysUntil(p.recruitPeriod.end, today) <= 7)
        .sort((a, b) => compareDeadline(a, b, today)),
    [open, today],
  );
  const fresh = useMemo(() => open.filter((p) => isNew(p, today)), [open, today]);

  const date = new Date();
  const stats = [
    { label: "마감 임박", value: closingSoon.length, color: c.warn },
    { label: "새 공고", value: fresh.length, color: c.text },
  ];

  return (
    <ScrollView
      contentContainerStyle={{ paddingTop: 4, paddingBottom: 24 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      <Section style={{ paddingVertical: 20 }}>
        <View style={{ paddingHorizontal: 20, gap: 4 }}>
          <Text style={{ color: c.text3, fontSize: 14, fontWeight: "600" }}>
            {date.getMonth() + 1}월 {date.getDate()}일 {WEEKDAYS[date.getDay()]}요일
          </Text>
          <Text style={[styles.hero, { color: c.text }]}>
            지금 지원할 수 있는 공고{"\n"}
            <Text style={{ color: c.accent }}>{open.length}개</Text>가 있어요
          </Text>
        </View>
        <View style={styles.stats}>
          {stats.map((s) => (
            <View key={s.label} style={[styles.stat, { backgroundColor: c.surface2 }]}>
              <Text style={{ color: c.text3, fontSize: 13 }}>{s.label}</Text>
              <Text style={{ color: s.color, fontSize: 22, fontWeight: "800" }}>{s.value}</Text>
            </View>
          ))}
        </View>
        {error && <Text style={{ color: c.warn, paddingHorizontal: 20, marginTop: 12 }}>{error} · 아래로 당겨 다시 시도</Text>}
      </Section>

      <Section
        title="놓치기 전에, 마감 임박"
        right={
          <Link href="/programs" style={{ paddingVertical: 4 }}>
            <Text style={{ color: c.text3, fontSize: 14 }}>
              전체 보기 <ChevronIcon size={12} color={c.text3} />
            </Text>
          </Link>
        }
      >
        {closingSoon.length === 0 ? (
          <EmptyText>일주일 안에 마감되는 공고가 없어요.</EmptyText>
        ) : (
          closingSoon.slice(0, 5).map((program, index) => (
            <Fragment key={program.id}>
              {index > 0 && <Divider />}
              <ProgramRow program={program} today={today} compact />
            </Fragment>
          ))
        )}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { fontSize: 24, fontWeight: "800", lineHeight: 33, letterSpacing: -0.6 },
  stats: { flexDirection: "row", gap: 8, paddingHorizontal: 20, marginTop: 18 },
  stat: { flex: 1, borderRadius: radius.chip + 4, padding: 14, gap: 4 },
});
