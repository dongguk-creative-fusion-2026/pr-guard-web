"use client";

import { useState, useTransition } from "react";
import { saveInvariantSettings, compileInvariantRules } from "@/app/actions";
import type { InvariantInterpretation } from "@/lib/invariants";
import { useInvariantRun } from "@/components/invariants/useInvariantRun";
import { InvariantRunResult } from "@/components/invariants/InvariantRunResult";

export default function InvariantSettings({ projectId, number, initialRules, projectRules }: {
  projectId: number; number: number; initialRules: string; projectRules: string;
}) {
  const [rules, setRules] = useState(initialRules);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const [interpretation, setInterpretation] = useState<InvariantInterpretation | null>(null);
  const execution = useInvariantRun(projectId, number);

  function loadProjectRules() {
    if (rules.trim() && !window.confirm("이 PR에 입력한 규칙을 프로젝트 기본 규칙으로 바꿀까요?")) return;
    setRules(projectRules);
    setInterpretation(null);
    setNotice("프로젝트 규칙을 불러왔습니다. 저장하면 이 PR에 적용됩니다.");
    setError(false);
  }

  return (
    <section className="invariant-settings" aria-labelledby="invariant-settings-title">
      <h2 id="invariant-settings-title">이 PR의 데이터 정합성 규칙</h2>
      <p>해석된 규칙과 조건을 확인한 뒤 테스트를 실행하세요. 현재 실제 실행은 pr-guard-sandbox의 게시글 작성자 ID 보존 규칙을 지원하며 Spring 서비스와 H2 테스트 DB에서 검증합니다.</p>
      {projectRules && <button type="button" disabled={pending} onClick={loadProjectRules}>프로젝트 규칙 불러오기</button>}
      <label htmlFor="invariant-rules">규칙 초안</label>
      <textarea id="invariant-rules" value={rules} maxLength={4000} rows={4} disabled={pending}
        placeholder="예: 게시글 수정 전후 작성자 ID는 같아야 한다"
        onChange={(event) => { setRules(event.target.value); setNotice(""); setInterpretation(null); }} />
      <button type="button" disabled={pending || !rules.trim()} onClick={() => startTransition(async () => {
        setInterpretation(null);
        const result = await compileInvariantRules(projectId, number, rules);
        setError(Boolean(result.error));
        setNotice(result.error ?? "");
        setInterpretation(result.interpretation ?? null);
      })}>규칙 후보 생성</button>{" "}
      <button type="button" disabled={pending} onClick={() => startTransition(async () => {
        const result = await saveInvariantSettings(projectId, number, rules);
        setError(Boolean(result.error));
        setNotice(result.error ?? result.message ?? "");
      })}>{pending ? "저장 중…" : "규칙 저장"}</button>
      {notice && <p role={error ? "alert" : "status"}>{notice}</p>}
      {interpretation && <div aria-live="polite">
        <p>{interpretation.engine.startsWith("openai:") ? "AI 해석 · 검토 필요" : "API 키 미설정 · 기본 템플릿 해석"}</p>
        {interpretation.candidates.length === 0 && <p>해석할 규칙을 찾지 못했습니다. 유지할 관계와 적용 조건을 구체적으로 적어주세요.</p>}
        {interpretation.candidates.map((candidate, index) => <div key={index}>
          <h3>{candidate.status === "UNSUPPORTED" ? "지원하지 않는 규칙" : `규칙 후보 ${index + 1}`}</h3>
          <p>{candidate.message}</p>
          {candidate.status !== "UNSUPPORTED" && <dl>
            <dt>검증할 관계</dt><dd>{candidate.property}</dd>
            <dt>적용 조건</dt><dd>{candidate.precondition || "명시되지 않음 · 확인 필요"}</dd>
          </dl>}
          {candidate.status === "CANDIDATE" && <div>
            <p>실제 실행: 작성자의 수정 요청을 Spring 서비스에 전달하고, DB 작성자 ID가 전후 동일한지 확인합니다. 입력은 1~20자 영숫자 제목·내용이며 HTTP 인증은 검증하지 않습니다.</p>
            <button type="button" disabled={pending || execution.active}
            onClick={() => startTransition(async () => {
              const response = await execution.start(candidate);
              setError(Boolean(response.error)); setNotice(response.error ?? "테스트를 시작했습니다.");
            })}>위 조건으로 Hypothesis 테스트 실행</button></div>}
          {candidate.status === "NEEDS_REVIEW" && <p>이 규칙은 아직 실행 어댑터가 없어 테스트할 수 없습니다.</p>}
        </div>)}
      </div>}
      {execution.run && <InvariantRunResult run={execution.run} pollError={execution.pollError} onRetry={execution.retry} />}
    </section>
  );
}
