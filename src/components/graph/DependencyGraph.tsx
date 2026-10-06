"use client";

import "@xyflow/react/dist/style.css";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { useMemo, useState, type CSSProperties } from "react";
import type { GraphData } from "@/lib/api";
import { fileName } from "@/lib/format";

const TYPE_LABEL: Record<string, string> = {
  IMPORTS: "import",
  CALLS: "호출",
  INJECTS: "주입",
  EXTENDS: "상속",
  IMPLEMENTS: "구현",
  METHOD_IMPLEMENTS: "구현",
  METHOD_OVERRIDES: "오버라이드",
  ACCESSES: "필드 접근",
  USES: "사용",
};

// 커뮤니티 색. 라이트·다크 둘 다에서 보이게 채도·명도를 가운데로 둔다
const HUES = [212, 140, 28, 280, 350, 180, 48, 320, 100, 250, 8, 160];
const LEGEND_LIMIT = 10;

type FileNodeData = { label: string; path: string; color: string; dim: boolean; selected: boolean };
type FileFlowNode = Node<FileNodeData, "file">;
type SimNode = SimulationNodeDatum & { id: string; group: string | null };

function FileNode({ data }: NodeProps<FileFlowNode>) {
  return (
    <div
      className={`file-node${data.dim ? " dim" : ""}${data.selected ? " selected" : ""}`}
      style={{ "--c": data.color } as CSSProperties}
      title={data.path}
    >
      {/* 간선을 노드 가운데에서 잇는다 */}
      <Handle type="target" position={Position.Top} isConnectable={false} className="center-handle" />
      <Handle type="source" position={Position.Top} isConnectable={false} className="center-handle" />
      {data.label}
    </div>
  );
}

const NODE_TYPES = { file: FileNode };

