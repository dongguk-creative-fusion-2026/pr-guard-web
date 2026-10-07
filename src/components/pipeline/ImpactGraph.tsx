"use client";

import { Background, MarkerType, Position, ReactFlow, ReactFlowProvider, type Edge, type Node } from "@xyflow/react";
import { useMemo } from "react";
import type { StageData } from "./stages";

type Caller = { id: string; file: string; line: number };
type ChangedMethod = {
  id: string;
  baseId: string | null;
  kind: "ADDED" | "REMOVED" | "MODIFIED";
  signatureChanged: boolean;
  test: boolean;
  callers: Caller[];
  stale: Caller[];
};

const KIND_LABEL = { ADDED: "추가", REMOVED: "삭제", MODIFIED: "수정" } as const;

function short(id: string): string {
  const hash = id.indexOf("#");
  const type = hash < 0 ? id : id.slice(0, hash);
  return type.slice(type.lastIndexOf(".") + 1) + (hash < 0 ? "" : id.slice(hash));
}

/**
 * 바뀐 메서드(오른쪽)와 그 메서드를 부르는 곳(왼쪽). 옛 시그니처로 부르는 곳은 빨간 점선.
 * B(변경 영향 분석)가 근거로 쓰는 그래프다.
 */
export function ImpactGraph({ data }: { data: StageData }) {
  const methods = (data.methods ?? []) as ChangedMethod[];

  const { nodes, edges, height } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const callerIds = new Map<string, string>();
    let y = 0;
    let callerY = 0;
    methods.forEach((m, i) => {
      const mid = `m${i}`;
      const related = [...m.callers.map((c) => ({ ...c, stale: false })), ...m.stale.map((c) => ({ ...c, stale: true }))];
      const blockHeight = Math.max(1, related.length) * 64;
      nodes.push({
        id: mid,
        position: { x: 380, y: y + blockHeight / 2 - 32 },
        data: {
          label: (
            <div>
              <div className={`impact-kind ${m.kind}${m.signatureChanged ? " sig" : ""}`}>
                {m.signatureChanged ? "시그니처 변경" : KIND_LABEL[m.kind]}
                {m.test ? " · 테스트" : ""}
              </div>
              <code>{short(m.id)}</code>
            </div>
          ),
        },
        className: `impact-node method ${m.kind}`,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      });
      related.forEach((c) => {
        const key = `${c.id}@${c.line}`;
        let cid = callerIds.get(key);
        if (!cid) {
          cid = `c${callerIds.size}`;
          callerIds.set(key, cid);
          nodes.push({
            id: cid,
            position: { x: 0, y: callerY },
            data: {
              label: (
                <div>
                  <code>{short(c.id)}</code>
                  <div className="muted">
                    {c.file.slice(c.file.lastIndexOf("/") + 1)}:{c.line}
                  </div>
                </div>
              ),
            },
            className: `impact-node caller${c.stale ? " stale" : ""}`,
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
          });
          callerY += 64;
        }
        edges.push({
          id: `${cid}-${mid}`,
          source: cid,
          target: mid,
          animated: c.stale,
          style: c.stale ? { stroke: "var(--danger)", strokeDasharray: "6 4", strokeWidth: 2 } : { strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed },
          label: c.stale ? "옛 시그니처" : undefined,
        });
      });
      y += blockHeight;
    });
    return { nodes, edges, height: Math.max(y, callerY, 160) };
  }, [methods]);

  if (methods.length === 0) {
    return <div className="empty">바뀐 메서드 없음</div>;
  }
  return (
    <div className="impact-graph" style={{ height: Math.min(height + 60, 520) }}>
      {/* 파이프라인 그래프 안에 놓이므로 저장소를 따로 둔다 (같이 쓰면 바깥 노드가 섞여 그려진다) */}
      <ReactFlowProvider>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        zoomOnScroll={false}
        preventScrolling={false}
        colorMode="system"
      >
        <Background gap={20} />
      </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
