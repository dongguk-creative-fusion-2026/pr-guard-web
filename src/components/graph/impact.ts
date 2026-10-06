import type { AnalysisContext, FileChange, Finding, GraphData, Severity } from "@/lib/api";
import { fileName } from "@/lib/format";
import { codeFunctions, functionAt, type CodeFunction } from "./graphModel";

/** 바뀐 함수 = 0, 그 함수를 호출하는 함수 = 1, 1 을 호출하는 함수 = 2 */
export type ImpactLevel = 0 | 1 | 2;

export type ImpactFunction = {
  id: string;
  name: string;
  file: string;
  /** 파일 자리표시 노드 (함수 정보가 없는 파일) */
  placeholder: boolean;
  level: ImpactLevel;
  /** 왜 영향을 받는지 (1·2단계) */
  reason: string | null;
  /** 분석기(JavaIndexer)가 실제 호출부로 확인한 함수 */
  confirmed: boolean;
  /** 지워졌거나 시그니처가 바뀐 메서드를 아직 부르는 함수 */
  stale: boolean;
  findings: Finding[];
};

export type ImpactFileInfo = {
  path: string;
  /** 이 파일 안 함수 중 가장 안쪽 단계 */
  level: ImpactLevel;
  change: FileChange | null;
  /** 이 파일의 지적 전부 */
  findings: Finding[];
};

