"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ELIGIBILITY,
  addedAt,
  compareDeadline,
  isClosed,
  matchesEligibility,
  matchesKeyword,
  matchesTags,
  matchesUnits,
  visibleForSchool,
} from "../lib/filter.ts";
import type { FilterCategory, ProgramView, SchoolOption } from "../lib/filter.ts";
import { useListPrograms } from "../lib/use-list.ts";
import { useToday, useUser } from "../lib/user.tsx";
import { LIST_QUERY_KEY } from "./BackLink.tsx";
import { ChevronIcon, CloseIcon, SearchIcon } from "./Icons.tsx";
import { EmptyArt } from "./EmptyArt.tsx";
import { ListError } from "./ListError.tsx";
import { ProgramRow } from "./ProgramRow.tsx";

interface Props {
  categories: FilterCategory[];
  schools: SchoolOption[];
}

type Sort = "deadline" | "recent";

interface Filters {
  school: string | null;
  units: Set<string>;
  who: Set<string>;
  tags: Set<string>;
  keyword: string;
  showClosed: boolean;
  includeOpen: boolean; // 다른 학교에 올라왔지만 지원할 수 있는 공고도 보기
  sort: Sort;
}

const SCHOOL_PANEL = "school"; // 학교 칩을 열었을 때의 패널 id
const PAGE_SIZE = 30; // 처음에 그리는 공고 수. 끝까지 내리면(또는 "더 보기") 이만큼씩 더 그린다
const LIMIT_KEY = "listLimit"; // 상세에서 뒤로 왔을 때 보던 곳까지 다시 그리려고 기억한다

function readLimit(): number {
  try {
    const value = Number(sessionStorage.getItem(LIMIT_KEY));
    return Number.isFinite(value) && value > PAGE_SIZE ? value : PAGE_SIZE;
  } catch {
    return PAGE_SIZE;
  }
}

// 필터 상태를 주소(?school=...&tag=...&q=...)에 담아 뒤로 가기·공유 때도 유지한다
function readQuery() {
  const params = new URLSearchParams(window.location.search);
  return {
    school: params.get("school"),
    units: new Set(params.getAll("unit")),
    who: new Set(params.getAll("who").filter((w) => ELIGIBILITY.includes(w))),
    tags: new Set(params.getAll("tag")),
    keyword: params.get("q") ?? "",
    showClosed: params.get("closed") === "1",
    includeOpen: params.get("open") !== "0",
    sort: (params.get("sort") === "recent" ? "recent" : "deadline") as Sort,
  };
}

function writeQuery({ school, units, who, tags, keyword, showClosed, includeOpen, sort }: Filters) {
  const params = new URLSearchParams();
  if (school) params.set("school", school);
  for (const unit of units) params.append("unit", unit);
  for (const w of who) params.append("who", w);
  for (const tag of tags) params.append("tag", tag);
  if (keyword) params.set("q", keyword);
  if (showClosed) params.set("closed", "1");
  if (!includeOpen) params.set("open", "0");
  if (sort !== "deadline") params.set("sort", sort);
  const query = params.toString() ? `?${params}` : "";
  window.history.replaceState(null, "", query || window.location.pathname);
  try {
    sessionStorage.setItem(LIST_QUERY_KEY, query);
  } catch {
    // 저장소를 못 쓰면 기억하지 않는다
  }
}

