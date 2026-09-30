import * as cheerio from "cheerio";
import type { Collector, Period, Program } from "../types.ts";

// 진로취업 프로그램 목록 수집기.
// 상세 페이지는 로그인이 필요하므로 공개된 목록 정보만 수집한다.

const TABS = ["in", "out"]; // 진행중, 접수마감 (종료된 프로그램은 수집하지 않음)
const MAX_PAGES = 10;

function parsePeriod(text: string): Period {
  const dates = text.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
  return { start: dates[0] ?? null, end: dates[1] ?? dates[0] ?? null };
}

export const collectCareerProgramList: Collector = async ({ school, source, fetchHtml }) => {
  const programs = new Map<string, Program>();

  for (const tab of TABS) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const pageUrl = new URL(source.url);
      pageUrl.searchParams.set("programIng", tab);
      pageUrl.searchParams.set("page", String(page));

      const $ = cheerio.load(await fetchHtml(pageUrl.href));
      const items = $(".program_list .program_con").toArray();
      let found = 0;

      for (const el of items) {
        const item = $(el);
        const href = item.find(".con a").attr("href");
        const title = item.find(".pro_title").text().trim();
        if (!href || !title) continue; // 빈 칸

        const link = new URL(href, pageUrl);
        const postId = link.searchParams.get("P_IDX");
        if (!postId) continue;
        found++;

        const periods: Record<string, Period> = {};
        item.find(".period").each((_, p) => {
          const [label, ...rest] = $(p).text().split(":");
          periods[label.trim()] = parsePeriod(rest.join(":"));
        });

        const id = `${source.id}:${postId}`;
        programs.set(id, {
          id,
          title,
          organizer: null, // 목록에는 주최 정보가 없음
          organizerType: null,
          target: { schools: [school.id], colleges: [], departments: [], grades: [] },
          recruitPeriod: periods["접수기간"] ?? { start: null, end: null },
          activityPeriod: periods["프로그램일자"] ?? { start: null, end: null },
          tags: [],
          links: [{ sourceId: source.id, url: link.href }],
          sources: [source.id],
          collectedAt: new Date().toISOString(),
        });
      }

      const hasNextPage = $(`.paging a[href*="page=${page + 1}&"]`).length > 0;
      if (found === 0 || !hasNextPage) break;
    }
  }

  return [...programs.values()];
};
