import assert from "node:assert/strict";
import test from "node:test";
import { collapseReposts, findAmbiguousPairs, mergePair, mergePrograms, repostKey, titleSimilarity } from "./dedupe.ts";
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

// 같은 게시판의 서로 다른 글을 만든다
const boardPost = (id: string, title: string, postedAt: string | null): Program => ({
  ...program(id), title, postedAt, sources: ["board"],
});

for (const [titleA, titleB] of [
  ["제1회 대학생 창업 아이디어 공모전", "제2회 대학생 창업 아이디어 공모전"],
  ["2025 대학생 창업 아이디어 공모전", "2026 대학생 창업 아이디어 공모전"],
  ["대학생 홍보 서포터즈 3기 모집 안내", "대학생 홍보 서포터즈 4기 모집 안내"],
  ["대학생 일일봉사자 9월 모집 안내", "대학생 일일봉사자 10월 모집 안내"],
]) {
  test(`다른 출처도 숫자가 다른 회차는 자동 합치지 않는다: ${titleA}`, () => {
    const a = { ...program("a"), sources: ["yu-news"], title: titleA };
    const b = { ...program("b"), sources: ["yu-career"], title: titleB };
    assert.ok(titleSimilarity(a.title, b.title) >= 0.8);
    assert.deepEqual(mergePrograms([a], [b]).map((p) => p.id), ["a", "b"]);
  });
}

for (const [titleA, titleB] of [
  ["2026 제3회 대학생 창업 아이디어 공모전", "2026 제3회 대학생 창업 아이디어 공모전 안내"],
  ["[~9/30] 2026 제3회 대학생 창업 아이디어 공모전", "[~10/7] 2026 제3회 대학생 창업 아이디어 공모전 안내"],
  ["2026 제3회 대학생 창업 아이디어 공모전", "(재게시) 2026 제3회 대학생 창업 아이디어 공모전"],
]) {
  test(`다른 출처도 숫자가 같고 비슷한 제목은 합친다: ${titleB}`, () => {
    const a = { ...program("a"), sources: ["yu-news"], title: titleA };
    const b = { ...program("b"), sources: ["yu-career"], title: titleB };
    assert.ok(titleSimilarity(a.title, b.title) >= 0.8);
    const [merged, ...rest] = mergePrograms([a], [b]);
    assert.equal(rest.length, 0);
    assert.deepEqual(merged.sources, ["yu-news", "yu-career"]);
    assert.deepEqual(merged.links, [...a.links, ...b.links]);
  });
}

test("다른 출처의 같은 제목도 캠퍼스가 다르면 합치지 않는다", () => {
  const a = { ...program("a"), sources: ["yu-news"] };
  const b = { ...program("b"), sources: ["yu-career"] };
  for (const campus of [undefined, "campus-a"]) {
    const kept = mergePrograms([{ ...a, campus }], [{ ...b, campus: "campus-b" }]);
    assert.deepEqual(kept.map((p) => p.id), ["a", "b"]);
  }
  assert.equal(mergePrograms([{ ...a, campus: "campus-a" }], [{ ...b, campus: "campus-a" }]).length, 1);
});

test("같은 게시판도 마감 머리말을 빼고 숫자가 같은 비슷한 제목을 후보로 낸다", () => {
  const a = boardPost("a", "[~9/30] 2026 제3회 대학생 창업 아이디어 공모전", "2026-09-01");
  const b = boardPost("b", "[~10/7] 2026 제3회 대학생 창업 아이디어 공모전 안내", "2026-09-02");
  assert.notEqual(repostKey(a.title), repostKey(b.title));
  assert.deepEqual(findAmbiguousPairs([a, b]), [[a, b]]);
});

for (const [titleA, titleB, dateA, dateB] of [
  ["[진주시] 경남진주지역대학생봉사단 미니박람회 개최", "[진주시] 경남진주지역대학생봉사단 미니박람회", "2026-08-12", "2026-08-10"],
  ["[BLUE/RED/ORANGE BELT] 2026년 하반기 면접 집중교육 참여자 모집 안내(졸업생 참여 가능)", "[BLUE/RED/ORANGE BELT] 2026년 하반기 면접 집중교육 운영 안내(졸업생 참여 가능)", "2026-10-13", "2026-08-24"],
  ["[제주대학교] (기간연장) 제46회 백록학술상 공모전", "[제주대학교] 제46회 백록학술상 공모전", "2026-10-13", "2026-08-11"],
]) {
  test(`같은 게시판의 비슷한 글을 AI 후보로 낸다: ${titleA}`, () => {
    const a = boardPost("a", titleA, dateA);
    const b = boardPost("b", titleB, dateB);
    assert.deepEqual(findAmbiguousPairs(collapseReposts(mergePrograms([a], [b]))).map(([x, y]) => [x.id, y.id]), [["a", "b"]]);
  });
}

