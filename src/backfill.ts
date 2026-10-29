import { mkdir } from "node:fs/promises";
import { AI_MISSING, aiLimitHit, enrichWithAi, findAi, fixOrganizerType, normalizeGrades, pickProgramTitles } from "./ai.ts";
import {
  ARCHIVE_FILE,
  EXCLUDED_FILE,
  PROGRAMS_FILE,
  mergeArchive,
  readJson,
  splitByAge,
  writeJson,
} from "./archive.ts";
import { archivers } from "./collectors/index.ts";
import { collapseReposts, mergePrograms } from "./dedupe.ts";
import { applyCampus } from "./campus.ts";
import { cleanPeriods, notForStudentsByTitle } from "./extract.ts";
import { enrich } from "./extract.ts";
import { fetchHtml, isAllowedByRobots } from "./fetch.ts";
import { assignSeries } from "./series.ts";
import type { ArchivePost, CollectContext, CollectedItem, Program, School, TagCategory } from "./types.ts";

// 과거 글 수집 (내 컴퓨터에서 한 번 실행, 몇 시간 걸린다. 끊겨도 다시 실행하면 이어서 한다)
//   npm run backfill -- --since 2020-01-01   목록 훑기 → 제목으로 거르기 → 본문 읽고 추출
//   npm run backfill -- --save               결과를 data/programs.json·archive.json에 합치기
//   --rules를 붙이면 AI 없이 규칙으로만 추출한다 (AI 한도가 없을 때)
//   --school knu,kmu 를 붙이면 그 학교만 한다
//   --posters를 붙이면 본문이 그림뿐인 글의 포스터도 AI가 읽는다 (느려서 기본은 끔)
// 학교는 BACKFILL_SCHOOLS개(기본 4)씩 동시에, 학교 안 출처는 차례로 처리하며 AI는 전체 5개까지 돌린다.
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
const AI_PARALLEL = 5; // 모든 학교가 함께 쓰는 AI 작업 수
const schoolParallel = Number(process.env.BACKFILL_SCHOOLS ?? 4);
const SCHOOL_PARALLEL = Number.isSafeInteger(schoolParallel) && schoolParallel > 0 ? schoolParallel : 4;
const withAiSlot = createLimiter(AI_PARALLEL);

const args = process.argv.slice(2);
const rulesOnly = args.includes("--rules");
// --school knu,kmu 처럼 고른 학교만 과거 글을 쌓는다 (없으면 모든 학교)
const onlySchools = args.includes("--school") ? new Set(args[args.indexOf("--school") + 1]?.split(",") ?? []) : null;
const since = args[args.indexOf("--since") + 1]?.match(/^\d{4}-\d{2}-\d{2}$/) ? args[args.indexOf("--since") + 1] : "2020-01-01";

const schools = await readJson<School[]>(new URL("../config/schools.json", import.meta.url));
const categories = await readJson<TagCategory[]>(new URL("../config/tag-categories.json", import.meta.url));
await mkdir(CACHE, { recursive: true });

// 본문을 읽는 출처(상세 페이지가 있는 출처)의 id
const readableSources = new Set(
  schools.flatMap((school) => school.sources.filter((s) => archivers[s.collector]?.read).map((s) => s.id)),
);
// 모집 대상 신분(statuses)이 생기기 전에 추출한 본문 글은 다시 추출한다
const outdated = (p: Program) => p.target.statuses === undefined && p.sources.some((s) => readableSources.has(s));

const triage = await readJson<Record<string, boolean>>(TRIAGE_FILE, {});
const results = (await readJson<Program[]>(RESULTS_FILE, [])).filter((p) => !outdated(p));
const rejected = new Set(await readJson<string[]>(REJECTED_FILE, []));

// 이미 처리했거나 목록·보관함에 있는 글은 건너뛴다
async function knownUrls(): Promise<Set<string>> {
  const saved = [...(await readJson<Program[]>(PROGRAMS_FILE, [])), ...(await readJson<Program[]>(ARCHIVE_FILE, []))];
  return new Set(
    [...saved, ...results]
      .filter((p) => !outdated(p))
      .flatMap((p) => p.links.map((l) => l.url))
      .concat([...rejected]),
  );
}

