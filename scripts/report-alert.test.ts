import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { reportAlertMarkdown } from "./report-alert.ts";

test("신고 알림: 건수와 관리자 화면 링크만 적고, 없는 종류는 뺀다", () => {
  const text = reportAlertMarkdown("https://example.test", { feedback: 2, comments: 0, programs: 1 });
  assert.match(text, /새 문의 2건/);
  assert.match(text, /example\.test\/admin#feedback/);
  assert.match(text, /공고 정보 오류 신고 1건/);
  assert.doesNotMatch(text, /댓글 신고/);
  assert.equal(reportAlertMarkdown("https://example.test", { feedback: 0, comments: 0, programs: 0 }), "");
});

test("문의 보고: 유형별 건수, 급한 문의, 답변 기한을 숫자로 적는다", () => {
  const text = reportAlertMarkdown("https://example.test", {
    feedback: 2,
    feedbackTypes: { "개인정보 요청": 1, 버그: 1 },
    urgent: 1,
    dueSoon: 1,
    aiPending: 2,
    comments: 0,
    programs: 0,
  });
  assert.match(text, /새 문의 2건 \(개인정보 요청 1, 버그 1\)/);
  assert.match(text, /AI가 급하다고 본 문의 1건/);
  assert.match(text, /답변 기한 3일 안\(또는 지남\) 1건/);
  assert.match(text, /AI 확인 대기 2건/);
  // 새 문의가 없어도 급한 문의는 날마다 다시 알린다
  assert.match(reportAlertMarkdown("https://example.test", { feedback: 0, urgent: 1, comments: 0, programs: 0 }), /먼저 확인할 문의/);
});

test("공개 이슈에 들어갈 수 있으니 notify.ts는 글 내용 칸을 읽지 않는다", () => {
  const source = readFileSync(new URL("./notify.ts", import.meta.url), "utf8");
  const reports = source.slice(source.indexOf("async function reports"), source.indexOf("async function markReported"));
  assert.doesNotMatch(reports, /\b(body|note|reason|ai_summary)\b/);
});
