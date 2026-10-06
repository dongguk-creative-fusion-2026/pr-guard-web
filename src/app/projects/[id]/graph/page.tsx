import { JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { formatTime, shortSha } from "@/lib/format";
import { GraphView } from "./GraphView";

export const dynamic = "force-dynamic";

const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

/** 레포 전체 파일 의존성 그래프 전용 화면 (화면 전체를 쓴다) */
export default async function GraphPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ file?: string }>;
}) {
  const id = Number((await params).id);
  const { file } = await searchParams;
  if (!Number.isInteger(id)) notFound();

  let data;
  try {
    data = await Promise.all([api.getProject(id), api.getGraph(id)]);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const [project, graph] = data;
  const title = `${project.owner}/${project.name}`;

  if (!graph?.graph) {
    return (
      <div className="empty">
        아직 그래프가 없습니다. <Link href={`/projects/${id}`}>프로젝트로 돌아가기</Link>
      </div>
    );
  }
  const subtitle = [
    graph.commitSha && `${shortSha(graph.commitSha)} 기준`,
    formatTime(graph.finishedAt),
    graph.status === "RUNNING" || graph.status === "PENDING" ? "다시 만드는 중" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <GraphView
      data={graph.graph}
      title={title}
      subtitle={subtitle}
      backHref={`/projects/${id}`}
      fontFamily={mono.style.fontFamily}
      initialFile={file}
    />
  );
}
