"use client";

import Link from "next/link";
import { useEffect } from "react";
import { DRAW_COST } from "../lib/gacha.ts";
import { useUser } from "../lib/user.tsx";
import { PixelSprite } from "./PixelPal.tsx";

// 열쇠조각 그림 (보물상자 칸·선물 알림에 같이 쓴다)
const KEY_SHARD = [
  ".KKK......",
  "KYEYK.....",
  "KY.YKKKKKK",
  "KYYYKYYYYK",
  ".KKK.KYKYK",
  "......K.K.",
];

export const KeyShardIcon = ({ scale = 2 }: { scale?: number }) => (
  <span className="key-shard" aria-hidden="true">
    <PixelSprite rows={KEY_SHARD} scale={scale} />
  </span>
);

// 열쇠조각을 받으면 잠깐 띄우는 알림 (하루 첫 접속, 후기 작성). 뽑을 수 있으면 보물상자로 가는 링크
export function KeyGiftToast() {
  const { keyGift, clearKeyGift, keys } = useUser();

  useEffect(() => {
    if (!keyGift) return;
    const timer = setTimeout(clearKeyGift, 4000);
    return () => clearTimeout(timer);
  }, [keyGift, clearKeyGift]);

  if (!keyGift) return null;
  return (
    <div className="toast key-toast" role="status">
      <KeyShardIcon />
      <span>
        {keyGift.reason === "daily" ? "오늘의 접속 선물" : "후기 선물"} · 열쇠조각 +{keyGift.amount}
      </span>
      {keys !== null && keys >= DRAW_COST && (
        <Link href="/my/avatar" className="key-toast-link" onClick={clearKeyGift}>
          상자 열기
        </Link>
      )}
    </div>
  );
}
