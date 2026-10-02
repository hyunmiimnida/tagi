import assert from "node:assert/strict";
import test from "node:test";
import { addedAt, isClosed, isCurrent, matchesEligibility, visibleForSchool } from "./filter.ts";
import type { ProgramView } from "./filter.ts";
import { fromListProgram, toListProgram } from "./list.ts";

const full: ProgramView = {
  id: "yu-1",
  title: "2026 하계 현장실습",
  organizer: "영남대학교 취업처",
  organizerType: "학교",
  target: {
    schools: ["yu"],
    colleges: ["공과대학"],
    departments: [],
    grades: ["3학년", "4학년"],
    statuses: ["재학생"],
    excludedStatuses: ["휴학생"],
    openTo: null,
  },
  recruitPeriod: { start: "2026-06-01", end: "2026-06-10" },
  activityPeriod: { start: null, end: null },
  tags: ["취업·채용"],
  links: [{ sourceId: "yu-career", url: "https://example.com/1" }],
  sources: ["yu-career"],
  postedAt: "2026-05-30",
  extractedBy: "ai",
  collectedAt: "2026-05-31T01:00:00.000Z",
  firstSeenAt: "2026-05-30T22:00:00.000Z",
  summary: "여름방학 기업 현장실습 참가자 모집",
  noApplication: false,
  seriesId: "s-1",
  schoolIds: ["yu"],
  schoolLabels: ["영남대"],
  units: [],
};

test("목록 파일은 빈 값과 상세 전용 칸(원문 링크·출처·단과대학)을 뺀다", () => {
  const item = toListProgram(full);
  assert.deepEqual(Object.keys(item).sort(), [
    "excluded", "grades", "id", "org", "orgType", "posted", "recruit", "schoolIds", "schoolLabels", "schools", "seen", "series", "statuses", "summary", "tags", "title",
  ]);
  assert.equal(item.seen, full.firstSeenAt);
  assert.ok(!JSON.stringify(item).includes("example.com"));
});

test("목록 파일에서 되돌린 공고는 목록 화면의 판단이 원래와 같다", () => {
  const back = fromListProgram(toListProgram(full));
  for (const today of ["2026-06-05", "2026-06-11", "2026-08-01"]) {
    assert.equal(isClosed(back, today), isClosed(full, today));
    assert.equal(isCurrent(back, today), isCurrent(full, today));
  }
  assert.equal(addedAt(back), addedAt(full));
  assert.equal(visibleForSchool(back, "knu"), visibleForSchool(full, "knu"));
  assert.equal(matchesEligibility(back, new Set(["휴학생"])), matchesEligibility(full, new Set(["휴학생"])));
  assert.equal(matchesEligibility(back, new Set(["3학년"])), matchesEligibility(full, new Set(["3학년"])));
  assert.deepEqual(back.recruitPeriod, full.recruitPeriod);
  assert.equal(back.summary, full.summary);
});

test("다른 학교 학생도 지원할 수 있는 공고와 신청 없이 참여하는 행사 표시를 지킨다", () => {
  const open = { ...full, target: { ...full.target, schools: [], openTo: "전국 대학생" }, noApplication: true };
  const back = fromListProgram(toListProgram(open));
  assert.equal(back.target.openTo, "전국 대학생");
  assert.equal(back.noApplication, true);
  assert.equal(visibleForSchool(back, "knu"), visibleForSchool(open, "knu"));
});

test("올라온 날을 모르는 공고(수집 시각만 있음)도 처음 본 시각을 지킨다", () => {
  const { firstSeenAt: _, ...noFirst } = full;
  const back = fromListProgram(toListProgram({ ...noFirst, postedAt: null }));
  assert.equal(addedAt(back), addedAt({ ...noFirst, postedAt: null }));
});
