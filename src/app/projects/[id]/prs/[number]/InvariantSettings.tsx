"use client";

import { useState, useTransition } from "react";
import { saveInvariantSettings } from "@/app/actions";

export default function InvariantSettings({ projectId, number, initialRules }: {
  projectId: number; number: number; initialRules: string;
}) {
  const [rules, setRules] = useState(initialRules);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <section className="invariant-settings" aria-labelledby="invariant-settings-title">
      <h2 id="invariant-settings-title">이 PR의 데이터 정합성 규칙</h2>
      <p>검증하고 싶은 규칙을 적어두세요. 현재는 저장만 가능하며 리뷰에 자동 적용되거나 실행되지 않습니다.</p>
      <label htmlFor="invariant-rules">규칙 초안</label>
      <textarea id="invariant-rules" value={rules} maxLength={4000} rows={4} disabled={pending}
        placeholder="예: 게시글 수정 전후 작성자 ID는 같아야 한다"
        onChange={(event) => { setRules(event.target.value); setNotice(""); }} />
      <button type="button" disabled={pending} onClick={() => startTransition(async () => {
        const result = await saveInvariantSettings(projectId, number, rules);
        setError(Boolean(result.error));
        setNotice(result.error ?? result.message ?? "");
      })}>{pending ? "저장 중…" : "규칙 저장"}</button>
      {notice && <p role={error ? "alert" : "status"}>{notice}</p>}
    </section>
  );
}
