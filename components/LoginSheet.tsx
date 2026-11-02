"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { LOGIN_PROVIDERS, useUser } from "../lib/user.tsx";
import { CloseIcon } from "./Icons.tsx";

// 로그인 버튼 그림과 색은 각 회사 가이드를 따른다 (docs/자산-권리.md). 모양·색을 바꾸지 않는다
const KakaoSymbol = () => (
  <svg width="18" height="18" viewBox="61.5 16.5 13 13" aria-hidden="true">
    <path
      fill="#000"
      d="M68.001 16.5225C64.4222 16.5225 61.5225 19.0037 61.5225 22.0641C61.5225 24.0312 62.7219 25.7596 64.5292 26.7423L63.9181 29.2113C63.8954 29.285 63.9132 29.364 63.9619 29.4184C63.9975 29.457 64.0461 29.478 64.0931 29.478C64.1337 29.478 64.1742 29.464 64.2082 29.4341L66.834 27.5144C67.2117 27.5723 67.6007 27.6039 67.9994 27.6039C71.5767 27.6039 74.478 25.1226 74.478 22.0623C74.478 19.002 71.5783 16.5225 68.001 16.5225Z"
    />
  </svg>
);

const GoogleSymbol = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

// 화면 아래에서 올라오는 로그인 창. 머리말 밖(본문 맨 끝)에 두어야 화면 전체를 덮는다
export function LoginSheet() {
  const user = useUser();
  const { loginOpen, setLoginOpen } = user;
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loginOpen) return;
    // 키보드로 쓰는 사람을 위해: 열리면 창 안으로 초점을 옮기고, Tab은 창 안에서만 돌며, 닫히면 원래 자리로 돌려 놓는다
    const opener = document.activeElement as HTMLElement | null;
    const buttons = () => [...(sheetRef.current?.querySelectorAll<HTMLElement>("button, a[href]") ?? [])];
    buttons()[1]?.focus(); // 닫기 버튼 다음의 첫 로그인 버튼

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLoginOpen(false);
      if (event.key !== "Tab") return;
      const list = buttons();
      const first = list[0];
      const last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [loginOpen, setLoginOpen]);

  if (!loginOpen) return null;

  return (
    <div className="overlay" onClick={() => setLoginOpen(false)}>
      <div
        ref={sheetRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="로그인"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="icon-button sheet-close" onClick={() => setLoginOpen(false)} aria-label="닫기">
          <CloseIcon size={20} />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" width={48} height={48} className="sheet-logo" />
        <h2>간편하게 시작하기</h2>
        <p>관심 공고를 저장하고 마감 일정을 캘린더로 모아 보세요.</p>
        {LOGIN_PROVIDERS.map((provider) => (
          <button key={provider.id} className={`login-button ${provider.id}`} onClick={() => user.signIn(provider.id)}>
            {provider.id === "kakao" ? <KakaoSymbol /> : <GoogleSymbol />}
            {provider.id === "kakao" ? "카카오 로그인" : "Google로 계속하기"}
          </button>
        ))}
        <p className="sheet-legal">
          로그인하면{" "}
          <Link href="/terms" onClick={() => setLoginOpen(false)}>
            이용약관
          </Link>
          에 동의하고{" "}
          <Link href="/privacy" onClick={() => setLoginOpen(false)}>
            개인정보처리방침
          </Link>
          을 확인한 것으로 봅니다. 만 14세 미만은 가입할 수 없어요.
        </p>
      </div>
    </div>
  );
}
