import type { FileHistory, GraphData } from "@/lib/api";
import { fileName } from "@/lib/format";
import { codeFunctions, groupCommunities, UNGROUPED_COLOR } from "../graph/graphModel";

const SOURCE_EXT = /\.(java|kt|kts|scala|groovy|ts|tsx|js|jsx|mjs|cjs|py|go|rs|cs|cpp|cc|c|h|hpp|rb|php|swift|vue|svelte)$/i;
const TEST_PATH = /(^|\/)(test|tests|__tests__|spec)\/|\.(test|spec)\.[jt]sx?$|Tests?\.(java|kt)$|_test\.(go|py)$|(^|\/)test_[^/]+\.py$/i;

export type FileMetric = {
  path: string;
  name: string;
  group: string;
  color: string;
  lines: number;
  functions: number;
  /** 가장 긴 함수 줄 수 */
  longestFunction: number;
  history: FileHistory | null;
  test: boolean;
  /** 코드 파일 (설정 · 문서가 아닌) */
  source: boolean;
  /** 핫스팟 점수 0~1: 변경 빈도 × 크기. 이력이 없으면 null */
  hotspot: number | null;
};

export type Insights = {
  files: FileMetric[];
  byPath: Map<string, FileMetric>;
  groups: { label: string; color: string; files: FileMetric[] }[];
  hasHistory: boolean;
  commits: number;
  since: string | null;
  until: string | null;
  /** 같이 바뀐 파일 쌍. linked = 코드 의존(어느 방향이든)이 있다 */
  couplings: { a: string; b: string; support: number; confidence: number; linked: boolean }[];
};

/** 그래프 + git 이력에서 파일별 지표를 만든다 */
export function computeInsights(data: GraphData): Insights {
  const { groups, groupOf } = groupCommunities(data);
  const colorOf = new Map(groups.map((g) => [g.label, g.color]));
  const fnsByFile = new Map<string, { count: number; longest: number }>();
  for (const f of codeFunctions(data)) {
    if (f.placeholder) continue;
    const e = fnsByFile.get(f.file) ?? { count: 0, longest: 0 };
    e.count++;
    e.longest = Math.max(e.longest, f.endLine - f.line + 1);
    fnsByFile.set(f.file, e);
  }
  const history = data.history ?? null;
  const maxCommits = Math.max(1, ...Object.values(history?.files ?? {}).map((h) => h.commits));
  const lineOf = (n: GraphData["nodes"][number]) => n.lines ?? Math.max(fnsByFile.get(n.id)?.count ?? 1, 1) * 15;
  const maxLines = Math.max(1, ...data.nodes.map(lineOf));

  const files: FileMetric[] = data.nodes.map((n) => {
    const group = groupOf(n.community) ?? "기타";
    const h = history?.files[n.id] ?? null;
    const lines = lineOf(n);
    // 변경 빈도와 크기를 곱한다 (둘 다 로그: 한 파일이 압도적으로 많이 바뀌어도 나머지가 구분되게). 자주 바뀌는 큰 파일일수록 1 에 가깝다
    const size = Math.log(1 + lines) / Math.log(1 + maxLines);
    const churn = Math.log(1 + (h?.commits ?? 0)) / Math.log(1 + maxCommits);
    const hotspot = history ? churn * size : null;
    return {
      path: n.id,
      name: fileName(n.id),
      group,
      color: colorOf.get(group) ?? UNGROUPED_COLOR,
      lines,
      functions: fnsByFile.get(n.id)?.count ?? 0,
      longestFunction: fnsByFile.get(n.id)?.longest ?? 0,
      history: h,
      test: TEST_PATH.test(n.id),
      source: SOURCE_EXT.test(n.id),
      hotspot,
    };
  });
  const byPath = new Map(files.map((f) => [f.path, f]));

  const grouped = new Map<string, FileMetric[]>();
  for (const f of files) grouped.set(f.group, [...(grouped.get(f.group) ?? []), f]);
  const groupList = [...grouped.entries()]
    .map(([label, list]) => ({ label, color: colorOf.get(label) ?? UNGROUPED_COLOR, files: list }))
    .sort((a, b) => b.files.length - a.files.length || a.label.localeCompare(b.label));

  const linked = new Set(data.edges.flatMap((e) => [`${e.source}\n${e.target}`, `${e.target}\n${e.source}`]));
  const couplings = (history?.coChanges ?? [])
    .filter((c) => byPath.has(c.a) && byPath.has(c.b))
    .map((c) => ({ ...c, linked: linked.has(`${c.a}\n${c.b}`) }));

  return {
    files,
    byPath,
    groups: groupList,
    hasHistory: history !== null,
    commits: history?.commits ?? 0,
    since: history?.since ?? null,
    until: history?.until ?? null,
    couplings,
  };
}

