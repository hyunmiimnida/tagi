import { isCurrent, toDateString } from "../lib/filter.ts";
import { AI_MISSING, findAi, recheckFields } from "./ai.ts";
import { PROGRAMS_FILE, readJson, writeJson } from "./archive.ts";
import { archivers } from "./collectors/index.ts";
import { fetchHtml, isAllowedByRobots } from "./fetch.ts";
import type { CollectContext, CollectedItem, Program, School } from "./types.ts";

// 목록(data/programs.json)의 공고 중 나중에 생긴 AI 칸(다른 학교 학생도 지원할 수 있는지, 한 줄 요약, 모집 기간이 없는 글의 신청 없이 참여 여부,
// 상세 화면의 항목별 요약 digest)을 확인하지 않은 글을 다시 읽어 AI에게 묻는다.
//   npm run recheck                 모두
//   npm run recheck -- --limit 10   앞에서부터 10개만 (먼저 몇 개 돌려 원문과 대조할 때)
// 항목별 요약은 AI 사용량을 아끼려고 아직 볼 만한 공고(isCurrent)만 채운다. 지난 공고는 지금 화면 그대로 보인다.
// 본문이 있는 출처만 확인한다. 새로 수집하는 글은 수집할 때 함께 확인하므로 한 번만 돌리면 된다.

const BATCH = 10;
const limitAt = process.argv.indexOf("--limit");
let left = limitAt >= 0 ? Number(process.argv[limitAt + 1]) : Infinity;
if (!(left > 0)) throw new Error("--limit 뒤에 1 이상의 숫자를 적어 주세요");

if (!findAi()) throw new Error(`확인할 수 없습니다: ${AI_MISSING}`);
const schools = await readJson<School[]>(new URL("../config/schools.json", import.meta.url));
const programs = await readJson<Program[]>(PROGRAMS_FILE, []);
const today = toDateString(new Date());

const needsCheck = (p: Program) =>
  p.target.openTo === undefined ||
  p.summary === undefined ||
  (p.noApplication === undefined && !p.recruitPeriod.start && !p.recruitPeriod.end) ||
  (p.digest === undefined && isCurrent(p, today));

for (const school of schools) {
  for (const source of school.sources) {
    const read = archivers[source.collector]?.read;
    if (!source.enabled || !read || left <= 0) continue;
    const label = `[${school.name} > ${source.name}]`;
    const todo = programs.filter((p) => needsCheck(p) && p.links.some((l) => l.sourceId === source.id)).slice(0, left);
    if (todo.length === 0) continue;
    if (!(await isAllowedByRobots(source.url))) {
      console.log(`${label} robots.txt에서 막아서 건너뜀`);
      continue;
    }
    const ctx: CollectContext = { school, source, fetchHtml, isKnown: () => false };
    console.log(`${label} 확인할 공고 ${todo.length}개`);
    left -= todo.length;

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
      const answered = await recheckFields(items);
      await writeJson(PROGRAMS_FILE, programs); // 끊겨도 다시 실행하면 남은 것만 한다
      const open = items.filter((item) => item.program.target.openTo).length;
      const digests = items.filter((item) => item.program.digest).length;
      console.log(`${label} ${Math.min(i + BATCH, todo.length)}/${todo.length} (답 ${answered}개, 다른 학교도 가능 ${open}개, 항목별 요약 ${digests}개)`);
    }
  }
}
console.log("끝");
