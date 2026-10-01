import { checkOpenTo, findCodex } from "./ai.ts";
import { PROGRAMS_FILE, readJson, writeJson } from "./archive.ts";
import { archivers } from "./collectors/index.ts";
import { fetchHtml, isAllowedByRobots } from "./fetch.ts";
import type { CollectContext, CollectedItem, Program, School } from "./types.ts";

// 목록(data/programs.json)의 공고 중 "다른 학교 학생도 지원할 수 있는지" 확인하지 않은 글을 다시 읽어 AI에게 묻는다.
//   npm run check-open-to
// 본문이 있는 출처만 확인한다. 새로 수집하는 글은 수집할 때 함께 확인하므로 한 번만 돌리면 된다.

const BATCH = 20;

if (!findCodex()) throw new Error("Codex CLI가 없어 확인할 수 없습니다 (npm install -g @openai/codex)");
const schools = await readJson<School[]>(new URL("../config/schools.json", import.meta.url));
const programs = await readJson<Program[]>(PROGRAMS_FILE, []);

for (const school of schools) {
  for (const source of school.sources) {
    const read = archivers[source.collector]?.read;
    if (!source.enabled || !read) continue;
    const label = `[${school.name} > ${source.name}]`;
    if (!(await isAllowedByRobots(source.url))) {
      console.log(`${label} robots.txt에서 막아서 건너뜀`);
      continue;
    }
    const ctx: CollectContext = { school, source, fetchHtml, isKnown: () => false };
    const todo = programs.filter((p) => p.target.openTo === undefined && p.links.some((l) => l.sourceId === source.id));
    console.log(`${label} 확인할 공고 ${todo.length}개`);

    for (let i = 0; i < todo.length; i += BATCH) {
      const items: CollectedItem[] = [];
      for (const program of todo.slice(i, i + BATCH)) {
        const link = program.links.find((l) => l.sourceId === source.id)!;
        try {
          const post = await read(ctx, { postId: program.id, title: program.title, url: link.url, postedAt: program.postedAt });
          if (post) items.push({ program, writer: post.writer, text: post.text });
        } catch (error) {
          console.error(`  읽기 실패 ${link.url}:`, error instanceof Error ? error.message : error);
        }
      }
      const answered = await checkOpenTo(items);
      await writeJson(PROGRAMS_FILE, programs); // 끊겨도 다시 실행하면 남은 것만 한다
      const open = items.filter((item) => item.program.target.openTo).length;
      console.log(`${label} ${Math.min(i + BATCH, todo.length)}/${todo.length} (답 ${answered}개, 다른 학교도 가능 ${open}개)`);
    }
  }
}
console.log("끝");
