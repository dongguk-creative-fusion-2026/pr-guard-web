import Link from "next/link";
import { notFound } from "next/navigation";
import { api, ApiError, type Review } from "@/lib/api";
import { formatTime, shortSha, timeAgo, VERDICT_LABEL } from "@/lib/format";
import { buildQueue, LANE_META, type Lane, type QueueItem } from "@/lib/queue";

export const dynamic = "force-dynamic";

const BOARD: Lane[] = ["BLOCKED", "CHECK", "PASS"];
const LANE_TONE: Record<Lane, string> = { BLOCKED: "red", CHECK: "yellow", PASS: "green", REVIEWING: "", NONE: "" };

/** PR 이력: 열린 PR 대기열. 위에 병목 숫자, 아래에 차단 · 확인 필요 · 자동 통과 세 칸 */
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
  const pct = stats.open ? Math.round((stats.pass / stats.open) * 100) : 0;

  return (
    <main className="wide qv">
      <section className="statline">
        <div>
          <b>{stats.open}</b>
          <span>열린 PR</span>
        </div>
        <div>
          <b className="t-warn">{stats.human}</b>
          <span>사람이 볼 PR</span>
        </div>
        <div>
          <b className="t-ok">{stats.pass}</b>
          <span>자동 통과 · {pct}%</span>
        </div>
        <div>
          <b>{stats.medianSeconds != null ? `${stats.medianSeconds}s` : "-"}</b>
          <span>리뷰 시간 중앙값</span>
        </div>
      </section>

      {waiting.length > 0 && (
        <p className="qv-waiting">
          <span>리뷰 중 · 리뷰 없음</span>
          {waiting.map((item) => (
            <Link key={item.pull.id} href={`/projects/${id}/prs/${item.pull.number}`}>
              #{item.pull.number} {item.pull.title}
            </Link>
          ))}
        </p>
      )}

      <div className="board">
        {BOARD.map((lane) => {
          const list = byLane(lane);
          return (
            <section key={lane} className="lane">
              <header>
                <i className={`dot-sm ${LANE_TONE[lane]}`} />
                <b>{LANE_META[lane].label}</b>
                <span className="lane-count">{list.length}</span>
              </header>
              {list.length === 0 ? <p className="lane-empty">없음</p> : list.map((item) => <PullCard key={item.pull.id} item={item} projectId={id} />)}
            </section>
          );
        })}
      </div>

      <div className="dv-folds">
        <details>
          <summary>
            리뷰 기록 <span className="dv-n">{reviews.length}</span>
          </summary>
          <ReviewTable reviews={reviews} projectId={id} />
        </details>
      </div>
    </main>
  );
}

function PullCard({ item, projectId }: { item: QueueItem; projectId: number }) {
  const { pull, review } = item;
  return (
    <Link href={`/projects/${projectId}/prs/${pull.number}`} className="pcard">
      <span className="pcard-title">
        <span className="pcard-num">#{pull.number}</span>
        {pull.title}
      </span>
      <span className="pcard-meta">
        {review ? `지적 ${review.findingCount}건` : "리뷰 없음"} · {timeAgo(review?.finishedAt ?? review?.createdAt ?? pull.updatedAt)}
      </span>
    </Link>
  );
}

function ReviewTable({ reviews, projectId }: { reviews: Review[]; projectId: number }) {
  if (reviews.length === 0) return <p className="dv-note">아직 리뷰가 없습니다</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>PR</th>
            <th>커밋</th>
            <th>판정</th>
            <th>지적</th>
            <th>모델</th>
            <th>시각</th>
          </tr>
        </thead>
        <tbody>
          {reviews.map((r) => (
            <tr key={r.id}>
              <td>
                <Link href={`/projects/${projectId}/prs/${r.prNumber}?review=${r.id}`}>#{r.prNumber}</Link>
                {r.run > 1 && <span className="muted"> · {r.run}차</span>}
              </td>
              <td className="mono muted">{shortSha(r.headSha)}</td>
              <td>
                {r.status === "DONE" && r.verdict ? (
                  <span className={`verdict ${r.verdict}`}>{VERDICT_LABEL[r.verdict]}</span>
                ) : (
                  <span className={`badge ${r.status}`}>{r.status}</span>
                )}
              </td>
              <td>{r.status === "DONE" ? r.findingCount : "-"}</td>
              <td className="muted">{r.reviewer?.replace("openai:", "") ?? "-"}</td>
              <td className="muted" title={formatTime(r.finishedAt ?? r.createdAt)}>
                {timeAgo(r.finishedAt ?? r.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
