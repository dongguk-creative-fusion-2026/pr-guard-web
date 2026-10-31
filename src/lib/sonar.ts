// SonarCloud 결과 (pr-guard-api SonarService). head 러너가 테스트 뒤에 스캔하고 EXEC_SONAR 단계에 지표 · Gate 를 싣는다.
// 지적은 ruleId SONAR_ISSUE(추가한 줄의 이슈) · SONAR_GATE(Quality Gate 실패)로 오고, 근거 마지막 줄이 SonarCloud 링크다.

type FindingLike = { ruleId?: string | null; evidence?: string | null };

export function isSonar(f: FindingLike): boolean {
  return f.ruleId === "SONAR_ISSUE" || f.ruleId === "SONAR_GATE";
}

/** 지적 근거에 실린 SonarCloud 화면 주소 (이슈 · 대시보드) */
export function sonarLink(f: FindingLike): string | null {
  if (!isSonar(f) || !f.evidence) return null;
  return f.evidence.split("\n").find((l) => l.startsWith("https://")) ?? null;
}

/** 근거에서 링크 줄을 뺀 나머지 (규칙 · 유형 · 심각도) */
export function sonarEvidence(f: FindingLike): string | null {
  if (!f.evidence) return null;
  const rest = f.evidence
    .split("\n")
    .filter((l) => !l.startsWith("https://"))
    .join("\n")
    .trim();
  return rest || null;
}

/** 화면에 보여 줄 지표와 이름. 순서대로 그린다 */
export const SONAR_METRICS: { key: string; label: string; unit?: string }[] = [
  { key: "new_coverage", label: "새 코드 커버리지", unit: "%" },
  { key: "new_duplicated_lines_density", label: "새 코드 중복률", unit: "%" },
  { key: "new_lines", label: "새 코드 줄" },
  { key: "new_bugs", label: "새 버그" },
  { key: "new_vulnerabilities", label: "새 취약점" },
  { key: "new_code_smells", label: "새 코드 냄새" },
  { key: "new_security_hotspots", label: "새 보안 핫스팟" },
  { key: "coverage", label: "전체 커버리지", unit: "%" },
  { key: "duplicated_lines_density", label: "전체 중복률", unit: "%" },
  { key: "cognitive_complexity", label: "인지 복잡도" },
  { key: "ncloc", label: "코드 줄 수" },
];

/** Quality Gate 조건 metricKey 를 사람이 읽는 이름으로 ("new_coverage 62.5 (기준 LT 80)" 앞부분) */
export function metricLabel(key: string): string {
  const known = SONAR_METRICS.find((m) => m.key === key);
  if (known) return known.label;
  const ratings: Record<string, string> = {
    new_reliability_rating: "새 코드 신뢰성 등급",
    new_security_rating: "새 코드 보안 등급",
    new_maintainability_rating: "새 코드 유지보수성 등급",
    new_security_hotspots_reviewed: "검토한 보안 핫스팟",
  };
  return ratings[key] ?? key;
}

export type SonarStage = {
  status: "DONE" | "FAILED" | "SKIPPED" | "RUNNING";
  message: string | null;
  data: SonarData | null;
};

export type SonarData = {
  projectKey?: string;
  url?: string;
  gate?: string;
  failedConditions?: string[];
  measures?: Record<string, string>;
  issues?: number;
  findings?: { severity: string; title: string; file: string | null; line: number | null; category: string }[];
  ms?: number;
};

/** 리뷰 단계 기록에서 SonarCloud 단계의 마지막 상태. 단계가 없던 리뷰면 null */
export function sonarStage(events: { stage: string; status: string; message?: string | null; data: Record<string, unknown> | null }[]): SonarStage | null {
  const e = [...events].reverse().find((x) => x.stage === "EXEC_SONAR");
  if (!e) return null;
  return { status: e.status as SonarStage["status"], message: e.message ?? null, data: (e.data as SonarData | null) ?? null };
}
