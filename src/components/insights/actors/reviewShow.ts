"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Finding, GroundStatus, Verdict } from "@/lib/api";
import type { ReviewEvent, StageId } from "@/components/pipeline/stages";
import { usePipelineEvents } from "@/components/pipeline/usePipelineEvents";

/** 연출 단계: 리뷰 단계 기록을 사람이 따라갈 수 있는 장면으로 묶는다 */
export type ShowPhase = "collect" | "scan" | "impact" | "threat" | "ground" | "verdict" | "failed";

/** 보안 위협: 보안 검사나 AI 가 보안 문제라고 한 지적 */
export type ShowThreat = { file: string; title: string; status: GroundStatus | null };

export type ShowState = {
  phase: ShowPhase | null;
  /** 이번 PR 이 바꾼 파일 */
  changed: string[];
  /** 바뀐 메서드를 부르는 파일 (바뀐 파일 제외) */
  impacted: string[];
  threats: ShowThreat[];
  verdict: Verdict | null;
  /** 지금 장면에서 몇 ms 지났는지 (훑기 순서 계산용) */
  elapsed: number;
  /** 화면 아래 자막 */
  caption: string;
  /** 리뷰가 아직 진행 중인가 */
  live: boolean;
};

/** 장면 하나를 최소 이만큼 보여 준다 (다시보기에서는 이 간격으로 넘어간다) */
const MIN_MS: Record<Exclude<ShowPhase, "verdict" | "failed">, number> = {
  collect: 1400,
  scan: 0, // 바뀐 파일 수에 따라 (SCAN_PER_FILE)
  impact: 2000,
  threat: 3200,
  ground: 2600,
};
export const SCAN_PER_FILE = 1100;
const MAX_SCAN = 5;

type RawFinding = { file?: string | null; title?: string; category?: string; kind?: string | null; status?: string };

const isSecurity = (f: { category?: string | null; kind?: string | null }) => f.category === "SECURITY" || f.kind === "SECURITY";

/** 끝난 상태(DONE · SKIPPED · FAILED)의 단계 */
function settled(events: ReviewEvent[]): Map<StageId, ReviewEvent> {
  const map = new Map<StageId, ReviewEvent>();
  for (const e of events) if (e.status !== "RUNNING") map.set(e.stage, e);
  return map;
}

/** 단계 기록에서 연출 재료를 뽑는다. 끝난 리뷰의 저장된 지적(final)이 있으면 그것을 우선한다 */
function material(events: ReviewEvent[], props: { changed: string[]; findings: Finding[] | null }) {
  const done = settled(events);
  const collect = done.get("COLLECT")?.data;
  const changed = props.changed.length > 0 ? props.changed : ((collect?.paths as string[] | undefined) ?? []);
  const changedSet = new Set(changed);

  const impacted = new Set<string>();
  for (const m of (done.get("METHOD_DIFF")?.data?.methods as { callers?: { file: string }[] }[] | undefined) ?? []) {
    for (const c of m.callers ?? []) if (!changedSet.has(c.file)) impacted.add(c.file);
  }

  const threats = new Map<string, ShowThreat>();
  const add = (f: RawFinding, status: GroundStatus | null) => {
    if (!f.file || !f.title) return;
    const key = `${f.file}\n${f.title}`;
    const prev = threats.get(key);
    threats.set(key, { file: f.file, title: f.title, status: status ?? prev?.status ?? null });
  };
  if (props.findings) {
    for (const f of props.findings) if (isSecurity({ category: f.category, kind: f.grounding?.kind })) add({ file: f.file, title: f.title }, f.grounding?.status ?? null);
  } else {
    for (const stage of ["CHECK_C", "LLM"] as const) {
      for (const f of (done.get(stage)?.data?.findings as RawFinding[] | undefined) ?? []) {
        if (stage === "CHECK_C" || isSecurity(f)) add(f, null);
      }
    }
    for (const f of (done.get("GROUND")?.data?.findings as RawFinding[] | undefined) ?? []) {
      if (isSecurity(f) || threats.has(`${f.file}\n${f.title}`)) add(f, (f.status as GroundStatus) ?? null);
    }
  }

  return {
    done,
    changed: changed.slice(0, 40),
    impacted: [...impacted].slice(0, 40),
    threats: [...threats.values()].slice(0, 4),
    verdict: (done.get("VERDICT")?.data?.verdict as Verdict | undefined) ?? null,
  };
}

const VERDICT_TEXT: Record<Verdict, string> = {
  MERGEABLE: "머지 가능",
  NEEDS_CHANGES: "수정 후 머지",
  NOT_RECOMMENDED: "머지 막힘",
};

const fileName = (p: string) => p.slice(p.lastIndexOf("/") + 1);

