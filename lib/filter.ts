import { GRADES, STUDENT_STATUSES } from "../src/types.ts";
import type { Program } from "../src/types.ts";

export const SITE_NAME = "캠퍼스모아";
// 배포 주소 (사이트맵·공유 미리보기에 쓴다). 주소를 바꾸면 NEXT_PUBLIC_SITE_URL 로 덮어쓴다
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tagi-ten.vercel.app";

export interface FilterCategory {
  id: string;
  name: string;
  tags: string[];
}

// 같은 카테고리 안에서는 "또는", 다른 카테고리끼리는 "그리고"
export function matchesTags(programTags: string[], selected: Set<string>, categories: FilterCategory[]): boolean {
  return categories.every((category) => {
    const chosen = category.tags.filter((tag) => selected.has(tag));
    return chosen.length === 0 || chosen.some((tag) => programTags.includes(tag));
  });
}

// 화면에서 쓰는 공고: 저장된 정보에 학교·기관을 빌드할 때 덧붙인 것
export interface ProgramView extends Program {
  schoolIds: string[]; // 출처가 속한 학교 + 모집 대상 학교
  schoolLabels: string[]; // "영남대" 같은 짧은 이름
  units: string[]; // 교내 기관 (사업단 등)
}

export interface SchoolOption {
  id: string;
  name: string;
  shortName: string;
  units: string[];
}

// 주최 유형이 학교이고 주최 이름에 기관 키워드가 들어 있으면 그 기관 소속이다
export function unitsOf(program: Program, units: { name: string; keywords: string[] }[]): string[] {
  const organizer = program.organizer;
  if (!organizer || program.organizerType !== "학교") return [];
  // 띄어쓰기가 제각각이라("글로벌공생 HUSS 사업단") 공백을 지우고 비교한다
  const compact = (text: string) => text.replace(/\s+/g, "").toLowerCase();
  const name = compact(organizer);
  return units.filter((unit) => unit.keywords.some((keyword) => name.includes(compact(keyword)))).map((unit) => unit.name);
}

// 검색: 제목·주최·한 줄 요약·태그에서 찾는다. 띄어 쓴 단어는 모두 들어 있어야 하고, 띄어쓰기는 무시한다
// ("삼성 아카데미" → "삼성청년SW아카데미"도 찾는다)
export function matchesKeyword(program: Pick<Program, "title" | "organizer" | "summary" | "tags">, keyword: string): boolean {
  const words = keyword.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = [program.title, program.organizer, program.summary, ...program.tags].join(" ").replace(/\s+/g, "").toLowerCase();
  return words.every((word) => text.includes(word));
}

// 학교를 고르면 그 학교 정보와 모든 학교 공통 정보가 보인다.
// includeOpen이면 다른 학교에 올라왔어도 다른 학교 학생이 지원할 수 있는 공고(target.openTo)도 함께 보인다
export function visibleForSchool(program: ProgramView, schoolId: string | null, includeOpen = true): boolean {
  if (!schoolId || program.schoolIds.length === 0 || program.schoolIds.includes(schoolId)) return true;
  return includeOpen && Boolean(program.target.openTo);
}

// 학교 필터 안의 "대상" 선택지: 신분 3개와 학년 4개
export const ELIGIBILITY = [...STUDENT_STATUSES, ...GRADES];

// 이 신분이 참여할 수 있는지. 신분 제한이 없으면(빈 목록) 누구나, 명시적으로 뺀 신분은 안 된다
function allows(program: Program, status: string): boolean {
  const { statuses = [], excludedStatuses = [] } = program.target;
  return !excludedStatuses.includes(status) && (statuses.length === 0 || statuses.includes(status));
}

// 고른 대상 조건에 맞는지. 신분끼리·학년끼리는 "또는", 신분과 학년은 "그리고"
export function matchesEligibility(program: Program, selected: Set<string>): boolean {
  const statuses = STUDENT_STATUSES.filter((s) => selected.has(s));
  const grades = GRADES.filter((g) => selected.has(g));
  if (statuses.length > 0 && !statuses.some((s) => allows(program, s))) return false;
  if (grades.length > 0) {
    // 학년은 다니고 있는 학생(재학·휴학)에게만 의미가 있다. 신분을 골랐으면 그중 재학·휴학이 이 공고에 지원할 수 있어야 한다
    const enrolled = (statuses.length > 0 ? statuses : ["재학생", "휴학생"]).filter((s) => s !== "졸업생");
    if (!enrolled.some((s) => allows(program, s))) return false;
    const allowed = program.target.grades;
    if (allowed.length > 0 && !grades.some((g) => allowed.includes(g))) return false;
  }
  return true;
}

