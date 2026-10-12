import Link from "next/link";
import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { formatTime, timeAgo } from "@/lib/format";
import { buildQueue, type Lane } from "@/lib/queue";
import { GraphState } from "./GraphState";
import { ProjectActions } from "./ProjectActions";

export const dynamic = "force-dynamic";

const PREVIEW = 5;
const LANE_TONE: Record<Lane, string> = { BLOCKED: "red", CHECK: "yellow", PASS: "green", REVIEWING: "", NONE: "" };

/** 프로젝트 입구: PR 이력 · 커밋 이력 두 갈래. 갈래마다 숫자 한 줄과 지금 볼 것 몇 개 */
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  let data;
  try {
    data = await Promise.all([api.getProject(id), api.listPulls(id), api.listReviews(id, 100), api.getGraph(id)]);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const [project, pulls, reviews, graph] = data;
  const { items, stats } = buildQueue(pulls, reviews);
  const attention = items.filter((i) => i.lane === "BLOCKED" || i.lane === "CHECK").slice(0, PREVIEW);
  const history = graph?.graph?.history ?? null;
  const commits = [...(history?.timeline ?? [])].reverse().slice(0, PREVIEW);
  const authors = history?.authors ?? [];

  return (
    <main className="en">
      {!project.onboardedAt && (
        <Link href={`/projects/${id}/onboarding`} className="ob-banner">
          <span>시작 안내를 마치지 않았어요</span>
          <span>이어하기</span>
        </Link>
      )}
      {project.lastPollError && <p className="error">폴링 오류: {project.lastPollError}</p>}

      <div className="en-grid">
        <section className="en-panel">
          <header>
            <h2>PR 이력</h2>
            <Link href={`/projects/${id}/prs`}>대기열</Link>
          </header>
          <div className="statline compact">
            <div>
              <b>{stats.open}</b>
              <span>열린 PR</span>
            </div>
            <div>
              <b className="t-warn">{stats.human}</b>
              <span>볼 PR</span>
            </div>
            <div>
              <b className="t-ok">{stats.pass}</b>
              <span>자동 통과</span>
            </div>
            <div>
              <b>{stats.medianSeconds != null ? `${stats.medianSeconds}s` : "-"}</b>
              <span>리뷰 시간</span>
            </div>
          </div>
          {attention.length === 0 ? (
            <p className="en-empty">사람이 볼 PR 이 없어요</p>
          ) : (
            <ul className="en-list">
              {attention.map(({ pull, review, lane }) => (
                <li key={pull.id}>
                  <Link href={`/projects/${id}/prs/${pull.number}`}>
                    <i className={`dot-sm ${LANE_TONE[lane]}`} />
                    <span className="en-num">#{pull.number}</span>
                    <span className="en-title">{pull.title}</span>
                    <span className="en-side">{timeAgo(review?.finishedAt ?? pull.updatedAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="en-panel">
          <header>
            <h2>커밋 이력</h2>
            <Link href={`/projects/${id}/commits?tab=graph`}>커밋 그래프</Link>
          </header>
          <div className="statline compact">
            <div>
              <b>{history?.commits ?? "-"}</b>
              <span>커밋</span>
            </div>
            <div>
              <b>{authors.length || "-"}</b>
              <span>작성자</span>
            </div>
            <div>
              <b>{graph?.graph?.stats.shownFiles ?? "-"}</b>
              <span>파일</span>
            </div>
            <div>
              <b>{history?.until ? timeAgo(history.until) : "-"}</b>
              <span>마지막 커밋</span>
            </div>
          </div>
          {commits.length === 0 ? (
            <p className="en-empty">레포 분석이 끝나면 커밋이 보여요</p>
          ) : (
            <ul className="en-list">
              {commits.map((c, i) => (
                <li key={i}>
                  <Link href={`/projects/${id}/commits?tab=graph`}>
                    <span className="en-num mono">{c.h ? c.h.slice(0, 7) : "-------"}</span>
                    <span className="en-title">{c.m || `${c.c.length}개 파일 변경`}</span>
                    <span className="en-side" title={formatTime(new Date(c.at * 1000).toISOString())}>
                      {authors[c.a] ?? ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <footer className="entry-foot">
        <GraphState projectId={id} graph={graph} />
        <a href={project.htmlUrl} target="_blank" rel="noreferrer">
          GitHub
        </a>
        <Link href={`/projects/${id}/onboarding?step=3`}>레포 브리핑</Link>
        <ProjectActions projectId={id} />
      </footer>
    </main>
  );
}
