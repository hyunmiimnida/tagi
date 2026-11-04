import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  answersComplete,
  assignVariant,
  compareVariants,
  EVENT_NAMES,
  funnelRows,
  heatmapPage,
  normalCdf,
  parseVariants,
  questionProblem,
  summarizeSurvey,
  surveyFor,
  twoProportionP,
} from "./research.ts";
import type { Question, Survey } from "./research.ts";

const sql = readFileSync(new URL("../supabase/research-data.sql", import.meta.url), "utf8");

test("보낼 수 있는 기록 이름이 서버(research-data.sql)와 같다", () => {
  const list = sql.match(/select array\[([^\]]+)\]/)?.[1] ?? "";
  const names = [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(names, [...EVENT_NAMES]);
});

test("히트맵은 홈·공고 목록·공고 상세(하나로 묶음)에서만", () => {
  assert.equal(heatmapPage("/"), "/");
  assert.equal(heatmapPage("/programs"), "/programs");
  assert.equal(heatmapPage("/programs/yu-123"), "/programs/*");
  assert.equal(heatmapPage("/programs/yu-123/opengraph-image"), null);
  assert.equal(heatmapPage("/my"), null);
});

test("퍼널: 처음 대비·앞 단계 대비 비율과 빠진 수", () => {
  const rows = funnelRows([
    { name: "page_view", path: "/programs", people: 200 },
    { name: "program_open", path: null, people: 80 },
    { name: "apply_click", path: null, people: 20 },
  ]);
  assert.deepEqual(rows.map((r) => [r.fromStart, r.fromPrev, r.dropped]), [
    [100, 100, 0],
    [40, 40, 120],
    [10, 25, 60],
  ]);
  assert.deepEqual(funnelRows([{ name: "a", path: null, people: 0 }, { name: "b", path: null, people: 0 }]).map((r) => r.fromStart), [null, null]);
});

test("A/B 배정: 같은 기기·같은 실험은 늘 같은 변형, 여러 기기는 비율대로 나뉜다", () => {
  const variants = [{ name: "a", weight: 50 }, { name: "b", weight: 50 }];
  assert.equal(assignVariant("device-1", "exp", variants), assignVariant("device-1", "exp", variants));
  const counts = { a: 0, b: 0 } as Record<string, number>;
  for (let i = 0; i < 4000; i++) counts[assignVariant(`device-${i}`, "exp", variants)!] += 1;
  assert.ok(Math.abs(counts.a - 2000) < 200, JSON.stringify(counts));
  const skewed = { a: 0, b: 0 } as Record<string, number>;
  for (let i = 0; i < 4000; i++) skewed[assignVariant(`device-${i}`, "exp2", [{ name: "a", weight: 9 }, { name: "b", weight: 1 }])!] += 1;
  assert.ok(skewed.a > 3400 && skewed.a < 3800, JSON.stringify(skewed));
  assert.equal(assignVariant("d", "exp", []), null);
  assert.deepEqual(parseVariants("a:50, b:30 ,c"), [{ name: "a", weight: 50 }, { name: "b", weight: 30 }, { name: "c", weight: 1 }]);
});

test("두 비율 검정: 정규분포 값, 같은 비율은 p=1, 큰 차이는 p가 작다", () => {
  assert.ok(Math.abs(normalCdf(1.96) - 0.975) < 0.0005);
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-6);
  assert.ok(Math.abs(twoProportionP(10, 100, 10, 100)! - 1) < 1e-6);
  assert.ok(twoProportionP(100, 1000, 160, 1000)! < 0.001);
  assert.equal(twoProportionP(1, 0, 1, 10), null);
});

test("A/B 판단: 표본이 적으면 '아직 일러요', 크면 좋아요·나빠요·우연", () => {
  const early = compareVariants([{ variant: "a", exposed: 50, converted: 5 }, { variant: "b", exposed: 50, converted: 15 }]);
  assert.equal(early[0].verdict, "baseline");
  assert.equal(early[1].verdict, "early");
  const big = compareVariants([
    { variant: "a", exposed: 1000, converted: 100 },
    { variant: "b", exposed: 1000, converted: 160 },
    { variant: "c", exposed: 1000, converted: 60 },
    { variant: "d", exposed: 1000, converted: 105 },
  ]);
  assert.deepEqual(big.map((r) => r.verdict), ["baseline", "better", "worse", "same"]);
  assert.equal(Math.round(big[1].diff! * 10) / 10, 6);
});

const questions: Question[] = [
  { id: "q1", type: "choice", title: "만족도", options: ["좋음", "보통", "별로"] },
  { id: "q2", type: "multi", title: "자주 쓰는 기능", options: ["검색", "캘린더"] },
  { id: "q3", type: "rating", title: "추천 점수" },
  { id: "q4", type: "text", title: "하고 싶은 말" },
];

test("설문 만들기 검사와 답이 다 찼는지 (주관식은 비워도 됨)", () => {
  assert.equal(questionProblem(questions), null);
  assert.match(questionProblem([])!, /하나 이상/);
  assert.match(questionProblem([{ id: "q1", type: "choice", title: "x", options: ["하나"] }])!, /두 개 이상/);
  assert.match(questionProblem([{ id: "q1", type: "text", title: " " }])!, /내용/);
  assert.equal(answersComplete(questions, { q1: "좋음", q2: ["검색"], q3: 4 }), true);
  assert.equal(answersComplete(questions, { q1: "좋음", q2: [], q3: 4 }), false);
  assert.equal(answersComplete(questions, { q1: "좋음", q2: ["검색"], q3: 7 }), false);
});

test("설문 대상: 모두·로그인·그 학교, 닫은 설문은 안 보임", () => {
  const survey = (audience: Survey["audience"], school_id: string | null = null): Survey => ({ id: 1, title: "t", questions, audience, school_id });
  const guest = { signedIn: false, schoolId: null };
  const yu = { signedIn: true, schoolId: "yu" };
  assert.equal(surveyFor(survey("all"), guest, new Set()), true);
  assert.equal(surveyFor(survey("all"), guest, new Set([1])), false);
  assert.equal(surveyFor(survey("login"), guest, new Set()), false);
  assert.equal(surveyFor(survey("school", "yu"), yu, new Set()), true);
  assert.equal(surveyFor(survey("school", "knu"), yu, new Set()), false);
});

test("설문 결과: 객관식 수·별점 평균과 분포·빈 주관식은 뺌", () => {
  const summary = summarizeSurvey(questions, [
    { q1: "좋음", q2: ["검색", "캘린더"], q3: 5, q4: "좋아요" },
    { q1: "보통", q2: ["검색"], q3: 3, q4: "  " },
    { q1: "좋음", q3: 4 },
  ]);
  assert.deepEqual(summary[0].counts, [["좋음", 2], ["보통", 1], ["별로", 0]]);
  assert.deepEqual(summary[1].counts, [["검색", 2], ["캘린더", 1]]);
  assert.equal(summary[1].answered, 2);
  assert.equal(summary[2].average, 4);
  assert.deepEqual(summary[2].ratings, [0, 0, 1, 1, 1]);
  assert.deepEqual(summary[3].texts, ["좋아요"]);
});
