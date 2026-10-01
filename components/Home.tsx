"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  addedAt,
  compareDeadline,
  daysUntil,
  formatDate,
  isClosed,
  isNew,
  visibleForSchool,
} from "../lib/filter.ts";
import type { FilterCategory } from "../lib/filter.ts";
import { useToday, useUser } from "../lib/user.tsx";
import type { ProgramView as Program } from "../lib/filter.ts";
import { ChevronIcon } from "./Icons.tsx";
import { FieldIcon } from "./FieldIcon.tsx";
import { InstallCard } from "./InstallCard.tsx";
import { ProgramRow } from "./ProgramRow.tsx";

const URGENT_DAYS = 7;

interface Props {
  programs: Program[];
  categories: FilterCategory[];
}

function Section({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {href && (
          <Link href={href} className="more">
            전체 보기 <ChevronIcon size={16} />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export function Home({ programs, categories }: Props) {
  const { schoolId, favorites, signedIn, loginEnabled, profile } = useUser();
  const today = useToday();

  const open = useMemo(
    () => programs.filter((p) => visibleForSchool(p, schoolId) && !isClosed(p, today)),
    [programs, schoolId, today],
  );

  const urgent = useMemo(
    () =>
      open
        .filter((p) => p.recruitPeriod.end && daysUntil(p.recruitPeriod.end, today) <= URGENT_DAYS)
        .sort((a, b) => compareDeadline(a, b, today)),
    [open, today],
  );

  const fresh = useMemo(
    () => open.filter((p) => isNew(p, today)).sort((a, b) => addedAt(b).localeCompare(addedAt(a))),
    [open, today],
  );

  // 프로필에서 고른 관심 분야의 모집 중 공고 (최신순)
  const interests = profile.interests;
  const picked = useMemo(
    () => open.filter((p) => p.tags.some((t) => interests.includes(t))).sort((a, b) => addedAt(b).localeCompare(addedAt(a))),
    [open, interests],
  );
  const interestHref = `/programs?${interests.map((t) => `tag=${encodeURIComponent(t)}`).join("&")}&sort=recent`;

  const todayCount = fresh.filter((p) => addedAt(p) === today).length;

  // 내 관심 공고의 다가오는 일정 3개
  const myEvents = useMemo(() => {
    const events: { date: string; kind: string; program: Program }[] = [];
    for (const p of programs.filter((p) => favorites.has(p.id))) {
      if (p.recruitPeriod.end && p.recruitPeriod.end >= today) events.push({ date: p.recruitPeriod.end, kind: "마감", program: p });
      if (p.activityPeriod.start && p.activityPeriod.start >= today) events.push({ date: p.activityPeriod.start, kind: "활동", program: p });
    }
    return events.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  }, [programs, favorites, today]);

  const field = categories.find((c) => c.id === "field");

  if (!today) {
    return (
      <div className="home">
        <div className="hero skeleton-block" />
        <div className="section skeleton-block tall" />
      </div>
    );
  }

  const year = Number(today.slice(0, 4));
  const [, month, day] = today.split("-").map(Number);

  return (
    <div className="home">
      <section className="hero">
        <p className="hero-date">
          {month}월 {day}일 {formatDate(today, year).slice(-2, -1)}요일
        </p>
        <h1>
          {todayCount > 0 ? (
            <>
              오늘 새로 올라온 공고
              <br />
              <Link href="/programs?sort=recent">
                <strong>{todayCount}개</strong>
              </Link>
              가 있어요
            </>
          ) : fresh.length > 0 ? (
            <>
              오늘은 새 공고가 없어요
              <br />
              최근 3일 동안{" "}
              <Link href="/programs?sort=recent">
                <strong>{fresh.length}개</strong>
              </Link>
              가 올라왔어요
            </>
          ) : (
            <>
              최근 3일 동안
              <br />새 공고가 없어요
            </>
          )}
        </h1>
        <div className="hero-stats">
          <Link href="/programs" className="stat">
            <span>지원 가능</span>
            <strong>{open.length}</strong>
          </Link>
          <Link href="/programs" className="stat">
            <span>마감 임박</span>
            <strong className="warn">{urgent.length}</strong>
          </Link>
          <Link href="/calendar" className="stat">
            <span>관심 공고</span>
            <strong>{programs.filter((p) => favorites.has(p.id)).length}</strong>
          </Link>
        </div>
      </section>

      <InstallCard />

      <Section title="마감 임박 공고" href="/programs">
        {urgent.length === 0 ? (
          <p className="section-empty">일주일 안에 마감되는 공고가 없어요.</p>
        ) : (
          <ul className="rows">
            {urgent.slice(0, 4).map((p) => (
              <ProgramRow key={p.id} program={p} today={today} compact />
            ))}
          </ul>
        )}
      </Section>

      {interests.length > 0 && (
        <Section title="내 관심 분야 공고" href={interestHref}>
          {picked.length === 0 ? (
            <p className="section-empty">{interests.join(", ")} 분야에 지금 모집 중인 공고가 없어요.</p>
          ) : (
            <ul className="rows">
              {picked.slice(0, 4).map((p) => (
                <ProgramRow key={p.id} program={p} today={today} compact />
              ))}
            </ul>
          )}
        </Section>
      )}

      {field && (
        <Section title="분야별로 둘러보기">
          <div className="shortcut-grid">
            {field.tags.map((tag) => {
              const count = open.filter((p) => p.tags.includes(tag)).length;
              return (
                <Link
                  key={tag}
                  href={`/programs?tag=${encodeURIComponent(tag)}`}
                  className={`shortcut ${count === 0 ? "dim" : ""}`}
                >
                  <span className="shortcut-label">
                    <span className="shortcut-icon">
                      <FieldIcon name={tag} />
                    </span>
                    {tag}
                  </span>
                  <strong>{count}</strong>
                </Link>
              );
            })}
          </div>
        </Section>
      )}

      <Section title="새로 올라온 공고" href="/programs?sort=recent">
        {fresh.length === 0 ? (
          <p className="section-empty">최근 3일 동안 새로 올라온 공고가 없어요.</p>
        ) : (
          <ul className="rows">
            {fresh.slice(0, 4).map((p) => (
              <ProgramRow key={p.id} program={p} today={today} compact />
            ))}
          </ul>
        )}
      </Section>

      <Section title="내 다가오는 일정" href="/calendar">
        {myEvents.length > 0 ? (
          <ul className="rows">
            {myEvents.map(({ date, kind, program }) => {
              const left = daysUntil(date, today);
              return (
                <li key={program.id + kind} className="row event-row">
                  <div className="event-date">
                    <strong>{left === 0 ? "오늘" : `D-${left}`}</strong>
                    <span>{formatDate(date, year)}</span>
                  </div>
                  <div className="row-body">
                    <div className="row-meta">
                      <span className={kind === "마감" ? "warn" : "accent"}>{kind === "마감" ? "모집 마감" : "활동 시작"}</span>
                    </div>
                    <Link href={`/programs/${program.id}`} className="row-title">
                      {program.title}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="section-empty">
            {loginEnabled && !signedIn
              ? "로그인하고 관심 공고에 ☆를 누르면 일정이 여기에 모여요."
              : "관심 있는 공고에 ☆를 누르면 일정이 여기에 모여요."}
          </p>
        )}
      </Section>
    </div>
  );
}
