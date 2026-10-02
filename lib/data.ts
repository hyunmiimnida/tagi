import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Program, School, TagCategory } from "../src/types.ts";
import { unitsOf } from "./filter.ts";
import type { FilterCategory, ProgramView, SchoolOption } from "./filter.ts";

// 서버에서 수집 결과와 설정 파일을 읽는다

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), path), "utf8"));
}

const readSchools = () => readJson<School[]>("config/schools.json");

// 저장된 공고에 학교(출처가 속한 학교 + 모집 대상 학교)와 교내 기관을 덧붙인다
function toView(program: Program, schools: School[]): ProgramView {
  const schoolIds = new Set(program.target.schools);
  // 다른 캠퍼스 글은 출처 학교(본교) 대신 그 캠퍼스로 보인다
  if (program.campus) schoolIds.add(program.campus);
  else
    for (const school of schools) {
      if (school.sources.some((source) => program.sources.includes(source.id))) schoolIds.add(school.id);
    }
  const mine = schools.filter((school) => schoolIds.has(school.id));
  return {
    ...program,
    schoolIds: [...schoolIds],
    schoolLabels: mine.map((school) => school.shortName),
    units: mine.flatMap((school) => unitsOf(program, school.units ?? [])),
  };
}

// 빌드할 때는 공고 페이지 수백 개가 같은 데이터를 쓰므로 한 번만 읽는다.
// 개발 중(npm run dev)에는 데이터가 바뀌면 바로 보이도록 매번 읽는다
const cacheable = process.env.NODE_ENV === "production";
let programsCache: ProgramView[] | null = null;

export function getPrograms(): ProgramView[] {
  if (cacheable && programsCache) return programsCache;
  const schools = readSchools();
  const programs = readJson<Program[]>("data/programs.json").map((program) => toView(program, schools));
  if (cacheable) programsCache = programs;
  return programs;
}

export const getProgram = (id: string) => getPrograms().find((program) => program.id === id);

// 보관함(마지막 일정이 오래 지난 공고). 반복 프로그램의 지난 회차를 보여 줄 때만 쓴다
let archiveCache: Program[] | null = null;
function getArchive(): Program[] {
  try {
    if (!cacheable || !archiveCache) archiveCache = readJson<Program[]>("data/archive.json");
  } catch {
    archiveCache = [];
  }
  return archiveCache;
}

const roundStart = (p: Program) => p.recruitPeriod.start ?? p.postedAt ?? p.activityPeriod.start ?? p.collectedAt.slice(0, 10);
const NEAR_MS = 14 * 86_400_000; // 2주 안의 글은 같은 회차를 다른 곳에 올린 것으로 친다 (재게시는 수집 때 이미 합친다)

// 같은 반복 프로그램의 지난 회차들 (최근 순)
export function getPastRounds(program: Program): Program[] {
  if (!program.seriesId) return [];
  const mine = roundStart(program);
  const near = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) < NEAR_MS;
  const members = [...getPrograms(), ...getArchive()]
    .filter((p) => p.seriesId === program.seriesId && p.id !== program.id && roundStart(p) < mine)
    .sort((a, b) => roundStart(b).localeCompare(roundStart(a)));

  const rounds: Program[] = [];
  for (const p of members) {
    if (near(roundStart(p), mine) || rounds.some((r) => near(roundStart(r), roundStart(p)))) continue;
    rounds.push(p);
  }
  return rounds;
}

// 반복 프로그램 묶음 → [가장 최근 회차 제목, 지금 목록에 있는 공고 id(없으면 null)]. 프로필의 "내 댓글"이 어느 공고인지 보여 줄 때 쓴다
export function getSeriesInfo(): Record<string, [string, string | null]> {
  const info: Record<string, [string, string | null]> = {};
  const latest: Record<string, string> = {};
  for (const p of getArchive()) {
    if (!p.seriesId || (latest[p.seriesId] ?? "") > roundStart(p)) continue;
    latest[p.seriesId] = roundStart(p);
    info[p.seriesId] = [p.title, null];
  }
  // 지금 목록에 있는 공고가 있으면 그 공고로 연결한다
  for (const p of getPrograms()) {
    if (!p.seriesId) continue;
    const [, current] = info[p.seriesId] ?? [];
    if (!current || (latest[p.seriesId] ?? "") <= roundStart(p)) {
      latest[p.seriesId] = roundStart(p);
      info[p.seriesId] = [p.title, p.id];
    }
  }
  return info;
}

