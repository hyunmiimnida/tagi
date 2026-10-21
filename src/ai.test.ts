import assert from "node:assert/strict";
import test from "node:test";
import { failureReason, isUsageLimitError } from "./ai.ts";

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
