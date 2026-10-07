"use client";

import "@xyflow/react/dist/style.css";
import { Background, MarkerType, ReactFlow, ReactFlowProvider, useReactFlow, type Edge } from "@xyflow/react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { StageDetail } from "./StageDetail";
import { StageNode, type StageFlowNode } from "./StageNode";
import {
  EXEC_STAGES,
  EDGES,
  GRAPH_STAGES,
  POSITIONS,
  POSITIONS_VERTICAL,
  reduceStates,
  type ReviewEvent,
  type StageId,
} from "./stages";
import { usePipelineEvents } from "./usePipelineEvents";

/** 실행 검증 레인 뒤에 까는 묶음 상자 (누를 수 없는 배경) */
function LaneNode({ data }: { data: { width: number; height: number; label: string } }) {
  return (
    <div className="exec-lane" style={{ width: data.width, height: data.height }}>
      <span>{data.label}</span>
    </div>
  );
}

const nodeTypes = { stage: StageNode, lane: LaneNode };
const NODE_W = 184;
const NODE_H = 74;
const LANE_PAD = 18;
/** 이보다 좁으면 세로 배치 */
const VERTICAL_BELOW = 900;
const SPEEDS = [1, 2, 4] as const;
const VERDICT_LABEL: Record<string, string> = {
  MERGEABLE: "머지 가능",
  NEEDS_CHANGES: "수정 후 머지",
  NOT_RECOMMENDED: "머지 비권장",
};

/**
 * 리뷰 파이프라인 그래프. 진행 중이면 실시간으로, 끝난 리뷰는 다시보기로 단계가 켜지는 모습을 보여 준다.
 */
export function PipelineView({ reviewId, projectId }: { reviewId: number; projectId?: number }) {
  return (
    <ReactFlowProvider>
      <Pipeline reviewId={reviewId} projectId={projectId} />
    </ReactFlowProvider>
  );
}

/** 그래프 영역 크기가 바뀔 때마다 다시 맞춘다 (fitView 는 처음 한 번만 하므로). */
function useContainerFit(vertical: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const { fitView } = useReactFlow();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
      requestAnimationFrame(() => fitView({ padding: 0.08 }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fitView]);
  useEffect(() => {
    requestAnimationFrame(() => fitView({ padding: 0.08 }));
  }, [vertical, fitView]);
  return { ref, width };
}

