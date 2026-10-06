import { JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { shortSha, VERDICT_LABEL } from "@/lib/format";
import { ImpactView } from "./ImpactView";

export const dynamic = "force-dynamic";

const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

/** PR 하나가 레포 의존성 그래프의 어디까지 닿는지 보는 전체 화면 */
export default async function ImpactPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; reviewId: string }>;
  searchParams: Promise<{ file?: string; fn?: string }>;
}) {
  const p = await params;
  const projectId = Number(p.id);
  const reviewId = Number(p.reviewId);
  if (!Number.isInteger(projectId) || !Number.isInteger(reviewId)) notFound();
  const { file, fn } = await searchParams;

  let data;
  try {
    data = await Promise.all([api.getReview(reviewId), api.getProject(projectId), api.getGraph(projectId)]);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const [{ review, findings, context }, project, graph] = data;
  if (review.projectId !== projectId) notFound();
  const backHref = `/projects/${projectId}/reviews/${reviewId}`;

  if (!graph?.graph) {
    return (
      <div className="empty">
        레포 의존성 그래프가 아직 없습니다. <Link href={`/projects/${projectId}`}>프로젝트에서 만들기</Link>
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
      {graph.commitSha && context?.baseSha && graph.commitSha !== context.baseSha && (
        <p className="gx-dim gx-note">
          그래프는 <code>{shortSha(graph.commitSha)}</code>, PR 은 <code>{shortSha(context.baseSha)}</code> 에서 갈라짐.
          그 사이 바뀐 파일은 연결이 다를 수 있음
        </p>
      )}
    </>
  );

  return (
    <ImpactView
      data={graph.graph}
      context={context}
      findings={findings}
      title={`${project.owner}/${project.name} · 리뷰 #${review.id}`}
      subtitle={`PR #${review.prNumber} · ${shortSha(review.headSha)} 영향 범위`}
      backHref={backHref}
      fontFamily={mono.style.fontFamily}
      initialFile={file}
      initialFunction={fn}
      header={header}
    />
  );
}
