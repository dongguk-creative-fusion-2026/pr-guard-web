// Semgrep 지적은 ruleId 가 모두 SEMGREP 이고, 용도는 제목("Semgrep · 버그 패턴: no-string-eqeq")에,
// 수정 제안은 근거의 마지막 줄("→ Integer.valueOf(5)")에 실려 온다 (pr-guard-api SemgrepScanner).

export const SEMGREP_PURPOSES = ["보안", "버그 패턴", "모범 사례", "팀 규칙", "마이그레이션"] as const;
export type SemgrepPurpose = (typeof SEMGREP_PURPOSES)[number];

const TITLE = /^Semgrep · (보안|버그 패턴|모범 사례|팀 규칙|마이그레이션): (.+)$/;

export type SemgrepInfo = { purpose: SemgrepPurpose; rule: string; fix: string | null };

/** Semgrep 지적이면 용도 · 규칙 이름 · 수정 제안. 아니면 null */
export function semgrepInfo(f: { ruleId?: string | null; title: string; evidence?: string | null }): SemgrepInfo | null {
  if (f.ruleId !== "SEMGREP") return null;
  const m = TITLE.exec(f.title);
  // 용도를 붙이기 전 지적("Semgrep: …")은 보안 검사에서만 나왔다
  const purpose = (m?.[1] as SemgrepPurpose | undefined) ?? "보안";
  const rule = m?.[2] ?? f.title.replace(/^Semgrep:\s*/, "");
  const last = f.evidence?.split("\n").pop() ?? "";
  return { purpose, rule, fix: last.startsWith("→ ") ? last.slice(2) : null };
}

/** 용도별 개수 (0 인 용도는 뺀다) */
export function countByPurpose(infos: SemgrepInfo[]): [SemgrepPurpose, number][] {
  return SEMGREP_PURPOSES.map((p) => [p, infos.filter((i) => i.purpose === p).length] as [SemgrepPurpose, number]).filter(
    ([, n]) => n > 0,
  );
}
