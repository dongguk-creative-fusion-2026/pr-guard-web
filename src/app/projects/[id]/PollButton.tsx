"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { pollNow } from "../../actions";

/** 상단 바의 "지금 확인": 열린 PR 을 바로 조회하고 결과를 잠깐 보여 준다 */
export function PollButton({ projectId }: { projectId: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  return (
    <span className="pbar-poll">
      {note && <span className="muted">{note}</span>}
      <button
        className="small"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await pollNow(projectId);
            setNote(r.error ?? r.message ?? null);
            router.refresh();
          })
        }
      >
        {pending ? "확인 중…" : "지금 확인"}
      </button>
    </span>
  );
}
