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
  /** 파일 사이 함수 호출 수: 이 파일 함수가 부르는 파일(out) · 이 파일 함수를 부르는 파일(in) */
  fileCalls: Map<string, { out: Map<string, number>; in: Map<string, number> }>;
  /** 파일 안 함수와 그 함수의 호출 상대 (함수 id) */
  functionsOf: Map<string, FunctionCalls[]>;
  /** 함수 id → 이름 · 파일 */
  fnInfo: Map<string, { name: string; file: string }>;
};

export type FunctionCalls = { id: string; name: string; line: number; out: string[]; in: string[] };

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

  const fnInfo = new Map<string, { name: string; file: string }>();
  const functionsOf = new Map<string, FunctionCalls[]>();
  const fnCalls = new Map<string, FunctionCalls>();
  for (const f of codeFunctions(data)) {
    if (f.placeholder) continue;
    const name = f.kind === "Constructor" ? `new ${f.name}` : f.name;
    fnInfo.set(f.id, { name, file: f.file });
    const entry: FunctionCalls = { id: f.id, name, line: f.line, out: [], in: [] };
    fnCalls.set(f.id, entry);
    functionsOf.set(f.file, [...(functionsOf.get(f.file) ?? []), entry]);
  }
  for (const list of functionsOf.values()) list.sort((a, b) => a.line - b.line);
  const fileCalls = new Map<string, { out: Map<string, number>; in: Map<string, number> }>();
  const fc = (p: string) => {
    if (!fileCalls.has(p)) fileCalls.set(p, { out: new Map(), in: new Map() });
    return fileCalls.get(p)!;
  };
  for (const c of data.calls ?? []) {
    const a = fnInfo.get(c.source);
    const b = fnInfo.get(c.target);
    if (!a || !b) continue;
    fnCalls.get(c.source)!.out.push(c.target);
    fnCalls.get(c.target)!.in.push(c.source);
    if (a.file === b.file) continue;
    fc(a.file).out.set(b.file, (fc(a.file).out.get(b.file) ?? 0) + c.weight);
    fc(b.file).in.set(a.file, (fc(b.file).in.get(a.file) ?? 0) + c.weight);
  }

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
    fileCalls,
    functionsOf,
    fnInfo,
  };
}

/** 시간 여행: 어떤 커밋 시점의 파일 상태 */
export type TimeState = {
  index: number;
  total: number;
  at: number;
  author: string;
  changed: string[];
  /** 파일별: 보이는지, 지금 대비 크기 비율, 방금 바뀌었는지(0~1) */
  files: Map<string, { visible: boolean; grow: number; flash: number }>;
};

export type Timeline = {
  total: number;
  stateAt: (index: number) => TimeState;
};

/**
 * 커밋별 변경으로 시점마다 도시 상태를 계산한다.
 * 파일 크기는 그 시점까지 쌓인 (추가 - 삭제)를 지금까지의 합으로 나눈 비율로 줄인다.
 * 처음 기록이 "삭제 없이 추가만"이면 그때 생긴 파일로 보고, 아니면(이력 창보다 오래된 파일) 처음부터 있던 것으로 본다.
 */
export function buildTimeline(data: GraphData): Timeline | null {
  const h = data.history;
  if (!h?.timeline || !h.timelineFiles || h.timeline.length === 0) return null;
  const files = h.timelineFiles;
  const authors = h.authors ?? [];
  const events = h.timeline;
  const perFile = files.map(() => ({ idx: [] as number[], cum: [] as number[], born: -1 }));
  events.forEach((e, i) => {
    for (const [f, add, del] of e.c) {
      const p = perFile[f];
      if (!p) continue;
      if (p.idx.length === 0) p.born = del === 0 ? i : -1;
      const prev = p.cum.length ? p.cum[p.cum.length - 1] : 0;
      p.idx.push(i);
      p.cum.push(prev + add - del);
    }
  });
  const recent = 3;
  return {
    total: events.length,
    stateAt(index) {
      const t = Math.min(Math.max(index, 0), events.length - 1);
      const state = new Map<string, { visible: boolean; grow: number; flash: number }>();
      files.forEach((path, f) => {
        const p = perFile[f];
        if (p.idx.length === 0) {
          state.set(path, { visible: true, grow: 1, flash: 0 });
          return;
        }
        // t 이하 마지막 변경 위치 (이분 탐색)
        let lo = 0;
        let hi = p.idx.length - 1;
        let k = -1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (p.idx[mid] <= t) {
            k = mid;
            lo = mid + 1;
          } else hi = mid - 1;
        }
        const visible = p.born < 0 || k >= 0;
        const final = p.cum[p.cum.length - 1];
        const now = k >= 0 ? p.cum[k] : 0;
        const base = p.born < 0 ? Math.max(final, 1) * 0.4 : 0;
        const grow = final + base > 0 ? Math.min(Math.max((now + base) / (final + base), 0.06), 1) : 1;
        const since = k >= 0 ? t - p.idx[k] : Infinity;
        state.set(path, { visible, grow, flash: since < recent ? 1 - since / recent : 0 });
      });
      const e = events[t];
      return {
        index: t,
        total: events.length,
        at: e.at * 1000,
        author: authors[e.a] ?? "",
        changed: e.c.map(([f]) => files[f]).filter(Boolean),
        files: state,
      };
    },
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
