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

test("별 켜기 동작 그림(24×17)과 효과 그림은 정해진 색만 쓴다", async () => {
  const { ACTION_HEIGHT, ACTION_WIDTH, EFFECT_ROWS, actionRows } = await import("./pixel-pals.ts");
  const frames = ["stand", "runA", "runB", "windup", "strike", "draw", "release", "cast", "pray", "punch"] as const;
  for (const name of names) {
    for (const frame of frames) {
      const rows = actionRows(name, frame);
      assert.equal(rows.length, ACTION_HEIGHT);
      for (const row of rows) assert.equal(row.length, ACTION_WIDTH, `${name} ${frame}`);
      for (const ch of rows.join("")) assert.ok(ch === "." || PAL_COLORS[ch], `${name} ${frame}: ${ch}`);
    }
  }
  // 동작마다 그림이 실제로 달라진다 (칼을 치켜들기·휘두르기, 활 당기기·놓기, 지팡이 들기)
  assert.notDeepEqual(actionRows("knight", "windup"), actionRows("knight", "strike"));
  assert.notDeepEqual(actionRows("ranger", "draw"), actionRows("ranger", "release"));
  assert.notDeepEqual(actionRows("wizard", "stand"), actionRows("wizard", "cast"));
  for (const rows of Object.values(EFFECT_ROWS)) for (const ch of rows.join("")) assert.ok(ch === "." || PAL_COLORS[ch], ch);
});

test("캐릭터는 부품(머리 장식·옷)과 색을 바꿔 꾸밀 수 있다", async () => {
  const { PAL_PRESETS } = await import("./pixel-pals.ts");
  // 기본 캐릭터 이름과 그 모습을 넘겼을 때 같은 그림
  for (const name of names) assert.deepEqual(palRows(PAL_PRESETS[name], "sit"), palRows(name, "sit"));
  // 마법사 모자에 기사 갑옷, 색은 초록 모자·하얀 옷
  const mixed = palRows({ headwear: "wizard-hat", headwearColor: "green", outfit: "armor", outfitColor: "white", weapon: "apprentice-wand" }, "sit");
  assert.equal(mixed.length, PAL_HEIGHT.sit);
  const hat = mixed.slice(0, 6).join("");
  const body = mixed.slice(12).join("");
  assert.ok(hat.includes("N") && !hat.includes("H"), "모자는 초록");
  assert.ok(body.includes("B") && body.includes("b") && !body.includes("M"), "옷은 하양과 그 어두운 색");
  for (const ch of mixed.join("")) assert.ok(ch === "." || PAL_COLORS[ch], ch);
  // 없는 색 이름은 바로 알린다
  assert.throws(() => palRows({ ...PAL_PRESETS.wizard, outfitColor: "rainbow" }, "sit"), /없는 색/);
});

test("저장해 둔 캐릭터 값은 그릴 수 있는 것만 받고, 처음 온 사람은 기본 캐릭터 중 하나를 받는다", async () => {
  const { PAL_PRESETS, randomAvatar, toValidAvatar } = await import("./pixel-pals.ts");
  assert.deepEqual(toValidAvatar({ ...PAL_PRESETS.knight, extra: 1 }), PAL_PRESETS.knight); // 모르는 칸은 버린다
  for (const bad of [null, "wizard", {}, { ...PAL_PRESETS.knight, outfit: "bikini" }, { ...PAL_PRESETS.knight, outfitColor: "rainbow" }, { ...PAL_PRESETS.knight, weapon: "spoon" }, { ...PAL_PRESETS.knight, weapon: undefined }]) {
    assert.equal(toValidAvatar(bad), null, JSON.stringify(bad));
  }
  assert.deepEqual(randomAvatar(() => 0), { ...PAL_PRESETS.wizard, weapon: "bare-hands" });
  assert.deepEqual(randomAvatar(() => 0.99), { ...PAL_PRESETS.cleric, weapon: "bare-hands" });
  // 예전에 저장한 무기 이름(계열 이름)은 그 계열의 일반 무기로 바뀐다
  assert.equal(toValidAvatar({ ...PAL_PRESETS.cleric, weapon: "sword" })?.weapon, "wooden-sword");
  assert.equal(toValidAvatar({ ...PAL_PRESETS.cleric, weapon: "none", effect: "petal" })?.weapon, "bare-hands");
  // 손에 든 무기는 무기를 따른다: 사제복 차림이어도 검을 들면 칼을 치켜든다
  const { actionRows } = await import("./pixel-pals.ts");
  assert.notDeepEqual(actionRows({ ...PAL_PRESETS.cleric, weapon: "wooden-sword" }, "windup"), actionRows("cleric", "windup"));
  // 맨손이면 주먹(피부색 S)이 몸 오른쪽(16칸 이후)으로 나온다
  const bare = { ...PAL_PRESETS.knight, weapon: "bare-hands" as const };
  assert.ok(actionRows(bare, "punch").some((row) => row.slice(16).includes("S")));
  assert.notDeepEqual(actionRows(bare, "stand"), actionRows("knight", "stand")); // 같은 차림이어도 맨손은 칼을 들지 않는다
});
