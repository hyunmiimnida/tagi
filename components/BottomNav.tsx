"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CalendarIcon, HomeIcon, ListIcon, ProfileIcon } from "./Icons.tsx";
import { actionRows } from "../lib/pixel-pals.ts";
import type { ActionFrame } from "../lib/pixel-pals.ts";
import { useUser } from "../lib/user.tsx";
import { WEAPONS } from "../lib/weapons.ts";
import { MyPal } from "./MyPal.tsx";
import { AmbientEffect } from "./PixelEffect.tsx";
import { PixelSprite } from "./PixelPal.tsx";

const TABS: { href: string; label: string; Icon: typeof HomeIcon; match: (path: string) => boolean }[] = [
  { href: "/", label: "홈", Icon: HomeIcon, match: (path) => path === "/" },
  { href: "/programs", label: "공고", Icon: ListIcon, match: (path) => path.startsWith("/programs") },
  { href: "/calendar", label: "캘린더", Icon: CalendarIcon, match: (path) => path.startsWith("/calendar") },
  { href: "/my", label: "프로필", Icon: ProfileIcon, match: (path) => path.startsWith("/my") },
];

const STEP_MS = 85; // 달리기 다리 번갈아 (StarHelper의 기사 달리기와 같은 빠르기)
const CHASE_MS = 70; // 캐릭터는 바탕보다 조금 늦게 출발해 뒤쫓는다
const LAND_MS = 300; // 도착해 폴짝 앉는 시간

// 옮겨 가는 거리에 따라 걸리는 시간 (가까우면 짧게, 멀어도 너무 길지 않게)
const slideMs = (distance: number) => Math.round(Math.min(620, Math.max(320, 240 + distance * 0.9)));

type Phase = "sit" | "run" | "land";

// 화면 아래에 고정된 탭 바. 지금 탭 아이콘 뒤의 둥근 바탕이 새 탭으로 미끄러지고, 그 위에 앉아 있던 내 캐릭터가
// 일어나 그쪽을 보고 달려가 도착하면 폴짝 앉는다 (기기의 "동작 줄이기"를 켜면 바로 옮겨 간다)
export function BottomNav() {
  const pathname = usePathname();
  const { avatar } = useUser();
  const [pending, setPending] = useState<string | null>(null); // 누른 탭 (화면이 바뀌기 전에 먼저 움직인다)
  const activeIndex = TABS.findIndex((t) => (pending ? t.href === pending : t.match(pathname)));

  // 희귀 이상 무기를 들면 그 무기의 이펙트가 캐릭터 주변을 떠다닌다 (영웅은 더 자주)
  const weapon = avatar ? WEAPONS[avatar.weapon] : null;
  const effect = weapon?.effect ?? null;
  const every = weapon?.grade === "common" || weapon?.grade === "rare" ? 3200 : 1800;

  const nav = useRef<HTMLElement | null>(null);
  const icons = useRef<(HTMLSpanElement | null)[]>([]);
  const [spots, setSpots] = useState<{ x: number; y: number }[]>([]); // 탭마다 아이콘 가운데 x, 아이콘 위 y (탭 바 기준)
  const [ready, setReady] = useState(false); // 처음 자리 잡을 때는 미끄러지지 않게
  const [phase, setPhase] = useState<Phase>("sit");
  const [frame, setFrame] = useState<ActionFrame>("stand");
  const [faceLeft, setFaceLeft] = useState(false);
  const [duration, setDuration] = useState(400);
  const shown = useRef<number>(-1); // 지금 캐릭터가 서 있는 탭

  useEffect(() => {
    if (pending && TABS.find((t) => t.href === pending)?.match(pathname)) setPending(null);
  }, [pathname, pending]);

  const measure = useCallback(() => {
    const box = nav.current?.getBoundingClientRect();
    if (!box) return;
    setSpots(
      icons.current.map((icon) => {
        const r = icon?.getBoundingClientRect();
        return r ? { x: r.left - box.left + r.width / 2, y: r.top - box.top } : { x: 0, y: 0 };
      }),
    );
  }, []);

  useLayoutEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (nav.current) observer.observe(nav.current);
    window.addEventListener("resize", measure);
    const frameId = requestAnimationFrame(() => setReady(true));
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      cancelAnimationFrame(frameId);
    };
  }, [measure]);

  // 탭이 바뀌면: 일어나서(서기) 그쪽을 보고 달려가다 도착하면 폴짝 앉는다
  useEffect(() => {
    const from = shown.current;
    shown.current = activeIndex;
    if (from < 0 || activeIndex < 0 || from === activeIndex || !spots[from] || !spots[activeIndex]) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setPhase("sit");
    const distance = Math.abs(spots[activeIndex].x - spots[from].x);
    const ms = slideMs(distance);
    setDuration(ms);
    setFaceLeft(spots[activeIndex].x < spots[from].x);
    setPhase("run");
    setFrame("stand");
    let step = 0;
    let legs: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      setFrame("runA");
      legs = setInterval(() => setFrame(step++ % 2 ? "runA" : "runB"), STEP_MS);
    }, CHASE_MS);
    const land = setTimeout(() => {
      clearInterval(legs);
      setPhase("land");
    }, CHASE_MS + ms);
    const sit = setTimeout(() => setPhase("sit"), CHASE_MS + ms + LAND_MS);
    return () => {
      clearTimeout(start);
      clearInterval(legs);
      clearTimeout(land);
      clearTimeout(sit);
    };
    // spots가 바뀔 때(화면 크기)는 다시 달리지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  const spot = spots[activeIndex];
  const place = spot ? { transform: `translate3d(${spot.x}px, ${spot.y}px, 0)` } : { visibility: "hidden" as const };
  const moving = ready ? "" : "still";

  return (
    <nav className="bottom-nav" aria-label="주요 메뉴" ref={nav}>
      {activeIndex >= 0 && (
        <span className={`tab-pill ${moving}`} style={{ ...place, transitionDuration: `${duration}ms` }} aria-hidden="true" />
      )}
      {TABS.map(({ href, label, Icon }, i) => {
        const active = i === activeIndex;
        return (
          <Link
            key={href}
            href={href}
            data-hm={`tab${href}`}
            className={`tab ${active ? "active" : ""}`}
            aria-current={active ? "page" : undefined}
            onClick={() => {
              if (!TABS[i].match(pathname)) setPending(href);
            }}
          >
            <span
              className="tab-icon"
              ref={(el) => {
                icons.current[i] = el;
              }}
            >
              <Icon size={24} filled={active} />
            </span>
            <span>{label}</span>
          </Link>
        );
      })}
      {activeIndex >= 0 && avatar && (
        <span
          className={`tab-rider ${moving} ${phase}`}
          style={{ ...place, transitionDuration: `${duration}ms`, transitionDelay: phase === "run" ? `${CHASE_MS}ms` : "0ms" }}
          aria-hidden="true"
        >
          {phase === "run" ? (
            <span className={`tab-runner ${faceLeft ? "flip" : ""} ${frame}`}>
              <PixelSprite rows={actionRows(avatar, frame)} scale={2} />
            </span>
          ) : (
            <MyPal pose="sit" className="tab-pal" />
          )}
          {effect && phase === "sit" && <AmbientEffect key={effect} effect={effect} every={every} />}
        </span>
      )}
    </nav>
  );
}
