import { notFound } from "next/navigation";
import { ReviewDecision } from "../ReviewDecision";

export const dynamic = "force-dynamic";

/** 리뷰 하나 (예전 주소). PR 이력의 PR 화면과 같은 판단 화면을 보여 준다 */
export default async function ReviewPage({ params }: { params: Promise<{ id: string; reviewId: string }> }) {
  const p = await params;
  const projectId = Number(p.id);
  const reviewId = Number(p.reviewId);
  if (!Number.isInteger(projectId) || !Number.isInteger(reviewId)) notFound();
  return <ReviewDecision projectId={projectId} reviewId={reviewId} />;
}
