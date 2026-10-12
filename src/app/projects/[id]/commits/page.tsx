import { JetBrains_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import type { CityColorMode } from "@/components/insights/CodeCity";
import type { InsightTab } from "@/components/insights/InsightsView";
import { api, ApiError } from "@/lib/api";
import { shortSha } from "@/lib/format";
import { CommitGraphView } from "@/components/commits/CommitGraphView";
import { InsightsClient } from "../insights/InsightsClient";
import { GraphState } from "../GraphState";

export const dynamic = "force-dynamic";

const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const TABS: InsightTab[] = ["city", "hotspots", "coupling"];
const MODES: CityColorMode[] = ["hotspot", "group", "recent", "test", "runtime", "delegation"];

/**
 * 커밋 이력: 첫 화면은 커밋 그래프(브랜치 갈래 · 병합). ?tab=city 는 코드 시티 + 시간 여행,
 * hotspots · coupling 은 핫스팟 · 숨은 결합. 코드 시티 색 기준은 ?mode=.
 */
export default async function CommitsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; file?: string; t?: string; mode?: string }>;
}) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const { tab, file, t, mode } = await searchParams;

  let data;
  try {
    data = await Promise.all([api.getProject(id), api.getGraph(id), api.getRuntime(id), api.listPulls(id)]);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const [project, graph, runtime, pulls] = data;
  if (!graph?.graph) {
    return (
      <main>
        <div className="empty">
          <p>커밋 이력을 보려면 레포 분석(코드 그래프 · git 이력)이 필요해요.</p>
          <GraphState projectId={id} graph={graph} />
        </div>
      </main>
    );
  }
  if (!tab || tab === "graph") {
    if (!graph.graph.commitGraph) {
      return (
        <main>
          <div className="empty">
            <p>다시 분석하면 커밋 그래프가 보여요.</p>
            <GraphState projectId={id} graph={graph} />
          </div>
        </main>
      );
    }
    const openPulls = Object.fromEntries(pulls.filter((p) => p.state === "open").map((p) => [p.headRef, p.number]));
    return (
      <CommitGraphView
        graph={graph.graph.commitGraph}
        history={graph.graph.history ?? null}
        projectId={id}
        repoUrl={project.htmlUrl}
        pulls={openPulls}
      />
    );
  }
  const current = TABS.includes(tab as InsightTab) ? (tab as InsightTab) : "city";
  return (
    <InsightsClient
      // 상단 바의 탭을 바꾸면 그 탭으로 새로 그린다
      key={current}
      chrome={false}
      data={graph.graph}
      title={`${project.owner}/${project.name}`}
      subtitle={graph.commitSha ? `${shortSha(graph.commitSha)} 기준` : ""}
      backHref={`/projects/${id}`}
      graphHref={`/projects/${id}/graph`}
      fontFamily={mono.style.fontFamily}
      initialTab={current}
      initialFile={file}
      initialTime={t !== undefined && Number.isInteger(Number(t)) ? Number(t) : undefined}
      sourceBase={graph.commitSha ? `${project.htmlUrl}/blob/${graph.commitSha}` : null}
      repoUrl={project.htmlUrl}
      runtime={runtime}
      initialMode={MODES.includes(mode as CityColorMode) ? (mode as CityColorMode) : undefined}
    />
  );
}
