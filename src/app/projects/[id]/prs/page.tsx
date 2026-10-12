import Link from "next/link";
import { notFound } from "next/navigation";
import { api, ApiError, type Review } from "@/lib/api";
import { formatTime, shortSha, VERDICT_LABEL } from "@/lib/format";
import { buildQueue, LANE_META, type Lane, type QueueItem } from "@/lib/queue";
import { RerunButton } from "../RerunButton";

export const dynamic = "force-dynamic";

const BOARD: Lane[] = ["BLOCKED", "CHECK", "PASS"];

/** PR 이력: 열린 PR 대기열. 사람이 볼 PR(차단 · 확인 필요)과 자동 통과를 나누고 병목 숫자를 위에 둔다 */
export default async function PullQueuePage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  let data;
  try {
    data = await Promise.all([api.listPulls(id), api.listReviews(id, 100)]);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const [pulls, reviews] = data;
  const { items, stats } = buildQueue(pulls, reviews);
  const byLane = (lane: Lane) => items.filter((i) => i.lane === lane);
  const waiting = [...byLane("REVIEWING"), ...byLane("NONE")];
  const closed = pulls.filter((p) => p.state === "closed");

  return (
    <main className="wide">
      <section className="bneck">
        <div>
          <b>{stats.open}</b>
          <span>열린 PR</span>
        </div>
        <div className="bneck-arrow">→</div>
        <div>
          <b style={{ color: LANE_META.CHECK.color }}>{stats.human}</b>
          <span>볼 PR</span>
          <small className="muted">차단 {byLane("BLOCKED").length} · 확인 필요 {byLane("CHECK").length}</small>
        </div>
        <div>
          <b style={{ color: LANE_META.PASS.color }}>{stats.pass}</b>
          <span>자동 통과</span>
          <small className="muted">{stats.open ? Math.round((stats.pass / stats.open) * 100) : 0}%</small>
        </div>
        <div>
          <b>{stats.medianSeconds != null ? `${stats.medianSeconds}초` : "-"}</b>
          <span>리뷰 시간</span>
        </div>
        {stats.reviewing > 0 && (
          <div>
            <b style={{ color: LANE_META.REVIEWING.color }}>{stats.reviewing}</b>
            <span>리뷰 중</span>
          </div>
        )}
      </section>

      {waiting.length > 0 && (
        <section className="queue-waiting">
          {waiting.map((item) => (
            <PullCard key={item.pull.id} item={item} projectId={id} compact />
          ))}
        </section>
      )}

      <div className="board">
        {BOARD.map((lane) => {
          const list = byLane(lane);
          return (
            <section key={lane} className={`lane ${lane}`}>
              <header>
                <i style={{ background: LANE_META[lane].color }} />
                <b>{LANE_META[lane].label}</b>
                <span className="lane-count">{list.length}</span>
              </header>
              {list.length === 0 ? <p className="muted lane-empty">없음</p> : list.map((item) => <PullCard key={item.pull.id} item={item} projectId={id} />)}
            </section>
          );
        })}
      </div>

      <details className="fold">
        <summary>
          리뷰 기록 <span className="muted">{reviews.length}건</span>
          {closed.length > 0 && <span className="muted"> · 닫힌 PR {closed.length}개</span>}
        </summary>
        <ReviewTable reviews={reviews} projectId={id} />
      </details>
    </main>
  );
}

function PullCard({ item, projectId, compact }: { item: QueueItem; projectId: number; compact?: boolean }) {
  const { pull, review, lane } = item;
  return (
    <article className={`pcard ${lane}${compact ? " compact" : ""}`}>
      <Link href={`/projects/${projectId}/prs/${pull.number}`} className="pcard-main">
        <span className="pcard-num">#{pull.number}</span>
        <span className="pcard-title">{pull.title}</span>
        <span className="muted pcard-meta">
          {pull.author} · <code>{pull.headRef}</code> · <code>{shortSha(pull.headSha)}</code>
        </span>
        <span className="pcard-foot">
          {review?.status === "DONE" && review.verdict ? (
            <>
              <span className={`verdict ${review.verdict}`}>{VERDICT_LABEL[review.verdict]}</span>
              <span className="muted">지적 {review.findingCount}건</span>
            </>
          ) : (
            <span className={`badge ${review?.status ?? "PENDING"}`}>{review?.status ?? "리뷰 없음"}</span>
          )}
          <span className="muted">{formatTime(review?.finishedAt ?? review?.createdAt ?? pull.updatedAt)}</span>
        </span>
      </Link>
      {!compact && lane !== "REVIEWING" && (
        <div className="pcard-actions">
          <RerunButton projectId={projectId} prNumber={pull.number} />
        </div>
      )}
    </article>
  );
}

function ReviewTable({ reviews, projectId }: { reviews: Review[]; projectId: number }) {
  if (reviews.length === 0) return <div className="empty">아직 리뷰가 없습니다</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>PR</th>
            <th>커밋</th>
            <th>판정</th>
            <th>지적</th>
            <th>리뷰어</th>
            <th>시각</th>
          </tr>
        </thead>
        <tbody>
          {reviews.map((r) => (
            <tr key={r.id}>
              <td>
                <Link href={`/projects/${projectId}/prs/${r.prNumber}?review=${r.id}`}>#{r.prNumber}</Link>
                {r.run > 1 && <span className="muted"> · run {r.run}</span>}
              </td>
              <td>
                <code>{shortSha(r.headSha)}</code>
              </td>
              <td>
                {r.status === "DONE" && r.verdict ? (
                  <span className={`verdict ${r.verdict}`}>{VERDICT_LABEL[r.verdict]}</span>
                ) : (
                  <span className={`badge ${r.status}`}>{r.status}</span>
                )}
              </td>
              <td>{r.status === "DONE" ? `${r.findingCount}건` : "-"}</td>
              <td className="muted">{r.reviewer ?? "-"}</td>
              <td className="muted">{formatTime(r.finishedAt ?? r.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
