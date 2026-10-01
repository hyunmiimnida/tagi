"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronIcon } from "./Icons.tsx";

export const LIST_QUERY_KEY = "lastListQuery";

// 마지막으로 본 공고 목록의 필터(?tag=...)로 돌아간다
export function BackLink() {
  const [href, setHref] = useState("/programs");

  useEffect(() => {
    try {
      setHref(`/programs${sessionStorage.getItem(LIST_QUERY_KEY) ?? ""}`);
    } catch {
      // 저장소를 못 쓰면 전체 목록으로
    }
  }, []);

  return (
    <Link href={href} className="back-link">
      <ChevronIcon dir="left" size={20} />
      공고 목록
    </Link>
  );
}
