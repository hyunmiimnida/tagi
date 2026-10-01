import { ARCHIVE_FILE, PROGRAMS_FILE, readJson, writeJson } from "../src/archive.ts";
import { assignSeries } from "../src/series.ts";
import type { Program } from "../src/types.ts";

// 반복 프로그램 묶음만 다시 계산한다 (수집 없이). 애매한 쌍은 AI에게 묻고 data/series-decisions.json에 기억한다
const programs = await readJson<Program[]>(PROGRAMS_FILE, []);
const archive = await readJson<Program[]>(ARCHIVE_FILE, []);
console.log(`반복 프로그램 묶음 ${await assignSeries(programs, archive)}개`);
await writeJson(PROGRAMS_FILE, programs);
await writeJson(ARCHIVE_FILE, archive);
