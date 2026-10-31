import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { RulesView } from "./RulesView";

export const dynamic = "force-dynamic";

/** 규칙 지도: 기본 브랜치 코드가 지키는 규칙 (코드에서 자동으로 뽑는다, AI 미사용) */
export default async function RulesPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  let project;
  try {
    project = await api.getProject(id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  let map;
  try {
    map = await api.getRules(id);
  } catch (e) {
    return (
      <main>
        <h1>규칙 지도</h1>
        <p className="error">{e instanceof ApiError ? e.message : "규칙 지도를 만들지 못했습니다"}</p>
      </main>
    );
  }
  if (!map) {
    return (
      <main>
        <h1>규칙 지도</h1>
        <div className="empty">백엔드가 아직 규칙 지도를 지원하지 않아요. pr-guard-api 를 새 버전으로 올려 주세요.</div>
      </main>
    );
  }
  return (
    <main className="wide">
      <RulesView map={map} htmlUrl={project.htmlUrl} />
    </main>
  );
}
