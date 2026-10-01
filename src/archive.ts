import { readFile, rename, writeFile } from "node:fs/promises";
import { mergePrograms } from "./dedupe.ts";
import type { Program } from "./types.ts";

// 지난 공고 보관: 마지막 일정이 오래 지난 항목은 목록(programs.json)에서 빼고 archive.json에 남긴다.
// 반복 프로그램의 "지난 공고"를 보여 주는 데 쓴다.

export const DATA_DIR = new URL("../data/", import.meta.url);
export const PROGRAMS_FILE = new URL("programs.json", DATA_DIR);
export const ARCHIVE_FILE = new URL("archive.json", DATA_DIR);
export const EXCLUDED_FILE = new URL("excluded.json", DATA_DIR);
const KEEP_DAYS = 90; // 마지막 일정이 이보다 오래 지나면 보관함으로 옮긴다

export async function readJson<T>(file: URL, fallback?: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (fallback !== undefined && (error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

// 임시 파일에 다 쓴 뒤 바꿔치기한다 (쓰는 도중 멈춰도 원래 파일이 깨지지 않게)
export async function writeJson(file: URL, data: unknown): Promise<void> {
  const temp = new URL(`${file.href}.tmp`);
  await writeFile(temp, JSON.stringify(data, null, 2) + "\n");
  await rename(temp, file);
}

// 마지막 일정: 모집·활동 기간과 게시일 중 가장 늦은 날. 날짜를 하나도 모를 때만 수집일을 쓴다
// (과거 글은 오늘 수집하므로 수집일을 함께 비교하면 모두 최근 글로 보인다)
export const lastDate = (p: Program) =>
  [p.recruitPeriod.start, p.recruitPeriod.end, p.activityPeriod.start, p.activityPeriod.end, p.postedAt]
    .filter((d) => d !== null)
    .sort()
    .at(-1) ?? p.collectedAt.slice(0, 10);

// 목록에 둘 항목과 보관할 항목으로 나눈다
export function splitByAge(programs: Program[], now = Date.now()): { current: Program[]; old: Program[] } {
  const cutoff = new Date(now - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
  return {
    current: programs.filter((p) => lastDate(p) >= cutoff),
    old: programs.filter((p) => lastDate(p) < cutoff),
  };
}

// 보관함에 합친다. 최근 게시일 순으로 저장한다
export function mergeArchive(archive: Program[], incoming: Program[]): Program[] {
  return mergePrograms(archive, incoming).sort((a, b) => lastDate(b).localeCompare(lastDate(a)));
}
