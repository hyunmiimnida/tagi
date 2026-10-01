import { execFile, execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GRADES, STUDENT_STATUSES } from "./types.ts";
import type { CollectedItem, Program, TagCategory } from "./types.ts";

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

function buildPrompt(items: CollectedItem[], categories: TagCategory[], maxText = MAX_TEXT): string {
  const tagList = categories.map((c) => `- ${c.name}: ${c.tags.map((t) => t.name).join(", ")}`).join("\n");
  const posts = items
    .map(
      (item) => `### id: ${item.program.id}
게시일: ${item.program.postedAt ?? "모름"} / 작성 부서: ${item.writer ?? "모름"}
제목: ${item.program.title}
본문:
${item.text.slice(0, maxText) || "(본문 없음, 이미지로만 안내됨)"}`,
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
  - 학교: 이름에 "대학교"나 "대학"이 들어간 기관과 그 부서·사업단만. 이 조건에 안 맞으면 절대 학교로 쓰지 마라.
    지역 이름(경산시·대구시·경북 등)으로 시작하는 센터·기관은 학교가 아니라 지자체나 공공기관이다.
    이름을 모르는 회사·교육업체·아카데미 운영사는 기업이다. 인력양성원·교육원처럼 공적 성격의 교육기관은 공공기관이다.
  - 공공기관: 공단·공사·진흥원·정부 출연 연구원 등 공적 기관. 기업이 세운 재단은 기업으로 본다.
- colleges/departments/grades: 참여 자격이 특정 단과대학·학과·학년으로 "제한"될 때만 적는다. 우대·예시는 제한이 아니다.
  - grades는 "1학년"·"2학년"·"3학년"·"4학년"만 쓴다 (5학년 이상·대학원은 쓰지 않는다). "2~3학년"이면 ["2학년","3학년"], "3학년 이상"이면 ["3학년","4학년"].
- statuses: 참여할 수 있는 신분이 글에 적혀 있을 때만, "재학생"·"휴학생"·"졸업생" 중에서 고른다.
  - "재학생 대상"이면 ["재학생"]. "재학생 및 휴학생"이면 ["재학생","휴학생"]. "졸업생(졸업예정자 포함)"이면 ["졸업생"]. "재학생·졸업생 누구나"면 ["재학생","졸업생"].
  - 그냥 "학생", "학부생", "누구나"처럼 신분을 가리지 않으면 빈 배열.
- excludedStatuses: 글에 "휴학생 제외"·"졸업생 제외"처럼 명시적으로 뺀 신분만 같은 이름으로 적는다.
- tags: 아래 목록의 이름만. 그 프로그램의 핵심 내용일 때만 붙인다. 본문에 단어가 한 번 나온다고 붙이지 마라.
  - 장학·지원금: 학생이 장학금·지원금·상금·활동비를 직접 받는 경우에만.
  - 해외·글로벌: 해외 파견·해외 활동·유학생 교류가 핵심일 때만.
  - 교육·특강: 강의·교육·특강·워크숍이 프로그램 자체일 때만.
  - 해외탐방: 학교·기관이 학생을 해외로 보내거나 데려가는 단기 프로그램(탐방·연수·현장학습·견학·봉사·단기 파견)을 지원할 때만.
    학기 단위 교환학생·유학·해외 취업 알선·국내에서 하는 국제 행사는 해외탐방이 아니다.

태그 목록:
${tagList}

출력 형식 (게시물 수만큼, 설명 없이 JSON만):
{"items":[{"id":"...","forStudents":true,"organizer":null,"organizerType":null,"recruitStart":null,"recruitEnd":null,"activityStart":null,"activityEnd":null,"colleges":[],"departments":[],"grades":[],"statuses":[],"excludedStatuses":[],"tags":[]}]}

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

async function askCodex(bin: string, prompt: string): Promise<{ items?: Record<string, unknown>[]; same?: unknown }> {
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

// 학년 표기를 "1학년"~"4학년"으로 맞춘다. "3학년 이상" → 3·4학년, "2~3학년" → 2·3학년. 학기·대학원 같은 표기는 뺀다
export function normalizeGrades(values: string[]): string[] {
  const out = new Set<string>();
  for (const value of values) {
    if (/제외|학기|대학원|석사|박사/.test(value)) continue;
    const range = value.match(/([1-4])\s*[~\-·,]\s*([1-4])\s*학년/);
    const atLeast = value.match(/([1-4])\s*학년\s*이상/);
    const single = value.match(/^([1-4])\s*학년$/);
    const [from, to] = range ? [range[1], range[2]] : atLeast ? [atLeast[1], "4"] : single ? [single[1], single[1]] : [];
    if (!from) continue;
    for (let g = Number(from); g <= Number(to); g++) out.add(`${g}학년`);
  }
  return GRADES.filter((g) => out.has(g));
}

// AI가 외부 단체(협회·재단 등)를 "학교"로 잘못 분류하면 바로잡는다.
// 학교 이름이 들어 있지 않은데 외부 단체 이름이면, 주최 유형 키워드 규칙으로 다시 정하고 못 찾으면 비워 둔다
const OUTSIDE_GROUP = /협회|지회|협의회|공단|공사|진흥원|재단|연합회|상공회의소/;
const SCHOOL_NAME = /대학|영남|YU|학교/i;
export function fixOrganizerType(program: Program, categories: TagCategory[]): void {
  const organizer = program.organizer;
  if (program.organizerType !== "학교" || !organizer) return;
  if (!OUTSIDE_GROUP.test(organizer) || SCHOOL_NAME.test(organizer)) return;
  const typeCategory = categories.find((c) => c.matchOn === "organizer");
  const types = typeCategory?.tags ?? [];
  const fixed = types.find((t) => t.name !== "학교" && t.keywords.some((k) => organizer.includes(k)))?.name ?? null;
  program.tags = program.tags.filter((t) => t !== "학교");
  if (fixed) program.tags = [fixed, ...program.tags.filter((t) => t !== fixed)];
  program.organizerType = fixed;
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
  program.target.grades = normalizeGrades(strings(data.grades));
  program.target.statuses = strings(data.statuses).filter((s) => STUDENT_STATUSES.includes(s));
  program.target.excludedStatuses = strings(data.excludedStatuses).filter((s) => STUDENT_STATUSES.includes(s));

  const tags = strings(data.tags).filter((t) => allowedTags.has(t) && !organizerTypes.includes(t));
  program.tags = [...new Set([...(program.organizerType ? [program.organizerType] : []), ...tags])];
  fixOrganizerType(program, categories);
  program.extractedBy = "ai";
  return true;
}

// 두 게시물이 같은 프로그램인지 AI에게 묻는다. 같다고 답한 쌍의 번호를 돌려준다
export async function confirmDuplicates(pairs: [Program, Program][]): Promise<number[]> {
  const bin = findCodex();
  if (!bin || pairs.length === 0) return [];
  const describe = (p: Program) =>
    `${p.title} / 주최 ${p.organizer ?? "모름"} / 모집 ${p.recruitPeriod.start ?? "?"}~${p.recruitPeriod.end ?? "?"} / 활동 ${p.activityPeriod.start ?? "?"}~${p.activityPeriod.end ?? "?"}`;
  const prompt = `아래 각 쌍이 "같은 프로그램을 다른 사이트에 올린 것"인지 판단해라. 파일을 읽거나 명령을 실행하지 말고 JSON만 답해라.
같은 회사·같은 사업이라도 회차·기수·대상·일정이 다르면 다른 프로그램이다. 확실하지 않으면 false.
형식: {"same":[같은 쌍의 번호들]}

${pairs.map(([a, b], i) => `${i}. A: ${describe(a)}\n   B: ${describe(b)}`).join("\n")}`;
  try {
    const answer = await askCodex(bin, prompt);
    const same = (answer as { same?: unknown }).same;
    return Array.isArray(same) ? same.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < pairs.length) : [];
  } catch (error) {
    console.error("  AI 중복 판단 실패:", error instanceof Error ? error.message : error);
    return [];
  }
}

// 두 공고가 "같은 프로그램이 다른 해·학기·회차에 다시 열린 것"인지 묻는다. 쌍마다 true/false, 실패하면 null
export async function confirmSameSeries(pairs: [Program, Program][]): Promise<boolean[] | null> {
  const bin = findCodex();
  if (!bin) return null;
  const describe = (p: Program) => `${p.title} / 주최 ${p.organizer ?? "모름"} / 게시 ${p.postedAt ?? "?"}`;
  const answers: boolean[] = [];
  for (let start = 0; start < pairs.length; start += 60) {
    const batch = pairs.slice(start, start + 60);
    const prompt = `아래 각 쌍이 "같은 프로그램이 다른 해·학기·회차에 다시 열린 것"인지 판단해라. 파일을 읽거나 명령을 실행하지 말고 JSON만 답해라.
같은 프로그램: 이름과 목적이 같고 연도·학기·기수·회차만 다름 (예: 2025 하계 해외탐방 ↔ 2026 하계 해외탐방).
다른 프로그램: 같은 부서·같은 종류라도 주제·대상·이름이 다름 (예: 취업 특강 A ↔ 취업 특강 B, 공모전 ↔ 시상식).
확실하지 않으면 다른 프로그램으로 본다.
형식: {"same":[같은 쌍의 번호들]}

${batch.map(([a, b], i) => `${i}. A: ${describe(a)}\n   B: ${describe(b)}`).join("\n")}`;
    try {
      const same = (await askCodex(bin, prompt)).same;
      const set = new Set(Array.isArray(same) ? same : []);
      batch.forEach((_, i) => answers.push(set.has(i)));
      console.log(`  AI 반복 프로그램 판단 ${Math.min(start + 60, pairs.length)}/${pairs.length}`);
    } catch (error) {
      console.error("  AI 반복 프로그램 판단 실패:", error instanceof Error ? error.message : error);
      return null;
    }
  }
  return answers;
}

// 과거 글 1차 거르기: 제목만 보고 "학생이 신청·참여하는 공고"인 글의 번호를 돌려준다. 실패하면 null
export async function pickProgramTitles(titles: string[]): Promise<number[] | null> {
  const bin = findCodex();
  if (!bin) return null;
  const prompt = `아래는 대학 홈페이지 소식 게시판의 글 제목이다. 파일을 읽거나 명령을 실행하지 말고 JSON만 답해라.
학생(학부생·대학원생·유학생)이 신청·참여·지원할 수 있는 모집 공고의 번호만 골라라.
- 고른다: 프로그램·교육·특강·캠프·공모전·대회·장학·지원금·인턴·채용·서포터즈·봉사·해외 파견·행사 참가자 모집, 신청 안내.
- 고르지 않는다: 보도·홍보 기사, 수상·성과 소식, 결과·합격자 발표, 교원·직원 대상 글, 입찰·계약, 단순 행정 안내(휴무·시설 공사 등).
- 애매하면 고른다 (다음 단계에서 본문을 읽고 다시 거른다).
형식: {"pick":[번호들]}

${titles.map((title, i) => `${i}. ${title}`).join("\n")}`;
  try {
    const answer = (await askCodex(bin, prompt)) as { pick?: unknown };
    if (!Array.isArray(answer.pick)) return null;
    return answer.pick.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < titles.length);
  } catch (error) {
    console.error("  AI 제목 거르기 실패:", error instanceof Error ? error.message : error);
    return null;
  }
}

// AI로 추출한 게시물 수와, 학생 대상이 아니라서 뺄 게시물 id를 돌려준다
export async function enrichWithAi(
  items: CollectedItem[],
  categories: TagCategory[],
  { batchSize = BATCH_SIZE, maxText = MAX_TEXT } = {},
): Promise<{ done: number; notForStudents: Set<string> }> {
  const notForStudents = new Set<string>();
  const bin = findCodex();
  if (!bin || items.length === 0) return { done: 0, notForStudents };

  let done = 0;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    try {
      const answer = await askCodex(bin, buildPrompt(batch, categories, maxText));
      for (const data of answer.items ?? []) {
        const item = batch.find((b) => b.program.id === data.id);
        if (!item) continue;
        if (apply(item, data, categories)) done++;
        else notForStudents.add(item.program.id);
      }
      console.log(`  AI 추출 ${Math.min(i + batchSize, items.length)}/${items.length}`);
    } catch (error) {
      console.error("  AI 추출 실패, 규칙 결과를 사용:", error instanceof Error ? error.message : error);
    }
  }
  return { done, notForStudents };
}
