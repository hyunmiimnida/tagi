"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PalName } from "../lib/pixel-pals.ts";
import { PixelPal } from "./PixelPal.tsx";

// 관심 표시(☆)를 누르면 도트 캐릭터가 뛰어나와 별을 톡 누르고 제자리로 돌아간다.
//   1) 그 카드 위에서 빼꼼하던 캐릭터(화면에 보일 때) 또는 아래 탭 바의 캐릭터가 출발
//   2) 별 옆에 폴짝 착지 → 톡 누르면 별이 노랗게 바뀌며 반짝(onTap, components/FavoriteButton.tsx)
//   3) 원래 자리로 폴짝 복귀
// 기기의 "동작 줄이기"가 켜져 있거나 이미 한 명이 다녀오는 중이면 캐릭터 없이 바로 별이 켜진다 (false를 돌려준다)

type Start = (button: HTMLElement, onTap: () => void) => boolean;
let start: Start | null = null;

export function requestStarHelper(button: HTMLElement, onTap: () => void): boolean {
  return start ? start(button, onTap) : false;
}

const SCALE = 2;
const WIDTH = 16 * SCALE; // 앉은 자세 그림 크기 (32×34)
const HEIGHT = 17 * SCALE;
const OUT_MS = 420; // 날아가기
const TAP_MS = 260; // 톡 누르기
const BACK_MS = 420; // 돌아오기

interface Trip {
  name: PalName;
  source: SVGElement;
  from: { x: number; y: number };
  to: { x: number; y: number };
  onTap: () => void;
}

// 화면(머리말과 아래 탭 바 사이)에 보이는지
function onScreen(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.bottom > 56 && r.top < window.innerHeight - 64;
}

export function StarHelper() {
  const [trip, setTrip] = useState<Trip | null>(null);
  const busy = useRef(false);
  const flyer = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    start = (button, onTap) => {
      if (busy.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
      const wallPal = button.closest(".pal-wall")?.querySelector<SVGElement>(".pal-peek-anchor svg[data-pal]");
      const source = wallPal && onScreen(wallPal) ? wallPal : document.querySelector<SVGElement>(".tab-pal[data-pal]");
      const name = source?.dataset.pal as PalName | undefined;
      if (!source || !name) return false;
      const s = source.getBoundingClientRect();
      const b = button.getBoundingClientRect();
      // 별 왼쪽에 서서 손이 별에 닿게 (왼쪽 공간이 없으면 오른쪽)
      const left = b.left - WIDTH + 8 >= 4 ? b.left - WIDTH + 8 : b.right - 8;
      busy.current = true;
      source.style.visibility = "hidden";
      setTrip({ name, source, from: { x: s.left, y: s.bottom - HEIGHT }, to: { x: left, y: b.bottom - HEIGHT }, onTap });
      return true;
    };
    return () => {
      start = null;
    };
  }, []);

  useLayoutEffect(() => {
    const el = flyer.current;
    if (!trip || !el) return;
    const dx = trip.to.x - trip.from.x;
    const dy = trip.to.y - trip.from.y;
    const peak = Math.min(dy, 0) - 36; // 포물선 꼭대기 (위로 폴짝)
    const at = (x: number, y: number) => ({ transform: `translate(${x}px, ${y}px)` });
    let cancelled = false;
    const finish = () => {
      trip.source.style.visibility = "";
      busy.current = false;
      setTrip(null);
    };
    (async () => {
      await el.animate([at(0, 0), at(dx * 0.5, peak), at(dx, dy)], { duration: OUT_MS, easing: "ease-in-out", fill: "forwards" }).finished;
      if (cancelled) return;
      trip.onTap();
      await el.animate([at(dx, dy), at(dx + 3, dy + 1), at(dx, dy)], { duration: TAP_MS, easing: "steps(3, end)", fill: "forwards" }).finished;
      if (cancelled) return;
      await el.animate([at(dx, dy), at(dx * 0.5, peak), at(0, 0)], { duration: BACK_MS, easing: "ease-in-out", fill: "forwards" }).finished;
      if (!cancelled) finish();
    })().catch(() => {
      // 애니메이션이 중간에 멈춰도(화면 이동 등) 별은 켜고 캐릭터는 제자리로
      trip.onTap();
      finish();
    });
    return () => {
      cancelled = true;
      trip.source.style.visibility = "";
      busy.current = false;
    };
  }, [trip]);

  if (!trip) return null;
  return (
    <div ref={flyer} className="star-helper" style={{ left: trip.from.x, top: trip.from.y }} aria-hidden="true">
      <PixelPal name={trip.name} pose="sit" scale={SCALE} />
    </div>
  );
}
