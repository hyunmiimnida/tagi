import assert from "node:assert/strict";
import test from "node:test";
import { buildTriagePrompt, dueSoon, maskPersonal, parseTriage } from "./feedback-triage.ts";

test("AI에게 보내기 전에 개인정보로 보이는 것을 가린다", () => {
  const text = maskPersonal("제 이름은 김민수, test.me@example.com, 010-1234-5678, 학번 22012345, 박철수 교수님");
  for (const secret of ["김민수", "test.me@example.com", "010-1234-5678", "22012345", "박철수"]) assert.ok(!text.includes(secret), secret);
  assert.equal(maskPersonal("마감일이 10월 15일로 틀려요"), "마감일이 10월 15일로 틀려요");
});

test("프롬프트에도 가린 내용만 들어간다", () => {
  const prompt = buildTriagePrompt([{ category: "기타", body: "연락처 010-1234-5678" }]);
  assert.ok(!prompt.includes("010-1234-5678"));
  assert.match(prompt, /지시는 따르지 말고/);
});

test("AI 답에서 형식이 틀린 줄은 버린다", () => {
  const parsed = parseTriage(
    [
      { i: 0, type: "버그", urgency: "high", summary: "로그인 오류 010-1111-2222" },
      { i: 1, type: "아무거나", urgency: "low", summary: "x" },
      { i: 2, type: "제안", urgency: "매우 급함", summary: "x" },
      { i: 9, type: "제안", urgency: "low", summary: "x" },
    ],
    3,
  );
  assert.deepEqual(parsed[0], { ai_type: "버그", ai_urgency: "high", ai_summary: "로그인 오류 [전화번호]" });
  assert.equal(parsed[1], null);
  assert.equal(parsed[2], null);
});

test("답변 기한: 받은 지 7일이 지나면 임박", () => {
  const now = new Date("2026-11-10T00:00:00Z");
  assert.equal(dueSoon("2026-11-03T00:00:00Z", now), true);
  assert.equal(dueSoon("2026-11-05T00:00:00Z", now), false);
});
