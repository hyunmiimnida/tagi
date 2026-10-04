import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PAL_COLORS, PAL_HEIGHT, PAL_WIDTH, palPaths, palRows } from "./pixel-pals.ts";
import type { PalName, PalPose } from "./pixel-pals.ts";

const names: PalName[] = ["wizard", "knight", "ranger", "cleric"];
const poses: PalPose[] = ["sit", "peek"];

test("도트 캐릭터는 모두 정해진 크기(16칸 × 자세별 높이)이고 정해진 색만 쓴다", () => {
  for (const name of names) {
    for (const pose of poses) {
      for (const blink of [false, true]) {
        const rows = palRows(name, pose, blink);
        assert.equal(rows.length, PAL_HEIGHT[pose], `${name} ${pose}`);
        for (const row of rows) assert.equal(row.length, PAL_WIDTH, `${name} ${pose}: ${row}`);
        for (const ch of rows.join("")) assert.ok(ch === "." || PAL_COLORS[ch], `${name}: 색 없는 글자 ${ch}`);
      }
    }
  }
});

test("모든 색 변수가 app/globals.css에 있다", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  for (const color of new Set(Object.values(PAL_COLORS))) assert.ok(css.includes(`--px-${color}:`), color);
});

test("깜빡임은 눈만 바꾼다 (눈 감으면 반짝이가 없어진다)", () => {
  for (const name of names) {
    const open = palRows(name, "sit");
    const closed = palRows(name, "sit", true);
    const changed = open.map((row, i) => (row === closed[i] ? -1 : i)).filter((i) => i >= 0);
    assert.deepEqual(changed, [7, 8], name);
    assert.ok(open.join("").includes("W") && !closed.join("").includes("W"), name);
  }
});

test("같은 색이 이어진 칸은 한 덩어리로 그린다", () => {
  const paths = palPaths(["KK.S", ".KKK"]);
  assert.deepEqual(paths, [
    { color: "line", d: "M0 0h2v1h-2zM1 1h3v1h-3z" },
    { color: "skin", d: "M3 0h1v1h-1z" },
  ]);
});

test("말풍선은 오른쪽에 붙고(높이 그대로), 화면 밖 그림의 색 값이 globals.css와 같다", async () => {
  const { BUBBLE_WIDTH, PAL_HEX, palSvg, withBubble } = await import("./pixel-pals.ts");
  for (const bubble of ["question", "exclaim"] as const) {
    const rows = withBubble(palRows("wizard", "sit"), bubble);
    assert.equal(rows.length, PAL_HEIGHT.sit);
    for (const row of rows) assert.equal(row.length, PAL_WIDTH + BUBBLE_WIDTH);
    for (const ch of rows.join("")) assert.ok(ch === "." || PAL_COLORS[ch], `${bubble}: 색 없는 글자 ${ch}`);
  }
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  for (const [name, hex] of Object.entries(PAL_HEX)) assert.ok(css.includes(`--px-${name}: ${hex};`), `${name} ${hex}`);
  assert.match(palSvg(palRows("knight", "peek"), 7), /^<svg [^>]*width="112" height="98"/);
});
