import { Tabs } from "expo-router";
import { CalendarIcon, HomeIcon, ListIcon } from "@/components/icons";
import { useColors } from "@/theme";

// 하단 탭: 홈 · 공고 · 캘린더 (사이트의 하단 탭 바와 같은 구성)
export default function TabLayout() {
  const c = useColors();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.text,
        tabBarInactiveTintColor: c.text3,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        headerStyle: { backgroundColor: c.bg },
        headerShadowVisible: false,
        headerTitleStyle: { fontSize: 20, fontWeight: "700", color: c.text },
        headerTitleAlign: "left",
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "홈",
          headerTitle: "캠퍼스모아",
          tabBarIcon: ({ color, focused }) => <HomeIcon color={color} filled={focused} />,
        }}
      />
      <Tabs.Screen
        name="programs"
        options={{
          title: "공고",
          tabBarIcon: ({ color, focused }) => <ListIcon color={color} filled={focused} fillColor={c.surface} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: "캘린더",
          tabBarIcon: ({ color, focused }) => <CalendarIcon color={color} filled={focused} fillColor={c.surface} />,
        }}
      />
    </Tabs>
  );
}
