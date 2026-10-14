"use client";

import { ErrorScreen } from "@/components/ErrorScreen";

/** 프로젝트 안 화면의 오류: 상단 바(layout)는 그대로 두고 본문 자리에만 보여 준다 */
export default function ProjectError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen error={error} reset={reset} />;
}
