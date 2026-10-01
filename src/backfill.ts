import { mkdir } from "node:fs/promises";
import { enrichWithAi, findCodex, fixOrganizerType, pickProgramTitles } from "./ai.ts";
import {
  ARCHIVE_FILE,
  PROGRAMS_FILE,
  mergeArchive,
  readJson,
  splitByAge,
  writeJson,
} from "./archive.ts";
import { archivers } from "./collectors/index.ts";
import { mergePrograms } from "./dedupe.ts";
import { enrich } from "./extract.ts";
import { fetchHtml, isAllowedByRobots } from "./fetch.ts";
import { assignSeries } from "./series.ts";
import type { ArchivePost, CollectContext, CollectedItem, Program, School, TagCategory } from "./types.ts";

// 과거 글 수집 (내 컴퓨터에서 한 번 실행, 몇 시간 걸린다. 끊겨도 다시 실행하면 이어서 한다)
//   npm run backfill -- --since 2020-01-01   목록 훑기 → 제목으로 거르기 → 본문 읽고 추출
//   npm run backfill -- --save               결과를 data/programs.json·archive.json에 합치기
// 진행 상황은 .cache/backfill/에 둔다 (git에 올리지 않음). 원문 본문은 저장하지 않는다.

const CACHE = new URL("../.cache/backfill/", import.meta.url);
const TRIAGE_FILE = new URL("triage.json", CACHE); // 글 주소 → 학생 대상 공고 후보인지
const RESULTS_FILE = new URL("results.json", CACHE); // 추출을 마친 공고
const REJECTED_FILE = new URL("rejected.json", CACHE); // 본문을 읽어 보니 학생 대상이 아닌 글
const listFile = (sourceId: string) => new URL(`list-${sourceId}-${since}.json`, CACHE);

const TRIAGE_BATCH = 200; // 제목 거르기 한 번에 보낼 제목 수
const NEWS_BATCH = 20; // 본문 추출 한 번에 보낼 게시물 수
const LIST_ONLY_BATCH = 40; // 목록 정보만 있는 출처는 글이 짧아 많이 보낸다
const NEWS_MAX_TEXT = 1500;
const AI_PARALLEL = 5; // 동시에 돌리는 AI 작업 수

const args = process.argv.slice(2);
const since = args[args.indexOf("--since") + 1]?.match(/^\d{4}-\d{2}-\d{2}$/) ? args[args.indexOf("--since") + 1] : "2020-01-01";

const schools = await readJson<School[]>(new URL("../config/schools.json", import.meta.url));
const categories = await readJson<TagCategory[]>(new URL("../config/tag-categories.json", import.meta.url));
await mkdir(CACHE, { recursive: true });

const triage = await readJson<Record<string, boolean>>(TRIAGE_FILE, {});
const results = await readJson<Program[]>(RESULTS_FILE, []);
const rejected = new Set(await readJson<string[]>(REJECTED_FILE, []));

// 이미 처리했거나 목록·보관함에 있는 글은 건너뛴다
async function knownUrls(): Promise<Set<string>> {
  const saved = [...(await readJson<Program[]>(PROGRAMS_FILE, [])), ...(await readJson<Program[]>(ARCHIVE_FILE, []))];
  return new Set([...saved, ...results].flatMap((p) => p.links.map((l) => l.url)).concat([...rejected]));
}

async function run() {
  if (!findCodex()) throw new Error("Codex CLI가 없어 과거 글을 거를 수 없습니다 (npm install -g @openai/codex)");
  const known = await knownUrls();

  for (const school of schools) {
    for (const source of school.sources) {
      const archiver = archivers[source.collector];
      if (!source.enabled || !archiver) continue;
      const label = `[${school.name} > ${source.name}]`;
      if (!(await isAllowedByRobots(source.url))) {
        console.log(`${label} robots.txt에서 막아서 건너뜀`);
        continue;
      }
      const ctx: CollectContext = { school, source, fetchHtml, isKnown: (url) => known.has(url) };

      // 1. 목록 훑기 (한 번 훑은 목록은 저장해 두고 다시 쓴다)
      let posts = await readJson<ArchivePost[] | null>(listFile(source.id), null).catch(() => null);
      if (!posts) {
        console.log(`${label} ${since} 이후 목록 훑는 중`);
        posts = await archiver.list(ctx, since);
        await writeJson(listFile(source.id), posts);
      }
      const unique = [...new Map(posts.map((post) => [post.url, post])).values()];
      const todo = unique.filter((post) => !known.has(post.url));
      console.log(`${label} 목록 ${unique.length}개 중 새로 볼 글 ${todo.length}개`);

      // 2. 상세를 읽어야 하는 출처는 제목으로 먼저 거른다
      if (archiver.read) await triageTitles(label, todo);
      const candidates = archiver.read ? todo.filter((post) => triage[post.url]) : todo;
      console.log(`${label} 추출할 글 ${candidates.length}개`);

      // 3. 본문 읽고 AI로 추출
      await extract(label, ctx, candidates, archiver.read);
    }
  }
  console.log(`끝. 추출 ${results.length}개, 학생 대상 아님 ${rejected.size}개. 이제 npm run backfill -- --save`);
}

