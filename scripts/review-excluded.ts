import { readFileSync, writeFileSync } from "node:fs";
import { enrichWithAi } from "../src/ai.ts";
import { ARCHIVE_FILE, EXCLUDED_FILE, PROGRAMS_FILE, readJson, splitByAge, writeJson } from "../src/archive.ts";
import { archivers } from "../src/collectors/index.ts";
import { collapseReposts, mergePrograms } from "../src/dedupe.ts";
import { cleanPeriods, enrich } from "../src/extract.ts";
import { fetchHtml } from "../src/fetch.ts";
import type { CollectedItem, Program, School, Source, TagCategory } from "../src/types.ts";

// "학생 대상 아님"으로 뺀 글(data/excluded.json)을 다시 읽어 AI에게 다시 판단받는다.
//   node scripts/review-excluded.ts          판단만 하고 결과를 logs/excluded-review.json에 저장
//   node scripts/review-excluded.ts --apply  다시 "학생 대상"이라고 판단된 글을 목록·보관함에 되살리고 excluded.json에서 뺀다
const apply = process.argv.includes("--apply");
const schools: School[] = JSON.parse(readFileSync(new URL("../config/schools.json", import.meta.url), "utf8"));
const categories: TagCategory[] = JSON.parse(readFileSync(new URL("../config/tag-categories.json", import.meta.url), "utf8"));
const excluded = await readJson<string[]>(EXCLUDED_FILE, []);

// 주소로 출처와 게시물 번호를 찾는다
function locate(url: string): { school: School; source: Source; postId: string } | null {
  for (const school of schools) {
    for (const source of school.sources) {
      if (!archivers[source.collector]?.read) continue;
      if (source.board) {
        const [before, after] = source.board.viewUrl.split("{id}").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        const pattern = `${before}(\\d+)${after}`;
        const id = url.match(new RegExp(`^${pattern}$`))?.[1];
        if (id) return { school, source, postId: id };
      } else {
        const target = new URL(url), base = new URL(source.url);
        if (target.origin + target.pathname === base.origin + base.pathname && target.searchParams.get("articleNo")) {
          return { school, source, postId: target.searchParams.get("articleNo")! };
        }
      }
    }
  }
  return null;
}

const items: (CollectedItem & { url: string })[] = [];
for (const url of excluded) {
  const found = locate(url);
  if (!found) continue;
  const archiver = archivers[found.source.collector];
  const ctx = { school: found.school, source: found.source, fetchHtml, isKnown: () => false };
  try {
    const item = await archiver.read!(ctx, { postId: found.postId, title: "", url, postedAt: null });
    if (item) {
      enrich(item, found.source, categories);
      items.push({ ...item, url });
    }
  } catch (error) {
    console.error("읽기 실패", url, error instanceof Error ? error.message : error);
  }
}
console.log(`다시 읽은 글 ${items.length}/${excluded.length}개, AI에게 다시 묻는 중`);
const ai = await enrichWithAi(items, categories);
const revived = items.filter((item) => item.program.extractedBy === "ai" && !ai.notForStudents.has(item.program.id));
const still = items.filter((item) => ai.notForStudents.has(item.program.id));
writeFileSync(
  new URL("../logs/excluded-review.json", import.meta.url),
  JSON.stringify({ revived: revived.map((i) => [i.url, i.program.title]), still: still.map((i) => [i.url, i.program.title]) }, null, 1),
);
console.log(`다시 학생 대상으로 판단 ${revived.length}개, 여전히 제외 ${still.length}개 → logs/excluded-review.json`);

if (apply && revived.length > 0) {
  const saved = [...(await readJson<Program[]>(PROGRAMS_FILE, [])), ...(await readJson<Program[]>(ARCHIVE_FILE, []))];
  const all = collapseReposts(mergePrograms(saved, revived.map((i) => i.program)));
  all.forEach(cleanPeriods);
  const { current, old } = splitByAge(all);
  await writeJson(PROGRAMS_FILE, current);
  await writeJson(ARCHIVE_FILE, old);
  const back = new Set(revived.map((i) => i.url));
  await writeJson(EXCLUDED_FILE, excluded.filter((url) => !back.has(url)));
  console.log(`되살림: 목록 ${current.length}개, 보관함 ${old.length}개로 저장`);
}
