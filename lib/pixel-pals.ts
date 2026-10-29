// 도트 캐릭터(중세 마법 RPG 2등신): 마법사·기사·궁수·성직자.
// 그림은 글자 지도로 그린다: 글자 하나 = 픽셀 하나, "." = 투명. 색은 app/globals.css의 --px-* 변수.
// 자세: sit(앉아서 다리를 늘어뜨림, 16×17) · peek(카드 모서리를 두 손으로 잡고 고개만 내밂, 16×14)

import { EFFECT_COLORS } from "./pixel-effects.ts";
import { WEAPON_SPRITES, poseOf } from "./weapon-sprites.ts";
import { WEAPONS, upgradeWeaponId } from "./weapons.ts";
import type { WeaponId } from "./weapons.ts";

export type PalName = "wizard" | "knight" | "ranger" | "cleric";
export type PalPose = "sit" | "peek";
export type PalBubble = "question" | "exclaim";

export const PAL_WIDTH = 16;
export const BUBBLE_WIDTH = 7; // 말풍선이 있으면 오른쪽으로 이만큼 넓어진다
export const PAL_HEIGHT: Record<PalPose, number> = { sit: 17, peek: 14 };

// 글자 → 색 변수 이름 (--px-…)
export const PAL_COLORS: Record<string, string> = {
  K: "line", // 외곽선·눈·입
  S: "skin",
  P: "blush",
  W: "shine", // 눈 반짝이
  H: "violet",
  h: "violet-dark",
  Y: "gold",
  t: "boot",
  M: "steel",
  m: "steel-dark",
  C: "red",
  N: "green",
  T: "leather",
  B: "white",
  b: "white-dark",
  "#": "shine", // 말풍선 바탕
  // 이펙트 전용 색 (lib/pixel-effects.ts)
  ...Object.fromEntries(Object.entries(EFFECT_COLORS).map(([letter, [name]]) => [letter, name])),
};

// 색 변수의 실제 값 (app/globals.css의 --px-*와 같아야 한다. 공유 이미지·아이콘처럼 변수를 못 쓰는 그림에 쓴다)
export const PAL_HEX: Record<string, string> = {
  line: "#2b2140",
  skin: "#ffd9b8",
  blush: "#ff9fae",
  shine: "#ffffff",
  violet: "#6c5ce7",
  "violet-dark": "#4834b8",
  gold: "#ffcf3f",
  boot: "#8a5a3b",
  steel: "#c7d0dc",
  "steel-dark": "#8893a5",
  red: "#ef4b5b",
  green: "#53b86f",
  leather: "#a06a42",
  white: "#fbf7ef",
  "white-dark": "#d9cdb8",
  ...Object.fromEntries(Object.values(EFFECT_COLORS)),
};

// 머리 오른쪽 위의 작은 말풍선 (7×7): 물음표·느낌표
const BUBBLES: Record<PalBubble, string[]> = {
  question: [".KKKKK.", "K##K##K", "K###K#K", "K##K##K", "K#####K", ".KK#KK.", "...K..."],
  exclaim: [".KKKKK.", "K##K##K", "K##K##K", "K##K##K", "K#####K", ".KKKKK.", "...K..."],
};

// 말풍선을 붙인 그림 (오른쪽으로 BUBBLE_WIDTH만큼 넓힌다)
export function withBubble(rows: string[], bubble: PalBubble): string[] {
  const pad = ".".repeat(BUBBLE_WIDTH);
  return rows.map((row, y) => row + (BUBBLES[bubble][y] ?? pad));
}

// 얼굴 6줄. side는 얼굴 양옆(모자·두건) 색. 눈은 2×3에 반짝이 한 점, 볼 터치, 작은 입
const face = (side: string) => [
  `.K${side}SSSSSSSSS${side}K..`,
  `.K${side}SKKSSSKKS${side}K..`,
  `.K${side}SKWSSSKWS${side}K..`,
  `.K${side}SKKSSSKKS${side}K..`,
  `.K${side}PSSSKSSSP${side}K..`,
  `..K${side}SSSSSSS${side}K...`,
];

const EYE_ROWS = [7, 8, 9]; // 머리 지도에서 눈이 있는 줄 (깜빡일 때 바꾼다)

