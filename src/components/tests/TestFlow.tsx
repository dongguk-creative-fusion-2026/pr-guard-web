"use client";

import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePipelineEvents } from "@/components/pipeline/usePipelineEvents";
import type { SelectedTestClass, TestSelection } from "@/lib/api";
import { simpleName, type ClassResult } from "@/lib/testSelection";

/**
 * 영향 테스트 선택을 실행 장면으로 보여 준다.
 *   1. 레포의 테스트가 한 무더기로 놓인다
 *   2. PR 이 바꾼 메서드가 켜진다
 *   3. 영향 있는 테스트만 실행 열로 모이고, 나머지는 그 자리에서 꺼진다 (돌리지 않음)
 *   4. 바뀐 메서드에서 실행 열로 선이 뻗는다 (기준 기록 · 호출 그래프)
 *   5. 실행 열이 빛나며 base · head 에서 도는 동안 선에 신호가 흐른다
 *   6. 결과: 통과 · 회귀 · 새 실패
 * 리뷰가 진행 중이면 실제 단계(EXEC_TEST_*, EXEC_DIFF)를 따라가고, 끝난 리뷰는 같은 장면을 다시 재생한다.
 */

type Phase = "intro" | "methods" | "filter" | "trace" | "running" | "result";
const ORDER: Phase[] = ["intro", "methods", "filter", "trace", "running", "result"];
/** 다시 보기 시간표 (ms) */
const REPLAY: [Phase, number][] = [
  ["methods", 600],
  ["filter", 1500],
  ["trace", 2700],
  ["running", 3800],
  ["result", 6800],
];
const MAX_POOL = 120;

type Source = { id: string; label: string; sub: string; tone: string };
type Edge = { from: string; to: string; kind: "TRACE" | "STATIC" | "SELF" };
type Counts = { total: number; run: number; skip: number; methods: number; full: boolean; shadow: boolean };

const CAPTION: Record<Phase, (n: Counts) => string> = {
  intro: (n) => `레포의 테스트 클래스 ${n.total}개`,
  methods: (n) => `PR 이 바꾼 메서드 ${n.methods}개`,
  filter: (n) =>
    n.full
      ? "영향 범위를 확정할 수 없는 변경이 있어 전체를 돌립니다"
      : n.shadow
        ? `영향 있는 ${n.total - n.skip}개를 골랐습니다 (그림자 모드: 나머지도 함께 돌려 확인)`
        : `영향 있는 ${n.run}개만 남기고 ${n.skip}개는 돌리지 않습니다`,
  trace: () => "기준 기록을 따라 바뀐 메서드 → 테스트 연결",
  running: (n) => (n.full || n.shadow ? `${n.total}개 전체를 base · head 에서 실행 중` : `${n.run}개만 base · head 에서 실행 중`),
  result: () => "결과",
};

