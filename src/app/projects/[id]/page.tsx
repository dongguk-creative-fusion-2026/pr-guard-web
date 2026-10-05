import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { formatTime, shortSha } from "@/lib/format";
import { ProjectActions } from "./ProjectActions";
import { ReviewMarkdown } from "./ReviewMarkdown";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  let data;
  try {
    data = await Promise.all([api.getProject(id), api.listPulls(id), api.listReviews(id)]);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const [project, pulls, reviews] = data;

  return (
    <>
      <h1>
        <a href={project.htmlUrl} target="_blank" rel="noreferrer">
          {project.owner}/{project.name}
        </a>
      </h1>
      <p className="muted">
        프로젝트 #{project.id} · 기본 브랜치 <code>{project.defaultBranch}</code> · 마지막 확인{" "}
        {formatTime(project.lastPolledAt)}
      </p>
      {project.lastPollError && <p className="error">폴링 오류: {project.lastPollError}</p>}
      <ProjectActions projectId={project.id} />

      <h2>Pull Request</h2>
      {pulls.length === 0 ? (
        <div className="empty">감지된 PR 이 없습니다</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>PR</th>
                <th>제목</th>
                <th>작성자</th>
                <th>커밋</th>
                <th>상태</th>
                <th>최근 리뷰</th>
              </tr>
            </thead>
            <tbody>
              {pulls.map((pr) => (
                <tr key={pr.id}>
                  <td>
                    <a href={pr.htmlUrl} target="_blank" rel="noreferrer">
                      #{pr.number}
                    </a>
                  </td>
                  <td>
                    {pr.title}
                    <div className="muted">
                      <code>{pr.headRef}</code> → <code>{pr.baseRef}</code>
                    </div>
                  </td>
                  <td>{pr.author}</td>
                  <td>
                    <code>{shortSha(pr.headSha)}</code>
                  </td>
                  <td>
                    <span className={`badge ${pr.state}`}>{pr.state}</span>
                  </td>
                  <td>
                    {pr.latestReviewStatus ? (
                      <span className={`badge ${pr.latestReviewStatus}`}>{pr.latestReviewStatus}</span>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>리뷰 기록</h2>
      {reviews.length === 0 ? (
        <div className="empty">아직 리뷰가 없습니다</div>
      ) : (
        reviews.map((r) => (
          <details key={r.id} className="review">
            <summary className="row">
              <span className={`badge ${r.status}`}>{r.status}</span>
              <span>
                PR #{r.prNumber} · <code>{shortSha(r.headSha)}</code>
              </span>
              <span className="muted">
                {formatTime(r.finishedAt ?? r.createdAt)}
                {r.reviewer && ` · ${r.reviewer}`}
              </span>
              {r.commentUrl && (
                <a href={r.commentUrl} target="_blank" rel="noreferrer">
                  코멘트 보기
                </a>
              )}
            </summary>
            <div className="review-body">
              {r.error && <p className="error">{r.error}</p>}
              {r.result ? (
                <ReviewMarkdown>{r.result}</ReviewMarkdown>
              ) : (
                !r.error && <p className="muted">결과 없음</p>
              )}
            </div>
          </details>
        ))
      )}
    </>
  );
}
