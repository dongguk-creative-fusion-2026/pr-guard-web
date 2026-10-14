"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { HomeLink, StatusScreen } from "./StatusScreen";

/**
 * error.tsx 공용 본문. 서버 컴포넌트 오류는 배포 환경에서 메시지가 가려지고 digest 만 오므로
 * 원인은 일반 문구로 말하고, 서버 로그에서 찾을 수 있게 digest 를 보여 준다.
 */
export function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const dev = process.env.NODE_ENV !== "production";
  return (
    <StatusScreen
      tone="danger"
      title="화면을 불러오지 못했습니다"
      detail={
        <>
          백엔드(pr-guard-api)가 응답하지 않거나 요청이 실패했습니다. 잠시 뒤 다시 시도하세요.
          {dev && error.message && <code className="status-code">{error.message}</code>}
          {error.digest && <small className="status-digest">오류 ID {error.digest}</small>}
        </>
      }
    >
      <button
        className="primary"
        disabled={pending}
        onClick={() =>
          // reset 만으로는 서버 컴포넌트를 다시 가져오지 않는다
          start(() => {
            router.refresh();
            reset();
          })
        }
      >
        {pending ? "다시 불러오는 중…" : "다시 시도"}
      </button>
      <HomeLink />
    </StatusScreen>
  );
}
