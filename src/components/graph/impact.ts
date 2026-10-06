import type { AnalysisContext, FileChange, Finding, GraphData, Severity } from "@/lib/api";
import { fileName } from "@/lib/format";
import { TYPE_LABEL } from "./graphModel";

/** 바뀐 파일 = 0, 그 파일을 쓰는 파일 = 1, 1 을 쓰는 파일 = 2 */
export type ImpactLevel = 0 | 1 | 2;

export type ImpactFile = {
  path: string;
  level: ImpactLevel;
  /** 왜 영향을 받는지 (1·2단계) */
  reason: string | null;
  /** 분석기가 실제 호출부로 확인한 파일 (JavaIndexer) */
  confirmed: boolean;
  /** 지워졌거나 시그니처가 바뀐 메서드를 아직 부르는 파일 */
  stale: boolean;
  change: FileChange | null;
  findings: Finding[];
};

export type Impact = {
  /** 그래프에 있는 파일만 (경로 → 영향) */
  files: Map<string, ImpactFile>;
  changed: ImpactFile[];
  direct: ImpactFile[];
  indirect: ImpactFile[];
  /** 그래프에 없는 바뀐 파일 (새 파일, 그래프 기준 커밋 뒤에 생긴 파일, 설정 파일 등) */
  outside: FileChange[];
  findingCount: number;
  /** false 면 예전 리뷰라 바뀐 줄 수를 모른다 */
  hasLineCounts: boolean;
};

const SEVERITY_RANK: Record<Severity, number> = { BLOCKER: 0, MAJOR: 1, MINOR: 2, INFO: 3 };

export function worstSeverity(findings: Finding[]): Severity | null {
  return findings.reduce<Severity | null>(
    (worst, f) => (worst === null || SEVERITY_RANK[f.severity] < SEVERITY_RANK[worst] ? f.severity : worst),
    null,
  );
}

function strongestType(types: Record<string, number>): string {
  const [type] = Object.entries(types).sort((a, b) => b[1] - a[1])[0] ?? ["USES"];
  return TYPE_LABEL[type] ?? type;
}

/**
 * PR 이 레포 그래프의 어디에 닿는지 계산한다.
 * 바뀐 파일을 쓰는 파일(그래프에서 바뀐 파일로 들어오는 간선의 출발점)이 1단계, 그 파일을 쓰는 파일이 2단계.
 */
export function computeImpact(graph: GraphData, context: AnalysisContext | null, findings: Finding[]): Impact {
  const inGraph = new Set(graph.nodes.map((n) => n.id));
  const changes: FileChange[] =
    context?.files ??
    (context?.history ?? []).map((h) => ({ path: h.file, status: "modified", additions: 0, deletions: 0, previousPath: null }));

  const findingsByFile = new Map<string, Finding[]>();
  for (const f of findings) {
    if (!f.file) continue;
    findingsByFile.set(f.file, [...(findingsByFile.get(f.file) ?? []), f]);
  }
  const confirmed = new Set<string>();
  const stale = new Set<string>();
  for (const m of context?.changedMethods ?? []) {
    m.callers.forEach((c) => confirmed.add(c.file));
    m.staleCalls.forEach((c) => stale.add(c.file));
  }

  // 들어오는 간선: target → [{source, types}]
  const usedBy = new Map<string, { source: string; types: Record<string, number> }[]>();
  for (const e of graph.edges) {
    usedBy.set(e.target, [...(usedBy.get(e.target) ?? []), { source: e.source, types: e.types }]);
  }

  const files = new Map<string, ImpactFile>();
  const make = (path: string, level: ImpactLevel, reason: string | null, change: FileChange | null): ImpactFile => ({
    path,
    level,
    reason,
    confirmed: confirmed.has(path),
    stale: stale.has(path),
    change,
    findings: findingsByFile.get(path) ?? [],
  });

  const outside: FileChange[] = [];
  for (const c of changes) {
    // 이름이 바뀐 파일은 그래프(기본 브랜치)에 예전 이름으로 있다
    const path = inGraph.has(c.path) ? c.path : c.previousPath && inGraph.has(c.previousPath) ? c.previousPath : null;
    if (path) files.set(path, make(path, 0, null, c));
    else outside.push(c);
  }

  for (const level of [1, 2] as const) {
    const frontier = [...files.values()].filter((f) => f.level === level - 1);
    for (const from of frontier) {
      for (const { source, types } of usedBy.get(from.path) ?? []) {
        if (files.has(source)) continue;
        files.set(source, make(source, level, `${strongestType(types)} → ${fileName(from.path)}`, null));
      }
    }
  }

  const sorted = (level: ImpactLevel) =>
    [...files.values()]
      .filter((f) => f.level === level)
      .sort(
        (a, b) =>
          Number(b.stale) - Number(a.stale) ||
          b.findings.length - a.findings.length ||
          Number(b.confirmed) - Number(a.confirmed) ||
          a.path.localeCompare(b.path),
      );

  return {
    files,
    changed: sorted(0),
    direct: sorted(1),
    indirect: sorted(2),
    outside,
    findingCount: findings.length,
    hasLineCounts: context?.files !== undefined,
  };
}
