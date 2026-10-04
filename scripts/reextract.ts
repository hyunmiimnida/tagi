import { AI_MISSING, enrichWithAi, findAi } from "../src/ai.ts";
import { ARCHIVE_FILE, EXCLUDED_FILE, PROGRAMS_FILE, readJson, writeJson } from "../src/archive.ts";
import { applyCampus } from "../src/campus.ts";
import { archivers } from "../src/collectors/index.ts";
import { cleanPeriods, enrich } from "../src/extract.ts";
import { fetchHtml } from "../src/fetch.ts";
import type { CollectedItem, Program, School, TagCategory } from "../src/types.ts";

// 규칙으로만 정리된 공고(AI 한도 때문에 --rules로 쌓은 지난 공고 등)를 원문을 다시 읽어 AI로 다시 정리한다.
//   node scripts/reextract.ts --school yu --since 2024-01-01            그 학교의 그 날짜 이후 게시물
//   node scripts/reextract.ts --school yu --since 2024-01-01 --limit 300 최근 것부터 300개만
// 묶음(50개)마다 결과를 data/에 바로 반영하고 .cache/reextract.json에 기억해서, 끊겨도 이어서 한다.
// AI가 "학생 대상 아님"으로 보면 목록·보관함에서 빼고 data/excluded.json에 남긴다. 번호·묶음(seriesId)·원문 링크는 그대로 둔다

const args = process.argv.slice(2);
const arg = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const onlySchools = new Set((arg("--school") ?? "").split(",").filter(Boolean));
const since = arg("--since") ?? "2000-01-01";
const limit = Number(arg("--limit") ?? Infinity);
const CHUNK = 50;

if (!findAi()) throw new Error(AI_MISSING);
const CACHE = new URL("../.cache/reextract.json", import.meta.url);
const schools = await readJson<School[]>(new URL("../config/schools.json", import.meta.url));
const categories = await readJson<TagCategory[]>(new URL("../config/tag-categories.json", import.meta.url));
const done = await readJson<Record<string, "ai" | "excluded" | "unreadable">>(CACHE, {});
const sourceOf = new Map(schools.flatMap((school) => school.sources.map((source) => [source.id, { school, source }] as const)));

let programs = await readJson<Program[]>(PROGRAMS_FILE, []);
let archive = await readJson<Program[]>(ARCHIVE_FILE, []);
const excluded = new Set(await readJson<string[]>(EXCLUDED_FILE, []));

const targets = [...programs, ...archive]
  .filter((p) => p.extractedBy === "rules" && !done[p.id] && (p.postedAt ?? "") >= since)
  .filter((p) => onlySchools.size === 0 || onlySchools.has(sourceOf.get(p.sources[0])?.school.id ?? ""))
  .filter((p) => archivers[sourceOf.get(p.sources[0])?.source.collector ?? ""]?.read)
  .sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""))
  .slice(0, limit);
console.log(`다시 정리할 공고 ${targets.length}개 (${[...onlySchools].join(",") || "모든 학교"}, ${since} 이후)`);

// AI가 채우는 칸만 새 결과로 바꾼다
function update(saved: Program, fresh: Program) {
  saved.organizer = fresh.organizer;
  saved.organizerType = fresh.organizerType;
  saved.target = fresh.target;
  saved.recruitPeriod = fresh.recruitPeriod;
  saved.activityPeriod = fresh.activityPeriod;
  saved.tags = fresh.tags;
  saved.summary = fresh.summary;
  saved.noApplication = fresh.noApplication;
  saved.extractedBy = "ai";
  if (fresh.campus) saved.campus = fresh.campus;
  cleanPeriods(saved);
}

for (let start = 0; start < targets.length; start += CHUNK) {
  const chunk = targets.slice(start, start + CHUNK);
  const items: { saved: Program; item: CollectedItem }[] = [];
  for (const saved of chunk) {
    const { school, source } = sourceOf.get(saved.sources[0])!;
    const url = saved.links.find((l) => l.sourceId === source.id)?.url ?? saved.links[0].url;
    const postId = saved.id.slice(source.id.length + 1);
    try {
      const ctx = { school, source, fetchHtml, isKnown: () => false };
      const item = await archivers[source.collector].read!(ctx, { postId, title: saved.title, url, postedAt: saved.postedAt });
      if (!item) {
        done[saved.id] = "unreadable";
        continue;
      }
      enrich(item, source, categories);
      applyCampus(item.program, school, item.campusLabel);
      items.push({ saved, item });
    } catch (error) {
      console.error(`  읽기 실패 ${url}: ${error instanceof Error ? error.message : error}`);
    }
  }

  const ai = await enrichWithAi(
    items.map(({ item }) => item),
    categories,
  );
  const drop = new Set<Program>();
  for (const { saved, item } of items) {
    if (ai.notForStudents.has(item.program.id)) {
      drop.add(saved);
      for (const link of saved.links) excluded.add(link.url);
      done[saved.id] = "excluded";
    } else if (item.program.extractedBy === "ai") {
      update(saved, item.program);
      done[saved.id] = "ai";
    } // AI가 실패한 글은 기록하지 않아 다음 실행 때 다시 한다
  }
  programs = programs.filter((p) => !drop.has(p));
  archive = archive.filter((p) => !drop.has(p));
  await writeJson(PROGRAMS_FILE, programs);
  await writeJson(ARCHIVE_FILE, archive);
  await writeJson(EXCLUDED_FILE, [...excluded].sort());
  await writeJson(CACHE, done);
  const counts = Object.values(done);
  console.log(
    `${Math.min(start + CHUNK, targets.length)}/${targets.length} · AI로 다시 정리 ${counts.filter((c) => c === "ai").length} · 학생 대상 아님 ${counts.filter((c) => c === "excluded").length}`,
  );
}
console.log("끝");
