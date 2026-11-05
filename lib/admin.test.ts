import assert from "node:assert/strict";
import test from "node:test";
import { describeError, formatDateTime, gradeShares, groupIssues, pendingCount, sinceOf, sourceProblems, tableProblems, timeAgo } from "./admin.ts";
import type { AdminStats, IntegrityIssue } from "./admin.ts";

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

test("뽑기 관리 오류도 안내 문장으로, 함수가 없으면 알려 준 SQL 파일을 안내한다", () => {
  assert.equal(describeError({ message: "keys:reason" }), "이유를 적어 주세요.");
  assert.equal(describeError({ message: "weapon:owned" }), "이미 가진 무기예요.");
  assert.match(describeError({ message: "x", code: "PGRST202" }, "admin-keys.sql"), /admin-keys\.sql/);
});

test("실제 등급 비율과 설정 확률을 나란히 (뽑기가 없으면 실제는 비움)", () => {
  const shares = gradeShares({ common: 80, rare: 19, heroic: 1, unknown: 3 });
  const round = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);
  assert.deepEqual(shares.map((s) => [s.grade, s.count, round(s.actual), round(s.expected)]), [
    ["common", 80, 80, 80],
    ["rare", 19, 19, 19],
    ["heroic", 1, 1, 0.99],
    ["shard", 0, 0, 0.01],
    ["legendary", 0, 0, 0],
  ]);
  assert.ok(gradeShares({}).every((s) => s.actual === null));
});

test("조작 점검 결과를 사람마다 묶고, '확인 필요'만 있는 사람은 뒤로", () => {
  const issue = (user_id: string, kind: IntegrityIssue["kind"]): IntegrityIssue => ({ user_id, nickname: user_id, admin: false, kind, detail: "" });
  const people = groupIssues([issue("a", "lucky"), issue("b", "wallet"), issue("b", "orphan_weapon"), issue("c", "lucky")]);
  assert.deepEqual(people.map((p) => [p.user_id, p.issues.length]), [["b", 2], ["a", 1], ["c", 1]]);
});

test("열쇠조각 표 보호가 깨진 곳만 알려 준다", () => {
  assert.deepEqual(tableProblems([{ table: "key_ledger", rls: true, write_grant: false, write_policies: 0 }]), []);
  const bad = tableProblems([{ table: "key_wallets", rls: false, write_grant: true, write_policies: 1 }]);
  assert.equal(bad.length, 3);
  assert.ok(bad.every((line) => line.startsWith("key_wallets")));
});

test("기간의 시작: 오늘은 한국 날짜 0시, 전체는 비움", () => {
  // UTC 2026-11-04 16:30 = 한국 11-05 01:30 → 한국 11-05 0시 = UTC 11-04 15:00
  const now = Date.parse("2026-11-04T16:30:00Z");
  assert.equal(sinceOf("today", now), "2026-11-04T15:00:00.000Z");
  assert.equal(sinceOf("7", now), "2026-10-28T16:30:00.000Z");
  assert.equal(sinceOf("all", now), null);
});
