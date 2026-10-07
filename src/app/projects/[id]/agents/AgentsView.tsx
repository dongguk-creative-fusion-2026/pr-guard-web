"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { withLessons, type AgentsDraft } from "@/lib/agentsMd";
import type { AgentsInfo, Lesson } from "@/lib/api";
import { fileName } from "@/lib/format";
import { createAgentsPull } from "../../../actions";

type Tab = "preview" | "edit" | "existing";

export function AgentsView({
  projectId,
  repo,
  info,
  draft,
  lessons,
}: {
  projectId: number;
  repo: string;
  info: AgentsInfo;
  draft: AgentsDraft;
  lessons: Lesson[];
}) {
  const agents = info.existing.find((f) => f.path === "AGENTS.md") ?? null;
  const others = info.existing.filter((f) => f.path !== "AGENTS.md");
  // AGENTS.md 가 있으면 그 파일에 반복 실수 규칙을 더하고, 없으면 분석 초안에서 시작한다
  const [base, setBase] = useState(agents ? agents.content : draft.markdown);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(lessons.filter((l) => l.repeated).map((l) => l.type)));
  const [tab, setTab] = useState<Tab>("preview");
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<{ url?: string; error?: string }>({});
  const [pending, start] = useTransition();

  const text = useMemo(() => withLessons(base, lessons.filter((l) => picked.has(l.type))), [base, lessons, picked]);
  const unchanged = agents !== null && agents.content.trim() === text.trim();

  const toggle = (type: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "AGENTS.md";
    a.click();
    URL.revokeObjectURL(url);
  };
  const createPr = () =>
    start(async () => {
      setResult(await createAgentsPull(projectId, text));
    });

  return (
    <div className="agents">
      <div className={`agents-status ${info.existing.length > 0 ? "ok" : "missing"}`}>
        {info.existing.length > 0 ? (
          <>
            <b>규칙 파일이 있어요</b>
            <span>
              {info.existing.map((f) => (
                <a key={f.path} href={f.htmlUrl} target="_blank" rel="noreferrer">
                  <code>{f.path}</code>
                </a>
              ))}
            </span>
            <span className="muted">
              {agents ? "AGENTS.md 에 리뷰에서 반복된 실수를 규칙으로 더할 수 있어요." : "AGENTS.md 는 없어요. 다른 규칙 파일과 비교해 초안을 쓸 수 있어요."}
            </span>
          </>
        ) : (
          <>
            <b>규칙 파일이 없어요</b>
            <span className="muted">
              {repo} 에는 AGENTS.md · CLAUDE.md · copilot-instructions.md · .cursorrules 가 모두 없습니다. AI 에이전트가 레포 규칙을 모른 채 작업하고
              있어요.
            </span>
          </>
        )}
      </div>

      <Lessons projectId={projectId} lessons={lessons} picked={picked} toggle={toggle} />

      <div className="agents-bar">
        <nav className="agents-tabs">
          <button className={tab === "preview" ? "active" : ""} onClick={() => setTab("preview")}>
            {agents ? "갱신안 미리보기" : "초안 미리보기"}
          </button>
          <button className={tab === "edit" ? "active" : ""} onClick={() => setTab("edit")}>
            고치기
          </button>
          {others.length > 0 && (
            <button className={tab === "existing" ? "active" : ""} onClick={() => setTab("existing")}>
              다른 규칙 파일
            </button>
          )}
        </nav>
        <div className="agents-actions">
          <button onClick={copy}>{copied ? "복사됨 ✓" : "복사"}</button>
          <button onClick={download}>다운로드</button>
          {info.openPr && !result.url && (
            <a className="button" href={info.openPr} target="_blank" rel="noreferrer">
              열린 PR
            </a>
          )}
          <button
            className="primary"
            onClick={createPr}
            disabled={pending || !info.canCreatePr || unchanged || !!result.url}
            title={
              !info.canCreatePr
                ? "PR Guard 봇이 이 레포에 브랜치를 만들 권한이 없어요. 복사해서 직접 올려 주세요"
                : unchanged
                  ? "레포의 AGENTS.md 와 같아요"
                  : info.openPr
                    ? "열린 PR 의 브랜치를 이 내용으로 고쳐요"
                    : undefined
            }
          >
            {pending ? "PR 만드는 중…" : info.openPr ? "열린 PR 고치기" : agents ? "AGENTS.md 갱신 PR" : "레포에 PR 로 올리기"}
          </button>
        </div>
      </div>
      {!info.canCreatePr && (
        <p className="muted agents-note">PR Guard 봇이 이 레포에 쓸 권한이 없어 PR 은 만들 수 없어요. 복사 · 다운로드해서 직접 추가해 주세요.</p>
      )}
      {result.url && (
        <p className="agents-done">
          PR 을 올렸어요:{" "}
          <a href={result.url} target="_blank" rel="noreferrer">
            {result.url}
          </a>
        </p>
      )}
      {result.error && <p className="error">{result.error}</p>}

      <div className="agents-body">
        <div className="agents-doc">
          {tab === "edit" ? (
            <textarea value={text} onChange={(e) => setBase(e.target.value)} spellCheck={false} />
          ) : tab === "existing" ? (
            others.map((f) => (
              <section key={f.path}>
                <h3>
                  <code>{f.path}</code>
                </h3>
                <div className="md">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{f.content}</ReactMarkdown>
                </div>
              </section>
            ))
          ) : (
            <div className="md">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
            </div>
          )}
        </div>
        <aside className="agents-side">
          <h3>근거</h3>
          <ul>
            {!agents &&
              draft.sources.map((s) => (
                <li key={s.section}>
                  <b>{s.section}</b>
                  <span className="muted">{s.from}</span>
                </li>
              ))}
            <li>
              <b>반복된 실수</b>
              <span className="muted">이 레포 PR 리뷰 지적 (PR 마다 최근 리뷰)</span>
            </li>
          </ul>
          <p className="muted">
            레포 분석으로 채운 부분과, AI 가 쓴 코드에서 자주 생기는 문제(테스트 약화 · 요청하지 않은 변경 · 큰 PR)를 막는 공통 규칙, 그리고 이 레포
            리뷰에서 반복된 실수를 합쳐요.
          </p>
        </aside>
      </div>
    </div>
  );
}

