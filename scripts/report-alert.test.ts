import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { reportAlertMarkdown } from "./report-alert.ts";

test("신고 알림: 건수와 관리자 화면 링크만 적고, 없는 종류는 뺀다", () => {
  const text = reportAlertMarkdown("https://example.test", { feedback: 2, comments: 0, programs: 1 });
  assert.match(text, /새 의견 2건/);
  assert.match(text, /example\.test\/admin#feedback/);
  assert.match(text, /공고 정보 오류 신고 1건/);
  assert.doesNotMatch(text, /댓글 신고/);
  assert.equal(reportAlertMarkdown("https://example.test", { feedback: 0, comments: 0, programs: 0 }), "");
});

test("공개 이슈에 들어갈 수 있으니 notify.ts는 글 내용 칸을 읽지 않는다", () => {
  const source = readFileSync(new URL("./notify.ts", import.meta.url), "utf8");
  const reports = source.slice(source.indexOf("async function reports"), source.indexOf("async function markReported"));
  assert.doesNotMatch(reports, /\b(body|note|reason|category)\b/);
});
