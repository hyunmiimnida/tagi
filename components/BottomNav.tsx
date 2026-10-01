"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarIcon, HomeIcon, ListIcon, ProfileIcon } from "./Icons.tsx";

const TABS = [
  { href: "/", label: "홈", Icon: HomeIcon, match: (path: string) => path === "/" },
  { href: "/programs", label: "공고", Icon: ListIcon, match: (path: string) => path.startsWith("/programs") },
  { href: "/calendar", label: "캘린더", Icon: CalendarIcon, match: (path: string) => path.startsWith("/calendar") },
  { href: "/my", label: "프로필", Icon: ProfileIcon, match: (path: string) => path.startsWith("/my") },
];

// 화면 아래에 고정된 탭 바
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav" aria-label="주요 메뉴">
      {TABS.map(({ href, label, Icon, match }) => {
        const active = match(pathname);
        return (
          <Link key={href} href={href} className={`tab ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
            <Icon size={24} filled={active} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
