import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import type { GraphData } from "@/lib/api";
import { fileName } from "@/lib/format";

// 어두운 배경에서 잘 보이는 색. 묶음(파일 수 많은 순)마다 하나씩
export const GROUP_COLORS = [
  "#818cf8", "#22d3ee", "#f472b6", "#a3e635", "#fb923c", "#facc15",
  "#c084fc", "#34d399", "#f87171", "#60a5fa", "#2dd4bf", "#e879f9",
];
export const UNGROUPED_COLOR = "#64748b";
export const EDGE_COLOR = "#2a2a3d";
/** 선택한 파일이 쓰는 쪽 / 선택한 파일을 쓰는 쪽 */
export const OUT_COLOR = "#22d3ee";
export const IN_COLOR = "#f472b6";

export const TYPE_LABEL: Record<string, string> = {
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

export type Group = { label: string; files: number; color: string };

export type NodeAttrs = {
  label: string;
  path: string;
  group: string | null;
  symbols: number;
  degree: number;
  x: number;
  y: number;
  size: number;
  color: string;
};

/** layoutWeight: 배치용 당기는 힘. 같은 묶음 안 연결을 세게 해서 묶음끼리 뭉치게 한다 */
export type EdgeAttrs = { size: number; color: string; weight: number; layoutWeight: number; types: Record<string, number> };

/**
 * GitNexus 커뮤니티를 이름으로 묶는다. 같은 패키지가 여러 커뮤니티로 쪼개져 이름이 겹치는 경우가 많다.
 * 파일 수가 많은 묶음부터.
 */
export function groupCommunities(data: GraphData) {
  const labelOf = new Map(data.communities.map((c) => [c.id, c.label]));
  const files = new Map<string, number>();
  for (const c of data.communities) files.set(c.label, (files.get(c.label) ?? 0) + c.files);
  const groups: Group[] = [...files.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label, count], i) => ({ label, files: count, color: GROUP_COLORS[i % GROUP_COLORS.length] }));
  return { groups, groupOf: (community: string | null) => (community && labelOf.get(community)) || null };
}

/** 문자열 → [0, 1) 고정 난수. 같은 데이터면 늘 같은 배치가 나오게 한다 */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

/** 파일 그래프를 만들고 ForceAtlas2 로 배치까지 끝낸다. */
export function buildGraph(data: GraphData, groups: Group[], groupOf: (c: string | null) => string | null) {
  const graph = new Graph<NodeAttrs, EdgeAttrs>({ type: "directed" });
  const colorOf = new Map(groups.map((g) => [g.label, g.color]));
  const index = new Map(groups.map((g, i) => [g.label, i]));

  const degree = new Map<string, number>();
  for (const e of data.edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }

  // 시작 위치: 묶음마다 원 둘레의 한 점 근처. ForceAtlas2 가 여기서 출발해 묶음끼리 뭉친다
  for (const n of data.nodes) {
    const group = groupOf(n.community);
    const i = group === null ? undefined : index.get(group);
    const angle = i === undefined ? 0 : (2 * Math.PI * i) / Math.max(groups.length, 1);
    const radius = i === undefined ? 0 : 100;
    const d = degree.get(n.id) ?? 0;
    graph.addNode(n.id, {
      label: fileName(n.id),
      path: n.id,
      group,
      symbols: n.symbols,
      degree: d,
      x: radius * Math.cos(angle) + (hash01(n.id) - 0.5) * 40,
      y: radius * Math.sin(angle) + (hash01(n.id + "y") - 0.5) * 40,
      size: Math.min(4 + Math.sqrt(d) * 2.2, 22),
      color: (group && colorOf.get(group)) || UNGROUPED_COLOR,
    });
  }
  for (const e of data.edges) {
    if (!graph.hasNode(e.source) || !graph.hasNode(e.target) || graph.hasEdge(e.source, e.target)) continue;
    const a = graph.getNodeAttribute(e.source, "group");
    const sameGroup = a !== null && a === graph.getNodeAttribute(e.target, "group");
    graph.addEdge(e.source, e.target, {
      size: Math.min(0.6 + Math.log2(1 + e.weight) * 0.5, 3),
      color: EDGE_COLOR,
      weight: e.weight,
      layoutWeight: sameGroup ? 6 : 1,
      types: e.types,
    });
  }

  const large = graph.order > 300;
  forceAtlas2.assign(graph, {
    iterations: large ? 250 : 500,
    getEdgeWeight: "layoutWeight",
    settings: {
      ...forceAtlas2.inferSettings(graph),
      linLogMode: true,
      barnesHutOptimize: large,
      edgeWeightInfluence: 1,
      gravity: 1,
      scalingRatio: 4,
    },
  });
  return graph;
}

export function typesText(types: Record<string, number>): string {
  return Object.entries(types)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${TYPE_LABEL[t] ?? t} ${n}`)
    .join(" · ");
}
