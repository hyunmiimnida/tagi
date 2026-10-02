import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/filter.ts";

// 검색엔진 안내: 모든 페이지를 볼 수 있고, 개인 화면(프로필)과 관리자 화면은 빼 달라고 한다
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/my", "/admin"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