export function Explorer({ categories, schools }: Props) {
  const user = useUser();
  const today = useToday();
  const { programs: loadedPrograms, failed, retry } = useListPrograms();
  const programs: ProgramView[] = useMemo(() => loadedPrograms ?? [], [loadedPrograms]);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [loaded, setLoaded] = useState(false);
  const [school, setSchool] = useState<string | null>(null);
  const [schoolFromUrl, setSchoolFromUrl] = useState(false);
  const [units, setUnits] = useState<Set<string>>(new Set());
  const [who, setWho] = useState<Set<string>>(new Set());
  const [whoFromUrl, setWhoFromUrl] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openPanel, setOpenPanel] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [includeOpen, setIncludeOpen] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [sort, setSort] = useState<Sort>("deadline");

  useEffect(() => {
    const query = readQuery();
    if (query.school) {
      setSchool(query.school);
      setSchoolFromUrl(true);
      setUnits(query.units);
    }
    if (query.who.size > 0) {
      setWho(query.who);
      setWhoFromUrl(true);
    }
    setSelected(query.tags);
    setKeyword(query.keyword);
    setShowClosed(query.showClosed);
    setIncludeOpen(query.includeOpen);
    setSort(query.sort);
    setLimit(readLimit());
    setLoaded(true);
  }, []);

  // 주소에 학교가 없으면 내 학교 설정을 기본으로 쓴다
  useEffect(() => {
    if (loaded && !schoolFromUrl) setSchool(user.schoolId);
  }, [loaded, schoolFromUrl, user.schoolId]);

  // 주소에 대상이 없으면 프로필의 신분·학년을 기본으로 쓴다 (졸업생은 학년을 쓰지 않는다)
  const { status, grade } = user.profile;
  useEffect(() => {
    if (!loaded || whoFromUrl) return;
    setWho(new Set([status, status === "졸업생" ? null : grade].filter((w): w is string => Boolean(w))));
  }, [loaded, whoFromUrl, status, grade]);

  useEffect(() => {
    if (loaded) writeQuery({ school, units, who, tags: selected, keyword, showClosed, includeOpen, sort });
  }, [loaded, school, units, who, selected, keyword, showClosed, includeOpen, sort]);

  // 필터·검색·정렬을 바꾸면 다시 처음 30개부터 그린다 (처음 불러올 때 주소에서 읽은 값은 빼고)
  const filterKey = JSON.stringify([school, [...units], [...who], [...selected], keyword, showClosed, includeOpen, sort]);
  const lastFilterKey = useRef<string | null>(null);
  useEffect(() => {
    if (!loaded) return;
    if (lastFilterKey.current !== null && lastFilterKey.current !== filterKey) setLimit(PAGE_SIZE);
    lastFilterKey.current = filterKey;
  }, [loaded, filterKey]);

  useEffect(() => {
    try {
      sessionStorage.setItem(LIMIT_KEY, String(limit));
    } catch {
      // 저장소를 못 쓰면 기억하지 않는다
    }
  }, [limit]);

  // 목록 끝이 보이면 더 그린다
  const moreRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = moreRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setLimit((n) => n + PAGE_SIZE);
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  });

  // 주최 유형 태그는 주최 줄에 이미 보이므로 공고 태그에서는 뺀다
  const organizerTags = useMemo(
    () => new Set(categories.find((c) => c.id === "organizer-type")?.tags ?? []),
    [categories],
  );

  const word = keyword.trim();
  // 마감 여부와 검색어를 먼저 거른다. 필터 옆 개수도 이 결과를 기준으로 센다
  const open = useMemo(
    () => programs.filter((p) => showClosed || !isClosed(p, today)).filter((p) => matchesKeyword(p, word)),
    [programs, showClosed, today, word],
  );

  const visible = useMemo(
    () =>
      open
        .filter((p) => visibleForSchool(p, school, includeOpen) && matchesUnits(p, units) && matchesEligibility(p, who))
        .filter((p) => matchesTags(p.tags, selected, categories))
        .sort((a, b) => (sort === "recent" ? addedAt(b).localeCompare(addedAt(a)) : compareDeadline(a, b, today))),
    [open, categories, school, includeOpen, units, who, selected, sort, today],
  );

  // 개수: 다른 필터는 반영하고, 자기 자신이 속한 필터만 빼고 센다
  const counts = useMemo(() => {
    const byTags = open.filter((p) => matchesTags(p.tags, selected, categories));
    const inSchool = (id: string | null) => byTags.filter((p) => visibleForSchool(p, id, includeOpen));
    const schoolCounts = new Map(schools.map((s) => [s.id, inSchool(s.id).length]));
    const unitCounts = new Map<string, number>();
    for (const p of inSchool(school).filter((p) => matchesEligibility(p, who))) {
      for (const unit of p.units) unitCounts.set(unit, (unitCounts.get(unit) ?? 0) + 1);
    }
    // 대상 개수: 그 대상 하나만 더 골랐을 때 남는 공고 수
    const whoBase = inSchool(school).filter((p) => matchesUnits(p, units));
    const whoCounts = new Map(
      ELIGIBILITY.map((w) => [w, whoBase.filter((p) => matchesEligibility(p, new Set([...who, w]))).length]),
    );

    const tagCounts = new Map<string, number>();
    const base = open.filter((p) => visibleForSchool(p, school, includeOpen) && matchesUnits(p, units) && matchesEligibility(p, who));
    for (const category of categories) {
      const others = categories.filter((c) => c.id !== category.id);
      const pool = base.filter((p) => matchesTags(p.tags, selected, others));
      for (const tag of category.tags) tagCounts.set(tag, pool.filter((p) => p.tags.includes(tag)).length);
    }
    return { all: inSchool(null).length, school: schoolCounts, unit: unitCounts, who: whoCounts, tag: tagCounts };
  }, [open, categories, schools, school, units, who, selected, includeOpen]);

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
    setWho(new Set());
    setKeyword("");
  }

  const currentSchool = schools.find((s) => s.id === school) ?? null;
  const openedCategory = categories.find((category) => category.id === openPanel);
  const ready = loaded && today !== "" && loadedPrograms !== null;
  const hasChips = selected.size > 0 || units.size > 0 || who.size > 0;
  const schoolFilterCount = units.size + who.size;

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
            placeholder="공고명, 기관, 내용으로 검색"
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
            {schoolFilterCount > 0 && <span className="chip-count">{schoolFilterCount}</span>}
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
            <div className="panel-group">
              <p className="panel-label">대상</p>
              {ELIGIBILITY.map((w) => option(w, w, who.has(w), counts.who.get(w), () => setWho(toggle(who, w))))}
            </div>
            {school && (
              <label className="toggle panel-toggle">
                <input type="checkbox" checked={includeOpen} onChange={(event) => setIncludeOpen(event.target.checked)} />
                <span>다른 학교에 올라온 공고 중 우리 학교 학생도 지원할 수 있는 것 함께 보기</span>
              </label>
            )}
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
            {[...who].map((w) => (
              <button key={w} className="selected-tag" onClick={() => setWho(toggle(who, w))} aria-label={`${w} 필터 해제`}>
                {w}
                <CloseIcon size={14} />
              </button>
            ))}
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
              onClick={reset}
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

      {failed ? (
        <ListError onRetry={retry} />
      ) : !ready ? (
        <ul className="rows" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="row skeleton-row" />
          ))}
        </ul>
      ) : visible.length === 0 ? (
        <div className="empty">
          <EmptyArt />
          <p className="empty-title">조건에 맞는 공고가 없어요</p>
          <p>필터를 줄이거나 다른 검색어를 써 보세요.</p>
          <div className="empty-actions">
            {/* 학교를 골라 둔 것을 잊고 검색하는 경우가 많아, 다른 학교에 결과가 있으면 바로 넓혀 볼 수 있게 한다 (내 학교 설정은 그대로) */}
            {school && (counts.all ?? 0) > 0 && (
              <button
                className="button primary"
                onClick={() => {
                  setSchool(null);
                  setSchoolFromUrl(true);
                  setUnits(new Set());
                }}
              >
                전체 학교에서 {counts.all}개 보기
              </button>
            )}
            {(hasChips || keyword) && (
              <button className="button" onClick={reset}>
                필터 초기화
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <ul className="rows">
            {visible.slice(0, limit).map((program) => (
              <ProgramRow key={program.id} program={program} today={today} hiddenTags={organizerTags} />
            ))}
          </ul>
          {visible.length > limit && (
            <div ref={moreRef} className="list-more">
              <button className="button wide" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
                더 보기 ({visible.length - limit}개 남음)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
