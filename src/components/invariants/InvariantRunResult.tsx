import { invariantRunMessage, type InvariantRun } from "@/lib/invariants";

export function InvariantRunResult({ run, pollError, onRetry }: {
  run: InvariantRun; pollError: string | null; onRetry: () => void;
}) {
  return <div aria-live="polite">
    <h3>Hypothesis 실행 결과</h3>
    <p>{invariantRunMessage(run)}</p>
    <p>base {run.baseSha.slice(0, 7)} / head {run.headSha.slice(0, 7)}</p>
    {run.runUrl && <a href={run.runUrl} target="_blank" rel="noreferrer">GitHub Actions 실행 보기</a>}
    {run.result?.error && <p role="alert">{run.result.error}</p>}
    {run.result?.input && <pre>{JSON.stringify({ input: run.result.input, base: run.result.base, head: run.result.head }, null, 2)}</pre>}
    <p>이 결과는 현재 머지 판정에 반영되지 않습니다.</p>
    {pollError && <><p role="alert">{pollError}</p><button type="button" onClick={onRetry}>결과 조회 재시도</button></>}
  </div>;
}
