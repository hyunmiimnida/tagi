import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { WELCOME_KEYS, DAILY_KEYS, DRAW_COST, DRAW_POOL, ODDS, ODDS_TOTAL, REFUND, REVIEW_DAILY_MAX, REVIEW_KEYS, SHARDS_PER_LEGEND, drawOnce, gradeOf, keysAfter, reviewRewardNote, shardsAfter } from "./gacha.ts";
import { WEAPONS } from "./weapons.ts";

const sql = readFileSync(new URL("../supabase/gacha.sql", import.meta.url), "utf8");

// random 값을 차례로 돌려주는 가짜 주사위: [등급, 무기]
const dice = (...values: number[]) => () => values.shift() ?? 0;
const SHARD_ROLL = 29997.5 / 30000;
const LEGEND_ROLL = 29999.5 / 30000;

test("확률은 80% / 19% / 0.99% / 전설 0.01%(파편 3분의 2, 전설 무기 3분의 1)이고 합이 100%", () => {
  assert.equal(ODDS.reduce((sum, [, weight]) => sum + weight, 0), ODDS_TOTAL);
  assert.deepEqual(ODDS, [["common", 24000], ["rare", 5700], ["heroic", 297], ["shard", 2], ["legendary", 1]]);
  assert.equal(gradeOf(0), "common");
  assert.equal(gradeOf(23999), "common");
  assert.equal(gradeOf(24000), "rare");
  assert.equal(gradeOf(29699), "rare");
  assert.equal(gradeOf(29700), "heroic");
  assert.equal(gradeOf(29996), "heroic");
  assert.equal(gradeOf(29997), "shard");
  assert.equal(gradeOf(29998), "shard");
  assert.equal(gradeOf(29999), "legendary");
});

test("뽑기 목록에는 맨손이 없고 등급이 맞다", () => {
  for (const [grade, pool] of Object.entries(DRAW_POOL)) {
    assert.ok(pool.length > 0, grade);
    for (const id of pool) assert.equal(WEAPONS[id].grade, grade, id);
  }
  assert.ok(!DRAW_POOL.common.includes("bare-hands"));
});

test("이미 가진 무기는 열쇠조각을 돌려주고, 처음 얻으면 돌려주지 않는다", () => {
  const rare = drawOnce(new Set(), 0, dice(0.85, 0));
  assert.deepEqual(rare, { kind: "weapon", weapon: DRAW_POOL.rare[0], grade: "rare", duplicate: false, refund: 0 });
  assert.equal(keysAfter(10, rare), 5);

  const again = drawOnce(new Set([DRAW_POOL.rare[0]]), 0, dice(0.85, 0));
  assert.equal(again.kind === "weapon" && again.refund, REFUND.rare);
  assert.equal(keysAfter(10, again), 10);

  // 일반 무기도 처음 나오면 얻고, 가진 것이면 2개를 돌려받는다
  const common = drawOnce(new Set(), 0, dice(0.1, 0));
  assert.equal(common.kind === "weapon" && common.duplicate, false);
  const commonAgain = drawOnce(new Set([DRAW_POOL.common[0]]), 0, dice(0.1, 0));
  assert.equal(keysAfter(10, commonAgain), 7);

  const heroic = drawOnce(new Set(DRAW_POOL.heroic), 0, dice(0.995, 0.99));
  assert.equal(heroic.kind === "weapon" && heroic.refund, REFUND.heroic);

  assert.deepEqual(drawOnce(new Set(), 0, dice(SHARD_ROLL)), { kind: "shard" });

  // 전설 무기가 바로 나옴, 이미 가졌으면 20개
  const legend = drawOnce(new Set(), 0, dice(LEGEND_ROLL, 0));
  assert.deepEqual(legend, { kind: "weapon", weapon: DRAW_POOL.legendary[0], grade: "legendary", duplicate: false, refund: 0 });
  const legendAgain = drawOnce(new Set(DRAW_POOL.legendary), 0, dice(LEGEND_ROLL, 0));
  assert.equal(legendAgain.kind === "weapon" && legendAgain.refund, REFUND.legendary);
});

