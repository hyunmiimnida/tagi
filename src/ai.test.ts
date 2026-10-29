import assert from "node:assert/strict";
import test from "node:test";
import { applyAiResult, failureReason, isUsageLimitError } from "./ai.ts";
import { cleanPeriods } from "./extract.ts";
import type { CollectedItem } from "./types.ts";

function itemWithRuleDates(): CollectedItem {
  return {
    program: {
      id: "s-1", title: "참가자 모집", organizer: null, organizerType: null,
      target: { schools: [], colleges: [], departments: [], grades: [] },
      recruitPeriod: { start: "2026-10-01", end: "2026-10-10", yearGuessed: true },
      activityPeriod: { start: "2026-11-01", end: "2026-11-10", yearGuessed: true },
      tags: [], links: [], sources: [], postedAt: "2026-10-01",
      extractedBy: "rules", collectedAt: "2026-10-01T00:00:00Z",
    },
    writer: null, text: "참가자 모집",
  };
}

const studentAnswer = { forStudents: true, tags: [], grades: [] };

test("AI가 기간을 null로 답하면 규칙 날짜와 추측 표시를 비운다", () => {
  const item = itemWithRuleDates();
  assert.equal(applyAiResult(item, {
    ...studentAnswer, recruitStart: null, recruitEnd: null, activityStart: null, activityEnd: null,
  }, []), true);
  assert.deepEqual(item.program.recruitPeriod, { start: null, end: null });
  assert.deepEqual(item.program.activityPeriod, { start: null, end: null });
  assert.equal(item.program.extractedBy, "ai");
});

test("AI 답에 기간 칸이 없으면 해당 규칙 날짜와 추측 표시를 유지한다", () => {
  for (const data of [studentAnswer, { ...studentAnswer, activityStart: null, activityEnd: null }]) {
    const item = itemWithRuleDates();
    const recruit = { ...item.program.recruitPeriod };
    const activity = { ...item.program.activityPeriod };
    applyAiResult(item, data, []);
    assert.deepEqual(item.program.recruitPeriod, recruit);
    assert.deepEqual(item.program.activityPeriod, "activityStart" in data ? { start: null, end: null } : activity);
  }
});

test("AI 기간 칸이 하나만 있어도 해당 기간 전체를 답대로 바꾼다", () => {
  for (const [key, field, side] of [
    ["recruitStart", "recruitPeriod", "start"], ["recruitEnd", "recruitPeriod", "end"],
    ["activityStart", "activityPeriod", "start"], ["activityEnd", "activityPeriod", "end"],
  ] as const) {
    for (const value of [null, "2026-10-15"]) {
      const item = itemWithRuleDates();
      applyAiResult(item, { ...studentAnswer, [key]: value }, []);
      assert.deepEqual(item.program[field], { start: null, end: null, [side]: value });
    }
  }
});

test("AI 기간의 시작이 끝보다 늦으면 규칙 날짜로 되돌리지 않고 비운다", () => {
  const item = itemWithRuleDates();
  applyAiResult(item, {
    ...studentAnswer, recruitStart: "2026-10-20", recruitEnd: "2026-10-10",
    activityStart: "2026-11-20", activityEnd: "2026-11-10",
  }, []);
  assert.deepEqual(item.program.recruitPeriod, { start: null, end: null });
  assert.deepEqual(item.program.activityPeriod, { start: null, end: null });
});

test("AI가 정한 지난 일정은 연도를 더하지 않고 추측 표시도 남기지 않는다", () => {
  const item = itemWithRuleDates();
  applyAiResult(item, {
    ...studentAnswer, recruitStart: null, recruitEnd: "2026-01-10",
    activityStart: "2026-01-20", activityEnd: "2026-01-21",
  }, []);
  cleanPeriods(item.program);
  assert.deepEqual(item.program.recruitPeriod, { start: null, end: "2026-01-10" });
  assert.deepEqual(item.program.activityPeriod, { start: "2026-01-20", end: "2026-01-21" });
});

