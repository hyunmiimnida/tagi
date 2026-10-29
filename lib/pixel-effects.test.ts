import assert from "node:assert/strict";
import test from "node:test";
import { EFFECTS, EFFECT_COLORS, EFFECT_IDS } from "./pixel-effects.ts";
import { PAL_COLORS, PAL_PRESETS, toValidAvatar } from "./pixel-pals.ts";

test("이펙트 그림은 정해진 크기·프레임 수이고 팔레트 색만 쓴다", () => {
  assert.ok(EFFECT_IDS.length >= 12);
  for (const id of EFFECT_IDS) {
    const { burst, ambient, motion, name } = EFFECTS[id];
    assert.ok(name.length >= 2 && name.length <= 5, `${id} 이름: ${name}`);
    assert.ok(["rise", "fall", "drift", "twinkle"].includes(motion), id);
    assert.equal(burst.length, 6, `${id} burst 프레임 수`);
    assert.equal(ambient.length, 4, `${id} ambient 프레임 수 (app/globals.css의 pfx-loop-4)`);
    for (const [frames, size] of [[burst, 17], [ambient, 7]] as const) {
      for (const rows of frames) {
        assert.equal(rows.length, size, id);
        for (const row of rows) assert.equal(row.length, size, `${id}: ${row}`);
        for (const ch of rows.join("")) assert.ok(ch === "." || PAL_COLORS[ch], `${id}: 색 없는 글자 ${ch}`);
      }
    }
    // 정점에서 크게 퍼지고(13칸 이상), 마지막 프레임은 거의 사라진다
    const peak = burst[2];
    const filled = (rows: readonly string[]) => rows.join("").replace(/\./g, "").length;
    const span = Math.max(...peak.map((row) => row.replace(/\.+$/, "").length)) - Math.min(...peak.filter((r) => /[^.]/.test(r)).map((row) => row.search(/[^.]/)));
    assert.ok(span >= 13, `${id} 정점 너비 ${span}`);
    assert.ok(filled(burst[5]) < filled(peak) / 4, `${id} 마지막 프레임은 거의 비어야 함`);
  }
});

test("이펙트 전용 색 글자는 캐릭터 부품 글자(A·a·O·o)·기존 색 글자와 겹치지 않는다", () => {
  for (const letter of Object.keys(EFFECT_COLORS)) {
    assert.ok(!"AaOo#".includes(letter), letter);
    assert.equal(PAL_COLORS[letter], EFFECT_COLORS[letter][0], letter);
  }
});

test("저장된 캐릭터에 이펙트가 없거나 모르는 값이면 '없음'", () => {
  const { effect: _effect, ...old } = PAL_PRESETS.wizard;
  assert.equal(toValidAvatar(old)?.effect, "none");
  assert.equal(toValidAvatar({ ...PAL_PRESETS.wizard, effect: "fireworks" })?.effect, "none");
  assert.equal(toValidAvatar({ ...PAL_PRESETS.wizard, effect: "petal" })?.effect, "petal");
});
