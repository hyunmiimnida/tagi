import type { Program } from "../src/types.ts";
import { SITE_NAME } from "./filter.ts";

// 관심 항목 일정을 캘린더 파일(.ics)로 만든다. 구글·애플·삼성 캘린더에서 열 수 있다.

const compact = (date: string) => date.replaceAll("-", "");

function nextDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
}

const escape = (text: string) => text.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");

// remind: 마감 하루 전 오전 9시에 캘린더 앱이 알림을 띄운다 (하루 종일 일정은 0시에 시작하므로 15시간 전)
function event(uid: string, summary: string, start: string, end: string, url: string, remind = false): string[] {
  return [
    "BEGIN:VEVENT",
    `UID:${uid}@campus-moa`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${compact(start)}`,
    `DTEND;VALUE=DATE:${compact(nextDay(end))}`,
    `SUMMARY:${escape(summary)}`,
    `URL:${url}`,
    `DESCRIPTION:${escape(`원문: ${url}`)}`,
    ...(remind ? ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escape(`내일 마감: ${summary}`)}`, "TRIGGER:-PT15H", "END:VALARM"] : []),
    "END:VEVENT",
  ];
}

// 캘린더 파일 규격: 한 줄이 75바이트를 넘으면 줄을 나누고 다음 줄을 공백으로 시작한다
function fold(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  for (const char of line) {
    const limit = parts.length === 0 ? 75 : 74;
    if (encoder.encode(current + char).length > limit) {
      parts.push(current);
      current = "";
    }
    current += char;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

// 일정의 링크는 이 서비스의 상세 화면으로 연결한다 (원문 링크는 상세 화면에 있다)
export function buildIcs(programs: Program[], origin: string): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${SITE_NAME}//KO`, "CALSCALE:GREGORIAN"];
  for (const program of programs) {
    const url = `${origin}/programs/${program.id}`;
    const { recruitPeriod: recruit, activityPeriod: activity } = program;
    if (recruit.end) lines.push(...event(`${program.id}-deadline`, `[마감] ${program.title}`, recruit.end, recruit.end, url, true));
    if (activity.start) {
      lines.push(...event(`${program.id}-activity`, program.title, activity.start, activity.end ?? activity.start, url));
    }
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function downloadIcs(programs: Program[], filename: string): void {
  const blob = new Blob([buildIcs(programs, window.location.origin)], { type: "text/calendar;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
