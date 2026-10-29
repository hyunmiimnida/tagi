import assert from "node:assert/strict";
import test from "node:test";
import { ACTION_HEIGHT, ACTION_WIDTH, PAL_COLORS, PAL_PRESETS, actionRows } from "./pixel-pals.ts";
import { FAMILY_POSES, WEAPON_SPRITES } from "./weapon-sprites.ts";
import { GRADES, STARTER_WEAPONS, WEAPONS, WEAPON_IDS, owns, starterOf, upgradeWeaponId } from "./weapons.ts";

test("계열마다 일반·희귀·영웅 무기가 하나씩, 전설은 자리 하나", () => {
  for (const family of ["sword", "staff", "bow", "relic", "pen", "instrument"] as const) {
    for (const grade of ["common", "rare", "heroic"] as const) {
      assert.equal(WEAPON_IDS.filter((id) => WEAPONS[id].family === family && WEAPONS[id].grade === grade).length, 1, `${family} ${grade}`);
    }
  }
  assert.equal(WEAPON_IDS.filter((id) => WEAPONS[id].grade === "legendary").length, 1);
  for (const id of WEAPON_IDS) assert.ok(GRADES.includes(WEAPONS[id].grade), id);
});

test("일반 무기는 누구나 갖고, 희귀 이상은 얻어야 한다", () => {
  const none = new Set<string>();
  for (const id of STARTER_WEAPONS) assert.ok(owns(none, id), id);
  assert.ok(!owns(none, "blossom-blade"));
  assert.ok(owns(new Set(["blossom-blade"]), "blossom-blade"));
  assert.equal(starterOf("pen"), "pencil");
  assert.equal(upgradeWeaponId("wand"), "apprentice-wand");
  assert.equal(upgradeWeaponId("tide-staff"), "tide-staff");
  assert.equal(upgradeWeaponId("spoon"), null);
});

test("모든 무기는 계열의 자세를 다 갖고, 그림이 동작 그림(24×17) 안에 들어가며 팔레트 색만 쓴다", () => {
  for (const id of WEAPON_IDS) {
    const { family } = WEAPONS[id];
    for (const pose of FAMILY_POSES[family]) {
      const st = WEAPON_SPRITES[id][pose];
      assert.ok(st, `${id} ${pose}`);
      assert.ok(st.x >= 0 && st.y >= 0 && st.x + st.rows[0].length <= ACTION_WIDTH && st.y + st.rows.length <= ACTION_HEIGHT, `${id} ${pose} 캔버스 밖`);
      for (const row of st.rows) assert.equal(row.length, st.rows[0].length, `${id} ${pose}`);
      for (const ch of st.rows.join("")) assert.ok(ch === "." || (PAL_COLORS[ch] && !"AaOo#".includes(ch)), `${id} ${pose}: ${ch}`);
    }
  }
  // 무기를 바꾸면 손에 든 그림이 바뀐다
  const base = PAL_PRESETS.knight;
  assert.notDeepEqual(actionRows({ ...base, weapon: "wooden-sword" }, "stand"), actionRows({ ...base, weapon: "blossom-blade" }, "stand"));
});

test("스킬 효과 그림은 효과마다 프레임 크기가 같고 팔레트 색만 쓴다", async () => {
  const { SKILL_FX } = await import("./skill-fx.ts");
  for (const [id, frames] of Object.entries(SKILL_FX)) {
    assert.ok(frames.length >= 2, id);
    const [w, h] = [frames[0][0].length, frames[0].length];
    for (const rows of frames) {
      assert.equal(rows.length, h, id);
      for (const row of rows) assert.equal(row.length, w, `${id}: ${row}`);
      for (const ch of rows.join("")) assert.ok(ch === "." || (PAL_COLORS[ch] && !"AaOo#".includes(ch)), `${id}: ${ch}`);
    }
  }
});
