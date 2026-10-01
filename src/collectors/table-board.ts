import * as cheerio from "cheerio";
import { emptyProgram } from "../types.ts";
import type { ArchivePost, CollectContext, CollectedItem, Collector, TableBoard } from "../types.ts";
import { htmlToText } from "./news-board.ts";

// 표 모양 게시판 수집기 (번호·제목·작성자·등록일이 한 줄인 학교 공지 게시판).
// 학교마다 다른 선택자·주소 규칙은 config/schools.json의 "board"에 적는다.
// 목록에서 새 게시물을 찾고, 상세 페이지 본문 글자만 읽는다 (첨부파일은 받지 않는다).

// "2026/10/01", "2026-10-01 15:34", "26-09-30", "2026.10.01" 모두 받는다
export function toIsoDate(text: string): string | null {
  const m = text.match(/(\d{2,4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (!m) return null;
  const year = m[1].length === 2 ? `20${m[1]}` : m[1];
  return `${year}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

// 눈에 안 보이는 글자(폭 없는 공백)도 지운다
const clean = (text: string) => text.replace(/[​-‍﻿]/g, "").replace(/\s+/g, " ").trim();

function boardOf({ source }: CollectContext): TableBoard {
  if (!source.board) throw new Error(`${source.id}: config/schools.json에 "board" 설정이 없음`);
  return source.board;
}

// 목록 한 쪽 (고정 공지는 쪽마다 반복되므로 부르는 쪽에서 번호로 거른다)
async function listPage(ctx: CollectContext, page: number): Promise<ArchivePost[]> {
  const board = boardOf(ctx);
  const listUrl = new URL(ctx.source.url);
  listUrl.searchParams.set(board.pageParam, String(page));

  const $ = cheerio.load(await ctx.fetchHtml(listUrl.href));
  const posts: ArchivePost[] = [];
  for (const a of $(board.link).toArray()) {
    const href = $(a).attr("href") ?? "";
    // 주소의 & 앞뒤가 깨져 있어도 번호를 찾도록 글자로 찾는다
    const postId = href.match(new RegExp(`[?&]${board.idParam.replace(/\./g, "\\.")}=(\\d+)`))?.[1];
    if (!postId) continue;
    const row = $(a).closest("tr");
    posts.push({
      postId,
      title: clean($(a).attr("title") || $(a).text()),
      url: board.viewUrl.replace("{id}", postId),
      postedAt: toIsoDate(row.find(board.listDate ?? "td.date").first().text()),
    });
  }
  return posts;
}

// 상세 정보의 "작성자", "등록일/일시" 같은 이름표(dt) 옆 값(dd)
function labeled($: cheerio.CheerioAPI, label: RegExp): string {
  const dt = $("dt")
    .toArray()
    .find((el) => label.test($(el).text()));
  return dt ? clean($(dt).next("dd").text()) : "";
}

async function readPost(ctx: CollectContext, post: ArchivePost): Promise<CollectedItem | null> {
  const board = boardOf(ctx);
  const $ = cheerio.load(await ctx.fetchHtml(post.url));
  const title = clean($(board.title).first().text()) || post.title;
  if (!title) return null;

  const program = emptyProgram(ctx.school, ctx.source, post.postId, title, post.url);
  const posted = board.date ? $(board.date).first().text() : labeled($, /등록일|일시|작성일/);
  program.postedAt = toIsoDate(posted) ?? post.postedAt;
  // 본문의 그림(글자 대신 이미지로 붙인 공고)은 글자가 아니므로 뺀다
  $(board.content).find("img, script, style").remove();
  return {
    program,
    writer: labeled($, /작성자|부서/) || null,
    text: htmlToText($(board.content).first().html() ?? ""),
  };
}

export const collectTableBoard: Collector = async (ctx) => {
  const items = new Map<string, CollectedItem>();
  for (let page = 1; page <= (ctx.source.pages ?? 3); page++) {
    const posts = await listPage(ctx, page);
    if (posts.length === 0) {
      if (page === 1) throw new Error("목록에서 게시물을 찾지 못함 (사이트 구조가 바뀌었을 수 있음)");
      break;
    }
    for (const post of posts) {
      if (ctx.isKnown(post.url) || items.has(post.postId)) continue;
      const item = await readPost(ctx, post);
      if (item) items.set(post.postId, item);
    }
  }
  return [...items.values()];
};
