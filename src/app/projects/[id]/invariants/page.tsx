import { api } from "@/lib/api";
import ProjectRulesForm from "./ProjectRulesForm";

export default async function InvariantsPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const settings = await api.getProjectInvariantSettings(id);
  return <main className="wide dec">
    <h1>프로젝트 데이터 정합성 규칙</h1>
    <p>프로젝트에서 반복해서 사용할 규칙을 저장하세요. PR 상세 화면에서 불러온 뒤 해당 PR에 맞게 수정할 수 있습니다.</p>
    <p>기본 규칙을 저장해도 테스트가 자동으로 실행되지는 않습니다.</p>
    <ProjectRulesForm projectId={id} initialRules={settings.rules} />
  </main>;
}
