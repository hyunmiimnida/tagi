import type { MetadataRoute } from "next";
import { getPrograms } from "../lib/data.ts";
import { SITE_URL } from "../lib/filter.ts";

// 검색엔진에게 알려 주는 페이지 목록: 홈, 공고 목록, 공고 상세 전체
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: SITE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/programs`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    ...getPrograms().map((program) => ({
      url: `${SITE_URL}/programs/${program.id}`,
      lastModified: new Date(program.firstSeenAt ?? program.collectedAt),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
