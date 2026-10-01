"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useUser } from "../lib/user.tsx";

// 지난 관심 공고: 관심 표시했지만 마감이 오래 지나 보관함으로 간 공고.
// 지금 목록(programs)에 없는 관심 id가 있을 때만 public/api/ids.json(보관함 찾아보기 표)을 받아 제목·원문·이번 회차를 보여 준다

type Archived = [title: string, url: string, currentId: string | null];

export function PastFavorites({ listedIds }: { listedIds: Set<string> }) {
  const user = useUser();
  const missing = [...user.favorites].filter((id) => !listedIds.has(id));
  const missingKey = missing.sort().join(",");
  const [found, setFound] = useState<[string, Archived][]>([]);

  useEffect(() => {
    if (!missingKey) {
      setFound([]);
      return;
    }
    let cancelled = false;
    fetch("/api/ids.json")
      .then((response) => (response.ok ? (response.json() as Promise<{ archived: Record<string, Archived> }>) : null))
      .then((ids) => {
        if (cancelled || !ids) return;
        setFound(missingKey.split(",").flatMap((id) => (ids.archived[id] ? [[id, ids.archived[id]] as [string, Archived]] : [])));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [missingKey]);

  if (found.length === 0) return null;

  return (
    <section className="section">
      <div className="section-head">
        <h2>지난 관심 공고</h2>
      </div>
      <p className="section-empty">마감된 지 오래되어 보관함으로 옮겨진 공고예요.</p>
      <ul className="rows">
        {found.map(([id, [title, url, currentId]]) => (
          <li key={id} className="row">
            <div className="row-body">
              <span className="row-title">{title}</span>
              <div className="past-actions">
                {currentId && <Link href={`/programs/${currentId}`}>이번 회차 보기</Link>}
                {url && (
                  <a href={url} target="_blank" rel="noreferrer">
                    원문 보기
                  </a>
                )}
                <button className="text-button" onClick={() => user.toggleFavorite(id)}>
                  관심 해제
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
