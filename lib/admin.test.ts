import assert from "node:assert/strict";
import test from "node:test";
import { describeError, formatDateTime, pendingCount, sourceProblems, timeAgo } from "./admin.ts";
import type { AdminStats } from "./admin.ts";

test("시각을 한국 시간으로 짧게 보여 준다 (올해가 아니면 연도를 붙인다)", () => {
  assert.equal(formatDateTime(null), "-");
  // UTC 2020-01-01 15:05 = 한국 2020-01-02 00:05
  assert.equal(formatDateTime("2020-01-01T15:05:00Z"), "2020.1.2 00:05");
  const thisYear = new Date().getUTCFullYear();
  assert.equal(formatDateTime(`${thisYear}-06-30T05:30:00Z`), "6.30 14:30");
});

test("얼마 전인지 사람이 읽는 말로 보여 준다", () => {
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  assert.equal(timeAgo(undefined), "-");
  assert.equal(timeAgo(ago(10_000)), "방금");
  assert.equal(timeAgo(ago(5 * 60_000)), "5분 전");
  assert.equal(timeAgo(ago(3 * 3_600_000)), "3시간 전");
  assert.equal(timeAgo(ago(2 * 86_400_000)), "2일 전");
  assert.match(timeAgo(ago(90 * 86_400_000)), /^\d/); // 30일이 넘으면 날짜
});

test("관리 함수 오류를 안내 문장으로 바꾼다", () => {
  assert.equal(describeError({ message: "not_admin" }), "관리자 계정이 아니에요.");
  assert.equal(describeError({ message: "cannot_self" }), "내 계정에는 할 수 없어요.");
  assert.equal(describeError({ message: "cannot_delete_admin" }), "관리자 계정은 지울 수 없어요.");
  // 함수·표가 아직 없음 = supabase/admin.sql을 실행하지 않음
  for (const code of ["PGRST202", "42883", "PGRST205", "42P01"]) assert.match(describeError({ message: "x", code }), /admin\.sql/);
  assert.match(describeError({ message: "timeout" }), /timeout/);
});

test("탭마다 처리할 일 수: 새 의견·확인할 댓글 신고·정보 오류 신고", () => {
  const stats = { newFeedback: 2, openReports: 1, openProgramReports: 3 } as AdminStats;
  assert.equal(pendingCount(stats, "feedback"), 2);
  assert.equal(pendingCount(stats, "comments"), 1);
  assert.equal(pendingCount(stats, "reports"), 3);
  assert.equal(pendingCount(stats, "users"), 0);
  assert.equal(pendingCount(null, "feedback"), 0);
});

test("살펴볼 수집 출처: 실패·성공 기록 없음·3일 넘게 성공 없음 (꺼진 출처는 뺀다)", () => {
  const now = Date.parse("2026-10-02T00:00:00Z");
  const day = (n: number) => new Date(now - n * 86_400_000).toISOString();
  const sources = [
    { id: "ok", enabled: true, ok: true, lastSuccessAt: day(1) },
    { id: "failed", enabled: true, ok: false, lastSuccessAt: day(1) },
    { id: "never", enabled: true, ok: null, lastSuccessAt: null },
    { id: "stale", enabled: true, ok: true, lastSuccessAt: day(4) },
    { id: "off", enabled: false, ok: false, lastSuccessAt: null },
  ];
  assert.deepEqual(sourceProblems(sources, now).map((s) => s.id), ["failed", "never", "stale"]);
  assert.deepEqual(sourceProblems(sources, now, 5).map((s) => s.id), ["failed", "never"]);
});