async function triageTitles(label: string, posts: ArchivePost[]) {
  const pending = posts.filter((post) => triage[post.url] === undefined);
  const batches = chunk(pending, TRIAGE_BATCH);
  await inParallel(batches, async (batch, index) => {
    const picked = await pickProgramTitles(batch.map((post) => post.title));
    if (!picked) return; // 실패한 묶음은 다음 실행 때 다시 거른다
    const set = new Set(picked);
    batch.forEach((post, i) => (triage[post.url] = set.has(i)));
    await persist();
    console.log(`${label} 제목 거르기 ${index + 1}/${batches.length} (${picked.length}/${batch.length}개 통과)`);
  });
}

async function extract(
  label: string,
  ctx: CollectContext,
  posts: ArchivePost[],
  read: ((ctx: CollectContext, post: ArchivePost) => Promise<CollectedItem | null>) | undefined,
) {
  const batches = chunk(posts, read ? NEWS_BATCH : LIST_ONLY_BATCH);
  let finished = 0;
  // 본문 읽기(1초 간격)는 차례로, AI 추출은 동시에 여러 개 돌린다
  const running = new Set<Promise<void>>();
  for (const batch of batches) {
    const items: CollectedItem[] = [];
    for (const post of batch) {
      try {
        const item = post.item ?? (await read!(ctx, post));
        if (item) items.push(item);
      } catch (error) {
        console.error(`  읽기 실패 ${post.url}:`, error instanceof Error ? error.message : error);
      }
    }
    for (const item of items) enrich(item, ctx.source, categories);

    const job = (async () => {
      const ai = await enrichWithAi(items, categories, {
        batchSize: items.length,
        maxText: NEWS_MAX_TEXT,
      });
      for (const item of items) {
        if (ai.notForStudents.has(item.program.id)) rejected.add(item.program.links[0].url);
        else if (item.program.extractedBy === "ai") results.push(item.program); // AI가 실패한 글은 다음 실행 때 다시
      }
      await persist();
      finished++;
      console.log(`${label} 추출 ${finished}/${batches.length}묶음 (누적 ${results.length}개)`);
    })();
    running.add(job);
    void job.finally(() => running.delete(job));
    if (running.size >= AI_PARALLEL) await Promise.race(running);
  }
  await Promise.all(running);
}

// 추출 결과를 목록(최근 90일)과 보관함(그 이전)에 나눠 합친다
async function save() {
  // 수집 중에 고친 검사 규칙을 이미 추출한 결과에도 적용한다
  for (const program of results) fixOrganizerType(program, categories);
  const { current, old } = splitByAge(results);
  const programs = mergePrograms(await readJson<Program[]>(PROGRAMS_FILE, []), current);
  const archive = mergeArchive(await readJson<Program[]>(ARCHIVE_FILE, []), old);
  console.log(`반복 프로그램 묶음 ${await assignSeries(programs, archive)}개`);
  await writeJson(PROGRAMS_FILE, programs);
  await writeJson(ARCHIVE_FILE, archive);
  console.log(`목록 ${programs.length}개, 보관함 ${archive.length}개로 저장`);
}

// 진행 상황 저장. 동시에 끝난 작업들이 같은 파일을 겹쳐 쓰지 않게 차례로 저장한다
let saving = Promise.resolve();
function persist(): Promise<void> {
  saving = saving.then(async () => {
    await writeJson(TRIAGE_FILE, triage);
    await writeJson(RESULTS_FILE, results);
    await writeJson(REJECTED_FILE, [...rejected]);
  });
  return saving;
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function inParallel<T>(list: T[], work: (item: T, index: number) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const index = next++;
      await work(list[index], index);
    }
  };
  await Promise.all(Array.from({ length: AI_PARALLEL }, worker));
}

// 위의 함수와 변수를 모두 정의한 뒤에 실행한다
if (args.includes("--save")) await save();
else await run();
