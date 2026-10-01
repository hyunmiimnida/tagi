import { confirmSameSeries } from "./ai.ts";
import { readJson, writeJson } from "./archive.ts";
import { sameSchool } from "./school-of.ts";
import type { Program } from "./types.ts";

// 반복 프로그램 묶기: 해마다·학기마다 다시 열리는 같은 프로그램을 하나의 묶음(seriesId)으로 잇는다.
// 상세 화면의 "지난 공고"와 후기 댓글이 이 묶음을 기준으로 모인다.

const DECISIONS_FILE = new URL("../data/series-decisions.json", import.meta.url);
const SAME = 0.85; // 기본 제목이 이만큼 비슷하면 같은 프로그램
const LIKELY = 0.72; // 이 이상이면 주최가 같을 때 같은 프로그램
const MAYBE = 0.55; // 이 이상이면 AI에게 묻는다 (지금 목록에 있는 공고만)
const MIN_BASE = 4; // 기본 제목이 이보다 짧으면 너무 흔한 이름이라 정확히 같을 때만 묶는다

// 제목에서 회차·시기·상태 표시를 지운 "기본 제목"
export function baseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/^(\s*\[[^\]]*\]\s*)+/, " ") // 앞쪽 [부서·사업 이름] 머리말 (같은 부서의 다른 프로그램을 묶지 않게)
    .replace(/\(재게시\)|\[재게시\]|재게시|기간\s*연장|마감\s*임박|추가\s*모집|재공고|긴급/g, " ")
    .replace(/\d{1,2}\s*\/\s*\d{1,2}(\s*\([^)]*\))?/g, " ") // 9/21, 10/13(화)
    .replace(/20\d{2}\s*(학년도|년도|년)?|'?\d{2}\s*년/g, " ")
    .replace(/[1-4]\s*학기|[12]\s*·\s*[12]\s*학기|상반기|하반기|하계|동계|봄학기|여름학기|겨울학기|여름|겨울/g, " ")
    .replace(/제?\s*\d+\s*(회|기|차|주차|월|일|분기|번째)/g, " ")
    .replace(/모집\s*안내|참가자|참여자|참가팀|모집|안내|신청|공고|개최|접수/g, " ")
    .replace(/[^0-9a-z가-힣]/g, "");
}

function bigrams(text: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < text.length - 1; i++) set.add(text.slice(i, i + 2));
  return set;
}

function dice(x: Set<string>, y: Set<string>): number {
  if (x.size === 0 || y.size === 0) return 0;
  let shared = 0;
  for (const g of x) if (y.has(g)) shared++;
  return (2 * shared) / (x.size + y.size);
}

const sameOrganizer = (a: Program, b: Program) =>
  !!a.organizer && !!b.organizer && (a.organizer.includes(b.organizer) || b.organizer.includes(a.organizer));

// 둘 다 학교 밖 기관(기업·공공기관 등)이 주최하는데 기관이 다르면 다른 프로그램이다 (회사마다 올라오는 현장실습 모집 등).
// 학교 부서는 해마다 이름이 바뀌기도 해서 이 규칙을 쓰지 않는다
const differentOutsideOrganizers = (a: Program, b: Program) =>
  !!a.organizerType && !!b.organizerType && a.organizerType !== "학교" && b.organizerType !== "학교" && !sameOrganizer(a, b) && !!a.organizer && !!b.organizer;

// 두 기본 제목이 같은 틀에 맨 앞의 짧은 이름만 서로 다르면 다른 프로그램이다
// 예: "(주)솔라라이트 … 현장실습" ↔ "셈테크 … 현장실습", "울진군 향토생활관" ↔ "영주시 향토생활관"
// (한쪽에만 말이 더 붙은 것은 같은 프로그램일 수 있어 그대로 둔다)
export function swappedName(x: string, y: string): boolean {
  let start = 0;
  while (start < x.length && start < y.length && x[start] === y[start]) start++;
  let end = 0;
  while (end < x.length - start && end < y.length - start && x[x.length - 1 - end] === y[y.length - 1 - end]) end++;
  const [a, b] = [x.slice(start, x.length - end), y.slice(start, y.length - end)];
  const isName = (part: string) => part.length >= 2 && part.length <= 12 && !/^\d+$/.test(part);
  // 맨 앞의 이름(회사·지역)만 다르고 뒤의 틀이 6글자 넘게 같을 때만 본다 ("(주)"의 "주" 한 글자 차이는 봐준다)
  return start <= 1 && end >= 6 && isName(a) && isName(b);
}

