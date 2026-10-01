import { readFileSync, writeFileSync } from "node:fs";
import { pickProgramTitles } from "../src/ai.ts";
import { PROGRAMS_FILE, readJson } from "../src/archive.ts";
import { archivers } from "../src/collectors/index.ts";
import { repostKey, titleSimilarity } from "../src/dedupe.ts";
import { fetchHtml } from "../src/fetch.ts";
import { sameSchool } from "../src/school-of.ts";
import type { Program, School } from "../src/types.ts";

// 품질 점검 (평가 문서의 출시 기준): 같은 공고 중복 줄, 잡음(신청할 것 없는 글) 비율, 마감일 대조용 샘플
//   node scripts/audit-quality.ts            → logs/quality-audit.json
//   --sample 20 : 마감일 대조용으로 원문을 읽을 공고 수 (사람이 날짜 줄을 보고 확인한다)
const args = process.argv.slice(2);
const sampleSize = Number(args[args.indexOf("--sample") + 1]) || 20;
const programs = await readJson<Program[]>(PROGRAMS_FILE, []);
const today = new Date().toISOString().slice(0, 10);
const open = programs.filter((p) => (p.recruitPeriod.end ?? p.activityPeriod.end ?? "9999") >= today);

// 1. 중복 줄: 같은 학교에서 재게시 표시를 지운 제목이 거의 같은 공고 쌍
const duplicates: [string, string][] = [];
for (let i = 0; i < open.length; i++) {
  for (let j = i + 1; j < open.length; j++) {
    const [a, b] = [open[i], open[j]];
    if (!sameSchool(a, b)) continue;
    if (repostKey(a.title) === repostKey(b.title) || titleSimilarity(a.title, b.title) >= 0.9) duplicates.push([a.title, b.title]);
  }
}

// 2. 잡음: 제목만 보고 "신청·참가할 것이 없다"고 AI가 확실히 본 글 (애매하면 고르는 기준이라 남은 것이 잡음)
const noise: string[] = [];
for (let i = 0; i < open.length; i += 200) {
  const batch = open.slice(i, i + 200);
  const picked = await pickProgramTitles(batch.map((p) => p.title));
  if (!picked) continue;
  const keep = new Set(picked);
  batch.forEach((p, k) => !keep.has(k) && noise.push(`${p.id}\t${p.title}`));
}

// 3. 마감일 대조 샘플: 본문에서 날짜가 들어 있는 줄만 뽑아 저장된 값과 나란히 둔다
const schools: School[] = JSON.parse(readFileSync(new URL("../config/schools.json", import.meta.url), "utf8"));
const readable = open.filter((p) => p.recruitPeriod.end && p.postedAt);
const sample = readable.sort(() => Math.random() - 0.5).slice(0, sampleSize);
const dateLines = /(\d{1,2}\s*[./월]\s*\d{1,2}|\d{4}\s*[.-]\s*\d{1,2}|까지|마감|기간|일시)/;
const checks = [];
for (const program of sample) {
  const link = program.links[0];
  const school = schools.find((s) => s.sources.some((src) => src.id === link.sourceId))!;
  const source = school.sources.find((src) => src.id === link.sourceId)!;
  const read = archivers[source.collector]?.read;
  if (!read) continue;
  try {
    const postId = link.url.match(/(\d+)(?!.*\d)/)?.[1] ?? "";
    const item = await read({ school, source, fetchHtml, isKnown: () => false }, { postId, title: program.title, url: link.url, postedAt: program.postedAt });
    const lines = (item?.text ?? "").split("\n").filter((l) => dateLines.test(l)).slice(0, 8).map((l) => l.slice(0, 120));
    checks.push({ id: program.id, title: program.title, postedAt: program.postedAt, recruit: program.recruitPeriod, activity: program.activityPeriod, lines });
  } catch (error) {
    console.error("읽기 실패", link.url, error instanceof Error ? error.message : error);
  }
}

const report = { checkedAt: new Date().toISOString(), open: open.length, duplicates, noise, noiseRate: +(noise.length / open.length).toFixed(3), checks };
writeFileSync(new URL("../logs/quality-audit.json", import.meta.url), JSON.stringify(report, null, 1));
console.log(`모집 중 ${open.length}개 · 중복 의심 ${duplicates.length}쌍 · 잡음 ${noise.length}개(${(report.noiseRate * 100).toFixed(1)}%) · 날짜 대조 샘플 ${checks.length}개 → logs/quality-audit.json`);
