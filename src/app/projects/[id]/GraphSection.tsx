"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { RepoGraph } from "@/lib/api";
import { formatTime, shortSha } from "@/lib/format";
import { rebuildGraph, type FormState } from "../../actions";

const REFRESH_MS = 5000;

// 배치(d3-force)를 서버와 브라우저가 따로 계산하면 소수점 끝자리가 달라 hydration 이 어긋난다. 브라우저에서만 그린다
const DependencyGraph = dynamic(() => import("@/components/graph/DependencyGraph").then((m) => m.DependencyGraph), {
  ssr: false,
  loading: () => <div className="empty">그래프 그리는 중…</div>,
});

/** 레포 전체 파일 의존성 그래프. 만드는 중이면 끝날 때까지 페이지를 다시 불러온다. */
export function GraphSection({ projectId, graph }: { projectId: number; graph: RepoGraph | null }) {
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
    <div className="graph-section">
      <div className="row">
        <span className="muted">
          {building ? (
            <>
              <span className="spinner" /> GitNexus 로 레포 분석 중
              {graph?.status === "PENDING" ? " (대기)" : ""}…
            </>
          ) : graph?.status === "DONE" && graph.commitSha ? (
            <>
              <code>{shortSha(graph.commitSha)}</code> 기준 · {formatTime(graph.finishedAt)}
            </>
          ) : graph?.status === "FAILED" ? (
            "그래프를 만들지 못했습니다"
          ) : (
            "아직 그래프가 없습니다"
          )}
        </span>
        <button
          className="small"
          disabled={pending || building}
          onClick={() => start(async () => setState(await rebuildGraph(projectId)))}
        >
          다시 만들기
        </button>
        {building && state.message && <span className="notice">{state.message}</span>}
      </div>
      {state.error && <p className="error">{state.error}</p>}
      {graph?.status === "FAILED" && graph.error && <pre className="graph-error">{graph.error}</pre>}
      {graph?.graph ? (
        <DependencyGraph data={graph.graph} />
      ) : (
        building && <div className="empty">처음 분석은 레포 크기에 따라 수십 초~몇 분 걸립니다</div>
      )}
    </div>
  );
}
