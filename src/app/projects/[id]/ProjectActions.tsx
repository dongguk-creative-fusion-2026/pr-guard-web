"use client";

import { useState, useTransition } from "react";
import { deleteProject, pollNow, type FormState } from "../../actions";

export function ProjectActions({ projectId }: { projectId: number }) {
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();

  return (
    <div>
      <div className="row">
        <button className="primary" disabled={pending} onClick={() => start(async () => setState(await pollNow(projectId)))}>
          {pending ? "확인 중…" : "지금 확인"}
        </button>
        <button
          className="danger"
          disabled={pending}
          onClick={() => {
            if (confirm("프로젝트를 삭제할까요? PR·리뷰 기록도 함께 삭제됩니다.")) {
              start(() => deleteProject(projectId));
            }
          }}
        >
          삭제
        </button>
        {state.message && <span className="notice">{state.message}</span>}
      </div>
      {state.error && <p className="error">{state.error}</p>}
    </div>
  );
}
