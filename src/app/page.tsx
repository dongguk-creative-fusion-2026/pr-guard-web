import Link from "next/link";
import { api, ApiError, type Project } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { buildQueue, LANE_META, LANES, type Lane, type QueueStats } from "@/lib/queue";
import { RegisterForm } from "./RegisterForm";

export const dynamic = "force-dynamic";

type Card = { project: Project; stats: QueueStats | null; lanes: Record<Lane, number> | null };

/** 레포 이름으로 고정된 색 (카드 앞 표식) */
function hue(name: string): number {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export default async function Home() {
  let projects: Project[] = [];
  let error: string | null = null;
  try {
    projects = await api.listProjects();
  } catch (e) {
    error = e instanceof ApiError ? e.message : "프로젝트 목록을 불러오지 못했습니다";
  }
  // 카드마다 대기열 숫자를 같이 보여 준다. 한 프로젝트가 실패해도 나머지는 그린다
  const cards: Card[] = await Promise.all(
    projects.map(async (project) => {
      try {
        const [pulls, reviews] = await Promise.all([api.listPulls(project.id), api.listReviews(project.id, 100)]);
        const { items, stats } = buildQueue(pulls, reviews);
        const lanes = Object.fromEntries(LANES.map((l) => [l, items.filter((i) => i.lane === l).length])) as Record<Lane, number>;
        return { project, stats, lanes };
      } catch {
        return { project, stats: null, lanes: null };
      }
    }),
  );

  return (
    <>
      <header className="pbar">
        <Link href="/" className="pbar-brand">
          🛡️ PR Guard
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

        <div className="pgrid">
          {cards.map(({ project: p, stats, lanes }) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="pc" style={{ ["--h" as string]: hue(p.name) }}>
              <div className="pc-top">
                <span className="pc-mark">{p.name.slice(0, 1).toUpperCase()}</span>
                <div className="pc-name">
                  <b>{p.name}</b>
                  <span>{p.owner}</span>
                </div>
                <span className={`pc-live${p.lastPollError ? " err" : ""}`} title={p.lastPollError ?? "정상"} />
              </div>
              <div className="pc-stats">
                <div>
                  <b>{stats?.open ?? p.openPullCount}</b>
                  <span>열린 PR</span>
                </div>
                <div>
                  <b className={stats && stats.human > 0 ? "warn" : ""}>{stats?.human ?? "-"}</b>
                  <span>볼 PR</span>
                </div>
                <div>
                  <b className={stats && stats.pass > 0 ? "ok" : ""}>{stats?.pass ?? "-"}</b>
                  <span>자동 통과</span>
                </div>
              </div>
              <div className="pc-bar">
                {lanes && (stats?.open ?? 0) > 0 ? (
                  LANES.map((l) => (lanes[l] > 0 ? <i key={l} style={{ flex: lanes[l], background: LANE_META[l].color }} title={`${LANE_META[l].label} ${lanes[l]}`} /> : null))
                ) : (
                  <i style={{ flex: 1 }} />
                )}
              </div>
              <div className="pc-foot">
                <span>{timeAgo(p.lastPolledAt)}</span>
                <span className="pc-go">→</span>
              </div>
            </Link>
          ))}
          {!error && projects.length === 0 && <div className="pc pc-empty">첫 레포를 추가하세요</div>}
        </div>
      </main>
    </>
  );
}
