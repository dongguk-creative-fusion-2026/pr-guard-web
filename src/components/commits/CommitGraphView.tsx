"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CommitGraph, GitHistory } from "@/lib/api";
import { fileName, formatTime, timeAgo } from "@/lib/format";
import { layoutGraph, type GraphRow } from "@/lib/gitGraph";

const ROW = 36;
const LANE = 14;
const PAD = 14;
/** 레인 색 (기본 브랜치 줄기는 흰색 계열) */
const LANE_COLORS = ["#8fb8ff", "#8fd9a6", "#ecc76e", "#f5a3a3", "#c4a7ff", "#7dd3fc", "#f0abfc", "#fdba74"];
const MAIN_COLOR = "#ececef";

type Props = {
  graph: CommitGraph;
  history: GitHistory | null;
  projectId: number;
  repoUrl: string;
  /** 열린 PR 의 브랜치 이름 → PR 번호 */
  pulls: Record<string, number>;
};

const laneColor = (lane: number) => LANE_COLORS[lane % LANE_COLORS.length];
const x = (lane: number) => PAD + lane * LANE;
const y = (row: number) => row * ROW + ROW / 2;

/** 레인 그림: 줄마다 다음 줄로 이어지는 선(곧게 · 갈래 · 합류)과 커밋 점 */
function Lanes({ rows, width, selected }: { rows: GraphRow[]; width: number; selected: string | null }) {
  const paths: { d: string; color: string; main: boolean }[] = [];
  rows.forEach((r, i) => {
    const last = i === rows.length - 1;
    for (const s of r.segments) {
      const x1 = x(s.from);
      const y1 = y(i);
      const x2 = x(s.to);
      const y2 = last ? y(i) + ROW / 2 : y(i + 1);
      const d = x1 === x2 ? `M${x1} ${y1}V${y2}` : `M${x1} ${y1}C${x1} ${y1 + ROW * 0.6} ${x2} ${y2 - ROW * 0.6} ${x2} ${y2}`;
      const onMain = r.main && s.from === r.lane && s.to === (rows[i + 1]?.lane ?? s.to) && !!rows[i + 1]?.main;
      paths.push({ d, color: onMain ? MAIN_COLOR : laneColor(s.lane), main: onMain });
    }
  });
  return (
    <svg className="cg-lanes" width={width} height={rows.length * ROW} aria-hidden="true">
      {paths
        .sort((a, b) => Number(a.main) - Number(b.main))
        .map((p, k) => (
          <path key={k} d={p.d} stroke={p.color} strokeWidth={p.main ? 2.2 : 1.6} fill="none" strokeOpacity={p.main ? 0.9 : 0.75} />
        ))}
      {rows.map((r, i) => {
        const color = r.main ? MAIN_COLOR : laneColor(r.lane);
        const on = selected === r.commit.h;
        return (
          <g key={r.commit.h}>
            {on && <circle cx={x(r.lane)} cy={y(i)} r={8} fill={color} opacity={0.2} />}
            <circle
              cx={x(r.lane)}
              cy={y(i)}
              r={r.merge ? 4.5 : 4}
              fill={r.merge ? "#0e0e11" : color}
              stroke={color}
              strokeWidth={r.merge ? 2 : 0}
            />
          </g>
        );
      })}
    </svg>
  );
}

/**
 * 커밋 그래프: 모든 브랜치의 최근 커밋을 git log --graph 처럼 레인으로 그린다.
 * 브랜치 이름이 열린 PR 의 브랜치면 그 PR 판단 화면으로, 기본 브랜치 커밋은 바뀐 파일과 그 시점의 코드 시티로 이어진다.
 */
