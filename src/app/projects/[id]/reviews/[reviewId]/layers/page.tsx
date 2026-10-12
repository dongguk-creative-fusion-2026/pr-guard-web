import { createHash } from "node:crypto";
import { JetBrains_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { LayersClient } from "./LayersClient";

export const dynamic = "force-dynamic";

const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

/** 근거 층: 지적마다 코드 인덱스 · git 이력 · 실행 · AI 판단 중 어느 층이 확인했는지 3D 로 펼쳐 보는 전체 화면 */
export default async function LayersPage({ params }: { params: Promise<{ id: string; reviewId: string }> }) {
  const p = await params;
  const projectId = Number(p.id);
  const reviewId = Number(p.reviewId);
  if (!Number.isInteger(projectId) || !Number.isInteger(reviewId)) notFound();

  let data;
  try {
    data = await Promise.all([api.getReview(reviewId), api.getProject(projectId), api.getGraph(projectId)]);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const [{ review, findings, context }, project, graph] = data;
  if (review.projectId !== projectId) notFound();

  // GitHub PR diff 의 파일 앵커는 경로의 sha256 이다
  const paths = new Set([...findings.map((f) => f.file), ...(context?.files ?? []).map((f) => f.path)].filter((x): x is string => !!x));
  const diffAnchors = Object.fromEntries([...paths].map((path) => [path, `diff-${createHash("sha256").update(path).digest("hex")}`]));

  return (
    <LayersClient
      review={review}
      findings={findings}
      context={context}
      graph={graph?.graph ?? null}
      repo={`${project.owner}/${project.name}`}
      backHref={`/projects/${projectId}/reviews/${reviewId}`}
      diffAnchors={diffAnchors}
      fontFamily={mono.style.fontFamily}
    />
  );
}
