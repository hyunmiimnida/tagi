import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { useColorScheme } from "react-native";
import { DataProvider, useData } from "@/data";
import { useColors } from "@/theme";

SplashScreen.preventAutoHideAsync();

// 데이터를 한 번 불러오면(저장된 것이든 새로 받은 것이든) 시작 화면을 닫는다
function HideSplashWhenReady() {
  const { loading } = useData();
  useEffect(() => {
    if (!loading) void SplashScreen.hideAsync();
  }, [loading]);
  return null;
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const c = useColors();
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;

  return (
    <ThemeProvider value={{ ...base, colors: { ...base.colors, background: c.bg, card: c.surface, text: c.text, border: c.line, primary: c.accent } }}>
      <DataProvider>
        <HideSplashWhenReady />
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShadowVisible: false, headerTitleStyle: { fontWeight: "700" }, headerBackButtonDisplayMode: "minimal" }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="programs/[id]" options={{ title: "" }} />
        </Stack>
      </DataProvider>
    </ThemeProvider>
  );
}
