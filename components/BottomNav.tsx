"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarIcon, HomeIcon, ListIcon, ProfileIcon } from "./Icons.tsx";
import { useUser } from "../lib/user.tsx";
import { WEAPONS } from "../lib/weapons.ts";
import { MyPal } from "./MyPal.tsx";
import { AmbientEffect } from "./PixelEffect.tsx";

const TABS: { href: string; label: string; Icon: typeof HomeIcon; match: (path: string) => boolean }[] = [
  { href: "/", label: "홈", Icon: HomeIcon, match: (path) => path === "/" },
  { href: "/programs", label: "공고", Icon: ListIcon, match: (path) => path.startsWith("/programs") },
  { href: "/calendar", label: "캘린더", Icon: CalendarIcon, match: (path) => path.startsWith("/calendar") },
  { href: "/my", label: "프로필", Icon: ProfileIcon, match: (path) => path.startsWith("/my") },
];

// 화면 아래에 고정된 탭 바. 내 캐릭터가 지금 탭 아이콘 위에 걸터앉아 있다가 탭을 바꾸면 따라간다
export function BottomNav() {
  const pathname = usePathname();
  const { avatar } = useUser();
  // 희귀 이상 무기를 들면 그 무기의 이펙트가 캐릭터 주변을 떠다닌다 (영웅은 더 자주)
  const weapon = avatar ? WEAPONS[avatar.weapon] : null;
  const effect = weapon?.effect ?? null;
  const every = weapon?.grade === "common" || weapon?.grade === "rare" ? 3200 : 1800;

  return (
    <nav className="bottom-nav" aria-label="주요 메뉴">
      {TABS.map(({ href, label, Icon, match }) => {
        const active = match(pathname);
        return (
          <Link key={href} href={href} className={`tab ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
            <span className="tab-icon">
              {active && <MyPal pose="sit" className="tab-pal" />}
              {active && effect && <AmbientEffect key={effect} effect={effect} every={every} />}
              <Icon size={24} filled={active} />
            </span>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
