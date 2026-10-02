import assert from "node:assert/strict";
import test from "node:test";
import { findAmbiguousPairs, isDuplicate, titleSimilarity } from "./dedupe.ts";
import type { Program } from "./types.ts";

const program = (id: string, title: string, source: string, over: Partial<Program> = {}): Program => ({
  id,
  title,
  organizer: null,
  organizerType: null,
  target: { schools: [], colleges: [], departments: [], grades: [] },
  recruitPeriod: { start: null, end: null },
  activityPeriod: { start: null, end: null },
  tags: [],
  links: [{ sourceId: source, url: `https://example.com/${id}` }],
  sources: [source],
  postedAt: null,
  extractedBy: "rules",
  collectedAt: "2026-10-01T00:00:00Z",
  ...over,
});

test("제목 유사도: 같은 제목 1, 띄어쓰기·기호 차이는 무시, 전혀 다른 제목은 낮다", () => {
  assert.equal(titleSimilarity("2026 서포터즈 모집", "2026 서포터즈 모집"), 1);
  assert.ok(titleSimilarity("2026 서포터즈 모집", "[홍보] 2026서포터즈 모집!") >= 0.8);
  assert.ok(titleSimilarity("2026 서포터즈 모집", "장학생 선발 안내") < 0.2);
  assert.equal(titleSimilarity("", "아무 제목"), 0);
});

test("중복 판단: 제목이 80% 이상 비슷해도 마감일·활동 시작일이 다르면 다른 공고", () => {
  const a = program("a", "2026 대학생 서포터즈 모집", "s1", { recruitPeriod: { start: null, end: "2026-10-10" } });
  assert.ok(isDuplicate(a, program("b", "2026 대학생 서포터즈 모집", "s2")));
  assert.ok(isDuplicate(a, program("b", "2026 대학생 서포터즈 모집", "s2", { recruitPeriod: { start: null, end: "2026-10-10" } })));
  assert.ok(!isDuplicate(a, program("b", "2026 대학생 서포터즈 모집", "s2", { recruitPeriod: { start: null, end: "2026-11-10" } })));
  const withActivity = { ...a, activityPeriod: { start: "2026-11-01", end: null } };
  assert.ok(!isDuplicate(withActivity, program("b", "2026 대학생 서포터즈 모집", "s2", { activityPeriod: { start: "2026-11-08", end: null } })));
  assert.ok(!isDuplicate(a, program("b", "창업 아이디어 경진대회", "s2")));
});

test("AI에게 물을 애매한 쌍: 같은 학교의 다른 출처끼리, 유사도 45~80%, 날짜가 맞을 때만", () => {
  // 출처 id는 config/schools.json의 경북대 출처 (같은 학교끼리만 비교한다)
  const base = program("a", "2026 하반기 취업 특강 데이터 분석 직무", "knu-notice");
  const close = program("b", "하반기 취업 특강 데이터 직무 안내", "knu-event"); // 애매하게 비슷함
  const sameSource = program("c", "하반기 취업 특강 데이터 직무 안내", "knu-notice");
  const different = program("d", "장학생 선발 공고", "knu-event");
  const dateClash = program("e", "하반기 취업 특강 데이터 직무 안내", "knu-startup", { recruitPeriod: { start: null, end: "2026-12-01" } });
  const otherSchool = program("f", "하반기 취업 특강 데이터 직무 안내", "pnu-notice");
  const withDate = { ...base, recruitPeriod: { start: null, end: "2026-10-10" } };
  const sim = titleSimilarity(base.title, close.title);
  assert.ok(sim >= 0.45 && sim < 0.8, `테스트 제목의 유사도가 애매한 범위여야 함 (${sim})`);

  const pairs = findAmbiguousPairs([withDate, close, sameSource, different, dateClash, otherSchool]).map(([x, y]) => `${x.id}-${y.id}`);
  assert.ok(pairs.includes("a-b"));
  assert.ok(!pairs.includes("a-c"), "같은 출처끼리는 묻지 않는다");
  assert.ok(!pairs.some((p) => p.includes("d")), "전혀 다른 제목은 묻지 않는다");
  assert.ok(!pairs.includes("a-e"), "마감일이 다르면 묻지 않는다");
  assert.ok(!pairs.some((p) => p.includes("f")), "다른 학교 공고와는 묻지 않는다");
});
