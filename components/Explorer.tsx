"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { daysUntil, formatPeriod, isClosed, lastDay, matchesTags, visibleForSchool } from "../lib/filter.ts";
import type { FilterCategory } from "../lib/filter.ts";
import { useToday, useUser } from "../lib/user.tsx";
import type { Program } from "../src/types.ts";
import { LIST_QUERY_KEY } from "./BackLink.tsx";
import { FavoriteButton } from "./FavoriteButton.tsx";

interface Props {
  programs: Program[];
  categories: FilterCategory[];
}

type Sort = "deadline" | "recent";

// 올라온 날. 게시일 → 접수 시작일 → 처음 수집한 날 순으로 쓴다
function addedAt(p: Program): string {
  const firstSeen = (p.firstSeenAt ?? p.collectedAt).slice(0, 10);
  const start = p.recruitPeriod.start;
  return p.postedAt ?? (start && start < firstSeen ? start : firstSeen);
}
const NEW_DAYS = 3;

// 필터 상태를 주소(?tag=...&q=...)에 담아 뒤로 가기·공유 때도 유지한다
function readQuery() {
  const params = new URLSearchParams(window.location.search);
  return {
    tags: new Set(params.getAll("tag")),
    keyword: params.get("q") ?? "",
    showClosed: params.get("closed") === "1",
    sort: (params.get("sort") === "recent" ? "recent" : "deadline") as Sort,
  };
}

function writeQuery(tags: Set<string>, keyword: string, showClosed: boolean, sort: Sort) {
  const params = new URLSearchParams();
  for (const tag of tags) params.append("tag", tag);
  if (keyword) params.set("q", keyword);
  if (showClosed) params.set("closed", "1");
  if (sort !== "deadline") params.set("sort", sort);
  const query = params.toString() ? `?${params}` : "";
  window.history.replaceState(null, "", query || window.location.pathname);
  try {
    sessionStorage.setItem(LIST_QUERY_KEY, query);
  } catch {
    // 저장소를 못 쓰면 기억하지 않는다
  }
}

