"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { RepoGraph } from "@/lib/api";
import { formatTime, shortSha } from "@/lib/format";
import { rebuildGraph, type FormState } from "../../actions";

const REFRESH_MS = 5000;

/** 커밋 이력의 재료(레포 그래프 · git 이력) 상태와 다시 만들기. 만드는 중이면 끝날 때까지 새로고침 */
export function GraphState({ projectId, graph }: { projectId: number; graph: RepoGraph | null }) {
  const router = useRouter();
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();
  const building = graph?.status === "PENDING" || graph?.status === "RUNNING";

  useEffect(() => {
    if (!building) return;
    const timer = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [building, router]);

  return (
    <div className="row graph-state">
      <span className="muted">
        레포 분석{" "}
        {building ? (
          <>
            <span className="spinner" /> 만드는 중{graph?.status === "PENDING" ? " (대기)" : ""}…
          </>
        ) : graph?.status === "DONE" && graph.commitSha ? (
          <>
            <code>{shortSha(graph.commitSha)}</code> 기준 · {formatTime(graph.finishedAt)}
          </>
        ) : graph?.status === "FAILED" ? (
          <span className="error">실패{graph.error ? `: ${graph.error.slice(0, 120)}` : ""}</span>
        ) : (
          "아직 없음"
        )}
      </span>
      <button className="small" disabled={pending || building} onClick={() => start(async () => setState(await rebuildGraph(projectId)))}>
        다시 분석
      </button>
      {state.error && <span className="error">{state.error}</span>}
    </div>
  );
}
