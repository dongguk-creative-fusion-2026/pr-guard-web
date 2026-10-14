import type { Finding } from "./api";
import { topLevelClass } from "./testSelection";

/** 변이 하나 (백엔드 EXEC_MUTATION 단계 data.methods[].mutants) */
export type MutantView = {
  line: number;
  mutator: string;
  description: string;
  status: "KILLED" | "SURVIVED" | "NO_COVERAGE" | "TIMED_OUT" | "MEMORY_ERROR" | "RUN_ERROR";
  /** 잡은 테스트 (a.FooTest#x()) */
  killers: string[];
  /** 지나갔지만 못 잡은 테스트 */
  covering: string[];
};

export type MethodMutation = {
  id: string;
  file: string;
  line: number;
  total: number;
  killed: number;
  survived: number;
  uncovered: number;
  mutants: MutantView[];
};

/** EXEC_MUTATION 단계 data */
export type MutationData = {
  /** 테스트가 지나간 변이 중 잡은 비율 (%). 지나간 것이 없으면 -1 */
  score: number;
  killed: number;
  survived: number;
  uncovered: number;
  classes: string[];
  methods: MethodMutation[];
  tests: { className: string; killed: number; coveredOnly: number }[];
};

export function killedStatus(s: MutantView["status"]): boolean {
  return s === "KILLED" || s === "TIMED_OUT" || s === "MEMORY_ERROR" || s === "RUN_ERROR";
}

const MUTATOR_LABEL: Record<string, string> = {
  NegateConditionals: "조건 반전",
  ConditionalsBoundary: "경계 조건 바꿈 (< ↔ <=)",
  VoidMethodCall: "호출 삭제",
  NullReturnVals: "null 반환",
  EmptyObjectReturnVals: "빈 값 반환",
  BooleanTrueReturnVals: "항상 true 반환",
  BooleanFalseReturnVals: "항상 false 반환",
  PrimitiveReturns: "0 반환",
  Increments: "증감 반전",
  InvertNegs: "부호 반전",
  Math: "연산자 바꿈",
  NonVoidMethodCall: "호출 결과 버림",
  RemoveConditional: "조건 제거",
};

/** "line 53 · 호출 삭제 · OwnershipGuard.requireOwner" 처럼 사람이 읽는 한 줄 */
export function mutantLabel(m: MutantView): string {
  const kind = MUTATOR_LABEL[m.mutator] ?? m.mutator;
  // "removed call to com/x/OwnershipGuard::requireOwner" → OwnershipGuard.requireOwner
  const target = m.description.match(/([A-Za-z0-9_$]+)::([A-Za-z0-9_$<>]+)/);
  const what = target && m.mutator !== "NullReturnVals" && !m.mutator.endsWith("ReturnVals") ? ` · ${target[1]}.${target[2]}` : "";
  return `${m.line}줄 · ${kind}${what}`;
}

/** a.b.FooTest#x() → FooTest#x() */
export function shortTest(name: string): string {
  const hash = name.indexOf("#");
  const type = hash < 0 ? name : name.slice(0, hash);
  return type.slice(type.lastIndexOf(".") + 1) + (hash < 0 ? "" : name.slice(hash));
}

/** 테스트 클래스 하나의 신뢰도 */
export type TrustLevel = "proven" | "weak" | "flaky" | "weakened" | "unknown";

export type TestTrust = {
  level: TrustLevel;
  /** 사람이 읽는 근거 */
  notes: string[];
};

export const TRUST_META: Record<TrustLevel, { label: string; tone: string }> = {
  proven: { label: "버그를 잡음", tone: "ok" },
  weak: { label: "지나가기만 함", tone: "warn" },
  flaky: { label: "결과가 흔들림", tone: "warn" },
  weakened: { label: "약해짐", tone: "bad" },
  unknown: { label: "판단 재료 없음", tone: "none" },
};

/**
 * 테스트 클래스별 신뢰도: 정적 지적(약화 · 검증 없음) > flaky > 변이(잡음 · 지나가기만 함) 순으로 본다.
 * @param flaky head 에서 다시 돌리니 통과한 테스트 (a.FooTest#x())
 */
export function trustByClass(mutation: MutationData | null, flaky: string[], findings: Finding[]): Record<string, TestTrust> {
  const out: Record<string, TestTrust> = {};
  const add = (cls: string, level: TrustLevel, note: string) => {
    const cur = (out[cls] ??= { level, notes: [] });
    const rank: TrustLevel[] = ["weakened", "flaky", "weak", "proven", "unknown"];
    if (rank.indexOf(level) < rank.indexOf(cur.level)) cur.level = level;
    cur.notes.push(note);
  };
  for (const t of mutation?.tests ?? []) {
    if (t.killed > 0) add(t.className, "proven", `심은 버그 ${t.killed}개를 잡음`);
    else if (t.coveredOnly > 0) add(t.className, "weak", `바뀐 코드를 지나가지만 심은 버그 ${t.coveredOnly}개를 하나도 못 잡음`);
  }
  for (const n of flaky) add(topLevelClass(n), "flaky", `${shortTest(n)} 이 실패했다가 다시 돌리니 통과`);
  for (const f of findings) {
    if (!f.ruleId.startsWith("TEST_") || !f.file) continue;
    // 파일 경로 → 클래스 (src/test/java/a/b/FooTest.java → a.b.FooTest)
    const i = f.file.indexOf("src/test/java/");
    if (i < 0) continue;
    const cls = f.file.slice(i + "src/test/java/".length).replace(/\.java$/, "").replaceAll("/", ".");
    add(cls, f.severity === "MAJOR" ? "weakened" : "weak", f.title);
  }
  return out;
}
