"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Finding, GraphData } from "@/lib/api";
import { ReviewShowScene, showImpact } from "./actors/ReviewShowScene";
import { useReviewShow } from "./actors/reviewShow";
import { ShowCaption } from "./actors/ShowCaption";
import { hiddenPartners, partnerNote } from "./actors/hiddenCoupling";
import { archNote } from "./actors/archNote";
import { buildExecMock, execCaption, execFromReview, execMarks, useExecClock } from "./actors/execDemo";
import { ParallelCity } from "./actors/ParallelCity";
import { CodeCity } from "./CodeCity";
import { computeInsights } from "./metrics";

/** 입구 도시에 표시할 PR: 그 PR 이 바꾼 파일과 판정 색 */
export type EntryMark = { number: number; title: string; color: string; files: string[] };

/** 입구에서 보여 줄 리뷰: 진행 중이면 실시간, 아니면 다시보기 */
export type EntryShow = {
  reviewId: number;
  number: number;
  title: string;
  live: boolean;
  changed: string[];
  /** 끝난 리뷰의 지적 (진행 중이면 null: 단계 기록에서 뽑는다) */
  findings: Finding[] | null;
};

/** 진행 중인 리뷰가 새로 생겼는지 이 간격으로 다시 불러온다 */
const REFRESH_MS = 15000;

/**
 * 프로젝트 입구의 바닥 층: 프로젝트 구조대로 지은 코드 시티 위에 사람이 볼 PR 이 건드린 건물을 판정 색으로 세운다.
 * 리뷰가 진행 중이면 그 리뷰를 도시 위 장면(AI 리뷰어 · 해커 홀로그램)으로 실시간 보여 주고,
 * 아니면 최근 리뷰를 다시 볼 수 있다. 표시된 건물을 누르면 그 PR, 나머지는 코드 시티에서 그 파일
 */
