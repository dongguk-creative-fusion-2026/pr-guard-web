import { HomeLink, StatusScreen } from "@/components/StatusScreen";

/** 프로젝트는 있지만 PR · 리뷰가 없을 때: 상단 바 아래에 보여 준다 */
export default function ProjectNotFound() {
  return (
    <StatusScreen title="찾을 수 없습니다" detail="이 프로젝트에 없는 PR 이거나 리뷰입니다.">
      <HomeLink />
    </StatusScreen>
  );
}
