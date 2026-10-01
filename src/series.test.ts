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