export function EntryCity({ data, projectId, marks, show }: { data: GraphData; projectId: number; marks: EntryMark[]; show: EntryShow | null }) {
  const router = useRouter();
  const insights = useMemo(() => computeInsights(data), [data]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [round, setRound] = useState(0);
  // 실시간으로 보기 시작한 리뷰는 끝나서 목록이 바뀌어도 닫을 때까지 붙잡아 둔다
  const [pinned, setPinned] = useState<EntryShow | null>(null);
  useEffect(() => {
    if (show?.live && pinned?.reviewId !== show.reviewId) setPinned(show);
  }, [show, pinned]);
  // 실행 검증 연출 미리보기 (예시 데이터)
  const [demo, setDemo] = useState(false);
  const [demoRound, setDemoRound] = useState(0);
  const mock = useMemo(() => buildExecMock(insights), [insights]);
  const t = useExecClock(demo, demoRound);
  const current = pinned ?? (playing ? show : null);
  const active = !!current || demo;
  const [hold, setHold] = useState(0);
  const state = useReviewShow({
    reviewId: current?.reviewId ?? null,
    prNumber: current?.number ?? 0,
    changed: current?.changed,
    findings: current?.findings,
    round,
    impactHold: hold,
  });
  const partners = useMemo(() => hiddenPartners(state.changed, insights), [state.changed, insights]);
  useEffect(() => setHold(partners.length > 0 ? 1800 : 0), [partners.length]);
  const execCity = useMemo(() => (state.exec ? execFromReview(state.exec, insights) : null), [state.exec, insights]);
  const inExec = state.phase === "exec" && !!execCity;
  const close = () => {
    setPinned(null);
    setPlaying(false);
  };

  // 진행 중인 리뷰가 생기는지 주기적으로 다시 불러온다 (장면을 보는 중에는 멈춘다)
  useEffect(() => {
    if (active) return;
    const timer = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [active, router]);

  // 파일 → 그 파일을 건드린 PR 들 (marks 는 급한 순이라 첫 PR 색을 쓴다)
  const byFile = useMemo(() => {
    const map = new Map<string, EntryMark[]>();
    for (const m of marks) for (const f of m.files) if (insights.byPath.has(f)) map.set(f, [...(map.get(f) ?? []), m]);
    return map;
  }, [marks, insights]);
  const cityMarks = useMemo(
    () => new Map([...byFile.entries()].map(([f, ms]) => [f, { color: ms[0].color, badge: ms.length }])),
    [byFile],
  );
  const hoveredPrs = hovered ? (byFile.get(hovered) ?? []) : [];

  return (
    <>
      <CodeCity
        // 장면을 볼 때는 하늘까지 보이는 카메라로 새로 짓는다
        key={demo ? "demo" : active ? "show" : "city"}
        insights={insights}
        mode="structure"
        selected={null}
        onSelect={(path) => {
          if (!path) return;
          const pr = byFile.get(path)?.[0];
          router.push(pr ? `/projects/${projectId}/prs/${pr.number}` : `/projects/${projectId}/commits?file=${encodeURIComponent(path)}`);
        }}
        marks={demo && mock ? execMarks(mock, t) : inExec && execCity ? execMarks(execCity, state.elapsed) : active ? null : cityMarks}
        impact={current && !demo && !inExec ? showImpact(state, insights.byPath, partners) : null}
        onHover={setHovered}
        shift={0.22}
        wide={active}
        scene={
          demo && mock
            ? (city) => <ParallelCity mock={mock} t={t} {...city} />
            : current
              ? (city) => <ReviewShowScene show={state} partners={partners} exec={execCity} {...city} />
              : undefined
        }
      />
      {demo && mock && (
        <div className="en-show">
          <ExecCaption caption={execCaption(mock, t)} />
          <div className="en-show-actions">
            <button onClick={() => setDemoRound((r) => r + 1)}>다시 재생</button>
            <button onClick={() => setDemo(false)}>닫기</button>
          </div>
        </div>
      )}
      {current && !demo && (
        <div className="en-show">
          <ShowCaption show={state} title={`PR #${current.number} ${current.title}`} note={state.phase === "impact" || state.phase === "threat" ? (archNote(state.arch) ?? partnerNote(partners)) : null} />
          <div className="en-show-actions">
            {!state.live && <button onClick={() => setRound((r) => r + 1)}>다시 재생</button>}
            <button onClick={() => router.push(`/projects/${projectId}/prs/${current.number}`)}>PR 판단 보기</button>
            {!state.live && <button onClick={close}>닫기</button>}
          </div>
        </div>
      )}
      {!active && (show || mock) && (
        <div className="en-plays">
          {show && (
            <button className="en-play" onClick={() => setPlaying(true)}>
              <i />
              PR #{show.number} 리뷰 다시 보기
            </button>
          )}
          {mock && (
            <button className="en-play" onClick={() => setDemo(true)}>
              <i />
              실행 검증 미리보기 <span className="en-play-tag">예시</span>
            </button>
          )}
        </div>
      )}
      {hovered && !active && (
        <div className="en-hover">
          <b className="mono">{insights.byPath.get(hovered)?.name ?? hovered}</b>
          <span>{insights.byPath.get(hovered)?.district}</span>
          {hoveredPrs.map((p) => (
            <span key={p.number} className="en-hover-pr">
              <i style={{ background: p.color }} />#{p.number} {p.title}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

const EXEC_STEPS = ["빌드", "테스트 실행", "차등 비교", "판정"];

/** 실행 검증 연출 자막: 예시 데이터임을 늘 밝힌다 */
function ExecCaption({ caption }: { caption: { line: string; tone: string; step: number } }) {
  return (
    <div className="show-cap">
      <div className="show-cap-head">
        <span className="show-mock">예시 데이터</span>
        <span className="show-title">실행 검증 · PR 전과 후의 테스트를 실제로 돌려 비교</span>
      </div>
      <p className={`show-line ${caption.tone}`}>{caption.line}</p>
      <ol className="show-steps">
        {EXEC_STEPS.map((label, i) => (
          <li key={label} className={i < caption.step ? "done" : i === caption.step ? "now" : ""}>
            {label}
          </li>
        ))}
      </ol>
    </div>
  );
}