export function TestFlow({
  selection,
  results,
  reviewId,
  live,
}: {
  selection: TestSelection;
  results: Record<string, ClassResult>;
  reviewId: number;
  /** 실행이 아직 끝나지 않음: 실제 단계를 따라간다 */
  live: boolean;
}) {
  const reduce = useReducedMotion();
  const router = useRouter();
  const full = selection.mode === "FULL";
  const runAll = full || selection.shadow;

  const { sources, impacted, pool, hidden, edges } = useMemo(() => build(selection), [selection]);
  const counts: Counts = {
    total: selection.total,
    run: selection.run,
    skip: selection.total - selection.impacted,
    methods: selection.changes.length,
    full,
    shadow: selection.shadow,
  };

  // ── 단계: 다시 보기 또는 실제 진행
  const [phase, setPhase] = useState<Phase>(live ? "running" : reduce ? "result" : "intro");
  const [replayKey, setReplayKey] = useState(0);
  const { events } = usePipelineEvents(reviewId, live);
  useEffect(() => {
    if (live || reduce) return;
    setPhase("intro");
    const timers = REPLAY.map(([p, ms]) => setTimeout(() => setPhase(p), ms));
    return () => timers.forEach(clearTimeout);
  }, [replayKey, live, reduce]);
  useEffect(() => {
    if (!live) return;
    const st = (s: string) => [...events].reverse().find((e) => e.stage === s)?.status;
    if (st("EXEC_DIFF") === "DONE" || st("REVIEW") === "DONE" || st("REVIEW") === "FAILED") {
      setPhase("result");
      // 결과(테스트 실행 기록)를 다시 받아 온다
      router.refresh();
    } else if (st("EXEC_TEST_BASE") === "RUNNING" || st("EXEC_TEST_HEAD") === "RUNNING") {
      setPhase("running");
    } else if (st("EXEC_SELECT") === "DONE") {
      setPhase("trace");
    }
  }, [events, live, router]);
  const at = (p: Phase) => ORDER.indexOf(phase) >= ORDER.indexOf(p);
  const split = at("filter");

  // ── 위치 재기: 노드 DOM 위치로 선을 그린다
  const box = useRef<HTMLDivElement>(null);
  const refs = useRef(new Map<string, HTMLElement>());
  const [pos, setPos] = useState<Record<string, DOMRect>>({});
  const [origin, setOrigin] = useState<DOMRect | null>(null);
  const measure = useCallback(() => {
    if (!box.current) return;
    const next: Record<string, DOMRect> = {};
    refs.current.forEach((el, id) => (next[id] = el.getBoundingClientRect()));
    setOrigin(box.current.getBoundingClientRect());
    setPos(next);
  }, []);
  useLayoutEffect(() => {
    measure();
    if (!box.current) return;
    const ro = new ResizeObserver(measure);
    ro.observe(box.current);
    return () => ro.disconnect();
  }, [measure]);
  // 실행 열로 옮겨 가는 애니메이션이 끝난 뒤 자리를 다시 잰다
  useEffect(() => {
    const t = setTimeout(measure, 750);
    return () => clearTimeout(t);
  }, [measure, phase, replayKey]);
  const ref = (id: string) => (el: HTMLElement | null) => {
    if (el) refs.current.set(id, el);
    else refs.current.delete(id);
  };

  const outcome = (p: SelectedTestClass): "ok" | "bad" | "warn" | "none" => {
    const r = results[p.className];
    if (!r) return "none";
    if (r.regressions.length > 0) return "bad";
    if (r.newFailures.length > 0 || (r.head?.failed ?? 0) > 0) return "warn";
    return r.head || r.base ? "ok" : "none";
  };
  /** 실행 열 테스트 */
  const runState = (p: SelectedTestClass) => (phase === "result" ? `done-${outcome(p)}` : phase === "running" ? "running" : "on");
  /** 무더기에 남은 테스트: 꺼지거나(선택 실행) 함께 돈다(전체 · 그림자) */
  const poolState = (p: SelectedTestClass) => {
    if (!split) return "idle";
    if (!runAll) return "off";
    return phase === "result" ? `done-${outcome(p)}` : phase === "running" ? "running-dim" : "idle";
  };

  const pill = (p: SelectedTestClass, state: string, i: number, inRun: boolean) => (
    <motion.li
      key={p.className}
      layoutId={reduce ? undefined : `tf-${p.className}`}
      layout={!reduce}
      ref={inRun ? ref(`t:${p.className}`) : undefined}
      className={`tf-pill ${state}${inRun ? " in-run" : ""}`}
      initial={reduce ? false : { opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        layout: { type: "spring", stiffness: 260, damping: 30, delay: inRun ? i * 0.05 : 0 },
        opacity: { delay: reduce ? 0 : Math.min(i * 0.01, 0.4) },
      }}
      title={`${p.className}\n${p.reasons.map((r) => r.detail).join("\n")}`}
    >
      <span className="mono tf-pill-label">{simpleName(p.className)}</span>
      <span className="tf-pill-state">{label(state, p, results)}</span>
    </motion.li>
  );

  return (
    <div className="tf">
      <div className="tf-head">
        <motion.p key={phase} className="tf-caption" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
          <span className={`tf-step ${phase}`} />
          {CAPTION[phase](counts)}
        </motion.p>
        <div className="tf-tools">
          {live && <span className="tf-live">실시간</span>}
          {!live && (
            <button type="button" className="tf-replay" onClick={() => setReplayKey((k) => k + 1)} disabled={!!reduce}>
              다시 보기
            </button>
          )}
        </div>
      </div>

      <LayoutGroup>
        <div className={`tf-stage${split ? " split" : ""}`} ref={box}>
          <svg className="tf-wires" aria-hidden="true">
            <defs>
              <filter id="tf-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {origin &&
              at("trace") &&
              edges.map((e, i) => {
                const a = pos[`s:${e.from}`];
                const b = pos[`t:${e.to}`];
                if (!a || !b) return null;
                const d = wire(a, b, origin);
                const target = impacted.find((p) => p.className === e.to);
                const state = target ? runState(target) : "on";
                return (
                  <g key={`${e.from}->${e.to}-${replayKey}`}>
                    <motion.path
                      d={d}
                      className={`tf-wire ${e.kind === "STATIC" ? "static" : e.kind === "SELF" ? "self" : ""} ${state}`}
                      initial={reduce || live ? false : { pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{ duration: 0.8, delay: reduce || live ? 0 : Math.min(i * 0.07, 0.8), ease: "easeInOut" }}
                    />
                    {state === "running" && <path d={d} className="tf-pulse" filter="url(#tf-glow)" />}
                  </g>
                );
              })}
          </svg>

          <ol className="tf-sources" aria-label="PR 이 바꾼 것">
            {sources.map((s, i) => (
              <motion.li
                key={s.id}
                ref={ref(`s:${s.id}`)}
                className={`tf-src ${s.tone} ${at("methods") ? "lit" : ""}`}
                initial={reduce ? false : { opacity: 0, x: -12 }}
                animate={at("methods") || live || reduce ? { opacity: 1, x: 0 } : { opacity: 0.25, x: -6 }}
                transition={{ delay: reduce ? 0 : i * 0.08 }}
                title={s.id}
              >
                <span className="mono tf-src-label">{s.label}</span>
                <span className="tf-src-sub">{s.sub}</span>
              </motion.li>
            ))}
            {sources.length === 0 && <li className="tf-src empty">바뀐 메서드 없음</li>}
          </ol>

          <ol className="tf-run" aria-label="실행한 테스트">
            {split && impacted.map((p, i) => pill(p, runState(p), i, true))}
            {split && impacted.length === 0 && <li className="tf-run-empty">영향 있는 테스트 없음 · 컴파일만 확인</li>}
          </ol>

          <ol className="tf-pool" aria-label={runAll ? "함께 돈 테스트" : "돌리지 않은 테스트"}>
            {(split ? pool : [...impacted, ...pool]).map((p, i) => pill(p, split ? poolState(p) : "idle", i, false))}
            {hidden > 0 && (
              <li className={`tf-pill more ${split && !runAll ? "off" : ""}`}>
                <span className="tf-pill-label">+{hidden}</span>
                <span className="tf-pill-state">영향 없음</span>
              </li>
            )}
          </ol>
        </div>
      </LayoutGroup>

      <div className="tf-legend" aria-hidden="true">
        <span><i className="tf-k running" /> 실행 중</span>
        <span><i className="tf-k off" /> 영향 없음 · 돌리지 않음</span>
        <span><i className="tf-k ok" /> 통과</span>
        <span><i className="tf-k bad" /> 회귀</span>
        <span><i className="tf-line" /> 기록상 지나감</span>
        <span><i className="tf-line static" /> 호출 그래프</span>
      </div>
    </div>
  );
}

