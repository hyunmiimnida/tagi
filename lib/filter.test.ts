import assert from "node:assert/strict";
import test from "node:test";
import { matchesKeyword, matchesTags } from "./filter.ts";

const categories = [
  { id: "field", name: "분야", tags: ["취업·채용", "창업"] },
  { id: "format", name: "활동 형태", tags: ["교육·특강", "공모전·대회"] },
];

test("같은 카테고리는 또는, 다른 카테고리는 그리고로 필터링한다", () => {
  const tags = ["취업·채용", "교육·특강"];
  assert.ok(matchesTags(tags, new Set(), categories));
  assert.ok(matchesTags(tags, new Set(["취업·채용", "창업"]), categories));
  assert.ok(matchesTags(tags, new Set(["창업", "취업·채용", "교육·특강"]), categories));
  assert.ok(!matchesTags(tags, new Set(["창업"]), categories));
  assert.ok(!matchesTags(tags, new Set(["취업·채용", "공모전·대회"]), categories));
});

test("날짜를 짧게 보여 준다", async () => {
  const { formatPeriod } = await import("./filter.ts");
  assert.equal(formatPeriod({ start: "2026-10-07", end: "2026-10-07" }, 2026), "10.7(수)");
  assert.equal(formatPeriod({ start: null, end: "2026-10-05" }, 2026), "~ 10.5(월)");
  assert.equal(formatPeriod({ start: "2026-12-20", end: "2027-01-10" }, 2026), "12.20(일) ~ 2027.1.10(일)");
  assert.equal(formatPeriod({ start: null, end: null }, 2026), null);
});

test("교내 기관은 주최 유형이 학교일 때만 키워드로 맞춘다", async () => {
  const { unitsOf } = await import("./filter.ts");
  const units = [{ name: "창업지원단", keywords: ["창업지원단"] }];
  const base = { organizer: "앵커사업단 YUnicorn창업지원단", organizerType: "학교" } as never;
  assert.deepEqual(unitsOf(base, units), ["창업지원단"]);
  assert.deepEqual(unitsOf({ organizer: "OO창업지원단", organizerType: "기업" } as never, units), []);
  assert.deepEqual(unitsOf({ organizer: null, organizerType: "학교" } as never, units), []);
});

test("학교를 고르면 그 학교와 공통 공고만 보인다", async () => {
  const { visibleForSchool } = await import("./filter.ts");
  assert.ok(visibleForSchool({ schoolIds: ["yu"] } as never, "yu"));
  assert.ok(visibleForSchool({ schoolIds: [] } as never, "yu"));
  assert.ok(visibleForSchool({ schoolIds: ["yu"] } as never, null));
  assert.ok(!visibleForSchool({ schoolIds: ["knu"], target: {} } as never, "yu"));
});

const withTarget = (target: Record<string, string[] | string>) =>
  ({ target: { schools: ["yu"], colleges: [], departments: [], grades: [], ...target } }) as never;

test("대상 필터: 신분끼리는 또는, 학년과는 그리고, 제외한 신분은 빼고 고른다", async () => {
  const { matchesEligibility } = await import("./filter.ts");
  const open = withTarget({});
  const enrolledNoLeave = withTarget({ statuses: ["재학생"], excludedStatuses: ["휴학생"] });
  const graduates = withTarget({ statuses: ["졸업생"] });
  const juniors = withTarget({ statuses: ["재학생"], grades: ["3학년", "4학년"] });
  assert.ok(matchesEligibility(open, new Set(["휴학생", "2학년"])));
  assert.ok(!matchesEligibility(enrolledNoLeave, new Set(["휴학생"])));
  assert.ok(matchesEligibility(enrolledNoLeave, new Set(["휴학생", "재학생"])));
  assert.ok(!matchesEligibility(graduates, new Set(["1학년"])));
  assert.ok(matchesEligibility(graduates, new Set(["졸업생"])));
  assert.ok(!matchesEligibility(juniors, new Set(["재학생", "1학년"])));
  assert.ok(matchesEligibility(juniors, new Set(["4학년"])));
});

