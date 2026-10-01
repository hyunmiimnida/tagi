import type { Metadata, Viewport } from "next";
import { BottomNav } from "../components/BottomNav.tsx";
import { Header } from "../components/Header.tsx";
import { PwaSetup } from "../components/InstallCard.tsx";
import { LoginSheet } from "../components/LoginSheet.tsx";
import { getLastCollected, getSourceNames } from "../lib/data.ts";
import { SITE_NAME } from "../lib/filter.ts";
import { UserProvider } from "../lib/user.tsx";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: "학교 공지, 취업, 대외활동 정보를 한곳에 모아 태그로 찾아보는 대학생 정보 서비스",
  openGraph: { siteName: SITE_NAME, locale: "ko_KR", type: "website" },
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
  const lastCollected = getLastCollected();
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
          <main>{children}</main>
          <footer className="footer">
            <p>
              {lastCollected && `${lastCollected} 기준 · `}
              {Object.values(getSourceNames()).join(", ")}에서 매일 모아요
            </p>
            <p>일정과 자격은 자동으로 정리한 정보라 틀릴 수 있어요. 신청 전에 꼭 원문을 확인하세요.</p>
          </footer>
          <BottomNav />
          <LoginSheet />
          <PwaSetup />
        </UserProvider>
      </body>
    </html>
  );
}
