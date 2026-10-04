"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { PalName } from "../lib/pixel-pals.ts";
import { PAL_CHEER_EVENT } from "../lib/user.tsx";
import { CalendarIcon, HomeIcon, ListIcon, ProfileIcon } from "./Icons.tsx";
import { PixelPal } from "./PixelPal.tsx";

// pal: 그 탭을 맡은 도트 캐릭터 (지금 탭 아이콘 위에 걸터앉는다)
const TABS: { href: string; label: string; Icon: typeof HomeIcon; pal: PalName; match: (path: string) => boolean }[] = [
  { href: "/", label: "홈", Icon: HomeIcon, pal: "wizard", match: (path) => path === "/" },
  { href: "/programs", label: "공고", Icon: ListIcon, pal: "knight", match: (path) => path.startsWith("/programs") },
  { href: "/calendar", label: "캘린더", Icon: CalendarIcon, pal: "cleric", match: (path) => path.startsWith("/calendar") },
  { href: "/my", label: "프로필", Icon: ProfileIcon, pal: "ranger", match: (path) => path.startsWith("/my") },
];

// 화면 아래에 고정된 탭 바
export function BottomNav() {
  const pathname = usePathname();
  // 관심 표시(☆)를 누르면 지금 탭 캐릭터가 하트 말풍선을 띄우고 폴짝 (다시 그려서 뛰는 동작을 처음부터)
  const [cheer, setCheer] = useState(0);
  const [cheering, setCheering] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onCheer = () => {
      setCheer((n) => n + 1);
      setCheering(true);
      clearTimeout(timer);
      timer = setTimeout(() => setCheering(false), 1400);
    };
    window.addEventListener(PAL_CHEER_EVENT, onCheer);
    return () => {
      window.removeEventListener(PAL_CHEER_EVENT, onCheer);
      clearTimeout(timer);
    };
  }, []);

  return (
    <nav className="bottom-nav" aria-label="주요 메뉴">
      {TABS.map(({ href, label, Icon, pal, match }) => {
        const active = match(pathname);
        return (
          <Link key={href} href={href} className={`tab ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
            <span className="tab-icon">
              {active && (
                <PixelPal key={cheer} name={pal} pose="sit" bubble={cheering ? "heart" : undefined} className="tab-pal" />
              )}
              <Icon size={24} filled={active} />
            </span>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
