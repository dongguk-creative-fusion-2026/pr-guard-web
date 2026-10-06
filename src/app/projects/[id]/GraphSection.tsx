"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { groupCommunities } from "@/components/graph/graphModel";
import type { RepoGraph } from "@/lib/api";
import { formatTime, shortSha } from "@/lib/format";
import { rebuildGraph, type FormState } from "../../actions";

const REFRESH_MS = 5000;
const GROUP_PREVIEW = 6;

/** 프로젝트 화면의 의존성 그래프 카드. 누르면 전체 화면 그래프로 간다. 만드는 중이면 끝날 때까지 새로고침 */
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

  const data = graph?.graph;
  const groups = data ? groupCommunities(data).groups : [];

  const status = building ? (
    <>
      <span className="spinner" /> GitNexus 로 분석 중{graph?.status === "PENDING" ? " (대기)" : ""}…
    </>
  ) : graph?.status === "DONE" && graph.commitSha ? (
    <>
      <code>{shortSha(graph.commitSha)}</code> 기준 · {formatTime(graph.finishedAt)}
    </>
  ) : graph?.status === "FAILED" ? (
    "그래프를 만들지 못했습니다"
  ) : (
    "아직 그래프가 없습니다"
  );

  return (
    <div className="graph-card">
      <div className="graph-card-main">
        <div>
          <div className="graph-card-title">레포 의존성 그래프</div>
          <div className="graph-card-status">{status}</div>
        </div>
        {data && (
          <div className="graph-card-stats">
            <span>
              <b>{data.stats.shownFiles}</b> 파일
            </span>
            <span>
              <b>{data.stats.shownEdges}</b> 의존
            </span>
            <span>
              <b>{groups.length}</b> 묶음
            </span>
          </div>
        )}
      </div>
      {groups.length > 0 && (
        <div className="graph-card-groups">
          {groups.slice(0, GROUP_PREVIEW).map((g) => (
            <span key={g.label}>
              <i style={{ background: g.color, boxShadow: `0 0 6px ${g.color}` }} />
              {g.label}
            </span>
          ))}
          {groups.length > GROUP_PREVIEW && <span className="graph-card-more">+{groups.length - GROUP_PREVIEW}</span>}
        </div>
      )}
      {graph?.status === "FAILED" && graph.error && <pre className="graph-error">{graph.error}</pre>}
      <div className="graph-card-actions">
        {data && (
          <Link href={`/projects/${projectId}/graph`} className="graph-open">
            그래프 열기 →
          </Link>
        )}
        <button
          className="graph-rebuild"
          disabled={pending || building}
          onClick={() => start(async () => setState(await rebuildGraph(projectId)))}
        >
          다시 만들기
        </button>
        {building && state.message && <span className="graph-card-note">{state.message}</span>}
        {state.error && <span className="graph-card-note error">{state.error}</span>}
      </div>
    </div>
  );
}
