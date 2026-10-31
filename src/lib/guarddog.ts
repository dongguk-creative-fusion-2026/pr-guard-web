export type GuardDogStatus = "DISABLED" | "NO_CHANGES" | "COMPLETED" | "PARTIAL" | "FAILED";
export type GuardDogPackageStatus = "COMPLETED" | "PARTIAL" | "FAILED" | "SKIPPED";
export type GuardDogReason =
  | "SOURCE_UNAVAILABLE" | "MANIFEST_ERROR" | "UNSUPPORTED_SPEC" | "DISCOVERY_LIMIT"
  | "PACKAGE_LIMIT" | "TOTAL_TIMEOUT" | "TIMEOUT" | "INTERRUPTED" | "START_FAILED"
  | "EXIT_ERROR" | "OUTPUT_LIMIT" | "MALFORMED_OUTPUT" | "DOWNLOAD_FAILED"
  | "SCANNER_ERRORS" | "EXECUTION_FAILED";

export type GuardDogProblem = { code: GuardDogReason; message: string; file: string | null };
export type GuardDogRisk = { rule: string; severity: "low" | "medium" | "high"; description: string };
export type GuardDogPackage = {
  ecosystem: "npm" | "pypi";
  name: string | null;
  version: string | null;
  files: string[];
  status: GuardDogPackageStatus;
  risks: GuardDogRisk[];
  problems: GuardDogProblem[];
};
export type GuardDogReport = {
  status: GuardDogStatus;
  scope: "NEW_DIRECT_NPM_PYPI";
  counts: { total: number; completed: number; partial: number; failed: number; skipped: number; risks: number };
  packages: GuardDogPackage[];
  problems: GuardDogProblem[];
  durationMs: number;
  requiresAttention: boolean;
};

export const GUARDDOG_STATUS: Record<GuardDogStatus, { label: string; note: string }> = {
  DISABLED: { label: "검사 꺼짐", note: "GuardDog 검사가 꺼져 있어 의존성을 검증하지 않았습니다." },
  NO_CHANGES: { label: "검사 대상 없음", note: "지원 범위에서 새로 추가되거나 버전이 바뀐 직접 의존성이 없습니다." },
  COMPLETED: { label: "검사 완료", note: "수집한 검사 대상의 검증을 모두 마쳤습니다. 위험 신호가 있으면 아래 내용을 확인하세요." },
  PARTIAL: { label: "일부 검사 미완료", note: "일부 의존성을 검증하지 못했습니다. 실패·생략 원인을 확인한 뒤 다시 리뷰하세요." },
  FAILED: { label: "검사 미완료", note: "의존성 검증을 완료하지 못했습니다. 실패·생략 원인을 확인한 뒤 다시 리뷰하세요." },
};

export const GUARDDOG_PACKAGE_STATUS: Record<GuardDogPackageStatus, string> = {
  COMPLETED: "검사 완료", PARTIAL: "일부 미완료", FAILED: "검사 실패", SKIPPED: "건너뜀",
};

export const GUARDDOG_REASON: Record<GuardDogReason, string> = {
  SOURCE_UNAVAILABLE: "소스 확인 실패", MANIFEST_ERROR: "의존성 파일 해석 실패",
  UNSUPPORTED_SPEC: "지원하지 않는 버전 선언", DISCOVERY_LIMIT: "파일 탐색 한도 초과",
  PACKAGE_LIMIT: "패키지 수 한도 초과", TOTAL_TIMEOUT: "전체 검사 시간 초과", TIMEOUT: "검사 시간 초과",
  INTERRUPTED: "검사 중단", START_FAILED: "검사기 실행 실패", EXIT_ERROR: "검사기 비정상 종료",
  OUTPUT_LIMIT: "검사 결과 크기 초과", MALFORMED_OUTPUT: "검사 결과 해석 실패",
  DOWNLOAD_FAILED: "패키지 다운로드 실패", SCANNER_ERRORS: "검사 규칙 오류", EXECUTION_FAILED: "검사 실행 실패",
};

export function guarddogNeedsAttention(report: GuardDogReport | null | undefined): boolean {
  return !!report && (report.requiresAttention || report.status === "PARTIAL" || report.status === "FAILED");
}

/** Older reviews have no report. Prefer the saved context, then the latest completed stage record. */
export function pickGuardDog(
  context: { guarddog?: GuardDogReport | null } | null | undefined,
  events: readonly { stage: string; status: string; data: Record<string, unknown> | null }[],
): GuardDogReport | null {
  if (context?.guarddog) return context.guarddog;
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if ((event.stage === "VERDICT" || event.stage === "CHECK_C") && event.status === "DONE" && event.data?.guarddog) {
      return event.data.guarddog as GuardDogReport;
    }
  }
  return null;
}

/** A scan failure is not a risk finding, but must not be described as ready to merge. */
export function guarddogVerdictLine(verdict: string, report: GuardDogReport | null): string | null {
  if (verdict === "NOT_RECOMMENDED" || !guarddogNeedsAttention(report)) return null;
  return "의존성 검증이 미완료되었습니다. 실패 원인을 확인하고 다시 리뷰하세요.";
}
