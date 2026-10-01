import { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import { compareDeadline, isClosed } from "@shared/filter.ts";
import { SearchIcon } from "@/components/icons";
import { ProgramRow } from "@/components/program-row";
import { Divider, EmptyText } from "@/components/section";
import { todayString, useData } from "@/data";
import { radius, useColors } from "@/theme";

// 공고 목록. 지금은 검색만 있고, 학교·태그 필터는 다음 단계에서 붙인다
export default function ProgramsScreen() {
  const c = useColors();
  const { programs, refreshing, refresh } = useData();
  const [keyword, setKeyword] = useState("");
  const today = todayString();

  const visible = useMemo(() => {
    const word = keyword.trim().toLowerCase();
    return programs
      .filter((p) => !isClosed(p, today))
      .filter((p) => !word || `${p.title} ${p.organizer ?? ""}`.toLowerCase().includes(word))
      .sort((a, b) => compareDeadline(a, b, today));
  }, [programs, keyword, today]);

  return (
    <FlatList
      data={visible}
      keyExtractor={(item) => item.id}
      refreshing={refreshing}
      onRefresh={refresh}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={[styles.search, { backgroundColor: c.surface }]}>
            <SearchIcon color={c.text3} />
            <TextInput
              value={keyword}
              onChangeText={setKeyword}
              placeholder="공고명, 주최 기관 검색"
              placeholderTextColor={c.text3}
              style={[styles.input, { color: c.text }]}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>
          <Text style={[styles.count, { color: c.text2 }]}>
            공고 <Text style={{ color: c.text, fontWeight: "700" }}>{visible.length}</Text>개
          </Text>
        </View>
      }
      renderItem={({ item, index }) => (
        <View
          style={[
            { backgroundColor: c.surface, marginHorizontal: 16 },
            index === 0 && styles.first,
            index === visible.length - 1 && styles.last,
          ]}
        >
          {index > 0 && <Divider />}
          <ProgramRow program={item} today={today} />
        </View>
      )}
      ListEmptyComponent={<EmptyText>조건에 맞는 공고가 없어요.</EmptyText>}
      contentContainerStyle={{ paddingBottom: 24 }}
    />
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12, gap: 12 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radius.chip + 4, paddingHorizontal: 14, height: 48 },
  input: { flex: 1, fontSize: 16 },
  count: { fontSize: 14, paddingHorizontal: 4 },
  first: { borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, paddingTop: 4 },
  last: { borderBottomLeftRadius: radius.card, borderBottomRightRadius: radius.card, paddingBottom: 4 },
});
