import { execFile, execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { cleanPeriods } from "./extract.ts";
import { fetchImage } from "./fetch.ts";
import { SCHOOL_NAMES } from "./school-of.ts";
import { GRADES, STUDENT_STATUSES } from "./types.ts";
import type { CollectedItem, Program, TagCategory } from "./types.ts";

// AI 정보 추출: AI CLI가 있으면 게시물 본문을 읽혀서 규칙으로 못 찾은 정보를 보완한다.
// 게시물 여러 개를 한 번에 보내 비용을 줄인다. 실패하면 규칙 기반 결과를 그대로 쓴다.
// 엔진: 기본은 Claude (Claude 앱에 들어 있는 Claude Code CLI, 모델 CLAUDE_MODEL=sonnet).
//       AI_ENGINE=codex 로 실행하면 Codex CLI를 쓴다.

export const AI_ENGINE: "claude" | "codex" = process.env.AI_ENGINE === "codex" ? "codex" : "claude";
const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "sonnet";
const CODEX_MODEL = "gpt-6.1-sol";
const BATCH_SIZE = 15; // 한 번에 보내는 게시물 수 (한 번 부를 때마다 드는 기본 비용을 줄이려고 크게)
const AI_PARALLEL = 5; // 동시에 AI에 보내는 묶음 수
const MAX_TEXT = 2500; // 게시물 하나당 본문 글자 수
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// PATH에 없으면 앱이 설치한 위치에서 찾는다 (가장 최근 버전 폴더부터).
// 앱이 실행 중에 스스로 업데이트하면 예전 폴더가 지워지므로, 기억한 파일이 없어졌으면 다시 찾는다
function finder(envVar: string, command: string, appDirs: (string | undefined)[], exe: string) {
  let found: string | null | undefined;
  return (): string | null => {
    const gone = found && /[\\/]/.test(found) && !existsSync(found);
    if (found !== undefined && !gone) return found;
    const candidates = [process.env[envVar], command];
    // 버전 폴더 바로 안(버전\exe) 또는 한 단계 더 안(버전\코드\exe)에 있다 (앱 업데이트로 구조가 바뀌기도 한다)
    const subdirs = (dir: string) => {
      try {
        return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => join(dir, d.name));
      } catch {
        return [];
      }
    };
    const dirs = appDirs
      .filter((appDir): appDir is string => Boolean(appDir && existsSync(appDir)))
      .flatMap((appDir) => subdirs(appDir))
      .flatMap((dir) => [dir, ...subdirs(dir)])
      .filter((dir) => existsSync(join(dir, exe)));
    dirs.sort((a, b) => statSync(join(b, exe)).mtimeMs - statSync(join(a, exe)).mtimeMs);
    for (const dir of dirs) candidates.push(join(dir, exe));
    found = null;
    for (const candidate of candidates) {
      if (!candidate) continue;
      try {
        execFileSync(candidate, ["--version"], { stdio: "ignore" });
        found = candidate;
        break;
      } catch {
        // 다음 후보
      }
    }
    return found;
  };
}

const { LOCALAPPDATA, APPDATA } = process.env;
export const findCodex = finder("CODEX_BIN", "codex", [LOCALAPPDATA && join(LOCALAPPDATA, "OpenAI", "Codex", "bin")], "codex.exe");
// Claude 앱은 Microsoft Store 앱이라 실제 파일은 Packages 안에 있다. 앱 안에서 실행하면 %APPDATA%\Claude로도 보인다
const claudeStoreDirs = () => {
  const packages = LOCALAPPDATA && join(LOCALAPPDATA, "Packages");
  if (!packages || !existsSync(packages)) return [];
  return readdirSync(packages)
    .filter((name) => name.startsWith("Claude_"))
    .map((name) => join(packages, name, "LocalCache", "Roaming", "Claude", "claude-code"));
};
export const findClaude = finder("CLAUDE_BIN", "claude", [APPDATA && join(APPDATA, "Claude", "claude-code"), ...claudeStoreDirs()], "claude.exe");
// 지금 엔진의 실행 파일 (없으면 null → 규칙 결과만 쓴다)
export const findAi = () => (AI_ENGINE === "codex" ? findCodex() : findClaude());
export const AI_MISSING =
  AI_ENGINE === "codex"
    ? "Codex CLI가 없습니다 (npm install -g @openai/codex)"
    : "Claude CLI가 없습니다 (Claude 앱 설치 후, 터미널에서 claude.exe를 한 번 실행해 /login)";

