import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import test, { afterEach, beforeEach, mock } from "node:test";
import { assignSeries, baseTitle, seriesMatch } from "./series.ts";
import type { Program } from "./types.ts";

// 저장된 판단 파일 대신 빈 판단 목록으로 검사한다.
beforeEach(() => {
  mock.method(fs, "readFile", async (file: URL) => {
    assert.equal(file.href, new URL("../data/series-decisions.json", import.meta.url).href);
    return "{}";
  });
  syncBuiltinESMExports();
});

afterEach(() => {
  mock.restoreAll();
  syncBuiltinESMExports();
});

const program = (title: string, organizer: string | null = "국제교류팀") => {
  const year = title.match(/20\d{2}/)?.[0] ?? "2026";
  return {
    title,
    organizer,
    postedAt: `${year}-05-01`,
    collectedAt: `${year}-05-01T00:00:00Z`,
    recruitPeriod: { start: null, end: null },
    activityPeriod: { start: null, end: null },
  } as unknown as Program;
};

test("기본 제목에서 연도·학기·회차·상태 표시를 지운다", () => {
  assert.equal(baseTitle("(재게시) 2026학년도 하계 글로벌 해외탐방 참가자 모집 안내"), baseTitle("2025년 하계 글로벌 해외탐방 모집"));
  assert.equal(baseTitle("제47회 영대문화상 공모"), baseTitle("제46회 영대문화상 공모"));
  assert.equal(baseTitle("[기간연장] 2026-2학기 YU Can Do 안내 (9/21~10/13)"), baseTitle("2025-1학기 YU Can Do 안내"));
});

test("해마다 열리는 같은 프로그램은 묶고, 다른 프로그램은 묶지 않는다", () => {
  assert.equal(seriesMatch(program("2025 하계 글로벌 해외탐방 모집"), program("2026 하계 글로벌 해외탐방 참가자 모집")), true);
  assert.equal(seriesMatch(program("2026 취업 특강: 면접 전략"), program("2026 창업 아이디어 경진대회")), false);
  // 너무 짧은 이름은 주최까지 같을 때만 묶는다
  assert.equal(seriesMatch(program("2025 특강", "A팀"), program("2026 특강", "B팀")), false);
  // 같은 시기에 열리는 비슷한 이름은 다른 프로그램이다
  assert.equal(seriesMatch(program("2026 AI 기반 학업 전략 공모전"), program("2026 AI 기반 학업계획서 공모전")), false);
});

test("같은 틀에 맨 앞 이름(회사·지역)만 다른 제목은 다른 프로그램으로 본다", async () => {
  const { baseTitle, swappedName } = await import("./series.ts");
  const base = (t: string) => baseTitle(t);
  assert.ok(swappedName(base("[실습생 모집_🔋이차전지] (주)솔라라이트 2026-여름학기 국내 현장실습학기제 참여학생 모집안내"), base("[실습생 모집_🖥️반도체] 셈테크(주) 2026-여름학기 국내 현장실습학기제 참여학생 모집안내")));
  assert.ok(swappedName(base("2025학년도 울진군 향토생활관 입사생 선발 공고"), base("2025학년도 영주시 향토생활관 입사생 선발 공고")));
  // 뒤쪽 말이 조금 다른 것(온라인↔사이버)이나 회차·날짜만 다른 것은 같은 프로그램일 수 있다
  assert.ok(!swappedName(base("2026년도 재학생 장애인식개선교육(온라인) 실시 안내"), base("2020년도 재학생 장애인식개선교육(사이버) 실시 안내")));
  assert.ok(!swappedName(base("2026년 9월 무료 모의 TOEIC 시험"), base("2026년 8월 무료 모의 TOEIC 시험")));
});

test("부서 머리말이 같아도 다른 프로그램은 묶지 않고, 사슬처럼 다른 회사 공고가 이어지지 않는다", async () => {
  const { assignSeries } = await import("./series.ts");
  const make = (id: string, title: string, posted: string, organizer = "현장실습지원팀") =>
    ({ id, title, organizer, organizerType: "학교", sources: ["yu-news"], postedAt: posted, collectedAt: `${posted}T00:00:00Z`,
       recruitPeriod: { start: null, end: null }, activityPeriod: { start: null, end: null } }) as unknown as Program;
  const list = [
    make("a1", "[실습생 모집] (주)솔라라이트 2025-여름학기 국내 현장실습학기제 참여학생 모집안내", "2025-05-01"),
    make("a2", "[실습생 모집] (주)솔라라이트 2026-여름학기 국내 현장실습학기제 참여학생 모집안내", "2026-05-01"),
    make("b1", "[실습생 모집] 셈테크(주) 2025-여름학기 국내 현장실습학기제 참여학생 모집안내", "2025-05-03"),
    make("b2", "[실습생 모집] 셈테크(주) 2026-여름학기 국내 현장실습학기제 참여학생 모집안내", "2026-05-03"),
    make("c1", "[학생상담센터] 2025학년도 2학기 집단상담 프로그램 실시", "2025-09-01", "학생상담센터"),
    make("c2", "[학생상담센터] 2026학년도 2학기 집단상담 프로그램 실시", "2026-09-01", "학생상담센터"),
    make("d1", "[학생상담센터] 2026학년도 2학기 CST 강점 검사 온라인 실시", "2026-03-01", "학생상담센터"),
  ];
  await assignSeries(list, [], { useAi: false });
  const sid = Object.fromEntries(list.map((p) => [p.id, p.seriesId]));
  assert.equal(sid.a1, sid.a2);
  assert.equal(sid.b1, sid.b2);
  assert.notEqual(sid.a1, sid.b1);
  assert.equal(sid.c1, sid.c2);
  assert.notEqual(sid.d1, sid.c1);
});

