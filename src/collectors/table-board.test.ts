import assert from "node:assert/strict";
import test from "node:test";
import { toIsoDate, writerName } from "./table-board.ts";

test("작성자 칸에서 부서 이름만 남긴다", () => {
  assert.equal(writerName("작성자 : 진로취업지원팀"), "진로취업지원팀");
  assert.equal(writerName("작성자 [종합교원양성센터]"), "종합교원양성센터");
  assert.equal(writerName("글로컬대학30"), "글로컬대학30");
});

test("여러 모양의 등록일을 읽는다", () => {
  assert.equal(toIsoDate("2026.09.28"), "2026-09-28");
  assert.equal(toIsoDate("작성일자 2026-09-30"), "2026-09-30");
  assert.equal(toIsoDate("26-09-30"), "2026-09-30");
});