async function run() {
  if (!rulesOnly && !findAi()) throw new Error(`과거 글을 거를 수 없습니다: ${AI_MISSING}`);
  const known = await knownUrls();

  const selected = schools.filter((school) => !onlySchools || onlySchools.has(school.id));
  await inParallel(selected, async (school) => {
    for (const source of school.sources) {
      if (aiLimitHit()) break; // AI 한도에 걸렸으면 다음 출처의 목록도 훑지 않는다
      const archiver = archivers[source.collector];
      if (!source.enabled || !archiver) continue;
      const label = `[${school.name} > ${source.name}]`;
      const ctx: CollectContext = { school, source, fetchHtml, isKnown: (url) => known.has(url) };

      try {
        if (!(await isAllowedByRobots(source.url))) {
          console.log(`${label} robots.txt에서 막아서 건너뜀`);
          continue;
        }
        // 1. 목록 훑기 (한 번 훑은 목록은 저장해 두고 다시 쓴다)
        let posts = await readJson<ArchivePost[] | null>(listFile(source.id), null).catch(() => null);
        if (!posts) {
          console.log(`${label} ${since} 이후 목록 훑는 중`);
          posts = await archiver.list(ctx, since);
          // RSS 피드의 본문(summary)은 이번 실행 동안만 쓰고 파일에는 남기지 않는다 (원문을 저장하지 않는다)
          await writeJson(listFile(source.id), posts.map(({ summary: _body, ...post }: ArchivePost & { summary?: string }) => post));
        }
        const unique = [...new Map(posts.map((post) => [post.url, post])).values()];
        const todo = unique.filter((post) => !known.has(post.url));
        console.log(`${label} 목록 ${unique.length}개 중 새로 볼 글 ${todo.length}개`);

        // 2. 상세를 읽어야 하는 출처는 제목으로 먼저 거른다
        // --rules일 때는 AI 없이 진행하므로, 아직 거르지 않은 글은 일단 모두 후보로 본다
        if (archiver.read && !rulesOnly) await triageTitles(label, todo);
        const candidates = archiver.read ? todo.filter((post) => triage[post.url] ?? rulesOnly) : todo;
        console.log(`${label} 추출할 글 ${candidates.length}개`);

        // 3. 본문 읽고 AI로 추출
        await extract(label, ctx, candidates, archiver.read);
      } catch (error) {
        // 한 출처가 실패해도(일시적인 접속 오류 등) 다른 출처는 계속한다. 다음 실행 때 이 출처부터 다시 한다
        console.error(`${label} 건너뜀: ${error instanceof Error ? error.message : error}`);
      }
    }
  }, SCHOOL_PARALLEL);
  console.log(`끝. 추출 ${results.length}개, 학생 대상 아님 ${rejected.size}개. 이제 npm run backfill -- --save`);
  // AI 한도로 멈췄으면 종료 코드 2 (이어서 저장하는 스크립트가 알 수 있게)
  if (aiLimitHit()) {
    console.error("AI 사용 한도에 걸려 일부 글을 정리하지 못함. 한도가 풀리면 다시 실행");
    process.exitCode = 2;
  }
}

