"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useUser } from "../lib/user.tsx";

const HIDE_KEY = "profile-nudge-hidden";

// 홈 위쪽 안내: 학교는 골랐지만 대상(신분·학년)·관심 분야를 아직 안 골랐으면 공고 화면의 필터로 이어 준다 (닫으면 다시 안 보인다).
// 학교를 아직 안 골랐을 때는 홈 머리말이 "대학교를 설정해 보세요"로 대신 묻는다 (같은 부탁을 두 번 하지 않게).
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

  const needsMore = schoolId !== null && profile.status === null && profile.interests.length === 0;
  if (!ready || !needsMore || hidden) return null;

  const close = () => {
    setHidden(true);
    try {
      localStorage.setItem(HIDE_KEY, "1");
    } catch {}
  };

  return (
    <section className="section install-card">
      <div>
        <strong>학년·관심 분야도 골라 보세요</strong>
        <p>공고 화면에서 대상과 분야를 고르면 기억해 두고, 홈에 내 관심 분야 공고를 모아 드려요.</p>
      </div>
      <div className="install-actions">
        <button className="text-button" onClick={close}>
          닫기
        </button>
        <Link href="/programs?pick=school" className="pill-button">
          고르기
        </Link>
      </div>
    </section>
  );
}
