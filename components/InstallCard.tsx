"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { canInstall, install, registerServiceWorker, subscribeInstall } from "../lib/pwa.ts";

const HIDE_KEY = "install-card-hidden";
const VISITS_KEY = "visit-count"; // 이 기기에서 사이트를 연 횟수 (창을 새로 열 때마다 1)
const SESSION_KEY = "visit-counted";

// 이번 방문을 세고 지금까지 횟수를 돌려준다
function countVisit(): number {
  try {
    let visits = Number(localStorage.getItem(VISITS_KEY) ?? "0") || 0;
    if (!sessionStorage.getItem(SESSION_KEY)) {
      sessionStorage.setItem(SESSION_KEY, "1");
      visits += 1;
      localStorage.setItem(VISITS_KEY, String(visits));
    }
    return visits;
  } catch {
    return 0;
  }
}

// 오프라인 지원을 켠다. 레이아웃에 한 번만 둔다
export function PwaSetup() {
  useEffect(registerServiceWorker, []);
  return null;
}

// 홈 화면에 추가할 수 있을 때만 보이는 안내 카드 (안드로이드 크롬 등). 처음 온 날에는 숨기고 두 번째 방문부터 보여 준다
// (처음 온 사람의 첫 화면이 안내 카드로 가득 차지 않게)
export function InstallCard() {
  const available = useSyncExternalStore(subscribeInstall, canInstall, () => false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const visits = countVisit();
    try {
      setHidden(localStorage.getItem(HIDE_KEY) === "1" || visits < 2);
    } catch {
      setHidden(true);
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
