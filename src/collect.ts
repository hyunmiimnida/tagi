import { mkdir, readFile, writeFile } from "node:fs/promises";
import { enrichWithAi, isAiAvailable } from "./ai.ts";
import { collectors } from "./collectors/index.ts";
import { mergePrograms } from "./dedupe.ts";
import { enrich } from "./extract.ts";
import { fetchHtml, isAllowedByRobots } from "./fetch.ts";
import type { Program, School, TagCategory } from "./types.ts";

const CONFIG_DIR = new URL("../config/", import.meta.url);
const DATA_DIR = new URL("../data/", import.meta.url);
const PROGRAMS_FILE = new URL("programs.json", DATA_DIR);
const KEEP_DAYS = 90; // 마지막 일정이 이보다 오래 지난 항목은 지운다

async function readJson<T>(file: URL, fallback?: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (fallback !== undefined && (error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

const schools = await readJson<School[]>(new URL("schools.json", CONFIG_DIR));
const categories = await readJson<TagCategory[]>(new URL("tag-categories.json", CONFIG_DIR));
const existing = await readJson<Program[]>(PROGRAMS_FILE, []);
const knownUrls = new Set(existing.flatMap((p) => p.links.map((l) => l.url)));

const incoming: Program[] = [];
const log: { source: string; ok: boolean; count: number; message: string }[] = [];

for (const school of schools) {
  for (const source of school.sources) {
    const label = `[${school.name} > ${source.name}]`;
    if (!source.enabled) continue;

    // 해외 서버(GitHub Actions)에서 접속할 수 없는 출처는 내 컴퓨터에서만 수집한다
    if (source.localOnly && process.env.GITHUB_ACTIONS === "true") {
      console.log(`${label} 내 컴퓨터에서만 수집하는 출처라서 건너뜀`);
      log.push({ source: source.id, ok: true, count: 0, message: "내 컴퓨터에서만 수집" });
      continue;
    }

    // 한 출처가 실패해도 나머지 출처는 계속 수집한다
    try {
      const collector = collectors[source.collector];
      if (!collector) throw new Error(`"${source.collector}" 수집기가 등록되어 있지 않음`);
      if (!(await isAllowedByRobots(source.url))) {
        console.log(`${label} robots.txt에서 자동 접근을 막아서 수집하지 않음`);
        log.push({ source: source.id, ok: true, count: 0, message: "robots.txt에서 막음" });
        continue;
      }

      const items = await collector({ school, source, fetchHtml, isKnown: (url) => knownUrls.has(url) });
      let aiCount = 0;
      for (const item of items) {
        enrich(item, source, categories);
        if (source.useAi && isAiAvailable() && (await enrichWithAi(item, categories))) aiCount++;
        incoming.push(item.program);
      }

      console.log(`${label} ${items.length}개 수집` + (aiCount ? ` (AI 추출 ${aiCount}개)` : ""));
      log.push({ source: source.id, ok: true, count: items.length, message: "" });
    } catch (error) {
      // 접속 오류는 실제 원인(cause)까지 기록한다
      const cause = error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : "";
      const message = (error instanceof Error ? error.message : String(error)) + cause;
      console.error(`${label} 수집 실패: ${message}`);
      log.push({ source: source.id, ok: false, count: 0, message });
    }
  }
}

const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
const lastDate = (p: Program) =>
  [p.recruitPeriod.end, p.activityPeriod.end, p.postedAt, p.collectedAt.slice(0, 10)].filter((d) => d !== null).sort().at(-1)!;

const merged = mergePrograms(existing, incoming).filter((p) => lastDate(p) >= cutoff);

await mkdir(DATA_DIR, { recursive: true });
await writeFile(PROGRAMS_FILE, JSON.stringify(merged, null, 2) + "\n");
await writeFile(
  new URL("collect-log.json", DATA_DIR),
  JSON.stringify({ ranAt: new Date().toISOString(), total: merged.length, sources: log }, null, 2) + "\n",
);
console.log(`새로 수집 ${incoming.length}개, 전체 ${merged.length}개를 data/programs.json에 저장`);

// 실패한 출처가 있으면 자동 실행(GitHub Actions)에서 알림이 가도록 실패로 끝낸다
if (log.some((entry) => !entry.ok)) process.exitCode = 1;
