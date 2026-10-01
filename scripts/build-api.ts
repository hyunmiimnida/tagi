import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getCategories, getPrograms, getSchools, getSourceNames } from "../lib/data.ts";
import type { Program } from "../src/types.ts";

// 앱이 받아 갈 데이터 파일을 만든다 (사이트 빌드 직전에 자동 실행: npm run build → prebuild).
// 배포되면 https://tagi-ten.vercel.app/api/... 로 열린다. 앱은 앱을 다시 내지 않아도 매일 새 데이터를 받는다.
//   api/programs.json        목록 공고 (최근 90일, 화면에 필요한 칸만)
//   api/meta.json            수집 시각, 태그 카테고리, 학교·기관, 출처 이름
//   api/series/<묶음id>.json  반복 프로그램의 모든 회차 (상세 화면을 열 때만 받는다)
//   api/ids.json             합쳐지거나 보관된 공고의 예전 id를 찾는 표 (없는 주소를 열었을 때만 받는다)

const OUT = join(process.cwd(), "public", "api");
const VERSION = 1; // 파일 형식을 바꾸면 올린다 (앱이 자기가 읽을 수 있는 형식인지 확인한다)

// 앱 화면에 필요 없는 칸(추출 방법, 수집 출처 id 등)은 빼서 파일을 가볍게 한다
function slim(program: Program) {
  const { extractedBy: _extractedBy, sources: _sources, aliases: _aliases, ...rest } = program;
  return rest;
}

const write = (path: string, data: unknown) => {
  writeFileSync(join(OUT, path), JSON.stringify(data));
};

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "series"), { recursive: true });

const programs = getPrograms();
write("programs.json", { version: VERSION, programs: programs.map(slim) });

let collectedAt: string | null = null;
try {
  collectedAt = JSON.parse(readFileSync(join(process.cwd(), "data", "collect-log.json"), "utf8")).ranAt;
} catch {
  // 수집 기록이 없으면 비워 둔다
}
write("meta.json", {
  version: VERSION,
  collectedAt,
  categories: getCategories(),
  schools: getSchools(),
  sourceNames: getSourceNames(),
});

// 반복 프로그램 묶음별 회차 목록. 지금 목록에 있는 공고가 속한 묶음만 만든다
let archive: Program[] = [];
try {
  archive = JSON.parse(readFileSync(join(process.cwd(), "data", "archive.json"), "utf8"));
} catch {
  // 보관함이 없으면 목록만으로 묶는다
}
const seriesIds = new Set(programs.map((p) => p.seriesId).filter((id): id is string => Boolean(id)));
const members = new Map<string, Program[]>();
for (const program of [...programs, ...archive]) {
  if (!program.seriesId || !seriesIds.has(program.seriesId)) continue;
  members.set(program.seriesId, [...(members.get(program.seriesId) ?? []), program]);
}
for (const [id, list] of members) {
  // 회차 목록에는 제목·일정·원문 링크만 있으면 된다
  const rounds = list.map((p) => ({
    id: p.id,
    title: p.title,
    postedAt: p.postedAt,
    collectedAt: p.collectedAt,
    recruitPeriod: p.recruitPeriod,
    activityPeriod: p.activityPeriod,
    links: p.links,
  }));
  write(`series/${encodeURIComponent(id)}.json`, { version: VERSION, rounds });
}

// 없는 공고 주소를 열었을 때(app/not-found.tsx) 찾아보는 표
//   moved: 다른 공고에 합쳐진 id → 지금 id
//   archived: 마감되어 보관함으로 간 id → [제목, 원문 주소, 같은 반복 프로그램의 지금 공고 id]
const currentBySeries = new Map(programs.filter((p) => p.seriesId).map((p) => [p.seriesId, p.id]));
const moved: Record<string, string> = {};
for (const program of programs) for (const alias of program.aliases ?? []) moved[alias] = program.id;
const archived: Record<string, [string, string, string | null]> = {};
for (const program of archive) {
  const entry: [string, string, string | null] = [
    program.title,
    program.links[0]?.url ?? "",
    (program.seriesId && currentBySeries.get(program.seriesId)) || null,
  ];
  for (const id of [program.id, ...(program.aliases ?? [])]) archived[id] = entry;
}
write("ids.json", { version: VERSION, moved, archived });

console.log(`앱 데이터: 공고 ${programs.length}개, 반복 프로그램 ${members.size}개 → public/api/`);