// 다른 학교 학생도 지원할 수 있는지. 본 추출과 이미 추출한 글 다시 확인(recheckFields)이 함께 쓴다
const OPEN_TO_RULE = `- openTo: 글을 올린 학교의 학생이 아니어도 지원할 수 있으면, 지원할 수 있는 사람을 글에 적힌 대로 30자 안으로 짧게 쓴다.
  예: "전국 대학생", "대구·경북 지역 대학생", "만 19~34세 청년", "대학생 및 대학원생 누구나".
  글을 올린 학교 학생만 대상이거나, 다른 학교 학생도 되는지 글에서 알 수 없으면 null. 학교 부서가 여는 교내 프로그램은 대부분 null이다.
  학년·신분(재학생 등)은 grades·statuses에 쓰고 openTo에는 반복하지 않는다.`;

const openTo = (v: unknown) => (typeof v === "string" && v.trim() && v.length <= 40 ? v.trim() : null);

// 상세 화면 맨 위 한 줄 요약. 본 추출과 다시 확인(recheckFields)이 함께 쓴다
const SUMMARY_RULE = `- summary: 학생이 무엇을 하거나 받는 기회인지 한 문장(60자 안, "~해요" 말투)으로 쓴다. 원문 문장을 베끼지 말고 네 말로 요약한다.
  날짜·신청 방법·문의처는 넣지 않는다(다른 칸에 있다). 예: "삼성 SW 교육을 1년 동안 무료로 받고 교육비를 지원받아요".
  무엇을 하는지 글에서 알 수 없으면 null.`;

// 신청 없이 참여하는 행사·서비스. 본 추출과 다시 확인(recheckFields)이 함께 쓴다
const NO_APPLICATION_RULE = `- noApplication: 미리 신청·접수하지 않고 기간 중에 그냥 방문·참여·이용하면 되는 행사나 서비스면 true.
  예: 취업박람회 현장 방문, 상시 운영 상담실·라운지, 헌혈·홍보 캠페인, 전시 관람. 신청서·접수·선착순 신청·사전 등록이 필요하면 false. 글에서 알 수 없으면 false.`;

const summary = (v: unknown) => (typeof v === "string" && v.trim() && v.length <= 90 ? v.trim() : null);

