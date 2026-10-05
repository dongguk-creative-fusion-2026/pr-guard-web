import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "PR Guard",
  description: "AI 생성 코드 PR 리뷰 플랫폼",
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
