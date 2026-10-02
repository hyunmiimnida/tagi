import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { AI_ENGINE, AI_MISSING, enrichWithAi, findAi } from "../src/ai.ts";
import { archivers } from "../src/collectors/index.ts";
import { enrich } from "../src/extract.ts";
import { fetchHtml } from "../src/fetch.ts";
import type { CollectedItem, Period, Program, School, TagCategory } from "../src/types.ts";

// AI 추출 점검: 저장된 공고 몇 개를 원문에서 다시 읽어 지금 AI·규칙으로 다시 추출하고, 저장된 결과와 나란히 보여 준다.
// AI 엔진이나 추출 규칙(src/ai.ts)을 바꾼 뒤 결과가 나빠지지 않았는지 사람이 보고 판단할 때 쓴다. 데이터는 바꾸지 않는다.
//   node scripts/ai-sample-check.ts                  학교마다 최근 AI 추출 공고 3개씩
//   node scripts/ai-sample-check.ts --per 5          학교마다 5개씩
//   node scripts/ai-sample-check.ts 실리콘밸리 취트키   제목에 이 말이 들어간 공고만
// 결과는 화면과 logs/ai-sample-check.json에 남는다. 원문의 날짜 줄도 함께 보여 주니 날짜가 맞는지 대조한다.

if (!findAi()) throw new Error(AI_MISSING);
const args = process.argv.slice(2);
const perIndex = args.indexOf("--per");
const per = perIndex >= 0 ? Number(args[perIndex + 1]) : 3;
const words = args.filter((arg, i) => !arg.startsWith("--") && (perIndex < 0 || i !== perIndex + 1));

const schools: School[] = JSON.parse(readFileSync(new URL("../config/schools.json", import.meta.url), "utf8"));
const categories: TagCategory[] = JSON.parse(readFileSync(new URL("../config/tag-categories.json", import.meta.url), "utf8"));
const programs: Program[] = JSON.parse(readFileSync(new URL("../data/programs.json", import.meta.url), "utf8"));
const sourceOf = (p: Program) => {
  const school = schools.find((s) => s.sources.some((x) => x.id === p.sources[0]));
  const source = school?.sources.find((x) => x.id === p.sources[0]);
  return school && source && archivers[source.collector]?.read ? { school, source } : null;
};

const chosen = words.length
  ? programs.filter((p) => words.some((word) => p.title.includes(word)))
  : schools.flatMap((school) =>
      programs
        .filter((p) => p.extractedBy === "ai" && p.postedAt && sourceOf(p)?.school.id === school.id)
        .sort((a, b) => b.postedAt!.localeCompare(a.postedAt!))
        .slice(0, per),
    );

const items: CollectedItem[] = [];
for (const p of chosen) {
  const found = sourceOf(p);
  if (!found) continue;
  const read = archivers[found.source.collector].read!;
  const item = await read({ ...found, fetchHtml, isKnown: () => false }, { postId: p.id.split("-").pop()!, title: p.title, url: p.links[0].url, postedAt: p.postedAt }).catch(() => null);
  if (!item) continue;
  item.program.id = p.id;
  enrich(item, found.source, categories);
  items.push(item);
}

const started = Date.now();
const ai = await enrichWithAi(items, categories);
console.log(`${AI_ENGINE}: ${ai.done}/${items.length}개 추출, 학생 대상 아님 ${ai.notForStudents.size}개, ${Math.round((Date.now() - started) / 1000)}초`);

const period = (p: Period) => `${p.start ?? ""}~${p.end ?? ""}`;
const rows = items.map((item) => {
  const saved = programs.find((p) => p.id === item.program.id)!;
  const fresh = item.program;
  const dateLines = item.text
    .split("\n")
    .filter((line) => /\d{1,2}\s*[.\/월]\s*\d{1,2}/.test(line) && /기간|일시|마감|까지|접수|신청|일정|탐방|교육/.test(line))
    .slice(0, 4)
    .map((line) => line.trim().slice(0, 120));
  const row = {
    id: fresh.id,
    title: fresh.title,
    notForStudents: ai.notForStudents.has(fresh.id),
    recruit: [period(saved.recruitPeriod), period(fresh.recruitPeriod)],
    activity: [period(saved.activityPeriod), period(fresh.activityPeriod)],
    organizer: [`${saved.organizer}(${saved.organizerType})`, `${fresh.organizer}(${fresh.organizerType})`],
    openTo: [saved.target.openTo ?? null, fresh.target.openTo ?? null],
    tags: [[...saved.tags].sort().join(","), [...fresh.tags].sort().join(",")], // 순서만 다른 것은 같게 본다
    summary: fresh.summary ?? null,
    noApplication: fresh.noApplication ?? null,
    dateLines,
  };
  const mark = (pair: unknown[]) => (pair[0] === pair[1] ? "  " : "≠ ");
  console.log(`\n# ${row.title.slice(0, 70)}${row.notForStudents ? "  [학생 대상 아님]" : ""}`);
  for (const key of ["recruit", "activity", "organizer", "openTo", "tags"] as const) {
    console.log(`  ${mark(row[key])}${key.padEnd(9)} ${row[key][0]} → ${row[key][1]}`);
  }
  console.log(`    요약 ${row.summary} · 신청 없이 참여 ${row.noApplication}`);
  for (const line of dateLines) console.log(`    원문: ${line}`);
  return row;
});

mkdirSync(new URL("../logs/", import.meta.url), { recursive: true });
writeFileSync(new URL("../logs/ai-sample-check.json", import.meta.url), JSON.stringify({ engine: AI_ENGINE, checkedAt: new Date().toISOString(), rows }, null, 1));
console.log(`\n저장된 결과(→ 왼쪽)와 다시 추출한 결과(→ 오른쪽). ≠ 줄은 원문과 대조해 어느 쪽이 맞는지 본다 → logs/ai-sample-check.json`);
