import type { GraphData } from "@/lib/api";
import { codeFunctions, groupCommunities, type Group } from "./graphModel";

const TOP = 5;
const TEST_PATH = /(^|\/)(test|tests|__tests__|spec)\/|\.(test|spec)\.[jt]sx?$|Tests?\.(java|kt)$|_test\.(go|py)$|(^|\/)test_[^/]+\.py$/i;
const ENTRY_HINT = /controller|handler|resource|route|router|endpoint|page|main|cli|command|api/i;

/** 레이어 이름 → 경로 조각 (위에서 아래 순서) */
const LAYERS: { name: string; pattern: RegExp }[] = [
  { name: "웹 · API", pattern: /(^|\/)(web|controller|controllers|api|routes|handler|handlers|app)\// },
  { name: "서비스", pattern: /(^|\/)(service|services|usecase|usecases|application)\// },
  { name: "저장소", pattern: /(^|\/)(repository|repositories|dao|store|db|persistence)\// },
  { name: "도메인 · 모델", pattern: /(^|\/)(domain|model|models|entity|entities)\// },
];

export type Briefing = {
  files: number;
  functions: number;
  calls: number;
  groups: (Group & { topFile: string | null })[];
  /** 다른 파일이 가장 많이 쓰는 파일 */
  hubFiles: { path: string; usedBy: number }[];
  /** 가장 많이 호출되는 함수 */
  hotFunctions: { id: string; name: string; file: string; callers: number }[];
  /** 아무도 부르지 않지만 다른 함수를 부르는 함수 (요청 처리 · 실행 시작점 후보) */
  entryPoints: { id: string; name: string; file: string; calls: number }[];
  layers: { name: string; files: number }[];
  tests: { testFiles: number; sourceFiles: number; covered: number };
};

/** 레포 그래프에서 "이 레포는 이렇게 생겼다" 요약을 만든다 */
export function computeBriefing(data: GraphData): Briefing {
  const { groups, groupOf } = groupCommunities(data);
  const functions = codeFunctions(data).filter((f) => !f.placeholder);
  const calls = data.calls ?? [];

  const usedBy = new Map<string, Set<string>>();
  for (const e of data.edges) {
    if (!usedBy.has(e.target)) usedBy.set(e.target, new Set());
    usedBy.get(e.target)!.add(e.source);
  }
  const hubFiles = [...usedBy.entries()]
    .map(([path, users]) => ({ path, usedBy: users.size }))
    .sort((a, b) => b.usedBy - a.usedBy || a.path.localeCompare(b.path))
    .slice(0, TOP);

  const groupTop = new Map<string, { path: string; usedBy: number }>();
  for (const n of data.nodes) {
    const g = groupOf(n.community);
    if (!g) continue;
    const score = usedBy.get(n.id)?.size ?? 0;
    const best = groupTop.get(g);
    if (!best || score > best.usedBy) groupTop.set(g, { path: n.id, usedBy: score });
  }

  const callersOf = new Map<string, number>();
  const calleesOf = new Map<string, number>();
  for (const c of calls) {
    callersOf.set(c.target, (callersOf.get(c.target) ?? 0) + 1);
    calleesOf.set(c.source, (calleesOf.get(c.source) ?? 0) + 1);
  }
  const fnName = (f: (typeof functions)[number]) => (f.kind === "Constructor" ? `new ${f.name}` : f.name);
  // 한 줄짜리 선언(record 필드 접근자 등)은 "바꾸면 영향이 큰 곳"으로 의미가 없어서 뺀다
  const hotFunctions = functions
    .filter((f) => f.endLine > f.line)
    .map((f) => ({ id: f.id, name: fnName(f), file: f.file, callers: callersOf.get(f.id) ?? 0 }))
    .filter((f) => f.callers > 0)
    .sort((a, b) => b.callers - a.callers || a.name.localeCompare(b.name))
    .slice(0, TOP);

  const entryPoints = functions
    .filter((f) => !TEST_PATH.test(f.file) && !callersOf.has(f.id) && (calleesOf.get(f.id) ?? 0) > 0)
    .map((f) => ({ id: f.id, name: fnName(f), file: f.file, calls: calleesOf.get(f.id) ?? 0, hint: ENTRY_HINT.test(f.file) }))
    .sort((a, b) => Number(b.hint) - Number(a.hint) || b.calls - a.calls || a.name.localeCompare(b.name))
    .slice(0, 6)
    .map(({ hint: _hint, ...rest }) => rest);

  const testFiles = data.nodes.filter((n) => TEST_PATH.test(n.id)).map((n) => n.id);
  const testSet = new Set(testFiles);
  const sourceFiles = data.nodes.filter((n) => !testSet.has(n.id)).map((n) => n.id);
  const coveredSet = new Set(data.edges.filter((e) => testSet.has(e.source) && !testSet.has(e.target)).map((e) => e.target));

  const layers = LAYERS.map((l) => ({ name: l.name, files: sourceFiles.filter((p) => l.pattern.test(p)).length })).filter(
    (l) => l.files > 0,
  );

  return {
    files: data.nodes.length,
    functions: functions.length,
    calls: calls.length,
    groups: groups.map((g) => ({ ...g, topFile: groupTop.get(g.label)?.path ?? null })),
    hubFiles,
    hotFunctions,
    entryPoints,
    layers,
    tests: { testFiles: testFiles.length, sourceFiles: sourceFiles.length, covered: coveredSet.size },
  };
}
