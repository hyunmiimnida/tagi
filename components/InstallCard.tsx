"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { canInstall, install, registerServiceWorker, subscribeInstall } from "../lib/pwa.ts";

const HIDE_KEY = "install-card-hidden";

// 오프라인 지원을 켠다. 레이아웃에 한 번만 둔다
export function PwaSetup() {
  useEffect(registerServiceWorker, []);
  return null;
}

// 홈 화면에 추가할 수 있을 때만 보이는 안내 카드 (안드로이드 크롬 등)
export function InstallCard() {
  const available = useSyncExternalStore(subscribeInstall, canInstall, () => false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      setHidden(localStorage.getItem(HIDE_KEY) === "1");
    } catch {
      setHidden(false);
    }
  }, []);

  if (!available || hidden) return null;

  const close = () => {
    setHidden(true);
    try {
      localStorage.setItem(HIDE_KEY, "1");
    } catch {}
  };

  return (
    <section className="section install-card">
      <div>
        <strong>홈 화면에 추가하기</strong>
        <p>앱처럼 바로 열고, 인터넷이 끊겨도 마지막으로 본 공고를 볼 수 있어요.</p>
      </div>
      <div className="install-actions">
        <button className="text-button" onClick={close}>
          닫기
        </button>
        <button className="pill-button" onClick={install}>
          추가
        </button>
      </div>
    </section>
  );
}
