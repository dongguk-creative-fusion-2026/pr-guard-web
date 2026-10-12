import Link from "next/link";
import { api, ApiError, type Project } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { RegisterForm } from "./RegisterForm";

export const dynamic = "force-dynamic";

export default async function Home() {
  let projects: Project[] = [];
  let error: string | null = null;
  try {
    projects = await api.listProjects();
  } catch (e) {
    error = e instanceof ApiError ? e.message : "프로젝트 목록을 불러오지 못했습니다";
  }

  return (
    <>
      <header className="pbar">
        <Link href="/" className="pbar-brand">
          🛡️ PR Guard
        </Link>
      </header>
      <main>
        <section className="home-hero">
          <h1>AI 가 쓴 PR, 증명된 위험만 사람에게</h1>
          <p className="muted">
            public GitHub 레포를 등록하면 열린 PR 을 주기적으로 확인해 코드 인덱스 · git 이력 · 실행 · AI 판단으로 리뷰하고, 레포가 어떻게 변해
            왔는지 코드 시티로 보여 줍니다.
          </p>
          <RegisterForm />
        </section>

        <h2>프로젝트</h2>
        {error && <p className="error">{error}</p>}
        {!error && projects.length === 0 && <div className="empty">등록된 프로젝트가 없습니다</div>}
        <div className="home-projects">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="home-project">
              <b>
                {p.owner}/<span>{p.name}</span>
              </b>
              <span className="muted">
                열린 PR {p.openPullCount} · 마지막 확인 {formatTime(p.lastPolledAt)}
              </span>
              {p.lastPollError && <span className="error">{p.lastPollError}</span>}
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
