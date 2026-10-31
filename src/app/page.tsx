import Link from "next/link";
import { Logo } from "@/components/Logo";
import { api, ApiError, type Project } from "@/lib/api";
import { formatTime, timeAgo } from "@/lib/format";
import { buildQueue, LANE_META, LANES, type Lane, type QueueStats } from "@/lib/queue";
import { summarizeStack } from "@/lib/stack";
import { RegisterForm } from "./RegisterForm";

export const dynamic = "force-dynamic";

type Row = {
  project: Project;
  stats: QueueStats | null;
  lanes: Record<Lane, number> | null;
  stack: ReturnType<typeof summarizeStack>;
};

/** 0 은 흐린 대시로: 숫자가 있는 칸만 눈에 들어오게 */
function Num({ value, tone }: { value: number | null | undefined; tone?: "warn" | "ok" }) {
  if (!value) return <span className="pl-zero">–</span>;
  return <span className={tone ? `t-${tone}` : undefined}>{value}</span>;
}

export default async function Home() {
  let projects: Project[] = [];
  let error: string | null = null;
  try {
    projects = await api.listProjects();
  } catch (e) {
    error = e instanceof ApiError ? e.message : "프로젝트 목록을 불러오지 못했습니다";
  }
  // 행마다 대기열 숫자와 레포 구성. 한 프로젝트가 실패해도 나머지는 그린다
  const rows: Row[] = await Promise.all(
    projects.map(async (project) => {
      const [repo, graph] = await Promise.all([
        api.getRepoInfo(project.id).catch(() => null),
        api.getGraph(project.id).catch(() => null),
      ]);
      const stack = summarizeStack(repo, graph?.graph?.infra);
      try {
        const [pulls, reviews] = await Promise.all([api.listPulls(project.id), api.listReviews(project.id, 100)]);
        const { items, stats } = buildQueue(pulls, reviews);
        const lanes = Object.fromEntries(LANES.map((l) => [l, items.filter((i) => i.lane === l).length])) as Record<Lane, number>;
        return { project, stats, lanes, stack };
      } catch {
        return { project, stats: null, lanes: null, stack };
      }
    }),
  );

  return (
    <>
      <header className="pbar">
        <Link href="/" className="pbar-brand">
          <Logo /> PR Guard
        </Link>
      </header>
      <main className="home">
        <div className="home-head">
          <h1>
            프로젝트 <span>{projects.length}</span>
          </h1>
          <RegisterForm />
        </div>
        {error && <p className="error">{error}</p>}

        {projects.length > 0 && (
          <div className="pl" role="table">
            <div className="pl-row pl-header" role="row">
              <span>레포</span>
              <span>구성</span>
              <span className="pl-n">열린 PR</span>
              <span className="pl-n">볼 PR</span>
              <span className="pl-n">자동 통과</span>
              <span>판정 분포</span>
              <span className="pl-n">확인</span>
            </div>
            {rows.map(({ project: p, stats, lanes, stack }) => {
              const langs = stack.languages.map((l) => l.name);
              const parts = stack.parts.map((x) => x.label);
              const all = [...langs, ...parts];
              return (
                <Link key={p.id} href={`/projects/${p.id}`} className="pl-row" role="row">
                  <span className="pl-name">
                    <b>{p.name}</b>
                    <small>{p.owner}</small>
                  </span>
                  <span className="pl-stack" title={all.join(" · ")}>
                    {langs.length > 0 && <span className="pl-langs">{langs.join(" · ")}</span>}
                    {parts.length > 0 && <span className="pl-parts">{parts.join(" · ")}</span>}
                    {all.length === 0 && <span className="pl-zero">–</span>}
                  </span>
                  <span className="pl-n">
                    <Num value={stats?.open ?? p.openPullCount} />
                  </span>
                  <span className="pl-n">
                    <Num value={stats?.human} tone="warn" />
                  </span>
                  <span className="pl-n">
                    <Num value={stats?.pass} tone="ok" />
                  </span>
                  <span className="pl-bar">
                    {lanes && (stats?.open ?? 0) > 0 ? (
                      LANES.map((l) =>
                        lanes[l] > 0 ? <i key={l} style={{ flex: lanes[l], background: LANE_META[l].color }} title={`${LANE_META[l].label} ${lanes[l]}`} /> : null,
                      )
                    ) : (
                      <i className="empty" />
                    )}
                  </span>
                  <span className={`pl-n pl-time${p.lastPollError ? " err" : ""}`} title={p.lastPollError ?? formatTime(p.lastPolledAt)}>
                    {p.lastPollError ? "오류" : timeAgo(p.lastPolledAt)}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
        {!error && projects.length === 0 && <p className="pl-empty">첫 레포를 추가하세요</p>}
      </main>
    </>
  );
}
