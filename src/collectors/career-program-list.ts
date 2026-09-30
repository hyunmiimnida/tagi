import * as cheerio from "cheerio";
import { emptyProgram } from "../types.ts";
import type { CollectedItem, Collector, Period } from "../types.ts";

// 진로취업 프로그램 목록 수집기.
// 상세 페이지는 로그인이 필요하므로 공개된 목록 정보만 수집한다.

const TABS = ["in", "out"]; // 진행중, 접수마감 (종료된 프로그램은 수집하지 않음)

function parsePeriod(text: string): Period {
  const dates = text.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
  return { start: dates[0] ?? null, end: dates[1] ?? dates[0] ?? null };
}

export const collectCareerProgramList: Collector = async ({ school, source, fetchHtml }) => {
  const items = new Map<string, CollectedItem>();

  for (const tab of TABS) {
    for (let page = 1; page <= (source.pages ?? 10); page++) {
      const pageUrl = new URL(source.url);
      pageUrl.searchParams.set("programIng", tab);
      pageUrl.searchParams.set("page", String(page));

      const $ = cheerio.load(await fetchHtml(pageUrl.href));
      let found = 0;

      for (const el of $(".program_list .program_con").toArray()) {
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

        const program = emptyProgram(school, source, postId, title, link.href);
        if (periods["접수기간"]) program.recruitPeriod = periods["접수기간"];
        if (periods["프로그램일자"]) program.activityPeriod = periods["프로그램일자"];
        // 상세 페이지는 로그인이 필요해서 목록의 정보만 AI에 넘긴다
        const text = item.find(".period").map((_, p) => $(p).text().trim()).get().join("\n");
        items.set(program.id, { program, writer: null, text });
      }

      const hasNextPage = $(`.paging a[href*="page=${page + 1}&"]`).length > 0;
      if (found === 0 || !hasNextPage) break;
    }
  }

  if (items.size === 0) throw new Error("목록에서 프로그램을 찾지 못함 (사이트 구조가 바뀌었을 수 있음)");
  return [...items.values()];
};
