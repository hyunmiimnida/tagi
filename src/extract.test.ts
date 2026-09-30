import assert from "node:assert/strict";
import test from "node:test";
import { isDuplicate, titleSimilarity } from "./dedupe.ts";
import { extractPeriods, parseDates } from "./extract.ts";

test("여러 형태의 날짜를 읽는다", () => {
  assert.deepEqual(parseDates("2026. 9. 30.(수) ~ 10. 14.(수)", 2026), ["2026-09-30", "2026-10-14"]);
  assert.deepEqual(parseDates("26.10.01.(목) ~ 10.30.(금)", 2025), ["2026-10-01", "2026-10-30"]);
  assert.deepEqual(parseDates("12월 20일 ~ 1월 10일", 2026), ["2026-12-20", "2027-01-10"]);
  assert.deepEqual(parseDates("[10/7(수) 12:00까지] 10월 1차 채용", 2026), ["2026-10-07"]);
  assert.deepEqual(parseDates("2026-09-16 ~ 2026-10-08", 2026), ["2026-09-16", "2026-10-08"]);
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
