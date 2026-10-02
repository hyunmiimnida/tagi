import assert from "node:assert/strict";
import test from "node:test";
import { isDuplicate, titleSimilarity } from "./dedupe.ts";
import { extractPeriods, isMandatoryNotice, isStaffHiring, parseDates } from "./extract.ts";

test("여러 형태의 날짜를 읽는다", () => {
  assert.deepEqual(parseDates("2026. 9. 30.(수) ~ 10. 14.(수)", 2026), ["2026-09-30", "2026-10-14"]);
  assert.deepEqual(parseDates("26.10.01.(목) ~ 10.30.(금)", 2025), ["2026-10-01", "2026-10-30"]);
  assert.deepEqual(parseDates("12월 20일 ~ 1월 10일", 2026), ["2026-12-20", "2027-01-10"]);
  assert.deepEqual(parseDates("[10/7(수) 12:00까지] 10월 1차 채용", 2026), ["2026-10-07"]);
  assert.deepEqual(parseDates("2026-09-16 ~ 2026-10-08", 2026), ["2026-09-16", "2026-10-08"]);
  // 같은 달에서 날짜만 줄면 해를 넘기지 않는다 (일정 변경 "4.23 → 4.21")
  assert.deepEqual(parseDates("2026.4.23.(목) → 4.21.(화)까지", 2026), ["2026-04-23", "2026-04-21"]);
});

test("모집 기간과 활동 기간을 구분한다", () => {
  const { recruit, activity } = extractPeriods(
    ["특강 참가자 모집", "신청 기간 : 2026.10.1.(목) ~ 10.7.(수)", "일시", "2026.10.13.(화) 14:00~16:00"],
    2026,
  );
  assert.deepEqual(recruit, { start: "2026-10-01", end: "2026-10-07" });
  assert.deepEqual(activity, { start: "2026-10-13", end: "2026-10-13" });
});

test("마감일만 있으면 모집 마감으로 본다", () => {
  assert.deepEqual(extractPeriods(["[10/7(수) 12:00까지] 행정보조직 채용"], 2026).recruit, { start: null, end: "2026-10-07" });
});

test("표현이 조금 다른 같은 프로그램은 중복으로 본다", () => {
  const base = { recruitPeriod: { start: null, end: "2026-10-06" }, activityPeriod: { start: null, end: null } };
  const a = { ...base, title: "[대한민국 육군] 장군단과 함께하는 육군 학사장교 모집설명회 & 상담회" };
  const b = { ...base, title: "[대한민국 육군]장군단과 함께하는 육군 학사장교 모집설명회&상담회 안내" };
  assert.ok(titleSimilarity(a.title, b.title) >= 0.8);
  assert.ok(isDuplicate(a as never, b as never));
  assert.ok(!isDuplicate(a as never, { ...b, recruitPeriod: { start: null, end: "2026-11-06" } } as never));
});

test("AI 없이 다시 수집해도 AI가 추출한 주최·태그는 유지한다", async () => {
  const { mergePrograms } = await import("./dedupe.ts");
  const base = {
    id: "s-1", title: "설명회", organizer: "학생성공처", organizerType: "학교",
    target: { schools: ["x"], colleges: [], departments: [], grades: [] },
    recruitPeriod: { start: null, end: "2026-10-05" }, activityPeriod: { start: null, end: null },
    tags: ["학교"], links: [{ sourceId: "s", url: "u1" }], sources: ["s"], postedAt: null,
    extractedBy: "rules" as const, collectedAt: "2026-10-01T00:00:00Z",
  };
  const saved = { ...base, organizer: "대한항공", organizerType: "기업", tags: ["기업", "박람회·설명회"], extractedBy: "ai" as const };
  const fresh = { ...base, recruitPeriod: { start: null, end: "2026-10-07" } };
  const [merged] = mergePrograms([saved], [fresh]);
  assert.equal(merged.organizer, "대한항공");
  assert.deepEqual(merged.tags, ["기업", "박람회·설명회"]);
  assert.equal(merged.recruitPeriod.end, "2026-10-07"); // 출처가 준 날짜는 최신 값
});