test("모집 대상 문구를 자세히 만든다", async () => {
  const { describeTarget } = await import("./filter.ts");
  const names = { yu: "영남대학교" };
  assert.equal(describeTarget(withTarget({}), names), "영남대학교");
  assert.equal(describeTarget(withTarget({ statuses: ["재학생"] }), names), "영남대학교 재학생");
  assert.equal(describeTarget(withTarget({ statuses: ["재학생"], grades: ["1학년"] }), names), "영남대학교 재학생 - 1학년");
  assert.equal(
    describeTarget(withTarget({ statuses: ["재학생"], excludedStatuses: ["휴학생"] }), names),
    "영남대학교 재학생(휴학생 제외)",
  );
  assert.equal(describeTarget(withTarget({ statuses: ["졸업생"], colleges: ["공과대학"] }), names), "영남대학교 졸업생 · 공과대학");
  // 다른 학교 학생도 지원할 수 있으면 공고에 적힌 대상을 쓴다
  assert.equal(describeTarget(withTarget({ schools: [], openTo: "전국 대학생", grades: ["3학년", "4학년"] }), names), "전국 대학생 - 3학년, 4학년");
});

test("마감일을 모르는 공고는 올라온 지 30일이 지나면 마감으로 본다", async () => {
  const { isClosed } = await import("./filter.ts");
  const undated = (postedAt: string) =>
    ({ postedAt, collectedAt: postedAt, recruitPeriod: { start: null, end: null }, activityPeriod: { start: null, end: null } }) as never;
  assert.ok(!isClosed(undated("2026-09-20"), "2026-10-01"));
  assert.ok(isClosed(undated("2026-07-20"), "2026-10-01"));
});

test("졸업생과 학년을 함께 고르면 학년 조건은 재학·휴학 자격으로만 따진다", async () => {
  const { matchesEligibility } = await import("./filter.ts");
  const program = withTarget({ statuses: ["재학생", "졸업생"], grades: ["1학년"] });
  assert.ok(!matchesEligibility(program, new Set(["졸업생", "1학년"])));
  assert.ok(matchesEligibility(program, new Set(["재학생", "1학년"])));
});

test("게시일이 없으면 처음 수집한 시각을 보는 사람의 시간대 날짜로 센다", async () => {
  const { addedAt, toDateString } = await import("./filter.ts");
  const seen = "2026-09-30T18:31:28.906Z";
  const program = { postedAt: null, firstSeenAt: seen, collectedAt: seen, recruitPeriod: { start: null, end: null } } as never;
  assert.equal(addedAt(program), toDateString(new Date(seen)));
});

test("학교 필터: 다른 학교에 올라왔어도 지원할 수 있는 공고는 기본으로 함께 보이고, 끌 수 있다", async () => {
  const { visibleForSchool } = await import("./filter.ts");
  const mine = { schoolIds: ["knu"], target: { schools: ["knu"] } } as never;
  const open = { schoolIds: ["yu"], target: { schools: [], openTo: "전국 대학생" } } as never;
  const closed = { schoolIds: ["yu"], target: { schools: ["yu"], openTo: null } } as never;
  assert.ok(visibleForSchool(mine, "knu"));
  assert.ok(visibleForSchool(open, "knu"));
  assert.ok(!visibleForSchool(open, "knu", false));
  assert.ok(!visibleForSchool(closed, "knu"));
  assert.ok(visibleForSchool(closed, null));
});

test("검색은 제목·주최·요약·태그에서 띄어쓰기를 무시하고 모든 단어를 찾는다", () => {
  const p = { title: "삼성청년SW아카데미 14기 모집", organizer: "고용노동부", summary: "1년 동안 무료로 SW 교육을 받아요", tags: ["교육·특강"] };
  assert.ok(matchesKeyword(p, "삼성 아카데미"));
  assert.ok(matchesKeyword(p, "무료"));
  assert.ok(matchesKeyword(p, "교육·특강"));
  assert.ok(matchesKeyword(p, "  "));
  assert.ok(!matchesKeyword(p, "삼성 해외"));
});
