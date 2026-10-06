"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { computeBriefing } from "@/components/graph/briefing";
import type { GraphProgress, Project, PullRequest, RepoGraph, RepoInfo, Review } from "@/lib/api";
import { fileName, formatTime, shortSha, VERDICT_LABEL } from "@/lib/format";
import { finishOnboarding, pollNow, rebuildGraph, saveSettings, type FormState } from "../../../actions";

const STEPS = ["레포 확인", "코드 분석", "레포 브리핑", "리뷰 설정", "첫 리뷰"] as const;
const REFRESH_MS = 2000;

const LANGUAGE_COLORS: Record<string, string> = {
  Java: "#b07219",
  Kotlin: "#a97bff",
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572a5",
  Go: "#00add8",
  Rust: "#dea584",
  "C#": "#178600",
  "C++": "#f34b7d",
  C: "#555555",
  Ruby: "#701516",
  PHP: "#4f5d95",
  Swift: "#f05138",
  HTML: "#e34c26",
  CSS: "#663399",
  SCSS: "#c6538c",
  Shell: "#89e051",
  Dockerfile: "#384d54",
};

/** 분석 진행 단계. 워크플로가 보내는 stage 와 맞춘다 (뒤 단계가 오면 앞 단계는 끝난 것으로 본다) */
const ANALYSIS_STAGES = [
  { key: "dispatched", label: "분석 요청", detail: "GitHub Actions 에 그래프 만들기를 요청" },
  { key: "started", label: "분석 서버 준비", detail: "Actions 러너에서 GitNexus 준비" },
  { key: "cloned", label: "레포 받기", detail: "기본 브랜치 최신 커밋" },
  { key: "indexed", label: "코드 인덱싱", detail: "GitNexus 가 파일 · 함수 · 호출 관계를 읽는 중" },
  { key: "saved", label: "그래프 저장", detail: "파일 · 함수 그래프를 저장" },
] as const;

const THRESHOLDS = [
  { value: 1, label: "엄격", detail: "MAJOR 1건부터 수정 후 머지 (기본)" },
  { value: 2, label: "보통", detail: "MAJOR 2건부터 수정 후 머지" },
  { value: 3, label: "느슨", detail: "MAJOR 3건부터 수정 후 머지" },
];

type Props = {
  project: Project;
  graph: RepoGraph | null;
  repo: RepoInfo | null;
  pulls: PullRequest[];
  reviews: Review[];
  initialStep?: number;
};

