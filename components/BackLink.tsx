"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export const LIST_QUERY_KEY = "lastListQuery";

// 마지막으로 본 목록의 필터(?tag=...)로 돌아간다
export function BackLink() {
  const [href, setHref] = useState("/");

  useEffect(() => {
    try {
      setHref(`/${sessionStorage.getItem(LIST_QUERY_KEY) ?? ""}`);
    } catch {
      // 저장소를 못 쓰면 전체 목록으로
    }
  }, []);

  return (
    <Link href={href} className="muted small">
      ← 목록으로
    </Link>
  );
}
