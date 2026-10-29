import assert from "node:assert/strict";
import test from "node:test";
import { applyAiResult, confirmDuplicates, confirmSameSeries, enrichWithAi, failureReason, isUsageLimitError } from "./ai.ts";
import { cleanPeriods } from "./extract.ts";
import type { CollectedItem, Program } from "./types.ts";

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

const studentAnswer = {
  forStudents: true, tags: [], grades: [], colleges: [], departments: [], statuses: [], excludedStatuses: [],
};

function fakeAi(...answers: { items?: Record<string, unknown>[]; same?: unknown }[]) {
  let next = 0;
  return {
    find: () => "fake-ai",
    ask: async () => {
      assert.ok(next < answers.length, "준비한 응답보다 많이 호출했습니다");
      return answers[next++];
    },
  };
}

function programPairs(count: number): [Program, Program][] {
  return Array.from({ length: count }, () => [itemWithRuleDates().program, itemWithRuleDates().program]);
}

test("필수 배열이 빠지거나 문자열 배열이 아니면 공고를 바꾸지 않는다", () => {
  for (const key of ["tags", "grades", "colleges", "departments", "statuses", "excludedStatuses"]) {
    for (const value of [undefined, null, "재학생", {}, ["재학생", 1], [null], [{}], [false]]) {
      for (const forStudents of [true, false]) {
        const item = itemWithRuleDates();
        item.program.target.colleges = ["공과대학"];
        item.program.target.departments = ["컴퓨터공학과"];
        item.program.target.statuses = ["재학생"];
        item.program.target.excludedStatuses = ["휴학생"];
        const before = structuredClone(item);
        const data: Record<string, unknown> = {
          ...studentAnswer, forStudents, organizer: "새 기관", recruitEnd: null, [key]: value,
        };
        if (value === undefined) delete data[key];
        assert.equal(applyAiResult(item, data, []), null, `${key}: ${JSON.stringify(value)}`);
        assert.deepEqual(item, before);
      }
    }
  }
});

test("학생 대상 여부가 없거나 불리언이 아니면 불완전한 답이다", () => {
  for (const forStudents of [undefined, null, "true", 1]) {
    const item = itemWithRuleDates();
    const before = structuredClone(item);
    assert.equal(applyAiResult(item, { ...studentAnswer, forStudents }, []), null);
    assert.deepEqual(item, before);
  }
});

test("정상 빈 배열과 null은 허용하고 학생 대상이 아닌 답은 공고를 바꾸지 않는다", () => {
  for (const forStudents of [true, false]) {
    const item = itemWithRuleDates();
    const before = structuredClone(item);
    assert.equal(applyAiResult(item, {
      ...studentAnswer, forStudents, organizer: null, organizerType: null, openTo: null, summary: null,
    }, []), forStudents);
    if (!forStudents) assert.deepEqual(item, before);
    else assert.equal(item.program.extractedBy, "ai");
  }
});

test("실제 달력에 없는 AI 날짜는 예외나 자동 보정 없이 null로 둔다", () => {
  for (const [key, field, side] of [
    ["recruitStart", "recruitPeriod", "start"], ["recruitEnd", "recruitPeriod", "end"],
    ["activityStart", "activityPeriod", "start"], ["activityEnd", "activityPeriod", "end"],
  ] as const) {
    for (const value of ["2026-13-01", "2026-00-01", "2026-01-00", "2026-01-32", "2026-02-29", "2026-02-30", "2026-04-31", "2026-1-01", "invalid", 20261001, null]) {
      const item = itemWithRuleDates();
      assert.equal(applyAiResult(item, { ...studentAnswer, [key]: value }, []), true);
      assert.deepEqual(item.program[field], { start: null, end: null }, `${key}: ${value}`);
    }
    for (const value of ["2028-02-29", "2028-04-30"]) {
      const item = itemWithRuleDates();
      item.program.postedAt = "2028-02-01";
      assert.equal(applyAiResult(item, { ...studentAnswer, [key]: value }, []), true);
      assert.deepEqual(item.program[field], { start: null, end: null, [side]: value });
    }
  }
});

