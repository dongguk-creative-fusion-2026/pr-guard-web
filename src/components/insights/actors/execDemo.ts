"use client";

import { useEffect, useState } from "react";
import type { Insights } from "../metrics";

/**
 * 실행 검증 연출용 예시 데이터. 실제 실행 결과가 아니라 이 도시의 테스트 파일로 만든 가상의 결과다
 * (실행 검증을 운영에서 켜면 단계 기록의 EXEC_* 결과로 바꾼다).
 */
export type ExecMock = {
  /** 돌릴 테스트 파일 (순서대로 켜진다) */
  tests: string[];
  /** PR 전에는 통과, 후에는 실패한 테스트 파일과 그 테스트가 확인하는 코드 파일 */
  failing: { test: string; target: string | null; cases: number };
};

const stem = (p: string) => p.slice(p.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "");

export function buildExecMock(insights: Insights): ExecMock | null {
  const tests = insights.files.filter((f) => f.test).map((f) => f.path).slice(0, 14);
  if (tests.length === 0) return null;
  const sources = insights.files.filter((f) => !f.test && f.source);
  // 이름이 짝이 맞는 테스트(OwnerControllerTests → OwnerController)를 실패한 것으로 고른다
  for (const test of tests) {
    const name = stem(test).replace(/Tests?$|IT$/, "");
    const target = sources.find((s) => stem(s.path) === name);
    if (target) return { tests, failing: { test, target: target.path, cases: 2 } };
  }
  return { tests, failing: { test: tests[0], target: sources[0]?.path ?? null, cases: 1 } };
}

/** 장면 시각 (ms) */
export const EXEC_T = { twin: 0, run: 2200, runEnd: 8200, diff: 8600, target: 9800, verdict: 11000 } as const;

/** 시작 뒤 지난 시간을 잰다. round 를 바꾸면 처음부터 */
export function useExecClock(active: boolean, round: number): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!active) return;
    const start = Date.now();
    setT(0);
    const timer = setInterval(() => setT(Date.now() - start), 100);
    return () => clearInterval(timer);
  }, [active, round]);
  return t;
}

/** 테스트가 몇 개까지 돌았나 */
export function testsDone(mock: ExecMock, t: number): number {
  const k = Math.min(1, Math.max(0, (t - EXEC_T.run) / (EXEC_T.runEnd - EXEC_T.run)));
  return Math.floor(k * mock.tests.length);
}

/** 자막 */
export function execCaption(mock: ExecMock, t: number): { line: string; tone: string; step: number } {
  const n = mock.tests.length;
  const done = testsDone(mock, t);
  const failedNow = done > mock.tests.indexOf(mock.failing.test) ? 1 : 0;
  if (t < EXEC_T.run) return { line: "실행 검증: PR 전 · 후 코드를 각각 빌드합니다", tone: "", step: 0 };
  if (t < EXEC_T.diff) {
    return {
      line: `테스트 실행 중 · PR 전 ${done}/${n} 통과 · PR 후 ${done - failedNow}/${n} 통과`,
      tone: failedNow ? "warn" : "",
      step: 1,
    };
  }
  const name = stem(mock.failing.test);
  if (t < EXEC_T.verdict) return { line: `PR 전에는 통과, PR 후에는 실패: ${name} (${mock.failing.cases}건)`, tone: "bad", step: 2 };
  const target = mock.failing.target ? stem(mock.failing.target) : null;
  return {
    line: target ? `바뀐 동작이 ${target} 에서 테스트를 깨뜨림 → 머지 막힘` : "바뀐 동작이 테스트를 깨뜨림 → 머지 막힘",
    tone: "bad",
    step: 3,
  };
}

/** 입구 도시 건물 색: 돈 테스트는 초록, 깨진 테스트와 그 대상은 빨강 */
export function execMarks(mock: ExecMock, t: number): Map<string, { color: string; badge: number }> {
  const marks = new Map<string, { color: string; badge: number }>();
  const done = testsDone(mock, t);
  mock.tests.slice(0, done).forEach((p) => marks.set(p, { color: p === mock.failing.test ? "#ff4d5e" : "#4ade80", badge: 0 }));
  if (t >= EXEC_T.target && mock.failing.target) marks.set(mock.failing.target, { color: "#ff4d5e", badge: mock.failing.cases });
  if (t >= EXEC_T.diff) marks.set(mock.failing.test, { color: "#ff4d5e", badge: mock.failing.cases });
  return marks;
}
