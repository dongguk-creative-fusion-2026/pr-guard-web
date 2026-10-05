"use client";

import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { AnimatePresence, motion } from "motion/react";
import { durationMs, STAGE_META, stageMetrics, type StageId, type StageState } from "./stages";

export type StageNodeData = {
  stage: Exclude<StageId, "REVIEW">;
  state: StageState;
  selected: boolean;
};

export type StageFlowNode = Node<StageNodeData, "stage">;

const STATUS_ICON: Record<StageState["status"], string> = {
  PENDING: "",
  RUNNING: "",
  DONE: "✓",
  FAILED: "✕",
  SKIPPED: "–",
};

export function StageNode({ data }: NodeProps<StageFlowNode>) {
  const { stage, state, selected } = data;
  const meta = STAGE_META[stage];
  const metrics = stageMetrics(stage, state.data);
  const ms = durationMs(state);

  return (
    <motion.div
      className={`stage-node ${state.status}${selected ? " selected" : ""}`}
      initial={false}
      animate={
        state.status === "RUNNING"
          ? { scale: [1, 1.035, 1], transition: { repeat: Infinity, duration: 1.2 } }
          : { scale: 1 }
      }
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <div className="stage-head">
        <span className="stage-icon">{meta.icon}</span>
        <span className="stage-label">{meta.label}</span>
        <span className="stage-status">
          {state.status === "RUNNING" ? (
            <span className="spinner" />
          ) : (
            <AnimatePresence>
              {STATUS_ICON[state.status] && (
                <motion.span
                  key={state.status}
                  initial={{ scale: 0, rotate: -45 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 15 }}
                >
                  {STATUS_ICON[state.status]}
                </motion.span>
              )}
            </AnimatePresence>
          )}
        </span>
      </div>
      <div className="stage-message">{state.message ?? meta.hint}</div>
      {(metrics.length > 0 || ms != null) && (
        <motion.div className="stage-metrics" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
          {metrics.map((m) => (
            <span key={m}>{m}</span>
          ))}
          {ms != null && <span className="ms">{ms}ms</span>}
        </motion.div>
      )}
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </motion.div>
  );
}
