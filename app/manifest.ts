import type { MetadataRoute } from "next";
import { SITE_NAME } from "../lib/filter.ts";

// 휴대폰 "홈 화면에 추가" 정보. 추가하면 주소창 없이 앱처럼 열린다
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: "학교 공지, 취업, 대외활동 정보를 한곳에 모아 태그로 찾아보는 대학생 정보 서비스",
    lang: "ko",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f2f4f6",
    theme_color: "#f2f4f6",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
