// 백엔드 com.prguard.events.Stage 와 1:1

export type StageId =
  | "COLLECT"
  | "CHECKOUT"
  | "INDEX_BASE"
  | "INDEX_HEAD"
  | "METHOD_DIFF"
  | "HISTORY"
  | "CHECK_A"
  | "CHECK_B"
  | "CHECK_C"
  | "CHECK_D"
  | "LLM"
  | "VERDICT"
  | "PUBLISH"
  | "REVIEW";

export type StageStatus = "PENDING" | "RUNNING" | "DONE" | "FAILED" | "SKIPPED";

/** 단계별 수치·결과물. 모양은 단계마다 다르다 (백엔드 AnalysisPipeline 참고). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type StageData = Record<string, any>;

export type ReviewEvent = {
  id: number;
  reviewId: number;
  stage: StageId;
  status: Exclude<StageStatus, "PENDING">;
  message: string | null;
  data: StageData | null;
  at: string;
};

export type StageState = {
  status: StageStatus;
  message: string | null;
  data: StageData | null;
  startedAt: number | null;
  endedAt: number | null;
};

export const STAGE_META: Record<Exclude<StageId, "REVIEW">, { label: string; hint: string; icon: string }> = {
  COLLECT: { label: "수집", hint: "PR 본문 · 커밋 · diff", icon: "📥" },
  CHECKOUT: { label: "소스 준비", hint: "clone · base/head", icon: "📦" },
  INDEX_BASE: { label: "base 인덱스", hint: "타입 · 메서드 · 호출", icon: "🧩" },
  INDEX_HEAD: { label: "head 인덱스", hint: "타입 · 메서드 · 호출", icon: "🧩" },
  METHOD_DIFF: { label: "메서드 비교", hint: "바뀐 메서드 · 호출부", icon: "🔀" },
  HISTORY: { label: "git 이력", hint: "동시 변경 · blame", icon: "🕰️" },
  CHECK_A: { label: "A · 의도 대비", hint: "PR 설명 ↔ 변경", icon: "🎯" },
  CHECK_B: { label: "B · 변경 영향", hint: "호출부 · 참조", icon: "🕸️" },
  CHECK_C: { label: "C · 보안", hint: "권한 · 시크릿", icon: "🔐" },
  CHECK_D: { label: "D · 위험도", hint: "동시 변경 누락", icon: "📈" },
  LLM: { label: "LLM 리뷰", hint: "근거 + diff", icon: "🤖" },
  VERDICT: { label: "판정", hint: "규칙으로 계산", icon: "⚖️" },
  PUBLISH: { label: "PR 코멘트", hint: "요약 · 라인", icon: "💬" },
};

export const GRAPH_STAGES = Object.keys(STAGE_META) as Exclude<StageId, "REVIEW">[];

const COL = 212;
const ROW = 100;

/** 그래프 배치: 왼쪽에서 오른쪽으로 흐르고, 병렬 단계는 세로로 쌓는다. */
export const POSITIONS: Record<Exclude<StageId, "REVIEW">, { x: number; y: number }> = {
  COLLECT: { x: 0, y: 2 * ROW },
  CHECKOUT: { x: COL, y: 2 * ROW },
  INDEX_BASE: { x: 2 * COL, y: 1.4 * ROW },
  INDEX_HEAD: { x: 2 * COL, y: 2.6 * ROW },
  METHOD_DIFF: { x: 3 * COL, y: 2 * ROW },
  HISTORY: { x: 4 * COL, y: 2 * ROW },
  CHECK_A: { x: 5 * COL, y: 0 },
  CHECK_B: { x: 5 * COL, y: ROW },
  CHECK_C: { x: 5 * COL, y: 2 * ROW },
  CHECK_D: { x: 5 * COL, y: 3 * ROW },
  LLM: { x: 5 * COL, y: 4 * ROW },
  VERDICT: { x: 6 * COL, y: 2 * ROW },
  PUBLISH: { x: 7 * COL, y: 2 * ROW },
};

const VCOL = 210;
const VROW = 104;

