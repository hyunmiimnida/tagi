"use client";

import Link from "next/link";
import { useEffect } from "react";
import { DRAW_COST } from "../lib/gacha.ts";
import { useUser } from "../lib/user.tsx";
import { MyPal } from "./MyPal.tsx";
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

const GIFT_NAMES = { welcome: "처음 오신 선물", daily: "오늘의 접속 선물", review: "후기 선물", demo: "체험 모드" } as const;

// 열쇠조각을 받으면 잠깐 띄우는 알림 (하루 첫 접속, 후기 작성). 뽑을 수 있으면 보물상자로 가는 링크.
// 회원가입으로 캐릭터를 처음 받았으면 그 소식을 먼저 (같이 받은 열쇠조각도 한 줄에)
export function KeyGiftToast() {
  const { keyGift, clearKeyGift, keys, avatarGiven, clearAvatarGiven } = useUser();

  useEffect(() => {
    if (!keyGift && !avatarGiven) return;
    const timer = setTimeout(
      () => {
        clearKeyGift();
        clearAvatarGiven();
      },
      avatarGiven ? 6000 : 4000,
    );
    return () => clearTimeout(timer);
  }, [keyGift, avatarGiven, clearKeyGift, clearAvatarGiven]);

  if (avatarGiven) {
    return (
      <div className="toast key-toast" role="status">
        <MyPal pose="sit" scale={1} />
        <span>
          나만의 캐릭터가 생겼어요{keyGift ? ` · 열쇠조각 +${keyGift.amount}` : ""}
        </span>
        <Link
          href="/my/avatar"
          className="key-toast-link"
          onClick={() => {
            clearKeyGift();
            clearAvatarGiven();
          }}
        >
          꾸미기
        </Link>
      </div>
    );
  }
  if (!keyGift) return null;
  return (
    <div className="toast key-toast" role="status">
      <KeyShardIcon />
      <span>
        {GIFT_NAMES[keyGift.reason]} · 열쇠조각 +{keyGift.amount}
      </span>
      {keys !== null && keys >= DRAW_COST && (
        <Link href="/my/avatar" className="key-toast-link" onClick={clearKeyGift}>
          상자 열기
        </Link>
      )}
    </div>
  );
}
