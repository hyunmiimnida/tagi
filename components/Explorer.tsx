"use client";

import { useEffect, useMemo, useState } from "react";
import { addedAt, compareDeadline, isClosed, matchesTags, matchesUnits, visibleForSchool } from "../lib/filter.ts";
import type { FilterCategory, ProgramView, SchoolOption } from "../lib/filter.ts";
import { useToday, useUser } from "../lib/user.tsx";
import { LIST_QUERY_KEY } from "./BackLink.tsx";
import { ChevronIcon, CloseIcon, SearchIcon } from "./Icons.tsx";
import { ProgramRow } from "./ProgramRow.tsx";

interface Props {
  programs: ProgramView[];
  categories: FilterCategory[];
  schools: SchoolOption[];
}

type Sort = "deadline" | "recent";

interface Filters {
  school: string | null;
  units: Set<string>;
  tags: Set<string>;
  keyword: string;
  showClosed: boolean;
  sort: Sort;
}

const SCHOOL_PANEL = "school"; // 학교 칩을 열었을 때의 패널 id

// 필터 상태를 주소(?school=...&tag=...&q=...)에 담아 뒤로 가기·공유 때도 유지한다
function readQuery() {
  const params = new URLSearchParams(window.location.search);
  return {
    school: params.get("school"),
    units: new Set(params.getAll("unit")),
    tags: new Set(params.getAll("tag")),
    keyword: params.get("q") ?? "",
    showClosed: params.get("closed") === "1",
    sort: (params.get("sort") === "recent" ? "recent" : "deadline") as Sort,
  };
}

