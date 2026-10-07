import { JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { shortSha, VERDICT_LABEL } from "@/lib/format";
import { CityClient } from "./CityClient";

export const dynamic = "force-dynamic";

const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

/** PR 하나의 영향을 코드 시티 위에 3D 로 보여 주는 전체 화면 */
export default async function ImpactCityPage({ params }: { params: Promise<{ id: string; reviewId: string }> }) {
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
  const reviewHref = `/projects/${projectId}/reviews/${reviewId}`;
  if (!graph?.graph) {
    return (
      <div className="empty">
        레포 그래프가 아직 없습니다. <Link href={`/projects/${projectId}`}>프로젝트에서 만들기</Link>
      </div>
    );
  }
  const header = (
    <>
      <div className="gx-pr">
        <span className="gx-pr-num">PR #{review.prNumber}</span>
        {review.verdict && <span className={`gx-verdict ${review.verdict}`}>{VERDICT_LABEL[review.verdict]}</span>}
      </div>
      {review.summary && <p className="gx-pr-summary">{review.summary}</p>}
    </>
  );
  return (
    <CityClient
      data={graph.graph}
      context={context}
      findings={findings}
      title={`${project.owner}/${project.name} · 리뷰 #${review.id}`}
      subtitle={`PR #${review.prNumber} · ${shortSha(review.headSha)} 영향 시티`}
      backHref={reviewHref}
      impact2dHref={`${reviewHref}/impact`}
      fontFamily={mono.style.fontFamily}
      header={header}
    />
  );
}