export function Explorer({ programs, categories }: Props) {
  const { schoolId } = useUser();
  const today = useToday();
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [sort, setSort] = useState<Sort>("deadline");

  useEffect(() => {
    const query = readQuery();
    setSelected(query.tags);
    setKeyword(query.keyword);
    setShowClosed(query.showClosed);
    setSort(query.sort);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) writeQuery(selected, keyword, showClosed, sort);
  }, [loaded, selected, keyword, showClosed, sort]);

  // 주최 유형 태그는 카드의 주최 줄에 이미 보이므로 카드 태그에서는 뺀다
  const organizerTags = useMemo(
    () => new Set(categories.find((c) => c.id === "organizer-type")?.tags ?? []),
    [categories],
  );

  const visible = useMemo(() => {
    const word = keyword.trim().toLowerCase();
    return programs
      .filter((p) => visibleForSchool(p, schoolId))
      .filter((p) => matchesTags(p.tags, selected, categories))
      .filter((p) => !word || `${p.title} ${p.organizer ?? ""}`.toLowerCase().includes(word))
      .filter((p) => showClosed || !isClosed(p, today))
      .sort((a, b) => {
        if (sort === "recent") {
          return addedAt(b).localeCompare(addedAt(a));
        }
        // 마감이 가까운 순. 마감일을 모르는 항목은 최근 게시 순으로 뒤에 둔다
        const x = lastDay(a);
        const y = lastDay(b);
        const xClosed = x !== null && x < today;
        const yClosed = y !== null && y < today;
        if (xClosed !== yClosed) return xClosed ? 1 : -1;
        if (x && y) return xClosed ? y.localeCompare(x) : x.localeCompare(y);
        if (x || y) return x ? -1 : 1;
        return (b.postedAt ?? "").localeCompare(a.postedAt ?? "");
      });
  }, [programs, categories, schoolId, selected, keyword, showClosed, sort, today]);

  // 태그별 개수: 학교·마감 설정은 반영하고, 다른 카테고리에서 고른 태그도 반영한다
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const base = programs.filter((p) => visibleForSchool(p, schoolId) && (showClosed || !isClosed(p, today)));
    for (const category of categories) {
      const others = categories.filter((c) => c.id !== category.id);
      const pool = base.filter((p) => matchesTags(p.tags, selected, others));
      for (const tag of category.tags) counts.set(tag, pool.filter((p) => p.tags.includes(tag)).length);
    }
    return counts;
  }, [programs, categories, schoolId, selected, showClosed, today]);

  function toggleTag(tag: string) {
    const next = new Set(selected);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    setSelected(next);
  }

  const opened = categories.find((category) => category.id === openCategory);
  const ready = loaded && today !== "";

  return (
    <>
      <section className="filters">
        <input
          type="search"
          placeholder="제목이나 주최 기관으로 검색"
          aria-label="제목이나 주최 기관으로 검색"
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
        </div>
        {opened && (
          <div className="chips tag-panel">
            {opened.tags.map((tag) => {
              const count = tagCounts.get(tag) ?? 0;
              return (
                <button
                  key={tag}
                  className={`chip ${selected.has(tag) ? "selected" : ""} ${count === 0 ? "empty-tag" : ""}`}
                  aria-pressed={selected.has(tag)}
                  onClick={() => toggleTag(tag)}
                >
                  #{tag} <span className="tag-count">{ready ? count : ""}</span>
                </button>
              );
            })}
          </div>
        )}
        {selected.size > 0 && (
          <div className="chips">
            {[...selected].map((tag) => (
              <button key={tag} className="chip selected" onClick={() => toggleTag(tag)} aria-label={`${tag} 필터 해제`}>
                #{tag} ✕
              </button>
            ))}
            <button className="link-button" onClick={() => setSelected(new Set())}>
              모두 지우기
            </button>
          </div>
        )}
        <div className="list-meta">
          <span>{ready ? `${visible.length}개` : ""}</span>
          <div className="list-options">
            <label>
              <input type="checkbox" checked={showClosed} onChange={(event) => setShowClosed(event.target.checked)} />
              마감 포함
            </label>
            <select aria-label="정렬" value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
              <option value="deadline">마감 임박순</option>
              <option value="recent">최근 등록순</option>
            </select>
          </div>
        </div>
      </section>

      {!ready ? (
        <ul className="cards" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="card skeleton" />
          ))}
        </ul>
      ) : visible.length === 0 ? (
        <div className="empty">
          <p>조건에 맞는 정보가 없어요.</p>
          {(selected.size > 0 || keyword) && (
            <button
              className="button"
              onClick={() => {
                setSelected(new Set());
                setKeyword("");
              }}
            >
              필터 초기화
            </button>
          )}
        </div>
      ) : (
        <ul className="cards">
          {visible.map((program) => (
            <ProgramCard key={program.id} program={program} today={today} hiddenTags={organizerTags} />
          ))}
        </ul>
      )}
    </>
  );
}

function ProgramCard({ program, today, hiddenTags }: { program: Program; today: string; hiddenTags: Set<string> }) {
  const year = Number(today.slice(0, 4));
  const end = program.recruitPeriod.end;
  const left = end ? daysUntil(end, today) : null;
  const recruit = formatPeriod(program.recruitPeriod, year);
  const activity = formatPeriod(program.activityPeriod, year);
  const closed = isClosed(program, today);
  const isNew = daysUntil(today, addedAt(program)) < NEW_DAYS;

  return (
    <li>
      {/* 카드 전체를 누르면 상세로 가지만, 관심 버튼은 링크 밖에 둔다 */}
      <article className={`card ${closed ? "closed" : ""}`}>
        <div className="card-top">
          <span className="muted small">
            {isNew && <span className="new-badge">NEW</span>}
            {program.organizer ?? "주최 미확인"}
            {program.organizerType && ` · ${program.organizerType}`}
          </span>
          <FavoriteButton programId={program.id} />
        </div>
        <h2>
          <Link href={`/programs/${program.id}`} className="card-link">
            {program.title}
          </Link>
        </h2>
        <dl>
          <dt>모집</dt>
          <dd>
            {recruit ?? <span className="muted">원문에서 확인</span>}
            {left !== null && left >= 0 && (
              <span className={`dday ${left <= 3 ? "urgent" : ""}`}>{left === 0 ? "오늘 마감" : `D-${left}`}</span>
            )}
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
          {program.tags
            .filter((tag) => !hiddenTags.has(tag))
            .map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
        </div>
      </article>
    </li>
  );
}