test("한쪽 모집 마감이 없어도 같은 게시판의 장학생 모집을 후보로 낸다", () => {
  const a = boardPost("a", "2026년 우양재단 동행 장학생 모집 안내", "2026-10-13");
  const b = boardPost("b", "2026년 우양재단 동행 장학생 모집", "2026-10-10");
  a.recruitPeriod.end = "2026-10-18";
  assert.deepEqual(findAmbiguousPairs([a, b]), [[a, b]]);
});

test("61일 뒤 올라온 같은 제목과 일정의 논문 경진대회도 AI에게 묻는다", () => {
  const title = "[연구산학처] 개교 80주년 기념 첨성인 대학원생 논문 경진대회 개최 안내";
  const a = boardPost("a", title, "2026-08-07");
  const b = boardPost("b", title, "2026-10-07");
  for (const p of [a, b]) {
    p.recruitPeriod.end = "2026-10-16";
    p.activityPeriod.start = "2026-11-13";
  }
  assert.deepEqual(findAmbiguousPairs(collapseReposts([a, b])), [[a, b]]);
});

for (const [titleA, titleB] of [
  ["스포츠단 배구부 재능 기부 참여자 모집", "스포츠단 축구부 재능 기부 참여자 모집"],
  ["겨울계절수업 교류 수학 안내(충북대학교)", "겨울계절수업 교류 수학 안내(전북대학교)"],
  ["대학원생활 만족도 조사", "대학생활 만족도 조사"],
]) {
  test(`한 단어가 다른 같은 게시판 글은 자동 합치지 않고 AI에게 묻는다: ${titleA}`, () => {
    const a = boardPost("a", titleA, "2026-10-01");
    const b = boardPost("b", titleB, "2026-10-02");
    assert.ok(titleSimilarity(a.title, b.title) >= 0.8);
    const kept = collapseReposts(mergePrograms([a], [b]));
    assert.equal(kept.length, 2);
    assert.deepEqual(findAmbiguousPairs(kept), [[kept[0], kept[1]]]);
  });
}

test("출처가 여러 개인 글도 게시판 하나가 겹치면 자동 합치지 않는다", () => {
  const a = boardPost("a", "스포츠단 배구부 재능 기부 참여자 모집", "2026-10-01");
  const b = boardPost("b", "스포츠단 축구부 재능 기부 참여자 모집", "2026-10-02");
  b.sources = ["other", "board"];
  const kept = mergePrograms([a], [b]);
  assert.equal(kept.length, 2);
  assert.deepEqual(findAmbiguousPairs(kept), [[kept[0], kept[1]]]);
});

for (const [titleA, titleB] of [
  ["일일봉사자 9월 모집", "일일봉사자 10월 모집"],
  ["제3회 대학생 공모전", "제4회 대학생 공모전"],
  ["2025년 장학생 모집", "2026년 장학생 모집"],
]) {
  test(`숫자가 다른 회차는 같은 게시판 후보에서 뺀다: ${titleA}`, () => {
    const a = boardPost("a", titleA, "2026-09-01");
    const b = boardPost("b", titleB, "2026-10-01");
    assert.deepEqual(findAmbiguousPairs([a, b]), []);
  });
}

test("같은 게시판은 90일까지 후보로 내고 게시일이 없거나 잘못되면 뺀다", () => {
  const a = boardPost("a", "장학생 모집 안내", "2026-07-01");
  const b = boardPost("b", "장학생 모집", "2026-09-29");
  assert.deepEqual(findAmbiguousPairs([a, b]), [[a, b]]);
  assert.deepEqual(findAmbiguousPairs([b, a]), [[b, a]]);
  for (const postedAt of ["2026-09-30", null, "잘못된 날짜"]) {
    assert.deepEqual(findAmbiguousPairs([a, { ...b, postedAt }]), []);
  }
});

test("같은 제목의 60일 이내 재게시는 이미 규칙으로 합쳐 AI 후보에서 뺀다", () => {
  const a = boardPost("a", "장학생 모집", "2026-08-01");
  const b = boardPost("b", "(재게시) 장학생 모집", "2026-09-30");
  assert.deepEqual(findAmbiguousPairs([a, b]), []);
  assert.equal(collapseReposts([a, b]).length, 1);
});

test("마감 머리말 때문에 유사도가 낮고 숫자가 달라도 재게시 제목이 같으면 후보로 낸다", () => {
  const a = boardPost("a", "[8/7까지 건축학부 인문사회계열 대상] 특강", "2026-08-01");
  const b = boardPost("b", "[10/7까지 전자공학부 자연과학계열 신청] 특강", "2026-10-01");
  assert.ok(titleSimilarity(a.title, b.title) < 0.45);
  assert.equal(repostKey(a.title), repostKey(b.title));
  assert.deepEqual(findAmbiguousPairs([a, b]), [[a, b]]);
});