function typesText(types: Record<string, number>): string {
  return Object.entries(types)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${TYPE_LABEL[t] ?? t} ${n}`)
    .join(" · ");
}

/**
 * GitNexus 커뮤니티를 이름으로 묶는다. 같은 패키지가 여러 커뮤니티로 쪼개져 이름이 겹치는 경우가 많다.
 * 파일 수가 많은 묶음부터.
 */
function groupCommunities(data: GraphData) {
  const labelOf = new Map(data.communities.map((c) => [c.id, c.label]));
  const files = new Map<string, number>();
  for (const c of data.communities) files.set(c.label, (files.get(c.label) ?? 0) + c.files);
  const groups = [...files.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label, count]) => ({ label, files: count }));
  return { groups, groupOf: (community: string | null) => (community && labelOf.get(community)) || null };
}

/**
 * 레포 전체 파일 의존성 그래프 (GitNexus). 같은 묶음(기능 커뮤니티) 파일끼리 모이게 배치하고,
 * 파일을 누르면 그 파일이 쓰는 파일과 그 파일을 쓰는 파일만 강조한다.
 */
export function DependencyGraph({ data }: { data: GraphData }) {
  const [selected, setSelected] = useState<string | null>(null);

  const { groups, groupOf } = useMemo(() => groupCommunities(data), [data]);
  const color = useMemo(() => {
    const byGroup = new Map(groups.map((g, i) => [g.label, `hsl(${HUES[i % HUES.length]} 60% 50%)`]));
    return (group: string | null) => (group && byGroup.get(group)) || "hsl(210 8% 55%)";
  }, [groups]);

  // 배치는 데이터가 바뀔 때만 한 번 계산한다 (d3-force 를 끝까지 돌린 정지 상태)
  const positions = useMemo(() => {
    // 묶음마다 원 둘레에 중심을 두고 그쪽으로 당긴다. 묶음 밖 파일은 가운데
    const index = new Map(groups.map((g, i) => [g.label, i]));
    const radius = 80 + 50 * Math.sqrt(data.nodes.length);
    const center = (n: SimNode) => {
      const i = n.group === null ? undefined : index.get(n.group);
      if (i === undefined || groups.length < 2) return { x: 0, y: 0 };
      const angle = (2 * Math.PI * i) / groups.length;
      return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
    };
    const nodes: SimNode[] = data.nodes.map((n) => ({ id: n.id, group: groupOf(n.community) }));
    const groupById = new Map(nodes.map((n) => [n.id, n.group]));
    const links: (SimulationLinkDatum<SimNode> & { inner: boolean })[] = data.edges.map((e) => ({
      source: e.source,
      target: e.target,
      inner: groupById.get(e.source) !== null && groupById.get(e.source) === groupById.get(e.target),
    }));
    const simulation = forceSimulation(nodes)
      .force(
        "link",
        forceLink<SimNode, (typeof links)[number]>(links)
          .id((d) => d.id)
          .distance((l) => (l.inner ? 60 : 140))
          .strength((l) => (l.inner ? 0.4 : 0.03)),
      )
      .force("charge", forceManyBody().strength(-260))
      .force("collide", forceCollide(55))
      .force("x", forceX<SimNode>((d) => center(d).x).strength(0.15))
      .force("y", forceY<SimNode>((d) => center(d).y).strength(0.15))
      .stop();
    for (let i = 0; i < 300; i++) simulation.tick();
    return new Map(nodes.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]));
  }, [data, groups, groupOf]);

  const nodeById = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data.nodes]);

  const outgoing = selected ? data.edges.filter((e) => e.source === selected) : [];
  const incoming = selected ? data.edges.filter((e) => e.target === selected) : [];
  const related = new Set([selected, ...outgoing.map((e) => e.target), ...incoming.map((e) => e.source)]);

  const nodes: FileFlowNode[] = data.nodes.map((n) => {
    const p = positions.get(n.id)!;
    return {
      id: n.id,
      type: "file",
      position: p,
      origin: [0.5, 0.5],
      data: {
        label: fileName(n.id),
        path: n.id,
        color: color(groupOf(n.community)),
        dim: selected !== null && !related.has(n.id),
        selected: n.id === selected,
      },
    };
  });

  const edges: Edge[] = data.edges.map((e) => {
    const active = selected !== null && (e.source === selected || e.target === selected);
    const faded = selected !== null && !active;
    return {
      id: `${e.source}->${e.target}`,
      source: e.source,
      target: e.target,
      type: "straight",
      style: {
        strokeWidth: Math.min(1 + Math.log2(e.weight), 4),
        stroke: active ? "var(--accent)" : undefined,
        opacity: faded ? 0.08 : active ? 1 : 0.45,
      },
      markerEnd: { type: MarkerType.ArrowClosed, color: active ? "var(--accent)" : undefined },
      zIndex: active ? 1 : 0,
    };
  });

  const { stats } = data;
  const current = selected ? nodeById.get(selected) : undefined;

  if (data.nodes.length === 0) {
    return <div className="empty">파일 사이 의존이 보이지 않습니다 (GitNexus 가 지원하지 않는 언어일 수 있습니다)</div>;
  }

  return (
    <div>
      <p className="muted graph-stats">
        파일 {stats.shownFiles}
        {stats.truncated ? ` / 연결된 ${stats.connectedFiles}` : ""}개 (전체 {stats.files}) · 의존 {stats.shownEdges}개 ·
        분석 {(stats.analyzeMs / 1000).toFixed(0)}초
        {stats.truncated && " · 연결이 많은 파일만 표시"}
      </p>
      <div className="graph-legend">
        {groups.slice(0, LEGEND_LIMIT).map((g) => (
          <span key={g.label} className="legend-chip">
            <span className="legend-dot" style={{ background: color(g.label) }} />
            {g.label} <span className="muted">{g.files}</span>
          </span>
        ))}
        {groups.length > LEGEND_LIMIT && <span className="muted">외 {groups.length - LEGEND_LIMIT}개 묶음</span>}
      </div>
      <div className="dependency-graph">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          fitView
          minZoom={0.1}
          nodesDraggable={false}
          nodesConnectable={false}
          zoomOnScroll={false}
          preventScrolling={false}
          onNodeClick={(_, node) => setSelected(node.id === selected ? null : node.id)}
          onPaneClick={() => setSelected(null)}
          colorMode="system"
        >
          <Background gap={24} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      {current ? (
        <div className="stage-detail graph-detail">
          <div className="row">
            <code>{current.id}</code>
            <button className="small" onClick={() => setSelected(null)}>
              선택 해제
            </button>
          </div>
          <p className="muted">
            {groupOf(current.community) ? `묶음 ${groupOf(current.community)}` : "묶음 없음"} · 심볼 {current.symbols}개
          </p>
          <div className="graph-deps">
            <DepList title="이 파일이 쓰는 파일" items={outgoing.map((e) => ({ file: e.target, types: e.types }))} onPick={setSelected} />
            <DepList title="이 파일을 쓰는 파일" items={incoming.map((e) => ({ file: e.source, types: e.types }))} onPick={setSelected} />
          </div>
        </div>
      ) : (
        <p className="muted">파일을 누르면 의존 관계를 볼 수 있습니다. 화살표는 &quot;A → B: A 가 B 를 쓴다&quot;입니다.</p>
      )}
    </div>
  );
}

function DepList({
  title,
  items,
  onPick,
}: {
  title: string;
  items: { file: string; types: Record<string, number> }[];
  onPick: (file: string) => void;
}) {
  return (
    <div>
      <h4>
        {title} <span className="muted">{items.length}</span>
      </h4>
      {items.length === 0 ? (
        <p className="muted">없음</p>
      ) : (
        <ul className="dep-list">
          {items.map((d) => (
            <li key={d.file}>
              <button className="link" onClick={() => onPick(d.file)} title={d.file}>
                {fileName(d.file)}
              </button>{" "}
              <span className="muted">{typesText(d.types)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
