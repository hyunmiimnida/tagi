"use client";

import Link from "next/link";
import { SITE_NAME } from "../lib/filter.ts";
import { LOGIN_PROVIDERS, useUser } from "../lib/user.tsx";

export function Header({ schools }: { schools: { id: string; name: string }[] }) {
  const user = useUser();

  return (
    <header className="header">
      <Link href="/" className="logo">
        {SITE_NAME}
      </Link>
      <nav>
        <Link href="/">목록</Link>
        <Link href="/calendar">내 캘린더</Link>
      </nav>
      <div className="header-right">
        <select
          aria-label="학교 설정"
          value={user.schoolId ?? ""}
          onChange={(event) => user.setSchool(event.target.value || null)}
        >
          <option value="">전체 학교</option>
          {schools.map((school) => (
            <option key={school.id} value={school.id}>
              {school.name}
            </option>
          ))}
        </select>
        {!user.loginEnabled ? (
          <span className="muted small">체험 모드</span>
        ) : user.signedIn ? (
          <button className="button" onClick={user.signOut} title={user.email ?? undefined}>
            로그아웃
          </button>
        ) : (
          <button className="button" onClick={() => user.setLoginOpen(true)}>
            로그인
          </button>
        )}
      </div>

      {user.loginOpen && (
        <div className="overlay" onClick={() => user.setLoginOpen(false)}>
          <div className="dialog" role="dialog" aria-label="로그인" onClick={(event) => event.stopPropagation()}>
            <h2>로그인</h2>
            <p className="muted">관심 표시와 내 캘린더는 로그인 후 쓸 수 있어요.</p>
            {LOGIN_PROVIDERS.map((provider) => (
              <button key={provider.id} className="button wide" onClick={() => user.signIn(provider.id)}>
                {provider.name}로 계속하기
              </button>
            ))}
            <button className="link-button" onClick={() => user.setLoginOpen(false)}>
              닫기
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