function setOpenTo(program: Program, value: string | null) {
  program.target.openTo = value;
  // 다른 학교 학생도 되면 모집 대상 학교를 비운다 (게시한 학교는 학교 배지·필터에 그대로 남는다)
  if (value) program.target.schools = [];
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
  - 날짜가 적힌 본 일정(현지 탐방·파견·캠프·대회 본선·교육 기간 등)은 "예정"이거나 선발된 사람만 가는 단계여도 activity에 넣는다. 결과 발표·시상식·서류 제출일은 넣지 않는다.
  - end가 start보다 앞서면 안 된다.
- forStudents: 학생(학부생·대학원생·유학생 포함)이 신청·지원·참가할 수 있는 기회이면 true.
  기회 = 프로그램·교육·특강·행사 참가자 모집, 공모전·대회, 장학·지원금, 채용·인턴·현장실습, 봉사·서포터즈, 교환·해외 프로그램, 상담·멘토링 신청 등.
  다음은 false: 교원·직원만 대상인 글, 학생이 신청·참가할 것이 없는 단순 안내(규정 제정·개정·의견 조회, 예산·행정 공지, 등록금 납부·서류 제출 안내, 합격자·결과 발표, 뉴스레터·소식지, 사기·안전 주의, 시설 공사·이용 안내), 모든 학생이 들어야 하는 의무 교육 안내(폭력예방교육·법정 필수교육·안전교육 수강·이수 안내), 학교 제도 소개·시행 안내(제안제도·신문고·학사 제도 변경 등), 모든 학생이 거치는 학사 절차 안내(수강신청·수강 철회·성적 평가 방식 선택·졸업 신청·학위 수여·졸업앨범 촬영·등록·휴복학), 의무 검사·선거 안내, 일반인 대상 관광·축제·전시 홍보와 설문조사.
  본문이 없거나 아주 짧으면(내용이 그림으로만 올라온 글) 제목으로 판단한다. 제목이 특강·행사·모집·참가·신청처럼 학생이 참여할 수 있는 것이면 true다. 학교 박물관·도서관 등이 여는 공개 특강·행사도 학생이 참여할 수 있으면 true다.
- organizer: 글에 적힌 기관명을 그대로 짧게 쓴다. 글을 올린 학교 이름(예: ○○대학교)을 앞에 붙이지 마라.
  기관(부서·회사·공공기관) 이름만 쓴다. 제목의 「」『』‘’ 안에 있는 프로그램·사업·행사 이름(예: "청년카페 취트키", "청년성장프로젝트")은 주최가 아니다. 본문에서 주최를 알 수 없으면 작성 부서를 쓴다.
  여러 기관이 함께 열면(공동 주최·주관) 글에 적힌 주최 기관을 앞에서부터 최대 3곳까지 ", "로 이어 쓴다. organizerType은 첫 기관 기준이다.
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
${OPEN_TO_RULE}
${SUMMARY_RULE}
${NO_APPLICATION_RULE}
- tags: 아래 목록의 이름만. 그 프로그램의 핵심 내용일 때만 붙인다. 본문에 단어가 한 번 나온다고 붙이지 마라.
  본문이 없거나 아주 짧으면 제목에서 분명히 드러나는 태그만 1~2개 붙인다 (추측해서 늘리지 마라).
  - 장학·지원금: 학생이 장학금·지원금·상금·활동비를 직접 받는 경우에만.
  - 해외·글로벌: 해외 파견·해외 활동·유학생 교류가 핵심일 때만.
  - 교육·특강: 강의·교육·특강·워크숍이 프로그램 자체일 때만.
  - 해외탐방: 학교·기관이 학생을 해외로 보내거나 데려가는 단기 프로그램(탐방·연수·현장학습·견학·봉사·단기 파견)을 지원할 때만.
    학기 단위 교환학생·유학·해외 취업 알선·국내에서 하는 국제 행사는 해외탐방이 아니다.

태그 목록:
${tagList}

출력 형식 (게시물 수만큼, 설명 없이 JSON만):
{"items":[{"id":"...","forStudents":true,"organizer":null,"organizerType":null,"recruitStart":null,"recruitEnd":null,"activityStart":null,"activityEnd":null,"colleges":[],"departments":[],"grades":[],"statuses":[],"excludedStatuses":[],"openTo":null,"summary":null,"noApplication":false,"tags":[]}]}

게시물:

${posts}`;
}

// AI에게 한 번 묻고 답 글자를 돌려준다. images: 같은 임시 폴더에 둔 그림 파일 (포스터 읽기)
// 프로젝트 폴더가 아닌 빈 임시 폴더에서 실행한다 (게시물 본문에 숨은 지시가 있어도 프로젝트 파일에 손대지 못하게)
function runAi(bin: string, prompt: string, dir: string, images: string[] = []): Promise<string> {
  const exe = existsSync(bin) ? bin : (findAi() ?? bin); // 실행 중 앱 업데이트로 경로가 바뀌었으면 다시 찾는다
  const outFile = join(dir, "answer.txt");
  const args =
    AI_ENGINE === "codex"
      ? ["exec", "--skip-git-repo-check", "--sandbox", "read-only", "-m", CODEX_MODEL, ...images.flatMap((image) => ["-i", image]), "--output-last-message", outFile, "-"]
      : // Claude: 도구는 그림을 열 때만 Read 하나만 쓴다 (명령 실행·파일 수정·인터넷 도구 없음). 대화 기록은 남기지 않는다
        ["-p", "--model", CLAUDE_MODEL, "--no-session-persistence", "--output-format", "text", "--tools", images.length ? "Read" : "", ...(images.length ? ["--allowedTools", "Read"] : [])];
  const input =
    AI_ENGINE === "claude" && images.length
      ? `${prompt}\n\n그림 파일(Read 도구로 열어 봐라): ${images.map((image) => basename(image)).join(", ")}`
      : prompt;
  return new Promise((resolve, reject) => {
    const child = execFile(exe, args, { timeout: 600_000, maxBuffer: 20 * 1024 * 1024, cwd: dir }, async (error, stdout) => {
      if (error) return reject(error);
      try {
        resolve(AI_ENGINE === "codex" ? await readFile(outFile, "utf8") : stdout);
      } catch (readError) {
        reject(readError);
      }
    });
    child.stdin?.end(input);
  });
}

// 형식이 맞고 실제 달력에 있는 날짜만 받는다 (2026-02-30 같은 날짜는 버린다)
const date = (v: unknown) =>
  typeof v === "string" && DATE.test(v) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v) ? v : null;
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

async function askAi(bin: string, prompt: string): Promise<{ items?: Record<string, unknown>[]; same?: unknown }> {
  const dir = await mkdtemp(join(tmpdir(), "ai-"));
  try {
    const answer = await runAi(bin, prompt, dir);
    return JSON.parse(answer.slice(answer.indexOf("{"), answer.lastIndexOf("}") + 1));
  } catch (error) {
    console.error(`  AI(${AI_ENGINE}) 실패`);
    throw error;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// 포스터 읽기: 본문 글자가 거의 없고 그림만 있는 글은 그림(최대 2장)의 글자를 AI가 읽어 본문 뒤에 붙인다.
// 읽은 글자는 정보 추출에만 쓰고 저장하지 않는다 (원문을 복사하지 않는다)
const POSTER_TEXT_MIN = 150; // 본문 글자(공백 제외)가 이보다 적으면 포스터를 읽는다
const POSTER_MAX = 2;
// 포스터는 한 번에 하나씩 AI를 불러 비용이 커서, 한 번 실행(수집 1회)에 이만큼만 읽는다
const POSTER_LIMIT = Number(process.env.POSTER_LIMIT ?? 10);
let postersRead = 0;
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };
// 본문 글자가 거의 없고, 규칙으로 날짜를 하나도 못 찾은 글만 포스터를 읽는다
export const needsPoster = (item: CollectedItem) =>
  (item.images?.length ?? 0) > 0 &&
  item.text.replace(/\s/g, "").length < POSTER_TEXT_MIN &&
  !item.program.recruitPeriod.end &&
  !item.program.activityPeriod.start;

async function readPoster(bin: string, item: CollectedItem): Promise<void> {
  if (postersRead >= POSTER_LIMIT) return;
  postersRead++;
  const dir = await mkdtemp(join(tmpdir(), "poster-"));
  try {
    const files: string[] = [];
    for (const url of item.images!.slice(0, POSTER_MAX)) {
      const image = await fetchImage(url);
      if (!image) continue;
      const file = join(dir, `poster${files.length}.${EXT[image.type]}`);
      await writeFile(file, image.data);
      files.push(file);
    }
    if (files.length === 0) return;
    const prompt = `첨부한 그림은 대학 공지 "${item.program.title}"의 포스터다. 파일을 읽거나 명령을 실행하지 말고, 그림에 적힌 글자 중
공고 내용(제목, 대상, 모집·신청 기간, 활동 일정, 장소, 신청 방법, 주최·주관, 혜택)만 줄마다 그대로 옮겨 적어라. 설명 없이 글자만.
공고와 관계없는 그림이거나 글자가 없으면 "없음"이라고만 써라.`;
    const text = (await runAi(bin, prompt, dir, files)).trim();
    if (text && text !== "없음") item.text = `${item.text}\n[포스터에 적힌 글자]\n${text.slice(0, 2000)}`;
  } catch (error) {
    console.error("  포스터 읽기 실패:", error instanceof Error ? error.message : error);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// 학년 표기를 "1학년"~"4학년"으로 맞춘다. "3학년 이상" → 3·4학년, "2~3학년" → 2·3학년. 학기·대학원 같은 표기는 뺀다
export function normalizeGrades(values: string[]): string[] {
  const out = new Set<string>();
  for (const value of values) {
    if (/제외|학기|대학원|석사|박사/.test(value)) continue;
    // "1,3학년"·"1·3학년"은 그 학년들만, "2~3학년"·"2-3학년"은 범위
    const list = value.match(/^([1-4](?:\s*[,·]\s*[1-4])+)\s*학년/);
    if (list) {
      for (const g of list[1].match(/[1-4]/g)!) out.add(`${g}학년`);
      continue;
    }
    const range = value.match(/([1-4])\s*[~\-]\s*([1-4])\s*학년/);
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
const isSchoolName = (name: string) => /대학|학교/.test(name) || SCHOOL_NAMES.some((school) => name.includes(school));
export function fixOrganizerType(program: Program, categories: TagCategory[]): void {
  const organizer = program.organizer;
  if (program.organizerType !== "학교" || !organizer) return;
  if (!OUTSIDE_GROUP.test(organizer) || isSchoolName(organizer)) return;
  const typeCategory = categories.find((c) => c.matchOn === "organizer");
  const types = typeCategory?.tags ?? [];
  const fixed = types.find((t) => t.name !== "학교" && t.keywords.some((k) => organizer.includes(k)))?.name ?? null;
  program.tags = program.tags.filter((t) => t !== "학교");
  if (fixed) program.tags = [fixed, ...program.tags.filter((t) => t !== fixed)];
  program.organizerType = fixed;
}

// 반영하면 true, 학생 대상이 아니면 false, 응답이 불완전해 반영하지 않으면 null (다음에 다시 추출한다)
function apply(item: CollectedItem, data: Record<string, unknown>, categories: TagCategory[]): boolean | null {
  const { program } = item;
  const complete = typeof data.forStudents === "boolean" && Array.isArray(data.tags) && Array.isArray(data.grades);
  if (!complete) return null;
  if (data.forStudents === false) return false;
  const allowedTags = new Set(categories.flatMap((c) => c.tags.map((t) => t.name)));
  const organizerTypes = categories.find((c) => c.matchOn === "organizer")?.tags.map((t) => t.name) ?? [];

  // 기관 이름은 짧은 이름만 받는다 (본문의 엉뚱한 긴 글이 들어오지 않게)
  if (typeof data.organizer === "string" && data.organizer.trim() && data.organizer.length <= 60) program.organizer = data.organizer.trim();
  if (organizerTypes.includes(data.organizerType as string)) program.organizerType = data.organizerType as string;

  // AI가 날짜를 하나라도 찾았으면 그 기간은 AI 결과를 따른다
  const recruit = { start: date(data.recruitStart), end: date(data.recruitEnd) };
  const activity = { start: date(data.activityStart), end: date(data.activityEnd) };
  const valid = (p: { start: string | null; end: string | null }) => !p.start || !p.end || p.start <= p.end;
  if ((recruit.start || recruit.end) && valid(recruit)) program.recruitPeriod = recruit;
  if ((activity.start || activity.end) && valid(activity)) program.activityPeriod = activity;
  cleanPeriods(program);

  program.target.colleges = strings(data.colleges);
  program.target.departments = strings(data.departments);
  program.target.grades = normalizeGrades(strings(data.grades));
  program.target.statuses = strings(data.statuses).filter((s) => STUDENT_STATUSES.includes(s));
  program.target.excludedStatuses = strings(data.excludedStatuses).filter((s) => STUDENT_STATUSES.includes(s));
  if ("openTo" in data) setOpenTo(program, openTo(data.openTo));
  if ("summary" in data) program.summary = summary(data.summary);
  if (typeof data.noApplication === "boolean") program.noApplication = data.noApplication;

  const tags = strings(data.tags).filter((t) => allowedTags.has(t) && !organizerTypes.includes(t));
  program.tags = [...new Set([...(program.organizerType ? [program.organizerType] : []), ...tags])];
  fixOrganizerType(program, categories);
  program.extractedBy = "ai";
  return true;
}

// 이미 추출한 글에 나중에 생긴 칸(다른 학교 지원 가능 여부, 요약)만 다시 묻는다. 확인하지 않은 칸만 채운다. 답을 받은 글 수를 돌려준다
export async function recheckFields(items: CollectedItem[], maxText = 1500): Promise<number> {
  const bin = findAi();
  if (!bin || items.length === 0) return 0;
  await Promise.all(items.filter(needsPoster).map((item) => readPoster(bin, item)));
  const posts = items
    .map((item) => `### id: ${item.program.id}\n제목: ${item.program.title}\n본문:\n${item.text.slice(0, maxText) || "(본문 없음)"}`)
    .join("\n\n");
  const prompt = `너는 대학 공지에서 사실 정보만 뽑는 추출기다. 파일을 읽거나 명령을 실행하지 말고, 아래 글만 보고 JSON으로만 답해라.
${OPEN_TO_RULE}
${SUMMARY_RULE}
${NO_APPLICATION_RULE}

출력 형식 (게시물 수만큼, 설명 없이 JSON만): {"items":[{"id":"...","openTo":null,"summary":null,"noApplication":false}]}

게시물:

${posts}`;
  try {
    const answer = await askAi(bin, prompt);
    const byId = new Map(items.map((item) => [item.program.id, item.program]));
    let answered = 0;
    for (const data of answer.items ?? []) {
      const program = byId.get(String(data.id));
      if (!program || !("openTo" in data)) continue;
      if (program.target.openTo === undefined) setOpenTo(program, openTo(data.openTo));
      if (program.summary === undefined && "summary" in data) program.summary = summary(data.summary);
      if (program.noApplication === undefined && typeof data.noApplication === "boolean") program.noApplication = data.noApplication;
      answered++;
    }
    return answered;
  } catch (error) {
    console.error("  AI 모집 대상 확인 실패:", error instanceof Error ? error.message : error);
    return 0;
  }
}