export function CommitGraphView({ graph, history, projectId, repoUrl, pulls }: Props) {
  const { rows, lanes } = useMemo(() => layoutGraph(graph), [graph]);
  const [selected, setSelected] = useState<string | null>(rows[0]?.commit.h ?? null);
  const width = PAD * 2 + (lanes - 1) * LANE;

  // 시간 여행 이력(기본 브랜치, 오래된 순)에서 이 커밋의 자리와 바뀐 파일
  const timelineIndex = useMemo(() => {
    const map = new Map<string, number>();
    (history?.timeline ?? []).forEach((e, i) => {
      if (e.h) map.set(e.h, i);
    });
    return map;
  }, [history]);

  const row = rows.find((r) => r.commit.h === selected) ?? null;
  const c = row?.commit;
  const t = c ? timelineIndex.get(c.h) : undefined;
  const changes = t !== undefined ? (history?.timeline?.[t]?.c ?? []) : [];
  const files = history?.timelineFiles ?? [];
  const branchCount = new Set(rows.flatMap((r) => r.commit.refs ?? [])).size;

  return (
    <main className="wide cg">
      <div className="cg-head">
        <h1>커밋 그래프</h1>
        <span className="muted">
          최근 커밋 {rows.length} · 브랜치 {branchCount} · 기본 브랜치 <code>{graph.head}</code>
        </span>
      </div>
      <div className="cg-grid">
        <div className="cg-list">
          <Lanes rows={rows} width={width} selected={selected} />
          <ol style={{ paddingLeft: width }}>
            {rows.map((r) => {
              const on = selected === r.commit.h;
              return (
                <li key={r.commit.h} className={`${on ? "on" : ""}${r.main ? "" : " side"}`}>
                  <button onClick={() => setSelected(r.commit.h)}>
                    <span className="cg-msg">
                      {(r.commit.refs ?? []).map((ref) => (
                        <span key={ref} className={`cg-ref${ref === graph.head ? " head" : ""}${pulls[ref] ? " pr" : ""}`}>
                          {pulls[ref] ? `#${pulls[ref]} ` : ""}
                          {ref}
                        </span>
                      ))}
                      {r.commit.m}
                    </span>
                    <span className="cg-author">{graph.authors[r.commit.a]}</span>
                    <span className="cg-date" title={formatTime(new Date(r.commit.at * 1000).toISOString())}>
                      {timeAgo(new Date(r.commit.at * 1000).toISOString())}
                    </span>
                    <span className="cg-hash mono">{r.commit.h.slice(0, 7)}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        <aside className="cg-detail">
          {c && row ? (
            <div className="dv-card">
              <p className="cg-detail-msg">{c.m}</p>
              <dl className="cg-meta">
                <div>
                  <dt>커밋</dt>
                  <dd>
                    <a href={`${repoUrl}/commit/${c.h}`} target="_blank" rel="noreferrer" className="mono">
                      {c.h.slice(0, 10)}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>작성</dt>
                  <dd>
                    {graph.authors[c.a]} · {formatTime(new Date(c.at * 1000).toISOString())}
                  </dd>
                </div>
                <div>
                  <dt>부모</dt>
                  <dd>
                    {c.p.length === 0
                      ? "-"
                      : c.p.map((p) => (
                          <button key={p} className="cg-link mono" onClick={() => setSelected(p)}>
                            {p.slice(0, 7)}
                          </button>
                        ))}
                    {row.merge && <span className="tag">병합</span>}
                  </dd>
                </div>
                {(c.refs ?? []).length > 0 && (
                  <div>
                    <dt>브랜치</dt>
                    <dd className="cg-refs">
                      {(c.refs ?? []).map((ref) =>
                        pulls[ref] ? (
                          <Link key={ref} href={`/projects/${projectId}/prs/${pulls[ref]}`} className="cg-ref pr">
                            PR #{pulls[ref]} · {ref}
                          </Link>
                        ) : (
                          <span key={ref} className={`cg-ref${ref === graph.head ? " head" : ""}`}>
                            {ref}
                          </span>
                        ),
                      )}
                    </dd>
                  </div>
                )}
              </dl>
              {t !== undefined ? (
                <>
                  <h3 className="cg-sub">
                    바뀐 파일 <span className="dv-n">{changes.length}</span>
                  </h3>
                  <ul className="cg-files">
                    {changes.map(([f, add, del]) => (
                      <li key={f}>
                        <span className="mono" title={files[f]}>
                          {fileName(files[f] ?? "")}
                        </span>
                        <span>
                          <span className="commit-add">+{add}</span> <span className="commit-del">−{del}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Link href={`/projects/${projectId}/commits?tab=city&t=${t}`} className="dv-btn">
                    이 시점의 코드 시티
                  </Link>
                </>
              ) : (
                <p className="dv-note">{row.main ? "분석 범위 밖 커밋" : "기본 브랜치 밖 커밋"}</p>
              )}
            </div>
          ) : (
            <p className="dv-note">커밋을 고르세요</p>
          )}
        </aside>
      </div>
    </main>
  );
}
