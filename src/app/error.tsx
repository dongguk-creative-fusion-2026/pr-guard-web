"use client";

import Link from "next/link";
import { ErrorScreen } from "@/components/ErrorScreen";
import { Logo } from "@/components/Logo";

/** 홈 · 프로젝트 틀(layout) 에서 난 오류. 프로젝트 안 화면의 오류는 projects/[id]/error.tsx 가 상단 바 아래에서 받는다 */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <>
      <header className="pbar">
        <Link href="/" className="pbar-brand">
          <Logo /> PR Guard
        </Link>
      </header>
      <ErrorScreen error={error} reset={reset} />
    </>
  );
}
