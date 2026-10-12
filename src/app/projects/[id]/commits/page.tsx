import { JetBrains_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import type { CityColorMode } from "@/components/insights/CodeCity";
import type { InsightTab } from "@/components/insights/InsightsView";
import { api, ApiError } from "@/lib/api";
import { shortSha } from "@/lib/format";
import { InsightsClient } from "../insights/InsightsClient";
import { GraphState } from "../GraphState";

export const dynamic = "force-dynamic";

const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const TABS: InsightTab[] = ["city", "hotspots", "coupling"];
const MODES: CityColorMode[] = ["hotspot", "group", "recent", "test", "runtime", "delegation"];

/**
 * 커밋 이력: 코드 시티 + 커밋 목록(시간 여행)이 중심. 같은 자리에서 핫스팟 · 숨은 결합을 탭으로 (?tab=),
 * 색 기준으로 기능 묶음 · 최근 변경 · 테스트 · 런타임 · AI 위임 구역 (?mode=).
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
    data = await Promise.all([api.getProject(id), api.getGraph(id), api.getRuntime(id)]);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const [project, graph, runtime] = data;
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
