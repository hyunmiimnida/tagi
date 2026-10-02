import * as cheerio from "cheerio";
import { RobotsBlockedError } from "../fetch.ts";
import { emptyProgram } from "../types.ts";
import type { Archiver, ArchivePost, CollectContext, CollectedItem, Collector, JsonBoard } from "../types.ts";
import { htmlToText, imagesIn } from "./news-board.ts";
import { toIsoDate, writerName } from "./table-board.ts";

// 목록을 화면이 아니라 데이터 주소(JSON)로 불러오는 게시판 수집기 (서강대·중앙대 본부 공지처럼 화면을 스크립트로 그리는 곳).
// 목록 JSON에서 번호·제목·등록일을 읽고, 본문은 상세 JSON(detailUrl)이나 상세 화면(viewUrl)에서 읽는다.
// 데이터 주소도 화면 주소와 똑같이 robots.txt를 확인한다 (fetchHtml)

function boardOf({ source }: CollectContext): JsonBoard {
  if (!source.json) throw new Error(`${source.id}: config/schools.json에 "json" 설정이 없음`);
  return source.json;
}

// "data.list" 같은 점 경로로 값을 꺼낸다
export function pick(data: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => (value == null ? undefined : (value as Record<string, unknown>)[key]), data);
}
const str = (value: unknown) => (value == null ? "" : String(value).replace(/\s+/g, " ").trim());

// "20261001150309"처럼 붙여 쓴 날짜도 읽는다
export const jsonDate = (value: unknown) => {
  const text = str(value);
  const packed = text.match(/^(\d{4})(\d{2})(\d{2})/);
  return packed ? `${packed[1]}-${packed[2]}-${packed[3]}` : toIsoDate(text);
};

async function listPage(ctx: CollectContext, page: number): Promise<ArchivePost[]> {
  const board = boardOf(ctx);
  const data = JSON.parse(await ctx.fetchHtml(board.listUrl.replace("{page}", String(page))));
  const rows = pick(data, board.items);
  if (!Array.isArray(rows)) throw new Error(`목록 JSON에서 "${board.items}"를 찾지 못함 (사이트 구조가 바뀌었을 수 있음)`);
  return rows.flatMap((row) => {
    const postId = str(pick(row, board.id));
    if (!postId) return [];
    return [{
      postId,
      title: str(pick(row, board.title)),
      url: board.viewUrl.replace("{id}", postId),
      postedAt: jsonDate(pick(row, board.date)),
      campus: board.campus ? str(pick(row, board.campus)) : undefined,
    }];
  });
}

async function readPost(ctx: CollectContext, post: ArchivePost): Promise<CollectedItem | null> {
  const board = boardOf(ctx);
  const program = emptyProgram(ctx.school, ctx.source, post.postId, post.title, post.url);
  program.postedAt = post.postedAt;
  let html = "";
  let writer = "";
  let images: string[] = [];
  if (board.detailUrl) {
    // 상세도 JSON: 본문 HTML 칸을 글자로 바꾼다
    const detail = JSON.parse(await ctx.fetchHtml(board.detailUrl.replace("{id}", post.postId)));
    html = str(pick(detail, board.content ?? ""));
    writer = board.writer ? str(pick(detail, board.writer)) : "";
    const title = board.detailTitle ? str(pick(detail, board.detailTitle)) : "";
    if (title) program.title = title;
    const $ = cheerio.load(html);
    images = imagesIn($, $.root(), post.url);
  } else {
    // 상세는 화면(HTML)에서 선택자로 읽는다
    const $ = cheerio.load(await ctx.fetchHtml(post.url));
    const body = $(board.content ?? "body").first();
    images = imagesIn($, body, post.url);
    body.find("img, script, style").remove();
    html = body.html() ?? "";
    writer = board.writer ? str($(board.writer).first().text()) : "";
  }
  return { program, writer: writerName(writer) || null, text: htmlToText(html), images, campusLabel: post.campus };
}

const readSafely = (ctx: CollectContext, post: ArchivePost) =>
  readPost(ctx, post).catch((error) => {
    if (error instanceof RobotsBlockedError) return null; // robots.txt가 막은 글은 건너뛴다 (fetch.ts가 기록)
    throw error;
  });

export const collectJsonBoard: Collector = async (ctx) => {
  const items = new Map<string, CollectedItem>();
  for (let page = 1; page <= (ctx.source.pages ?? 1); page++) {
    const posts = await listPage(ctx, page);
    if (posts.length === 0) {
      if (page === 1) throw new Error("목록 JSON에 게시물이 없음 (사이트 구조가 바뀌었을 수 있음)");
      break;
    }
    for (const post of posts) {
      if (ctx.isKnown(post.url) || items.has(post.postId)) continue;
      const item = await readSafely(ctx, post);
      if (item) items.set(post.postId, item);
    }
  }
  return [...items.values()];
};

// 과거 글: since 이후 글이 나오는 동안 쪽을 넘긴다
const ARCHIVE_MAX_PAGES = 300;
export const archiveJsonBoard: Archiver = {
  async list(ctx, since) {
    const seen = new Map<string, ArchivePost>();
    for (let page = 1; page <= ARCHIVE_MAX_PAGES; page++) {
      const fresh = (await listPage(ctx, page)).filter((post) => !seen.has(post.postId));
      if (fresh.length === 0) break;
      for (const post of fresh) if (!post.postedAt || post.postedAt >= since) seen.set(post.postId, post);
      console.log(`  목록 ${page}쪽 확인 (${fresh.at(-1)?.postedAt ?? "?"})`);
      if (fresh.every((post) => post.postedAt && post.postedAt < since)) break;
    }
    return [...seen.values()];
  },
  read: readPost,
};
