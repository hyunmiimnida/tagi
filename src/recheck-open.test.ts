import assert from "node:assert/strict";
import test from "node:test";
import { compareContent, createRecheckPicker, finishRecheck, readRechecks, recheckLimit, RECHECK_LIMIT } from "./recheck-open.ts";
import type { Recheck, RecheckContext } from "./recheck-open.ts";
import { RobotsBlockedError } from "./fetch.ts";
import { enrichWithAi } from "./ai.ts";
import { emptyProgram } from "./types.ts";
import type { CollectedItem, Program, School, Source } from "./types.ts";

const today = "2026-11-02T12:00:00Z";
const source: Source = { id: "board", name: "게시판", url: "https://example.test/", collector: "fake", enabled: true };
const school: School = { id: "school", name: "학교", shortName: "학교", region: "지역", sources: [source] };
const program = (id: string, overrides: Partial<Program> = {}): Program => ({
  ...emptyProgram(school, source, id, "학생 모집", `https://example.test/post/${id}`),
  extractedBy: "ai", postedAt: "2026-11-01", collectedAt: "2026-11-01T00:00:00Z",
  recruitPeriod: { start: null, end: "2026-11-10" }, ...overrides,
});
const context = (sources: Source[] = [source]): RecheckContext => ({
  schools: [{ ...school, sources }], githubActions: false,
  archivers: { fake: { read: async () => null } },
});
const item = (saved: Program, text = "수정 본문"): CollectedItem => ({
  program: { ...structuredClone(saved), id: "새로-읽은-id", extractedBy: "rules" }, writer: null, text,
});
const check = (saved: Program, text = "수정 본문"): Recheck => ({
  saved, item: item(saved, text), ...compareContent(saved.contentHash, text),
});
const noFetch = async (): Promise<string> => { throw new Error("실제 요청 금지"); };

test("AI로 정리한 열린 공고 중 게시일과 첫 링크의 켜진 수집기가 있는 글만 고른다", () => {
  const ctx = context([
    source, { ...source, id: "off", enabled: false },
    { ...source, id: "missing", collector: "missing" },
    { ...source, id: "list", collector: "list" },
  ]);
  ctx.archivers.list = {};
  const linked = (id: string) => program(id, { links: [{ sourceId: id, url: `https://example.test/${id}` }] });
  const programs = [
    program("ok"), program("rules", { extractedBy: "rules" }), program("undated", { postedAt: null }),
    program("closed", { recruitPeriod: { start: null, end: "2026-11-01" } }),
    program("old", { postedAt: "2026-09-01", recruitPeriod: { start: null, end: null } }),
    linked("off"), linked("missing"), linked("list"), linked("unknown"), program("no-link", { links: [] }),
    program("second-only", { links: [...linked("off").links, ...program("ok").links] }),
    program("ends-today", { recruitPeriod: { start: null, end: "2026-11-02" } }),
  ];
  assert.deepEqual(createRecheckPicker(ctx)(programs, today, 150).map((p) => p.id), ["board-ends-today", "board-ok"]);
});

test("GITHUB_ACTIONS에서는 localOnly 출처를 고르지 않는다", () => {
  const ctx = context([{ ...source, localOnly: true }]);
  assert.equal(createRecheckPicker(ctx)([program("a")], today, 150).length, 1);
  assert.deepEqual(createRecheckPicker({ ...ctx, githubActions: true })([program("a")], today, 150), []);
});

test("미확인, 오래된 확인 순이며 같은 조건에서는 가까운 마감이 먼저다", () => {
  const programs = [
    program("recent", { checkedAt: "2026-10-29" }),
    program("later"),
    program("old", { checkedAt: "2026-10-20" }),
    program("soon", { recruitPeriod: { start: null, end: "2026-11-03" } }),
  ];
  const before = structuredClone(programs);
  assert.deepEqual(createRecheckPicker(context())(programs, today, 3).map((p) => p.id), ["board-soon", "board-later", "board-old"]);
  assert.deepEqual(programs, before);
});

test("3일 미만과 미래 확인은 제외하고 정확히 3일부터 고른다", () => {
  const programs = [
    program("too-soon", { checkedAt: "2026-10-30T12:00:00.001Z" }),
    program("ready", { checkedAt: "2026-10-30T12:00:00Z" }),
    program("future", { checkedAt: "2026-11-03T00:00:00Z" }),
  ];
  assert.deepEqual(createRecheckPicker(context())(programs, today, 150).map((p) => p.id), ["board-ready"]);
});

