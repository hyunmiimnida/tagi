// 도트 캐릭터(중세 마법 RPG 2등신): 마법사·기사·궁수·성직자.
// 그림은 글자 지도로 그린다: 글자 하나 = 픽셀 하나, "." = 투명. 색은 app/globals.css의 --px-* 변수.
// 자세: sit(앉아서 다리를 늘어뜨림, 16×17) · peek(카드 모서리를 두 손으로 잡고 고개만 내밂, 16×14)

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

const HEADS: Record<PalName, string[]> = {
  wizard: [
    "..........KK....",
    ".........KHK....",
    "......KKKHHK....",
    ".....KHHHHK.....",
    "....KHHYHHHK....",
    "KKKKKKKKKKKKKKK.",
    ...face("S"),
  ],
  knight: [
    ".......KCK......",
    "......KCCK......",
    "....KKKKKKKK....",
    "...KMMMMMMMMK...",
    "..KMMMMMMMMMMK..",
    ".KMMMKKKKKKMMMK.",
    ...face("M"),
  ],
  ranger: [
    "................",
    "......KKKK......",
    "....KKNNNNKK....",
    "...KNNNNNNNNK...",
    "..KNNNNNNNNNNK..",
    ".KNNNNNNNNNNNNK.",
    ...face("N"),
  ],
  cleric: [
    "................",
    "......KKKK......",
    "....KKBYYBKK....",
    "...KBBBYYBBBK...",
    "..KBBBBBBBBBBK..",
    ".KBBBBBBBBBBBBK.",
    ...face("B"),
  ],
};

// 앉은 몸: 손을 양옆에 짚고 다리를 늘어뜨린다 (마지막 2줄이 다리)
const BODIES: Record<PalName, string[]> = {
  wizard: ["...KHHHHHHHK....", "..KSHHHYHHHSK...", "..KKHHHHHHHKK...", "...KhhKKKhhK....", "...KtK...KtK...."],
  knight: ["...KMMMYMMMK....", "..KSMMYYYMMSK...", "..KKMMMYMMMKK...", "...KmmKKKmmK....", "...KmK...KmK...."],
  ranger: ["...KNNTTNNNK....", "..KSNNTYTNNSK...", "..KKNNNNNNNKK...", "...KTTKKKTTK....", "...KTK...KTK...."],
  cleric: ["...KBBYYBBBK....", "..KSBYYYYBBSK...", "..KKBBYYBBBKK...", "...KbbKKKbbK....", "...KbK...KbK...."],
};

// 빼꼼: 카드 윗선을 잡은 두 손 (마지막 2줄이 카드 선에 걸친다)
const HANDS = ["..KSSK....KSSK..", "..KKKK....KKKK.."];

export function palRows(name: PalName, pose: PalPose, blink = false): string[] {
  const head = HEADS[name].map((row, i) => {
    if (!blink || !EYE_ROWS.includes(i)) return row;
    // 눈 감기: 위 두 줄의 눈은 지우고(피부), 맨 아래 줄만 선으로 남긴다 → ‿‿
    const eyes = (r: string) => r.slice(0, 3) + r.slice(3, 12).replace(/[KW]/g, "S") + r.slice(12);
    return i === 9 ? row : eyes(row);
  });
  return [...head, ...(pose === "sit" ? BODIES[name] : HANDS)];
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
export type ActionFrame = "stand" | "runA" | "runB" | "windup" | "strike" | "draw" | "release" | "cast" | "pray";

const LEG_COLOR: Record<PalName, string> = { wizard: "t", knight: "m", ranger: "T", cleric: "b" };
const LEGS: Record<"stand" | "runA" | "runB", string[]> = {
  stand: ["....KxK.KxK.....", "...KKKK.KKKK...."],
  runA: ["...KxK...KxK....", "..KKK.....KKK..."],
  runB: [".....KxKxK......", "....KKKKKKK....."],
};

// 손에 든 것: [그림, 왼쪽 칸, 위 칸]
type Prop = [string[], number, number];
const SWORD = [".K.", "KWK", "KMK", "KMK", "KMK", "KMK", "YYY", ".t."];
const SWORD_FORWARD = ["Y.KKKKK.", "YtMMMMMW", "Y.KKKKK."];
const BOW_DRAWN = [
  "......T....",
  ".......T...",
  "........T..",
  "........T..",
  "........T..",
  "WttttttttMM",
  "........T..",
  ".......T...",
  "......T....",
];
const BOW = BOW_DRAWN.map((row, i) => (i === 5 ? "........T.." : row));
const WAND = [".Y.", "YWY", ".Y.", ".t.", ".t."];
const STAFF = ["YYY", "YWY", "YYY", ".t.", ".t.", ".t.", ".t.", ".t.", ".t.", ".t.", ".t."];

const PROPS: Partial<Record<PalName, Partial<Record<ActionFrame, Prop>>>> = {
  knight: {
    stand: [SWORD, 17, 6],
    runA: [SWORD, 17, 6],
    runB: [SWORD, 17, 6],
    windup: [SWORD, 18, 0], // 칼을 높이 치켜든다
    strike: [SWORD_FORWARD, 16, 12], // 앞으로 휘두른다
  },
  ranger: { draw: [BOW_DRAWN, 13, 8], release: [BOW, 13, 8] },
  wizard: { stand: [WAND, 17, 9], cast: [WAND, 19, 3] },
  cleric: { stand: [STAFF, 17, 4], pray: [STAFF, 18, 1] },
};

function stamp(canvas: string[][], rows: string[], ox: number, oy: number): void {
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch !== "." && canvas[oy + y]?.[ox + x] !== undefined) canvas[oy + y][ox + x] = ch;
    }),
  );
}

export function actionRows(name: PalName, frame: ActionFrame): string[] {
  const canvas = Array.from({ length: ACTION_HEIGHT }, () => Array<string>(ACTION_WIDTH).fill("."));
  const legs = frame === "runA" || frame === "runB" ? LEGS[frame] : LEGS.stand;
  stamp(canvas, HEADS[name], 4, 0);
  stamp(canvas, BODIES[name].slice(0, 3), 4, 12);
  stamp(canvas, legs.map((row) => row.replace(/x/g, LEG_COLOR[name])), 4, 15);
  const prop = PROPS[name]?.[frame];
  if (prop) stamp(canvas, ...prop);
  return canvas.map((row) => row.join(""));
}

// 효과 그림: 칼바람(초승달)과 화살
export const EFFECT_ROWS = {
  slash: ["...YWW...", ".....WW..", "......WY.", "......WW.", "......WY.", ".....WW..", "...YWW..."],
  arrow: ["W.....K.", "WttttMMM", "W.....K."],
};
