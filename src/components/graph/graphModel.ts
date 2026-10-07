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
export const EDGE_COLOR = "#2c2c42";
/** 선택한 것이 쓰는(호출하는) 쪽 / 선택한 것을 쓰는(호출하는) 쪽 */
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

// 배치 단위 (그래프 좌표). 함수 한 줄 높이, 상자 안쪽 여백, 파일 이름 자리, 상자 사이 간격.
// 함수 한 줄이 화면에서 18px 쯤 될 때(= 1단위 1px) 이름표 한 글자가 8단위 안쪽이라 그 기준으로 너비를 잡는다
const CELL = 18;
const PAD = 8;
const HEADER = 20;
const GAP = 18;
const CHAR = 8;
const FUNCTION_SIZE = 3.6;

/** 상자 안 열 수: 함수가 많으면 2~3열로 나눈다 */
function columnsFor(count: number): number {
  return count <= 12 ? 1 : count <= 30 ? 2 : 3;
}

function displayName(f: CodeFunction): string {
  return f.placeholder ? f.name : f.kind === "Constructor" ? `new ${f.name}` : f.name;
}

export type Group = { label: string; files: number; color: string };

/** 화면에 그리는 함수. 함수 정보가 없는 파일(예전 그래프, 함수가 없는 파일)은 파일 자체를 함수 하나로 둔다 */
export type CodeFunction = {
  id: string;
  name: string;
  kind: string;
  file: string;
  line: number;
  endLine: number;
  /** 파일 자리표시 노드 */
  placeholder: boolean;
};

export type NodeAttrs = {
  label: string;
  file: string;
  kind: string;
  line: number;
  placeholder: boolean;
  x: number;
  y: number;
  size: number;
  color: string;
};

/** runtimeOnly: 정적 분석에는 없고 실행 중에만 일어난 호출 (런타임 오버레이가 더한 간선) */
export type EdgeAttrs = { size: number; color: string; weight: number; runtimeOnly?: boolean };

/** 파일 상자. x, y 는 왼쪽 위 (그래프 좌표에서 y 는 위로 갈수록 커지므로 화면에 그릴 때 뒤집는다) */
export type FileBox = {
  path: string;
  label: string;
  group: string | null;
  color: string;
  symbols: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 상자 안 열 수와 한 열 너비 */
  cols: number;
  colW: number;
  functions: string[];
};

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

/** 그래프의 함수 목록. 함수가 하나도 없는 파일은 파일 자리표시 노드 하나를 넣는다 */
export function codeFunctions(data: GraphData): CodeFunction[] {
  const result: CodeFunction[] = (data.functions ?? []).map((f) => ({ ...f, placeholder: false }));
  const withFunctions = new Set(result.map((f) => f.file));
  for (const n of data.nodes) {
    if (withFunctions.has(n.id)) continue;
    result.push({
      id: `file:${n.id}`,
      name: fileName(n.id),
      kind: "File",
      file: n.id,
      line: 0,
      endLine: Number.MAX_SAFE_INTEGER,
      placeholder: true,
    });
  }
  return result;
}

/** 문자열 → [0, 1) 고정 난수. 같은 데이터면 늘 같은 배치가 나오게 한다 */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

/** 파일 사이 의존 그래프를 ForceAtlas2 로 배치해 파일마다 중심점을 얻는다 */
function filePositions(data: GraphData, groups: Group[], groupOf: (c: string | null) => string | null) {
  const graph = new Graph<{ x: number; y: number; size: number }, { weight: number }>({ type: "directed" });
  const index = new Map(groups.map((g, i) => [g.label, i]));
  const groupByFile = new Map(data.nodes.map((n) => [n.id, groupOf(n.community)]));
  for (const n of data.nodes) {
    const group = groupByFile.get(n.id) ?? null;
    const i = group === null ? undefined : index.get(group);
    const angle = i === undefined ? 0 : (2 * Math.PI * i) / Math.max(groups.length, 1);
    const radius = i === undefined ? 0 : 100;
    graph.addNode(n.id, {
      x: radius * Math.cos(angle) + (hash01(n.id) - 0.5) * 40,
      y: radius * Math.sin(angle) + (hash01(n.id + "y") - 0.5) * 40,
      size: 1,
    });
  }
  for (const e of data.edges) {
    if (!graph.hasNode(e.source) || !graph.hasNode(e.target) || graph.hasEdge(e.source, e.target)) continue;
    const a = groupByFile.get(e.source);
    // 같은 묶음 안 연결을 세게 당겨 묶음끼리 뭉치게 한다
    graph.addEdge(e.source, e.target, { weight: a && a === groupByFile.get(e.target) ? 6 : 1 });
  }
  const large = graph.order > 300;
  forceAtlas2.assign(graph, {
    iterations: large ? 250 : 500,
    getEdgeWeight: "weight",
    settings: {
      ...forceAtlas2.inferSettings(graph),
      linLogMode: true,
      barnesHutOptimize: large,
      edgeWeightInfluence: 1,
      gravity: 1,
      scalingRatio: 4,
    },
  });
  return new Map(graph.mapNodes((id, a) => [id, { x: a.x, y: a.y }] as const));
}

/** 상자들이 겹치지 않을 때까지 서로 민다 (겹친 양이 작은 축으로) */
function separate(boxes: FileBox[]) {
  for (let iter = 0; iter < 200; iter++) {
    let moved = false;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const dx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) + GAP;
        const dy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) + GAP;
        if (dx <= 0 || dy <= 0) continue;
        moved = true;
        if (dx < dy) {
          const push = dx / 2 + 0.5;
          const dir = a.x + a.w / 2 <= b.x + b.w / 2 ? -1 : 1;
          a.x += dir * push;
          b.x -= dir * push;
        } else {
          const push = dy / 2 + 0.5;
          const dir = a.y + a.h / 2 <= b.y + b.h / 2 ? -1 : 1;
          a.y += dir * push;
          b.y -= dir * push;
        }
      }
    }
    if (!moved) break;
  }
}

