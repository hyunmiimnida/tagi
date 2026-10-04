import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { PAL_COLORS, palRows } from "../lib/pixel-pals.ts";

// 서비스 아이콘 만들기: 파랑 바탕에서 마법사(도트 캐릭터, lib/pixel-pals.ts)가 공고 카드 너머로 빼꼼.
// 32×32 도트 그림 하나로 모든 크기를 만든다:
//   app/icon.svg, public/logo.svg       브라우저 탭·사이트 머리·로그인 창 (둥근 사각형)
//   public/icon-192.png, icon-512.png    홈 화면에 추가 (둥근 사각형, 모서리 투명)
//   public/icon-maskable-512.png         안드로이드가 모양을 잘라 쓰는 아이콘 (가운데 80% 안에 그림)
//   app/apple-icon.png                   아이폰 홈 화면 (꽉 찬 사각형, 아이폰이 모서리를 둥글게 자른다)
// 실행: node scripts/make-icons.ts

const GRID = 32;
const BG = "#3f78e6";
const CORNER = 0.22; // 둥근 모서리 반지름 (한 변에 대한 비율)

// 도트 캐릭터 색 (app/globals.css의 --px-* 와 같은 값. 그림 파일이라 변수를 못 쓴다)
const PX: Record<string, string> = {
  line: "#2b2140", skin: "#ffd9b8", blush: "#ff9fae", shine: "#ffffff", violet: "#6c5ce7", "violet-dark": "#4834b8",
  gold: "#ffcf3f", boot: "#8a5a3b", steel: "#c7d0dc", "steel-dark": "#8893a5", red: "#ef4b5b", green: "#53b86f",
  leather: "#a06a42", white: "#fbf7ef", "white-dark": "#d9cdb8",
};
// 아이콘에만 쓰는 색: 카드 흰색·줄·별
const ICON_COLORS: Record<string, string> = { "#": "#ffffff", ":": "#dfe7f5", "~": "#b9c8e6", "*": "#ffcf3f" };
const colorOf = (ch: string) => ICON_COLORS[ch] ?? PX[PAL_COLORS[ch]];

// 공고 카드: 흰 카드에 줄 세 개와 보라 배지 (아래쪽은 아이콘 밖으로 이어진다)
const CARD = [
  ".KKKKKKKKKKKKKKKKKKKKKK.",
  "K######################K",
  "K######################K",
  "K##~~~~~~~~~~~~~~~~####K",
  "K######################K",
  "K##:::::::::::::::#####K",
  "K######################K",
  "K##::::::::::::########K",
  "K######################K",
  "K##HHHH################K",
];
const SPARKLE = ["..*..", ".*#*.", "*###*", ".*#*.", "..*.."];
const TWINKLE = [".*.", "*#*", ".*."];

// 32×32 칸마다 색 (없으면 바탕)
const art: (string | null)[][] = Array.from({ length: GRID }, () => Array<string | null>(GRID).fill(null));
for (const [rows, ox, oy] of [
  [CARD, 4, 22],
  [palRows("wizard", "peek"), 8, 10],
  [SPARKLE, 3, 5],
  [TWINKLE, 26, 13],
] as [string[], number, number][]) {
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch !== "." && art[oy + y]?.[ox + x] !== undefined) art[oy + y][ox + x] = colorOf(ch);
    }),
  );
}

// SVG: 같은 색이 옆으로 이어진 칸을 묶어 색마다 path 하나
function svg(): string {
  const byColor = new Map<string, string>();
  art.forEach((row, y) => {
    for (let x = 0; x < GRID; ) {
      let end = x + 1;
      while (end < GRID && row[end] === row[x]) end++;
      const color = row[x];
      if (color) byColor.set(color, (byColor.get(color) ?? "") + `M${x} ${y}h${end - x}v1h-${end - x}z`);
      x = end;
    }
  });
  const paths = [...byColor].map(([color, d]) => `<path fill="${color}" d="${d}"/>`).join("");
  const r = GRID * CORNER;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 ${GRID} ${GRID}" shape-rendering="crispEdges"><clipPath id="r"><rect width="${GRID}" height="${GRID}" rx="${r}"/></clipPath><g clip-path="url(#r)"><rect width="${GRID}" height="${GRID}" fill="${BG}"/>${paths}</g></svg>\n`;
}

// PNG: 칸 색은 가장 가까운 칸으로(도트가 흐려지지 않게), 둥근 모서리만 4×4로 나눠 부드럽게
function png(size: number, { rounded = false, safe = 1 } = {}): Buffer {
  const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const bg = hex(BG);
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const radius = size * CORNER;
  const inside = (x: number, y: number) => {
    const cx = Math.min(Math.max(x, radius), size - radius);
    const cy = Math.min(Math.max(y, radius), size - radius);
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
  };
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // 줄마다 필터 없음
    for (let x = 0; x < size; x++) {
      // safe < 1이면 그림을 가운데 그만큼만 쓰고 나머지는 바탕 (마스크용 아이콘)
      const ax = Math.floor(((x + 0.5) / size - (1 - safe) / 2) / safe * GRID);
      const ay = Math.floor(((y + 0.5) / size - (1 - safe) / 2) / safe * GRID);
      const cell = ax >= 0 && ay >= 0 && ax < GRID && ay < GRID ? art[ay][ax] : null;
      const [r, g, b] = cell ? hex(cell) : bg;
      let alpha = 255;
      if (rounded) {
        let hits = 0;
        for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) if (inside(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4)) hits++;
        alpha = Math.round((hits / 16) * 255);
      }
      raw.set([r, g, b, alpha], y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8비트 RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const root = new URL("../", import.meta.url);
const out = (path: string, data: string | Buffer) => {
  writeFileSync(new URL(path, root), data);
  console.log(`${path} (${Math.round(Buffer.byteLength(data) / 1024)}KB)`);
};
out("app/icon.svg", svg());
out("public/logo.svg", svg());
out("public/icon-192.png", png(192, { rounded: true }));
out("public/icon-512.png", png(512, { rounded: true }));
out("public/icon-maskable-512.png", png(512, { safe: 0.8 }));
out("app/apple-icon.png", png(180));
