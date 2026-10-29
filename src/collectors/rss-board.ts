import * as cheerio from "cheerio";
import { emptyProgram } from "../types.ts";
import type { Archiver, ArchivePost, CollectContext, CollectedItem, Collector, RssBoard } from "../types.ts";
import { htmlToText, imagesIn } from "./news-board.ts";
import { skipPost } from "./post-errors.ts";
import { writerName } from "./table-board.ts";

// 피드 본문도 목록과 함께 보관해 상세 요청 없이 다시 읽는다
interface FeedPost extends ArchivePost {
  summary?: string;
}

function boardOf({ source }: CollectContext): RssBoard {
  if (!source.rss) throw new Error(`${source.id}: config/schools.json에 "rss" 설정이 없음`);
  return source.rss;
}

// 제목의 <...>는 지우지 않고, 글자로 감싼 기호만 푼다
function decodeText(text: string): string {
  return cheerio.load(`<textarea>${text.replace(/</g, "&lt;")}</textarea>`)("textarea").text().trim();
}

function koreanDate(text: string): string | null {
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

async function listFeed(ctx: CollectContext): Promise<FeedPost[]> {
  const board = boardOf(ctx);
  const $ = cheerio.load(await ctx.fetchHtml(ctx.source.url), { xmlMode: true });
  const posts = new Map<string, FeedPost>();
  for (const row of $("feed > entry, rss > channel > item").toArray()) {
    const entry = $(row);
    const atom = row.tagName === "entry";
    const link = atom ? entry.children('link[rel="alternate"], link:not([rel])').first().attr("href") : entry.children("link").first().text();
    if (!link) continue;
    let url: URL;
    try {
      url = new URL(decodeText(link), ctx.source.url);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(url.protocol)) continue;
    const postId = url.searchParams.get(board.idParam);
    const title = decodeText(entry.children("title").first().text()).replace(/\s+/g, " ");
    if (!postId || !title || posts.has(postId)) continue;
    posts.set(postId, {
      postId,
      title,
      url: url.href,
      postedAt: koreanDate(entry.children("published").first().text().trim() || entry.children("updated").first().text().trim() || entry.children("pubDate").first().text().trim()),
      summary: entry.children(atom ? "summary" : "description").first().text(),
    });
  }
  return [...posts.values()];
}

async function readPost(ctx: CollectContext, post: FeedPost): Promise<CollectedItem | null> {
  const board = boardOf(ctx);
  let html = post.summary ?? "";
  let writer = "";
  if (board.content || board.writer) {
    const detail = cheerio.load(await ctx.fetchHtml(post.url));
    if (board.content) html = detail(board.content).first().html() ?? "";
    if (board.writer) writer = writerName(detail(board.writer).first().text());
  }
  const $ = cheerio.load(html);
  const images = imagesIn($, $.root(), post.url);
  $("img, script, style").remove();
  const program = emptyProgram(ctx.school, ctx.source, post.postId, post.title, post.url);
  program.postedAt = post.postedAt;
  // 피드의 author는 개인 이름이므로 쓰지 않는다
  return { program, writer: writer || null, text: htmlToText($.root().html() ?? ""), images };
}

const readSafely = (ctx: CollectContext, post: FeedPost) =>
  readPost(ctx, post).catch((error) => skipPost(ctx, post.url, error));

export const collectRssBoard: Collector = async (ctx) => {
  const posts = await listFeed(ctx);
  if (posts.length === 0) throw new Error("피드에서 게시물을 찾지 못함 (사이트 구조가 바뀌었을 수 있음)");
  const items: CollectedItem[] = [];
  for (const post of posts) {
    if (ctx.isKnown(post.url)) continue;
    const item = await readSafely(ctx, post);
    if (item) items.push(item);
  }
  return items;
};

// 피드는 한 번만 읽는다. 수정순이라 오래된 글 뒤에도 새 글이 있을 수 있다
export const archiveRssBoard: Archiver = {
  async list(ctx, since) {
    return (await listFeed(ctx)).filter((post) => post.postedAt !== null && post.postedAt >= since);
  },
  read: readSafely,
};