/**
 * 함수 그래프와 파일 상자를 만든다.
 * 파일 위치는 파일 의존 그래프(ForceAtlas2)에서 정하고, 함수는 상자 안에 줄 번호 순서로 한 줄에 하나씩(점 + 이름) 놓는다.
 * 상자 너비는 가장 긴 함수 이름과 파일 이름에 맞춘다.
 */
export function buildCodeGraph(data: GraphData, groups: Group[], groupOf: (c: string | null) => string | null) {
  const colorOf = new Map(groups.map((g) => [g.label, g.color]));
  const functions = codeFunctions(data);
  const byFile = new Map<string, CodeFunction[]>();
  for (const f of functions) byFile.set(f.file, [...(byFile.get(f.file) ?? []), f]);

  const centers = filePositions(data, groups, groupOf);
  const boxes: FileBox[] = data.nodes.map((n) => {
    const list = (byFile.get(n.id) ?? []).sort((a, b) => a.line - b.line);
    const placeholderOnly = list.every((f) => f.placeholder);
    const cols = columnsFor(list.length);
    const rows = placeholderOnly ? 0 : Math.ceil(list.length / cols);
    const longest = Math.max(0, ...list.filter((f) => !f.placeholder).map((f) => displayName(f).length));
    const colW = longest * CHAR + 22;
    const group = groupOf(n.community);
    return {
      path: n.id,
      label: fileName(n.id),
      group,
      color: (group && colorOf.get(group)) || UNGROUPED_COLOR,
      symbols: n.symbols,
      x: 0,
      y: 0,
      w: Math.max(cols * colW + PAD * 2, fileName(n.id).length * CHAR + 20, 80),
      h: rows * CELL + PAD * 2 + HEADER,
      cols,
      colW,
      functions: list.map((f) => f.id),
    };
  });

  // 파일 중심점을 상자들이 들어갈 만큼 넓힌 뒤 겹침을 푼다
  const pts = boxes.map((b) => centers.get(b.path) ?? { x: 0, y: 0 });
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const area = Math.max((Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)), 1);
  const boxArea = boxes.reduce((sum, b) => sum + (b.w + GAP) * (b.h + GAP), 0);
  const scale = Math.sqrt((boxArea * 2.2) / area);
  boxes.forEach((b, i) => {
    b.x = pts[i].x * scale - b.w / 2;
    b.y = pts[i].y * scale - b.h / 2;
  });
  separate(boxes);

  const graph = new Graph<NodeAttrs, EdgeAttrs>({ type: "directed" });
  const fnById = new Map(functions.map((f) => [f.id, f]));
  for (const box of boxes) {
    const rows = Math.ceil(box.functions.length / box.cols);
    box.functions.forEach((id, i) => {
      const f = fnById.get(id)!;
      // 위에서 아래로 한 열을 채운 뒤 다음 열
      const col = Math.floor(i / rows);
      const row = i % rows;
      graph.addNode(id, {
        label: displayName(f),
        file: f.file,
        kind: f.kind,
        line: f.line,
        placeholder: f.placeholder,
        // 함수 정보가 없는 파일은 상자 가운데 점 하나 (이름은 상자 머리에 있으니 점만)
        x: f.placeholder ? box.x + box.w / 2 : box.x + PAD + col * box.colW + 8,
        // 그래프 좌표는 y 가 위로 커진다. 상자 안에서는 위에서 아래로 채운다
        y: f.placeholder ? -(box.y + box.h / 2 + HEADER / 4) : -(box.y + HEADER + PAD + (row + 0.5) * CELL),
        size: f.placeholder ? FUNCTION_SIZE * 1.4 : FUNCTION_SIZE,
        color: box.color,
      });
    });
  }

  if (data.calls && data.functions) {
    for (const c of data.calls) {
      if (!graph.hasNode(c.source) || !graph.hasNode(c.target) || graph.hasEdge(c.source, c.target)) continue;
      graph.addEdge(c.source, c.target, { size: Math.min(0.5 + Math.log2(1 + c.weight) * 0.4, 2), color: EDGE_COLOR, weight: c.weight });
    }
  } else {
    // 예전 그래프: 파일 자리표시 노드끼리 파일 의존을 잇는다
    for (const e of data.edges) {
      const s = `file:${e.source}`;
      const t = `file:${e.target}`;
      if (!graph.hasNode(s) || !graph.hasNode(t) || graph.hasEdge(s, t)) continue;
      graph.addEdge(s, t, { size: Math.min(0.6 + Math.log2(1 + e.weight) * 0.5, 3), color: EDGE_COLOR, weight: e.weight });
    }
  }

  return { graph, boxes: new Map(boxes.map((b) => [b.path, b])) };
}

/** 파일 안에서 line 을 감싸는 함수 (없으면 null) */
export function functionAt(functions: CodeFunction[], file: string, line: number): CodeFunction | null {
  let best: CodeFunction | null = null;
  for (const f of functions) {
    if (f.file !== file || f.placeholder || f.line > line || f.endLine < line) continue;
    // 안쪽(나중에 시작하는) 함수를 고른다
    if (!best || f.line > best.line) best = f;
  }
  return best;
}

export function typesText(types: Record<string, number>): string {
  return Object.entries(types)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${TYPE_LABEL[t] ?? t} ${n}`)
    .join(" · ");
}
