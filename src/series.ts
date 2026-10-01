import { confirmSameSeries } from "./ai.ts";
import { readJson, writeJson } from "./archive.ts";
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
  if (x.base.length < MIN_BASE || y.base.length < MIN_BASE) return x.base === y.base && x.base !== "" && sameOrganizer(a, b);
  if (x.base === y.base) return true;
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
  const join = (i: number, j: number) => {
    parent[find(i)] = find(j);
  };

  const decisions = await readJson<Record<string, boolean>>(DECISIONS_FILE, {});
  const ask: [number, number][] = [];

  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const match = seriesMatch(all[i], all[j], infos[i], infos[j]);
      if (match === true) join(i, j);
      else if (match === "maybe") {
        const decided = decisions[pairKey(all[i], all[j])];
        if (decided) join(i, j);
        else if (decided === undefined && i < current.length) ask.push([i, j]);
      }
    }
  }

  // 애매한 쌍은 AI에게 묻고 답을 기억한다 (다음에는 다시 묻지 않는다)
  if (useAi && ask.length > 0) {
    const pairs = ask.map(([i, j]) => [all[i], all[j]] as [Program, Program]);
    const answers = await confirmSameSeries(pairs);
    if (answers) {
      ask.forEach(([i, j], k) => {
        decisions[pairKey(all[i], all[j])] = answers[k];
        if (answers[k]) join(i, j);
      });
      await writeJson(DECISIONS_FILE, decisions);
    }
  }

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