/** 리뷰에서 반복된 실수 → 규칙으로 넣을지 고른다 */
function Lessons({
  projectId,
  lessons,
  picked,
  toggle,
}: {
  projectId: number;
  lessons: Lesson[];
  picked: Set<string>;
  toggle: (type: string) => void;
}) {
  if (lessons.length === 0) {
    return (
      <section className="lessons">
        <h2>리뷰에서 반복된 실수</h2>
        <div className="empty">아직 끝난 리뷰 지적이 없어요. PR 리뷰가 쌓이면 반복되는 실수를 규칙으로 제안해요.</div>
      </section>
    );
  }
  const repeated = lessons.filter((l) => l.repeated).length;
  return (
    <section className="lessons">
      <h2>
        리뷰에서 반복된 실수 <span className="muted">{repeated}개 유형이 여러 PR 에서 반복됨</span>
      </h2>
      <p className="muted">
        PR Guard 리뷰 지적을 실수 유형으로 묶었어요. 고른 유형은 AGENTS.md 의 규칙이 되어, 다음부터 AI 에이전트가 같은 실수를 하지 않도록 알려 줘요.
      </p>
      <ul className="lesson-list">
        {lessons.map((l) => (
          <li key={l.type} className={`lesson ${picked.has(l.type) ? "on" : ""} ${l.repeated ? "repeated" : ""}`}>
            <label>
              <input type="checkbox" checked={picked.has(l.type)} onChange={() => toggle(l.type)} />
              <span className="lesson-head">
                <b>{l.label}</b>
                <span className={`sev ${l.worst}`}>{l.worst}</span>
                <span className="muted">
                  PR {l.prs.length}개 · 지적 {l.findings}건{l.repeated ? " · 반복" : ""}
                </span>
              </span>
            </label>
            <p className="lesson-rule">→ {l.rule}</p>
            <div className="lesson-examples">
              {l.examples.map((e) => (
                <Link key={e.prNumber} href={`/projects/${projectId}/reviews/${e.reviewId}`} title={e.title}>
                  PR #{e.prNumber} · {e.title.length > 34 ? e.title.slice(0, 34) + "…" : e.title}
                  {e.file && <span className="muted"> ({fileName(e.file)})</span>}
                </Link>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
