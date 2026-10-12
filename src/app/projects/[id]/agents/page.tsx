import { notFound } from "next/navigation";
import { buildAgentsMd } from "@/lib/agentsMd";
import { api, ApiError } from "@/lib/api";
import { AgentsView } from "./AgentsView";

export const dynamic = "force-dynamic";

/** AI 코딩 에이전트 규칙(AGENTS.md): 레포에 있는지 보고, 없으면 분석 기반 초안을 만들어 PR 로 올린다 */
export default async function AgentsPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  let project, graph;
  try {
    [project, graph] = await Promise.all([api.getProject(id), api.getGraph(id)]);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const repo = `${project.owner}/${project.name}`;
  let info, lessons;
  try {
    [info, lessons] = await Promise.all([api.getAgentsMd(id), api.getLessons(id)]);
  } catch (e) {
    return (
      <main>
        <p className="error">{e instanceof ApiError ? e.message : "레포의 규칙 파일을 확인하지 못했습니다"}</p>
      </main>
    );
  }
  if (!graph?.graph) {
    return (
      <main>
        <div className="empty">레포 분석(코드 그래프)이 끝나야 초안을 만들 수 있어요.</div>
      </main>
    );
  }
  const draft = buildAgentsMd(repo, graph.graph, info, graph.commitSha);
  return (
    <main>
      <h1>에이전트 규칙</h1>
      <AgentsView projectId={id} repo={repo} info={info} draft={draft} lessons={lessons} />
    </main>
  );
}
