import * as cheerio from "cheerio";
import { RobotsBlockedError } from "../fetch.ts";
import { emptyProgram } from "../types.ts";
import type { Archiver, ArchivePost, CollectContext, CollectedItem, Collector, TableBoard } from "../types.ts";
import { htmlToText, imagesIn } from "./news-board.ts";

// 표 모양 게시판 수집기 (번호·제목·작성자·등록일이 한 줄인 학교 공지 게시판).
// 학교마다 다른 선택자·주소 규칙은 config/schools.json의 "board"에 적는다.
// 목록에서 새 게시물을 찾고, 상세 페이지 본문 글자만 읽는다 (첨부파일은 받지 않는다).

// "2026/10/01", "2026-10-01 15:34", "26-09-30", "2026.10.01" 모두 받는다
export function toIsoDate(text: string): string | null {
  const m = text.match(/(\d{2,4})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})/);
  if (!m) return null;
  const year = m[1].length === 2 ? `20${m[1]}` : m[1];
  return `${year}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

// 눈에 안 보이는 글자(폭 없는 공백)도 지운다
// 두 번 감싼 기호(&#039; 등)가 글자로 남는 게시판도 있어 한 번 더 푼다
const ENTITIES: Record<string, string> = { "&#039;": "'", "&#39;": "'", "&quot;": '"', "&lt;": "<", "&gt;": ">", "&amp;": "&" };
const clean = (text: string) =>
  text.replace(/[​-‍﻿]/g, "").replace(/&(#0?39|quot|lt|gt|amp);/g, (m) => ENTITIES[m]).replace(/\s+/g, " ").trim();

// 감싼 값은 주소에 그대로 넣는다 (이 게시판들은 %3D 같은 주소 인코딩을 풀지 않는다). 끝의 = 채움은 빼도 읽는다
const b64 = (text: string) => Buffer.from(text).toString("base64").replace(/=+$/, "");
const unb64 = (text: string) => Buffer.from(text.replace(/\|+$/, ""), "base64").toString("utf8");

// 상세 주소 (encoded 게시판은 번호를 감싸 넣는다)
export const viewUrlOf = (board: TableBoard, id: string) =>
  board.viewUrl.replace("{id}", board.encoded ? b64(board.encoded.view.replace("{id}", id)) : id);

// "작성자 : 진로취업지원팀", "작성자 [종합교원양성센터]" → 부서 이름만
export const writerName = (text: string) =>
  text
    .replace(/^(작성자|작성부서|담당부서|부서|글쓴이)\s*:?\s*/, "")
    .replace(/^\[(.*)\]$/, "$1")
    .replace(/^[가-힣]{2,4}\s*\((.+)\)$/, "$1") // "담당자 이름(학생지원팀)" → 개인 이름은 남기지 않는다
    .trim();

function boardOf({ source }: CollectContext): TableBoard {
  if (!source.board) throw new Error(`${source.id}: config/schools.json에 "board" 설정이 없음`);
  return source.board;
}

// 목록 한 쪽 (고정 공지는 쪽마다 반복되므로 부르는 쪽에서 번호로 거른다)
async function listPage(ctx: CollectContext, page: number): Promise<ArchivePost[]> {
  const board = boardOf(ctx);
  const listUrl = new URL(ctx.source.url);
  let address: string;
  if (board.encoded) {
    const value = b64(board.encoded.list.replace("{page}", String(page)));
    address = `${listUrl.href}${listUrl.search ? "&" : "?"}${board.encoded.param}=${value}`;
  } else {
    // 쪽 번호 대신 "몇 번째 글부터"(0, 10, 20…)로 넘기는 게시판은 pageOffset(한 쪽 글 수)을 곱한다
    listUrl.searchParams.set(board.pageParam, String(board.pageOffset ? (page - 1) * board.pageOffset : page));
    address = listUrl.href;
  }

  const $ = cheerio.load(await ctx.fetchHtml(address));
  const posts: ArchivePost[] = [];
  for (const a of $(board.link).toArray()) {
    // 번호가 링크 주소가 아닌 다른 속성(onclick="jf_view(...)", data-...)에 있는 게시판은 idAttr로 그 속성을 읽는다
    const href = $(a).attr(board.idAttr ?? "href") ?? "";
    // 주소의 & 앞뒤가 깨져 있어도 번호를 찾도록 글자로 찾는다
    // 번호가 주소 경로에 있으면(idPattern) 그 규칙으로, 아니면 주소의 칸(idParam)에서 찾는다
    const pattern = board.idPattern ?? `[?&]${(board.idParam ?? "").replace(/\./g, "\\.")}=(\\d+)`;
    const target = board.encoded ? unb64(href.match(new RegExp(`[?&]${board.encoded.param}=([^&]+)`))?.[1] ?? "") : href;
    const postId = target.match(new RegExp(pattern))?.[1];
    if (!postId) continue;
    const row = $(a).closest(board.row ?? "tr"); // 카드 모양 목록은 row로 게시물 하나의 범위를 정한다
    posts.push({
      postId,
      // 링크 안에 번호·조회수까지 들어 있는 카드 목록은 listTitle로 제목 칸만 읽는다
      title: clean((board.listTitle ? row.find(board.listTitle).first().text() : "") || $(a).attr("title") || $(a).text()),
      url: viewUrlOf(board, postId),
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
  const title = clean($(board.title).first().text()).replace(/^제목\s*:\s*/, "") || post.title; // "제목 : …" 머리말은 지운다
  if (!title) return null;

  const program = emptyProgram(ctx.school, ctx.source, post.postId, title, post.url);
  const posted = board.date ? $(board.date).first().text() : labeled($, /등록일|일시|작성일/);
  program.postedAt = toIsoDate(posted) ?? post.postedAt;
  // 본문의 그림(글자 대신 이미지로 붙인 공고)은 주소만 기억하고 글자에서는 뺀다 (글자가 거의 없으면 AI가 그림을 읽는다)
  const images = imagesIn($, $(board.content).first(), post.url);
  $(board.content).find("img, script, style").remove();
  return {
    program,
    writer: (board.writer ? writerName(clean($(board.writer).first().text())) : labeled($, /작성자|부서/)) || null,
    text: htmlToText($(board.content).first().html() ?? ""),
    images,
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
      const item = await readPost(ctx, post).catch((error) => {
        if (error instanceof RobotsBlockedError) return null; // robots.txt가 막은 글은 건너뛴다 (fetch.ts가 기록)
        throw error;
      });
      if (item) items.set(post.postId, item);
    }
  }
  return [...items.values()];
};

// 과거 글: since 이후 게시물의 목록을 쪽마다 훑는다 (고정 공지는 쪽마다 반복되므로 번호로 거른다). 본문은 나중에 거른 글만 읽는다
const ARCHIVE_MAX_PAGES = 300; // 끝없이 넘기지 않게 막는 안전장치
export const archiveTableBoard: Archiver = {
  async list(ctx, since) {
    const seen = new Map<string, ArchivePost>();
    for (let page = 1; page <= ARCHIVE_MAX_PAGES; page++) {
      const posts = await listPage(ctx, page);
      const fresh = posts.filter((post) => !seen.has(post.postId));
      if (fresh.length === 0) break; // 마지막 쪽을 넘어가면 같은 글(고정 공지)만 나오거나 빈 쪽이 나온다
      for (const post of fresh) if (!post.postedAt || post.postedAt >= since) seen.set(post.postId, post);
      console.log(`  목록 ${page}쪽 확인 (${fresh.at(-1)?.postedAt ?? "?"})`);
      // 고정 공지 때문에 날짜가 섞일 수 있어, 새로 나온 글이 모두 기준보다 오래되었을 때 멈춘다
      if (fresh.every((post) => post.postedAt && post.postedAt < since)) break;
    }
    return [...seen.values()];
  },
  read: readPost,
};
