import assert from "node:assert/strict";
import test from "node:test";
import { mergePair, repostKey } from "./dedupe.ts";
import type { Program } from "./types.ts";

const program = (id: string, openTo?: string | null): Program => ({
  id,
  title: "2026 대학생 서포터즈 모집",
  organizer: null,
  organizerType: null,
  target: { schools: ["yu"], colleges: [], departments: [], grades: [], statuses: [], excludedStatuses: [], openTo },
  recruitPeriod: { start: null, end: null },
  activityPeriod: { start: null, end: null },
  tags: [],
  links: [{ sourceId: id, url: `https://example.com/${id}` }],
  sources: [id],
  postedAt: null,
  extractedBy: "ai",
  collectedAt: "2026-10-01T00:00:00Z",
});

test("합쳐져 없어진 공고의 id를 기억한다", () => {
  const a = program("a");
  const b = { ...program("b"), aliases: ["c"] };
  const [merged] = mergePair([a, b], a, b);
  assert.deepEqual(merged.aliases, ["b", "c"]);
});

test("어느 한쪽이라도 다른 학교 학생에게 열려 있으면 열린 공고로 합친다", () => {
  const a = program("a", null);
  const b = { ...program("b", "전국 대학생"), target: { ...program("b").target, schools: [], openTo: "전국 대학생" } };
  const [merged] = mergePair([a, b], a, b);
  assert.equal(merged.target.openTo, "전국 대학생");
  assert.deepEqual(merged.target.schools, []);
});

test("같은 글을 다시 추출해도 이미 확인한 모집 대상과 예전 id는 남긴다", async () => {
  const { mergePrograms } = await import("./dedupe.ts");
  const saved = { ...program("a", "전국 대학생"), aliases: ["old"] };
  saved.target.schools = [];
  const [merged] = mergePrograms([saved], [program("a")]);
  assert.equal(merged.target.openTo, "전국 대학생");
  assert.deepEqual(merged.target.schools, []);
  assert.deepEqual(merged.aliases, ["old"]);
});

test("다시 수집해도(AI 없이 포함) 요약을 남기고, 합칠 때 빈 요약을 채운다", async () => {
  const { mergePrograms } = await import("./dedupe.ts");
  const saved = { ...program("a"), summary: "서포터즈로 활동하며 활동비를 받아요" };
  const [again] = mergePrograms([saved], [{ ...program("a"), extractedBy: "rules" }]);
  assert.equal(again.summary, "서포터즈로 활동하며 활동비를 받아요");
  const x = program("x");
  const [merged] = mergePair([x, saved], x, saved);
  assert.equal(merged.summary, "서포터즈로 활동하며 활동비를 받아요");
});

test("재게시 머리말(마감 날짜·대상)을 지워 같은 공고로 알아본다", async () => {
  const { repostKey, stripDeadlineHead } = await import("./dedupe.ts");
  assert.equal(
    repostKey("[(재게시) 8/17(월) 까지_인문사회 계열] 🏙️대구도시개발공사 현장실습학기제 모집"),
    repostKey("[8/7(금) 까지_건축학부,인문사회] 🏙️대구도시개발공사 현장실습학기제 모집"),
  );
  assert.equal(repostKey("[🚨9/9(화) 까지] (주)구영테크 현장실습"), repostKey("[🚨9/7(월) 까지] (주)구영테크 현장실습"));
  assert.equal(stripDeadlineHead("[모집기간연장 ~8/12 13:00 까지] 버디 프로그램"), "버디 프로그램");
  // 부서 이름 머리말은 남긴다 (다른 프로그램을 합치지 않게)
  assert.equal(stripDeadlineHead("[학생상담센터] 집단상담 프로그램"), "[학생상담센터] 집단상담 프로그램");
  assert.notEqual(repostKey("[🚨9/9(화) 까지] (주)구영테크 현장실습"), repostKey("[🚨9/9(화) 까지] (주)빔웍스 현장실습"));
});

test("재게시를 합치면 합쳐진 글의 id를 남긴다", async () => {
  const { collapseReposts } = await import("./dedupe.ts");
  const a = { ...program("x"), id: "first", title: "[8/7(금) 까지] 현장실습 모집", postedAt: "2026-08-04" };
  const b = { ...program("x"), id: "second", title: "[(재게시) 8/12(수) 까지] 현장실습 모집", postedAt: "2026-08-10" };
  const [kept, ...rest] = collapseReposts([a, b]);
  assert.equal(rest.length, 0);
  assert.equal(kept.id, "first");
  assert.deepEqual(kept.aliases, ["second"]);
});

test("'선발 연장 공고'도 재게시로 본다", async () => {
  const { repostKey } = await import("./dedupe.ts");
  assert.equal(repostKey("[교외]2026학년도 2학기 (재)대전청년내일재단 장학생 선발 연장 공고"), repostKey("[교외]2026학년도 2학기 (재)대전청년내일재단 장학생 선발 공고"));
});

test("재안내와 앞의 [홍보] 머리말은 같은 공고로 본다", () => {
  assert.equal(repostKey("[혁신] 독서토론클럽 참여자 모집 재안내"), repostKey("[혁신] 독서토론클럽 참여자 모집 안내"));
  assert.equal(repostKey("[홍보][체력증진센터] 운동처방 참여자 모집"), repostKey("[체력증진센터] 운동처방 참여자 모집"));
});

test("추가 모집·상시 모집·(조기 마감)은 같은 공고를 다시 올린 것으로 본다", () => {
  assert.equal(repostKey("부트캠프 교육생 추가 모집 안내"), repostKey("부트캠프 교육생 모집 안내"));
  assert.equal(repostKey("튜터 추가모집(조기 마감)"), repostKey("튜터 모집"));
  assert.notEqual(repostKey("영어권 교환학생 선발"), repostKey("일어권 교환학생 선발"));
});