test("환경 변수 상한은 기본 150, 0이면 끄고 잘못된 값은 기본으로 돌린다", () => {
  assert.equal(RECHECK_LIMIT, 150);
  for (const value of [undefined, "", "bad", "-1", "1.5", "Infinity"]) assert.equal(recheckLimit(value), 150);
  assert.equal(recheckLimit("0"), 0);
  assert.equal(recheckLimit("12"), 12);
  const pickRecheck = createRecheckPicker(context());
  const programs = Array.from({ length: 200 }, (_, n) => program(String(n)));
  assert.equal(pickRecheck(programs, today, 150).length, 150);
  for (const limit of [0, -1, NaN, Infinity, 1.5]) assert.deepEqual(pickRecheck(programs, today, limit), []);
});

test("본문 해시가 없으면 처음, 같으면 그대로, 다르면 변경으로 판단한다", () => {
  const first = compareContent(undefined, "원문 글자");
  assert.equal(first.state, "first");
  assert.match(first.hash, /^[a-f0-9]{16}$/);
  assert.equal(compareContent(first.hash, "원문 글자").state, "same");
  assert.equal(compareContent(first.hash, "원문 글자 수정").state, "changed");
});

test("첫 확인과 같은 본문은 기존 정보와 확인 기록만 저장한다", () => {
  for (const contentHash of [undefined, compareContent(undefined, "수정 본문").hash]) {
    const saved = program("a", { contentHash });
    const result = finishRecheck(check(saved), today);
    assert.deepEqual(result, { ...saved, contentHash: compareContent(undefined, "수정 본문").hash, checkedAt: today });
    assert.equal(saved.checkedAt, undefined);
    assert.ok(!("text" in result));
  }
});

for (const multipleLinks of [false, true]) {
  test(`변경된 AI 결과는 정보와 해시를 갱신하고 기존 id와 묶음을 유지한다 (여러 링크: ${multipleLinks})`, () => {
    const saved = program("old-id", {
      contentHash: "old-hash", aliases: ["alias"], seriesId: "series", firstSeenAt: "2026-10-01T00:00:00Z",
      summary: "이전 요약", organizer: "이전 주최",
    });
    if (multipleLinks) {
      saved.links.push({ sourceId: "another", url: "https://example.test/another" });
      saved.sources.push("another");
    }
    const before = structuredClone(saved);
    const pending = check(saved);
    Object.assign(pending.item.program, {
      extractedBy: "ai", summary: "새 요약", organizer: "새 주최", tags: ["새 태그"],
      recruitPeriod: { start: null, end: "2026-12-01" }, activityPeriod: { start: null, end: null },
    });
    const result = finishRecheck(pending, today);
    for (const key of ["id", "aliases", "seriesId", "firstSeenAt", "links", "sources"] as const) assert.deepEqual(result[key], saved[key]);
    assert.equal(result.recruitPeriod.end, "2026-12-01");
    assert.equal(result.summary, "새 요약");
    assert.equal(result.organizer, "새 주최");
    assert.deepEqual(result.tags, ["새 태그"]);
    assert.equal(result.contentHash, pending.hash);
    assert.equal(result.checkedAt, today);
    assert.deepEqual(saved, before);
  });
}

test("AI 실패와 학생 대상 아님은 기존 정보와 해시를 유지하고 3일 뒤 재시도한다", () => {
  const saved = program("a", { contentHash: "old-hash" });
  const pending = check(saved);
  assert.deepEqual(finishRecheck(pending, today), { ...saved, checkedAt: today });
  pending.item.program.extractedBy = "ai";
  assert.deepEqual(finishRecheck(pending, today, true), { ...saved, checkedAt: today });
  const failed = finishRecheck(pending, today, true);
  assert.equal(compareContent(failed.contentHash, pending.item.text).state, "changed");
  const pickRecheck = createRecheckPicker(context());
  assert.equal(pickRecheck([failed], "2026-11-03T12:00:00Z", 150).length, 0);
  assert.equal(pickRecheck([failed], "2026-11-05T12:00:00Z", 150).length, 1);
});