// 회차의 시작 시점: 모집 시작 → 게시일 → 활동 시작 → 수집일
const startOf = (p: Program) => p.recruitPeriod.start ?? p.postedAt ?? p.activityPeriod.start ?? p.collectedAt.slice(0, 10);

const pairKey = (a: Program, b: Program) => [a.id, b.id].sort().join("|");

interface TitleInfo {
  base: string;
  grams: Set<string>;
}

export function titleInfo(program: Program): TitleInfo {
  const base = baseTitle(program.title);
  return { base, grams: bigrams(base) };
}

// 두 공고가 같은 반복 프로그램인지: true/false, 애매하면 "maybe"
export function seriesMatch(a: Program, b: Program, x = titleInfo(a), y = titleInfo(b)): boolean | "maybe" {
  if (!sameSchool(a, b)) return false; // 다른 학교 공고는 묶지 않는다
  if (differentOutsideOrganizers(a, b)) return false;
  if (x.base.length < MIN_BASE || y.base.length < MIN_BASE) return x.base === y.base && x.base !== "" && sameOrganizer(a, b);
  if (x.base === y.base) return true;
  if (swappedName(x.base, y.base)) return false;
  // 비슷한 때에 열리는 비슷한 이름은 반복이 아니라 서로 다른 프로그램일 가능성이 크다 (예: 학업 전략 공모전 ↔ 학업계획서 공모전)
  if (Math.abs(Date.parse(startOf(a)) - Date.parse(startOf(b))) < 60 * 86_400_000) return false;
  const similarity = dice(x.grams, y.grams);
  if (similarity >= SAME) return true;
  if (similarity >= LIKELY && sameOrganizer(a, b)) return true;
  if (similarity >= MAYBE) return "maybe";
  return false;
}

