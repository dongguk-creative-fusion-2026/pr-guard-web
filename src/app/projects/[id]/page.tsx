import Link from "next/link";
import { notFound } from "next/navigation";
import { api, ApiError, type Review } from "@/lib/api";
import { formatTime, shortSha, VERDICT_LABEL } from "@/lib/format";
import { ProjectActions } from "./ProjectActions";
import { RerunButton } from "./RerunButton";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  let data;
  try {
    data = await Promise.all([api.getProject(id), api.listPulls(id), api.listReviews(id, 50)]);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const [project, pulls, reviews] = data;
  const latestByPr = new Map<number, Review>();
  for (const r of reviews) {
    if (!latestByPr.has(r.prNumber)) latestByPr.set(r.prNumber, r);
  }

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
                <th>커밋</th>
                <th>최근 리뷰</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pulls.map((pr) => {
                const latest = latestByPr.get(pr.number);
                return (
                  <tr key={pr.id}>
                    <td>
                      <a href={pr.htmlUrl} target="_blank" rel="noreferrer">
                        #{pr.number}
                      </a>
                      {pr.state === "closed" && <div className="badge closed">closed</div>}
                    </td>
                    <td>
                      {pr.title}
                      <div className="muted">
                        {pr.author} · <code>{pr.headRef}</code> → <code>{pr.baseRef}</code>
                      </div>
                    </td>
                    <td>
                      <code>{shortSha(pr.headSha)}</code>
                    </td>
                    <td>{latest ? <ReviewBadge review={latest} projectId={project.id} /> : "-"}</td>
                    <td>{pr.state === "open" && <RerunButton projectId={project.id} prNumber={pr.number} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2>리뷰 기록</h2>
      {reviews.length === 0 ? (
        <div className="empty">아직 리뷰가 없습니다</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>리뷰</th>
                <th>PR</th>
                <th>결과</th>
                <th>지적</th>
                <th>리뷰어</th>
                <th>시각</th>
              </tr>
            </thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/projects/${project.id}/reviews/${r.id}`}>#{r.id}</Link>
                  </td>
                  <td>
                    #{r.prNumber} · <code>{shortSha(r.headSha)}</code>
                    {r.run > 1 && <span className="muted"> · run {r.run}</span>}
                  </td>
                  <td>
                    <ReviewBadge review={r} />
                  </td>
                  <td>{r.status === "DONE" ? `${r.findingCount}건` : "-"}</td>
                  <td className="muted">{r.reviewer ?? "-"}</td>
                  <td className="muted">{formatTime(r.finishedAt ?? r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ReviewBadge({ review, projectId }: { review: Review; projectId?: number }) {
  const badge =
    review.status === "DONE" && review.verdict ? (
      <span className={`verdict ${review.verdict}`}>{VERDICT_LABEL[review.verdict]}</span>
    ) : (
      <span className={`badge ${review.status}`}>{review.status}</span>
    );
  return projectId ? <Link href={`/projects/${projectId}/reviews/${review.id}`}>{badge}</Link> : badge;
}