// 두 게시물이 같은 프로그램인지 AI에게 묻는다. 같다고 답한 쌍의 번호를 돌려준다. 묻지 못했으면 null
export async function confirmDuplicates(pairs: [Program, Program][]): Promise<number[] | null> {
  const bin = findAi();
  if (!bin || pairs.length === 0) return null;
  const describe = (p: Program) =>
    `${p.title} / 주최 ${p.organizer ?? "모름"} / 모집 ${p.recruitPeriod.start ?? "?"}~${p.recruitPeriod.end ?? "?"} / 활동 ${p.activityPeriod.start ?? "?"}~${p.activityPeriod.end ?? "?"}`;
  const prompt = `아래 각 쌍이 "같은 프로그램을 다른 사이트에 올린 것"인지 판단해라. 파일을 읽거나 명령을 실행하지 말고 JSON만 답해라.
같은 회사·같은 사업이라도 회차·기수·대상·일정이 다르면 다른 프로그램이다. 확실하지 않으면 false.
형식: {"same":[같은 쌍의 번호들]}

${pairs.map(([a, b], i) => `${i}. A: ${describe(a)}\n   B: ${describe(b)}`).join("\n")}`;
  try {
    const answer = await askAi(bin, prompt);
    const same = (answer as { same?: unknown }).same;
    return Array.isArray(same) ? same.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < pairs.length) : null;
  } catch (error) {
    console.error("  AI 중복 판단 실패:", error instanceof Error ? error.message : error);
    return null;
  }
}

