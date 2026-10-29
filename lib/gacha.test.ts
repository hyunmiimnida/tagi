import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DAILY_KEYS, DRAW_COST, DRAW_POOL, ODDS, ODDS_TOTAL, REFUND, REVIEW_DAILY_MAX, REVIEW_KEYS, drawOnce, gradeOf, keysAfter, oddsPercent } from "./gacha.ts";
import { WEAPONS } from "./weapons.ts";

const sql = readFileSync(new URL("../supabase/gacha.sql", import.meta.url), "utf8");

test("확률은 80% / 19% / 0.99% / 0.01%이고 합이 100%", () => {
  assert.equal(ODDS.reduce((sum, [, weight]) => sum + weight, 0), ODDS_TOTAL);
  assert.deepEqual(
    ODDS.map(([grade, weight]) => [grade, oddsPercent(weight)]),
    [
      ["common", "80%"],
      ["rare", "19%"],
      ["heroic", "0.99%"],
      ["shard", "0.01%"],
    ],
  );
  assert.equal(gradeOf(0), "common");
  assert.equal(gradeOf(7999), "common");
  assert.equal(gradeOf(8000), "rare");
  assert.equal(gradeOf(9899), "rare");
  assert.equal(gradeOf(9900), "heroic");
  assert.equal(gradeOf(9998), "heroic");
  assert.equal(gradeOf(9999), "shard");
});

test("뽑기 목록에는 맨손·전설이 없고 등급이 맞다", () => {
  for (const [grade, pool] of Object.entries(DRAW_POOL)) {
    assert.ok(pool.length > 0, grade);
    for (const id of pool) assert.equal(WEAPONS[id].grade, grade, id);
  }
  assert.ok(!DRAW_POOL.common.includes("bare-hands"));
});

test("이미 가진 무기는 열쇠조각을 돌려주고, 처음 얻으면 돌려주지 않는다", () => {
  // random 값을 차례로 돌려주는 가짜 주사위: [등급, 무기]
  const dice = (...values: number[]) => () => values.shift() ?? 0;
  const rare = drawOnce(new Set(), dice(0.85, 0));
  assert.deepEqual(rare, { kind: "weapon", weapon: DRAW_POOL.rare[0], grade: "rare", duplicate: false, refund: 0 });
  assert.equal(keysAfter(10, rare), 0);

  const again = drawOnce(new Set([DRAW_POOL.rare[0]]), dice(0.85, 0));
  assert.equal(again.kind === "weapon" && again.refund, REFUND.rare);
  assert.equal(keysAfter(10, again), 5);

  // 일반 무기도 처음 나오면 얻고, 가진 것이면 2개를 돌려받는다
  const common = drawOnce(new Set(), dice(0.1, 0));
  assert.equal(common.kind === "weapon" && common.duplicate, false);
  const commonAgain = drawOnce(new Set([DRAW_POOL.common[0]]), dice(0.1, 0));
  assert.equal(keysAfter(10, commonAgain), 2);

  const heroic = drawOnce(new Set(DRAW_POOL.heroic), dice(0.995, 0.99));
  assert.equal(heroic.kind === "weapon" && heroic.refund, REFUND.heroic);

  assert.deepEqual(drawOnce(new Set(), dice(0.99995)), { kind: "shard" });
});

test("서버(supabase/gacha.sql)와 화면의 규칙이 같다", () => {
  // 뽑기 목록
  const rows = [...sql.matchAll(/\('([a-z0-9-]+)', '(common|rare|heroic)'\)/g)].map((m) => `${m[1]}:${m[2]}`).sort();
  const pool = Object.entries(DRAW_POOL)
    .flatMap(([grade, ids]) => ids.map((id) => `${id}:${grade}`))
    .sort();
  assert.deepEqual(rows, pool);
  // 확률 경계, 비용, 돌려주는 값, 선물
  assert.match(sql, /roll < 8000 then 'common' when roll < 9900 then 'rare' when roll < 9999 then 'heroic' else 'shard'/);
  assert.match(sql, new RegExp(`wallet.keys < ${DRAW_COST} then`));
  assert.match(sql, new RegExp(`when 'common' then ${REFUND.common} when 'rare' then ${REFUND.rare} else ${REFUND.heroic} end`));
  assert.match(sql, new RegExp(`granted := ${DAILY_KEYS};`));
  assert.match(sql, new RegExp(`if given < ${REVIEW_DAILY_MAX} then\\s+update key_wallets set keys = keys \\+ ${REVIEW_KEYS}`));
});
