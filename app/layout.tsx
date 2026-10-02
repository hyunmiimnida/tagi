import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { BottomNav } from "../components/BottomNav.tsx";
import { Header } from "../components/Header.tsx";
import { PwaSetup } from "../components/InstallCard.tsx";
import { LoginSheet } from "../components/LoginSheet.tsx";
import { SiteNotice } from "../components/SiteNotice.tsx";
import { describeSources, getCollectedBySchool } from "../lib/data.ts";
import { SITE_NAME, SITE_URL } from "../lib/filter.ts";
import { SITE_VERIFICATION } from "../lib/policy.ts";
import { UserProvider } from "../lib/user.tsx";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: "학교 공지, 취업, 대외활동 정보를 한곳에 모아 태그로 찾아보는 대학생 정보 서비스",
  openGraph: { siteName: SITE_NAME, locale: "ko_KR", type: "website" },
  // 검색엔진 소유 확인 (lib/policy.ts에 코드를 넣었을 때만)
  verification: {
    ...(SITE_VERIFICATION.google && { google: SITE_VERIFICATION.google }),
    ...(SITE_VERIFICATION.naver && { other: { "naver-site-verification": SITE_VERIFICATION.naver } }),
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f4f6" },
    { media: "(prefers-color-scheme: dark)", color: "#101113" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const collected = getCollectedBySchool();
  return (
    <html lang="ko">
      <head>
        {/* 한글이 깔끔하게 보이는 프리텐다드 글꼴 */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>
        <UserProvider>
          <Header />
          <main>
            <SiteNotice />
            {children}
          </main>
          <footer className="footer">
            <p>{describeSources()}에서 매일 모아요</p>
            {/* 학교마다 출처 중 가장 오래전에 성공한 시각. 한 곳이라도 수집이 멈추면 드러난다 */}
            {collected.length > 0 && (
              <p>
                마지막 수집:{" "}
                {collected.map(({ school, at, stale }, i) => (
                  <span key={school} className={stale ? "stale" : undefined}>
                    {i > 0 && " · "}
                    {school} {at}
                    {stale && " (수집이 멈췄어요)"}
                  </span>
                ))}
              </p>
            )}
            <p>일정과 자격은 자동으로 정리한 정보라 틀릴 수 있어요. 신청 전에 꼭 원문을 확인하세요.</p>
            <p className="footer-links">
              <Link href="/terms">이용약관</Link>
              <Link href="/privacy">
                <strong>개인정보처리방침</strong>
              </Link>
            </p>
          </footer>
          <BottomNav />
          <LoginSheet />
          <PwaSetup />
        </UserProvider>
      </body>
    </html>
  );
}
