"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  addedAt,
  compareDeadline,
  daysUntil,
  formatDate,
  isClosed,
  isCurrent,
  isNew,
  recruitWord,
  upcomingEvents,
  visibleForSchool,
} from "../lib/filter.ts";
import type { FilterCategory } from "../lib/filter.ts";
import { useListPrograms } from "../lib/use-list.ts";
import { useToday, useUser } from "../lib/user.tsx";
import type { ProgramView as Program } from "../lib/filter.ts";
import { ChevronIcon } from "./Icons.tsx";
import { FieldIcon } from "./FieldIcon.tsx";
import { InstallCard } from "./InstallCard.tsx";
import { ProfileNudge } from "./ProfileNudge.tsx";
import { ListError } from "./ListError.tsx";
import { MyPal, MyPeekPal } from "./MyPal.tsx";
import { ProgramRow } from "./ProgramRow.tsx";

const URGENT_DAYS = 7;

interface Props {
  categories: FilterCategory[];
  schools: { id: string; name: string }[];
}

// peek: 내 캐릭터가 이 카드를 벽 삼아 고개를 내민다 (한 화면에 한 곳만)
function Section({ title, href, peek, children }: { title: string; href?: string; peek?: boolean; children: React.ReactNode }) {
  return (
    <section className={`section ${peek ? "pal-wall" : ""}`}>
      {peek && <MyPeekPal right={104} />}
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

export function Home({ categories, schools }: Props) {
  const { schoolId, favorites, signedIn, loginEnabled, profile } = useUser();
  const today = useToday();
  // 홈은 아직 볼 만한 공고(마감 전이거나 남은 일정이 있는 것)만 쓴다
  const { programs: loaded, failed, retry } = useListPrograms();
  const programs: Program[] = useMemo(() => (loaded && today ? loaded.filter((p) => isCurrent(p, today)) : []), [loaded, today]);

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
  // 오늘 마감하는 내 관심 공고 (있으면 마감 임박 맨 위에 두고 캐릭터가 알려 준다)
  const alertProgram = useMemo(() => urgent.find((p) => favorites.has(p.id) && p.recruitPeriod.end === today) ?? null, [urgent, favorites, today]);
  const alertId = alertProgram?.id ?? null;
  const urgentShown = alertProgram ? [alertProgram, ...urgent.filter((p) => p !== alertProgram)].slice(0, 4) : urgent.slice(0, 4);

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

  // 머리말: 마지막으로 고른 학교(공고 화면의 학교 필터)가 오늘 올린 소식 수. 다른 학교가 올린 "다른 학교도 지원" 공고는 세지 않는다
  const mySchool = schools.find((s) => s.id === schoolId) ?? null;
  const todayCount = mySchool ? fresh.filter((p) => addedAt(p) === today && p.schoolIds.includes(mySchool.id)).length : 0;

  // 내 관심 공고의 다가오는 일정 3개
  const myEvents = useMemo(() => upcomingEvents(programs, favorites, today), [programs, favorites, today]);

  const field = categories.find((c) => c.id === "field");

  if (failed) return <ListError onRetry={retry} />;
  if (!today || !loaded) {
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
          {!mySchool ? (
            <>대학교를 설정해 보세요!</>
          ) : todayCount > 0 ? (
            <>
              오늘 {mySchool.name} 소식은
              <br />
              <Link href={`/programs?school=${mySchool.id}&sort=recent`}>
                <strong>{todayCount}개</strong>
              </Link>
              가 올라왔어요
            </>
          ) : (
            <>
              오늘 {mySchool.name} 소식은
              <br />
              아직 없어요
            </>
          )}
        </h1>
        {!mySchool && (
          // 학교를 아직 고르지 않았으면 내 캐릭터가 버튼 옆에 앉아 바라본다 (그동안 마감 임박의 빼꼼은 숨김, 한 화면에 한 명)
          <div className="hero-setup">
            <p>학교를 고르면 그 학교에 오늘 올라온 소식을 알려 드려요.</p>
            <span className="hero-setup-pal">
              <MyPal pose="sit" scale={3} />
            </span>
            <Link href="/programs" className="button primary">
              학교 고르기
            </Link>
          </div>
        )}
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

      <ProfileNudge />
      <InstallCard />

      {/* 오늘 마감하는 관심 공고가 있으면 빼꼼 대신 캐릭터가 그 줄로 달려와 "!"를 띄운다 */}
      <Section title="마감 임박 공고" href="/programs" peek={!alertId && mySchool !== null}>
        {urgent.length === 0 ? (
          <p className="section-empty">일주일 안에 마감되는 공고가 없어요.</p>
        ) : (
          <ul className="rows">
            {urgentShown.map((p) => (
              <ProgramRow key={p.id} program={p} today={today} compact alert={p.id === alertId} />
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
                      <span className={kind === "마감" ? "warn" : "accent"}>{kind === "마감" ? `${recruitWord(program)} 마감` : "활동 시작"}</span>
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
