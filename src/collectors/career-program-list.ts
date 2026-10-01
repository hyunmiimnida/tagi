import * as cheerio from "cheerio";
import { emptyProgram } from "../types.ts";
import type { Archiver, CollectContext, CollectedItem, Collector, Period } from "../types.ts";

// 진로취업 프로그램 목록 수집기.
// 상세 페이지는 로그인이 필요하므로 공개된 목록 정보만 수집한다.

const TABS = ["in", "out"]; // 진행중, 접수마감
const ARCHIVE_TAB = "end"; // 종료된 프로그램 (과거 글 수집에서만 읽는다)

function parsePeriod(text: string): Period {
  const dates = text.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
  return { start: dates[0] ?? null, end: dates[1] ?? dates[0] ?? null };
}

// 한 탭의 목록을 쪽마다 읽는다. stop이 true를 돌려주면 다음 쪽을 읽지 않는다
async function readTab(
  { school, source, fetchHtml }: CollectContext,
  tab: string,
  maxPages: number,
  stop?: (pageItems: CollectedItem[]) => boolean,
): Promise<CollectedItem[]> {
  const items: CollectedItem[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const pageUrl = new URL(source.url);
    pageUrl.searchParams.set("programIng", tab);
    pageUrl.searchParams.set("page", String(page));

    const $ = cheerio.load(await fetchHtml(pageUrl.href));
    const pageItems: CollectedItem[] = [];

    for (const el of $(".program_list .program_con").toArray()) {
      const item = $(el);
      const href = item.find(".con a").attr("href");
      const title = item.find(".pro_title").text().trim();
      if (!href || !title) continue; // 빈 칸

      const link = new URL(href, pageUrl);
      const postId = link.searchParams.get("P_IDX");
      if (!postId) continue;

      const periods: Record<string, Period> = {};
      item.find(".period").each((_, p) => {
        const [label, ...rest] = $(p).text().split(":");
        periods[label.trim()] = parsePeriod(rest.join(":"));
      });

      const program = emptyProgram(school, source, postId, title, link.href);
      if (periods["접수기간"]) program.recruitPeriod = periods["접수기간"];
      if (periods["프로그램일자"]) program.activityPeriod = periods["프로그램일자"];
      // 상세 페이지는 로그인이 필요해서 목록의 정보만 AI에 넘긴다
      const text = item.find(".period").map((_, p) => $(p).text().trim()).get().join("\n");
      pageItems.push({ program, writer: null, text });
    }

    items.push(...pageItems);
    const hasNextPage = $(`.paging a[href*="page=${page + 1}&"]`).length > 0;
    if (pageItems.length === 0 || !hasNextPage || stop?.(pageItems)) break;
  }
  return items;
}

export const collectCareerProgramList: Collector = async (ctx) => {
  const items = new Map<string, CollectedItem>();
  for (const tab of TABS) {
    for (const item of await readTab(ctx, tab, ctx.source.pages ?? 10)) items.set(item.program.id, item);
  }
  if (items.size === 0) throw new Error("목록에서 프로그램을 찾지 못함 (사이트 구조가 바뀌었을 수 있음)");
  return [...items.values()];
};

const startOf = (item: CollectedItem) => item.program.recruitPeriod.start ?? item.program.activityPeriod.start;

// 과거 글: 종료 탭을 since까지 읽는다. 목록에 정보가 다 있으므로 상세는 읽지 않는다
export const archiveCareerProgramList: Archiver = {
  async list(ctx, since) {
    const items = await readTab(ctx, ARCHIVE_TAB, 500, (page) => page.every((item) => (startOf(item) ?? since) < since));
    return items
      .filter((item) => (startOf(item) ?? since) >= since)
      .map((item) => ({
        postId: item.program.id,
        title: item.program.title,
        url: item.program.links[0].url,
        postedAt: item.program.recruitPeriod.start,
        item,
      }));
  },
};
