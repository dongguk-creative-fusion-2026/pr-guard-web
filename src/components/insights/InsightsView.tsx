"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { GraphData } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { cityLegend, CodeCity, type CityColorMode } from "./CodeCity";
import { CouplingWheel } from "./CouplingWheel";
import { HotspotMap } from "./HotspotMap";
import { computeInsights, heatColor, relativeDays, visibleCouplings, type Coupling, type FileMetric, type Insights } from "./metrics";

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
};

/** 코드 인사이트: 코드 시티 · 핫스팟 · 숨은 결합 */
export function InsightsView({ data, title, subtitle, backHref, graphHref, fontFamily, initialTab }: Props) {
  const insights = useMemo(() => computeInsights(data), [data]);
  const [tab, setTab] = useState<InsightTab>(initialTab);
  const [mode, setMode] = useState<CityColorMode>(insights.hasHistory ? "hotspot" : "group");
  const [selected, setSelected] = useState<string | null>(null);
  const [hiddenOnly, setHiddenOnly] = useState(false);
  const [allCouplings, setAllCouplings] = useState(false);
  const couplings = useMemo(() => visibleCouplings(insights, allCouplings), [insights, allCouplings]);

  // 탭을 주소에 남긴다 (새로고침 · 공유)
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", url);
  }, [tab]);

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
          {tab === "city" && <CodeCity insights={insights} mode={mode} selected={selected} onSelect={setSelected} />}
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
                    disabled={!insights.hasHistory && (m.key === "hotspot" || m.key === "recent")}
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

          {current ? (
            <FileCard file={current} insights={insights} graphHref={graphHref} onPick={setSelected} onClose={() => setSelected(null)} />
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

function FileCard({
  file,
  insights,
  graphHref,
  onPick,
  onClose,
}: {
  file: FileMetric;
  insights: Insights;
  graphHref: string;
  onPick: (path: string) => void;
  onClose: () => void;
}) {
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
