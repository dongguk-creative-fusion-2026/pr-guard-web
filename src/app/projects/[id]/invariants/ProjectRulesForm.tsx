"use client";

import { useState, useTransition } from "react";
import { saveProjectInvariantSettings } from "@/app/actions";

export default function ProjectRulesForm({ projectId, initialRules }: { projectId: number; initialRules: string }) {
  const [rules, setRules] = useState(initialRules);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  return <section className="invariant-settings">
    <label htmlFor="project-rules">기본 규칙</label>
    <textarea id="project-rules" rows={6} maxLength={4000} value={rules} disabled={pending}
      placeholder="예: 게시글 수정 전후 작성자 ID는 같아야 한다"
      onChange={(event) => { setRules(event.target.value); setNotice(""); }} />
    <button type="button" disabled={pending} onClick={() => startTransition(async () => {
      const result = await saveProjectInvariantSettings(projectId, rules);
      setError(Boolean(result.error)); setNotice(result.error ?? result.message ?? "");
    })}>{pending ? "저장 중…" : "규칙 저장"}</button>
    {notice && <p role={error ? "alert" : "status"}>{notice}</p>}
  </section>;
}
