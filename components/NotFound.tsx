"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EmptyArt } from "./EmptyArt.tsx";

// 없는 주소. 공고 주소라면 다른 공고에 합쳐졌거나(→ 그 공고로 이동) 마감되어 보관됐는지(→ 안내) 찾아본다
// 찾아보는 표는 빌드할 때 scripts/build-api.ts가 public/api/ids.json으로 만든다

interface Ids {
  moved: Record<string, string>;
  archived: Record<string, [title: string, url: string, currentId: string | null]>;
}

export function NotFound() {
  const pathname = usePathname();
  const router = useRouter();
  const [archived, setArchived] = useState<Ids["archived"][string] | null>(null);
  // 404 화면은 미리 한 번만 만들어 두므로, 주소는 브라우저에서 확인한다 (그 전까지는 빈 화면)
  const [id, setId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const id = decodeURIComponent(pathname.match(/^\/programs\/([^/]+)\/?$/)?.[1] ?? "");
    setId(id);
    if (!id) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    fetch("/api/ids.json")
      .then((response) => (response.ok ? (response.json() as Promise<Ids>) : null))
      .then((ids) => {
        if (cancelled) return;
        const moved = ids?.moved[id];
        if (moved) {
          router.replace(`/programs/${moved}`);
          return;
        }
        setArchived(ids?.archived[id] ?? null);
        setChecking(false);
      })
      .catch(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (checking) return <div className="empty" aria-busy="true" />;

  if (archived) {
    const [title, url, currentId] = archived;
    return (
      <div className="empty">
        <p className="empty-title">마감되어 보관된 공고예요</p>
        <p>{title}</p>
        <div className="empty-actions">
          {currentId && (
            <Link href={`/programs/${currentId}`} className="button primary">
              이번 회차 공고 보기
            </Link>
          )}
          {url && (
            <a href={url} target="_blank" rel="noreferrer" className="button">
              원문 보기
            </a>
          )}
          <Link href="/programs" className="button">
            공고 목록
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="empty">
      <EmptyArt />
      <p className="empty-title">{id ? "공고를 찾지 못했어요" : "없는 페이지예요"}</p>
      <p>{id ? "주소가 바뀌었거나 오래되어 정리된 공고예요." : "주소를 다시 확인해 주세요."}</p>
      <div className="empty-actions">
        <Link href="/programs" className="button">
          공고 목록으로
        </Link>
      </div>
    </div>
  );
}
