"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useUser } from "../lib/user.tsx";

const HIDE_KEY = "profile-nudge-hidden";

// 홈 위쪽 안내: 학교·신분·관심 분야를 하나도 고르지 않았으면 공고 화면의 필터로 이어 준다 (닫으면 다시 안 보인다).
// 공고 화면에서 고른 학교·대상·분야는 기억되어 다음에도 그대로 걸린다 (components/Explorer.tsx)
export function ProfileNudge() {
  const { ready, schoolId, profile } = useUser();
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      setHidden(localStorage.getItem(HIDE_KEY) === "1");
    } catch {
      setHidden(false);
    }
  }, []);

  const empty = schoolId === null && profile.status === null && profile.interests.length === 0;
  if (!ready || !empty || hidden) return null;

  const close = () => {
    setHidden(true);
    try {
      localStorage.setItem(HIDE_KEY, "1");
    } catch {}
  };

  return (
    <section className="section install-card">
      <div>
        <strong>나에게 맞는 공고만 보기</strong>
        <p>공고 화면에서 학교·대상·분야를 고르면 기억해 두고 목록과 홈을 맞춰 드려요.</p>
      </div>
      <div className="install-actions">
        <button className="text-button" onClick={close}>
          닫기
        </button>
        <Link href="/programs" className="pill-button">
          고르기
        </Link>
      </div>
    </section>
  );
}
