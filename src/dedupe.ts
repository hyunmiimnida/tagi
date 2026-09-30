import type { Period, Program } from "./types.ts";

// 중복 제거: 같은 프로그램이 여러 출처에 올라오면 하나로 합치고 원문 링크는 모두 보관한다.

const normalize = (title: string) => title.toLowerCase().replace(/[^0-9a-z가-힣]/g, "");

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

// 규칙으로는 판단하기 애매한 출처 간 후보 쌍 (AI가 같은 프로그램인지 판단한다)
export function findAmbiguousPairs(programs: Program[]): [Program, Program][] {
  const pairs: [Program, Program][] = [];
  for (let i = 0; i < programs.length; i++) {
    for (let j = i + 1; j < programs.length; j++) {
      const [a, b] = [programs[i], programs[j]];
      if (a.sources.some((s) => b.sources.includes(s)) || !datesCompatible(a, b)) continue;
      const similarity = titleSimilarity(a.title, b.title);
      if (similarity >= 0.45 && similarity < 0.8) pairs.push([a, b]);
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
  if (conflicts(a.recruitPeriod.end, b.recruitPeriod.end)) return false;
  if (conflicts(a.activityPeriod.start, b.activityPeriod.start)) return false;
  return titleSimilarity(a.title, b.title) >= 0.8;
}

const fillPeriod = (a: Period, b: Period): Period => ({ start: a.start ?? b.start, end: a.end ?? b.end });
const union = (a: string[], b: string[]) => [...new Set([...a, ...b])];

// extra의 정보를 base에 합친다. base에 없는 값만 채운다
function mergeInto(base: Program, extra: Program): void {
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
  // 주최 유형 태그는 base의 것만 남긴다
  base.tags = union(base.tags, extra.tags.filter((t) => t !== extra.organizerType || t === base.organizerType));
  base.sources = union(base.sources, extra.sources);
  base.target.schools = union(base.target.schools, extra.target.schools);
  for (const link of extra.links) {
    if (!base.links.some((l) => l.url === link.url)) base.links.push(link);
  }
}

// AI 없이 다시 수집한 결과가 AI가 추출해 둔 주최·대상·태그를 덮어쓰지 않게 한다
function keepAiFields(saved: Program, fresh: Program): Program {
  if (saved.extractedBy !== "ai" || fresh.extractedBy === "ai") return fresh;
  return {
    ...fresh,
    organizer: saved.organizer,
    organizerType: saved.organizerType,
    target: saved.target,
    tags: saved.tags,
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
      if (saved.links.length === 1) result[index] = { ...keepAiFields(saved, program), firstSeenAt: firstSeen(saved) };
      else mergeInto(saved, program);
      continue;
    }

    const duplicate = result.find((p) => !p.sources.includes(program.sources[0]) && isDuplicate(p, program));
    if (duplicate) mergeInto(duplicate, program);
    else result.push({ ...program, firstSeenAt: firstSeen(program) });
  }

  return result;
}
