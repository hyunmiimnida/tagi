import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { daysUntil, formatPeriod, isClosed, isNew } from "@shared/filter.ts";
import type { ProgramView } from "@shared/filter.ts";
import { radius, useColors } from "@/theme";

// 남은 날을 배지로. 마감일을 모르면 표시하지 않는다 (사이트 DdayBadge와 같은 규칙)
export function DdayBadge({ program, today }: { program: ProgramView; today: string }) {
  const c = useColors();
  const end = program.recruitPeriod.end;
  if (!end) return null;
  const left = daysUntil(end, today);
  const urgent = left >= 0 && left <= 3;
  const label = left < 0 ? "마감" : left === 0 ? "오늘 마감" : `D-${left}`;
  return (
    <View style={[styles.badge, { backgroundColor: left < 0 ? c.surface2 : urgent ? c.warnSoft : c.accentSoft }]}>
      <Text style={[styles.badgeText, { color: left < 0 ? c.text3 : urgent ? c.warn : c.accent }]}>{label}</Text>
    </View>
  );
}

// 공고 한 줄. 누르면 상세로 간다
export function ProgramRow({ program, today, compact = false }: { program: ProgramView; today: string; compact?: boolean }) {
  const c = useColors();
  const year = Number(today.slice(0, 4));
  const recruit = formatPeriod(program.recruitPeriod, year);
  const activity = formatPeriod(program.activityPeriod, year);
  const tags = program.tags.filter((tag) => tag !== program.organizerType);
  const closed = isClosed(program, today);

  return (
    <Pressable
      onPress={() => router.push({ pathname: "/programs/[id]", params: { id: program.id } })}
      style={({ pressed }) => ({ opacity: closed ? 0.5 : pressed ? 0.6 : 1 })}
    >
      <View style={styles.row}>
        <View style={styles.meta}>
          {isNew(program, today) && <View style={[styles.newDot, { backgroundColor: c.warn }]} />}
          {program.schoolLabels.map((label) => (
            <Text key={label} style={[styles.chipText, styles.school, { color: c.accent, backgroundColor: c.accentSoft }]}>
              {label}
            </Text>
          ))}
          <Text numberOfLines={1} style={[styles.organizer, { color: c.text3 }]}>
            {program.organizer ?? "주최 미확인"}
          </Text>
          {program.organizerType && (
            <Text style={[styles.chipText, { color: c.text3, backgroundColor: c.surface2 }]}>{program.organizerType}</Text>
          )}
        </View>
        <Text style={[styles.title, { color: c.text }]}>{program.title}</Text>
        <View style={styles.dates}>
          <DdayBadge program={program} today={today} />
          <Text style={[styles.dateText, { color: c.text2 }]}>{recruit ? `모집 ${recruit}` : "모집 일정은 원문 확인"}</Text>
          {!compact && activity && <Text style={[styles.dateText, { color: c.text3 }]}>활동 {activity}</Text>}
        </View>
        {!compact && tags.length > 0 && (
          <View style={styles.tags}>
            {tags.map((tag) => (
              <Text key={tag} style={[styles.tag, { color: c.text2, backgroundColor: c.surface2 }]}>
                {tag}
              </Text>
            ))}
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 20, paddingVertical: 16, gap: 6 },
  meta: { flexDirection: "row", alignItems: "center", gap: 6 },
  newDot: { width: 6, height: 6, borderRadius: 3 },
  chipText: { fontSize: 12, fontWeight: "600", paddingHorizontal: 6, borderRadius: radius.badge, overflow: "hidden" },
  school: { fontWeight: "700" },
  organizer: { flexShrink: 1, fontSize: 13, fontWeight: "500" },
  title: { fontSize: 17, fontWeight: "700", lineHeight: 24, letterSpacing: -0.3 },
  dates: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 8, rowGap: 4 },
  dateText: { fontSize: 14 },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.badge },
  badgeText: { fontSize: 13, fontWeight: "700" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  tag: { fontSize: 12, fontWeight: "600", paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.badge, overflow: "hidden" },
});
