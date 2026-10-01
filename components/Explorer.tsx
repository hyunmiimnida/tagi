"use client";

import { useEffect, useMemo, useState } from "react";
import { addedAt, compareDeadline, isClosed, matchesTags, visibleForSchool } from "../lib/filter.ts";
import type { FilterCategory } from "../lib/filter.ts";
import { useToday, useUser } from "../lib/user.tsx";
import type { Program } from "../src/types.ts";
import { LIST_QUERY_KEY } from "./BackLink.tsx";
import { ChevronIcon, CloseIcon, SearchIcon } from "./Icons.tsx";
import { ProgramRow } from "./ProgramRow.tsx";

interface Props {
  programs: Program[];
  categories: FilterCategory[];
}

type Sort = "deadline" | "recent";

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

  // 주최 유형 태그는 주최 줄에 이미 보이므로 공고 태그에서는 뺀다
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
      .sort((a, b) => (sort === "recent" ? addedAt(b).localeCompare(addedAt(a)) : compareDeadline(a, b, today)));
  }, [programs, categories, schoolId, selected, keyword, showClosed, sort, today]);

  // 태그별 개수: 학교·마감 설정과 다른 카테고리에서 고른 태그를 반영한다
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

  function reset() {
    setSelected(new Set());
    setKeyword("");
  }

  const opened = categories.find((category) => category.id === openCategory);
  const ready = loaded && today !== "";

  return (
    <div className="explorer">
      <div className="filter-bar">
        <label className="search">
          <SearchIcon />
          <input
            type="search"
            placeholder="공고명, 주최 기관 검색"
            aria-label="공고명이나 주최 기관으로 검색"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </label>

        <div className="chip-scroll">
          {categories.map((category) => {
            const count = category.tags.filter((tag) => selected.has(tag)).length;
            const isOpen = openCategory === category.id;
            return (
              <button
                key={category.id}
                className={`chip ${count > 0 ? "active" : ""} ${isOpen ? "open" : ""}`}
                aria-expanded={isOpen}
                onClick={() => setOpenCategory(isOpen ? null : category.id)}
              >
                {category.name}
                {count > 0 && <span className="chip-count">{count}</span>}
                <ChevronIcon dir="down" size={14} />
              </button>
            );
          })}
        </div>

        {opened && (
          <div className="tag-panel">
            {opened.tags.map((tag) => {
              const count = tagCounts.get(tag) ?? 0;
              const on = selected.has(tag);
              return (
                <button
                  key={tag}
                  className={`tag-option ${on ? "on" : ""} ${count === 0 && !on ? "dim" : ""}`}
                  aria-pressed={on}
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                  <span>{ready ? count : ""}</span>
                </button>
              );
            })}
          </div>
        )}

        {selected.size > 0 && (
          <div className="selected-tags">
            {[...selected].map((tag) => (
              <button key={tag} className="selected-tag" onClick={() => toggleTag(tag)} aria-label={`${tag} 필터 해제`}>
                {tag}
                <CloseIcon size={14} />
              </button>
            ))}
            <button className="text-button" onClick={() => setSelected(new Set())}>
              초기화
            </button>
          </div>
        )}
      </div>

      <div className="list-head">
        <span className="list-count">{ready ? <>공고 <strong>{visible.length}</strong>개</> : " "}</span>
        <div className="list-options">
          <div className="segmented" role="group" aria-label="정렬">
            <button className={sort === "deadline" ? "on" : ""} onClick={() => setSort("deadline")}>
              마감순
            </button>
            <button className={sort === "recent" ? "on" : ""} onClick={() => setSort("recent")}>
              최신순
            </button>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={showClosed} onChange={(event) => setShowClosed(event.target.checked)} />
            <span>마감 포함</span>
          </label>
        </div>
      </div>

      {!ready ? (
        <ul className="rows" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="row skeleton-row" />
          ))}
        </ul>
      ) : visible.length === 0 ? (
        <div className="empty">
          <p className="empty-title">조건에 맞는 공고가 없어요</p>
          <p>필터를 줄이거나 다른 검색어를 써 보세요.</p>
          {(selected.size > 0 || keyword) && (
            <button className="button" onClick={reset}>
              필터 초기화
            </button>
          )}
        </div>
      ) : (
        <ul className="rows">
          {visible.map((program) => (
            <ProgramRow key={program.id} program={program} today={today} hiddenTags={organizerTags} />
          ))}
        </ul>
      )}
    </div>
  );
}
