/** Shared contracts used by server API calls and client-side invariant views. */
export type InvariantCandidate = {
  status: "CANDIDATE" | "UNSUPPORTED" | "NEEDS_REVIEW";
  source: string;
  ruleId: string | null;
  version: number;
  property: string | null;
  precondition: string | null;
  adapter: string | null;
  message: string;
};

export type InvariantInterpretation = { engine: string; candidates: InvariantCandidate[] };

export type InvariantRun = {
  id: string;
  status: "QUEUED" | "RUNNING" | "DONE" | "FAILED";
  headSha: string;
  baseSha: string;
  runUrl?: string | null;
  result?: {
    status: string;
    error?: string;
    input?: { title: string; content: string };
    base?: { author_before: number; author_after: number }[];
    head?: { author_before: number; author_after: number }[];
    database?: string;
    target?: string;
  } | null;
};

export function isInvariantActive(run: InvariantRun | null): boolean {
  return run?.status === "QUEUED" || run?.status === "RUNNING";
}

const RESULT_MESSAGES: Record<string, string> = {
  new_violation: "동일 반례에서 base 통과 · head 위반",
  existing_violation: "base와 head 모두 위반",
  flaky: "재현 결과 불일치",
  no_counterexample: "head의 100개 탐색 예산에서 반례 미발견 · base 재생은 수행하지 않음 · 안전성 증명은 아닙니다",
  execution_error: "실행 실패 · 검증 결과 없음",
};

export function invariantRunMessage(run: InvariantRun): string {
  if (run.status === "QUEUED") return "GitHub Actions 실행을 기다리고 있습니다.";
  if (run.status === "RUNNING") return "GitHub Actions에서 PR 코드를 빌드하고 입력을 탐색하는 중입니다. 수 분 걸릴 수 있습니다.";
  return RESULT_MESSAGES[run.result?.status ?? ""] ?? "결과 확인 필요";
}
