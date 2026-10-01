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
import { findAmbiguousPairs, mergePair, mergePrograms } from "./dedupe.ts";
import { enrich } from "./extract.ts";
import { fetchHtml, isAllowedByRobots } from "./fetch.ts";
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
const knownUrls = new Set(refresh ? [] : [...urlsOf(existing), ...urlsOf(archived), ...excludedUrls]);
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
const { current, old } = splitByAge(mergePrograms(existing, incoming).filter((p) => !excluded.has(p.id)));
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

await mkdir(DATA_DIR, { recursive: true });
await writeJson(PROGRAMS_FILE, merged);
if (old.length > 0) await writeJson(ARCHIVE_FILE, mergeArchive(await readJson<Program[]>(ARCHIVE_FILE, []), old));
await writeJson(EXCLUDED_FILE, [...excludedUrls].sort());
await writeJson(new URL("collect-log.json", DATA_DIR), { ranAt: new Date().toISOString(), total: merged.length, sources: log });
console.log(`새로 수집 ${incoming.length}개, 전체 ${merged.length}개를 data/programs.json에 저장`);

// 실패한 출처가 있으면 자동 실행(GitHub Actions)에서 알림이 가도록 실패로 끝낸다
if (log.some((entry) => !entry.ok)) process.exitCode = 1;
