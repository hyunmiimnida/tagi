"use client";

import Link from "next/link";
import { SITE_NAME } from "../lib/filter.ts";
import { useUser } from "../lib/user.tsx";

// 학교 선택은 공고 화면의 "학교" 필터에 있다
export function Header() {
  const user = useUser();

  return (
    <header className="header">
      <div className="header-inner">
        <Link href="/" className="logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" width={26} height={26} />
          {SITE_NAME}
        </Link>
        <div className="header-right">
          {!user.loginEnabled ? (
            <span className="trial-label" title="로그인이 설정되지 않아 관심 표시가 이 브라우저에만 저장돼요">
              체험 모드
            </span>
          ) : user.signedIn ? (
            <button className="text-button" onClick={user.signOut} title={user.email ?? undefined}>
              로그아웃
            </button>
          ) : (
            <button className="pill-button" onClick={() => user.setLoginOpen(true)}>
              로그인
            </button>
          )}
        </div>
      </div>

    </header>
  );
}
