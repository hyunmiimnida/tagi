import { readFileSync } from "node:fs";
import type { Program, School } from "./types.ts";

// 공고가 어느 학교 출처에서 왔는지. 중복 합치기·반복 프로그램 묶기는 같은 학교 공고끼리만 한다
// (학교마다 올리는 "국가장학금 신청 안내" 같은 비슷한 제목을 서로 합치지 않게)

const schools: School[] = JSON.parse(readFileSync(new URL("../config/schools.json", import.meta.url), "utf8"));
const schoolBySource = new Map(schools.flatMap((school) => school.sources.map((source) => [source.id, school.id])));

// 설정에 있는 학교 이름과 짧은 이름 (예: 주최 이름이 학교인지 볼 때)
export const SCHOOL_NAMES = schools.flatMap((school) => [school.name, school.shortName]);

const schoolsOf = (program: Program) => (program.sources ?? []).map((id) => schoolBySource.get(id) ?? id);

export function sameSchool(a: Program, b: Program): boolean {
  const [x, y] = [schoolsOf(a), schoolsOf(b)];
  if (x.length === 0 || y.length === 0) return true; // 출처를 모르면 막지 않는다
  return x.some((school) => y.includes(school));
}

// 공고를 올린 학교의 정식 이름들 (예: 주최 "서울대학교 경력개발센터"에서 올린 학교 이름을 뗄 때)
export function postingSchoolNames(program: Program): string[] {
  const ids = new Set(schoolsOf(program));
  return schools.filter((school) => ids.has(school.id)).map((school) => school.name);
}