test("표현이 많이 다른 출처 간 제목은 AI 판단 후보로 고른다", async () => {
  const { findAmbiguousPairs } = await import("./dedupe.ts");
  const make = (id: string, source: string, title: string) => ({
    id, title, organizer: null, organizerType: null,
    target: { schools: [], colleges: [], departments: [], grades: [] },
    recruitPeriod: { start: null, end: "2026-10-10" }, activityPeriod: { start: null, end: null },
    tags: [], links: [{ sourceId: source, url: id }], sources: [source], postedAt: null,
    extractedBy: "rules" as const, collectedAt: "2026-10-01T00:00:00Z",
  });
  const a = make("a", "yu-career", "[고용노동부] 2026 미래내일 일경험 사업 참여자 모집");
  const b = make("b", "yu-news", "2026 미래내일 일경험 프로그램 안내");
  const c = make("c", "yu-news", "2학기 집단상담 프로그램");
  // 다른 학교(경북대)에 올라온 비슷한 글은 합칠 후보로 고르지 않는다
  const d = make("d", "knu-notice", "2026 미래내일 일경험 프로그램 안내");
  const pairs = findAmbiguousPairs([a, b, c, d]);
  assert.equal(pairs.length, 1);
  assert.deepEqual(pairs[0].map((p) => p.id), ["a", "b"]);
});

test("AI가 외부 단체를 학교로 분류하면 바로잡는다", async () => {
  const { fixOrganizerType } = await import("./ai.ts");
  const categories = [
    { id: "organizer-type", name: "주최 유형", matchOn: "organizer" as const, tags: [
      { name: "공공기관", keywords: ["재단", "진흥원"] },
      { name: "학교", keywords: [] },
    ] },
  ];
  const outside = { organizer: "벤처기업협회 대구경북지회", organizerType: "학교", tags: ["학교", "공모전·대회"] };
  fixOrganizerType(outside as never, categories);
  assert.equal(outside.organizerType, null);
  assert.deepEqual(outside.tags, ["공모전·대회"]);
  const foundation = { organizer: "한국장학재단", organizerType: "학교", tags: ["학교"] };
  fixOrganizerType(foundation as never, categories);
  assert.equal(foundation.organizerType, "공공기관");
  const school = { organizer: "YU 사회공헌단", organizerType: "학교", tags: ["학교"] };
  fixOrganizerType(school as never, categories);
  assert.equal(school.organizerType, "학교");
});

test("학년 표기를 1~4학년으로 맞춘다", async () => {
  const { normalizeGrades } = await import("./ai.ts");
  assert.deepEqual(normalizeGrades(["3학년 이상"]), ["3학년", "4학년"]);
  assert.deepEqual(normalizeGrades(["2~3학년"]), ["2학년", "3학년"]);
  assert.deepEqual(normalizeGrades(["4학년", "1학년"]), ["1학년", "4학년"]);
  assert.deepEqual(normalizeGrades(["5학기 이상 이수자", "대학원생", "2·3학년 제외", "고학년"]), []);
});

test("같은 게시판에 다시 올린 글은 하나로 합치고 나중 일정을 따른다", async () => {
  const { collapseReposts } = await import("./dedupe.ts");
  const post = (id: string, title: string, postedAt: string, end: string | null) =>
    ({
      id, title, postedAt, sources: ["news"], links: [{ sourceId: "news", url: id }], extractedBy: "ai",
      recruitPeriod: { start: null, end }, activityPeriod: { start: null, end: null }, tags: [], target: {},
      organizer: null, organizerType: null,
    }) as never;
  const merged = collapseReposts([
    post("a", "학생홍보대사 31기 모집", "2026-09-04", "2026-09-15"),
    post("b", "[재게시] 학생홍보대사 31기 모집", "2026-09-14", "2026-09-22"),
    post("c", "학생홍보대사 31기 모집", "2027-03-01", null),
  ]) as { id: string; recruitPeriod: { end: string | null }; links: unknown[] }[];
  assert.deepEqual(merged.map((p) => p.id), ["a", "c"]);
  assert.equal(merged[0].recruitPeriod.end, "2026-09-22");
  assert.equal(merged[0].links.length, 2);
});

test("말이 안 되는 기간은 버린다", async () => {
  const { plausiblePeriod } = await import("./extract.ts");
  assert.deepEqual(plausiblePeriod({ start: "2025-09-22", end: "2029-02-01" }, "2026-04-13"), { start: null, end: null });
  assert.deepEqual(plausiblePeriod({ start: "2023-07-01", end: "2026-06-01" }, "2026-05-07"), { start: null, end: null });
  assert.deepEqual(plausiblePeriod({ start: "2026-03-01", end: "2026-12-31" }, "2026-02-20"), { start: "2026-03-01", end: "2026-12-31" });
});

