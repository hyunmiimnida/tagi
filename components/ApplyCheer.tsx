"use client";

import { useEffect, useRef, useState } from "react";
import { MyPal } from "./MyPal.tsx";

// 상세 화면 아래 "원문에서 신청하기"를 누르면 내 캐릭터가 버튼 위로 폴짝 올라와 몸을 흔들며 배웅한다 (신청하러 가는 걸 응원).
// 버튼 묶음(.cta) 안에 두면 그 안의 링크 누름을 듣는다. 장식이라 눌리지 않고, 동작 줄이기면 나오지 않는다
export function ApplyCheer() {
  const anchor = useRef<HTMLSpanElement | null>(null);
  const [play, setPlay] = useState(0);

  useEffect(() => {
    const box = anchor.current?.closest(".cta");
    if (!box) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onClick = (event: Event) => {
      if (!(event.target as Element).closest("a")) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      setPlay((n) => n + 1);
      clearTimeout(timer);
      timer = setTimeout(() => setPlay(0), 1600);
    };
    box.addEventListener("click", onClick);
    return () => {
      box.removeEventListener("click", onClick);
      clearTimeout(timer);
    };
  }, []);

  return (
    <span ref={anchor} className="cheer-anchor" aria-hidden="true">
      {play > 0 && (
        <span key={play} className="cheer">
          <MyPal pose="sit" scale={2} />
          <span className="equip-flash plain cheer-twinkle">
            <i />
          </span>
        </span>
      )}
    </span>
  );
}