async function triageTitles(label: string, posts: ArchivePost[]) {
  const pending = posts.filter((post) => triage[post.url] === undefined);
  const batches = chunk(pending, TRIAGE_BATCH);
  await inParallel(batches, async (batch, index) => {
    const picked = await withAiSlot(() => pickProgramTitles(batch.map((post) => post.title)));
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
  let failure: { error: unknown } | undefined;
  // 본문 읽기(1초 간격)는 차례로, AI 추출은 동시에 여러 개 돌린다
  const running = new Set<Promise<void>>();
  try {
    for (const batch of batches) {
      if (failure || aiLimitHit()) break; // AI가 한도에 걸리면 본문을 더 읽지 않는다 (사이트에 헛요청이 가지 않게)
      const items: CollectedItem[] = [];
      for (const post of batch) {
        try {
          const item = post.item ?? (await read!(ctx, post));
          if (item) items.push(item);
        } catch (error) {
          console.error(`${label} 읽기 실패 ${post.url}:`, error instanceof Error ? error.message : error);
        }
      }
      for (const item of items) {
        enrich(item, ctx.source, categories);
        applyCampus(item.program, ctx.school, item.campusLabel); // 다른 캠퍼스 글은 그 캠퍼스로 (수집과 같게)
      }

      const job = (async () => {
        // --rules: AI 없이 규칙 추출 결과만 쓴다 (AI 한도가 없을 때, 보관함에만 들어갈 오래된 글용)
        if (rulesOnly) {
          for (const item of items) {
            fixOrganizerType(item.program, categories);
            results.push(item.program);
          }
          await persist();
          console.log(`${label} 규칙 추출 ${++finished}/${batches.length}묶음 (누적 ${results.length}개)`);
          return;
        }
        const ai = await withAiSlot(() => enrichWithAi(items, categories, {
          batchSize: items.length,
          maxText: NEWS_MAX_TEXT,
          posters: args.includes("--posters"),
        }));
        for (const item of items) {
          if (ai.notForStudents.has(item.program.id)) rejected.add(item.program.links[0].url);
          else if (item.program.extractedBy === "ai") results.push(item.program); // AI가 실패한 글은 다음 실행 때 다시
        }
        await persist();
        finished++;
        console.log(`${label} 추출 ${finished}/${batches.length}묶음 (누적 ${results.length}개)`);
      })().catch((error: unknown) => {
        failure ??= { error }; // 읽는 동안 난 오류도 기억하고, 이미 시작한 작업은 마저 기다린다
      }).finally(() => running.delete(job));
      running.add(job);
      // AI 자리를 기다리는 동안에도 다음 본문을 읽되, 대기 묶음이 끝없이 쌓이지 않게 한다
      if (running.size >= AI_PARALLEL) await Promise.race(running);
    }
  } finally {
    await Promise.all(running);
  }
  if (failure) throw failure.error;
}

// 추출 결과를 목록(최근 90일)과 보관함(그 이전)에 나눠 합친다
async function save() {
  // 수집 중에 고친 검사 규칙을 이미 추출한 결과에도 적용한다
  for (const program of results) {
    fixOrganizerType(program, categories);
    program.target.grades = normalizeGrades(program.target.grades);
  }
  // 목록·보관함·새 결과를 한데 모아 정리한 뒤 한 번에 나눈다 (같은 공고가 양쪽에 남지 않게)
  const saved = [...(await readJson<Program[]>(PROGRAMS_FILE, [])), ...(await readJson<Program[]>(ARCHIVE_FILE, []))];
  // --school이면 그 학교 결과만 합친다 (이미 합친 다른 학교 결과가 그 뒤에 손본 데이터를 덮어쓰지 않게).
  // 제외 목록(data/excluded.json)에 있는 글은 다시 넣지 않는다
  const excludedUrls = new Set(await readJson<string[]>(EXCLUDED_FILE, []));
  const sourceIds = new Set(schools.filter((s) => !onlySchools || onlySchools.has(s.id)).flatMap((s) => s.sources.map((src) => src.id)));
  const incoming = results.filter(
    (p) => p.sources.some((id) => sourceIds.has(id)) && !p.links.some((l) => excludedUrls.has(l.url)) && !notForStudentsByTitle(p.title),
  );
  console.log(`합칠 결과 ${incoming.length}개 (전체 ${results.length}개 중)`);
  const all = collapseReposts(mergePrograms(saved, incoming));
  all.forEach(cleanPeriods);
  const { current: programs, old } = splitByAge(all);
  const archive = mergeArchive([], old);
  console.log(`반복 프로그램 묶음 ${await assignSeries(programs, archive)}개`);
  await writeJson(PROGRAMS_FILE, programs);
  await writeJson(ARCHIVE_FILE, archive);
  console.log(`목록 ${programs.length}개, 보관함 ${archive.length}개로 저장`);
}

// 진행 상황 저장. 동시에 끝난 작업들이 같은 파일을 겹쳐 쓰지 않게 차례로 저장한다
let saving = Promise.resolve();
function persist(): Promise<void> {
  const saved = saving.then(async () => {
    // 세 파일에 같은 시점의 진행 상황을 담는다
    const snapshot = { triage: { ...triage }, results: [...results], rejected: [...rejected] };
    await writeJson(TRIAGE_FILE, snapshot.triage);
    await writeJson(RESULTS_FILE, snapshot.results);
    await writeJson(REJECTED_FILE, snapshot.rejected);
  });
  saving = saved.catch(() => {}); // 한 번 실패해도 다른 학교의 다음 저장은 시도한다
  return saved;
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// 먼저 기다린 작업부터 빈자리를 넘겨준다. 실패해도 다음 작업은 계속한다.
function createLimiter(limit: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(work: () => Promise<T>): Promise<T> => {
    if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    else active++;
    try {
      return await work();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}

async function inParallel<T>(list: T[], work: (item: T, index: number) => Promise<void>, parallel = AI_PARALLEL) {
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const index = next++;
      await work(list[index], index);
    }
  };
  const settled = await Promise.allSettled(Array.from({ length: Math.min(parallel, list.length) }, worker));
  const failure = settled.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
}

// 위의 함수와 변수를 모두 정의한 뒤에 실행한다
if (args.includes("--save")) await save();
else await run();
