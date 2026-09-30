import type { Metadata } from "next";
import { Header } from "../components/Header.tsx";
import { getSchools } from "../lib/data.ts";
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
        </UserProvider>
      </body>
    </html>
  );
}