export const getCategories = (): FilterCategory[] =>
  readJson<TagCategory[]>("config/tag-categories.json").map(({ id, name, tags }) => ({
    id,
    name,
    tags: tags.map((tag) => tag.name),
  }));

export const getSchools = (): SchoolOption[] =>
  readSchools().map(({ id, name, shortName, units }) => ({
    id,
    name,
    shortName,
    units: (units ?? []).map((unit) => unit.name),
  }));

// 출처 id → "영남대학교 취업정보" 같은 표시 이름
export function getSourceNames(): Record<string, string> {
  const names: Record<string, string> = {};
  for (const school of readSchools()) {
    for (const source of school.sources) names[source.id] = `${school.name} ${source.name}`;
  }
  return names;
}

// 출처 요약. 예: "영남대학교·경북대학교·계명대학교 공지 34곳" (출처가 많아 이름을 다 나열하지 않는다)
export function describeSources(): string {
  const schools = readSchools();
  const count = schools.reduce((n, school) => n + school.sources.filter((s) => s.enabled).length, 0);
  return `${schools.map((school) => school.name).join("·")} 공지 ${count}곳`;
}

// 학교별 마지막 수집 시각. 학교 출처 중 가장 오래전에 성공한 시각을 보여 준다 (한 곳이라도 멈추면 드러나게)
const STALE_DAYS = 3; // 이보다 오래 수집에 성공하지 못한 학교는 바닥글에 경고한다

export function getCollectedBySchool(): { school: string; at: string; stale: boolean }[] {
  try {
    const log = readJson<{ sources: { source: string; lastSuccessAt?: string }[] }>("data/collect-log.json");
    const last = new Map(log.sources.map((s) => [s.source, s.lastSuccessAt]));
    return readSchools().flatMap((school) => {
      const times = school.sources.filter((s) => s.enabled).map((s) => last.get(s.id));
      if (times.length === 0 || times.some((t) => !t)) return [];
      const oldest = (times as string[]).sort()[0];
      const stale = Date.now() - Date.parse(oldest) > STALE_DAYS * 86_400_000;
      return [{ school: school.shortName, at: formatKoreanTime(oldest), stale }];
    });
  } catch {
    return [];
  }
}

// 관리자 화면의 출처별 수집 상태 (빌드할 때의 수집 기록)
export interface SourceStatus {
  id: string;
  name: string; // "영남대학교 취업정보"
  enabled: boolean;
  localOnly: boolean; // 내 컴퓨터에서만 수집
  ok: boolean | null; // 마지막 실행 결과 (기록이 없으면 null)
  count: number | null; // 마지막 실행에서 가져온 새 글
  message: string | null;
  lastSuccessAt: string | null;
  failStreak: number;
}

export function getCollectStatus(): { ranAt: string | null; sources: SourceStatus[] } {
  let log: { ranAt?: string; sources?: { source: string; ok: boolean; count?: number; message?: string; lastSuccessAt?: string; failStreak?: number }[] } = {};
  try {
    log = readJson("data/collect-log.json");
  } catch {
    // 수집 기록이 없으면 빈 상태로 보여 준다
  }
  const bySource = new Map((log.sources ?? []).map((s) => [s.source, s]));
  const sources = readSchools().flatMap((school) =>
    school.sources.map((source) => {
      const entry = bySource.get(source.id);
      return {
        id: source.id,
        name: `${school.name} ${source.name}`,
        enabled: source.enabled,
        localOnly: Boolean(source.localOnly),
        ok: entry ? entry.ok : null,
        count: entry?.count ?? null,
        message: entry?.message ?? null,
        lastSuccessAt: entry?.lastSuccessAt ?? null,
        failStreak: entry?.failStreak ?? 0,
      };
    }),
  );
  return { ranAt: log.ranAt ?? null, sources };
}

// 마지막 수집 시각을 "10.1 06:00" 형식(한국 시간)으로
export function getLastCollected(): string | null {
  try {
    const { ranAt } = readJson<{ ranAt: string }>("data/collect-log.json");
    return formatKoreanTime(ranAt);
  } catch {
    return null;
  }
}

function formatKoreanTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("month")}.${get("day")} ${get("hour")}:${get("minute")}`;
}