export type Impact = {
  functions: Map<string, ImpactFunction>;
  files: Map<string, ImpactFileInfo>;
  changed: ImpactFunction[];
  direct: ImpactFunction[];
  indirect: ImpactFunction[];
  /** 그래프에 있는 바뀐 파일 */
  changedFiles: ImpactFileInfo[];
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

/** com.x.PostService#getPost(Long) → getPost, 생성자(#<init>, #PostService)는 클래스 이름 */
function methodName(id: string | null): string | null {
  if (!id) return null;
  const hash = id.indexOf("#");
  if (hash < 0) return null;
  const paren = id.indexOf("(", hash);
  const name = id.slice(hash + 1, paren < 0 ? undefined : paren);
  if (name === "<init>") {
    const type = id.slice(0, hash);
    return type.slice(type.lastIndexOf(".") + 1);
  }
  return name;
}

/** 분석기가 찾은 바뀐 메서드를 그래프 함수에 맞춘다: 같은 파일 · 같은 이름 중 줄이 가장 가까운 것 */
function matchFunction(functions: CodeFunction[], file: string, name: string | null, line: number): CodeFunction | null {
  if (!name) return functionAt(functions, file, line);
  let best: CodeFunction | null = null;
  for (const f of functions) {
    if (f.file !== file || f.placeholder || f.name !== name) continue;
    if (!best || Math.abs(f.line - line) < Math.abs(best.line - line)) best = f;
  }
  return best ?? functionAt(functions, file, line);
}

const label = (f: CodeFunction) => (f.placeholder ? f.name : `${fileName(f.file).replace(/\.[^.]+$/, "")}.${f.name}`);

/**
 * PR 이 레포 그래프의 어디에 닿는지 함수 단위로 계산한다.
 * 바뀐 함수를 호출하는 함수가 1단계, 그 함수를 호출하는 함수가 2단계.
 * 함수 정보가 없는 그래프(예전 그래프)는 파일 자리표시 노드끼리 파일 의존으로 같은 계산을 한다.
 */
export function computeImpact(graph: GraphData, context: AnalysisContext | null, findings: Finding[]): Impact {
  const functions = codeFunctions(graph);
  const fnById = new Map(functions.map((f) => [f.id, f]));
  const filesInGraph = new Set(graph.nodes.map((n) => n.id));
  const hasFunctions = graph.functions !== undefined;

  // 들어오는 호출: target → callers
  const callers = new Map<string, string[]>();
  const links = hasFunctions
    ? (graph.calls ?? []).map((c) => [c.source, c.target] as const)
    : graph.edges.map((e) => [`file:${e.source}`, `file:${e.target}`] as const);
  for (const [s, t] of links) {
    if (!fnById.has(s) || !fnById.has(t)) continue;
    callers.set(t, [...(callers.get(t) ?? []), s]);
  }

  const changes: FileChange[] =
    context?.files ??
    (context?.history ?? []).map((h) => ({ path: h.file, status: "modified", additions: 0, deletions: 0, previousPath: null }));

  const result = new Map<string, ImpactFunction>();
  const make = (f: CodeFunction, level: ImpactLevel, reason: string | null): ImpactFunction => ({
    id: f.id,
    name: f.placeholder ? f.name : f.kind === "Constructor" ? `new ${f.name}` : f.name,
    file: f.file,
    placeholder: f.placeholder,
    level,
    reason,
    confirmed: false,
    stale: false,
    findings: [],
  });

  // 0단계: 바뀐 파일 (이름이 바뀐 파일은 그래프에 예전 이름으로 있다)
  const changeByPath = new Map<string, FileChange>();
  const outside: FileChange[] = [];
  for (const c of changes) {
    const path = filesInGraph.has(c.path) ? c.path : c.previousPath && filesInGraph.has(c.previousPath) ? c.previousPath : null;
    if (path) changeByPath.set(path, c);
    else outside.push(c);
  }
  // 바뀐 메서드를 그래프 함수에 맞추고, 맞춘 게 없는 바뀐 파일은 파일 안 함수 전부를 바뀐 것으로 본다
  const matchedFiles = new Set<string>();
  for (const m of context?.changedMethods ?? []) {
    const f = matchFunction(functions, m.file, methodName(m.id ?? m.baseId), m.line);
    if (!f) continue;
    result.set(f.id, make(f, 0, null));
    matchedFiles.add(f.file);
  }
  for (const path of changeByPath.keys()) {
    if (matchedFiles.has(path)) continue;
    for (const f of functions) if (f.file === path) result.set(f.id, make(f, 0, null));
  }

  // 1·2단계: 호출하는 함수를 따라 바깥으로
  for (const level of [1, 2] as const) {
    const frontier = [...result.values()].filter((f) => f.level === level - 1);
    for (const from of frontier) {
      for (const caller of callers.get(from.id) ?? []) {
        if (result.has(caller)) continue;
        const f = fnById.get(caller)!;
        result.set(caller, make(f, level, `${hasFunctions ? "호출" : "의존"} → ${label(fnById.get(from.id)!)}`));
      }
    }
  }

  // 분석기가 확인한 호출부 · 옛 시그니처 호출부를 표시한다 (그래프가 못 찾은 호출이면 1단계로 넣는다)
  for (const m of context?.changedMethods ?? []) {
    const target = matchFunction(functions, m.file, methodName(m.id ?? m.baseId), m.line);
    for (const [list, stale] of [[m.callers, false], [m.staleCalls, true]] as const) {
      for (const c of list) {
        // 필드 초기화처럼 함수 밖에서 부르는 곳은 파일 단위 항목으로 둔다
        const outsideFunction = filesInGraph.has(c.file)
          ? { id: `file:${c.file}`, name: `${fileName(c.file)} (함수 밖)`, kind: "File", file: c.file, line: c.line, endLine: c.line, placeholder: true }
          : null;
        const f = functionAt(functions, c.file, c.line) ?? functions.find((x) => x.file === c.file && x.placeholder) ?? outsideFunction;
        if (!f) continue;
        let hit = result.get(f.id);
        if (!hit) {
          const where = f.placeholder ? ` · ${c.line}번째 줄` : "";
          hit = make(f, 1, `${target ? `호출 → ${label(target)}` : "호출부"} (분석기)${where}`);
          result.set(f.id, hit);
        }
        hit.confirmed = true;
        if (stale) hit.stale = true;
      }
    }
  }

  // 지적: 줄이 있으면 그 줄을 감싸는 함수에, 파일 정보는 파일에 모은다
  const findingsByFile = new Map<string, Finding[]>();
  for (const finding of findings) {
    if (!finding.file) continue;
    findingsByFile.set(finding.file, [...(findingsByFile.get(finding.file) ?? []), finding]);
    const f = finding.line != null ? functionAt(functions, finding.file, finding.line) : null;
    const hit = f ? result.get(f.id) : undefined;
    if (hit) hit.findings.push(finding);
  }

  const files = new Map<string, ImpactFileInfo>();
  for (const f of result.values()) {
    const info = files.get(f.file);
    if (!info || f.level < info.level) {
      files.set(f.file, {
        path: f.file,
        level: f.level,
        change: changeByPath.get(f.file) ?? null,
        findings: findingsByFile.get(f.file) ?? [],
      });
    }
  }

  const sorted = (level: ImpactLevel) =>
    [...result.values()]
      .filter((f) => f.level === level)
      .sort(
        (a, b) =>
          Number(b.stale) - Number(a.stale) ||
          b.findings.length - a.findings.length ||
          Number(b.confirmed) - Number(a.confirmed) ||
          a.file.localeCompare(b.file) ||
          a.name.localeCompare(b.name),
      );

  return {
    functions: result,
    files,
    changed: sorted(0),
    direct: sorted(1),
    indirect: sorted(2),
    changedFiles: [...files.values()].filter((f) => f.change !== null),
    outside,
    findingCount: findings.length,
    hasLineCounts: context?.files !== undefined,
  };
}