function captionOf(phase: ShowPhase, m: ReturnType<typeof material>, elapsed: number, pr: number): string {
  switch (phase) {
    case "collect":
      return `PR #${pr} 리뷰 시작 · 바뀐 파일 ${m.changed.length}개`;
    case "scan": {
      const list = m.changed.slice(0, MAX_SCAN);
      const now = list[Math.min(Math.floor(elapsed / SCAN_PER_FILE), list.length - 1)];
      return now ? `AI 리뷰어가 바뀐 코드를 읽는 중 · ${fileName(now)}` : "AI 리뷰어가 바뀐 코드를 읽는 중";
    }
    case "impact":
      return m.impacted.length > 0 ? `호출 관계로 영향 추적 · 영향받는 파일 ${m.impacted.length}개` : "호출 관계로 영향 추적 · 다른 파일로 번지지 않음";
    case "threat":
      return `보안 위협 감지 · ${m.threats[0]?.title ?? ""}${m.threats.length > 1 ? ` 외 ${m.threats.length - 1}건` : ""}`;
    case "ground": {
      if (m.threats.length === 0) return "근거 확인 · 코드 인덱스와 실행 결과로 지적을 검증";
      const blocked = m.threats.filter((t) => t.status === "CONFIRMED").length;
      const refuted = m.threats.filter((t) => t.status === "REFUTED").length;
      if (blocked > 0) return `AI 가 근거를 확인하고 위협 ${blocked}건을 막음`;
      if (refuted === m.threats.length) return "근거 확인 · 인덱스와 어긋난 오탐이라 판정에서 뺌";
      return "근거 확인 · AI 만 주장한 위협이라 사람이 확인해야 함";
    }
    case "verdict":
      return m.verdict ? `판정: ${VERDICT_TEXT[m.verdict]}` : "판정";
    case "failed":
      return "리뷰가 끝까지 진행되지 않았습니다";
  }
}

/** 이 장면으로 넘어가도 되나 (필요한 단계가 끝났나) */
function ready(phase: ShowPhase, m: ReturnType<typeof material>): boolean {
  const d = m.done;
  switch (phase) {
    case "collect":
    case "scan":
      return d.has("COLLECT");
    case "impact":
      return d.has("METHOD_DIFF");
    case "threat":
      // 보안 검사와 AI 리뷰가 둘 다 끝나야 위협이 있는지 안다
      return (d.has("CHECK_C") && d.has("LLM")) || d.has("GROUND");
    case "ground":
      return d.has("GROUND");
    case "verdict":
      return d.has("VERDICT");
    case "failed":
      return false;
  }
}

const ORDER: ShowPhase[] = ["collect", "scan", "impact", "threat", "ground", "verdict"];

/**
 * 리뷰 하나를 코드 시티 위 장면으로 만든다. 단계 기록(SSE)을 받아, 진행 중이면 단계가 끝나는 대로,
 * 끝난 리뷰면 장면마다 정해진 시간만큼 보여 주며 넘어간다. round 를 바꾸면 처음부터 다시 본다.
 * changed · findings 는 끝난 리뷰의 분석 재료 (없으면 단계 기록에서 뽑는다)
 */
export function useReviewShow({
  reviewId,
  prNumber,
  changed = [],
  findings = null,
  round = 0,
}: {
  reviewId: number | null;
  prNumber: number;
  changed?: string[];
  findings?: Finding[] | null;
  round?: number;
}): ShowState {
  const { events, ended } = usePipelineEvents(reviewId ?? -1, reviewId !== null);
  const m = useMemo(() => material(events, { changed, findings }), [events, changed, findings]);
  const [step, setStep] = useState<{ index: number; since: number }>({ index: -1, since: 0 });
  const [now, setNow] = useState(() => Date.now());
  const mRef = useRef(m);
  mRef.current = m;

  useEffect(() => setStep({ index: -1, since: Date.now() }), [reviewId, round]);

  useEffect(() => {
    if (reviewId === null) return;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      setStep((s) => {
        const mat = mRef.current;
        const current = ORDER[s.index];
        const min = current === undefined ? 0 : current === "scan" ? Math.min(mat.changed.length, MAX_SCAN) * SCAN_PER_FILE + 400 : current === "verdict" ? Infinity : MIN_MS[current as keyof typeof MIN_MS];
        if (t - s.since < min) return s;
        for (let i = s.index + 1; i < ORDER.length; i++) {
          const next = ORDER[i];
          if (!ready(next, mat)) return s;
          // 위협이 없으면 위협 장면을 건너뛴다
          if (next === "threat" && mat.threats.length === 0) continue;
          if (next === "scan" && mat.changed.length === 0) continue;
          return { index: i, since: t };
        }
        return s;
      });
    }, 120);
    return () => clearInterval(timer);
  }, [reviewId, round]);

  const failed = ended && !m.done.has("VERDICT") && step.index >= 0 && now - step.since > 4000;
  const phase: ShowPhase | null = failed ? "failed" : (ORDER[step.index] ?? null);
  const elapsed = now - step.since;
  return {
    phase,
    changed: m.changed,
    impacted: m.impacted,
    threats: m.threats,
    verdict: m.verdict,
    elapsed,
    caption: phase ? captionOf(phase, m, elapsed, prNumber) : "",
    live: !ended,
  };
}