test("추출 응답 하나가 예외를 내도 앞뒤 정상 항목과 제외 판단을 반영한다", async (t) => {
  const errors: string[] = [];
  t.mock.method(console, "error", (...args: unknown[]) => errors.push(args.join(" ")));
  t.mock.method(console, "log", () => {});
  const items = Array.from({ length: 5 }, (_, i) => {
    const item = itemWithRuleDates();
    item.program.id = `s-${i}`;
    return item;
  });
  const broken = {
    ...studentAnswer, id: "s-1",
    get forStudents(): boolean { throw new Error("항목 오류\n상세 이유"); },
  };
  const result = await enrichWithAi(items, [], { posters: false }, fakeAi({ items: [
    { ...studentAnswer, id: "s-0" },
    null as unknown as Record<string, unknown>,
    broken,
    { id: "s-2", forStudents: true, tags: [], grades: [] },
    { ...studentAnswer, id: "s-3", recruitEnd: "2026-13-01", activityEnd: "2026-11-15" },
    { ...studentAnswer, id: "s-4", forStudents: false },
  ] }));
  assert.equal(result.done, 2);
  assert.deepEqual(result.notForStudents, new Set(["s-4"]));
  assert.deepEqual(items.map((item) => item.program.extractedBy), ["ai", "rules", "rules", "ai", "rules"]);
  assert.deepEqual(items[3].program.recruitPeriod, { start: null, end: null });
  assert.equal(items[3].program.activityPeriod.end, "2026-11-15");
  assert.equal(errors.length, 2);
  assert.ok(errors.every((line) => !/[\r\n]/.test(line)));
  assert.ok(errors.some((line) => line.includes("항목 오류 상세 이유")));
});

const invalidSame = [undefined, null, "invalid", {}, [0, -1], [0, 2], [0, 0.5], [0, "1"], [0, null], [0, true]];

test("반복 판단의 same이 잘못되면 묶음 전체를 미확정으로 두고 저장하지 않는다", async (t) => {
  t.mock.method(console, "error", () => {});
  let saved = 0;
  for (const same of invalidSame) {
    const answer = same === undefined ? {} : { same };
    assert.deepEqual(await confirmSameSeries(programPairs(2), async () => { saved++; }, fakeAi(answer)), [undefined, undefined]);
  }
  assert.equal(saved, 0);
});

test("정상 반복 판단은 빈 배열의 false와 범위 안 번호의 true를 저장한다", async (t) => {
  t.mock.method(console, "log", () => {});
  for (const same of [[], [0], [1, 1], [0, 1]]) {
    const expected = [same.includes(0), same.includes(1)];
    const saved: Map<number, boolean>[] = [];
    assert.deepEqual(await confirmSameSeries(programPairs(2), async (part) => { saved.push(part); }, fakeAi({ same })), expected);
    assert.deepEqual(saved, [new Map(expected.map((value, i) => [i, value]))]);
  }
});

test("실패한 반복 판단 묶음 다음에도 계속 처리하고 각 묶음의 번호 범위를 검사한다", async (t) => {
  t.mock.method(console, "error", () => {});
  t.mock.method(console, "log", () => {});
  const saved: Map<number, boolean>[] = [];
  const result = await confirmSameSeries(programPairs(121), async (part) => { saved.push(part); }, fakeAi(
    { same: [0, 60] }, { same: [0, 59] }, { same: [1] },
  ));
  assert.deepEqual(result, [
    ...Array(60).fill(undefined), ...Array.from({ length: 60 }, (_, i) => i === 0 || i === 59), undefined,
  ]);
  assert.deepEqual(saved, [new Map(Array.from({ length: 60 }, (_, i) => [60 + i, i === 0 || i === 59]))]);
});

test("중복 판단도 잘못된 번호가 하나라도 있으면 묶음 전체를 미확정으로 둔다", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const same of invalidSame) {
    assert.equal(await confirmDuplicates(programPairs(2), fakeAi({ same })), null);
  }
  for (const same of [[], [0], [1], [0, 1]]) {
    assert.deepEqual(await confirmDuplicates(programPairs(2), fakeAi({ same })), same);
  }
});

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
