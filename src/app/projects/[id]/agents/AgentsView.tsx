"use client";

import { useState, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AgentsDraft } from "@/lib/agentsMd";
import type { AgentsInfo } from "@/lib/api";
import { createAgentsPull } from "../../../actions";

type Tab = "preview" | "edit" | "existing";

export function AgentsView({ projectId, repo, info, draft }: { projectId: number; repo: string; info: AgentsInfo; draft: AgentsDraft }) {
  const has = info.existing.length > 0;
  const [tab, setTab] = useState<Tab>(has ? "existing" : "preview");
  const [text, setText] = useState(draft.markdown);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<{ url?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const agentsExists = info.existing.some((f) => f.path === "AGENTS.md");

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
      <div className={`agents-status ${has ? "ok" : "missing"}`}>
        {has ? (
          <>
            <b>규칙 파일이 있어요</b>
            <span>
              {info.existing.map((f) => (
                <a key={f.path} href={f.htmlUrl} target="_blank" rel="noreferrer">
                  <code>{f.path}</code>
                </a>
              ))}
            </span>
            <span className="muted">초안과 비교해 빠진 내용(조심할 곳 · 함께 바뀌는 파일 · 테스트 규칙)을 옮겨 쓸 수 있어요.</span>
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

      <div className="agents-bar">
        <nav className="agents-tabs">
          {has && (
            <button className={tab === "existing" ? "active" : ""} onClick={() => setTab("existing")}>
              지금 있는 파일
            </button>
          )}
          <button className={tab === "preview" ? "active" : ""} onClick={() => setTab("preview")}>
            초안 미리보기
          </button>
          <button className={tab === "edit" ? "active" : ""} onClick={() => setTab("edit")}>
            초안 고치기
          </button>
        </nav>
        <div className="agents-actions">
          <button onClick={copy}>{copied ? "복사됨 ✓" : "복사"}</button>
          <button onClick={download}>다운로드</button>
          {info.openPr ? (
            <a className="button primary" href={info.openPr} target="_blank" rel="noreferrer">
              열린 PR 보기 →
            </a>
          ) : (
            <button
              className="primary"
              onClick={createPr}
              disabled={pending || !info.canCreatePr || agentsExists || !!result.url}
              title={!info.canCreatePr ? "PR Guard 봇이 이 레포에 브랜치를 만들 권한이 없어요. 복사해서 직접 올려 주세요" : agentsExists ? "이미 AGENTS.md 가 있어요" : undefined}
            >
              {pending ? "PR 만드는 중…" : "레포에 PR 로 올리기"}
            </button>
          )}
        </div>
      </div>
      {!info.canCreatePr && !info.openPr && (
        <p className="muted agents-note">PR Guard 봇이 이 레포에 쓸 권한이 없어 PR 은 만들 수 없어요. 복사 · 다운로드해서 직접 추가해 주세요.</p>
      )}
      {result.url && (
        <p className="agents-done">
          PR 을 만들었어요:{" "}
          <a href={result.url} target="_blank" rel="noreferrer">
            {result.url}
          </a>
        </p>
      )}
      {result.error && <p className="error">{result.error}</p>}

      <div className="agents-body">
        <div className="agents-doc">
          {tab === "edit" ? (
            <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
          ) : tab === "existing" ? (
            info.existing.map((f) => (
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
          <h3>초안의 근거</h3>
          <ul>
            {draft.sources.map((s) => (
              <li key={s.section}>
                <b>{s.section}</b>
                <span className="muted">{s.from}</span>
              </li>
            ))}
          </ul>
          <p className="muted">
            빌드 명령 · 구조 · 조심할 곳 · 함께 바뀌는 파일은 이 레포를 분석해 채웠고, 테스트 · PR 규칙은 AI 가 쓴 코드에서 자주 생기는 문제(테스트
            약화 · 요청하지 않은 변경 · 큰 PR)를 막는 공통 규칙이에요.
          </p>
        </aside>
      </div>
    </div>
  );
}