// 묶음을 계산해 각 공고의 seriesId를 채운다. 혼자인 공고는 seriesId를 지운다.
// current: 목록에 있는 공고, archive: 보관함. 애매한 쌍은 지금 목록에 있는 공고에 대해서만 AI에게 묻는다
export async function assignSeries(current: Program[], archive: Program[], { useAi = true } = {}): Promise<number> {
  const all = [...current, ...archive];
  const infos = all.map(titleInfo);
  const parent = all.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  // 묶음마다 대표 공고와 크기. 두 묶음을 이을 때 대표끼리도 비슷해야 한다
  // (A~B, B~C만으로 A·B·C가 사슬처럼 이어져 묶음이 끝없이 커지지 않게)
  const size = all.map(() => 1);
  // 묶음마다 학교 밖 주최 기관 이름들. 서로 다른 외부 기관의 묶음은 잇지 않는다
  // (주최가 학교 부서로 적힌 공고가 회사 A·B의 현장실습을 잇는 다리가 되지 않게)
  const outside = all.map((p) => (p.organizer && p.organizerType && p.organizerType !== "학교" ? [p.organizer] : []));
  // 묶음마다 서로 다른 기본 제목들. 이을 때 한 쌍이라도 "이름만 바뀐" 제목이면 잇지 않는다
  // (회사 이름 없는 "현장실습 사전교육" 공고가 회사 A·B 묶음을 잇는 다리가 되지 않게)
  const bases = infos.map((info) => [info.base]);
  const compatible = (x: string[], y: string[]) =>
    x.length === 0 || y.length === 0 || x.some((a) => y.some((b) => a.includes(b) || b.includes(a)));
  // byAi: AI가 이 쌍을 직접 보고 같다고 판단했으면 묶음 단위 검사를 건너뛴다
  const join = (i: number, j: number, byAi = false) => {
    const [ri, rj] = [find(i), find(j)];
    if (ri === rj) return;
    if (!byAi && !compatible(outside[ri], outside[rj])) return;
    if (!byAi && bases[ri].some((a) => bases[rj].some((b) => a !== b && swappedName(a, b)))) return;
    const [big, small] = size[ri] >= size[rj] ? [ri, rj] : [rj, ri];
    parent[small] = big;
    size[big] += size[small];
    outside[big] = [...new Set([...outside[big], ...outside[small]])];
    bases[big] = [...new Set([...bases[big], ...bases[small]])];
  };
  // 이을 쌍을 모아 두었다가 가장 비슷한 쌍부터 잇는다
  const edges: { i: number; j: number; score: number; byAi?: boolean }[] = [];
  const score = (i: number, j: number) => (infos[i].base === infos[j].base ? 2 : dice(infos[i].grams, infos[j].grams));

  const decisions = await readJson<Record<string, boolean>>(DECISIONS_FILE, {});
  const ask: [number, number][] = [];

  const check = (i: number, j: number) => {
    // 이미 AI(또는 사람)가 판단한 쌍은 그 답을 먼저 따른다 (data/series-decisions.json)
    const known = decisions[pairKey(all[i], all[j])];
    if (known !== undefined) {
      if (known && sameSchool(all[i], all[j])) edges.push({ i, j, score: score(i, j), byAi: true });
      return;
    }
    const match = seriesMatch(all[i], all[j], infos[i], infos[j]);
    if (match === true) edges.push({ i, j, score: score(i, j) });
    else if (match === "maybe") {
      const decided = decisions[pairKey(all[i], all[j])];
      if (decided) edges.push({ i, j, score: score(i, j), byAi: true });
      else if (decided === undefined && i < current.length) ask.push([i, j]);
    }
  };

  // 모든 쌍을 비교하면 보관함이 커질수록 느려진다. 두 글자 묶음을 함께 가진 공고만 후보로 골라 비교한다
  // (겹치는 묶음 수로 계산한 유사도가 MAYBE보다 낮은 쌍은 seriesMatch도 false라서 결과는 같다)
  const postings = new Map<string, number[]>();
  infos.forEach((info, i) => {
    for (const gram of info.grams) {
      const list = postings.get(gram);
      if (list) list.push(i);
      else postings.set(gram, [i]);
    }
  });
  for (let i = 0; i < all.length; i++) {
    const shared = new Map<number, number>();
    for (const gram of infos[i].grams) {
      for (const j of postings.get(gram)!) if (j > i) shared.set(j, (shared.get(j) ?? 0) + 1);
    }
    for (const [j, count] of shared) {
      if ((2 * count) / (infos[i].grams.size + infos[j].grams.size) >= MAYBE) check(i, j);
    }
  }
  // 두 글자 묶음이 거의 없는 아주 짧은 기본 제목은 같은 제목끼리만 비교한다
  const shortTitles = new Map<string, number[]>();
  infos.forEach((info, i) => {
    if (info.base !== "" && info.base.length < MIN_BASE) shortTitles.set(info.base, [...(shortTitles.get(info.base) ?? []), i]);
  });
  for (const list of shortTitles.values()) {
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) check(list[a], list[b]);
  }

  // AI(또는 사람)가 같다고 판단한 쌍은 기본 제목 규칙이 바뀌어 후보에서 빠져도 잇는다
  const indexOf = new Map(all.map((p, i) => [p.id, i]));
  for (const [key, same] of Object.entries(decisions)) {
    if (!same) continue;
    const [x, y] = key.split("|").map((id) => indexOf.get(id));
    if (x !== undefined && y !== undefined && sameSchool(all[x], all[y])) edges.push({ i: x, j: y, score: score(x, y), byAi: true });
  }

  // 애매한 쌍은 AI에게 묻고 답을 기억한다 (다음에는 다시 묻지 않는다)
  if (useAi && ask.length > 0) {
    const pairs = ask.map(([i, j]) => [all[i], all[j]] as [Program, Program]);
    const answers = await confirmSameSeries(pairs);
    if (answers) {
      ask.forEach(([i, j], k) => {
        decisions[pairKey(all[i], all[j])] = answers[k];
        if (answers[k]) edges.push({ i, j, score: score(i, j), byAi: true });
      });
      await writeJson(DECISIONS_FILE, decisions);
    }
  }

  edges.sort((a, b) => b.score - a.score).forEach(({ i, j, byAi }) => join(i, j, byAi));

  const groups = new Map<number, Program[]>();
  all.forEach((p, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), p]));

  let count = 0;
  for (const members of groups.values()) {
    if (members.length < 2) {
      delete members[0].seriesId;
      continue;
    }
    // 묶음 id는 가장 오래된 공고의 id. 묶음에 이미 id가 있으면 그대로 써서 댓글이 이어지게 한다
    const oldest = [...members].sort((a, b) => startOf(a).localeCompare(startOf(b)))[0];
    const kept = members.find((p) => p.seriesId && members.some((m) => m.id === p.seriesId))?.seriesId;
    for (const p of members) p.seriesId = kept ?? oldest.id;
    count++;
  }
  return count;
}
