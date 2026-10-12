import Link from "next/link";
import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { formatTime, timeAgo } from "@/lib/format";
import { buildQueue, type Lane } from "@/lib/queue";
import type { EntryMark } from "@/components/insights/EntryCity";
import { EntryCityClient } from "./EntryCityClient";
import { GraphState } from "./GraphState";
import { ProjectActions } from "./ProjectActions";

export const dynamic = "force-dynamic";

const PREVIEW = 5;
const LANE_TONE: Record<Lane, string> = { BLOCKED: "red", CHECK: "yellow", PASS: "green", REVIEWING: "", NONE: "" };
/** 도시에 세울 PR 색 (막힘 · 확인 필요) */
const MARK_COLOR: Partial<Record<Lane, string>> = { BLOCKED: "#f87171", CHECK: "#facc15" };
/** 도시에 표시할 PR 수 (리뷰 상세를 하나씩 불러온다) */
const MARK_LIMIT = 12;

/**
 * 프로젝트 입구: 바닥에 프로젝트 구조대로 지은 코드 시티를 깔고, 사람이 볼 PR 이 건드린 건물을 판정 색으로 세운다.
 * 그 위 오른쪽에 PR 이력 · 커밋 이력 두 갈래 (숫자 한 줄과 지금 볼 것 몇 개)
 */
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

  // 사람이 볼 PR 이 바꾼 파일 (리뷰 분석 재료의 파일 목록)
  const flagged = items.filter((i) => MARK_COLOR[i.lane] && i.review).slice(0, MARK_LIMIT);
  const details = graph?.graph ? await Promise.all(flagged.map((i) => api.getReview(i.review!.id).catch(() => null))) : [];
  const marks: EntryMark[] = flagged.flatMap((i, k) => {
    const context = details[k]?.context;
    if (!context) return [];
    const files = (context.files ?? context.history).map((f) => ("path" in f ? f.path : f.file));
    return [{ number: i.pull.number, title: i.pull.title, color: MARK_COLOR[i.lane]!, files }];
  });
  const city = graph?.graph ?? null;

  return (
    <main className={city ? "en en-stage" : "en"}>
      {city && (
        <div className="en-city">
          <EntryCityClient data={city} projectId={id} marks={marks} />
          <div className="en-legend">
            <span>
              <i style={{ background: MARK_COLOR.BLOCKED }} />
              머지 막힘
            </span>
            <span>
              <i style={{ background: MARK_COLOR.CHECK }} />
              확인 필요
            </span>
            <span className="en-legend-dim">PR 이 바꾼 파일 · 구역 = 모듈 · 계층</span>
          </div>
        </div>
      )}
      <div className="en-overlay">
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
      </div>
    </main>
  );
}
