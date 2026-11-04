"use client";

import { useEffect, useState } from "react";

// 창을 닫을 때 바로 없애지 않고 닫히는 모션(.closing, app/globals.css)이 끝난 뒤 없앤다.
// 기기의 "동작 줄이기"가 켜져 있으면 바로 없앤다. 쓰는 법: const { mounted, closing } = useExit(open)
export const EXIT_MS = 200;

export function useExit(open: boolean, ms = EXIT_MS): { mounted: boolean; closing: boolean } {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(() => setMounted(false), reduce ? 0 : ms);
    return () => clearTimeout(timer);
  }, [open, ms]);
  return { mounted: open || mounted, closing: !open && mounted };
}
