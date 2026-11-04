"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { track } from "../lib/analytics.ts";
import { heatmapPage } from "../lib/research.ts";

// 화면 열기·공고 상세 열기·원문(신청) 누르기와 히트맵(누른 위치)을 기록한다. 아무것도 그리지 않는다.
// 히트맵은 정해 둔 화면(lib/research.ts의 HEATMAP_PAGES)에서만, 위치는 화면 너비 대비 비율과 문서 위에서의 px,
// 눌린 요소는 가장 가까운 data-hm 이름만 남긴다 (글자 내용은 남기지 않는다)
export function Analytics() {
  const pathname = usePathname();
  const last = useRef<string | null>(null); // 같은 화면을 두 번 세지 않게 (개발 모드는 effect를 두 번 부른다)

  useEffect(() => {
    if (last.current === pathname) return;
    last.current = pathname;
    track("page_view");
    const detail = pathname.match(/^\/programs\/([^/]+)$/);
    if (detail) track("program_open", { id: decodeURIComponent(detail[1]) });
  }, [pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (target.closest(".cta a")) track("apply_click");
      const page = heatmapPage(window.location.pathname);
      if (!page) return;
      track("click", {
        page,
        device: window.innerWidth < 640 ? "m" : "d",
        x: Math.round((event.clientX / window.innerWidth) * 1000) / 1000,
        y: Math.round(event.pageY),
        el: target.closest("[data-hm]")?.getAttribute("data-hm") ?? null,
      });
    };
    document.addEventListener("click", onClick, { capture: true, passive: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}
