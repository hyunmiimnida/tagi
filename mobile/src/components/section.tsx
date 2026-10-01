import { StyleSheet, Text, View } from "react-native";
import type { ViewStyle } from "react-native";
import { radius, useColors } from "@/theme";

// 흰 카드 하나. 제목이 있으면 카드 위쪽에 큰 글씨로 보여 준다
export function Section({ title, right, children, style }: { title?: string; right?: React.ReactNode; children: React.ReactNode; style?: ViewStyle }) {
  const c = useColors();
  return (
    <View style={[styles.card, { backgroundColor: c.surface }, style]}>
      {title && (
        <View style={styles.head}>
          <Text style={[styles.title, { color: c.text }]}>{title}</Text>
          {right}
        </View>
      )}
      {children}
    </View>
  );
}

// 카드 안 줄 사이 구분선
export function Divider() {
  const c = useColors();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.line, marginHorizontal: 20 }} />;
}

export function EmptyText({ children }: { children: React.ReactNode }) {
  const c = useColors();
  return <Text style={[styles.empty, { color: c.text3 }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, paddingVertical: 8, marginHorizontal: 16, marginBottom: 12, overflow: "hidden" },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 },
  title: { fontSize: 19, fontWeight: "700", letterSpacing: -0.4 },
  empty: { paddingHorizontal: 20, paddingVertical: 16, fontSize: 15 },
});
