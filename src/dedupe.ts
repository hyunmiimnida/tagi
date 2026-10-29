import type { Period, Program } from "./types.ts";
import { sameSchool } from "./school-of.ts";

// 중복 제거: 같은 프로그램이 여러 출처에 올라오면 하나로 합치고 원문 링크는 모두 보관한다.

const normalize = (title: string) => title.toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
// 마감 머리말을 빼고 달·회차·연도 숫자를 비교한다
const numbers = (title: string) => (stripDeadlineHead(title).match(/\d+/g) ?? []).join(",");

function bigrams(text: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < text.length - 1; i++) set.add(text.slice(i, i + 2));
  return set;
}

// 두 제목이 얼마나 비슷한지 0~1로 계산한다 (겹치는 두 글자 묶음의 비율)
export function titleSimilarity(a: string, b: string): number {
  const x = bigrams(normalize(a));
  const y = bigrams(normalize(b));
  if (x.size === 0 || y.size === 0) return 0;
  let shared = 0;
  for (const g of x) if (y.has(g)) shared++;
  return (2 * shared) / (x.size + y.size);
}

const conflicts = (a: string | null, b: string | null) => a !== null && b !== null && a !== b;

const datesCompatible = (a: Program, b: Program) =>
  !conflicts(a.recruitPeriod.end, b.recruitPeriod.end) && !conflicts(a.activityPeriod.start, b.activityPeriod.start);

// 같은 게시판은 가까운 시기에 올라온 비슷한 글만 AI에게 묻는다.
// 학교 공지는 "2026학년도 2학기 … 안내" 같은 틀이 많아 0.45로는 다른 공고가 너무 많이 걸린다 (2026-10 목록에서 1,390쌍 → 0.7이면 294쌍)
const SAME_SOURCE_SIMILARITY = 0.7;
function sameSourceCandidate(a: Program, b: Program, similarity: number): boolean {
  if (!a.postedAt || !b.postedAt) return false;
  const days = Math.abs(Date.parse(a.postedAt) - Date.parse(b.postedAt)) / 86_400_000;
  if (!Number.isFinite(days) || days > 90) return false;
  const sameKey = repostKey(a.title) === repostKey(b.title);
  if (canCollapseRepost(a, b)) return false; // 이미 재게시 규칙으로 합친다
  // 같은 제목의 다른 회차인지 애매하면 일정이 달라도 AI에게 묻는다
  if (!sameKey && !datesCompatible(a, b)) return false;
  // 달·회차·연도가 다르면 다른 공고다. 마감 머리말만 바뀐 재게시는 남긴다
  if (!sameKey && numbers(a.title) !== numbers(b.title)) return false;
  return sameKey || similarity >= SAME_SOURCE_SIMILARITY;
}

// 규칙으로는 판단하기 애매한 후보 쌍 (AI가 같은 프로그램인지 판단한다)
export function findAmbiguousPairs(programs: Program[]): [Program, Program][] {
  const pairs: [Program, Program][] = [];
  for (let i = 0; i < programs.length; i++) {
    for (let j = i + 1; j < programs.length; j++) {
      const [a, b] = [programs[i], programs[j]];
      if (a.campus !== b.campus || !sameSchool(a, b)) continue;
      const similarity = titleSimilarity(a.title, b.title);
      const sharedSource = a.sources.some((s) => b.sources.includes(s));
      // 같은 게시판은 한 단어만 달라도 다른 프로그램일 수 있어 상한을 두지 않는다
      // 다른 게시판끼리는 45~80%를 묻고, 80% 넘게 비슷해도 숫자가 다르면(회차인지 날짜 표기인지 규칙으로는 모름) 규칙으로 합치지 않고 묻는다
      const crossSource = similarity >= 0.45 && (similarity < 0.8 || numbers(a.title) !== numbers(b.title));
      if (sharedSource ? sameSourceCandidate(a, b, similarity) : crossSource && datesCompatible(a, b)) pairs.push([a, b]);
    }
  }
  return pairs;
}

// b를 a에 합치고 b를 목록에서 뺀다
export function mergePair(programs: Program[], a: Program, b: Program): Program[] {
  mergeInto(a, b);
  return programs.filter((p) => p !== b);
}

export function isDuplicate(a: Program, b: Program): boolean {
  if (numbers(a.title) !== numbers(b.title)) return false;
  if (conflicts(a.recruitPeriod.end, b.recruitPeriod.end)) return false;
  if (conflicts(a.activityPeriod.start, b.activityPeriod.start)) return false;
  return titleSimilarity(a.title, b.title) >= 0.8;
}

const fillPeriod = (a: Period, b: Period): Period => ({ start: a.start ?? b.start, end: a.end ?? b.end });
const union = (a: string[], b: string[]) => [...new Set([...a, ...b])];

