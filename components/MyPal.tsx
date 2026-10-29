"use client";

import type { PalBubble, PalPose } from "../lib/pixel-pals.ts";
import { useUser } from "../lib/user.tsx";
import { PeekPal, PixelPal } from "./PixelPal.tsx";

// 내 캐릭터 (lib/user.tsx의 avatar). 화면 곳곳에서 같은 캐릭터 한 명이 같이 다닌다.
// 브라우저에서 내 캐릭터를 읽기 전(미리 만든 화면)에는 그리지 않는다 (다른 캐릭터가 잠깐 보였다 바뀌지 않게)

export function MyPal(props: { pose: PalPose; scale?: number; delay?: number; bubble?: PalBubble; className?: string }) {
  const { avatar } = useUser();
  return avatar ? <PixelPal who={avatar} {...props} /> : null;
}

export function MyPeekPal(props: { right?: number; delay?: number; searching?: boolean }) {
  const { avatar } = useUser();
  return avatar ? <PeekPal who={avatar} {...props} /> : null;
}
