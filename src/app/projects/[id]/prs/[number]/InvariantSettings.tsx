"use client";

import { useState, useTransition } from "react";
import { saveInvariantSettings, compileInvariantRules, suggestInvariantRules } from "@/app/actions";
import type { InvariantInterpretation, InvariantSuggestions, InvariantRun } from "@/lib/invariants";
import { useInvariantRun } from "@/components/invariants/useInvariantRun";
import { InvariantRunResult } from "@/components/invariants/InvariantRunResult";

export default function InvariantSettings({ projectId, number, initialRules, projectRules, initialRun, currentHead, runLoadError }: {
  projectId: number; number: number; initialRules: string; projectRules: string;
  initialRun: InvariantRun | null; currentHead: string; runLoadError: boolean;
}) {
  const [rules, setRules] = useState(initialRules);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const [interpretation, setInterpretation] = useState<InvariantInterpretation | null>(null);
  const [suggestions, setSuggestions] = useState<InvariantSuggestions | null>(null);
  const execution = useInvariantRun(projectId, number, initialRun);

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
      {execution.run ? <InvariantRunResult run={execution.run} currentHead={currentHead} pollError={execution.pollError} onRetry={execution.retry} />
        : <div className="dv-card"><h3>Hypothesis · 최근 불변식 검증</h3>
          <p>{runLoadError ? "최근 실행 결과를 불러오지 못했습니다. API 상태를 확인한 뒤 새로고침하세요." : "아직 실행된 불변식 검증이 없습니다."}</p></div>}
      <p>해석된 규칙과 조건을 확인한 뒤 테스트를 실행하세요. 현재 실제 실행은 pr-guard-sandbox의 게시글 작성자 ID 보존 규칙을 지원하며 Spring 서비스와 H2 테스트 DB에서 검증합니다.</p>
      <p>PR 코드에서 규칙을 제안할 때 변경 코드와 관련 테스트 일부가 설정된 OpenAI API로 전송됩니다.</p>
      <button type="button" disabled={pending} onClick={() => startTransition(async () => {
        setSuggestions(null);
        const result = await suggestInvariantRules(projectId, number);
        setError(Boolean(result.error)); setNotice(result.error ?? "");
        setSuggestions(result.suggestions ?? null);
      })}>PR 코드에서 규칙 제안</button>
      {suggestions && <div className="invariant-results" aria-live="polite">
        <p>분석한 커밋: {suggestions.headSha.slice(0, 7)} · AI 후보는 기존 동작을 근거로 한 제안이므로 직접 확인하세요.</p>
        {suggestions.limited && <p>파일 크기 또는 수 제한으로 일부 내용이 제외됐습니다.</p>}
        <details><summary>분석에 사용한 파일 ({suggestions.files.length})</summary><ul>{suggestions.files.map((file, index) => <li key={index}>{file}</li>)}</ul></details>
        {suggestions.interpretation.candidates.length === 0 && <p>제안할 규칙을 찾지 못했습니다.</p>}
        {suggestions.interpretation.candidates.map((candidate, index) => <div className="invariant-candidate" key={index}>
          <h3>제안 {index + 1}</h3><p>{candidate.property}</p><p>적용 조건: {candidate.precondition || "확인 필요"}</p><p>{candidate.message}</p>
          <button type="button" onClick={() => {
            setRules([candidate.property, candidate.precondition].filter(Boolean).join(" · "));
            setInterpretation(null); setNotice("규칙 초안에 복사했습니다. 확인 후 후보를 생성하세요."); setError(false);
          }}>규칙 초안에 사용</button>
        </div>)}
      </div>}
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
      {interpretation && <div className="invariant-results" aria-live="polite">
        <p>{interpretation.engine.startsWith("openai:") ? "AI 해석 · 검토 필요" : "API 키 미설정 · 기본 템플릿 해석"}</p>
        {interpretation.candidates.length === 0 && <p>해석할 규칙을 찾지 못했습니다. 유지할 관계와 적용 조건을 구체적으로 적어주세요.</p>}
        {interpretation.candidates.map((candidate, index) => <div className="invariant-candidate" key={index}>
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
    </section>
  );
}
