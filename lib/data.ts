import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Program, School, TagCategory } from "../src/types.ts";
import { unitsOf } from "./filter.ts";
import type { FilterCategory, ProgramView, SchoolOption } from "./filter.ts";

// 서버에서 수집 결과와 설정 파일을 읽는다

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), path), "utf8"));
}

const readSchools = () => readJson<School[]>("config/schools.json");

// 저장된 공고에 학교(출처가 속한 학교 + 모집 대상 학교)와 교내 기관을 덧붙인다
function toView(program: Program, schools: School[]): ProgramView {
  const schoolIds = new Set(program.target.schools);
  for (const school of schools) {
    if (school.sources.some((source) => program.sources.includes(source.id))) schoolIds.add(school.id);
  }
  const mine = schools.filter((school) => schoolIds.has(school.id));
  return {
    ...program,
    schoolIds: [...schoolIds],
    schoolLabels: mine.map((school) => school.shortName),
    units: mine.flatMap((school) => unitsOf(program, school.units ?? [])),
  };
}

export function getPrograms(): ProgramView[] {
  const schools = readSchools();
  return readJson<Program[]>("data/programs.json").map((program) => toView(program, schools));
}

// 보관함(마지막 일정이 오래 지난 공고). 반복 프로그램의 지난 회차를 보여 줄 때만 쓴다
let archiveCache: Program[] | null = null;
function getArchive(): Program[] {
  try {
    archiveCache ??= readJson<Program[]>("data/archive.json");
  } catch {
    archiveCache = [];
  }
  return archiveCache;
}

const roundStart = (p: Program) => p.recruitPeriod.start ?? p.postedAt ?? p.activityPeriod.start ?? p.collectedAt.slice(0, 10);
const NEAR_MS = 30 * 86_400_000; // 한 달 안에 다시 올린 글(재게시·기간연장)은 같은 회차로 친다

// 같은 반복 프로그램의 지난 회차들 (최근 순)
export function getPastRounds(program: Program): Program[] {
  if (!program.seriesId) return [];
  const mine = roundStart(program);
  const near = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) < NEAR_MS;
  const members = [...readJson<Program[]>("data/programs.json"), ...getArchive()]
    .filter((p) => p.seriesId === program.seriesId && p.id !== program.id && roundStart(p) < mine)
    .sort((a, b) => roundStart(b).localeCompare(roundStart(a)));

  const rounds: Program[] = [];
  for (const p of members) {
    if (near(roundStart(p), mine) || rounds.some((r) => near(roundStart(r), roundStart(p)))) continue;
    rounds.push(p);
  }
  return rounds;
}

export const getCategories = (): FilterCategory[] =>
  readJson<TagCategory[]>("config/tag-categories.json").map(({ id, name, tags }) => ({
    id,
    name,
    tags: tags.map((tag) => tag.name),
  }));

export const getSchools = (): SchoolOption[] =>
  readSchools().map(({ id, name, shortName, units }) => ({
    id,
    name,
    shortName,
    units: (units ?? []).map((unit) => unit.name),
  }));

// 출처 id → "영남대학교 취업정보" 같은 표시 이름
export function getSourceNames(): Record<string, string> {
  const names: Record<string, string> = {};
  for (const school of readSchools()) {
    for (const source of school.sources) names[source.id] = `${school.name} ${source.name}`;
  }
  return names;
}

// 마지막 수집 시각을 "10.1 06:00" 형식(한국 시간)으로
export function getLastCollected(): string | null {
  try {
    const { ranAt } = readJson<{ ranAt: string }>("data/collect-log.json");
    const parts = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(ranAt));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${get("month")}.${get("day")} ${get("hour")}:${get("minute")}`;
  } catch {
    return null;
  }
}