test("titleInfo: 회차·연도를 지운 기본 제목과 글자쌍(유사도 계산용)", async () => {
  const { titleInfo } = await import("./series.ts");
  const a = titleInfo({ title: "2025학년도 제3회 창업 아이디어 경진대회" } as never);
  const b = titleInfo({ title: "2026학년도 제4회 창업 아이디어 경진대회" } as never);
  assert.equal(a.base, b.base);
  assert.ok(a.base.length > 0 && !/\d/.test(a.base));
  assert.ok(a.grams.size > 0);
  assert.deepEqual([...a.grams].sort(), [...b.grams].sort());
});

const round = (id: string, year: number, seriesId?: string): Program => ({
  ...program(`${year} 하계 글로벌 해외탐방 모집`),
  id,
  organizerType: "학교",
  sources: ["yu-news"],
  ...(seriesId ? { seriesId } : {}),
});

test("목록이나 보관함에 혼자 남아도 기존 묶음 id를 유지한다", async () => {
  for (const archived of [false, true]) {
    for (const seriesId of ["remaining", "removed"]) {
      const remaining = round("remaining", 2026, seriesId);
      const count = await assignSeries(archived ? [] : [remaining], archived ? [remaining] : [], { useAi: false });
      assert.equal(remaining.seriesId, seriesId);
      assert.equal(count, 0);
    }
  }
});

test("처음부터 혼자인 공고에는 묶음 id를 만들지 않는다", async () => {
  for (const archived of [false, true]) {
    const single = round("single", 2026);
    assert.equal(await assignSeries(archived ? [] : [single], archived ? [single] : [], { useAi: false }), 0);
    assert.equal(Object.hasOwn(single, "seriesId"), false);
  }
});

test("새 묶음은 목록과 보관함 중 가장 오래된 공고의 id를 쓴다", async () => {
  const current = round("current", 2026);
  const archived = round("archived", 2025);
  assert.equal(await assignSeries([current], [archived], { useAi: false }), 1);
  assert.equal(current.seriesId, "archived");
  assert.equal(archived.seriesId, "archived");
});

test("대표 공고가 없어져도 남은 여러 공고의 기존 묶음 id를 유지한다", async () => {
  const current = round("current", 2026, "removed");
  const archived = round("archived", 2025, "removed");
  assert.equal(await assignSeries([current], [archived], { useAi: false }), 1);
  assert.equal(current.seriesId, "removed");
  assert.equal(archived.seriesId, "removed");
});

test("묶음이 하나로 줄었다가 새 회차가 붙어도 같은 id로 이어진다", async () => {
  const first = round("first", 2025);
  const remaining = round("remaining", 2026);
  await assignSeries([remaining], [first], { useAi: false });
  assert.equal(remaining.seriesId, "first");

  await assignSeries([remaining], [], { useAi: false });
  assert.equal(remaining.seriesId, "first");

  const next = round("next", 2027);
  await assignSeries([next], [remaining], { useAi: false });
  assert.equal(next.seriesId, "first");
  assert.equal(remaining.seriesId, "first");
  await assignSeries([next], [remaining], { useAi: false });
  assert.equal(next.seriesId, "first");
});

test("묶음을 합칠 때 대표 공고가 남아 있는 기존 id를 먼저 쓴다", async () => {
  const absent = round("absent", 2024, "removed");
  const left = round("left", 2025, "left");
  const right = round("right", 2026, "right");
  assert.equal(await assignSeries([absent, left, right], [], { useAi: false }), 1);
  assert.deepEqual([absent.seriesId, left.seriesId, right.seriesId], ["left", "left", "left"]);
});

test("합칠 묶음의 대표가 모두 없어졌으면 첫 기존 id를 재사용한다", async () => {
  const current = round("current", 2026, "removed-current");
  const archived = round("archived", 2025, "removed-archive");
  assert.equal(await assignSeries([current], [archived], { useAi: false }), 1);
  assert.equal(current.seriesId, "removed-current");
  assert.equal(archived.seriesId, "removed-current");
});
