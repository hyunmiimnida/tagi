import type { ColorValue } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

// 사이트(components/Icons.tsx)와 같은 선 아이콘
interface IconProps {
  size?: number;
  color: ColorValue;
  filled?: boolean;
  fillColor?: string; // 채운 아이콘 안쪽 선 색 (보통 배경색)
}

const base = { fill: "none", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const HomeIcon = ({ size = 24, color, filled }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      {...base}
      stroke={color}
      fill={filled ? color : "none"}
      d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"
    />
  </Svg>
);

export const ListIcon = ({ size = 24, color, filled, fillColor = "#fff" }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect {...base} stroke={color} fill={filled ? color : "none"} x={4} y={4} width={16} height={16} rx={3} />
    <Path {...base} stroke={filled ? fillColor : color} d="M8 9h8M8 12h8M8 15h5" />
  </Svg>
);

export const CalendarIcon = ({ size = 24, color, filled, fillColor = "#fff" }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect {...base} stroke={color} fill={filled ? color : "none"} x={4} y={5.5} width={16} height={14.5} rx={3} />
    <Path {...base} stroke={color} d="M8 3.5v4M16 3.5v4" />
    <Path {...base} stroke={filled ? fillColor : color} d="M4 10.5h16" />
  </Svg>
);

export const SearchIcon = ({ size = 20, color }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle {...base} stroke={color} cx={11} cy={11} r={6.5} />
    <Path {...base} stroke={color} d="m16 16 4 4" />
  </Svg>
);

export const ChevronIcon = ({ size = 18, color, dir = "right" }: IconProps & { dir?: "left" | "right" | "down" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      {...base}
      stroke={color}
      d={dir === "left" ? "m14.5 6-6 6 6 6" : dir === "down" ? "m6 9.5 6 6 6-6" : "m9.5 6 6 6-6 6"}
    />
  </Svg>
);

export const StarIcon = ({ size = 22, color, filled }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      {...base}
      strokeWidth={1.8}
      stroke={color}
      fill={filled ? color : "none"}
      d="m12 3.8 2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8z"
    />
  </Svg>
);

export const ExternalIcon = ({ size = 18, color }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path {...base} stroke={color} d="M14 5h5v5M19 5l-8 8" />
    <Path {...base} stroke={color} d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
  </Svg>
);
