import * as cheerio from "cheerio";
import { emptyProgram } from "../types.ts";
import type { CollectedItem, Collector } from "../types.ts";

// 학교 소식 게시판 수집기.
// 목록에서 새 게시물을 찾고, 상세 페이지 본문 글자만 읽는다 (첨부파일은 받지 않는다).

const PAGE_SIZE = 10;

// 줄바꿈을 살려서 본문 글자만 뽑는다. 표는 한 줄(tr)을 한 줄로 만든다
function htmlToText(html: string): string {
  return cheerio
    .load(
      html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
        .replace(/<\/(td|th)>/gi, " "),
    )
    .text()
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

function toIsoDate(text: string): string | null {
  const m = text.match(/(\d{4})\.(\d{2})\.(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export const collectNewsBoard: Collector = async ({ school, source, fetchHtml, isKnown }) => {
  const items = new Map<string, CollectedItem>();

  for (let page = 0; page < (source.pages ?? 3); page++) {
    const listUrl = new URL(source.url);
    listUrl.searchParams.set("mode", "list");
    listUrl.searchParams.set("articleLimit", String(PAGE_SIZE));
    listUrl.searchParams.set("article.offset", String(page * PAGE_SIZE));

    const $ = cheerio.load(await fetchHtml(listUrl.href));
    const rows = $(".b-title-box a[href*='articleNo=']").toArray();
    if (rows.length === 0) {
      if (page === 0) throw new Error("목록에서 게시물을 찾지 못함 (사이트 구조가 바뀌었을 수 있음)");
      break;
    }

    for (const a of rows) {
      const postId = new URL($(a).attr("href")!, listUrl).searchParams.get("articleNo");
      if (!postId) continue;

      const viewUrl = new URL(source.url);
      viewUrl.searchParams.set("mode", "view");
      viewUrl.searchParams.set("articleNo", postId);
      if (isKnown(viewUrl.href) || items.has(postId)) continue;

      const detail = cheerio.load(await fetchHtml(viewUrl.href));
      const title = detail(".b-main-box .b-title").first().text().replace(/\s+/g, " ").trim();
      if (!title) continue;

      const program = emptyProgram(school, source, postId, title, viewUrl.href);
      program.postedAt = toIsoDate(detail(".b-date-box span").last().text());
      items.set(postId, {
        program,
        writer: detail(".b-writer-box span").last().text().trim() || null,
        text: htmlToText(detail(".b-content-box .fr-view").html() ?? ""),
      });
    }
  }

  return [...items.values()];
};
