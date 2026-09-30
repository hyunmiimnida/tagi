import type { Program } from "../src/types.ts";

export const SITE_NAME = "캠퍼스모아";

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

// 학교를 설정하면 내 학교 정보와 공통 정보만 보인다
export function visibleForSchool(program: Program, schoolId: string | null): boolean {
  return !schoolId || program.target.schools.length === 0 || program.target.schools.includes(schoolId);
}

// 마지막 일정. 모집 마감일이 있으면 그 날짜, 없으면 활동 종료일
export const lastDay = (program: Program) => program.recruitPeriod.end ?? program.activityPeriod.end;

export function isClosed(program: Program, today: string): boolean {
  const end = lastDay(program);
  return end !== null && end < today;
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
