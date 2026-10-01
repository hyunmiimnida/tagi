import * as cheerio from "cheerio";
import { RobotsBlockedError } from "../fetch.ts";
import { emptyProgram } from "../types.ts";
import type { ArchivePost, Archiver, CollectContext, CollectedItem, Collector } from "../types.ts";

// 학교 소식 게시판 수집기.
// 목록에서 새 게시물을 찾고, 상세 페이지 본문 글자만 읽는다 (첨부파일은 받지 않는다).

const PAGE_SIZE = 10;
const ARCHIVE_PAGE_SIZE = 100; // 과거 글을 훑을 때는 한 쪽에 많이 받아 요청 수를 줄인다

// 줄바꿈을 살려서 본문 글자만 뽑는다. 표는 한 줄(tr)을 한 줄로 만든다
export function htmlToText(html: string): string {
  return cheerio
    .load(
      html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
        .replace(/<\/(td|th)>/gi, " "),
    )
    .text()
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

function toIsoDate(text: string): string | null {
  const m = text.match(/(\d{4})\.(\d{2})\.(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function viewUrl(sourceUrl: string, postId: string): string {
  const url = new URL(sourceUrl);
  url.searchParams.set("mode", "view");
  url.searchParams.set("articleNo", postId);
  return url.href;
}

// 목록 한 쪽: 게시물 번호, 제목, 게시일
async function listPage({ source, fetchHtml }: CollectContext, offset: number, limit: number): Promise<ArchivePost[]> {
  const listUrl = new URL(source.url);
  listUrl.searchParams.set("mode", "list");
  listUrl.searchParams.set("articleLimit", String(limit));
  listUrl.searchParams.set("article.offset", String(offset));

  const $ = cheerio.load(await fetchHtml(listUrl.href));
  const posts: ArchivePost[] = [];
  for (const a of $(".b-title-box > a[href*='mode=view']").toArray()) {
    const postId = new URL($(a).attr("href")!, listUrl).searchParams.get("articleNo");
    if (!postId) continue;
    const row = $(a).closest("tr");
    posts.push({
      postId,
      title: $(a).find("span").first().text().replace(/\s+/g, " ").trim(),
      url: viewUrl(source.url, postId),
      postedAt: toIsoDate(row.find(".b-date").first().text()),
    });
  }
  return posts;
}

// 본문 그림 주소 (data: 주소와 작은 아이콘 이름은 뺀다)
export function imagesIn($: cheerio.CheerioAPI, content: ReturnType<cheerio.CheerioAPI>, pageUrl: string): string[] {
  const urls = content
    .find("img")
    .toArray()
    .map((img) => $(img).attr("src") ?? "")
    .filter((src) => src && !src.startsWith("data:") && !/icon|btn|bullet|blank/i.test(src))
    .map((src) => {
      try {
        return new URL(src, pageUrl).href;
      } catch {
        return "";
      }
    })
    .filter((url) => /^https?:/.test(url));
  return [...new Set(urls)];
}

// 상세 페이지를 읽어 본문 글자와 작성 부서를 얻는다
async function readPost({ school, source, fetchHtml }: CollectContext, post: ArchivePost): Promise<CollectedItem | null> {
  const detail = cheerio.load(await fetchHtml(post.url));
  const title = detail(".b-main-box .b-title").first().text().replace(/\s+/g, " ").trim() || post.title;
  if (!title) return null;

  const program = emptyProgram(school, source, post.postId, title, post.url);
  program.postedAt = toIsoDate(detail(".b-date-box span").last().text()) ?? post.postedAt;
  return {
    program,
    writer: detail(".b-writer-box span").last().text().trim() || null,
    text: htmlToText(detail(".b-content-box .fr-view").html() ?? ""),
    images: imagesIn(detail, detail(".b-content-box .fr-view"), post.url),
  };
}

export const collectNewsBoard: Collector = async (ctx) => {
  const items = new Map<string, CollectedItem>();

  for (let page = 0; page < (ctx.source.pages ?? 3); page++) {
    const posts = await listPage(ctx, page * PAGE_SIZE, PAGE_SIZE);
    if (posts.length === 0) {
      if (page === 0) throw new Error("목록에서 게시물을 찾지 못함 (사이트 구조가 바뀌었을 수 있음)");
      break;
    }

    for (const post of posts) {
      if (ctx.isKnown(post.url) || items.has(post.postId)) continue;
      const item = await readPost(ctx, post).catch((error) => {
        if (error instanceof RobotsBlockedError) return null; // robots.txt가 막은 글은 건너뛴다 (fetch.ts가 기록)
        throw error;
      });
      if (item) items.set(post.postId, item);
    }
  }

  return [...items.values()];
};

// 과거 글: since 이후 게시물의 목록만 훑고, 본문은 1차로 거른 글만 나중에 읽는다
export const archiveNewsBoard: Archiver = {
  async list(ctx, since) {
    const posts: ArchivePost[] = [];
    for (let offset = 0; ; offset += ARCHIVE_PAGE_SIZE) {
      const page = await listPage(ctx, offset, ARCHIVE_PAGE_SIZE);
      if (page.length === 0) break;
      posts.push(...page.filter((post) => !post.postedAt || post.postedAt >= since));
      console.log(`  목록 ${offset + page.length}개 확인 (${page.at(-1)?.postedAt ?? "?"})`);
      // 공지 고정 글 때문에 날짜가 섞일 수 있어 쪽 전체가 기준보다 오래되었을 때 멈춘다
      if (page.every((post) => post.postedAt && post.postedAt < since)) break;
    }
    return posts;
  },
  read: readPost,
};
