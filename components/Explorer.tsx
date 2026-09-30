"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { daysUntil, formatPeriod, isClosed, lastDay, matchesTags, visibleForSchool } from "../lib/filter.ts";
import type { FilterCategory } from "../lib/filter.ts";
import { useToday, useUser } from "../lib/user.tsx";
import type { Program } from "../src/types.ts";
import { FavoriteButton } from "./FavoriteButton.tsx";

interface Props {
  programs: Program[];
  categories: FilterCategory[];
}

export function Explorer({ programs, categories }: Props) {
  const { schoolId } = useUser();
  const today = useToday();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [keyword, setKeyword] = useState("");

  const visible = useMemo(() => {
    const word = keyword.trim().toLowerCase();
    return programs
      .filter((p) => visibleForSchool(p, schoolId))
      .filter((p) => matchesTags(p.tags, selected, categories))
      .filter((p) => !word || p.title.toLowerCase().includes(word))
      .filter((p) => showClosed || !today || !isClosed(p, today))
      .sort((a, b) => {
        // 마감이 가까운 순. 마감일을 모르는 항목은 최근 게시 순으로 뒤에 둔다
        const x = lastDay(a);
        const y = lastDay(b);
        if (x && y) return x.localeCompare(y);
        if (x || y) return x ? -1 : 1;
        return (b.postedAt ?? "").localeCompare(a.postedAt ?? "");
      });
  }, [programs, categories, schoolId, selected, keyword, showClosed, today]);

  function toggleTag(tag: string) {
    const next = new Set(selected);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    setSelected(next);
  }

  const opened = categories.find((category) => category.id === openCategory);

  return (
    <>
      <section className="filters">
        <input
          type="search"
          placeholder="제목으로 검색"
          aria-label="제목으로 검색"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <div className="chips">
          {categories.map((category) => {
            const count = category.tags.filter((tag) => selected.has(tag)).length;
            return (
              <button
                key={category.id}
                className={`chip category ${openCategory === category.id ? "open" : ""}`}
                aria-expanded={openCategory === category.id}
                onClick={() => setOpenCategory(openCategory === category.id ? null : category.id)}
              >
                {category.name}
                {count > 0 && <span className="count">{count}</span>}
              </button>
            );
          })}
          {selected.size > 0 && (
            <button className="link-button" onClick={() => setSelected(new Set())}>
              필터 지우기
            </button>
          )}
        </div>
        {opened && (
          <div className="chips tag-panel">
            {opened.tags.map((tag) => (
              <button
                key={tag}
                className={`chip ${selected.has(tag) ? "selected" : ""}`}
                aria-pressed={selected.has(tag)}
                onClick={() => toggleTag(tag)}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
        <div className="list-meta">
          <span>{visible.length}개</span>
          <label>
            <input type="checkbox" checked={showClosed} onChange={(event) => setShowClosed(event.target.checked)} />
            마감된 항목도 보기
          </label>
        </div>
      </section>

      {visible.length === 0 ? (
        <p className="empty">조건에 맞는 정보가 없어요. 필터를 줄여 보세요.</p>
      ) : (
        <ul className="cards">
          {visible.map((program) => (
            <ProgramCard key={program.id} program={program} today={today} />
          ))}
        </ul>
      )}
    </>
  );
}

function ProgramCard({ program, today }: { program: Program; today: string }) {
  const end = program.recruitPeriod.end;
  const left = end && today ? daysUntil(end, today) : null;
  const recruit = formatPeriod(program.recruitPeriod);
  const activity = formatPeriod(program.activityPeriod);

  return (
    <li>
      <Link href={`/programs/${program.id}`} className="card">
        <div className="card-top">
          <span className="muted small">
            {program.organizer ?? "주최 미확인"}
            {program.organizerType && ` · ${program.organizerType}`}
          </span>
          <FavoriteButton programId={program.id} />
        </div>
        <h2>{program.title}</h2>
        <dl>
          <dt>모집</dt>
          <dd>
            {recruit ?? "원문에서 확인"}
            {left !== null && left >= 0 && <span className="dday">{left === 0 ? "오늘 마감" : `D-${left}`}</span>}
            {left !== null && left < 0 && <span className="dday closed">마감</span>}
          </dd>
          {activity && (
            <>
              <dt>활동</dt>
              <dd>{activity}</dd>
            </>
          )}
        </dl>
        <div className="tags">
          {program.tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
      </Link>
    </li>
  );
}
