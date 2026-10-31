import type { Finding, GroundLayerId, GroundMark, GroundStatus, Grounding } from "./api";

/** 아래(기반)에서 위(판단) 순서 */
export const LAYER_ORDER: GroundLayerId[] = ["INDEX", "HISTORY", "RUNTIME", "AI"];

export const LAYER_META: Record<GroundLayerId, { label: string; short: string; hint: string; color: string }> = {
  INDEX: { label: "코드 인덱스", short: "인덱스", hint: "타입 · 메서드 · 호출 관계, 결정적 검사", color: "#38bdf8" },
  HISTORY: { label: "git 이력", short: "이력", hint: "동시 변경 · blame · 변경 빈도", color: "#a78bfa" },
  RUNTIME: { label: "실행 · 런타임", short: "실행", hint: "base · head 테스트, 증거 테스트, 호출 기록", color: "#34d399" },
  AI: { label: "AI 판단", short: "AI", hint: "근거와 diff 를 읽은 LLM 리뷰", color: "#f472b6" },
};

export const MARK_META: Record<GroundMark, { symbol: string; label: string }> = {
  CONFIRMED: { symbol: "●", label: "확인" },
  RELATED: { symbol: "○", label: "맥락" },
  REFUTED: { symbol: "✕", label: "반박" },
  NONE: { symbol: "·", label: "정보 없음" },
};

export const STATUS_META: Record<GroundStatus, { label: string; hint: string; color: string }> = {
  CONFIRMED: { label: "여러 층이 확인", hint: "AI 가 아닌 층(인덱스 · 실행)도 같은 문제를 확인했어요", color: "#38bdf8" },
  AI_ONLY: { label: "AI 만 주장", hint: "다른 층은 맥락만 있어요. 사람이 확인할 지적이에요", color: "#f472b6" },
  REFUTED: { label: "인덱스와 어긋남 · 판정에서 뺌", hint: "AI 가 말한 것이 코드 인덱스의 사실과 달라요", color: "#94a3b8" },
};

export const STATUS_ORDER: GroundStatus[] = ["CONFIRMED", "AI_ONLY", "REFUTED"];

const KIND_LABEL: Record<string, string> = {
  MISSING_SYMBOL: "없는 이름",
  BROKEN_CALLER: "깨지는 호출부",
  MISSING_CHECK: "빠진 검사",
  BEHAVIOR_CHANGE: "동작 변경",
  SECURITY: "보안",
  DATA: "데이터",
  INTENT: "의도 불일치",
  CONTRACT_CONFLICT: "기존 코드와 충돌",
  OTHER: "기타",
};

export function kindLabel(kind: string | null): string | null {
  return kind ? (KIND_LABEL[kind] ?? kind) : null;
}

const INDEX_RULES = /^(AST_|UNRESOLVED_METHOD$|ARITY_MISMATCH$)/;

/**
 * 지적의 층별 근거. 근거 확인 단계가 생기기 전 리뷰는 지적을 만든 곳만으로 채운다
 * (결정적 검사 → 인덱스, 실행 검증 → 실행, LLM → AI).
 */
export function groundingOf(f: Finding): Grounding {
  if (f.grounding) return f.grounding;
  const none = "기록 없음 (근거 확인 전 리뷰)";
  const mark = (layer: GroundLayerId): GroundMark => {
    if (layer === "AI") return f.source === "LLM" ? "CONFIRMED" : "NONE";
    if (layer === "INDEX") return INDEX_RULES.test(f.ruleId) ? "CONFIRMED" : "NONE";
    if (layer === "RUNTIME") return f.ruleId.startsWith("EXEC_") ? "CONFIRMED" : "NONE";
    return "NONE";
  };
  return {
    status: f.source === "LLM" ? "AI_ONLY" : "CONFIRMED",
    kind: null,
    symbols: [],
    layers: LAYER_ORDER.map((layer) => ({
      layer,
      mark: mark(layer),
      note: mark(layer) === "CONFIRMED" ? (layer === "AI" ? "AI 리뷰 지적" : `${f.ruleId} 가 찾음`) : none,
    })),
  };
}

export function layerOf(g: Grounding, id: GroundLayerId) {
  return g.layers.find((l) => l.layer === id) ?? { layer: id, mark: "NONE" as GroundMark, note: "" };
}

/** 이 리뷰가 근거 확인을 거쳤는가 */
export function hasGrounding(findings: Finding[]): boolean {
  return findings.some((f) => f.grounding);
}

export function countByStatus(findings: Finding[]): Record<GroundStatus, number> {
  const out: Record<GroundStatus, number> = { CONFIRMED: 0, AI_ONLY: 0, REFUTED: 0 };
  for (const f of findings) out[groundingOf(f).status]++;
  return out;
}