test("AI 날짜도 게시일에서 너무 이르거나 늦으면 비운다", () => {
  const item = itemWithRuleDates();
  applyAiResult(item, {
    ...studentAnswer, recruitStart: "2024-01-01", recruitEnd: "2026-10-10",
    activityStart: "2026-11-01", activityEnd: "2028-10-01",
  }, []);
  assert.deepEqual(item.program.recruitPeriod, { start: null, end: null });
  assert.deepEqual(item.program.activityPeriod, { start: null, end: null });
});

const command = '"C:\\Program Files\\Claude\\claude.exe" -p --model sonnet';
const cliError = (details = {}) => Object.assign(new Error(`Command failed: ${command}`), { cmd: command }, details);

test("CLI 실패는 stderr의 마지막 안내와 종료 코드를 남긴다", () => {
  const error = cliError({ code: 1, stderr: `연결 중\r\n로그인이 필요합니다\r\n  \r\n${command}\r\n`, stdout: "다른 출력" });
  assert.equal(failureReason(error), "로그인이 필요합니다 (종료 코드: 1)");
});

test("stderr에 안내가 없으면 stdout에서 빈 줄과 명령어를 빼고 찾는다", () => {
  const error = cliError({ stderr: `Command failed: ${command}\n`, stdout: "처리 중\n사용 한도에 도달했습니다\nclaude -p\n \n" });
  assert.equal(failureReason(error), "사용 한도에 도달했습니다");
  assert.equal(failureReason(cliError({ stdout: Buffer.from("이전 줄\n마지막 안내\n") })), "마지막 안내");
});

test("출력이 없으면 message의 안내를 쓰고 명령어만 있으면 기본 이유를 쓴다", () => {
  const error = cliError();
  error.message += "\n실행 권한이 없습니다\n";
  assert.equal(failureReason(error), "실행 권한이 없습니다");
  assert.equal(failureReason(cliError({ code: 2 })), "명령 실행 실패 (종료 코드: 2)");
});

test("시간 초과 표시와 오류 코드도 남긴다", () => {
  assert.equal(failureReason(cliError({ killed: true, code: 1, stderr: "처리 중" })), "시간 초과 (종료 코드: 1)");
  assert.equal(failureReason(cliError({ signal: "SIGTERM" })), "시간 초과");
  assert.equal(failureReason(Object.assign(new Error("spawn ETIMEDOUT"), { code: "ETIMEDOUT" })), "시간 초과 (오류 코드: ETIMEDOUT)");
});

test("긴 CLI 안내도 종료 코드를 포함해 200자까지만 남긴다", () => {
  const reason = failureReason(cliError({ code: 7, stderr: "가".repeat(300) }));
  assert.equal(reason.length, 200);
  assert.ok(reason.endsWith(" (종료 코드: 7)"));
});

test("JSON 해석 같은 일반 오류는 원래 message를 쓴다", () => {
  const error = new SyntaxError("JSON 해석 실패\n" + "나".repeat(250));
  assert.equal(failureReason(error), error.message);
  assert.equal(failureReason("일반 오류"), "일반 오류");
  assert.equal(failureReason(null), "null");
});

test("사용 한도는 message와 stderr·stdout 전체에서 감지한다", () => {
  for (const field of ["message", "stderr", "stdout"]) {
    for (const notice of ["Hit your usage limit", "You've hit your session limit · resets 2:50am", "usage limit reached", "RATE_LIMIT_EXCEEDED"]) {
      const error = cliError({ [field]: `${"앞".repeat(250)}\n${notice}\n마지막 안내` });
      assert.ok(isUsageLimitError(error));
    }
  }
  assert.ok(isUsageLimitError(cliError({ stdout: Buffer.from("usage limit reached") })));
  assert.ok(!isUsageLimitError(cliError({ stderr: "연결 실패" })));
});
