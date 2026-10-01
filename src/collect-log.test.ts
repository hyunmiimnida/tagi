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