test("일정이 다르거나 제목이 전혀 다르면 같은 게시판 후보에서 뺀다", () => {
  const a = boardPost("a", "장학생 모집 안내", "2026-10-01");
  const b = boardPost("b", "장학생 모집", "2026-10-02");
  for (const field of ["recruitPeriod", "activityPeriod"] as const) {
    const key = field === "recruitPeriod" ? "end" : "start";
    const x = { ...a, [field]: { ...a[field], [key]: "2026-10-18" } };
    const y = { ...b, [field]: { ...b[field], [key]: "2026-10-19" } };
    assert.deepEqual(findAmbiguousPairs([x, y]), []);
  }
  assert.deepEqual(findAmbiguousPairs([a, { ...b, title: "겨울 해외 봉사활동" }]), []);
});

test("다른 출처는 기존 유사도 범위를 따르고 다른 학교는 후보에서 뺀다", () => {
  const a = { ...program("a"), sources: ["yu-news"], title: "대학생 서포터즈 모집 안내" };
  const b = { ...program("b"), sources: ["yu-career"], title: "대학생 홍보단 모집 안내" };
  const similarity = titleSimilarity(a.title, b.title);
  assert.ok(similarity >= 0.45 && similarity < 0.8);
  // 다른 출처는 게시일이 없어도 기존처럼 판단한다
  assert.deepEqual(findAmbiguousPairs([a, b]), [[a, b]]);
  assert.deepEqual(findAmbiguousPairs([a, { ...b, title: a.title }]), []);
  assert.deepEqual(findAmbiguousPairs([a, { ...b, title: "겨울 해외 봉사활동" }]), []);
  assert.deepEqual(findAmbiguousPairs([a, { ...b, sources: ["another-school"] }]), []);
});

test("같은 출처와 다른 출처 모두 캠퍼스가 다르면 후보에서 뺀다", () => {
  const a = { ...boardPost("a", "대학생 홍보 서포터즈 모집 안내", "2026-10-01"), sources: ["yu-news"] };
  for (const sources of [["yu-news"], ["yu-career"]]) {
    const b = { ...boardPost("b", "대학생 홍보 서포터즈 선발 안내", "2026-10-02"), sources };
    assert.deepEqual(findAmbiguousPairs([a, { ...b, campus: "campus-b" }]), []);
    assert.deepEqual(findAmbiguousPairs([{ ...a, campus: "campus-a" }, { ...b, campus: "campus-b" }]), []);
    const x = { ...a, campus: "campus-a" };
    const y = { ...b, campus: "campus-a" };
    assert.deepEqual(findAmbiguousPairs([x, y]), [[x, y]]);
  }
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

test("(수정)·[수정게시]·(재업로드)·(재안내)·(상시모집)도 같은 공고로 본다", () => {
  assert.equal(repostKey("[수정게시] [★사회공헌단] 해외자원봉사 파견단원 모집"), repostKey("[★사회공헌단] 해외자원봉사 파견단원 모집"));
  assert.equal(repostKey("KNU in the World Program 참가학생 모집 (수정)"), repostKey("KNU in the World Program 참가학생 모집"));
  assert.equal(repostKey("(재안내)[SW중심대학사업단] 창업 경진대회 참가자 모집 안내"), repostKey("[SW중심대학사업단] 창업 경진대회 참가자 모집 안내"));
  assert.equal(repostKey("국제개발협력 동아리원 모집 (상시모집)"), repostKey("국제개발협력 동아리원 모집"));
});

test("두 게시판에 함께 올라온 글도 한 게시판의 재게시와 합친다 (출처 순서가 달라도)", async () => {
  const { collapseReposts } = await import("./dedupe.ts");
  const a = { ...program("x"), id: "a", sources: ["s1", "s2"], title: "벤처클럽 경진대회 모집", postedAt: "2026-09-28" };
  const b = { ...program("x"), id: "b", sources: ["s2", "s1"], title: "벤처클럽 경진대회 모집", postedAt: "2026-09-28" };
  const c = { ...program("x"), id: "c", sources: ["s1"], title: "(재게시) 벤처클럽 경진대회 모집", postedAt: "2026-10-05" };
  const other = { ...program("x"), id: "d", sources: ["s3"], title: "벤처클럽 경진대회 모집", postedAt: "2026-10-01" };
  const kept = collapseReposts([a, b, c, other]);
  assert.deepEqual(kept.map((p) => p.id), ["a", "d"]); // 다른 게시판(s3)의 글은 그대로 둔다
  assert.deepEqual(kept[0].aliases, ["b", "c"]);
});

test("다른 게시판의 매우 비슷한 제목이 숫자만 다르면 규칙으로 합치지 않고 AI에게 묻는다", async () => {
  const { findAmbiguousPairs } = await import("./dedupe.ts");
  const a = { ...program("a"), sources: ["yu-news"], title: "방송미디어 1:1 멘토링 참가자 모집 안내 (~10/29)" };
  const b = { ...program("b"), sources: ["yu-career"], title: "방송미디어 1:1 멘토링 참가자 모집 안내" };
  assert.equal(findAmbiguousPairs([a, b]).length, 1);
});
