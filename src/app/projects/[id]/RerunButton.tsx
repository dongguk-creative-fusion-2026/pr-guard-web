"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { rerunReview } from "../../actions";

export function RerunButton({ projectId, prNumber }: { projectId: number; prNumber: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <span className="row">
      <button
        className="small"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await rerunReview(projectId, prNumber);
            setMessage(r.error ?? r.message ?? null);
            // 새 리뷰의 진행 과정을 바로 보여 준다
            if (r.reviewId) router.push(`/projects/${projectId}/reviews/${r.reviewId}`);
          })
        }
      >
        {pending ? "요청 중…" : "다시 리뷰"}
      </button>
      {message && <span className="notice">{message}</span>}
    </span>
  );
}
