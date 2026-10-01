import { useColorScheme } from "react-native";

// 사이트(app/globals.css)와 같은 색. 토스·노션처럼 회색 바탕 위 흰 카드, 강조색은 파랑과 마감 빨강
const light = {
  bg: "#f2f4f6",
  surface: "#ffffff",
  surface2: "#f9fafb",
  text: "#191f28",
  text2: "#4e5968",
  text3: "#8b95a1",
  line: "#e5e8eb",
  accent: "#3182f6",
  accentSoft: "#e8f3ff",
  warn: "#f04452",
  warnSoft: "#ffeeee",
  star: "#ffb800",
};

const dark: typeof light = {
  bg: "#101113",
  surface: "#1c1d20",
  surface2: "#232428",
  text: "#f2f3f5",
  text2: "#c3c7ce",
  text3: "#8b919a",
  line: "#2c2e33",
  accent: "#4c94ff",
  accentSoft: "#1a2a44",
  warn: "#ff5c6c",
  warnSoft: "#3a1d22",
  star: "#ffb800",
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === "dark" ? dark : light;
}

export const radius = { card: 20, chip: 10, badge: 6 };
