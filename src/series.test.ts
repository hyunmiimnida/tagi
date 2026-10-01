import assert from "node:assert/strict";
import test from "node:test";
import { baseTitle, seriesMatch } from "./series.ts";
import type { Program } from "./types.ts";

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