export type Coupling = Insights["couplings"][number];

/**
 * 화면에 그릴 결합. 기본은 강한 쌍만: 코드 파일끼리(테스트 · 설정 · 문서 제외), 3번 이상, 50% 이상.
 * 테스트끼리나 pom.xml 같은 설정 파일은 늘 같이 바뀌어서 의미 없는 선이 화면을 덮는다.
 */
export function visibleCouplings(insights: Insights, all: boolean): Coupling[] {
  if (all) return insights.couplings;
  const ok = (p: string) => {
    const f = insights.byPath.get(p);
    return f !== undefined && f.source && !f.test;
  };
  return insights.couplings.filter((c) => ok(c.a) && ok(c.b) && c.support >= 3 && c.confidence >= 0.5);
}

/** 핫스팟 점수 → 색 (파랑 → 보라 → 주황 → 빨강) */
export function heatColor(score: number | null): string {
  if (score === null) return "#3b3f5c";
  const stops = [
    [0, [37, 52, 120]],
    [0.25, [91, 63, 190]],
    [0.5, [217, 70, 239]],
    [0.75, [251, 146, 60]],
    [1, [239, 68, 68]],
  ] as const;
  const t = Math.min(Math.max(score, 0), 1);
  for (let i = 1; i < stops.length; i++) {
    const [t1, c1] = stops[i];
    const [t0, c0] = stops[i - 1];
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0);
      const c = c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
      return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    }
  }
  return "rgb(239, 68, 68)";
}

export type Rect = { x: number; y: number; w: number; h: number };

/** squarified treemap: 무게에 비례하는 넓이로 사각형을 나눈다 (가로세로 비가 1 에 가깝게) */
export function squarify<T>(items: { item: T; weight: number }[], rect: Rect): { item: T; rect: Rect }[] {
  const total = items.reduce((s, i) => s + i.weight, 0);
  if (total <= 0 || items.length === 0) return [];
  const scale = (rect.w * rect.h) / total;
  const queue = [...items].sort((a, b) => b.weight - a.weight).map((i) => ({ item: i.item, area: i.weight * scale }));
  const out: { item: T; rect: Rect }[] = [];
  let free = { ...rect };

  const worst = (row: { area: number }[], side: number) => {
    const sum = row.reduce((s, r) => s + r.area, 0);
    const max = Math.max(...row.map((r) => r.area));
    const min = Math.min(...row.map((r) => r.area));
    return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
  };
  const layout = (row: { item: T; area: number }[]) => {
    const sum = row.reduce((s, r) => s + r.area, 0);
    if (free.w >= free.h) {
      const w = sum / free.h;
      let y = free.y;
      for (const r of row) {
        const h = r.area / w;
        out.push({ item: r.item, rect: { x: free.x, y, w, h } });
        y += h;
      }
      free = { x: free.x + w, y: free.y, w: free.w - w, h: free.h };
    } else {
      const h = sum / free.w;
      let x = free.x;
      for (const r of row) {
        const w = r.area / h;
        out.push({ item: r.item, rect: { x, y: free.y, w, h } });
        x += w;
      }
      free = { x: free.x, y: free.y + h, w: free.w, h: free.h - h };
    }
  };

  let row: { item: T; area: number }[] = [];
  while (queue.length > 0) {
    const next = queue[0];
    const side = Math.min(free.w, free.h);
    if (row.length === 0 || worst([...row, next], side) <= worst(row, side)) {
      row.push(next);
      queue.shift();
    } else {
      layout(row);
      row = [];
    }
  }
  if (row.length > 0) layout(row);
  return out;
}

export function relativeDays(iso: string | null | undefined): string {
  if (!iso) return "-";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return days <= 0 ? "오늘" : `${days}일 전`;
}
