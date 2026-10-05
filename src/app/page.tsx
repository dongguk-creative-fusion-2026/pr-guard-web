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
      <h1>프로젝트 등록</h1>
      <p className="muted">public GitHub 레포 주소를 등록하면 열린 PR 을 주기적으로 확인해서 리뷰를 남깁니다.</p>
      <RegisterForm />

      <h2>프로젝트</h2>
      {error && <p className="error">{error}</p>}
      {!error && projects.length === 0 && <div className="empty">등록된 프로젝트가 없습니다</div>}
      {projects.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>레포</th>
                <th>열린 PR</th>
                <th>마지막 확인</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td>{p.id}</td>
                  <td>
                    <Link href={`/projects/${p.id}`}>
                      {p.owner}/{p.name}
                    </Link>
                  </td>
                  <td>{p.openPullCount}</td>
                  <td>
                    {formatTime(p.lastPolledAt)}
                    {p.lastPollError && <div className="error">{p.lastPollError}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
