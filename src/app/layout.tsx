import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PR Guard",
  description: "AI 생성 코드 PR 리뷰 플랫폼",
};

/** 상단 바는 화면마다 다르다: 홈은 브랜드만, 프로젝트 안은 PR 이력 · 커밋 이력 전환 (projects/[id]/layout.tsx) */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