// ───────── 부품 ─────────
// 캐릭터는 머리 장식 + 얼굴 + 옷(몸) 부품을 겹쳐 그린다. 부품 그림의 아래 글자는 "고른 색"으로 바뀐다
//   A·a: 머리 장식 색·그 어두운 색, O·o: 옷 색·그 어두운 색 (나머지 글자는 PAL_COLORS의 고정 색)
export type Headwear = "wizard-hat" | "helmet" | "hood" | "veil";
export type Outfit = "robe" | "armor" | "tunic" | "vestment";
// 한 사람의 캐릭터 모습. 색은 PAL_HEX의 이름(app/globals.css의 --px-*)
export interface Avatar {
  headwear: Headwear;
  headwearColor: string;
  outfit: Outfit;
  outfitColor: string;
  weapon: WeaponId; // 손에 든 무기 (lib/weapons.ts). 별 켜기 스킬과 이펙트는 무기가 정한다
}

const HEADWEAR: Record<Headwear, string[]> = {
  "wizard-hat": [
    "..........KK....",
    ".........KAK....",
    "......KKKAAK....",
    ".....KAAAAK.....",
    "....KAAYAAAK....",
    "KKKKKKKKKKKKKKK.",
    ...face("S"),
  ],
  helmet: [
    ".......KCK......",
    "......KCCK......",
    "....KKKKKKKK....",
    "...KAAAAAAAAK...",
    "..KAAAAAAAAAAK..",
    ".KAAAKKKKKKAAAK.",
    ...face("A"),
  ],
  hood: [
    "................",
    "......KKKK......",
    "....KKAAAAKK....",
    "...KAAAAAAAAK...",
    "..KAAAAAAAAAAK..",
    ".KAAAAAAAAAAAAK.",
    ...face("A"),
  ],
  veil: [
    "................",
    "......KKKK......",
    "....KKAYYAKK....",
    "...KAAAYYAAAK...",
    "..KAAAAAAAAAAK..",
    ".KAAAAAAAAAAAAK.",
    ...face("A"),
  ],
};

// 앉은 몸: 손을 양옆에 짚고 다리를 늘어뜨린다 (마지막 2줄이 다리). legs: 서 있는 동작 그림의 다리 색 글자
const OUTFITS: Record<Outfit, { rows: string[]; legs: string }> = {
  robe: { rows: ["...KOOOOOOOK....", "..KSOOOYOOOSK...", "..KKOOOOOOOKK...", "...KooKKKooK....", "...KtK...KtK...."], legs: "t" },
  armor: { rows: ["...KOOOYOOOK....", "..KSOOYYYOOSK...", "..KKOOOYOOOKK...", "...KooKKKooK....", "...KoK...KoK...."], legs: "o" },
  tunic: { rows: ["...KOOTTOOOK....", "..KSOOTYTOOSK...", "..KKOOOOOOOKK...", "...KTTKKKTTK....", "...KTK...KTK...."], legs: "T" },
  vestment: { rows: ["...KOOYYOOOK....", "..KSOYYYYOOSK...", "..KKOOYYOOOKK...", "...KooKKKooK....", "...KoK...KoK...."], legs: "o" },
};

// 처음부터 있던 네 모습(코드 안의 이름일 뿐, 화면에서 직업으로 나누지 않는다). 처음 온 사람이 받는 캐릭터이자 꾸미기의 출발점
export const PAL_PRESETS: Record<PalName, Avatar> = {
  wizard: { headwear: "wizard-hat", headwearColor: "violet", outfit: "robe", outfitColor: "violet", weapon: "apprentice-wand" },
  knight: { headwear: "helmet", headwearColor: "steel", outfit: "armor", outfitColor: "steel", weapon: "wooden-sword" },
  ranger: { headwear: "hood", headwearColor: "green", outfit: "tunic", outfitColor: "green", weapon: "short-bow" },
  cleric: { headwear: "veil", headwearColor: "white", outfit: "vestment", outfitColor: "white", weapon: "oak-staff" },
};

// 색 이름 → 그 색의 어두운 색 (없으면 같은 색)
const DARKER: Record<string, string> = {
  violet: "violet-dark",
  steel: "steel-dark",
  white: "white-dark",
  gold: "gold-shadow",
  rose: "rose-shadow",
  blush: "rose",
  tangerine: "ember-shadow",
  red: "ember-shadow",
  sky: "sky-shadow",
  green: "leaf-shadow",
  "leaf-light": "green",
  lavender: "smoke-mid",
  indigo: "line",
  leather: "boot",
};

