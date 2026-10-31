import { invariantRunMessage, type InvariantRun } from "@/lib/invariants";

export function InvariantRunResult({ run, currentHead, pollError, onRetry }: {
  run: InvariantRun; currentHead: string; pollError: string | null; onRetry: () => void;
}) {
  return <div className="dv-card" aria-live="polite">
    <h3>Hypothesis · 최근 불변식 검증</h3>
    <p>{invariantRunMessage(run)}</p>
    {currentHead && run.headSha !== currentHead && <p role="status">이 결과는 이전 PR 커밋의 결과입니다. 현재 커밋을 검증하려면 다시 실행하세요.</p>}
    <p>base {run.baseSha.slice(0, 7)} / head {run.headSha.slice(0, 7)}</p>
    {run.createdAt && <p>실행 요청: {new Date(run.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p>}
    {run.runUrl && <a href={run.runUrl} target="_blank" rel="noreferrer">GitHub Actions 실행 보기</a>}
    {run.result?.error && <p role="alert">{run.result.error}</p>}
    {run.result?.input && <pre>{JSON.stringify({ input: run.result.input, base: run.result.base, head: run.result.head }, null, 2)}</pre>}
    <p>이 결과는 현재 머지 판정에 반영되지 않습니다.</p>
    {pollError && <><p role="alert">{pollError}</p><button type="button" onClick={onRetry}>결과 조회 재시도</button></>}
  </div>;
}
