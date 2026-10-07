"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { GraphData, InfraMap, ProjectRuntime } from "@/lib/api";
import { fileName, formatTime, shortSha } from "@/lib/format";
import { computeDelegation, ZONE_META, type Delegation, type FileZone, type Zone } from "@/lib/delegation";
import { buildRuntime, fileRuntime, runtimeColor, type FileRuntime } from "../graph/runtime";
import { cityLegend, CodeCity, type CityColorMode } from "./CodeCity";
import { INFRA_STYLE } from "./InfraLayer";
import { CouplingWheel } from "./CouplingWheel";
import { HotspotMap } from "./HotspotMap";
import {
  buildTimeline,
  computeInsights,
  heatColor,
  relativeDays,
  visibleCouplings,
  type Coupling,
  type FileMetric,
  type Insights,
  type Timeline,
} from "./metrics";

export type InsightTab = "city" | "hotspots" | "coupling";

const TABS: { key: InsightTab; label: string; hint: string }[] = [
  { key: "city", label: "코드 시티", hint: "파일 = 건물 · 높이 = 줄 수 · 구역 = 기능 묶음" },
  { key: "hotspots", label: "핫스팟", hint: "자주 바뀌고 큰 파일 = 버그가 날 확률이 높은 곳" },
  { key: "coupling", label: "숨은 결합", hint: "코드 의존은 없는데 항상 같이 바뀌는 파일" },
];

const MODES: { key: CityColorMode; label: string }[] = [
  { key: "hotspot", label: "핫스팟" },
  { key: "group", label: "기능 묶음" },
  { key: "recent", label: "최근 변경" },
  { key: "test", label: "테스트" },
  { key: "runtime", label: "⚡ 런타임" },
  { key: "delegation", label: "🤖 AI 위임" },
];

const TOP = 10;

type Props = {
  data: GraphData;
  title: string;
  subtitle: string;
  backHref: string;
  graphHref: string;
  fontFamily: string;
  initialTab: InsightTab;
  /** 처음부터 고를 파일 (?file=) */
  initialFile?: string;
  /** 처음부터 볼 커밋 시점 (?t=, 0 부터) */
  initialTime?: number;
  /** 근거 파일을 GitHub 에서 열 때 쓰는 주소 (https://github.com/o/r/blob/커밋) */
  sourceBase?: string | null;
  /** 가장 최근 실행 검증의 런타임 기록. 있으면 "런타임" 색 기준이 생긴다 */
  runtime?: ProjectRuntime | null;
  /** 처음 색 기준 (?mode=) */
  initialMode?: CityColorMode;
};

