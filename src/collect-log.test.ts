import assert from "node:assert/strict";
import test from "node:test";
import { mergeCollectLog } from "./collect-log.ts";

test("건너뛰거나 실패한 출처는 이전의 마지막 성공 시각을 이어받는다", () => {
  const first = mergeCollectLog(null, [{ source: "a", ok: true, count: 5, message: "" }], "2026-10-01T12:00:00Z", 10);
  const second = mergeCollectLog(
    first,
    [
      { source: "a", ok: true, count: 0, message: "내 컴퓨터에서만 수집" },
      { source: "b", ok: false, count: 0, message: "응답 오류" },
    ],
    "2026-10-02T00:00:00Z",
    10,
  );
  assert.equal(second.sources[0].lastSuccessAt, "2026-10-01T12:00:00Z");
  assert.equal(second.sources[0].lastSuccessCount, 5);
  assert.equal(second.sources[1].lastSuccessAt, undefined);
  // 다시 성공하면 새 시각으로 바뀐다
  const third = mergeCollectLog(second, [{ source: "a", ok: true, count: 2, message: "" }], "2026-10-03T00:00:00Z", 10);
  assert.equal(third.sources[0].lastSuccessAt, "2026-10-03T00:00:00Z");
});

test("연속 실패와 오래 멈춘 출처를 점검 대상으로 고른다", async () => {
  const { healthProblems } = await import("./collect-log.ts");
  let log = mergeCollectLog(null, [{ source: "a", ok: true, count: 1, message: "" }, { source: "b", ok: true, count: 1, message: "" }], "2026-10-01T00:00:00Z", 1);
  for (let day = 2; day <= 4; day++) {
    log = mergeCollectLog(log, [{ source: "a", ok: false, count: 0, message: "응답 오류" }, { source: "b", ok: true, count: 0, message: "내 컴퓨터에서만 수집" }], `2026-10-0${day}T00:00:00Z`, 1);
  }
  assert.equal(log.sources[0].failStreak, 3);
  const problems = healthProblems(log, Date.parse("2026-10-05T00:00:00Z"));
  assert.equal(problems.length, 2); // a는 3번 연속 실패, b는 4일째 성공 없음
  assert.match(problems[0], /3번 연속 실패/);
});