// 두 공고가 "같은 프로그램이 다른 해·학기·회차에 다시 열린 것"인지 묻는다. 쌍마다 true/false, 실패하면 null
export async function confirmSameSeries(pairs: [Program, Program][]): Promise<boolean[] | null> {
  const bin = findAi();
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
      const same = (await askAi(bin, prompt)).same;
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
  const bin = findAi();
  if (!bin) return null;
  const prompt = `아래는 대학 홈페이지 소식 게시판의 글 제목이다. 파일을 읽거나 명령을 실행하지 말고 JSON만 답해라.
학생(학부생·대학원생·유학생)이 신청·참여·지원할 수 있는 모집 공고의 번호만 골라라.
- 고른다: 프로그램·교육·특강·캠프·공모전·대회·장학·지원금·인턴·채용·서포터즈·봉사·해외 파견·행사 참가자 모집, 신청 안내.
- 고르지 않는다: 보도·홍보 기사, 수상·성과 소식, 결과·합격자 발표, 교원·직원 대상 글, 입찰·계약, 단순 행정 안내(휴무·시설 공사 등).
- 애매하면 고른다 (다음 단계에서 본문을 읽고 다시 거른다).
형식: {"pick":[번호들]}

${titles.map((title, i) => `${i}. ${title}`).join("\n")}`;
  try {
    const answer = (await askAi(bin, prompt)) as { pick?: unknown };
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
  // posters: 본문이 그림뿐인 글의 포스터를 읽을지 (오래된 글을 쌓는 backfill은 느려서 기본으로 끈다)
  { batchSize = BATCH_SIZE, maxText = MAX_TEXT, posters = true } = {},
): Promise<{ done: number; notForStudents: Set<string> }> {
  const notForStudents = new Set<string>();
  const bin = findAi();
  if (!bin || items.length === 0) return { done: 0, notForStudents };

  // 묶음 여러 개를 동시에 Codex에 보낸다 (묶음마다 1분쯤 걸려서 차례로 보내면 오래 걸린다)
  const batches: CollectedItem[][] = [];
  for (let i = 0; i < items.length; i += batchSize) batches.push(items.slice(i, i + batchSize));
  let done = 0;
  let finished = 0;
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++];
      const withPoster = posters ? batch.filter(needsPoster) : [];
      if (withPoster.length > 0) {
        await Promise.all(withPoster.map((item) => readPoster(bin, item)));
        console.log(`  포스터 읽기 ${withPoster.length}개`);
      }
      try {
        const answer = await askAi(bin, buildPrompt(batch, categories, maxText));
        for (const data of answer.items ?? []) {
          const item = batch.find((b) => b.program.id === data.id);
          if (!item) continue;
          const result = apply(item, data, categories);
          if (result === true) done++;
          else if (result === false) notForStudents.add(item.program.id);
        }
      } catch (error) {
        console.error("  AI 추출 실패, 규칙 결과를 사용:", error instanceof Error ? error.message : error);
      }
      console.log(`  AI 추출 묶음 ${++finished}/${batches.length}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(AI_PARALLEL, batches.length) }, worker));
  return { done, notForStudents };
}
