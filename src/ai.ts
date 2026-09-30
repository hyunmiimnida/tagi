import { exec, execSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CollectedItem, TagCategory } from "./types.ts";

// AI 정보 추출: Codex CLI가 설치되어 있으면 본문을 읽혀서 규칙으로 못 찾은 정보를 보완한다.
// 설치되어 있지 않거나 실패하면 규칙 기반 결과를 그대로 쓴다.

const MAX_TEXT = 6000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

let available: boolean | undefined;

export function isAiAvailable(): boolean {
  if (available === undefined) {
    try {
      execSync("codex --version", { stdio: "ignore" });
      available = true;
    } catch {
      available = false;
    }
  }
  return available;
}

function buildPrompt(item: CollectedItem, categories: TagCategory[]): string {
  const tagList = categories.map((c) => `${c.name}: ${c.tags.map((t) => t.name).join(", ")}`).join("\n");
  return `대학 공지 게시물에서 사실 정보만 뽑아 JSON 하나로만 답해. 설명은 쓰지 마.
모르는 값은 null 또는 빈 배열로 둬. 추측하지 마. 날짜는 YYYY-MM-DD.
게시일: ${item.program.postedAt ?? "모름"}, 작성 부서: ${item.writer ?? "모름"}

형식:
{"organizer": 실제 주최 기관, "organizerType": 주최 유형 태그 중 하나,
 "recruitStart": 모집 시작일, "recruitEnd": 모집 마감일,
 "activityStart": 활동 시작일, "activityEnd": 활동 종료일,
 "colleges": [참여 가능 단과대학], "departments": [참여 가능 학과], "grades": [참여 가능 학년],
 "tags": [아래 목록에 있는 태그만]}

태그 목록:
${tagList}

제목: ${item.program.title}
본문:
${item.text.slice(0, MAX_TEXT)}`;
}

function runCodex(prompt: string, outFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = exec(
      `codex exec --skip-git-repo-check --output-last-message "${outFile}" -`,
      { timeout: 120_000 },
      (error) => (error ? reject(error) : resolve()),
    );
    child.stdin?.end(prompt);
  });
}

const date = (v: unknown) => (typeof v === "string" && DATE.test(v) ? v : null);
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export async function enrichWithAi(item: CollectedItem, categories: TagCategory[]): Promise<boolean> {
  const dir = await mkdtemp(join(tmpdir(), "codex-"));
  try {
    const outFile = join(dir, "answer.txt");
    await runCodex(buildPrompt(item, categories), outFile);
    const answer = await readFile(outFile, "utf8");
    const data = JSON.parse(answer.slice(answer.indexOf("{"), answer.lastIndexOf("}") + 1));

    const { program } = item;
    const allowedTags = new Set(categories.flatMap((c) => c.tags.map((t) => t.name)));
    const organizerTypes = categories.find((c) => c.matchOn === "organizer")?.tags.map((t) => t.name) ?? [];

    if (typeof data.organizer === "string" && data.organizer) program.organizer = data.organizer;
    if (organizerTypes.includes(data.organizerType)) program.organizerType = data.organizerType;
    program.recruitPeriod = {
      start: date(data.recruitStart) ?? program.recruitPeriod.start,
      end: date(data.recruitEnd) ?? program.recruitPeriod.end,
    };
    program.activityPeriod = {
      start: date(data.activityStart) ?? program.activityPeriod.start,
      end: date(data.activityEnd) ?? program.activityPeriod.end,
    };
    program.target.colleges = strings(data.colleges);
    program.target.departments = strings(data.departments);
    program.target.grades = strings(data.grades);
    const tags = strings(data.tags).filter((t) => allowedTags.has(t));
    if (program.organizerType) tags.unshift(program.organizerType);
    if (tags.length > 0) program.tags = [...new Set(tags)];
    program.extractedBy = "ai";
    return true;
  } catch (error) {
    console.error(`  AI 추출 실패 (${item.program.title}):`, error instanceof Error ? error.message : error);
    return false;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