test("가짜 응답으로 상한과 첫 링크만 읽는지 확인한다", async () => {
  const ctx = context();
  const urls: string[] = [];
  ctx.archivers.fake.read = async (ctx, post) => {
    urls.push(post.url);
    assert.equal(ctx.isKnown(post.url), false);
    return item(program(post.postId), await ctx.fetchHtml(post.url));
  };
  const programs = Array.from({ length: 200 }, (_, n) => program(String(n)));
  programs[0].links.push({ sourceId: "board", url: "https://example.test/second" });
  const result = await readRechecks(programs, today, 150, ctx, async () => "가짜 본문");
  assert.equal(urls.length, 150);
  assert.equal(result.attempted, 150);
  assert.equal(result.checks.length, 150);
  assert.ok(!urls.includes("https://example.test/second"));
  assert.equal(result.checks[0].item.program.id, programs[0].id);
  await readRechecks(programs, today, 0, ctx, noFetch);
  assert.equal(urls.length, 150);
});

test("읽기 오류와 robots 차단은 그 글만 건너뛰고 추가 글로 상한을 채우지 않는다", async () => {
  const ctx = context();
  let calls = 0;
  ctx.archivers.fake.read = async (ctx, post) => {
    calls++;
    if (calls === 1) throw new Error("읽기 실패");
    if (calls === 2) throw new RobotsBlockedError(post.url);
    if (calls === 3) { ctx.onPostError!(post.url, new Error("읽기 실패")); return null; }
    return item(program("success"));
  };
  const result = await readRechecks(Array.from({ length: 10 }, (_, n) => program(String(n))), today, 4, ctx, noFetch);
  assert.equal(calls, 4);
  assert.equal(result.skipped, 3);
  assert.equal(result.checks.length, 1);
});

test("같은 원문은 한 번만 읽고 JSON 상세에는 첫 링크의 글 번호를 넘긴다", async () => {
  const jsonSource: Source = { ...source, json: {
    listUrl: "https://example.test/list", items: "items", id: "id", title: "title", date: "date",
    viewUrl: "https://example.test/post/{id}?view=1", detailUrl: "https://example.test/api/{id}",
  } };
  const ctx = context([jsonSource]);
  let calls = 0;
  ctx.archivers.fake.read = async (_ctx, post) => {
    calls++;
    assert.equal(post.postId, "123");
    return item(program("123"));
  };
  const saved = program("merged-id", { links: [{ sourceId: source.id, url: "https://example.test/post/123?view=1" }] });
  const result = await readRechecks([saved, { ...saved, id: "duplicate-id" }], today, 150, ctx, noFetch);
  assert.equal(calls, 1);
  assert.equal(result.checks[0].item.program.id, saved.id);
});

test("가짜 AI 응답으로 변경된 글만 다시 정리하고 실패와 제외 응답은 보존한다", async () => {
  const programs = [
    program("first"), program("same", { contentHash: compareContent(undefined, "본문").hash }),
    ...["changed", "failed", "not-student"].map((id) => program(id, { contentHash: "old-hash" })),
  ];
  const ctx = context();
  ctx.archivers.fake.read = async (_ctx, post) => item(program(post.postId), "본문");
  const { checks } = await readRechecks(programs, today, 150, ctx, noFetch);
  const needAi = checks.filter((check) => check.state === "changed").map((check) => check.item);
  assert.deepEqual(needAi.map((item) => item.program.id), ["board-changed", "board-failed", "board-not-student"]);
  let calls = 0;
  const result = await enrichWithAi(needAi, [], { posters: false }, {
    find: () => "fake-ai",
    ask: async () => {
      calls++;
      return { items: ["changed", "not-student"].map((id) => ({
        id: `board-${id}`, forStudents: id === "changed", recruitEnd: "2026-12-01",
        tags: [], grades: [], colleges: [], departments: [], statuses: [], excludedStatuses: [],
      })) };
    },
  });
  assert.equal(calls, 1);
  const updated = checks.map((check) => finishRecheck(check, today, result.notForStudents.has(check.saved.id)));
  assert.equal(updated[2].id, programs[2].id);
  assert.equal(updated[2].recruitPeriod.end, "2026-12-01");
  assert.equal(updated[2].contentHash, checks[2].hash);
  for (const index of [3, 4]) assert.deepEqual(updated[index], { ...programs[index], checkedAt: today });
});
