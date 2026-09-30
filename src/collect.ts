import { mkdir, readFile, writeFile } from "node:fs/promises";
import { collectors } from "./collectors/index.ts";
import { fetchHtml, isAllowedByRobots } from "./fetch.ts";
import type { Program, School } from "./types.ts";

const SCHOOLS_FILE = new URL("../config/schools.json", import.meta.url);
const OUTPUT_DIR = new URL("../data/", import.meta.url);

const schools: School[] = JSON.parse(await readFile(SCHOOLS_FILE, "utf8"));
const all: Program[] = [];
let failed = 0;

for (const school of schools) {
  for (const source of school.sources) {
    const label = `[${school.name} > ${source.name}]`;
    if (!source.enabled) {
      console.log(`${label} 꺼져 있어서 건너뜀`);
      continue;
    }
    // 한 출처가 실패해도 나머지 출처는 계속 수집한다
    try {
      const collector = collectors[source.collector];
      if (!collector) throw new Error(`"${source.collector}" 수집기가 등록되어 있지 않음`);
      if (!(await isAllowedByRobots(source.url))) {
        console.log(`${label} robots.txt에서 자동 접근을 막아서 수집하지 않음`);
        continue;
      }
      const programs = await collector({ school, source, fetchHtml });
      if (programs.length === 0) throw new Error("수집된 항목이 0개 (사이트 구조가 바뀌었을 수 있음)");
      all.push(...programs);
      console.log(`${label} ${programs.length}개 수집`);
    } catch (error) {
      failed++;
      console.error(`${label} 수집 실패:`, error instanceof Error ? error.message : error);
    }
  }
}

await mkdir(OUTPUT_DIR, { recursive: true });
await writeFile(new URL("programs.json", OUTPUT_DIR), JSON.stringify(all, null, 2) + "\n");
console.log(`총 ${all.length}개를 data/programs.json에 저장`);

if (failed > 0) process.exitCode = 1;