/** 좁은 화면용 세로 배치: 위에서 아래로 흐르고, 병렬 단계는 두 줄로 나눈다. */
export const POSITIONS_VERTICAL: Record<Exclude<StageId, "REVIEW">, { x: number; y: number }> = {
  COLLECT: { x: 0, y: 0 },
  CHECKOUT: { x: 0, y: VROW },
  INDEX_BASE: { x: -VCOL / 2, y: 2 * VROW },
  INDEX_HEAD: { x: VCOL / 2, y: 2 * VROW },
  METHOD_DIFF: { x: 0, y: 3 * VROW },
  HISTORY: { x: 0, y: 4 * VROW },
  CHECK_A: { x: -VCOL, y: 5 * VROW },
  CHECK_B: { x: 0, y: 5 * VROW },
  CHECK_C: { x: VCOL, y: 5 * VROW },
  CHECK_D: { x: -VCOL / 2, y: 6 * VROW },
  LLM: { x: VCOL / 2, y: 6 * VROW },
  VERDICT: { x: 0, y: 7 * VROW },
  PUBLISH: { x: 0, y: 8 * VROW },
};

export const EDGES: [Exclude<StageId, "REVIEW">, Exclude<StageId, "REVIEW">][] = [
  ["COLLECT", "CHECKOUT"],
  ["CHECKOUT", "INDEX_BASE"],
  ["CHECKOUT", "INDEX_HEAD"],
  ["INDEX_BASE", "METHOD_DIFF"],
  ["INDEX_HEAD", "METHOD_DIFF"],
  ["METHOD_DIFF", "HISTORY"],
  ["HISTORY", "CHECK_A"],
  ["HISTORY", "CHECK_B"],
  ["HISTORY", "CHECK_C"],
  ["HISTORY", "CHECK_D"],
  ["HISTORY", "LLM"],
  ["CHECK_A", "VERDICT"],
  ["CHECK_B", "VERDICT"],
  ["CHECK_C", "VERDICT"],
  ["CHECK_D", "VERDICT"],
  ["LLM", "VERDICT"],
  ["VERDICT", "PUBLISH"],
];

/** 이벤트를 앞에서부터 적용해 단계별 상태를 만든다. */
export function reduceStates(events: ReviewEvent[]): Record<StageId, StageState> {
  const states = {} as Record<StageId, StageState>;
  for (const id of [...GRAPH_STAGES, "REVIEW"] as StageId[]) {
    states[id] = { status: "PENDING", message: null, data: null, startedAt: null, endedAt: null };
  }
  for (const e of events) {
    const s = states[e.stage];
    if (!s) continue;
    const t = Date.parse(e.at);
    if (e.status === "RUNNING") {
      s.startedAt = t;
    } else {
      s.endedAt = t;
      if (s.startedAt == null) s.startedAt = t;
    }
    s.status = e.status;
    s.message = e.message;
    if (e.data) s.data = e.data;
  }
  return states;
}

/** 단계 노드에 보여 줄 핵심 수치 몇 개. */
export function stageMetrics(stage: StageId, data: StageData | null): string[] {
  if (!data) return [];
  switch (stage) {
    case "COLLECT":
      return [`파일 ${data.files}`, `+${data.additions} −${data.deletions}`, `커밋 ${data.commits}`];
    case "CHECKOUT":
      return [`${data.repoKb}KB`];
    case "INDEX_BASE":
    case "INDEX_HEAD":
      return [`파일 ${data.files}`, `메서드 ${data.methods}`, `호출 ${data.calls}`];
    case "METHOD_DIFF":
      return [
        `+${data.added} ~${data.modified} −${data.removed}`,
        `호출부 ${data.callers}`,
        ...(data.signatureChanged ? [`시그니처 ${data.signatureChanged}`] : []),
      ];
    case "HISTORY":
      return [`커밋 ${data.commits}`, `동시 변경 ${data.coChanges?.length ?? 0}`];
    case "CHECK_A":
    case "CHECK_B":
    case "CHECK_C":
    case "CHECK_D":
    case "LLM":
      return [`지적 ${data.findings?.length ?? 0}`];
    case "VERDICT":
      return [`B ${data.blocker} · M ${data.major} · m ${data.minor}`];
    case "PUBLISH":
      return [`라인 ${data.inline}`];
    default:
      return [];
  }
}

export function durationMs(s: StageState): number | null {
  return s.startedAt != null && s.endedAt != null ? s.endedAt - s.startedAt : null;
}
