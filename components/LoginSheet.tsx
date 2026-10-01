"use client";

import { useEffect, useRef } from "react";
import { LOGIN_PROVIDERS, useUser } from "../lib/user.tsx";
import { CloseIcon } from "./Icons.tsx";

// 화면 아래에서 올라오는 로그인 창. 머리말 밖(본문 맨 끝)에 두어야 화면 전체를 덮는다
export function LoginSheet() {
  const user = useUser();
  const { loginOpen, setLoginOpen } = user;
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loginOpen) return;
    // 키보드로 쓰는 사람을 위해: 열리면 창 안으로 초점을 옮기고, Tab은 창 안에서만 돌며, 닫히면 원래 자리로 돌려 놓는다
    const opener = document.activeElement as HTMLElement | null;
    const buttons = () => [...(sheetRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
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
        <h2>3초 만에 시작하기</h2>
        <p>관심 공고를 저장하고 마감 일정을 캘린더로 모아 보세요.</p>
        {LOGIN_PROVIDERS.map((provider) => (
          <button key={provider.id} className={`login-button ${provider.id}`} onClick={() => user.signIn(provider.id)}>
            {provider.name}로 계속하기
          </button>
        ))}
      </div>
    </div>
  );
}
