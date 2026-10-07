import type { GraphData, ProjectRuntime } from "@/lib/api";

/**
 * 런타임 기록(테스트가 돌며 실제로 일어난 호출)을 그래프 함수에 맞춘 것.
 * 기록의 이름(com.a.Foo#bar)과 그래프 함수(파일 경로 + 이름)를 "패키지.클래스#이름" 으로 맞춰 본다.
 * 오버로드는 구분하지 않고 합친다.
 */
export type Runtime = {
  source: { prNumber: number; reviewId: number; sha: string; finishedAt: string | null };
  /** 그래프 함수 id → 불린 횟수 */
  calls: Map<string, number>;
  /** "호출하는 쪽\u0000불린 쪽" (그래프 함수 id) → 횟수 */
  edges: Map<string, number>;
  /** 그래프 함수 id → 그 함수를 지나간 테스트 이름 */
  tests: Map<string, string[]>;
  /** 테스트 이름 → 그 테스트 함수의 그래프 id (그래프에 테스트 파일이 있을 때) */
  testFns: Map<string, string>;
  testCount: number;
  /** 기록된 함수 중 그래프에서 찾은 수 / 전체 */
  matched: number;
  traced: number;
  maxCalls: number;
};

export const edgeKey = (source: string, target: string) => `${source}\u0000${target}`;

/** src/main/java/com/a/Foo.java + bar → com.a.Foo#bar (생성자는 <init>) */
export function functionKey(file: string, name: string, kind: string): string | null {
  const m = file.match(/(?:^|\/)src\/(?:main|test)\/(?:java|kotlin)\/(.+)\.(?:java|kt)$/);
  if (!m) return null;
  return `${m[1].replace(/\//g, ".")}#${kind === "Constructor" ? "<init>" : name}`;
}

/** com.a.Foo$Inner#bar → com.a.Foo#bar (중첩 클래스는 바깥 클래스 파일에 있다) */
export function traceKey(method: string): string {
  const hash = method.indexOf("#");
  const type = method.slice(0, hash);
  const dollar = type.indexOf("$");
  return (dollar < 0 ? type : type.slice(0, dollar)) + method.slice(hash);
}

/** 테스트 이름을 짧게: com.a.FooTest#bar → FooTest#bar */
export function shortTest(name: string): string {
  const hash = name.indexOf("#");
  const type = name.slice(0, hash);
  return type.slice(type.lastIndexOf(".") + 1) + name.slice(hash);
}

export function buildRuntime(runtime: ProjectRuntime, data: GraphData): Runtime {
  const byKey = new Map<string, string[]>();
  for (const f of data.functions ?? []) {
    const key = functionKey(f.file, f.name, f.kind);
    if (!key) continue;
    const list = byKey.get(key);
    if (list) list.push(f.id);
    else byKey.set(key, [f.id]);
  }
  const { trace } = runtime;
  // 기록 번호 → 그래프 함수 (같은 이름의 오버로드가 여럿이면 첫 번째에 모은다)
  const fnOf = trace.methods.map((m) => byKey.get(traceKey(m))?.[0] ?? null);

  const calls = new Map<string, number>();
  trace.methods.forEach((_, i) => {
    const fn = fnOf[i];
    if (fn) calls.set(fn, (calls.get(fn) ?? 0) + (trace.counts[i] ?? 0));
  });
  const edges = new Map<string, number>();
  for (const [a, b, n] of trace.edges) {
    const s = fnOf[a];
    const t = fnOf[b];
    if (!s || !t || s === t) continue;
    const k = edgeKey(s, t);
    edges.set(k, (edges.get(k) ?? 0) + n);
  }
  const tests = new Map<string, string[]>();
  const testFns = new Map<string, string>();
  for (const [test, reached] of Object.entries(trace.tests)) {
    const own = byKey.get(traceKey(test))?.[0];
    if (own) testFns.set(test, own);
    for (const i of new Set(reached.map((r) => fnOf[r]).filter((f): f is string => f !== null))) {
      const list = tests.get(i);
      if (list) list.push(test);
      else tests.set(i, [test]);
    }
  }
  return {
    source: { prNumber: runtime.prNumber, reviewId: runtime.reviewId, sha: runtime.sha, finishedAt: runtime.finishedAt },
    calls,
    edges,
    tests,
    testFns,
    testCount: Object.keys(trace.tests).length,
    matched: fnOf.filter((f) => f !== null).length,
    traced: trace.methods.length,
    maxCalls: Math.max(1, ...calls.values()),
  };
}

/** 0(적게 불림) ~ 1(가장 많이 불림), 로그 눈금 */
export function heat(runtime: Runtime, calls: number): number {
  return Math.log(1 + calls) / Math.log(1 + runtime.maxCalls);
}

/** 런타임 색: 청록(적게) → 초록 → 노랑 → 주황(많이) */
export function runtimeColor(t: number): string {
  const stops: [number, number, number][] = [
    [34, 211, 238],
    [52, 211, 153],
    [250, 204, 21],
    [251, 146, 60],
  ];
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/** 런타임에만 있는 호출 (정적 분석이 놓친 것: 인터페이스 · 상속 · 리플렉션 · 프레임워크 호출) */
export const RUNTIME_ONLY_COLOR = "#f0abfc";

/** 파일 단위로 합친 런타임 (코드 시티용) */
export type FileRuntime = {
  source: Runtime["source"];
  calls: Map<string, number>;
  links: { from: string; to: string; count: number }[];
  maxCalls: number;
};

export function fileRuntime(runtime: Runtime, data: GraphData): FileRuntime {
  const fileOf = new Map((data.functions ?? []).map((f) => [f.id, f.file]));
  const calls = new Map<string, number>();
  for (const [fn, n] of runtime.calls) {
    const file = fileOf.get(fn);
    if (file) calls.set(file, (calls.get(file) ?? 0) + n);
  }
  const links = new Map<string, number>();
  for (const [k, n] of runtime.edges) {
    const [s, t] = k.split("\u0000");
    const a = fileOf.get(s);
    const b = fileOf.get(t);
    if (!a || !b || a === b) continue;
    const key = edgeKey(a, b);
    links.set(key, (links.get(key) ?? 0) + n);
  }
  return {
    source: runtime.source,
    calls,
    links: [...links.entries()]
      .map(([k, count]) => {
        const [from, to] = k.split("\u0000");
        return { from, to, count };
      })
      .sort((a, b) => b.count - a.count),
    maxCalls: Math.max(1, ...calls.values()),
  };
}