function writeQuery({ school, units, tags, keyword, showClosed, sort }: Filters) {
  const params = new URLSearchParams();
  if (school) params.set("school", school);
  for (const unit of units) params.append("unit", unit);
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

export function Explorer({ programs, categories, schools }: Props) {
  const user = useUser();
  const today = useToday();
  const [loaded, setLoaded] = useState(false);
  const [school, setSchool] = useState<string | null>(null);
  const [schoolFromUrl, setSchoolFromUrl] = useState(false);
  const [units, setUnits] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openPanel, setOpenPanel] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [sort, setSort] = useState<Sort>("deadline");

  useEffect(() => {
    const query = readQuery();
    if (query.school) {
      setSchool(query.school);
      setSchoolFromUrl(true);
      setUnits(query.units);
    }
    setSelected(query.tags);
    setKeyword(query.keyword);
    setShowClosed(query.showClosed);
    setSort(query.sort);
    setLoaded(true);
  }, []);

  // 주소에 학교가 없으면 내 학교 설정을 기본으로 쓴다
  useEffect(() => {
    if (loaded && !schoolFromUrl) setSchool(user.schoolId);
  }, [loaded, schoolFromUrl, user.schoolId]);

  useEffect(() => {
    if (loaded) writeQuery({ school, units, tags: selected, keyword, showClosed, sort });
  }, [loaded, school, units, selected, keyword, showClosed, sort]);

  // 주최 유형 태그는 주최 줄에 이미 보이므로 공고 태그에서는 뺀다
  const organizerTags = useMemo(
    () => new Set(categories.find((c) => c.id === "organizer-type")?.tags ?? []),
    [categories],
  );

  const word = keyword.trim().toLowerCase();
  const open = useMemo(() => programs.filter((p) => showClosed || !isClosed(p, today)), [programs, showClosed, today]);

  const visible = useMemo(
    () =>
      open
        .filter((p) => visibleForSchool(p, school) && matchesUnits(p, units))
        .filter((p) => matchesTags(p.tags, selected, categories))
        .filter((p) => !word || `${p.title} ${p.organizer ?? ""}`.toLowerCase().includes(word))
        .sort((a, b) => (sort === "recent" ? addedAt(b).localeCompare(addedAt(a)) : compareDeadline(a, b, today))),
    [open, categories, school, units, selected, word, sort, today],
  );

  // 개수: 다른 필터는 반영하고, 자기 자신이 속한 필터만 빼고 센다
  const counts = useMemo(() => {
    const byTags = open.filter((p) => matchesTags(p.tags, selected, categories));
    const inSchool = (id: string | null) => byTags.filter((p) => visibleForSchool(p, id));
    const schoolCounts = new Map(schools.map((s) => [s.id, inSchool(s.id).length]));
    const unitCounts = new Map<string, number>();
    for (const p of inSchool(school)) for (const unit of p.units) unitCounts.set(unit, (unitCounts.get(unit) ?? 0) + 1);

    const tagCounts = new Map<string, number>();
    const base = open.filter((p) => visibleForSchool(p, school) && matchesUnits(p, units));
    for (const category of categories) {
      const others = categories.filter((c) => c.id !== category.id);
      const pool = base.filter((p) => matchesTags(p.tags, selected, others));
      for (const tag of category.tags) tagCounts.set(tag, pool.filter((p) => p.tags.includes(tag)).length);
    }
    return { all: inSchool(null).length, school: schoolCounts, unit: unitCounts, tag: tagCounts };
  }, [open, categories, schools, school, units, selected]);

  function chooseSchool(id: string | null) {
    setSchool(id);
    setSchoolFromUrl(false);
    setUnits(new Set());
    user.setSchool(id); // 고른 학교는 내 학교 설정으로도 기억한다
  }

  const toggle = (set: Set<string>, value: string) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  function reset() {
    setSelected(new Set());
    setUnits(new Set());
    setKeyword("");
  }

  const currentSchool = schools.find((s) => s.id === school) ?? null;
  const openedCategory = categories.find((category) => category.id === openPanel);
  const ready = loaded && today !== "";
  const hasChips = selected.size > 0 || units.size > 0;

  const option = (key: string, label: string, on: boolean, count: number | undefined, onClick: () => void) => (
    <button
      key={key}
      className={`tag-option ${on ? "on" : ""} ${count === 0 && !on ? "dim" : ""}`}
      aria-pressed={on}
      onClick={onClick}
    >
      {label}
      <span>{ready ? (count ?? 0) : ""}</span>
    </button>
  );

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
          <button
            className={`chip ${school ? "active" : ""} ${openPanel === SCHOOL_PANEL ? "open" : ""}`}
            aria-expanded={openPanel === SCHOOL_PANEL}
            onClick={() => setOpenPanel(openPanel === SCHOOL_PANEL ? null : SCHOOL_PANEL)}
          >
            {currentSchool ? currentSchool.shortName : "학교"}
            {units.size > 0 && <span className="chip-count">{units.size}</span>}
            <ChevronIcon dir="down" size={14} />
          </button>
          {categories.map((category) => {
            const count = category.tags.filter((tag) => selected.has(tag)).length;
            const isOpen = openPanel === category.id;
            return (
              <button
                key={category.id}
                className={`chip ${count > 0 ? "active" : ""} ${isOpen ? "open" : ""}`}
                aria-expanded={isOpen}
                onClick={() => setOpenPanel(isOpen ? null : category.id)}
              >
                {category.name}
                {count > 0 && <span className="chip-count">{count}</span>}
                <ChevronIcon dir="down" size={14} />
              </button>
            );
          })}
        </div>

        {openPanel === SCHOOL_PANEL && (
          <div className="tag-panel stacked">
            <div className="panel-group">
              {option("all", "전체 학교", school === null, counts.all, () => chooseSchool(null))}
              {schools.map((s) =>
                option(s.id, s.name, school === s.id, counts.school.get(s.id), () =>
                  chooseSchool(school === s.id ? null : s.id),
                ),
              )}
            </div>
            {currentSchool && currentSchool.units.length > 0 && (
              <div className="panel-group">
                <p className="panel-label">{currentSchool.shortName} 교내 기관</p>
                {currentSchool.units.map((unit) =>
                  option(unit, unit, units.has(unit), counts.unit.get(unit), () => setUnits(toggle(units, unit))),
                )}
              </div>
            )}
          </div>
        )}

        {openedCategory && (
          <div className="tag-panel">
            {openedCategory.tags.map((tag) =>
              option(tag, tag, selected.has(tag), counts.tag.get(tag), () => setSelected(toggle(selected, tag))),
            )}
          </div>
        )}

        {hasChips && (
          <div className="selected-tags">
            {[...units].map((unit) => (
              <button key={unit} className="selected-tag" onClick={() => setUnits(toggle(units, unit))} aria-label={`${unit} 필터 해제`}>
                {unit}
                <CloseIcon size={14} />
              </button>
            ))}
            {[...selected].map((tag) => (
              <button key={tag} className="selected-tag" onClick={() => setSelected(toggle(selected, tag))} aria-label={`${tag} 필터 해제`}>
                {tag}
                <CloseIcon size={14} />
              </button>
            ))}
            <button
              className="text-button"
              onClick={() => {
                setSelected(new Set());
                setUnits(new Set());
              }}
            >
              초기화
            </button>
          </div>
        )}
      </div>

      <div className="list-head">
        <span className="list-count">{ready ? <>공고 <strong>{visible.length}</strong>개</> : " "}</span>
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
          {(hasChips || keyword) && (
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