/** 등록 직후 온보딩. 어느 단계에서든 건너뛸 수 있고, 분석은 뒤에서 계속 돈다 */
export function Onboarding({ project, graph, repo, pulls, reviews, initialStep = 0 }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const [polled, setPolled] = useState<FormState | null>(null);
  const building = graph?.status === "PENDING" || graph?.status === "RUNNING";
  const reviewing = reviews.some((r) => r.status === "PENDING" || r.status === "RUNNING");

  // 분석 중이거나 첫 리뷰가 도는 중이면 계속 새로고침
  useEffect(() => {
    if (!building && !(polled && reviewing)) return;
    const timer = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [building, polled, reviewing, router]);

  // 분석 단계를 보고 있다가 끝나면 브리핑으로 넘어간다
  const wasBuilding = useRef(building);
  useEffect(() => {
    if (wasBuilding.current && graph?.status === "DONE" && step === 1) setStep(2);
    wasBuilding.current = building;
  }, [building, graph?.status, step]);

  const title = `${project.owner}/${project.name}`;

  return (
    <div className="ob">
      <div className="ob-head">
        <div>
          <div className="ob-eyebrow">새 프로젝트</div>
          <h1 className="ob-title">{title}</h1>
        </div>
        <form action={() => finishOnboarding(project.id)}>
          <button className="ob-skip" type="submit">
            건너뛰기 →
          </button>
        </form>
      </div>

      <ol className="ob-steps">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? "active" : i < step ? "done" : ""}>
            <button onClick={() => setStep(i)}>
              <span className="ob-step-num">{i < step ? "✓" : i + 1}</span>
              <span>{s}</span>
              {i === 1 && building && <span className="spinner" />}
            </button>
          </li>
        ))}
      </ol>

      <div className="ob-body" key={step}>
        {step === 0 && <RepoStep project={project} repo={repo} />}
        {step === 1 && <AnalysisStep project={project} graph={graph} />}
        {step === 2 && <BriefingStep project={project} graph={graph} onWait={() => setStep(1)} />}
        {step === 3 && <SettingsStep project={project} />}
        {step === 4 && <FirstReviewStep project={project} pulls={pulls} reviews={reviews} polled={polled} setPolled={setPolled} />}
      </div>

      <div className="ob-foot">
        <button className="ob-ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>
          ← 이전
        </button>
        {step < STEPS.length - 1 ? (
          <button className="ob-primary" onClick={() => setStep(step + 1)}>
            {step === 1 && building ? "분석은 계속 돌아요 · 다음" : "다음"} →
          </button>
        ) : (
          <form action={() => finishOnboarding(project.id)}>
            <button className="ob-primary" type="submit">
              완료하고 프로젝트로 →
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function RepoStep({ project, repo }: { project: Project; repo: RepoInfo | null }) {
  const languages = repo ? Object.entries(repo.languages).sort((a, b) => b[1] - a[1]) : [];
  const total = languages.reduce((sum, [, bytes]) => sum + bytes, 0);
  return (
    <section>
      <h2 className="ob-h">레포를 확인했어요</h2>
      <p className="ob-lead">public 레포라서 GitHub 에서 바로 읽을 수 있어요. 열린 PR 을 5분마다 확인해서 새 커밋이 올라오면 리뷰해요.</p>
      <div className="ob-repo">
        <a href={project.htmlUrl} target="_blank" rel="noreferrer" className="ob-repo-name">
          {project.owner}/<b>{project.name}</b>
        </a>
        {repo?.description && <p className="ob-repo-desc">{repo.description}</p>}
        <div className="ob-facts">
          <div>
            <span>기본 브랜치</span>
            <b>{project.defaultBranch}</b>
          </div>
          <div>
            <span>주 언어</span>
            <b>{repo?.language ?? "-"}</b>
          </div>
          <div>
            <span>크기</span>
            <b>{repo ? (repo.sizeKb >= 1024 ? `${(repo.sizeKb / 1024).toFixed(1)}MB` : `${repo.sizeKb}KB`) : "-"}</b>
          </div>
          <div>
            <span>★</span>
            <b>{repo?.stars ?? "-"}</b>
          </div>
          <div>
            <span>마지막 push</span>
            <b>{repo?.pushedAt ? formatTime(repo.pushedAt) : "-"}</b>
          </div>
        </div>
        {total > 0 && (
          <>
            <div className="ob-langbar">
              {languages.map(([name, bytes]) => (
                <i key={name} style={{ width: `${(bytes / total) * 100}%`, background: LANGUAGE_COLORS[name] ?? "#6b7280" }} title={name} />
              ))}
            </div>
            <div className="ob-langs">
              {languages.slice(0, 6).map(([name, bytes]) => (
                <span key={name}>
                  <i style={{ background: LANGUAGE_COLORS[name] ?? "#6b7280" }} />
                  {name} <em>{((bytes / total) * 100).toFixed(1)}%</em>
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function stageDone(progress: GraphProgress[], status: RepoGraph["status"] | undefined, index: number): boolean {
  if (status === "DONE") return true;
  const reached = Math.max(-1, ...progress.map((p) => ANALYSIS_STAGES.findIndex((s) => s.key === p.stage)));
  return index <= reached;
}

function AnalysisStep({ project, graph }: { project: Project; graph: RepoGraph | null }) {
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();
  const progress = graph?.progress ?? [];
  const status = graph?.status;
  const firstAt = progress[0] ? new Date(progress[0].at).getTime() : null;
  const activeIndex = ANALYSIS_STAGES.findIndex((_, i) => !stageDone(progress, status, i));
  const at = (key: string) => progress.find((p) => p.stage === key);
  const cloned = at("cloned")?.data as { files?: number } | undefined;
  const indexed = at("indexed")?.data as { files?: number; functions?: number; calls?: number; communities?: number } | undefined;

  return (
    <section>
      <h2 className="ob-h">코드를 분석하고 있어요</h2>
      <p className="ob-lead">
        GitNexus 가 레포 전체를 읽어서 파일 · 함수 · 호출 관계 그래프를 만들어요. 이 그래프로 PR 이 어디까지 영향을 주는지 계산해요.
        보통 30초~몇 분 걸리고, 이 화면을 닫아도 분석은 계속돼요.
      </p>
      <ol className="ob-timeline">
        {ANALYSIS_STAGES.map((s, i) => {
          const done = stageDone(progress, status, i);
          const active = i === activeIndex && status !== "FAILED";
          const failed = i === activeIndex && status === "FAILED";
          const event = s.key === "indexed" ? at("indexed") ?? at("indexing") : at(s.key);
          const elapsed = event && firstAt ? Math.round((new Date(event.at).getTime() - firstAt) / 1000) : null;
          return (
            <li key={s.key} className={done ? "done" : active ? "active" : failed ? "failed" : ""}>
              <span className="ob-dot">{done ? "✓" : failed ? "✕" : active ? <span className="spinner" /> : ""}</span>
              <div>
                <div className="ob-tl-title">
                  {s.label}
                  {elapsed !== null && done && <em>+{elapsed}s</em>}
                </div>
                <div className="ob-tl-detail">
                  {s.key === "cloned" && cloned?.files ? `파일 ${cloned.files}개` : s.key === "indexed" && indexed ? `파일 ${indexed.files} · 함수 ${indexed.functions} · 호출 ${indexed.calls} · 기능 묶음 ${indexed.communities}` : s.detail}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {status === "DONE" && graph?.commitSha && (
        <p className="ob-ok">
          완료 · <code>{shortSha(graph.commitSha)}</code> 기준 · {formatTime(graph.finishedAt)}
        </p>
      )}
      {status === "FAILED" && (
        <div className="ob-fail">
          <pre>{graph?.error}</pre>
          <button disabled={pending} onClick={() => start(async () => setState(await rebuildGraph(project.id)))}>
            다시 시도
          </button>
          {state.error && <span className="error">{state.error}</span>}
        </div>
      )}
      {graph?.runUrl && (
        <a className="ob-link" href={graph.runUrl} target="_blank" rel="noreferrer">
          GitHub Actions 실행 로그 보기 ↗
        </a>
      )}
    </section>
  );
}

function BriefingStep({ project, graph, onWait }: { project: Project; graph: RepoGraph | null; onWait: () => void }) {
  const briefing = useMemo(() => (graph?.graph ? computeBriefing(graph.graph) : null), [graph?.graph]);
  if (!briefing) {
    return (
      <section>
        <h2 className="ob-h">레포 브리핑</h2>
        <p className="ob-lead">분석이 끝나면 이 레포가 어떻게 생겼는지 보여 드려요.</p>
        <button className="ob-ghost" onClick={onWait}>
          분석 진행 보기
        </button>
      </section>
    );
  }
  const { tests } = briefing;
  const coverage = tests.sourceFiles > 0 ? Math.round((tests.covered / tests.sourceFiles) * 100) : 0;
  const graphHref = (q: string) => `/projects/${project.id}/graph${q}`;
  return (
    <section>
      <h2 className="ob-h">이 레포는 이렇게 생겼어요</h2>
      <p className="ob-lead">GitNexus 그래프에서 뽑은 요약이에요. 새로 합류한 사람이 처음 볼 곳을 짚어 줘요.</p>

      <div className="ob-tiles">
        <div>
          <b>{briefing.files}</b>
          <span>파일</span>
        </div>
        <div>
          <b>{briefing.functions}</b>
          <span>함수</span>
        </div>
        <div>
          <b>{briefing.calls}</b>
          <span>호출</span>
        </div>
        <div>
          <b>{briefing.groups.length}</b>
          <span>기능 묶음</span>
        </div>
      </div>

      <div className="ob-grid">
        <div className="ob-card">
          <h3>기능 묶음</h3>
          <ul className="ob-groups">
            {briefing.groups.slice(0, 8).map((g) => (
              <li key={g.label}>
                <i style={{ background: g.color, boxShadow: `0 0 8px ${g.color}` }} />
                <b>{g.label}</b>
                <span>파일 {g.files}</span>
                {g.topFile && (
                  <Link href={graphHref(`?file=${encodeURIComponent(g.topFile)}`)} className="ob-file">
                    {fileName(g.topFile)}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="ob-card">
          <h3>핵심 파일 <small>다른 파일이 가장 많이 쓰는 파일</small></h3>
          <ol className="ob-rank">
            {briefing.hubFiles.map((f) => (
              <li key={f.path}>
                <Link href={graphHref(`?file=${encodeURIComponent(f.path)}`)}>{fileName(f.path)}</Link>
                <span>{f.usedBy}개 파일이 사용</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="ob-card">
          <h3>많이 호출되는 함수 <small>바꾸면 영향이 큰 곳</small></h3>
          <ol className="ob-rank">
            {briefing.hotFunctions.map((f) => (
              <li key={f.id}>
                <Link href={graphHref(`?fn=${encodeURIComponent(f.id)}`)}>{f.name}</Link>
                <span>
                  {fileName(f.file)} · {f.callers}곳에서 호출
                </span>
              </li>
            ))}
            {briefing.hotFunctions.length === 0 && <li className="ob-muted">함수 정보 없음</li>}
          </ol>
        </div>

        <div className="ob-card">
          <h3>시작점 <small>아무도 부르지 않지만 다른 함수를 부르는 곳</small></h3>
          <ol className="ob-rank">
            {briefing.entryPoints.map((f) => (
              <li key={f.id}>
                <Link href={graphHref(`?fn=${encodeURIComponent(f.id)}`)}>{f.name}</Link>
                <span>{fileName(f.file)}</span>
              </li>
            ))}
            {briefing.entryPoints.length === 0 && <li className="ob-muted">함수 정보 없음</li>}
          </ol>
        </div>

        {briefing.layers.length > 0 && (
          <div className="ob-card">
            <h3>레이어 <small>폴더 이름 기준</small></h3>
            <div className="ob-layers">
              {briefing.layers.map((l, i) => (
                <div key={l.name}>
                  {i > 0 && <span className="ob-arrow">↓</span>}
                  <span className="ob-layer">
                    {l.name} <em>{l.files}</em>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="ob-card">
          <h3>테스트 <small>테스트 파일이 쓰는 코드 파일</small></h3>
          <div className="ob-meter">
            <i style={{ width: `${coverage}%` }} />
          </div>
          <p className="ob-meter-text">
            코드 파일 {tests.sourceFiles}개 중 <b>{tests.covered}개</b>({coverage}%)를 테스트가 사용 · 테스트 파일 {tests.testFiles}개
          </p>
        </div>
      </div>

      <Link href={graphHref("")} className="ob-graph-link">
        코드 그래프 전체 보기 →
      </Link>
    </section>
  );
}

function SettingsStep({ project }: { project: Project }) {
  const [comment, setComment] = useState(project.commentEnabled);
  const [threshold, setThreshold] = useState(project.majorThreshold ?? 1);
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();
  const changed = comment !== project.commentEnabled || threshold !== (project.majorThreshold ?? 1);
  return (
    <section>
      <h2 className="ob-h">리뷰 설정</h2>
      <p className="ob-lead">나중에 바꿀 수 있어요. BLOCKER 가 하나라도 있으면 기준과 상관없이 &quot;머지 비권장&quot;이에요.</p>

      <div className="ob-setting">
        <label className="ob-switch">
          <input type="checkbox" checked={comment} onChange={(e) => setComment(e.target.checked)} />
          <span />
        </label>
        <div>
          <b>PR 에 코멘트 남기기</b>
          <p>요약 코멘트 1개와 지적한 줄에 라인 코멘트를 남겨요. 끄면 PR Guard 화면에서만 결과를 볼 수 있어요.</p>
        </div>
      </div>

      <div className="ob-setting column">
        <b>판정 기준</b>
        <div className="ob-options">
          {THRESHOLDS.map((t) => (
            <button key={t.value} className={threshold === t.value ? "selected" : ""} onClick={() => setThreshold(t.value)}>
              <b>{t.label}</b>
              <span>{t.detail}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="ob-save">
        <button
          className="ob-primary"
          disabled={pending || !changed}
          onClick={() => start(async () => setState(await saveSettings(project.id, comment, threshold === 1 ? null : threshold)))}
        >
          {pending ? "저장 중…" : "설정 저장"}
        </button>
        {state.message && <span className="ob-ok">{state.message}</span>}
        {state.error && <span className="error">{state.error}</span>}
      </div>
    </section>
  );
}

function FirstReviewStep({
  project,
  pulls,
  reviews,
  polled,
  setPolled,
}: {
  project: Project;
  pulls: PullRequest[];
  reviews: Review[];
  polled: FormState | null;
  setPolled: (s: FormState) => void;
}) {
  const [pending, start] = useTransition();
  const open = pulls.filter((p) => p.state === "open");
  const latest = new Map<number, Review>();
  for (const r of reviews) if (!latest.has(r.prNumber)) latest.set(r.prNumber, r);
  return (
    <section>
      <h2 className="ob-h">첫 리뷰</h2>
      <p className="ob-lead">지금 열린 PR 을 확인해서 바로 리뷰를 시작해요. 이후에는 5분마다 새 커밋을 확인해요.</p>
      <button className="ob-primary big" disabled={pending} onClick={() => start(async () => setPolled(await pollNow(project.id)))}>
        {pending ? "확인 중…" : polled ? "다시 확인" : "열린 PR 확인하고 리뷰 시작"}
      </button>
      {polled?.message && <p className="ob-ok">{polled.message}</p>}
      {polled?.error && <p className="error">{polled.error}</p>}

      {polled && open.length === 0 && !polled.error && (
        <div className="ob-empty">
          열린 PR 이 없어요. 이 레포에 PR 을 열면 5분 안에 자동으로 리뷰해요.
        </div>
      )}
      {open.length > 0 && (
        <ul className="ob-prs">
          {open.map((p) => {
            const r = latest.get(p.number);
            return (
              <li key={p.id}>
                <a href={p.htmlUrl} target="_blank" rel="noreferrer" className="ob-pr-num">
                  #{p.number}
                </a>
                <span className="ob-pr-title">{p.title}</span>
                {r ? (
                  r.status === "DONE" && r.verdict ? (
                    <Link href={`/projects/${project.id}/reviews/${r.id}`} className={`ob-verdict ${r.verdict}`}>
                      {VERDICT_LABEL[r.verdict]} →
                    </Link>
                  ) : (
                    <Link href={`/projects/${project.id}/reviews/${r.id}`} className="ob-reviewing">
                      {r.status === "FAILED" ? "실패" : (
                        <>
                          <span className="spinner" /> 리뷰 중 · 과정 보기 →
                        </>
                      )}
                    </Link>
                  )
                ) : (
                  <span className="ob-muted">대기</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
