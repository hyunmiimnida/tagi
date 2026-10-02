"use client";

import Link from "next/link";
import { daysUntil, formatPeriod, isClosed, isNew, recruitWord } from "../lib/filter.ts";
import type { ProgramView as Program } from "../lib/filter.ts";
import { FavoriteButton } from "./FavoriteButton.tsx";

// 남은 날을 배지로. 마감일을 모르면 표시하지 않는다
export function DdayBadge({ program, today }: { program: Program; today: string }) {
  const end = program.recruitPeriod.end;
  if (!end) return null;
  const left = daysUntil(end, today);
  if (left < 0) return <span className="badge muted-badge">마감</span>;
  if (left === 0) return <span className="badge urgent">오늘 마감</span>;
  return <span className={`badge ${left <= 3 ? "urgent" : ""}`}>D-{left}</span>;
}

// 공고 한 줄. 목록과 홈에서 함께 쓴다
export function ProgramRow({
  program,
  today,
  hiddenTags,
  compact = false,
}: {
  program: Program;
  today: string;
  hiddenTags?: Set<string>;
  compact?: boolean;
}) {
  const year = Number(today.slice(0, 4));
  const recruit = formatPeriod(program.recruitPeriod, year);
  const activity = formatPeriod(program.activityPeriod, year);
  const tags = program.tags.filter((tag) => !hiddenTags?.has(tag));
  // 신청 없이 참여하는 행사·서비스는 모집 기간 대신 "신청 없이 참여"와 운영 기간을 보여 준다
  const walkIn = !recruit && program.noApplication === true;

  return (
    <li className={`row ${isClosed(program, today) ? "closed" : ""}`}>
      <div className="row-body">
        <div className="row-meta">
          {isNew(program, today) && <span className="new-dot" aria-label="새 공고" />}
          {program.schoolLabels.map((label) => (
            <span key={label} className="row-school">
              {label}
            </span>
          ))}
          {program.target.openTo && (
            <span className="row-open" title={`지원 대상: ${program.target.openTo}`}>
              다른 학교도 지원
            </span>
          )}
          <span className="row-org">{program.organizer ?? "주최 미확인"}</span>
          {program.organizerType && <span className="row-type">{program.organizerType}</span>}
        </div>
        <Link href={`/programs/${program.id}`} className="row-title">
          {program.title}
        </Link>
        <div className="row-dates">
          <DdayBadge program={program} today={today} />
          {walkIn ? <span className="row-free">신청 없이 참여</span> : <span>{recruit ? `${recruitWord(program)} ${recruit}` : `${recruitWord(program)} 일정은 원문 확인`}</span>}
          {(!compact || walkIn) && activity && <span className="row-activity">{walkIn ? "기간" : "활동"} {activity}</span>}
        </div>
        {!compact && tags.length > 0 && (
          <div className="row-tags">
            {tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        )}
      </div>
      <FavoriteButton programId={program.id} title={program.title} />
    </li>
  );
}