// 상세 화면의 모집 대상 문구. 예: "영남대학교 재학생(휴학생 제외) - 1학년, 2학년 · 공과대학"
export function describeTarget(program: Program, schoolNames: Record<string, string>): string {
  const { schools, colleges, departments, grades, statuses = [], excludedStatuses = [], openTo } = program.target;
  // 다른 학교 학생도 지원할 수 있으면 공고에 적힌 대상(예: 전국 대학생)을 그대로 보여 준다
  const school = openTo || schools.map((id) => schoolNames[id] ?? id).join(", ") || "모든 학교";
  const who = statuses.join("·") + (excludedStatuses.length > 0 ? `(${excludedStatuses.join("·")} 제외)` : "");
  const head = [school, who].filter(Boolean).join(" ");
  const withGrades = grades.length > 0 ? `${head} - ${grades.join(", ")}` : head;
  return [withGrades, ...[colleges, departments].filter((list) => list.length > 0).map((list) => list.join(", "))].join(" · ");
}

// 고른 기관 중 하나라도 속하면 보인다 (아무것도 안 골랐으면 모두)
export const matchesUnits = (program: ProgramView, units: Set<string>) =>
  units.size === 0 || program.units.some((unit) => units.has(unit));

// 마지막 일정. 모집 마감일이 있으면 그 날짜, 없으면 활동 종료일
export const lastDay = (program: Program) => program.recruitPeriod.end ?? program.activityPeriod.end;

// 마감일을 모르는 공고는 올라온 지 이만큼 지나면 마감된 것으로 본다 (오래된 공고가 계속 "모집 중"으로 보이지 않게)
export const UNDATED_OPEN_DAYS = 30;

export function isClosed(program: Program, today: string): boolean {
  const end = lastDay(program);
  if (end !== null) return end < today;
  return daysUntil(today, addedAt(program)) > UNDATED_OPEN_DAYS;
}

export function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000);
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

// "2026-10-07" → "10.7(수)". 올해가 아니면 연도를 붙인다
export function formatDate(date: string, currentYear: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(year, month - 1, day).getDay()];
  return `${year === currentYear ? "" : `${year}.`}${month}.${day}(${weekday})`;
}

// 공모전·대회는 "모집" 대신 "접수"라고 쓴다 (작품·참가 신청을 받는 것이라서)
export const recruitWord = (program: Pick<Program, "tags">) => (program.tags.includes("공모전·대회") ? "접수" : "모집");

export function formatPeriod(period: { start: string | null; end: string | null }, currentYear: number): string | null {
  const { start, end } = period;
  if (!start && !end) return null;
  if (!start || start === end) return (start ? "" : "~ ") + formatDate((start ?? end)!, currentYear);
  if (!end) return `${formatDate(start, currentYear)} ~`;
  return `${formatDate(start, currentYear)} ~ ${formatDate(end, currentYear)}`;
}

export function toDateString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// 올라온 날. 게시일 → 접수 시작일 → 처음 수집한 날 순으로 쓴다
export function addedAt(program: Program): string {
  // 수집 시각은 UTC라서, 보는 사람의 시간대 날짜로 바꾼다 (한국 아침 9시 전 수집분이 전날로 보이지 않게)
  const firstSeen = toDateString(new Date(program.firstSeenAt ?? program.collectedAt));
  const start = program.recruitPeriod.start;
  return program.postedAt ?? (start && start < firstSeen ? start : firstSeen);
}

export const NEW_DAYS = 3;

export const isNew = (program: Program, today: string) => daysUntil(today, addedAt(program)) < NEW_DAYS;

// 마감이 가까운 순. 마감된 항목은 뒤로, 마감일을 모르는 항목은 최근 게시 순으로 그 사이에 둔다
export function compareDeadline(a: Program, b: Program, today: string): number {
  const x = lastDay(a);
  const y = lastDay(b);
  const xClosed = x !== null && x < today;
  const yClosed = y !== null && y < today;
  if (xClosed !== yClosed) return xClosed ? 1 : -1;
  if (x && y) return xClosed ? y.localeCompare(x) : x.localeCompare(y);
  if (x || y) return x ? -1 : 1;
  return (b.postedAt ?? "").localeCompare(a.postedAt ?? "");
}