// 꾸미기 화면에서 고를 수 있는 머리 장식·옷 색 [색 이름, 화면에 보이는 이름]
export const AVATAR_COLORS: [string, string][] = [
  ["violet", "보라"],
  ["indigo", "남색"],
  ["sky", "하늘"],
  ["green", "초록"],
  ["leaf-light", "연두"],
  ["gold", "노랑"],
  ["tangerine", "주황"],
  ["red", "빨강"],
  ["rose", "장미"],
  ["blush", "분홍"],
  ["lavender", "연보라"],
  ["leather", "갈색"],
  ["steel", "은색"],
  ["white", "하양"],
];
export const HEADWEAR_NAMES: Record<Headwear, string> = { "wizard-hat": "마법사 모자", helmet: "투구", hood: "두건", veil: "베일" };
export const OUTFIT_NAMES: Record<Outfit, string> = { robe: "로브", armor: "갑옷", tunic: "튜닉", vestment: "사제복" };

// 색 이름 → 그 색을 뜻하는 글자 (PAL_COLORS를 거꾸로)
const LETTER_OF: Record<string, string> = Object.fromEntries(
  Object.entries(PAL_COLORS)
    .filter(([letter]) => letter !== "#")
    .map(([letter, color]) => [color, letter]),
);

const toAvatar = (who: PalName | Avatar): Avatar => (typeof who === "string" ? PAL_PRESETS[who] : who);

// 저장해 둔 값(브라우저·계정)이 그릴 수 있는 캐릭터 모습인지. 아니면 null
export function toValidAvatar(value: unknown): Avatar | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const ok =
    typeof v.headwear === "string" &&
    v.headwear in HEADWEAR &&
    typeof v.outfit === "string" &&
    v.outfit in OUTFITS &&
    typeof v.headwearColor === "string" &&
    v.headwearColor in LETTER_OF &&
    typeof v.outfitColor === "string" &&
    v.outfitColor in LETTER_OF;
  // 무기는 예전 이름(sword·wand 등)이면 그 계열의 일반 무기로 바꾼다
  const weapon = upgradeWeaponId(v.weapon);
  if (!ok || !weapon) return null;
  const { headwear, headwearColor, outfit, outfitColor } = v as unknown as Avatar;
  return { headwear, headwearColor, outfit, outfitColor, weapon };
}

// 처음 온 사람에게 주는 캐릭터: 기본 네 캐릭터 중 하나
export function randomAvatar(random = Math.random): Avatar {
  const names = Object.keys(PAL_PRESETS) as PalName[];
  return { ...PAL_PRESETS[names[Math.floor(random() * names.length) % names.length]] };
}

// 부품 그림의 A·a·O·o를 고른 색의 글자로 바꾼다
function paint(rows: string[], avatar: Avatar): string[] {
  const letter = (color: string) => {
    const found = LETTER_OF[color];
    if (!found) throw new Error(`없는 색: ${color}`);
    return found;
  };
  const swap: Record<string, string> = {
    A: letter(avatar.headwearColor),
    a: letter(DARKER[avatar.headwearColor] ?? avatar.headwearColor),
    O: letter(avatar.outfitColor),
    o: letter(DARKER[avatar.outfitColor] ?? avatar.outfitColor),
  };
  return rows.map((row) => row.replace(/[AaOo]/g, (ch) => swap[ch]));
}

function headRows(avatar: Avatar, blink = false): string[] {
  const head = HEADWEAR[avatar.headwear].map((row, i) => {
    if (!blink || !EYE_ROWS.includes(i)) return row;
    // 눈 감기: 위 두 줄의 눈은 지우고(피부), 맨 아래 줄만 선으로 남긴다 → ‿‿
    const eyes = (r: string) => r.slice(0, 3) + r.slice(3, 12).replace(/[KW]/g, "S") + r.slice(12);
    return i === 9 ? row : eyes(row);
  });
  return paint(head, avatar);
}

// 빼꼼: 카드 윗선을 잡은 두 손 (마지막 2줄이 카드 선에 걸친다)
const HANDS = ["..KSSK....KSSK..", "..KKKK....KKKK.."];

