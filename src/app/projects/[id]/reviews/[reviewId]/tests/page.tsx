import Link from "next/link";
import { notFound } from "next/navigation";
import { TestSelectionView } from "@/components/tests/TestSelectionView";
import { api, ApiError } from "@/lib/api";
import { shortSha } from "@/lib/format";
import { classResults, diffOf, pickSelection } from "@/lib/testSelection";

export const dynamic = "force-dynamic";

/** 영향 테스트 선택: 이 PR 에서 어떤 테스트를 왜 돌렸고 어떤 테스트를 왜 걸렀는지 */
export default async function TestsPage({ params }: { params: Promise<{ id: string; reviewId: string }> }) {
  const p = await params;
  const projectId = Number(p.id);
  const reviewId = Number(p.reviewId);
  if (!Number.isInteger(projectId) || !Number.isInteger(reviewId)) notFound();

  let data;
  try {
    data = await Promise.all([api.getReview(reviewId), api.getReviewEvents(reviewId), api.getTestRuns(reviewId)]);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const [{ review }, events, runs] = data;
  if (review.projectId !== projectId) notFound();

  const back = `/projects/${projectId}/prs/${review.prNumber}?review=${review.id}`;
  const selection = pickSelection(runs, events);
  const diff = diffOf(events);
  const executed = runs.length > 0 && runs.every((r) => r.status === "DONE" || r.status === "FAILED");

  return (
    <main className="dv ts-page">
      <header className="dv-head">
        <div className="dv-crumb">
          <Link href={back}>← PR #{review.prNumber}</Link>
          <span>{shortSha(review.headSha)}</span>
        </div>
        <h1>테스트 선택</h1>
        <p className="muted">PR 이 바꾼 메서드를 지나가는 테스트만 골라 base · head 에서 돌립니다. 어떤 테스트를 왜 돌리고 왜 걸렀는지 보여 줍니다.</p>
      </header>
      {!selection || selection.mode === "OFF" ? (
        <div className="ts-off">
          <h2>이 리뷰에는 테스트 선택 기록이 없습니다</h2>
          <p className="muted">
            {selection?.fullReasons?.[0]
              ? `이유: ${selection.fullReasons[0]}`
              : "실행 검증이 꺼져 있었거나, 테스트 선택이 생기기 전 리뷰입니다. 프로젝트 설정에서 실행 검증을 켜면 다음 PR 부터 보입니다."}
          </p>
          <Link href={back} className="dv-btn ts-off-btn">
            PR 판단 화면으로
          </Link>
        </div>
      ) : (
        <TestSelectionView
          selection={selection}
          results={classResults(runs, diff)}
          missed={diff?.selection?.missed ?? (executed ? [] : null)}
          executed={executed}
          reviewId={review.id}
          live={review.status === "PENDING" || review.status === "RUNNING"}
        />
      )}
    </main>
  );
}