test("전설의 파편이 3개 모이면 아직 없는 전설 무기로 바뀐다", () => {
  assert.equal(SHARDS_PER_LEGEND, 3);
  assert.deepEqual(drawOnce(new Set(), 1, dice(SHARD_ROLL)), { kind: "shard" });
  assert.equal(shardsAfter(1, { kind: "shard" }), 2);
  const exchanged = drawOnce(new Set(), 2, dice(SHARD_ROLL, 0));
  assert.ok(exchanged.kind === "weapon" && exchanged.grade === "legendary" && exchanged.fromShards && !exchanged.duplicate);
  assert.equal(shardsAfter(2, exchanged), 0);
  assert.equal(keysAfter(10, exchanged), 5);
  // 전설을 모두 가졌으면 파편으로 쌓인다
  assert.deepEqual(drawOnce(new Set(DRAW_POOL.legendary), 5, dice(SHARD_ROLL)), { kind: "shard" });
});

test("서버(supabase/gacha.sql)와 화면의 규칙이 같다", () => {
  // 뽑기 목록
  const rows = [...sql.matchAll(/\('([a-z0-9-]+)', '(common|rare|heroic|legendary)'\)/g)].map((m) => `${m[1]}:${m[2]}`).sort();
  const pool = Object.entries(DRAW_POOL)
    .flatMap(([grade, ids]) => ids.map((id) => `${id}:${grade}`))
    .sort();
  assert.deepEqual(rows, pool);
  // 확률 경계, 비용, 돌려주는 값, 파편 교환, 선물
  assert.match(sql, new RegExp(`random\\(\\) \\* ${ODDS_TOTAL}\\)`));
  assert.match(sql, /roll < 24000 then 'common' when roll < 29700 then 'rare' when roll < 29997 then 'heroic' when roll < 29999 then 'shard' else 'legendary'/);
  assert.match(sql, new RegExp(`wallet.keys < ${DRAW_COST} then`));
  assert.equal(sql.match(new RegExp(`set keys = keys - ${DRAW_COST},`, "g"))?.length, 2);
  assert.equal(sql.match(new RegExp(`values \\(me, -${DRAW_COST}, 'draw'`, "g"))?.length, 2);
  assert.match(sql, new RegExp(`when 'common' then ${REFUND.common} when 'rare' then ${REFUND.rare} when 'heroic' then ${REFUND.heroic} else ${REFUND.legendary} end`));
  assert.match(sql, new RegExp(`legend_shards >= ${SHARDS_PER_LEGEND} then`));
  assert.match(sql, new RegExp(`legend_shards = legend_shards - ${SHARDS_PER_LEGEND},`));
  assert.match(sql, new RegExp(`granted := ${DAILY_KEYS};`));
  assert.match(sql, new RegExp(`welcome := ${WELCOME_KEYS};`));
  assert.match(sql, new RegExp(`if given < ${REVIEW_DAILY_MAX} and not exists`));
  assert.match(sql, new RegExp(`paid := least\\(wallet\\.key_debt, ${REVIEW_KEYS}\\)`));
  assert.match(sql, new RegExp(`granted := ${REVIEW_KEYS} - paid`));
});

test("후기 보상 안내는 남은 횟수만, 예상과 다를 때는 이유도 알려 준다", () => {
  for (let used = 0; used <= 4; used++) {
    assert.equal(reviewRewardNote(used, 0, false), `오늘 후기 보상 ${Math.max(0, 3 - used)}번 남았어요.`);
  }
  assert.equal(reviewRewardNote(3, 7, false), "오늘 후기 보상 0번 남았어요.");
  assert.equal(reviewRewardNote(3, 0, true), "오늘 후기 보상 0번 남았어요.");
  assert.match(reviewRewardNote(0, 0, true), /이미 보상을 받아서/);
  assert.match(reviewRewardNote(0, 3, false), /3개를 갚고 2개를 받아요/);
  assert.match(reviewRewardNote(0, 7, false), /7개가 있어서.*5개를 갚고 받는 열쇠조각은 없어요/);
});

test("후기는 프로그램마다 한 번, 지우면 회수하고 탈퇴 때는 건너뛴다", () => {
  assert.match(sql, /reason = 'review' and series_id = new\.series_id/);
  assert.match(sql, /create trigger comments_reclaim_keys after delete on comments/);
  assert.match(sql, /taken := least\(wallet\.keys, reward\.change\)/);
  assert.match(sql, /key_debt = key_debt \+ \(reward\.change - taken\) \+ reward\.debt_paid/);
  assert.match(sql, /if not exists \(select 1 from auth\.users where id = old\.user_id\) then return old/);
});
