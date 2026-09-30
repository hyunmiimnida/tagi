"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toDateString } from "../lib/filter.ts";
import { useToday, useUser } from "../lib/user.tsx";
import type { Program } from "../src/types.ts";

interface CalendarEvent {
  date: string;
  kind: string;
  program: Program;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function eventsOf(program: Program): CalendarEvent[] {
  const { recruitPeriod: recruit, activityPeriod: activity } = program;
  const events: [string | null, string][] = [
    [recruit.start, "모집 시작"],
    [recruit.end, "모집 마감"],
    [activity.start, activity.start === activity.end ? "활동" : "활동 시작"],
    [activity.start === activity.end ? null : activity.end, "활동 종료"],
  ];
  return events.flatMap(([date, kind]) => (date ? [{ date, kind, program }] : []));
}

export function CalendarView({ programs }: { programs: Program[] }) {
  const user = useUser();
  const today = useToday();
  const [offset, setOffset] = useState(0); // 이번 달에서 몇 달 떨어져 있는지

  const favorites = useMemo(() => programs.filter((p) => user.favorites.has(p.id)), [programs, user.favorites]);
  const events = useMemo(() => favorites.flatMap(eventsOf), [favorites]);
  const noDate = favorites.filter((p) => eventsOf(p).length === 0);

  if (!today || !user.ready) return null;

  if (user.loginEnabled && !user.email) {
    return (
      <div className="empty">
        <p>내 캘린더는 로그인 후 쓸 수 있어요.</p>
        <button className="button" onClick={() => user.setLoginOpen(true)}>
          로그인
        </button>
      </div>
    );
  }

  const base = new Date(today);
  const first = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array<null>(first.getDay()).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => toDateString(new Date(first.getFullYear(), first.getMonth(), i + 1))),
  ];

  return (
    <>
      <div className="calendar-nav">
        <button className="button" onClick={() => setOffset(offset - 1)} aria-label="이전 달">
          ‹
        </button>
        <h2>
          {first.getFullYear()}년 {first.getMonth() + 1}월
        </h2>
        <button className="button" onClick={() => setOffset(offset + 1)} aria-label="다음 달">
          ›
        </button>
        {offset !== 0 && (
          <button className="link-button" onClick={() => setOffset(0)}>
            이번 달
          </button>
        )}
      </div>

      {favorites.length === 0 && (
        <p className="empty">
          아직 관심 표시한 항목이 없어요. <Link href="/">목록</Link>에서 ☆를 눌러 보세요.
        </p>
      )}

      <div className="calendar">
        {WEEKDAYS.map((day) => (
          <div key={day} className="weekday">
            {day}
          </div>
        ))}
        {cells.map((date, index) => (
          <div key={date ?? `blank-${index}`} className={`day ${date === today ? "today" : ""}`}>
            {date && <span className="day-number">{Number(date.slice(8))}</span>}
            {events
              .filter((event) => event.date === date)
              .map((event) => (
                <Link
                  key={event.program.id + event.kind}
                  href={`/programs/${event.program.id}`}
                  className={`event ${event.kind === "모집 마감" ? "deadline" : ""}`}
                  title={`${event.kind}: ${event.program.title}`}
                >
                  <b>{event.kind}</b> {event.program.title}
                </Link>
              ))}
          </div>
        ))}
      </div>

      {noDate.length > 0 && (
        <section>
          <h3>일정을 확인하지 못한 관심 항목</h3>
          <ul>
            {noDate.map((program) => (
              <li key={program.id}>
                <Link href={`/programs/${program.id}`}>{program.title}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
