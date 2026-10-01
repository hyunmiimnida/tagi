import { OG_SIZE, renderCard } from "../lib/og.tsx";
import { describeSources } from "../lib/data.ts";

// 사이트 기본 공유 미리보기 이미지
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "캠퍼스모아 — 대학생 공고를 한곳에서";

export default function Image() {
  return renderCard({
    badges: ["대학생 공고 모음"],
    title: "학교 공지·취업·대외활동, 흩어진 공고를 한곳에서",
    lines: [`${describeSources()}에서 매일 모아요`],
  });
}
