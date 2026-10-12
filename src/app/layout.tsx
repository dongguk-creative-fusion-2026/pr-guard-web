import type { Metadata } from "next";
import { JetBrains_Mono, Noto_Sans_KR } from "next/font/google";
import "./globals.css";

// 한글 본문은 Noto Sans KR, 코드 · 해시 · 경로는 JetBrains Mono
const sans = Noto_Sans_KR({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "PR Guard",
  description: "AI 생성 코드 PR 리뷰 플랫폼",
};

/** 상단 바는 화면마다 다르다: 홈은 브랜드만, 프로젝트 안은 PR 이력 · 커밋 이력 전환 (projects/[id]/layout.tsx) */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className={`${sans.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
