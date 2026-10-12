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
  /** 코드 시티 구역: 모듈이 여럿이면 모듈, 하나면 계층 (web · service · repository · 테스트 …) */
  district: string;
  /** 구역 안 블록: 모듈이 여럿일 때 그 모듈 안의 계층. 아니면 "" */
  block: string;
  districtColor: string;
};

export type District = { label: string; color: string; files: FileMetric[]; blocks: { label: string; files: FileMetric[] }[] };

export type Insights = {
  files: FileMetric[];
  byPath: Map<string, FileMetric>;
  groups: { label: string; color: string; files: FileMetric[] }[];
  /** 프로젝트 구조: 모듈 · 계층별 구역 (큰 순) */
  districts: District[];
  /** 구역이 모듈이면 true (멀티 모듈 레포) */
  modular: boolean;
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

/** 구조 색: 채도를 낮춘 색 (건물 · 구역 바닥) */
const STRUCTURE_COLORS = ["#7aa2f7", "#9ece6a", "#e0af68", "#f7768e", "#bb9af7", "#7dcfff", "#ff9e64", "#73daca", "#c0caf5", "#d4a5d4", "#a9b665", "#89b4fa"];
const MAX_DISTRICTS = 12;
const MAX_BLOCKS = 8;
const CODE_ROOTS = new Set(["src", "main", "java", "kotlin", "scala", "groovy", "js", "ts", "app", "lib"]);

/** src 앞까지가 모듈 (멀티 모듈 · 마이크로서비스 레포). src 가 없으면 "" */
function moduleOf(path: string): string {
  const parts = path.split("/");
  const i = parts.indexOf("src");
  return i > 0 ? parts.slice(0, i).join("/") : "";
}

/** 계층: 테스트 · 프론트엔드 · 리소스, 그 밖에는 파일이 든 패키지(디렉터리) 이름 */
function layerOf(path: string, test: boolean): string {
  if (test) return "테스트";
  const dirs = path.split("/").slice(0, -1);
  if (dirs.includes("resources") || dirs.includes("static") || dirs.includes("webapp")) {
    return /\.(js|jsx|ts|tsx|vue|css|scss|html)$/i.test(path) ? "프론트엔드" : "리소스";
  }
  const leaf = dirs[dirs.length - 1];
  return !leaf || CODE_ROOTS.has(leaf) ? "(루트)" : leaf;
}

/** 모듈 이름들의 공통 앞부분(spring-petclinic- 같은)을 떼어 짧게 */
function trimCommonPrefix(names: string[]): Map<string, string> {
  const real = names.filter(Boolean);
  let prefix = real[0] ?? "";
  for (const n of real) while (prefix && !n.startsWith(prefix)) prefix = prefix.slice(0, -1);
  const cut = Math.max(prefix.lastIndexOf("-"), prefix.lastIndexOf("/")) + 1;
  return new Map(names.map((n) => [n, n ? n.slice(real.length > 1 ? cut : 0) || n : "(루트)"]));
}

/** 너무 많은 묶음은 작은 것부터 "기타" 로 */
function capGroups(counts: Map<string, number>, max: number): (label: string) => string {
  const keep = new Set([...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, max - 1).map(([k]) => k));
  return (label) => (counts.size <= max || keep.has(label) ? label : "기타");
}

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
      district: "",
      block: "",
      districtColor: UNGROUPED_COLOR,
    };
  });
  const byPath = new Map(files.map((f) => [f.path, f]));

  // 프로젝트 구조: 모듈이 둘 이상이면 구역 = 모듈 · 블록 = 계층, 아니면 구역 = 계층
  const modules = [...new Set(files.map((f) => moduleOf(f.path)))];
  const modular = modules.filter(Boolean).length >= 2;
  const moduleLabel = trimCommonPrefix(modules);
  const raw = files.map((f) => {
    const layer = layerOf(f.path, f.test);
    return modular ? { f, district: moduleLabel.get(moduleOf(f.path)) ?? "(루트)", block: layer } : { f, district: layer, block: "" };
  });
  const districtCount = new Map<string, number>();
  for (const r of raw) districtCount.set(r.district, (districtCount.get(r.district) ?? 0) + 1);
  const capDistrict = capGroups(districtCount, MAX_DISTRICTS);
  for (const r of raw) r.district = capDistrict(r.district);
  const districtMap = new Map<string, FileMetric[]>();
  for (const r of raw) {
    r.f.district = r.district;
    r.f.block = r.block;
    districtMap.set(r.district, [...(districtMap.get(r.district) ?? []), r.f]);
  }
  const districts: District[] = [...districtMap.entries()]
    .sort((a, b) => Number(a[0] === "테스트") - Number(b[0] === "테스트") || b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([label, list], i) => {
      const color = label === "테스트" || label === "기타" ? UNGROUPED_COLOR : STRUCTURE_COLORS[i % STRUCTURE_COLORS.length];
      const blockCount = new Map<string, number>();
      for (const f of list) blockCount.set(f.block, (blockCount.get(f.block) ?? 0) + 1);
      const capBlock = capGroups(blockCount, MAX_BLOCKS);
      const blocks = new Map<string, FileMetric[]>();
      for (const f of list) {
        f.block = capBlock(f.block);
        f.districtColor = color;
        blocks.set(f.block, [...(blocks.get(f.block) ?? []), f]);
      }
      return {
        label,
        color,
        files: list,
        blocks: [...blocks.entries()].sort((a, b) => b[1].length - a[1].length).map(([b, fs]) => ({ label: b, files: fs })),
      };
    });

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
    districts,
    modular,
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
