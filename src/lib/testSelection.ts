import type { TestRun, TestSelection } from "./api";

/** 테스트 케이스 이름(a.FooTest$Inner#m) → 최상위 테스트 클래스(a.FooTest). 백엔드 TestSelector.topLevelOfTrace 와 같다 */
export function topLevelClass(name: string): string {
  const type = name.includes("#") ? name.slice(0, name.indexOf("#")) : name;
  return type.includes("$") ? type.slice(0, type.indexOf("$")) : type;
}

export function simpleName(fqn: string): string {
  return fqn.slice(fqn.lastIndexOf(".") + 1);
}

export function packageOf(fqn: string): string {
  return fqn.includes(".") ? fqn.slice(0, fqn.lastIndexOf(".")) : "";
}

/** 한 쪽(base · head)에서 테스트 클래스 하나의 결과 */
export type SideResult = { passed: number; failed: number; skipped: number; seconds: number };

/** 실행이 끝난 뒤 테스트 클래스별 결과 */
export type ClassResult = {
  base: SideResult | null;
  head: SideResult | null;
  /** base 통과 → head 실패 */
  regressions: string[];
  /** 새로 생긴 테스트가 head 에서 실패 */
  newFailures: string[];
};

function sideResults(run: TestRun | undefined): Record<string, SideResult> {
  const out: Record<string, SideResult> = {};
  for (const c of run?.results ?? []) {
    const k = topLevelClass(c.name);
    const r = (out[k] ??= { passed: 0, failed: 0, skipped: 0, seconds: 0 });
    if (c.status === "PASSED") r.passed++;
    else if (c.status === "SKIPPED") r.skipped++;
    else r.failed++;
    r.seconds += c.time ?? 0;
  }
  return out;
}

export function classResults(
  runs: TestRun[],
  diff: { regressions?: string[]; newFailures?: string[] } | null,
): Record<string, ClassResult> {
  const base = sideResults(runs.find((r) => r.side === "BASE"));
  const head = sideResults(runs.find((r) => r.side === "HEAD"));
  const out: Record<string, ClassResult> = {};
  for (const k of new Set([...Object.keys(base), ...Object.keys(head)])) {
    out[k] = { base: base[k] ?? null, head: head[k] ?? null, regressions: [], newFailures: [] };
  }
  const ensure = (k: string) => (out[k] ??= { base: null, head: null, regressions: [], newFailures: [] });
  for (const n of diff?.regressions ?? []) ensure(topLevelClass(n)).regressions.push(n);
  for (const n of diff?.newFailures ?? []) ensure(topLevelClass(n)).newFailures.push(n);
  return out;
}

type StageEvent = { stage: string; status: string; data: Record<string, unknown> | null };

/** 선택 결과: 실행 기록(전체)이 있으면 그것을, 없으면 단계 기록(목록 상한까지)을 쓴다 */
export function pickSelection(runs: TestRun[], events: StageEvent[]): TestSelection | null {
  const fromRun = runs.find((r) => r.side === "HEAD")?.selection ?? runs.find((r) => r.selection)?.selection;
  if (fromRun && fromRun.mode) return fromRun;
  const e = [...events].reverse().find((x) => x.stage === "EXEC_SELECT" && x.status === "DONE");
  return (e?.data as TestSelection | undefined) ?? null;
}

/** 차등 비교 단계 결과 (회귀 · 새 실패 · 선택이 놓친 것) */
export function diffOf(events: StageEvent[]): { regressions?: string[]; newFailures?: string[]; selection?: { missed?: string[] } } | null {
  const e = [...events].reverse().find((x) => x.stage === "EXEC_DIFF" && x.status === "DONE");
  return (e?.data as { regressions?: string[]; newFailures?: string[]; selection?: { missed?: string[] } } | undefined) ?? null;
}

export function seconds(s: number): string {
  if (s >= 60) return `${Math.floor(s / 60)}분 ${Math.round(s % 60)}초`;
  return s >= 10 ? `${Math.round(s)}초` : `${s.toFixed(1)}초`;
}
