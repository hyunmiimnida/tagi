import { mkdir } from "node:fs/promises";
import { confirmDuplicates, enrichWithAi } from "./ai.ts";
import {
  ARCHIVE_FILE,
  DATA_DIR,
  EXCLUDED_FILE,
  PROGRAMS_FILE,
  mergeArchive,
  readJson,
  splitByAge,
  writeJson,
} from "./archive.ts";
import { collectors } from "./collectors/index.ts";
import { collapseReposts, findAmbiguousPairs, mergePair, mergePrograms } from "./dedupe.ts";
import { cleanPeriods } from "./extract.ts";
import { enrich } from "./extract.ts";
import { fetchHtml, isAllowedByRobots } from "./fetch.ts";
import { assignSeries } from "./series.ts";
import type { Program, School, TagCategory } from "./types.ts";

const CONFIG_DIR = new URL("../config/", import.meta.url);

const schools = await readJson<School[]>(new URL("schools.json", CONFIG_DIR));
const categories = await readJson<TagCategory[]>(new URL("tag-categories.json", CONFIG_DIR));
const existing = await readJson<Program[]>(PROGRAMS_FILE, []);
const archived = await readJson<Program[]>(ARCHIVE_FILE, []);
// --refresh: 이미 저장된 게시물도 다시 읽어 정보를 새로 추출한다
const refresh = process.argv.includes("--refresh");
const excludedUrls = new Set(await readJson<string[]>(EXCLUDED_FILE, []));
const urlsOf = (programs: Program[]) => programs.flatMap((p) => p.links.map((l) => l.url));
// AI를 쓰는 출처에서 AI 추출이 실패해 규칙으로만 저장된 글은 "아직 모르는 글"로 보고 다시 읽어 AI로 추출한다
const aiSources = new Set(schools.flatMap((s) => s.sources.filter((source) => source.useAi).map((source) => source.id)));
const settled = (p: Program) => p.extractedBy === "ai" || !p.sources.some((s) => aiSources.has(s));
const knownUrls = new Set(refresh ? [] : [...urlsOf([...existing, ...archived].filter(settled)), ...excludedUrls]);
// AI로 이미 추출한 게시물 주소. 목록을 매번 다시 읽는 출처도 AI는 새 게시물에만 쓴다
const aiDoneUrls = new Set(refresh ? [] : urlsOf([...existing, ...archived].filter((p) => p.extractedBy === "ai")));

const incoming: Program[] = [];
const excluded = new Set<string>(); // 학생 대상이 아니라서 뺀 게시물 id
const log: { source: string; ok: boolean; count: number; message: string }[] = [];

for (const school of schools) {
  for (const source of school.sources) {
    const label = `[${school.name} > ${source.name}]`;
    if (!source.enabled) continue;

    // 해외 서버(GitHub Actions)에서 접속할 수 없는 출처는 내 컴퓨터에서만 수집한다
    if (source.localOnly && process.env.GITHUB_ACTIONS === "true") {
      console.log(`${label} 내 컴퓨터에서만 수집하는 출처라서 건너뜀`);
      log.push({ source: source.id, ok: true, count: 0, message: "내 컴퓨터에서만 수집" });
      continue;
    }

    // 한 출처가 실패해도 나머지 출처는 계속 수집한다
    try {
      const collector = collectors[source.collector];
      if (!collector) throw new Error(`"${source.collector}" 수집기가 등록되어 있지 않음`);
      if (!(await isAllowedByRobots(source.url))) {
        console.log(`${label} robots.txt에서 자동 접근을 막아서 수집하지 않음`);
        log.push({ source: source.id, ok: true, count: 0, message: "robots.txt에서 막음" });
        continue;
      }

      const items = await collector({ school, source, fetchHtml, isKnown: (url) => knownUrls.has(url) });
      for (const item of items) enrich(item, source, categories);
      const needAi = items.filter((item) => !aiDoneUrls.has(item.program.links[0].url));
      const ai = source.useAi ? await enrichWithAi(needAi, categories) : null;
      const aiCount = ai?.done ?? 0;
      // 교원·직원만 대상인 글은 학생용 정보가 아니므로 저장하지 않는다
      const studentItems = items.filter((item) => !ai?.notForStudents.has(item.program.id));
      ai?.notForStudents.forEach((id) => excluded.add(id));
      for (const item of items) if (excluded.has(item.program.id)) excludedUrls.add(item.program.links[0].url);
      if (ai?.notForStudents.size) console.log(`${label} 학생 대상이 아닌 글 ${ai.notForStudents.size}개 제외`);
      incoming.push(...studentItems.map((item) => item.program));

      console.log(`${label} ${items.length}개 수집` + (aiCount ? ` (AI 추출 ${aiCount}개)` : ""));
      log.push({ source: source.id, ok: true, count: items.length, message: "" });
    } catch (error) {
      // 접속 오류는 실제 원인(cause)까지 기록한다
      const cause = error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : "";
      const message = (error instanceof Error ? error.message : String(error)) + cause;
      console.error(`${label} 수집 실패: ${message}`);
      log.push({ source: source.id, ok: false, count: 0, message });
    }
  }
}

// 마지막 일정이 오래 지난 항목은 지우지 않고 보관함(archive.json)으로 옮긴다
// 같은 게시판에 다시 올린 글은 하나로 합치고, 말이 안 되는 기간은 지운다
const combined = collapseReposts(mergePrograms(existing, incoming).filter((p) => !excluded.has(p.id)));
combined.forEach(cleanPeriods);
const { current, old } = splitByAge(combined);
let merged = current;

// 제목 표현이 달라 규칙으로 판단하기 애매한 중복은 AI에게 묻는다
const pairs = findAmbiguousPairs(merged);
for (const index of await confirmDuplicates(pairs)) {
  const [a, b] = pairs[index];
  if (merged.includes(a) && merged.includes(b)) {
    merged = mergePair(merged, a, b);
    console.log(`중복으로 합침: ${a.title} ← ${b.title}`);
  }
}

// 해마다 반복되는 프로그램을 지난 공고와 묶는다
// 목록에 다시 올라온 공고(예: 다시 읽어 새 일정을 찾은 글)는 보관함에서 뺀다
const listedUrls = new Set(merged.flatMap((p) => p.links.map((l) => l.url)));
const archive = mergeArchive(
  archived.filter((p) => !p.links.some((l) => listedUrls.has(l.url)) && !excluded.has(p.id)),
  old,
);
const seriesCount = await assignSeries(merged, archive);
console.log(`반복 프로그램 묶음 ${seriesCount}개`);

await mkdir(DATA_DIR, { recursive: true });
await writeJson(PROGRAMS_FILE, merged);
await writeJson(ARCHIVE_FILE, archive);
await writeJson(EXCLUDED_FILE, [...excludedUrls].sort());
await writeJson(new URL("collect-log.json", DATA_DIR), { ranAt: new Date().toISOString(), total: merged.length, sources: log });
console.log(`새로 수집 ${incoming.length}개, 전체 ${merged.length}개를 data/programs.json에 저장`);

// 실패한 출처가 있으면 자동 실행(GitHub Actions)에서 알림이 가도록 실패로 끝낸다
if (log.some((entry) => !entry.ok)) process.exitCode = 1;
