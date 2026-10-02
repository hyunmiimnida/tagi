import assert from "node:assert/strict";
import test from "node:test";
import { matchesKeyword, matchesTags, recruitWord } from "./filter.ts";

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

test("공모전·대회는 '접수', 나머지는 '모집'이라고 쓴다", () => {
  assert.equal(recruitWord({ tags: ["공모전·대회", "학교"] }), "접수");
  assert.equal(recruitWord({ tags: ["교육·특강"] }), "모집");
});

test("관심 공고의 다가오는 일정을 가까운 순으로 고른다", async () => {
  const { upcomingEvents } = await import("./filter.ts");
  const p = (id: string, end: string | null, start: string | null) => ({ id, recruitPeriod: { start: null, end }, activityPeriod: { start, end: null } });
  const programs = [p("a", "2026-10-10", "2026-10-20"), p("b", "2026-10-05", null), p("c", "2026-09-01", null), p("d", "2026-10-03", null)];
  const events = upcomingEvents(programs, new Set(["a", "b", "c"]), "2026-10-02");
  assert.deepEqual(events.map((e) => `${e.program.id}:${e.kind}`), ["b:마감", "a:마감", "a:활동"]);
});

test("교내 기관 필터: 하나도 안 고르면 모두, 고르면 그중 하나라도 맞는 공고", async () => {
  const { matchesUnits } = await import("./filter.ts");
  const program = { units: ["RISE사업단"] };
  assert.ok(matchesUnits(program as never, new Set()));
  assert.ok(matchesUnits(program as never, new Set(["RISE사업단", "창업지원단"])));
  assert.ok(!matchesUnits(program as never, new Set(["창업지원단"])));
});

test("마감일은 모집 마감, 없으면 활동 종료일", async () => {
  const { lastDay } = await import("./filter.ts");
  const p = (recruitEnd: string | null, activityEnd: string | null) =>
    ({ recruitPeriod: { start: null, end: recruitEnd }, activityPeriod: { start: null, end: activityEnd } }) as never;
  assert.equal(lastDay(p("2026-10-10", "2026-12-01")), "2026-10-10");
  assert.equal(lastDay(p(null, "2026-12-01")), "2026-12-01");
  assert.equal(lastDay(p(null, null)), null);
});

test("날짜 사이 일수와 요일이 붙은 짧은 날짜", async () => {
  const { daysUntil, formatDate } = await import("./filter.ts");
  assert.equal(daysUntil("2026-10-12", "2026-10-02"), 10);
  assert.equal(daysUntil("2026-10-02", "2026-10-02"), 0);
  assert.equal(daysUntil("2026-09-30", "2026-10-02"), -2);
  assert.equal(daysUntil("2026-03-30", "2026-03-28"), 2); // 서머타임이 있는 곳에서도 반올림해 맞춘다
  assert.equal(formatDate("2026-10-02", 2026), "10.2(금)");
  assert.equal(formatDate("2027-01-01", 2026), "2027.1.1(금)");
});

const dated = (over: Record<string, unknown>) =>
  ({
    id: "x",
    title: "t",
    recruitPeriod: { start: null, end: null },
    activityPeriod: { start: null, end: null },
    postedAt: null,
    collectedAt: "2026-09-01T03:00:00Z",
    ...over,
  }) as never;

test("새 공고는 올라온 지 3일 안", async () => {
  const { isNew } = await import("./filter.ts");
  assert.ok(isNew(dated({ postedAt: "2026-10-01" }), "2026-10-02"));
  assert.ok(isNew(dated({ postedAt: "2026-09-30" }), "2026-10-02"));
  assert.ok(!isNew(dated({ postedAt: "2026-09-29" }), "2026-10-02"));
});

test("아직 볼 만한 공고: 마감 전이거나, 마감이 지나도 활동 일정이 남은 것 (하루 여유)", async () => {
  const { isCurrent } = await import("./filter.ts");
  const today = "2026-10-02";
  assert.ok(isCurrent(dated({ recruitPeriod: { start: null, end: "2026-10-05" } }), today));
  assert.ok(isCurrent(dated({ recruitPeriod: { start: null, end: "2026-10-01" } }), today)); // 어제 마감은 하루 여유로 남긴다
  assert.ok(!isCurrent(dated({ recruitPeriod: { start: null, end: "2026-09-20" } }), today));
  assert.ok(isCurrent(dated({ recruitPeriod: { start: null, end: "2026-09-20" }, activityPeriod: { start: "2026-10-20", end: null } }), today));
});

test("마감순 정렬: 마감 전(가까운 순) → 마감일 모름(최근 게시 순) → 마감 지남(최근 마감 순)", async () => {
  const { compareDeadline } = await import("./filter.ts");
  const today = "2026-10-02";
  const list = [
    dated({ id: "closed-old", recruitPeriod: { start: null, end: "2026-09-01" } }),
    dated({ id: "undated-old", postedAt: "2026-09-25" }),
    dated({ id: "soon", recruitPeriod: { start: null, end: "2026-10-03" } }),
    dated({ id: "closed-recent", recruitPeriod: { start: null, end: "2026-09-30" } }),
    dated({ id: "later", recruitPeriod: { start: null, end: "2026-10-20" } }),
    dated({ id: "undated-new", postedAt: "2026-10-01" }),
  ];
  const order = [...list].sort((a, b) => compareDeadline(a, b, today)).map((p: { id: string }) => p.id);
  assert.deepEqual(order, ["soon", "later", "undated-new", "undated-old", "closed-recent", "closed-old"]);
});