// extra의 정보를 base에 합친다. base에 없는 값만 채운다
function mergeInto(base: Program, extra: Program): void {
  const baseOpenTo = base.target.openTo;
  // 합쳐져 없어지는 공고의 주소를 기억한다 (예전 링크·관심 표시를 이 공고로 연결)
  if (extra.id !== base.id) base.aliases = union(base.aliases ?? [], [extra.id, ...(extra.aliases ?? [])]);
  // AI가 추출한 쪽의 주최·대상·태그를 우선한다
  if (extra.extractedBy === "ai" && base.extractedBy !== "ai") {
    base.organizer = extra.organizer ?? base.organizer;
    base.organizerType = extra.organizerType ?? base.organizerType;
    base.target = { ...extra.target, schools: union(base.target.schools, extra.target.schools) };
    base.tags = [];
    base.extractedBy = "ai";
  }
  base.organizer ??= extra.organizer;
  base.organizerType ??= extra.organizerType;
  base.recruitPeriod = fillPeriod(base.recruitPeriod, extra.recruitPeriod);
  base.activityPeriod = fillPeriod(base.activityPeriod, extra.activityPeriod);
  base.postedAt ??= extra.postedAt;
  if (!base.summary && extra.summary !== undefined) base.summary = extra.summary ?? base.summary ?? null;
  if (base.noApplication === undefined && extra.noApplication !== undefined) base.noApplication = extra.noApplication;
  // 주최 유형 태그는 base의 것만 남긴다
  base.tags = union(base.tags, extra.tags.filter((t) => t !== extra.organizerType || t === base.organizerType));
  base.sources = union(base.sources, extra.sources);
  // 어느 한쪽이라도 다른 학교 학생에게 열려 있으면 열린 공고로 본다
  const openTo = baseOpenTo || extra.target.openTo || (baseOpenTo ?? extra.target.openTo);
  if (openTo !== undefined) base.target.openTo = openTo;
  base.target.schools = openTo ? [] : union(base.target.schools, extra.target.schools);
  for (const link of extra.links) {
    if (!base.links.some((l) => l.url === link.url)) base.links.push(link);
  }
}

// AI 없이 다시 수집한 결과가 AI가 추출해 둔 주최·대상·태그를 덮어쓰지 않게 한다.
// 기간은 새로 읽은 날짜를 따른다: 다시 읽히는 AI 글은 목록에 일정이 정리된 출처(영남대 취업정보)뿐이라
// 그 날짜가 기간 연장까지 반영한 최신 값이다 (상세를 읽는 출처는 AI로 정리한 글을 다시 읽지 않는다)
function keepAiFields(saved: Program, fresh: Program): Program {
  if (saved.extractedBy !== "ai" || fresh.extractedBy === "ai") return fresh;
  return {
    ...fresh,
    organizer: saved.organizer,
    organizerType: saved.organizerType,
    target: saved.target,
    tags: saved.tags,
    summary: saved.summary,
    noApplication: saved.noApplication,
    recruitPeriod: fillPeriod(fresh.recruitPeriod, saved.recruitPeriod),
    activityPeriod: fillPeriod(fresh.activityPeriod, saved.activityPeriod),
    extractedBy: "ai",
  };
}

export function mergePrograms(existing: Program[], incoming: Program[]): Program[] {
  const result = structuredClone(existing);
  const firstSeen = (p: Program) => p.firstSeenAt ?? p.collectedAt;

  for (const program of incoming) {
    const url = program.links[0].url;
    const index = result.findIndex((p) => p.links.some((l) => l.url === url));

    if (index >= 0) {
      // 이미 저장된 게시물: 최신 내용으로 바꾸되, 합쳐진 항목이면 빈 값만 채운다
      const saved = result[index];
      if (saved.links.length === 1) {
        const fresh: Program = { ...keepAiFields(saved, program), firstSeenAt: firstSeen(saved) };
        // 새 결과가 확인하지 않은 값(다른 학교 지원 가능 여부, 합쳐진 예전 id)은 저장된 값을 이어받는다
        if (fresh.target.openTo === undefined && saved.target.openTo !== undefined) {
          fresh.target = { ...fresh.target, openTo: saved.target.openTo, schools: saved.target.schools };
        }
        if (fresh.summary === undefined && saved.summary !== undefined) fresh.summary = saved.summary;
        if (fresh.noApplication === undefined && saved.noApplication !== undefined) fresh.noApplication = saved.noApplication;
        if (saved.aliases) fresh.aliases = [...new Set([...saved.aliases, ...(fresh.aliases ?? [])])];
        result[index] = fresh;
      } else {
        mergeInto(saved, program);
        // 원문을 다시 읽어 새 일정을 찾았으면(기간 연장 등) 그 일정을 따른다
        if (program.recruitPeriod.start || program.recruitPeriod.end) saved.recruitPeriod = program.recruitPeriod;
        if (program.activityPeriod.start || program.activityPeriod.end) saved.activityPeriod = program.activityPeriod;
      }
      continue;
    }

    const duplicate = result.find((p) => !p.sources.some((s) => program.sources.includes(s)) && p.campus === program.campus && sameSchool(p, program) && isDuplicate(p, program));
    if (duplicate) mergeInto(duplicate, program);
    else result.push({ ...program, firstSeenAt: firstSeen(program) });
  }

  return result;
}

