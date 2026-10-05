import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "PR Guard",
  description: "사람과 AI가 함께 개발하는 팀의 코드 신뢰성을 확보하는 PR 검증 플랫폼",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <header className="top">
          <Link href="/" className="brand">
            🛡️ PR Guard
          </Link>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
