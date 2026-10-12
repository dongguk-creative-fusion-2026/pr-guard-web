import Link from "next/link";
import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { fileName, formatTime, shortSha } from "@/lib/format";
import { buildQueue, LANE_META } from "@/lib/queue";
import { GraphState } from "./GraphState";
import { ProjectActions } from "./ProjectActions";

export const dynamic = "force-dynamic";

/** 프로젝트 입구: PR 이력과 커밋 이력 중 하나를 고른다. 갈래마다 지금 상태를 숫자로 먼저 보여 준다 */
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
  const { stats } = buildQueue(pulls, reviews);
  const history = graph?.graph?.history ?? null;
  const last = history?.timeline?.at(-1) ?? null;
  const hot = Object.entries(history?.files ?? {})
    .sort((a, b) => b[1].commits - a[1].commits)
    .slice(0, 3);

  return (
    <main className="entry">
      {!project.onboardedAt && (
        <Link href={`/projects/${id}/onboarding`} className="ob-banner">
          <span>
            <b>시작 안내를 마치지 않았어요</b> 레포 브리핑과 리뷰 설정을 확인하세요
          </span>
          <span>이어하기 →</span>
        </Link>
      )}
      {project.lastPollError && <p className="error">폴링 오류: {project.lastPollError}</p>}

      <div className="entry-grid">
        <Link href={`/projects/${id}/prs`} className="entry-card pr">
          <span className="entry-kicker">PR 이력</span>
          <h2>이 PR, 머지해도 되나?</h2>
          <p className="muted">열린 PR 을 차단 · 확인 필요 · 자동 통과로 나누고, PR 마다 판정과 근거, 영향 범위를 봅니다.</p>
          <div className="entry-stats">
            <div>
              <b>{stats.open}</b>
              <span>열린 PR</span>
            </div>
            <div>
              <b style={{ color: LANE_META.CHECK.color }}>{stats.human}</b>
              <span>사람이 볼 PR</span>
            </div>
            <div>
              <b style={{ color: LANE_META.PASS.color }}>{stats.pass}</b>
              <span>자동 통과</span>
            </div>
            <div>
              <b>{stats.medianSeconds != null ? `${stats.medianSeconds}초` : "-"}</b>
              <span>리뷰 시간 (중앙값)</span>
            </div>
          </div>
          <span className="entry-go">대기열 열기 →</span>
        </Link>

        <Link href={`/projects/${id}/commits`} className="entry-card commit">
          <span className="entry-kicker">커밋 이력</span>
          <h2>레포는 어떻게 변해 왔고, 어디가 위험한가?</h2>
          <p className="muted">커밋 순서대로 코드 시티를 따라가며 핫스팟 · 숨은 결합 · AI 위임 구역 · 함수 그래프를 봅니다.</p>
          <div className="entry-stats">
            <div>
              <b>{history?.commits ?? "-"}</b>
              <span>커밋</span>
            </div>
            <div>
              <b>{history?.authors?.length ?? "-"}</b>
              <span>작성자</span>
            </div>
            <div>
              <b>{graph?.graph?.stats.shownFiles ?? "-"}</b>
              <span>파일</span>
            </div>
            <div>
              <b>{history?.until ? formatTime(history.until).slice(0, 10) : "-"}</b>
              <span>마지막 커밋</span>
            </div>
          </div>
          {last?.m && (
            <p className="entry-last">
              <code>{last.h ? shortSha(last.h) : ""}</code> {last.m}
            </p>
          )}
          {hot.length > 0 && (
            <p className="entry-hot muted">
              자주 바뀐 파일: {hot.map(([path, h]) => `${fileName(path)} (${h.commits})`).join(" · ")}
            </p>
          )}
          <span className="entry-go">코드 시티 열기 →</span>
        </Link>
      </div>

      <section className="entry-foot">
        <GraphState projectId={id} graph={graph} />
        <p className="muted">
          PR 코멘트 {project.commentEnabled ? "켜짐" : "꺼짐"} · MAJOR {project.majorThreshold ?? 1}건부터 수정 후 머지 · 기본 브랜치{" "}
          <code>{project.defaultBranch}</code> ·{" "}
          <a href={project.htmlUrl} target="_blank" rel="noreferrer">
            GitHub ↗
          </a>{" "}
          · <Link href={`/projects/${id}/onboarding?step=3`}>레포 브리핑</Link>
        </p>
        <ProjectActions projectId={id} />
      </section>
    </main>
  );
}