// 같은 게시판에 다시 올린 글(재게시·재공지·기간연장)은 같은 공고다.
// 이런 표시를 지운 제목이 같고 두 달 안에 올라온 글을 하나로 합친다.
// 처음 글의 id를 남기고(관심 표시·주소 유지), 일정은 나중 글을 따르며(기간연장 반영), 원문 링크는 나중 글을 앞에 둔다.
// "추가 모집"·"상시 모집"·"(추가)"·"(조기 마감)"·"(수정)"·"[수정게시]"·"(재업로드)"도 같은 공고를 다시 올린 것으로 본다
// 괄호 안이 통째로 표시인 것은 괄호째 지운다 ("동아리원 모집 (상시모집)" = "동아리원 모집", "(재안내)[SW사업단] …" = "[SW사업단] …")
const REPOST_MARK =
  /[(\[]\s*(?:(?:추가|상시)\s*모집|수정\s*게시|수정|재업로드|재안내)\s*[)\]]|수정\s*게시|재업로드|재게시|재공지|재공고|기간\s*연장|연장(?=\s*(공고|안내))|마감\s*임박|일정\s*변경|장소\s*변경|(추가|상시)\s*(?=모집)|\(추가\)|\(?조기\s*마감\)?/g;
// 제목 앞의 마감·대상 머리말도 지운다. 예: "[(재게시) 8/17(월) 까지_인문사회 계열]", "[🚨9/9(화) 까지]", "[~9/30]"
// (날짜나 "까지·마감"이 들어 있는 대괄호 묶음만 지운다. "[학생상담센터]" 같은 부서 이름은 남긴다)
const DEADLINE_HEAD = /^\s*\[[^\]]*(\d{1,2}\s*[/.월]\s*\d{1,2}|까지|마감|접수)[^\]]*\]\s*/;
export function stripDeadlineHead(title: string): string {
  let rest = title;
  while (DEADLINE_HEAD.test(rest)) rest = rest.replace(DEADLINE_HEAD, "");
  return rest;
}
// "재안내"는 "안내"로 본다("모집 재안내" = "모집 안내"), 앞의 [홍보] 머리말도 지운다
export const repostKey = (title: string) =>
  normalize(stripDeadlineHead(title).replace(REPOST_MARK, "").replace(/재안내/g, "안내").replace(/^\s*\[(재)?홍보\]\s*/, "").replace(REPOST_MARK, ""));
const REPOST_DAYS = 60;

function canCollapseRepost(a: Program, b: Program): boolean {
  if (!a.postedAt || !b.postedAt || a.campus !== b.campus) return false;
  if (!a.sources.some((source) => b.sources.includes(source)) || repostKey(a.title) !== repostKey(b.title)) return false;
  const days = (Date.parse(b.postedAt) - Date.parse(a.postedAt)) / 86_400_000;
  if (!Number.isFinite(days) || Math.abs(days) > REPOST_DAYS) return false;
  const later = days >= 0 ? b : a;
  // 시작일이 다르면 나중 글에 재게시·변경 표시가 있어야 합친다
  return !conflicts(a.activityPeriod.start, b.activityPeriod.start) || normalize(later.title) !== repostKey(later.title);
}

export function collapseReposts(programs: Program[]): Program[] {
  const groups = new Map<string, Program[]>();
  for (const program of programs) {
    if (!program.postedAt) continue; // 게시일이 없는 출처(목록형)는 글마다 다른 회차다
    const key = repostKey(program.title);
    groups.set(key, [...(groups.get(key) ?? []), program]);
  }

  const removed = new Set<Program>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => a.postedAt!.localeCompare(b.postedAt!));
    // 같은 게시판(출처가 하나라도 겹침)에 두 달 안에 다시 올린 글만 합친다.
    // 두 게시판에 함께 올라와 이미 합쳐진 글(출처 여럿, 순서도 제각각)도 그중 한 게시판의 재게시와 합친다
    const kept: Program[] = [];
    for (const next of group) {
      // 두 달 넘게 지나 다시 올린 글은 다른 회차로 본다
      const base = kept.findLast((p) => canCollapseRepost(p, next));
      if (!base) {
        kept.push(next);
        continue;
      }
      if (next.recruitPeriod.start || next.recruitPeriod.end) base.recruitPeriod = next.recruitPeriod;
      if (next.activityPeriod.start || next.activityPeriod.end) base.activityPeriod = next.activityPeriod;
      if (next.extractedBy === "ai") {
        base.target = next.target;
        base.tags = next.tags;
        base.organizer = next.organizer ?? base.organizer;
        base.organizerType = next.organizerType ?? base.organizerType;
        if (next.summary) base.summary = next.summary;
        if (next.noApplication !== undefined) base.noApplication = next.noApplication;
        base.extractedBy = "ai";
      }
      base.links = [...next.links, ...base.links.filter((l) => !next.links.some((n) => n.url === l.url))];
      base.sources = union(base.sources, next.sources);
      base.postedAt = next.postedAt; // 기준 게시일을 옮겨 다음 재게시도 이어 붙인다
      base.aliases = union(base.aliases ?? [], [next.id, ...(next.aliases ?? [])]); // 예전 주소·관심 표시를 이어 준다
      removed.add(next);
    }
  }
  return programs.filter((p) => !removed.has(p));
}
