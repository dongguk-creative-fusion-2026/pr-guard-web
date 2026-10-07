import { JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { InsightTab } from "@/components/insights/InsightsView";
import { api, ApiError } from "@/lib/api";
import { shortSha } from "@/lib/format";
import { InsightsClient } from "./InsightsClient";

export const dynamic = "force-dynamic";

const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const TABS: InsightTab[] = ["city", "hotspots", "coupling"];

/** 코드 인사이트 전체 화면: 코드 시티 · 핫스팟 · 숨은 결합 (?tab=) */
export default async function InsightsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const { tab } = await searchParams;

  let data;
  try {
    data = await Promise.all([api.getProject(id), api.getGraph(id)]);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const [project, graph] = data;
  if (!graph?.graph) {
    return (
      <div className="empty">
        아직 그래프가 없습니다. <Link href={`/projects/${id}`}>프로젝트로 돌아가기</Link>
      </div>
    );
  }
  return (
    <InsightsClient
      data={graph.graph}
      title={`${project.owner}/${project.name}`}
      subtitle={graph.commitSha ? `${shortSha(graph.commitSha)} 기준 코드 인사이트` : "코드 인사이트"}
      backHref={`/projects/${id}`}
      graphHref={`/projects/${id}/graph`}
      fontFamily={mono.style.fontFamily}
      initialTab={TABS.includes(tab as InsightTab) ? (tab as InsightTab) : "city"}
    />
  );
}
