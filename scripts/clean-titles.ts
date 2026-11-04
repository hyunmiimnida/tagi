import { ARCHIVE_FILE, PROGRAMS_FILE, readJson, writeJson } from "../src/archive.ts";
import { cleanTitles } from "../src/title.ts";
import type { Program } from "../src/types.ts";

// 저장된 목록·보관함 공고의 제목에서 이모지·재게시·마감 표시를 지운다 (규칙은 src/title.ts).
// 수집할 때마다 자동으로 하므로, 규칙을 바꾼 뒤 수집을 기다리지 않고 바로 반영할 때만 쓴다. AI는 쓰지 않는다.
//   node scripts/clean-titles.ts
const programs = await readJson<Program[]>(PROGRAMS_FILE, []);
const archive = await readJson<Program[]>(ARCHIVE_FILE, []);
const listed = cleanTitles(programs);
const archived = cleanTitles(archive);
await writeJson(PROGRAMS_FILE, programs);
await writeJson(ARCHIVE_FILE, archive);
console.log(`제목 정리: 목록 ${listed}개, 보관함 ${archived}개`);
