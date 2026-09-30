import type { Metadata } from "next";
import { Header } from "../components/Header.tsx";
import { getLastCollected, getSchools, getSourceNames } from "../lib/data.ts";
import { SITE_NAME } from "../lib/filter.ts";
import { UserProvider } from "../lib/user.tsx";
import "./globals.css";

export const metadata: Metadata = {
  title: SITE_NAME,
  description: "흩어진 대학생 대상 프로그램 정보를 한곳에 모아 태그로 찾아보는 서비스",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <UserProvider>
          <Header schools={getSchools()} />
          <main>{children}</main>
          <footer className="footer">
            <p>
              {getLastCollected() && `${getLastCollected()} 기준 · `}
              출처: {Object.values(getSourceNames()).join(", ")} · 매일 자동으로 모아요
            </p>
            <p>일정과 자격은 자동으로 정리한 정보라 틀릴 수 있어요. 신청 전에 꼭 원문을 확인하세요.</p>
          </footer>
        </UserProvider>
      </body>
    </html>
  );
}
