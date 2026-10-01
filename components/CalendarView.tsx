"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { daysUntil, formatDate, toDateString } from "../lib/filter.ts";
import { downloadIcs } from "../lib/ics.ts";
import { useToday, useUser } from "../lib/user.tsx";
import type { ProgramView as Program } from "../lib/filter.ts";
import { CalendarIcon, CalendarPlusIcon, ChevronIcon } from "./Icons.tsx";

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

const isDeadline = (event: CalendarEvent) => event.kind === "모집 마감";

export function CalendarView({ programs }: { programs: Program[] }) {
  const user = useUser();
  const today = useToday();
  const [offset, setOffset] = useState(0); // 이번 달에서 몇 달 떨어져 있는지
  const [picked, setPicked] = useState<string | null>(null); // 누른 날짜

  const favorites = useMemo(() => programs.filter((p) => user.favorites.has(p.id)), [programs, user.favorites]);
  const events = useMemo(() => favorites.flatMap(eventsOf), [favorites]);
  const noDate = favorites.filter((p) => eventsOf(p).length === 0);

  if (!today || !user.ready) return <div className="skeleton-block tall" />;

  if (user.loginEnabled && !user.signedIn) {
    return (
      <div className="empty card-empty">
        <CalendarIcon size={40} />
        <p className="empty-title">관심 공고의 일정을 한눈에</p>
        <p>로그인하고 공고에 ☆를 누르면 모집 마감일과 활동 일정이 여기에 모여요.</p>
        <button className="button primary" onClick={() => user.setLoginOpen(true)}>
          로그인하기
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
  const year = Number(today.slice(0, 4));
  const pickedEvents = picked ? events.filter((event) => event.date === picked) : [];

  return (
    <div className="calendar-page">
      <section className="card calendar-card">
        <div className="calendar-head">
          <button className="icon-button" onClick={() => setOffset(offset - 1)} aria-label="이전 달">
            <ChevronIcon dir="left" size={20} />
          </button>
          <h2>
            {first.getFullYear()}년 {first.getMonth() + 1}월
          </h2>
          <button className="icon-button" onClick={() => setOffset(offset + 1)} aria-label="다음 달">
            <ChevronIcon size={20} />
          </button>
          {offset !== 0 && (
            <button className="text-button" onClick={() => setOffset(0)}>
              오늘
            </button>
          )}
        </div>

        <div className="calendar">
          {WEEKDAYS.map((day, i) => (
            <div key={day} className={`weekday ${i === 0 ? "sun" : i === 6 ? "sat" : ""}`}>
              {day}
            </div>
          ))}
          {cells.map((date, index) => {
            if (!date) return <div key={`blank-${index}`} />;
            const dayEvents = events.filter((event) => event.date === date);
            return (
              <button
                key={date}
                className={`day ${date === today ? "today" : ""} ${date === picked ? "picked" : ""}`}
                onClick={() => setPicked(date === picked ? null : date)}
                aria-label={`${formatDate(date, year)} 일정 ${dayEvents.length}개`}
              >
                <span className="day-number">{Number(date.slice(8))}</span>
                <span className="dots">
                  {dayEvents.slice(0, 3).map((event) => (
                    <i key={event.program.id + event.kind} className={isDeadline(event) ? "warn" : ""} />
                  ))}
                </span>
                <span className="day-titles">
                  {dayEvents.slice(0, 2).map((event) => (
                    <em key={event.program.id + event.kind} className={isDeadline(event) ? "warn" : ""}>
                      {event.program.title}
                    </em>
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        <div className="legend">
          <span>
            <i className="warn" /> 모집 마감
          </span>
          <span>
            <i /> 모집·활동 일정
          </span>
        </div>
      </section>

      {picked && (
        <section className="section">
          <div className="section-head">
            <h2>{formatDate(picked, year)} 일정</h2>
          </div>
          {pickedEvents.length === 0 ? <p className="section-empty">이날은 일정이 없어요.</p> : <EventList events={pickedEvents} today={today} />}
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>다가오는 일정</h2>
          {events.length > 0 && (
            <button className="more" onClick={() => downloadIcs(favorites, "관심-일정.ics")}>
              <CalendarPlusIcon size={16} /> 캘린더 앱으로 내보내기
            </button>
          )}
        </div>
        {favorites.length === 0 ? (
          <p className="section-empty">
            아직 관심 공고가 없어요. <Link href="/programs">공고</Link>에서 ☆를 눌러 보세요.
          </p>
        ) : (
          <EventList
            events={events
              .filter((event) => event.date >= today)
              .sort((a, b) => a.date.localeCompare(b.date))
              .slice(0, 20)}
            today={today}
          />
        )}
      </section>

      {noDate.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>일정을 확인하지 못한 관심 공고</h2>
          </div>
          <ul className="rows">
            {noDate.map((program) => (
              <li key={program.id} className="row">
                <div className="row-body">
                  <Link href={`/programs/${program.id}`} className="row-title">
                    {program.title}
                  </Link>
                  <div className="row-dates">원문에서 일정을 확인해 주세요</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function EventList({ events, today }: { events: CalendarEvent[]; today: string }) {
  const year = Number(today.slice(0, 4));
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) return <p className="section-empty">앞으로 남은 일정이 없어요.</p>;

  return (
    <ul className="rows">
      {sorted.map((event) => {
        const left = daysUntil(event.date, today);
        return (
          <li key={event.program.id + event.kind} className="row event-row">
            <div className="event-date">
              <strong>{left === 0 ? "오늘" : left > 0 ? `D-${left}` : "지남"}</strong>
              <span>{formatDate(event.date, year)}</span>
            </div>
            <div className="row-body">
              <div className="row-meta">
                <span className={isDeadline(event) ? "warn" : "accent"}>{event.kind}</span>
              </div>
              <Link href={`/programs/${event.program.id}`} className="row-title">
                {event.program.title}
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
