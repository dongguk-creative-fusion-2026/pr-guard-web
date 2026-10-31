"use client";

import { useEffect, useState } from "react";
import { getInvariantRun, startInvariantRun } from "@/app/actions";
import { isInvariantActive, type InvariantCandidate, type InvariantRun } from "@/lib/invariants";

/** One current execution; never poll overlapping requests or continue after unmount. */
export function useInvariantRun(projectId: number, number: number) {
  const [run, setRun] = useState<InvariantRun | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);

  useEffect(() => {
    if (!run || !isInvariantActive(run) || pollError) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const response = await getInvariantRun(projectId, number, run.id);
        if (cancelled) return;
        if (response.run) setRun(response.run);
        else setPollError(response.error ?? "실행 결과를 조회하지 못했습니다.");
      } catch {
        if (!cancelled) setPollError("실행 결과를 조회하지 못했습니다.");
      }
    }, 2500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [run, projectId, number, pollError]);

  async function start(candidate: InvariantCandidate) {
    const response = await startInvariantRun(projectId, number, candidate);
    setPollError(null);
    if (response.run) setRun(response.run);
    return response;
  }

  return { run, active: isInvariantActive(run), pollError, start, retry: () => setPollError(null) };
}