test("학년 나열은 범위로 넓히지 않는다", async () => {
  const { normalizeGrades } = await import("./ai.ts");
  assert.deepEqual(normalizeGrades(["1,3학년"]), ["1학년", "3학년"]);
  assert.deepEqual(normalizeGrades(["2·4학년"]), ["2학년", "4학년"]);
});

test("AI 없이 수집할 때 신청할 것이 없는 단순 안내 제목을 알아본다", async () => {
  const { looksLikeNoticeOnly } = await import("./extract.ts");
  assert.ok(looksLikeNoticeOnly("총무과 소관 규정 개정(안) 공고 및 의견조회 알림"));
  assert.ok(looksLikeNoticeOnly("계명아트센터 어셔(Usher) 21기 서류 합격자"));
  assert.ok(!looksLikeNoticeOnly("2027년 (재)대산농촌재단 장학생 선발 안내"));
  assert.ok(!looksLikeNoticeOnly("2026학년도 MY 포트폴리오 공모전"));
});

test("끝나는 날이 게시일보다 한참 앞서면 연도 넘김을 고치거나 모르는 값으로 둔다", async () => {
  const { plausiblePeriod } = await import("./extract.ts");
  // 12/30에 올린 "~1/4" 마감을 같은 해로 읽은 경우 → 다음 해로
  assert.deepEqual(plausiblePeriod({ start: null, end: "2025-01-04" }, "2025-12-30"), { start: null, end: "2026-01-04" });
  // 1년을 더해도 이미 지난 날 → 모름
  assert.deepEqual(plausiblePeriod({ start: null, end: "2025-04-24" }, "2026-08-18"), { start: null, end: null });
  assert.deepEqual(plausiblePeriod({ start: null, end: "1954-06-01" }, "2026-02-20"), { start: null, end: null });
  // 60일 안쪽은 재게시일 수 있어 그대로
  assert.deepEqual(plausiblePeriod({ start: null, end: "2026-09-18" }, "2026-09-22"), { start: null, end: "2026-09-18" });
});

test("학교가 자기 직원을 뽑는 공고만 직원 채용으로 본다", () => {
  assert.ok(isStaffHiring("대구가톨릭대학교 행정지원직 직원 채용 공고(11월1부)"));
  assert.ok(isStaffHiring("[진로취업지원팀] 영남대학교 산학협력단 계약직원 채용(5월 4차)"));
  assert.ok(isStaffHiring("2025년도 제2회 중소기업성장지원센터 기간제 계약직원 채용 공고"));
  // 바깥 기관의 신입 채용, 채용 설명회, 교수 초빙 세미나는 학생 기회다
  assert.ok(!isStaffHiring("2023년 한국부동산원 신입직원 및 경력직원 채용공고"));
  assert.ok(!isStaffHiring("2026년도 「한국은행 대구경북본부」 종합기획직원(G5) 채용설명회"));
  assert.ok(!isStaffHiring("[누구나 참가 가능] 미국 텍사스대학교 교수 초빙 세미나 안내"));
  assert.ok(!isStaffHiring("[10/7(수) 12:00까지] 영남대학교 산학협력단 10월 1차 행정보조 학생 모집"));
});

test("의무 교육·제도 안내는 빼고, 그 주제의 공모전·참여자 모집은 남긴다", () => {
  assert.ok(isMandatoryNotice("2026학년도 2학기 폭력예방교육 수강 안내"));
  assert.ok(isMandatoryNotice("[필수(법정)교육] 2026학년도 2학기 학생 대상 온라인 폭력예방교육 수강 안내"));
  assert.ok(isMandatoryNotice("[안내] 2026학년도 제안제도 시행"));
  assert.ok(isMandatoryNotice("2024학년도 실험동물 사용·관리 등에 관한 법정교육 안내 (원격교육)"));
  assert.ok(!isMandatoryNotice("💰상금100만원💰폭력예방교육 수강 후기 공모전"));
  assert.ok(!isMandatoryNotice("찾아가는 폭력예방교육 참여자 모집 [비교과]"));
  assert.ok(!isMandatoryNotice("2026 중독예방교육 웹툰·숏폼 공모전 참가자 모집"));
});
