import Link from "next/link";
import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { ReviewDecision } from "../../reviews/ReviewDecision";
import { RerunButton } from "../../RerunButton";

export const dynamic = "force-dynamic";

/** PR 이력 → PR 하나: 가장 최근 리뷰(또는 ?review= 로 고른 리뷰)의 판단 화면 */
export default async function PullPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; number: string }>;
  searchParams: Promise<{ review?: string }>;
}) {
  const p = await params;
  const projectId = Number(p.id);
  const number = Number(p.number);
  if (!Number.isInteger(projectId) || !Number.isInteger(number)) notFound();
  const chosen = Number((await searchParams).review);

  let data;
  try {
    data = await Promise.all([api.listReviews(projectId, 100), api.listPulls(projectId)]);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const [reviews, pulls] = data;
  const runs = reviews.filter((r) => r.prNumber === number);
  const review = runs.find((r) => r.id === chosen) ?? runs[0];
  if (!review) {
    const pull = pulls.find((x) => x.number === number);
    if (!pull) notFound();
    return (
      <main className="wide dec">
        <header className="dec-head">
          <div className="dec-title">
            <span className="dec-num">PR #{number}</span>
            <h1>{pull.title}</h1>
          </div>
        </header>
        <div className="empty">
          아직 이 PR 의 리뷰가 없어요. {pull.state === "open" && <RerunButton projectId={projectId} prNumber={number} />}
          <p>
            <Link href={`/projects/${projectId}/prs`}>← 대기열</Link>
          </p>
        </div>
      </main>
    );
  }
  return <ReviewDecision projectId={projectId} reviewId={review.id} />;
}
