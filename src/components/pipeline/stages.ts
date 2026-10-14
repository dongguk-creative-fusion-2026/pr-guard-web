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
  | "EXEC_PREPARE"
  | "EXEC_POD_BASE"
  | "EXEC_POD_HEAD"
  | "EXEC_TEST_BASE"
  | "EXEC_TEST_HEAD"
  | "EXEC_DIFF"
  | "EXEC_EVIDENCE"
  | "EXEC_SELECT"
  | "GROUND"
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

export const STAGE_META: Record<Exclude<StageId, "REVIEW">, { label: string; hint: string }> = {
  COLLECT: { label: "수집", hint: "PR 본문 · 커밋 · diff" },
  CHECKOUT: { label: "소스 준비", hint: "clone · base/head" },
  INDEX_BASE: { label: "base 인덱스", hint: "타입 · 메서드 · 호출" },
  INDEX_HEAD: { label: "head 인덱스", hint: "타입 · 메서드 · 호출" },
  METHOD_DIFF: { label: "메서드 비교", hint: "바뀐 메서드 · 호출부" },
  HISTORY: { label: "git 이력", hint: "동시 변경 · blame" },
  CHECK_A: { label: "A · 의도 대비", hint: "PR 설명 ↔ 변경" },
  CHECK_B: { label: "B · 변경 영향", hint: "호출부 · 참조" },
  CHECK_C: { label: "C · 보안", hint: "권한 · 시크릿" },
  CHECK_D: { label: "D · 위험도", hint: "동시 변경 누락" },
  LLM: { label: "LLM 리뷰", hint: "근거 + diff" },
  EXEC_PREPARE: { label: "E · 실행 준비", hint: "러너 이미지 · Job 생성" },
  EXEC_POD_BASE: { label: "base Pod 기동", hint: "스케줄 · 이미지 · 기동" },
  EXEC_POD_HEAD: { label: "head Pod 기동", hint: "스케줄 · 이미지 · 기동" },
  EXEC_TEST_BASE: { label: "base 빌드 · 테스트", hint: "clone · 빌드 · 테스트" },
  EXEC_TEST_HEAD: { label: "head 빌드 · 테스트", hint: "clone · 빌드 · 테스트" },
  EXEC_DIFF: { label: "차등 비교", hint: "base 통과 → head 실패" },
  EXEC_EVIDENCE: { label: "증거 테스트", hint: "바뀐 동작을 테스트로 고정" },
  EXEC_SELECT: { label: "테스트 선택", hint: "영향 있는 테스트만 실행" },
  GROUND: { label: "근거 확인", hint: "인덱스 · 이력 · 실행 · AI" },
  VERDICT: { label: "판정", hint: "규칙으로 계산" },
  PUBLISH: { label: "PR 코멘트", hint: "요약 · 라인" },
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
  // 실행 검증 레인: 소스 준비 뒤에서 아래로 갈라져 나란히 돌고 판정에 합류한다
  EXEC_PREPARE: { x: 2 * COL, y: 5.9 * ROW },
  EXEC_POD_BASE: { x: 3 * COL, y: 5.3 * ROW },
  EXEC_POD_HEAD: { x: 3 * COL, y: 6.5 * ROW },
  EXEC_TEST_BASE: { x: 4 * COL, y: 5.3 * ROW },
  EXEC_TEST_HEAD: { x: 4 * COL, y: 6.5 * ROW },
  EXEC_DIFF: { x: 5 * COL, y: 5.9 * ROW },
  // 증거 테스트: 메서드 비교 결과로 만들어 실행 레인의 빌드 · 테스트에 넣는다 (레인 밖, 두 흐름 사이)
  EXEC_EVIDENCE: { x: 3.5 * COL, y: 3.65 * ROW },
  // 테스트 선택: 바뀐 메서드와 기준 실행 기록으로 돌릴 테스트를 골라 빌드 · 테스트에 넘긴다
  EXEC_SELECT: { x: 2.6 * COL, y: 4.1 * ROW },
  // 모든 지적이 모여 층별 근거를 맞춰 본 뒤 판정으로
  GROUND: { x: 6 * COL, y: 2 * ROW },
  VERDICT: { x: 7 * COL, y: 2 * ROW },
  PUBLISH: { x: 8 * COL, y: 2 * ROW },
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
  // 실행 검증 레인은 오른쪽 열에
  EXEC_PREPARE: { x: 2.1 * VCOL, y: 2 * VROW },
  EXEC_POD_BASE: { x: 1.6 * VCOL, y: 3 * VROW },
  EXEC_POD_HEAD: { x: 2.6 * VCOL, y: 3 * VROW },
  EXEC_TEST_BASE: { x: 1.6 * VCOL, y: 4 * VROW },
  EXEC_TEST_HEAD: { x: 2.6 * VCOL, y: 4 * VROW },
  EXEC_DIFF: { x: 2.1 * VCOL, y: 5 * VROW },
  EXEC_EVIDENCE: { x: -VCOL, y: 3.5 * VROW },
  EXEC_SELECT: { x: 2.1 * VCOL, y: 0.88 * VROW },
  GROUND: { x: 0, y: 7 * VROW },
  VERDICT: { x: 0, y: 8 * VROW },
  PUBLISH: { x: 0, y: 9 * VROW },
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
  ["CHECK_A", "GROUND"],
  ["CHECK_B", "GROUND"],
  ["CHECK_C", "GROUND"],
  ["CHECK_D", "GROUND"],
  ["LLM", "GROUND"],
  ["GROUND", "VERDICT"],
  ["CHECKOUT", "EXEC_PREPARE"],
  ["EXEC_PREPARE", "EXEC_POD_BASE"],
  ["EXEC_PREPARE", "EXEC_POD_HEAD"],
  ["EXEC_POD_BASE", "EXEC_TEST_BASE"],
  ["EXEC_POD_HEAD", "EXEC_TEST_HEAD"],
  ["EXEC_TEST_BASE", "EXEC_DIFF"],
  ["EXEC_TEST_HEAD", "EXEC_DIFF"],
  ["EXEC_DIFF", "GROUND"],
  ["METHOD_DIFF", "EXEC_EVIDENCE"],
  ["EXEC_EVIDENCE", "EXEC_TEST_BASE"],
  ["EXEC_EVIDENCE", "EXEC_TEST_HEAD"],
  ["METHOD_DIFF", "EXEC_SELECT"],
  ["EXEC_SELECT", "EXEC_TEST_BASE"],
  ["EXEC_SELECT", "EXEC_TEST_HEAD"],
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
      // 같은 단계가 진행 메시지만 바꿔 여러 번 올 수 있다 (예: 빌드 중 → 결과 보내는 중). 처음 시작 시각을 지킨다
      if (s.status !== "RUNNING" || s.startedAt == null) s.startedAt = t;
    } else {
      s.endedAt = t;
      if (s.startedAt == null) s.startedAt = t;
    }
    s.status = e.status;
    s.message = e.message;
    if (e.data) s.data = e.data;
  }
  // 근거 확인 단계가 생기기 전 리뷰: 끝난 리뷰인데 이 단계 기록이 없으면 건너뛴 것으로 보여 준다
  if (states.VERDICT.status === "DONE" && states.GROUND.status === "PENDING") {
    states.GROUND = { ...states.GROUND, status: "SKIPPED", message: "이 단계가 생기기 전 리뷰" };
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
        ...(data.logic != null ? [`로직 ${data.logic}`] : []),
      ];
    case "HISTORY":
      return [`커밋 ${data.commits}`, `동시 변경 ${data.coChanges?.length ?? 0}`];
    case "CHECK_A":
    case "CHECK_B":
    case "CHECK_C":
    case "CHECK_D":
    case "LLM":
      return [`지적 ${data.findings?.length ?? 0}`];
    case "EXEC_PREPARE":
      return [data.runner === "KUBERNETES" ? "K8s Job 2" : "컨테이너 2"];
    case "EXEC_POD_BASE":
    case "EXEC_POD_HEAD":
      return data.ms != null ? [`기동 ${Math.round(data.ms / 1000)}s`] : [];
    case "EXEC_TEST_BASE":
    case "EXEC_TEST_HEAD":
      return [`테스트 ${data.tests}`, `실패 ${data.failed}`];
    case "EXEC_DIFF": {
      if (data.headFailed) return ["head 빌드 실패"];
      const missed = data.selection?.missed?.length ?? 0;
      const proven = (data.evidence ?? []).filter((e: { kind: string }) => e.kind === "PROVEN").length;
      return [
        `회귀 ${data.regressions?.length ?? 0}`,
        `새 실패 ${data.newFailures?.length ?? 0}`,
        ...(proven > 0 ? [`동작 변화 ${proven}`] : []),
        ...(missed > 0 ? [`선택 누락 ${missed}`] : []),
      ];
    }
    case "EXEC_EVIDENCE":
      return [`테스트 ${data.tests?.length ?? 0}`, ...(data.generator ? [String(data.generator)] : [])];
    case "EXEC_SELECT":
      if (data.mode === "FULL") return ["전체 실행", `${data.total}개`];
      if (data.shadow) return [`${data.impacted}/${data.total} 영향`, "그림자"];
      return [`${data.run}/${data.total} 실행`, `${(data.total ?? 0) - (data.run ?? 0)} 걸러짐`];
    case "GROUND":
      return [`확인 ${data.confirmed}`, `AI만 ${data.aiOnly}`, ...(data.refuted ? [`뺌 ${data.refuted}`] : [])];
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

/** 실행 검증 레인 단계 (배경 묶음 상자를 그릴 때 쓴다) */
export const EXEC_STAGES = ["EXEC_PREPARE", "EXEC_POD_BASE", "EXEC_POD_HEAD", "EXEC_TEST_BASE", "EXEC_TEST_HEAD", "EXEC_DIFF"] as const;