/** 코드 인사이트: 코드 시티 · 핫스팟 · 숨은 결합 */
export function InsightsView({
  data,
  title,
  subtitle,
  backHref,
  graphHref,
  fontFamily,
  initialTab,
  initialFile,
  initialTime,
  sourceBase,
  runtime,
  initialMode,
}: Props) {
  const insights = useMemo(() => computeInsights(data), [data]);
  const live = useMemo(() => (runtime ? fileRuntime(buildRuntime(runtime, data), data) : null), [runtime, data]);
  const delegation = useMemo(() => computeDelegation(data, live, insights), [data, live, insights]);
  const [tab, setTab] = useState<InsightTab>(initialTab);
  const [mode, setMode] = useState<CityColorMode>(
    initialMode && (initialMode !== "runtime" || live) ? initialMode : insights.hasHistory ? "hotspot" : "group",
  );
  const [selected, setSelected] = useState<string | null>(initialFile && insights.byPath.has(initialFile) ? initialFile : null);
  const [hiddenOnly, setHiddenOnly] = useState(false);
  const [allCouplings, setAllCouplings] = useState(false);
  const couplings = useMemo(() => visibleCouplings(insights, allCouplings), [insights, allCouplings]);
  const timeline = useMemo(() => buildTimeline(data), [data]);
  // 시간 여행: null 이면 지금 도시
  const [timeIndex, setTimeIndex] = useState<number | null>(initialTime ?? null);
  const time = useMemo(() => (timeline && timeIndex !== null ? timeline.stateAt(timeIndex) : null), [timeline, timeIndex]);
  // 인프라 층: 사용자 말고도 노드가 있을 때만 의미가 있다
  const infra = data.infra && data.infra.nodes.length > 1 ? data.infra : null;
  const [showInfra, setShowInfra] = useState(infra !== null);
  const [selectedInfra, setSelectedInfra] = useState<string | null>(null);
  const pickFile = (path: string | null) => {
    setSelected(path);
    if (path) setSelectedInfra(null);
  };

  // 탭 · 색 기준을 주소에 남긴다 (새로고침 · 공유)
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    url.searchParams.set("mode", mode);
    window.history.replaceState(null, "", url);
  }, [tab, mode]);

  const current = selected ? insights.byPath.get(selected) ?? null : null;

  return (
    <div className="gx ins" style={{ background: "#07070d", fontFamily }}>
      <header className="gx-top">
        <Link href={backHref} className="gx-back">
          ← {title}
        </Link>
        <span className="gx-sub">{subtitle}</span>
        <nav className="ins-tabs">
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="gx-body">
        <div className="ins-stage">
          <div className="ins-hint">{TABS.find((t) => t.key === tab)!.hint}</div>
          {tab === "city" && (
            <CodeCity
              insights={insights}
              mode={mode}
              selected={selected}
              onSelect={pickFile}
              time={time}
              infra={showInfra ? infra : null}
              selectedInfra={selectedInfra}
              onSelectInfra={setSelectedInfra}
              runtime={live}
              delegation={delegation}
            />
          )}
          {tab === "city" && timeline && <TimeTravel timeline={timeline} index={timeIndex} setIndex={setTimeIndex} insights={insights} />}
          {tab === "hotspots" && <HotspotMap insights={insights} selected={selected} onSelect={setSelected} />}
          {tab === "coupling" && (
            <CouplingWheel insights={insights} selected={selected} onSelect={setSelected} hiddenOnly={hiddenOnly} couplings={couplings} />
          )}
        </div>

        <aside className="gx-panel">
          {!insights.hasHistory && (
            <section>
              <p className="gx-warn">git 이력이 없는 예전 그래프예요. 프로젝트 화면에서 &quot;다시 만들기&quot;를 누르면 핫스팟과 숨은 결합이 채워져요.</p>
            </section>
          )}
          {insights.hasHistory && (
            <section className="ins-meta">
              최근 커밋 <b>{insights.commits}</b>개 · {formatTime(insights.since)} ~ {formatTime(insights.until)}
            </section>
          )}

          {tab === "city" && (
            <section>
              <h3 className="gx-h">색 기준</h3>
              <div className="ins-modes">
                {MODES.map((m) => (
                  <button
                    key={m.key}
                    className={mode === m.key ? "active" : ""}
                    disabled={(!insights.hasHistory && (m.key === "hotspot" || m.key === "recent")) || (m.key === "runtime" && !live)}
                    title={m.key === "runtime" && !live ? "실행 검증이 돈 PR 이 아직 없어요" : undefined}
                    onClick={() => setMode(m.key)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <Legend mode={mode} insights={insights} />
              <p className="gx-hint">드래그로 돌리고 휠로 확대. 건물을 누르면 그 파일과 같이 바뀌는 파일만 남아요.</p>
            </section>
          )}

          {tab === "city" && infra && (
            <section>
              <label className="gx-toggle infra-toggle">
                <input type="checkbox" checked={showInfra} onChange={(e) => setShowInfra(e.target.checked)} />
                인프라 보기 <span className="gx-dim">요청 경로 · 저장소 · 외부 API</span>
              </label>
              {showInfra && <InfraLegend infra={infra} />}
            </section>
          )}
          {tab === "city" && showInfra && infra && selectedInfra ? (
            <InfraCard
              infra={infra}
              id={selectedInfra}
              insights={insights}
              sourceBase={sourceBase ?? null}
              onPickFile={pickFile}
              onPickNode={setSelectedInfra}
              onClose={() => setSelectedInfra(null)}
            />
          ) : current ? (
            <>
              {tab === "city" && mode === "delegation" && <ZoneBox zone={delegation.files.get(current.path)} />}
            <FileCard
              file={current}
              insights={insights}
              graphHref={graphHref}
              onPick={pickFile}
              onClose={() => setSelected(null)}
              infra={showInfra ? infra : null}
              onPickInfra={setSelectedInfra}
            />
            </>
          ) : tab === "city" && mode === "delegation" ? (
            <DelegationPanel delegation={delegation} onPick={pickFile} hasRuntime={live !== null} />
          ) : tab === "city" && mode === "runtime" && live ? (
            <RuntimeList runtime={live} insights={insights} onPick={pickFile} />
          ) : tab === "coupling" ? (
            <CouplingList
              insights={insights}
              couplings={couplings}
              hiddenOnly={hiddenOnly}
              setHiddenOnly={setHiddenOnly}
              all={allCouplings}
              setAll={setAllCouplings}
              onPick={setSelected}
            />
          ) : (
            <HotspotList insights={insights} onPick={setSelected} />
          )}
        </aside>
      </div>
    </div>
  );
}

function Legend({ mode, insights }: { mode: CityColorMode; insights: Insights }) {
  const legend = cityLegend(mode);
  if (mode === "group") {
    return (
      <ul className="gx-legend">
        {insights.groups.map((g) => (
          <li key={g.label}>
            <span className="ins-row">
              <span className="gx-dot" style={{ background: g.color, boxShadow: `0 0 8px ${g.color}` }} />
              {g.label} <span className="gx-dim">{g.files.length}</span>
            </span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="ins-scale">
      <div className="ins-bar" style={{ background: `linear-gradient(90deg, ${legend.stops.join(", ")})` }} />
      <div className="ins-scale-labels">
        <span>{legend.left}</span>
        <span>{legend.label}</span>
        <span>{legend.right}</span>
      </div>
    </div>
  );
}

function HotspotList({ insights, onPick }: { insights: Insights; onPick: (path: string) => void }) {
  const top = [...insights.files]
    .filter((f) => (f.hotspot ?? 0) > 0)
    .sort((a, b) => (b.hotspot ?? 0) - (a.hotspot ?? 0))
    .slice(0, TOP);
  return (
    <section className="gx-impact-list">
      <h4 style={{ color: "#f87171" }}>
        위험한 파일 <span className="gx-dim">자주 바뀌고 큰 순서</span>
      </h4>
      {top.length === 0 ? (
        <p className="gx-dim">변경 기록이 없어요</p>
      ) : (
        <ol className="ins-rank">
          {top.map((f) => (
            <li key={f.path}>
              <button onClick={() => onPick(f.path)} title={f.path}>
                <i style={{ background: heatColor(f.hotspot) }} />
                {f.name}
              </button>
              <span className="gx-dim">
                {f.history?.commits}번 변경 · {f.lines}줄 · 작성자 {f.history?.authors}명
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function CouplingList({
  insights,
  couplings,
  hiddenOnly,
  setHiddenOnly,
  all,
  setAll,
  onPick,
}: {
  insights: Insights;
  couplings: Coupling[];
  hiddenOnly: boolean;
  setHiddenOnly: (v: boolean) => void;
  all: boolean;
  setAll: (v: boolean) => void;
  onPick: (path: string) => void;
}) {
  const hidden = couplings.filter((c) => !c.linked);
  return (
    <section className="gx-impact-list">
      <div className="gx-stats">
        <div>
          <b>{couplings.length}</b>
          <span>같이 바뀌는 쌍</span>
        </div>
        <div>
          <b style={{ color: "#f472b6" }}>{hidden.length}</b>
          <span>숨은 결합</span>
        </div>
        <div>
          <b>{couplings.length - hidden.length}</b>
          <span>의존 있음</span>
        </div>
      </div>
      <p className="gx-dim ins-filter-note">
        {all ? `전체 ${insights.couplings.length}쌍` : `강한 쌍만: 코드 파일끼리 · 3번 이상 · 50% 이상 (전체 ${insights.couplings.length}쌍)`}
      </p>
      <label className="gx-toggle">
        <input type="checkbox" checked={hiddenOnly} onChange={(e) => setHiddenOnly(e.target.checked)} />
        숨은 결합만 보기
      </label>
      <label className="gx-toggle">
        <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
        테스트 · 설정 파일과 약한 쌍까지 모두 보기
      </label>
      <h4 style={{ color: "#f472b6" }}>
        숨은 결합 <span className="gx-dim">코드 의존 없이 같이 바뀜</span>
      </h4>
      {hidden.length === 0 ? (
        <p className="gx-dim">없어요</p>
      ) : (
        <ul>
          {hidden.slice(0, TOP * 2).map((c) => (
            <li key={`${c.a}|${c.b}`} className="ins-pair">
              <button onClick={() => onPick(c.a)} title={c.a}>
                {insights.byPath.get(c.a)?.name}
              </button>
              <span className="gx-dim">↔</span>
              <button onClick={() => onPick(c.b)} title={c.b}>
                {insights.byPath.get(c.b)?.name}
              </button>
              <span className="gx-reason">
                {c.support}번 같이 바뀜 · {Math.round(c.confidence * 100)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const PLAY_FRAME_MS = 60;

/** 코드 시티 아래 시간 여행 막대: 끌거나 재생하면 커밋 순서대로 도시가 지어진다 */
function TimeTravel({
  timeline,
  index,
  setIndex,
  insights,
}: {
  timeline: Timeline;
  index: number | null;
  setIndex: (i: number | null) => void;
  insights: Insights;
}) {
  const [playing, setPlaying] = useState(false);
  const last = timeline.total - 1;
  const current = index ?? last;
  // 전체를 15초쯤에 재생한다
  const step = Math.max(1, Math.round(timeline.total / (15000 / PLAY_FRAME_MS)));

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setIndex(Math.min((index ?? -1) + step, last));
    }, PLAY_FRAME_MS);
    return () => clearInterval(timer);
  }, [playing, index, step, last, setIndex]);

  useEffect(() => {
    if (playing && index !== null && index >= last) setPlaying(false);
  }, [playing, index, last]);

  const state = timeline.stateAt(current);
  const date = new Date(state.at).toISOString().slice(0, 10);
  return (
    <div className="tt" onClick={(e) => e.stopPropagation()}>
      <button
        className="tt-play"
        onClick={() => {
          if (!playing && (index === null || index >= last)) setIndex(0);
          setPlaying(!playing);
        }}
        aria-label={playing ? "멈춤" : "재생"}
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <div className="tt-main">
        <input
          type="range"
          min={0}
          max={last}
          value={current}
          onChange={(e) => {
            setPlaying(false);
            setIndex(Number(e.target.value));
          }}
        />
        <div className="tt-info">
          <b>{date}</b>
          <span>
            커밋 {current + 1} / {timeline.total} · {state.author}
          </span>
          <span className="tt-files">
            {state.changed
              .slice(0, 3)
              .map((p) => insights.byPath.get(p)?.name ?? p)
              .join(", ")}
            {state.changed.length > 3 && ` 외 ${state.changed.length - 3}`}
          </span>
        </div>
      </div>
      {index !== null && (
        <button
          className="tt-now"
          onClick={() => {
            setPlaying(false);
            setIndex(null);
          }}
        >
          지금으로
        </button>
      )}
    </div>
  );
}

function FileCard({
  file,
  insights,
  graphHref,
  onPick,
  onClose,
  infra,
  onPickInfra,
}: {
  file: FileMetric;
  insights: Insights;
  graphHref: string;
  onPick: (path: string) => void;
  onClose: () => void;
  infra?: InfraMap | null;
  onPickInfra?: (id: string) => void;
}) {
  const touches = infra ? infra.codeLinks.filter((c) => c.file === file.path) : [];
  const partners = insights.couplings
    .filter((c) => c.a === file.path || c.b === file.path)
    .map((c) => ({ path: c.a === file.path ? c.b : c.a, support: c.support, confidence: c.confidence, linked: c.linked }))
    .sort((a, b) => Number(a.linked) - Number(b.linked) || b.support - a.support);
  const h = file.history;
  return (
    <section className="gx-detail">
      <div className="gx-detail-head">
        <span className="gx-dot" style={{ background: file.color, boxShadow: `0 0 8px ${file.color}` }} />
        <b>{file.name}</b>
        <button className="gx-x" onClick={onClose} aria-label="선택 해제">
          ×
        </button>
      </div>
      <p className="gx-path">{file.path}</p>
      <p className="gx-dim">
        {file.group}
        {file.test && " · 테스트"}
      </p>
      <div className="ins-facts">
        <div>
          <b>{file.lines}</b>
          <span>줄</span>
        </div>
        <div>
          <b>{file.functions}</b>
          <span>함수</span>
        </div>
        <div>
          <b>{file.longestFunction}</b>
          <span>가장 긴 함수</span>
        </div>
        <div>
          <b>{h?.commits ?? "-"}</b>
          <span>변경</span>
        </div>
        <div>
          <b>{h?.authors ?? "-"}</b>
          <span>작성자</span>
        </div>
        <div>
          <b style={{ color: heatColor(file.hotspot) }}>{file.hotspot === null ? "-" : Math.round(file.hotspot * 100)}</b>
          <span>핫스팟</span>
        </div>
      </div>
      {h && (
        <p className="gx-dim">
          +{h.additions} −{h.deletions} · 주 작성자 {h.topAuthor} · 마지막 변경 {relativeDays(h.lastAt)}
        </p>
      )}
      <Link className="ins-graph-link" href={`${graphHref}?file=${encodeURIComponent(file.path)}`}>
        코드 그래프에서 보기 →
      </Link>
      {touches.length > 0 && infra && (
        <div className="gx-deps">
          <h4>이 파일이 닿는 인프라</h4>
          <ul>
            {touches.map((c) => {
              const n = infra.nodes.find((x) => x.id === c.node);
              if (!n) return null;
              return (
                <li key={c.node}>
                  <button className="infra-pick" onClick={() => onPickInfra?.(n.id)}>
                    <i style={{ background: INFRA_STYLE[n.kind].color }} />
                    {n.label}
                  </button>
                  <span className="gx-dim">
                    {CODE_LINK_LABEL[c.kind]}
                    {c.detail ? ` · ${c.detail}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <FunctionCallList file={file} insights={insights} onPick={onPick} />
      <div className="gx-deps">
        <h4 style={{ color: "#f472b6" }}>
          같이 바뀌는 파일 <span className="gx-dim">{partners.length}</span>
        </h4>
        {partners.length === 0 ? (
          <p className="gx-dim">없음</p>
        ) : (
          <ul>
            {partners.map((p) => (
              <li key={p.path}>
                <button onClick={() => onPick(p.path)} title={p.path}>
                  {insights.byPath.get(p.path)?.name}
                </button>
                <span className="gx-dim">
                  {p.support}번 · {Math.round(p.confidence * 100)}% · {p.linked ? "코드 의존 있음" : "숨은 결합"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** 고른 파일의 함수와 함수별 호출 상대 (코드 시티에서 떠오르는 호의 내용) */
function FunctionCallList({ file, insights, onPick }: { file: FileMetric; insights: Insights; onPick: (path: string) => void }) {
  const fns = insights.functionsOf.get(file.path) ?? [];
  const calls = insights.fileCalls.get(file.path);
  const label = (id: string) => {
    const f = insights.fnInfo.get(id);
    if (!f) return id;
    return f.file === file.path ? f.name : `${insights.byPath.get(f.file)?.name.replace(/\.[^.]+$/, "") ?? ""}.${f.name}`;
  };
  if (fns.length === 0) return null;
  return (
    <div className="gx-deps">
      <h4>
        함수 호출 <span className="gx-dim">함수 {fns.length}개</span>
      </h4>
      <p className="ins-legend-line">
        <span style={{ color: "#22d3ee" }}>━ 이 파일이 부르는 파일 {calls?.out.size ?? 0}</span> ·{" "}
        <span style={{ color: "#f472b6" }}>━ 이 파일을 부르는 파일 {calls?.in.size ?? 0}</span>
      </p>
      <ul className="ins-fns">
        {fns.map((f) => (
          <li key={f.id}>
            <span className="ins-fn-name">
              {f.name}
              <em>:{f.line}</em>
            </span>
            {f.out.length > 0 && (
              <span className="ins-fn-calls out">
                →{" "}
                {f.out.slice(0, 4).map((id, i) => {
                  const target = insights.fnInfo.get(id);
                  return (
                    <button key={id} onClick={() => target && onPick(target.file)}>
                      {i > 0 && ", "}
                      {label(id)}
                    </button>
                  );
                })}
                {f.out.length > 4 && ` 외 ${f.out.length - 4}`}
              </span>
            )}
            {f.in.length > 0 && <span className="ins-fn-calls in">← {f.in.length}곳에서 호출</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

const CODE_LINK_LABEL = { entry: "요청을 받는 진입점", data: "DB 를 쓰는 코드", external: "외부 API 를 부르는 코드" } as const;
const CONFIDENCE_LABEL = { file: "설정 파일로 확인", inferred: "이름 · 종류로 추정", missing: "레포에 없음" } as const;

function InfraLegend({ infra }: { infra: InfraMap }) {
  const kinds = [...new Set(infra.nodes.map((n) => n.kind))];
  return (
    <>
      <ul className="infra-legend">
        {kinds.map((k) => (
          <li key={k}>
            <i style={{ background: INFRA_STYLE[k].color }} />
            {INFRA_STYLE[k].label}
          </li>
        ))}
      </ul>
      <p className="gx-hint">
        흐르는 실선 = 설정 파일로 확인 · 흐린 점선 = 추정 · 회색 = 레포에 없음. 노드를 누르면 근거 파일과 연결된 코드가 나와요.
      </p>
    </>
  );
}

/** 인프라 노드 상세: 무엇인지, 근거 파일, 앞뒤 연결, 연결된 코드 파일 */
function InfraCard({
  infra,
  id,
  insights,
  sourceBase,
  onPickFile,
  onPickNode,
  onClose,
}: {
  infra: InfraMap;
  id: string;
  insights: Insights;
  sourceBase: string | null;
  onPickFile: (path: string) => void;
  onPickNode: (id: string) => void;
  onClose: () => void;
}) {
  const node = infra.nodes.find((n) => n.id === id);
  if (!node) return null;
  const style = INFRA_STYLE[node.kind];
  const nameOf = (nid: string) => infra.nodes.find((n) => n.id === nid)?.label ?? nid;
  const incoming = infra.links.filter((l) => l.to === id);
  const outgoing = infra.links.filter((l) => l.from === id);
  const code = infra.codeLinks.filter((c) => c.node === id);
  const src = (file: string, line: number) => (sourceBase ? `${sourceBase}/${file}#L${line}` : null);
  return (
    <section className="gx-detail">
      <div className="gx-detail-head">
        <span className="gx-dot" style={{ background: style.color, boxShadow: `0 0 8px ${style.color}` }} />
        <b>{node.label}</b>
        <span className="gx-kind fn">{style.label}</span>
        <button className="gx-x" onClick={onClose} aria-label="선택 해제">
          ×
        </button>
      </div>
      {node.detail && <p className="gx-path">{node.detail}</p>}
      <p className={`infra-confidence ${node.confidence}`}>
        {CONFIDENCE_LABEL[node.confidence]}
        {node.env ? ` · ${node.env}` : ""}
      </p>
      {node.sources.length > 0 && (
        <div className="gx-deps">
          <h4>근거</h4>
          <ul>
            {node.sources.map((s) => {
              const href = src(s.file, s.line);
              return (
                <li key={`${s.file}:${s.line}`}>
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer" className="infra-src">
                      {s.file}:{s.line} ↗
                    </a>
                  ) : (
                    <span className="infra-src">
                      {s.file}:{s.line}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {[
        { title: "들어오는 연결", list: incoming.map((l) => ({ id: l.from, l })) },
        { title: "나가는 연결", list: outgoing.map((l) => ({ id: l.to, l })) },
      ].map((g) =>
        g.list.length === 0 ? null : (
          <div className="gx-deps" key={g.title}>
            <h4>
              {g.title} <span className="gx-dim">{g.list.length}</span>
            </h4>
            <ul>
              {g.list.map(({ id: other, l }) => (
                <li key={other}>
                  <button className="infra-pick" onClick={() => onPickNode(other)}>
                    {nameOf(other)}
                  </button>
                  <span className={`gx-dim infra-confidence ${l.confidence}`}>
                    {CONFIDENCE_LABEL[l.confidence]}
                    {l.label ? ` · ${l.label}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ),
      )}
      {code.length > 0 && (
        <div className="gx-deps">
          <h4>
            연결된 코드 <span className="gx-dim">{code.length}</span>
          </h4>
          <ul>
            {code.map((c) => (
              <li key={c.file}>
                <button className="infra-pick" onClick={() => onPickFile(c.file)} title={c.file}>
                  {insights.byPath.get(c.file)?.name ?? c.file}
                </button>
                <span className="gx-dim">
                  {CODE_LINK_LABEL[c.kind]}
                  {c.detail ? ` · ${c.detail}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** 런타임 모드 요약: 기록 출처 · 가장 많이 불린 파일 · 테스트가 안 지나간 코드 파일 */
function RuntimeList({ runtime, insights, onPick }: { runtime: FileRuntime; insights: Insights; onPick: (path: string) => void }) {
  const code = insights.files.filter((f) => !f.test);
  const hot = code
    .filter((f) => (runtime.calls.get(f.path) ?? 0) > 0)
    .sort((a, b) => (runtime.calls.get(b.path) ?? 0) - (runtime.calls.get(a.path) ?? 0))
    .slice(0, TOP);
  const cold = code.filter((f) => !runtime.calls.has(f.path) && f.functions > 0).sort((a, b) => b.lines - a.lines);
  const { source } = runtime;
  return (
    <section className="gx-impact-list">
      <p className="gx-dim">
        PR #{source.prNumber} head <code>{shortSha(source.sha)}</code> 에서 테스트를 돌리며 기록한 실제 호출
        {source.finishedAt && ` · ${formatTime(source.finishedAt)}`}. 빛나는 호는 파일 사이에 실제로 오간 호출입니다.
      </p>
      <h4>가장 많이 불린 파일</h4>
      <ul>
        {hot.map((f) => {
          const n = runtime.calls.get(f.path) ?? 0;
          return (
            <li key={f.path}>
              <button onClick={() => onPick(f.path)} title={f.path}>
                {fileName(f.path)}
              </button>
              <span className="gx-runtime-count" style={{ color: runtimeColor(Math.log(1 + n) / Math.log(1 + runtime.maxCalls)) }}>
                ×{n.toLocaleString()}
              </span>
            </li>
          );
        })}
      </ul>
      <h4 style={{ color: "#8a8aa3" }}>
        테스트가 한 번도 지나가지 않은 파일 <span className="gx-dim">{cold.length}</span>
      </h4>
      {cold.length === 0 ? (
        <p className="gx-dim">없음</p>
      ) : (
        <ul>
          {cold.slice(0, TOP).map((f) => (
            <li key={f.path}>
              <button onClick={() => onPick(f.path)} title={f.path}>
                {fileName(f.path)}
              </button>
              <span className="gx-dim">{f.lines}줄</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** 고른 파일의 위임 구역과 이유 */
function ZoneBox({ zone }: { zone: FileZone | undefined }) {
  if (!zone) return null;
  const meta = ZONE_META[zone.zone];
  return (
    <section className="zone-box" style={{ borderColor: meta.color }}>
      <b style={{ color: meta.color }}>
        <i className="zone-dot" style={{ background: meta.color }} />
        {meta.label}
      </b>
      <ul>
        {zone.reasons.map((r) => (
          <li key={r.text} className={r.kind === "tested" || r.kind === "runtime" ? "good" : ""}>
            {r.kind === "tested" || r.kind === "runtime" ? "✓" : "•"} {r.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** AI 위임 지도 요약: 구역 비율 + 사람이 직접 · 리뷰 필수 파일과 이유 */
function DelegationPanel({ delegation, onPick, hasRuntime }: { delegation: Delegation; onPick: (path: string) => void; hasRuntime: boolean }) {
  const total = delegation.code.length || 1;
  const zones: Zone[] = ["OWN", "REVIEW", "DELEGATE"];
  return (
    <section className="deleg">
      <h3 className="gx-h">AI 위임 지도</h3>
      <p className="gx-dim">
        이 레포에서 AI 에이전트에게 어디까지 맡겨도 되는지 레포 데이터(테스트 관계 · 핫스팟 · 숨은 결합 · 의존도{hasRuntime ? " · 런타임 기록" : ""})로
        나눴어요. PR 이 빨간 구역을 건드리면 리뷰 화면에 표시돼요.
      </p>
      <div className="deleg-bar">
        {zones.map((z) => (
          <span key={z} style={{ flex: delegation.counts[z], background: ZONE_META[z].color }} title={`${ZONE_META[z].label} ${delegation.counts[z]}`} />
        ))}
      </div>
      <div className="deleg-stats">
        {zones.map((z) => (
          <div key={z}>
            <b style={{ color: ZONE_META[z].color }}>{Math.round((delegation.counts[z] / total) * 100)}%</b>
            <span>{ZONE_META[z].label}</span>
            <span className="gx-dim">{delegation.counts[z]}개 파일</span>
          </div>
        ))}
      </div>
      {(["OWN", "REVIEW"] as Zone[]).map((z) => {
        const list = delegation.code.filter((f) => f.zone === z);
        if (list.length === 0) return null;
        return (
          <div key={z} className="deleg-list">
            <h4 style={{ color: ZONE_META[z].color }}>
              {ZONE_META[z].label} <span className="gx-dim">{ZONE_META[z].desc}</span>
            </h4>
            <ul>
              {list.slice(0, 12).map((f) => (
                <li key={f.path}>
                  <button onClick={() => onPick(f.path)} title={f.path}>
                    {f.path.slice(f.path.lastIndexOf("/") + 1)}
                  </button>
                  <span className="gx-dim">
                    {f.reasons
                      .filter((r) => r.kind !== "tested" && r.kind !== "runtime")
                      .map((r) => r.text)
                      .join(" · ")}
                  </span>
                </li>
              ))}
              {list.length > 12 && <li className="gx-dim">외 {list.length - 12}개</li>}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
