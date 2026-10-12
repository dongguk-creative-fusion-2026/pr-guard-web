"use client";

import { useTransition } from "react";
import { deleteProject } from "../../actions";

/** 프로젝트 삭제 ("지금 확인"은 상단 바에 있다) */
export function ProjectActions({ projectId }: { projectId: number }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="small danger"
      disabled={pending}
      onClick={() => {
        if (confirm("프로젝트를 삭제할까요? PR·리뷰 기록도 함께 삭제됩니다.")) {
          start(() => deleteProject(projectId));
        }
      }}
    >
      프로젝트 삭제
    </button>
  );
}
