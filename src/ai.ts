import { execFile, execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CollectedItem, TagCategory } from "./types.ts";

// AI 정보 추출: Codex CLI가 있으면 게시물 본문을 읽혀서 규칙으로 못 찾은 정보를 보완한다.
// 게시물 여러 개를 한 번에 보내 비용을 줄인다. 실패하면 규칙 기반 결과를 그대로 쓴다.

const MODELS = ["gpt-6.1-sol", "gpt-6.0-astra"]; // 앞 모델이 실패하면 다음 모델로
const BATCH_SIZE = 8;
const MAX_TEXT = 2500; // 게시물 하나당 본문 글자 수
const DATE = /^\d{4}-\d{2}-\d{2}$/;

let codexPath: string | null | undefined;

// PATH에 없으면 Codex 앱이 설치한 위치에서 찾는다
export function findCodex(): string | null {
  if (codexPath !== undefined) return codexPath;
  const candidates = [process.env.CODEX_BIN, "codex"];
  const appBin = process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "OpenAI", "Codex", "bin");
  if (appBin && existsSync(appBin)) {
    for (const dir of readdirSync(appBin)) candidates.push(join(appBin, dir, "codex.exe"));
  }
  codexPath = null;
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      execFileSync(candidate, ["--version"], { stdio: "ignore" });
      codexPath = candidate;
      break;
    } catch {
      // 다음 후보
    }
  }
  return codexPath;
}

function buildPrompt(items: CollectedItem[], categories: TagCategory[]): string {
  const tagList = categories.map((c) => `- ${c.name}: ${c.tags.map((t) => t.name).join(", ")}`).join("\n");
  const posts = items
    .map(
      (item) => `### id: ${item.program.id}
게시일: ${item.program.postedAt ?? "모름"} / 작성 부서: ${item.writer ?? "모름"}
제목: ${item.program.title}
본문:
${item.text.slice(0, MAX_TEXT) || "(본문 없음, 이미지로만 안내됨)"}`,
    )
    .join("\n\n");

  return `너는 대학 공지에서 사실 정보만 뽑는 추출기다. 파일을 읽거나 명령을 실행하지 말고, 아래 글만 보고 JSON으로만 답해라.

규칙 (어기면 결과 전체를 버린다):
- 글에 적힌 사실만 쓴다. 추측하지 않는다. 모르면 null 또는 빈 배열.
- 날짜는 YYYY-MM-DD. 연도가 없으면 게시일과 같은 해로 보되, 게시일보다 두 달 넘게 이전이 되면 다음 해로 본다.
- recruit = 학생이 신청·접수·지원하는 기간. activity = 행사·교육·활동이 실제로 열리는 기간.
  - 서류 "제출 기한"이나 "결과 발표"는 recruit가 아니다.
  - 마감일만 있으면 recruitStart는 null.
  - 여러 회차로 열리면 activityStart = 가장 이른 회차, activityEnd = 가장 늦은 회차. 회차 날짜를 넘어서는 날짜를 만들지 마라.
  - 신청 기간을 activity에 복사하지 마라. activity가 글에 없으면 null.
  - end가 start보다 앞서면 안 된다.
- forStudents: 학생(학부생·대학원생·유학생 포함)이 참여·신청할 수 있으면 true. 교원·직원만 대상이면 false.
- organizer: 글에 적힌 기관명을 그대로 짧게 쓴다. "영남대학교"를 앞에 붙이지 마라.
  학교 부서가 외부 기관(기업·정부·지자체·공공기관) 사업을 안내만 하면 그 외부 기관이 주최다.
  작성 부서(홍보팀 등)는 안내만 했을 수 있다. 본문에 외부 기관의 담당자·운영사무국·주관사가 나오면 작성 부서를 주최로 쓰지 마라.
- organizerType: 주최 유형 목록 중 하나.
- colleges/departments/grades: 참여 자격이 특정 단과대학·학과·학년으로 "제한"될 때만 적는다. 우대·예시는 제한이 아니다.
- tags: 아래 목록의 이름만. 그 프로그램의 핵심 내용일 때만 붙인다. 본문에 단어가 한 번 나온다고 붙이지 마라.
  - 장학·지원금: 학생이 장학금·지원금·상금·활동비를 직접 받는 경우에만.
  - 해외·글로벌: 해외 파견·해외 활동·유학생 교류가 핵심일 때만.
  - 교육·특강: 강의·교육·특강·워크숍이 프로그램 자체일 때만.

태그 목록:
${tagList}

출력 형식 (게시물 수만큼, 설명 없이 JSON만):
{"items":[{"id":"...","forStudents":true,"organizer":null,"organizerType":null,"recruitStart":null,"recruitEnd":null,"activityStart":null,"activityEnd":null,"colleges":[],"departments":[],"grades":[],"tags":[]}]}

게시물:

${posts}`;
}

