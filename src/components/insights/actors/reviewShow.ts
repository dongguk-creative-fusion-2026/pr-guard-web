"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Finding, GroundLayerId, GroundMark, GroundStatus, Verdict } from "@/lib/api";
import { groundingOf } from "@/lib/grounding";
import type { ReviewEvent, StageId } from "@/components/pipeline/stages";
import { usePipelineEvents } from "@/components/pipeline/usePipelineEvents";

/** 연출 단계: 리뷰 단계 기록을 사람이 따라갈 수 있는 장면으로 묶는다 */
export type ShowPhase = "collect" | "scan" | "impact" | "exec" | "threat" | "ground" | "verdict" | "failed";

/** 보안 위협: 보안 검사나 AI 가 보안 문제라고 한 지적 */
export type ShowThreat = { file: string; title: string; status: GroundStatus | null };

/** 구조 변화: 이번 PR 이 만든, 구조를 거스르는 의존 (출발 파일 → 도착 파일) */
export type ShowArch = { from: string; to: string; rule: string; title: string };

const ARCH_EDGE = /^(.+?) → (.+?)(?: \(|$)/;

/**
 * 실행 검증 결과: PR 전(base) · 후(head) 테스트 수, PR 전에는 통과했는데 후에는 깨진 테스트(클래스#메서드),
 * head 빌드 · 테스트가 아예 실패했으면 그 이유
 */
export type ShowExec = { baseTests: number; headTests: number; headFailed: number; broken: string[]; buildFailed: string | null };

/** 근거 확인 결과: 지적 하나가 층마다 어떻게 확인됐나 */
export type ShowGrounded = { file: string; title: string; status: GroundStatus; layers: { layer: GroundLayerId; mark: GroundMark }[] };

export type ShowState = {
  phase: ShowPhase | null;
  /** 이번 PR 이 바꾼 파일 */
  changed: string[];
  /** 바뀐 메서드를 부르는 파일 (바뀐 파일 제외) */
  impacted: string[];
  threats: ShowThreat[];
  grounded: ShowGrounded[];
  arch: ShowArch[];
  /** 실행 검증이 돈 리뷰면 그 결과 */
  exec: ShowExec | null;
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
  exec: 12500,
  threat: 3200,
  ground: 5600,
};
export const SCAN_PER_FILE = 1100;
const MAX_SCAN = 5;

type RawFinding = { file?: string | null; title?: string; category?: string; kind?: string | null; status?: string; ruleId?: string; evidence?: string | null };

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

  // 구조 변화 지적: 증거의 "출발 → 도착"
  const arch: ShowArch[] = [];
  const archFrom = (f: RawFinding) => {
    const m = f.ruleId?.startsWith("ARCH_") && f.evidence ? ARCH_EDGE.exec(f.evidence) : null;
    if (m && f.title && !arch.some((a) => a.from === m[1] && a.to === m[2])) arch.push({ from: m[1], to: m[2], rule: f.ruleId!, title: f.title });
  };
  if (props.findings) props.findings.forEach((f) => archFrom(f));
  else ((done.get("CHECK_D")?.data?.findings as RawFinding[] | undefined) ?? []).forEach(archFrom);

  // 근거 확인: 지적마다 층별 표시. 확인 → AI 만 → 뺀 지적 순
  const grounded: ShowGrounded[] = [];
  if (props.findings) {
    for (const f of props.findings) {
      if (!f.file) continue;
      const g = groundingOf(f);
      grounded.push({ file: f.file, title: f.title, status: g.status, layers: g.layers.map(({ layer, mark }) => ({ layer, mark })) });
    }
  } else {
    for (const f of (done.get("GROUND")?.data?.findings as (RawFinding & { layers?: { layer: GroundLayerId; mark: GroundMark }[] })[] | undefined) ?? []) {
      if (!f.file || !f.title || !f.layers) continue;
      grounded.push({ file: f.file, title: f.title, status: (f.status as GroundStatus) ?? "AI_ONLY", layers: f.layers.map(({ layer, mark }) => ({ layer, mark })) });
    }
  }
  const rank: Record<GroundStatus, number> = { CONFIRMED: 0, AI_ONLY: 1, REFUTED: 2 };
  grounded.sort((a, b) => rank[a.status] - rank[b.status]);

  // 실행 검증: 차등 비교까지 끝난 리뷰만 (꺼져 있으면 건너뜀으로 남는다)
  let exec: ShowExec | null = null;
  const diff = done.get("EXEC_DIFF");
  if (diff && diff.status === "DONE" && diff.data) {
    const d = diff.data;
    exec = {
      baseTests: Number(done.get("EXEC_TEST_BASE")?.data?.tests ?? 0),
      headTests: Number(done.get("EXEC_TEST_HEAD")?.data?.tests ?? 0),
      headFailed: Number(done.get("EXEC_TEST_HEAD")?.data?.failed ?? 0),
      broken: [...((d.regressions as string[] | undefined) ?? []), ...((d.newFailures as string[] | undefined) ?? [])],
      buildFailed: d.headFailed ? String(d.reason ?? "head 빌드 · 테스트 실패") : null,
    };
  }

  return {
    done,
    exec,
    grounded: grounded.slice(0, 6),
    arch: arch.slice(0, 4),
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
    case "exec": {
      const e = m.exec;
      if (!e) return "실행 검증";
      if (elapsed < EXEC_RUN_FROM) return "실행 검증: PR 전 · 후 코드를 각각 빌드해 테스트를 돌립니다";
      if (elapsed < EXEC_DIFF_AT) {
        const k = Math.min(1, (elapsed - EXEC_RUN_FROM) / (EXEC_DIFF_AT - EXEC_RUN_FROM - 400));
        const base = Math.round(e.baseTests * k);
        const head = Math.round(e.headTests * k);
        const failing = Math.round(e.headFailed * k);
        return `테스트 실행 · PR 전 ${base}/${e.baseTests} · PR 후 ${head - failing}/${e.headTests} 통과`;
      }
      if (e.buildFailed) return `PR 후 코드의 빌드 · 테스트가 실패: ${e.buildFailed}`;
      if (e.broken.length === 0) return `PR 전 · 후 테스트 결과가 같음 · 회귀 없음 (${e.headTests}개)`;
      const name = e.broken[0].replace(/^.*\.(?=[^.#]+#)/, "");
      return `PR 전에는 통과, PR 후에는 실패: ${name}${e.broken.length > 1 ? ` 외 ${e.broken.length - 1}건` : ""}`;
    }
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
    case "exec":
      return d.has("EXEC_DIFF");
    case "verdict":
      return d.has("VERDICT");
    case "failed":
      return false;
  }
}

const ORDER: ShowPhase[] = ["collect", "scan", "impact", "exec", "threat", "ground", "verdict"];

/** 실행 검증 장면 안의 시각 (ms): 테스트가 켜지기 시작 · 차등 비교 (평행 도시와 맞춘다) */
export const EXEC_RUN_FROM = 2200;
export const EXEC_DIFF_AT = 8600;

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
  impactHold = 0,
}: {
  reviewId: number | null;
  prNumber: number;
  changed?: string[];
  findings?: Finding[] | null;
  round?: number;
  /** 영향 장면을 더 오래 보여 줄 시간 (숨은 결합이 있을 때) */
  impactHold?: number;
}): ShowState {
  const { events, ended } = usePipelineEvents(reviewId ?? -1, reviewId !== null);
  const m = useMemo(() => material(events, { changed, findings }), [events, changed, findings]);
  const [step, setStep] = useState<{ index: number; since: number }>({ index: -1, since: 0 });
  const [now, setNow] = useState(() => Date.now());
  const mRef = useRef(m);
  mRef.current = m;
  const holdRef = useRef(impactHold);
  holdRef.current = impactHold;

  useEffect(() => setStep({ index: -1, since: Date.now() }), [reviewId, round]);

  useEffect(() => {
    if (reviewId === null) return;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      setStep((s) => {
        const mat = mRef.current;
        const current = ORDER[s.index];
        const min = current === undefined ? 0 : current === "scan" ? Math.min(mat.changed.length, MAX_SCAN) * SCAN_PER_FILE + 400 : current === "verdict" ? Infinity : MIN_MS[current as keyof typeof MIN_MS] + (current === "impact" ? holdRef.current : 0);
        if (t - s.since < min) return s;
        for (let i = s.index + 1; i < ORDER.length; i++) {
          const next = ORDER[i];
          if (!ready(next, mat)) return s;
          // 위협이 없으면 위협 장면을 건너뛴다
          if (next === "threat" && mat.threats.length === 0) continue;
          if (next === "scan" && mat.changed.length === 0) continue;
          if (next === "exec" && !mat.exec) continue;
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
    grounded: m.grounded,
    arch: m.arch,
    exec: m.exec,
    verdict: m.verdict,
    elapsed,
    caption: phase ? captionOf(phase, m, elapsed, prNumber) : "",
    live: !ended,
  };
}