function Pipeline({ reviewId, projectId }: { reviewId: number; projectId?: number }) {
  const router = useRouter();
  const { events, ended } = usePipelineEvents(reviewId);
  const [replay, setReplay] = useState<{ cursor: number; speed: number } | null>(null);
  const [selected, setSelected] = useState<Exclude<StageId, "REVIEW"> | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const sawLive = useRef(false);
  const [vertical, setVertical] = useState(false);
  const { ref: graphRef, width } = useContainerFit(vertical);

  useEffect(() => {
    if (width > 0) setVertical(width < VERTICAL_BELOW);
  }, [width]);

  // 고른 단계를 주소(?stage=)에 남겨 그 단계 상세를 바로 공유할 수 있게 한다
  useEffect(() => {
    const stage = new URL(window.location.href).searchParams.get("stage");
    if (stage && GRAPH_STAGES.includes(stage as Exclude<StageId, "REVIEW">)) setSelected(stage as Exclude<StageId, "REVIEW">);
  }, []);
  useEffect(() => {
    if (!selected) return;
    const url = new URL(window.location.href);
    url.searchParams.set("stage", selected);
    window.history.replaceState(null, "", url);
  }, [selected]);

  // 진행 중인 리뷰를 보다가 끝나면 아래 지적 사항 영역을 새로 불러온다
  useEffect(() => {
    if (!ended && events.length > 0) sawLive.current = true;
    if (ended && sawLive.current) {
      sawLive.current = false;
      router.refresh();
    }
  }, [ended, events.length, router]);

  // 다시보기: 실제 이벤트 간격을 줄여서(최소 120ms, 최대 1.2s) 재생
  useEffect(() => {
    if (!replay || replay.cursor >= events.length) return;
    const prev = events[replay.cursor - 1];
    const next = events[replay.cursor];
    const gap = prev ? Date.parse(next.at) - Date.parse(prev.at) : 300;
    const delay = Math.min(Math.max(gap, 120), 1200) / replay.speed;
    const timer = setTimeout(() => setReplay((r) => (r ? { ...r, cursor: r.cursor + 1 } : r)), delay);
    return () => clearTimeout(timer);
  }, [replay, events]);

  const visible: ReviewEvent[] = replay ? events.slice(0, replay.cursor) : events;
  const states = useMemo(() => reduceStates(visible), [visible]);
  const running = replay ? replay.cursor < events.length : !ended;

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [running]);

  // 선택이 없으면 마지막으로 움직인 단계를 따라간다
  const lastStage = [...visible].reverse().find((e) => e.stage !== "REVIEW")?.stage as
    | Exclude<StageId, "REVIEW">
    | undefined;
  const focus = selected ?? lastStage ?? null;

  const stageNodes: StageFlowNode[] = GRAPH_STAGES.map((stage) => ({
    id: stage,
    type: "stage",
    position: (vertical ? POSITIONS_VERTICAL : POSITIONS)[stage],
    data: { stage, state: states[stage], selected: focus === stage, vertical },
    draggable: false,
  }));
  const lane = EXEC_STAGES.map((s) => (vertical ? POSITIONS_VERTICAL : POSITIONS)[s]);
  const laneX = Math.min(...lane.map((p) => p.x)) - LANE_PAD;
  const laneY = Math.min(...lane.map((p) => p.y)) - LANE_PAD - 16;
  const laneNode = {
    id: "exec-lane",
    type: "lane",
    position: { x: laneX, y: laneY },
    data: {
      width: Math.max(...lane.map((p) => p.x)) + NODE_W + LANE_PAD - laneX,
      height: Math.max(...lane.map((p) => p.y)) + NODE_H + LANE_PAD - laneY,
      label: "실행 검증 · 쿠버네티스",
    },
    draggable: false,
    selectable: false,
    zIndex: -1,
  };
  const nodes = [laneNode, ...stageNodes] as unknown as StageFlowNode[];

  const edges: Edge[] = EDGES.map(([source, target]) => {
    const t = states[target].status;
    const s = states[source].status;
    const active = t === "RUNNING" || (s === "DONE" && t === "PENDING" && running);
    const color =
      t === "FAILED"
        ? "var(--danger)"
        : t === "DONE"
          ? "var(--ok)"
          : active
            ? "var(--accent)"
            : "var(--border)";
    return {
      id: `${source}-${target}`,
      source,
      target,
      animated: active,
      style: {
        stroke: color,
        strokeWidth: active || t === "DONE" ? 2.5 : 1.5,
        strokeDasharray: t === "SKIPPED" ? "4 4" : undefined,
        opacity: t === "SKIPPED" ? 0.5 : 1,
      },
      markerEnd: { type: MarkerType.ArrowClosed, color },
    };
  });

  const review = states.REVIEW;
  const startedAt = visible.find((e) => e.stage === "REVIEW")?.at;
  const replayStart = replay && startedAt ? Date.parse(startedAt) : null;
  const elapsed =
    review.startedAt == null
      ? null
      : review.endedAt != null
        ? review.endedAt - review.startedAt
        : replayStart != null && visible.length > 0
          ? Date.parse(visible[visible.length - 1].at) - replayStart
          : now - review.startedAt;
  const verdict = states.VERDICT.status === "DONE" ? (states.VERDICT.data?.verdict as string | undefined) : undefined;

  if (ended && events.length === 0) {
    return <div className="empty">이 리뷰는 진행 기록이 없습니다 (시각화 기능을 넣기 전에 끝난 리뷰).</div>;
  }

  return (
    <section className="pipeline">
      <div className="pipeline-bar">
        <span className={`live-dot ${running ? "on" : ""}`} />
        <strong>{replay ? (running ? "다시보기" : "다시보기 끝") : running ? "분석 중" : "분석 완료"}</strong>
        {elapsed != null && <span className="muted">{(elapsed / 1000).toFixed(1)}s</span>}
        <span className="spacer" />
        {ended && (
          <>
            <button className="small" onClick={() => setReplay({ cursor: 0, speed: replay?.speed ?? 1 })}>
              ▶ 다시보기
            </button>
            {SPEEDS.map((sp) => (
              <button
                key={sp}
                className={`small ${replay?.speed === sp ? "primary" : ""}`}
                onClick={() => setReplay((r) => (r ? { ...r, speed: sp } : { cursor: 0, speed: sp }))}
              >
                {sp}×
              </button>
            ))}
          </>
        )}
      </div>

      <div
        ref={graphRef}
        className="pipeline-graph"
        // 세로 배치는 폭에 맞춰 줄어드는 만큼 높이도 줄인다
        style={vertical && width > 0 ? { height: Math.min(900, Math.round(width * 1.35)) } : undefined}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.08 }}
          nodesDraggable={false}
          nodesConnectable={false}
          zoomOnScroll={false}
          preventScrolling={false}
          onNodeClick={(_, node) => node.type === "stage" && setSelected(node.id as Exclude<StageId, "REVIEW">)}
          colorMode="system"
          minZoom={0.3}
        >
          <Background gap={24} />
        </ReactFlow>
        <AnimatePresence>
          {verdict && (
            <motion.div
              key={verdict}
              className={`verdict-reveal ${verdict}`}
              initial={{ opacity: 0, scale: 0.6, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
            >
              {VERDICT_LABEL[verdict] ?? verdict}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <p className="muted pipeline-hint">노드를 누르면 그 단계가 만든 결과를 볼 수 있습니다.</p>

      {focus && <StageDetail stage={focus} state={states[focus]} projectId={projectId} />}
    </section>
  );
}