function runCodex(bin: string, model: string, prompt: string, outFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      bin,
      ["exec", "--skip-git-repo-check", "--sandbox", "read-only", "-m", model, "--output-last-message", outFile, "-"],
      { timeout: 600_000, maxBuffer: 20 * 1024 * 1024 },
      (error) => (error ? reject(error) : resolve()),
    );
    child.stdin?.end(prompt);
  });
}

const date = (v: unknown) => (typeof v === "string" && DATE.test(v) ? v : null);
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

async function askCodex(bin: string, prompt: string): Promise<{ items?: Record<string, unknown>[] }> {
  const dir = await mkdtemp(join(tmpdir(), "codex-"));
  try {
    const outFile = join(dir, "answer.txt");
    let lastError: unknown;
    for (const model of MODELS) {
      try {
        await runCodex(bin, model, prompt, outFile);
        const answer = await readFile(outFile, "utf8");
        return JSON.parse(answer.slice(answer.indexOf("{"), answer.lastIndexOf("}") + 1));
      } catch (error) {
        lastError = error;
        console.error(`  AI(${model}) 실패, 다음 모델로 시도`);
      }
    }
    throw lastError;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// 학생 대상이 아니면 false를 돌려준다
function apply(item: CollectedItem, data: Record<string, unknown>, categories: TagCategory[]): boolean {
  const { program } = item;
  if (data.forStudents === false) return false;
  const allowedTags = new Set(categories.flatMap((c) => c.tags.map((t) => t.name)));
  const organizerTypes = categories.find((c) => c.matchOn === "organizer")?.tags.map((t) => t.name) ?? [];

  if (typeof data.organizer === "string" && data.organizer.trim()) program.organizer = data.organizer.trim();
  if (organizerTypes.includes(data.organizerType as string)) program.organizerType = data.organizerType as string;

  // AI가 날짜를 하나라도 찾았으면 그 기간은 AI 결과를 따른다
  const recruit = { start: date(data.recruitStart), end: date(data.recruitEnd) };
  const activity = { start: date(data.activityStart), end: date(data.activityEnd) };
  const valid = (p: { start: string | null; end: string | null }) => !p.start || !p.end || p.start <= p.end;
  if ((recruit.start || recruit.end) && valid(recruit)) program.recruitPeriod = recruit;
  if ((activity.start || activity.end) && valid(activity)) program.activityPeriod = activity;

  program.target.colleges = strings(data.colleges);
  program.target.departments = strings(data.departments);
  program.target.grades = strings(data.grades);

  const tags = strings(data.tags).filter((t) => allowedTags.has(t) && !organizerTypes.includes(t));
  program.tags = [...new Set([...(program.organizerType ? [program.organizerType] : []), ...tags])];
  program.extractedBy = "ai";
  return true;
}

// AI로 추출한 게시물 수와, 학생 대상이 아니라서 뺄 게시물 id를 돌려준다
export async function enrichWithAi(
  items: CollectedItem[],
  categories: TagCategory[],
): Promise<{ done: number; notForStudents: Set<string> }> {
  const notForStudents = new Set<string>();
  const bin = findCodex();
  if (!bin || items.length === 0) return { done: 0, notForStudents };

  let done = 0;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    try {
      const answer = await askCodex(bin, buildPrompt(batch, categories));
      for (const data of answer.items ?? []) {
        const item = batch.find((b) => b.program.id === data.id);
        if (!item) continue;
        if (apply(item, data, categories)) done++;
        else notForStudents.add(item.program.id);
      }
      console.log(`  AI 추출 ${Math.min(i + BATCH_SIZE, items.length)}/${items.length}`);
    } catch (error) {
      console.error("  AI 추출 실패, 규칙 결과를 사용:", error instanceof Error ? error.message : error);
    }
  }
  return { done, notForStudents };
}