// 캐릭터 그림. who: 기본 캐릭터 이름이나 꾸민 캐릭터 모습
export function palRows(who: PalName | Avatar, pose: PalPose, blink = false): string[] {
  const avatar = toAvatar(who);
  return [...headRows(avatar, blink), ...(pose === "sit" ? paint(OUTFITS[avatar.outfit].rows, avatar) : HANDS)];
}

// 같은 색이 옆으로 이어진 픽셀을 한 덩어리로 묶어 색마다 path 하나로 만든다 (그림 요소 수를 줄이려고)
export function palPaths(rows: string[]): { color: string; d: string }[] {
  const byColor = new Map<string, string[]>();
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      const ch = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === ch) end++;
      if (ch !== ".") {
        const color = PAL_COLORS[ch];
        if (!color) throw new Error(`색이 없는 글자: ${ch}`);
        byColor.set(color, [...(byColor.get(color) ?? []), `M${x} ${y}h${end - x}v1h-${end - x}z`]);
      }
      x = end;
    }
  });
  return [...byColor].map(([color, parts]) => ({ color, d: parts.join("") }));
}

// 혼자 쓰는 SVG 문자열 (색을 값으로 넣는다): 공유 미리보기 이미지처럼 화면 밖에서 쓰는 그림
export function palSvg(rows: string[], scale: number): string {
  const paths = palPaths(rows).map(({ color, d }) => `<path fill="${PAL_HEX[color]}" d="${d}"/>`).join("");
  const width = rows[0].length;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width * scale}" height="${rows.length * scale}" viewBox="0 0 ${width} ${rows.length}" shape-rendering="crispEdges">${paths}</svg>`;
}

// ───────── 동작 그림 (관심 표시 때 캐릭터가 직접 별을 켜는 동작, components/StarHelper.tsx) ─────────
// 24×17 칸. 캐릭터 몸은 가운데(4~19칸), 칼·활·지팡이는 오른쪽으로 삐져나온다. 모두 오른쪽을 보고 그리고, 왼쪽은 뒤집어 쓴다
export const ACTION_WIDTH = 24;
export const ACTION_HEIGHT = 17;
export type ActionFrame = "stand" | "runA" | "runB" | "windup" | "strike" | "draw" | "release" | "cast" | "pray" | "punch" | "poke" | "play";

const LEGS: Record<"stand" | "runA" | "runB", string[]> = {
  stand: ["....KxK.KxK.....", "...KKKK.KKKK...."],
  runA: ["...KxK...KxK....", "..KKK.....KKK..."],
  runB: [".....KxKxK......", "....KKKKKKK....."],
};

function stamp(canvas: string[][], rows: string[], ox: number, oy: number): void {
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch !== "." && canvas[oy + y]?.[ox + x] !== undefined) canvas[oy + y][ox + x] = ch;
    }),
  );
}

export function actionRows(who: PalName | Avatar, frame: ActionFrame): string[] {
  const canvas = Array.from({ length: ACTION_HEIGHT }, () => Array<string>(ACTION_WIDTH).fill("."));
  const legs = frame === "runA" || frame === "runB" ? LEGS[frame] : LEGS.stand;
  const avatar = toAvatar(who);
  const outfit = OUTFITS[avatar.outfit];
  stamp(canvas, headRows(avatar), 4, 0);
  stamp(canvas, paint(outfit.rows.slice(0, 3), avatar), 4, 12);
  stamp(canvas, paint(legs.map((row) => row.replace(/x/g, outfit.legs)), avatar), 4, 15);
  // 손에 든 무기 (lib/weapon-sprites.ts). 그 계열에 없는 자세면 들지 않는다
  const pose = poseOf(WEAPONS[avatar.weapon].family, frame);
  const held = pose && WEAPON_SPRITES[avatar.weapon][pose];
  if (held) stamp(canvas, held.rows, held.x, held.y);
  return canvas.map((row) => row.join(""));
}

// 효과 그림: 칼바람(초승달)과 화살
export const EFFECT_ROWS = {
  slash: ["...YWW...", ".....WW..", "......WY.", "......WW.", "......WY.", ".....WW..", "...YWW..."],
  arrow: ["W.....K.", "WttttMMM", "W.....K."],
};