function label(state: string, p: SelectedTestClass, results: Record<string, ClassResult>): string {
  if (state === "off") return "돌리지 않음";
  if (state === "running" || state === "running-dim") return "실행 중";
  if (state === "on") return p.reasons.some((r) => r.kind === "CHANGED_TEST") ? "바뀐 테스트" : p.reasons.some((r) => r.kind === "UNKNOWN") ? "기록에 없음" : "영향 있음";
  if (state.startsWith("done-")) {
    const r = results[p.className];
    if (!r) return "결과 없음";
    if (r.regressions.length) return `회귀 ${r.regressions.length}`;
    if (r.newFailures.length) return `새 실패 ${r.newFailures.length}`;
    if (r.head?.failed) return `실패 ${r.head.failed}`;
    return `통과 ${r.head?.passed ?? r.base?.passed ?? 0}`;
  }
  return "";
}

/** 출발 노드 오른쪽 → 도착 노드 왼쪽. 세로로 쌓인 좁은 화면이면 아래 → 위 */
function wire(a: DOMRect, b: DOMRect, o: DOMRect): string {
  if (a.right <= b.left + 4) {
    const x1 = a.right - o.left;
    const y1 = a.top + a.height / 2 - o.top;
    const x2 = b.left - o.left;
    const y2 = b.top + b.height / 2 - o.top;
    const mx = (x1 + x2) / 2;
    return `M${x1} ${y1} C${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
  }
  const x1 = a.left + a.width / 2 - o.left;
  const y1 = a.bottom - o.top;
  const x2 = b.left + b.width / 2 - o.left;
  const y2 = b.top - o.top;
  const my = (y1 + y2) / 2;
  return `M${x1} ${y1} C${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
}

/** 출발 노드(바뀐 메서드 + 바뀐 테스트 · 기록에 없는 테스트 묶음), 실행 열, 무더기, 선 */
function build(s: TestSelection) {
  const reach: Record<string, { sub: string; tone: string }> = {
    TRACED: { sub: "기록상 지나감", tone: "run" },
    STATIC: { sub: "호출 그래프로만", tone: "static" },
    NONE: { sub: "닿는 테스트 없음", tone: "none" },
    OUTSIDE: { sub: "테스트 밖에서 실행", tone: "warn" },
    UNTRACKED: { sub: "기록 못 하는 위치", tone: "warn" },
  };
  const sources: Source[] = s.changes.slice(0, 30).map((c) => ({
    id: c.id,
    label: c.id,
    sub: `${c.kind === "ADDED" ? "추가" : c.kind === "REMOVED" ? "삭제" : "수정"} · ${reach[c.reach].sub}`,
    tone: reach[c.reach].tone,
  }));
  const shown = new Set(sources.map((x) => x.id));
  const impacted = s.tests.filter((t) => t.impacted);
  const edges: Edge[] = [];
  for (const t of impacted) {
    for (const r of t.reasons) {
      if ((r.kind === "TRACE" || r.kind === "STATIC") && r.target && shown.has(r.target)) {
        edges.push({ from: r.target, to: t.className, kind: r.kind });
      }
    }
  }
  const changed = impacted.filter((t) => t.reasons.some((r) => r.kind === "CHANGED_TEST"));
  const unknown = impacted.filter((t) => t.reasons.some((r) => r.kind === "UNKNOWN") && !changed.includes(t));
  if (changed.length) {
    sources.push({ id: "__changed", label: "PR 이 바꾼 테스트", sub: `${changed.length}개 · 늘 실행`, tone: "changed" });
    changed.forEach((t) => edges.push({ from: "__changed", to: t.className, kind: "SELF" }));
  }
  if (unknown.length) {
    sources.push({ id: "__unknown", label: "기록에 없는 테스트", sub: `${unknown.length}개 · 늘 실행`, tone: "unknown" });
    unknown.forEach((t) => edges.push({ from: "__unknown", to: t.className, kind: "SELF" }));
  }
  const rest = s.tests.filter((t) => !t.impacted);
  const pool = rest.slice(0, MAX_POOL);
  const hidden = Math.max(rest.length - MAX_POOL, 0) + Math.max(s.total - s.tests.length, 0);
  return { sources, impacted, pool, hidden, edges };
}
