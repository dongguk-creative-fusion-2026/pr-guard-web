"use client";

import { EdgeCurvedArrowProgram } from "@sigma/edge-curve";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Sigma from "sigma";
import type { NodeHoverDrawingFunction } from "sigma/rendering";
import type { GraphData } from "@/lib/api";
import { fileName } from "@/lib/format";
import {
  buildGraph,
  groupCommunities,
  IN_COLOR,
  OUT_COLOR,
  typesText,
  type EdgeAttrs,
  type NodeAttrs,
} from "./graphModel";
import { worstSeverity, type Impact, type ImpactFile } from "./impact";

const BG = "#0a0a12";
const DIM_NODE = "#1f2030";
const DIM_EDGE = "#14141f";
const SEARCH_LIMIT = 8;
const SMALL_GRAPH = 60;
// 영향 모드: 바뀐 파일 → 그 파일을 쓰는 파일(1단계) → 1단계를 쓰는 파일(2단계)
const CHANGE_COLOR = "#fde047";
const DIRECT_COLOR = "#f43f5e";
const INDIRECT_COLOR = "#fb923c";
const LEVEL_COLOR = [CHANGE_COLOR, DIRECT_COLOR, INDIRECT_COLOR];
const REVEAL_STEP_MS = 650;
const INDIRECT_PREVIEW = 8;

type Props = {
  data: GraphData;
  title: string;
  subtitle: string;
  backHref: string;
  fontFamily: string;
  /** 처음부터 고를 파일 (?file=) */
  initialFile?: string;
  /** 있으면 PR 영향 모드: 바뀐 파일과 영향 받는 파일을 강조한다 */
  impact?: Impact;
  /** 영향 모드 패널 맨 위 (판정 등) */
  impactHeader?: ReactNode;
};

type NodeDisplay = Partial<NodeAttrs> & { highlighted?: boolean; forceLabel?: boolean; zIndex?: number; hidden?: boolean };

/** 마우스를 올린 파일 이름표: 어두운 알약 + 노드 색 테두리 */
function hoverRenderer(font: string): NodeHoverDrawingFunction<NodeAttrs, EdgeAttrs> {
  return (ctx, data) => {
    const label = data.label ?? "";
    const size = 12;
    ctx.font = `600 ${size}px ${font}`;
    const width = ctx.measureText(label).width + 16;
    const height = size + 10;
    const x = data.x - width / 2;
    const y = data.y - data.size - height - 8;
    ctx.fillStyle = "rgba(14, 14, 24, 0.95)";
    ctx.strokeStyle = data.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#e4e4ed";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, data.x, y + height / 2 + 1);
    ctx.textAlign = "start";
    // 노드 둘레 고리
    ctx.beginPath();
    ctx.arc(data.x, data.y, data.size + 4, 0, Math.PI * 2);
    ctx.stroke();
  };
}

/**
 * 레포 전체 파일 의존성 그래프 탐색 화면 (sigma.js, WebGL).
 * 노드 = 파일 (크기: 연결 수, 색: GitNexus 기능 묶음), 화살표 = A 가 B 를 쓴다.
 * 파일에 마우스를 올리거나 누르면 그 파일과 직접 연결된 파일만 밝게 남긴다.
 * impact 를 주면 PR 이 바꾼 파일에서 영향이 퍼지는 모습을 보여 준다.
 */
export function GraphExplorer({ data, title, subtitle, backHref, fontFamily, initialFile, impact, impactHeader }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma<NodeAttrs, EdgeAttrs> | null>(null);
  const [selected, setSelected] = useState<string | null>(
    initialFile && data.nodes.some((n) => n.id === initialFile) ? initialFile : null,
  );
  const [hovered, setHovered] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  // sigma 가 만들어진 뒤 카메라 이동 효과를 다시 돌리려고 쓴다
  const [ready, setReady] = useState(0);
  // 영향이 퍼지는 연출: -1(아무것도) → 0(바뀐 파일) → 1 → 2
  const [reveal, setReveal] = useState(impact ? -1 : 2);
  const [onlyImpact, setOnlyImpact] = useState(false);
  const [showAllIndirect, setShowAllIndirect] = useState(false);

  const { groups, graph } = useMemo(() => {
    const { groups, groupOf } = groupCommunities(data);
    return { groups, graph: buildGraph(data, groups, groupOf) };
  }, [data]);

  // 리듀서는 sigma 안에서 불리므로 최신 상태를 ref 로 넘긴다
  const view = useRef({ selected, hovered, hidden, reveal, onlyImpact, pulse: 0 });
  view.current = { ...view.current, selected, hovered, hidden, reveal, onlyImpact };

  useEffect(() => {
    if (!container.current) return;
    const sigma = new Sigma<NodeAttrs, EdgeAttrs>(graph, container.current, {
      defaultEdgeType: "curved",
      edgeProgramClasses: { curved: EdgeCurvedArrowProgram },
      labelFont: fontFamily,
      labelSize: 11,
      labelWeight: "500",
      labelColor: { color: "#c8c8d8" },
      // 파일이 적으면 이름을 다 보이고, 많으면 큰 노드 위주로만 (겹치지 않게)
      labelRenderedSizeThreshold: graph.order <= SMALL_GRAPH ? 0 : 10,
      labelDensity: graph.order <= SMALL_GRAPH ? 1 : 0.35,
      labelGridCellSize: 100,
      defaultDrawNodeHover: hoverRenderer(fontFamily),
      minCameraRatio: 0.05,
      maxCameraRatio: 4,
      stagePadding: 40,
      zIndex: true,
      nodeReducer: (node, attrs) => {
        const { selected, hovered, hidden, reveal, onlyImpact, pulse } = view.current;
        const res: NodeDisplay = { ...attrs };
        if (attrs.group !== null && hidden.has(attrs.group)) return { ...res, hidden: true };
        const hit = impact?.files.get(node);
        if (hit && hit.findings.length > 0) res.label = `${attrs.label}  ⚠${hit.findings.length}`;
        const focus = hovered ?? selected;
        if (focus) {
          if (node === focus) return { ...res, size: attrs.size * 1.5, zIndex: 3, forceLabel: true };
          if (graph.areNeighbors(node, focus)) return { ...res, zIndex: 2, forceLabel: true };
          return { ...res, color: DIM_NODE, label: "", zIndex: 0 };
        }
        if (!impact) return res;
        if (!hit || hit.level > reveal) {
          return onlyImpact ? { ...res, hidden: true } : { ...res, color: DIM_NODE, label: "", zIndex: 0 };
        }
        if (hit.level === 0) {
          // 바뀐 파일은 숨쉬듯 커졌다 작아진다
          return { ...res, color: CHANGE_COLOR, size: attrs.size * (1.6 + 0.25 * Math.sin(pulse)) + 2, zIndex: 3, forceLabel: true };
        }
        if (hit.level === 1) {
          return { ...res, color: DIRECT_COLOR, size: attrs.size * (hit.stale ? 1.6 : 1.25) + 1, zIndex: 2, forceLabel: true };
        }
        return { ...res, color: INDIRECT_COLOR, zIndex: 1, forceLabel: graph.order <= SMALL_GRAPH };
      },
      edgeReducer: (edge, attrs) => {
        const { selected, hovered, hidden, reveal, onlyImpact } = view.current;
        const [source, target] = graph.extremities(edge);
        const groupHidden = (n: string) => {
          const g = graph.getNodeAttribute(n, "group");
          return g !== null && hidden.has(g);
        };
        if (groupHidden(source) || groupHidden(target)) return { ...attrs, hidden: true };
        const focus = hovered ?? selected;
        if (focus) {
          if (source === focus) return { ...attrs, color: OUT_COLOR, size: attrs.size * 1.8, zIndex: 2 };
          if (target === focus) return { ...attrs, color: IN_COLOR, size: attrs.size * 1.8, zIndex: 2 };
          return { ...attrs, color: DIM_EDGE, zIndex: 0 };
        }
        if (!impact) return attrs;
        // 영향이 전달되는 간선: 한 단계 바깥 파일이 안쪽 파일을 쓴다
        const from = impact.files.get(source);
        const to = impact.files.get(target);
        if (from && to && from.level === to.level + 1 && from.level <= reveal) {
          return { ...attrs, color: LEVEL_COLOR[from.level], size: attrs.size * 1.6 + 0.4, zIndex: 2 };
        }
        if (onlyImpact && (!from || !to)) return { ...attrs, hidden: true };
        return { ...attrs, color: DIM_EDGE, zIndex: 0 };
      },
    });
    sigma.on("enterNode", ({ node }) => {
      setHovered(node);
      if (container.current) container.current.style.cursor = "pointer";
    });
    sigma.on("leaveNode", () => {
      setHovered(null);
      if (container.current) container.current.style.cursor = "";
    });
    sigma.on("clickNode", ({ node }) => setSelected(node));
    sigma.on("clickStage", () => {
      setSelected(null);
      const url = new URL(window.location.href);
      url.searchParams.delete("file");
      window.history.replaceState(null, "", url);
    });
    sigmaRef.current = sigma;
    setReady((n) => n + 1);
    return () => {
      sigma.kill();
      sigmaRef.current = null;
    };
  }, [graph, fontFamily, impact]);

  useEffect(() => {
    sigmaRef.current?.refresh({ skipIndexation: true });
  }, [selected, hovered, hidden, reveal, onlyImpact]);

  // 영향 모드: 바뀐 파일부터 한 단계씩 드러내고, 바뀐 파일은 계속 맥동시킨다
  useEffect(() => {
    if (!impact || ready === 0) return;
    const timers = [0, 1, 2].map((level) =>
      setTimeout(() => setReveal((r) => Math.max(r, level)), 400 + level * REVEAL_STEP_MS),
    );
    let frame = 0;
    const tick = (t: number) => {
      view.current.pulse = t / 280;
      sigmaRef.current?.refresh({ skipIndexation: true });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      timers.forEach(clearTimeout);
      cancelAnimationFrame(frame);
    };
  }, [impact, ready]);

  /** 주어진 파일들이 한 화면에 들어오게 카메라를 옮긴다 */
  const fitTo = (nodes: string[], minRatio = 0.2) => {
    const sigma = sigmaRef.current;
    if (!sigma) return;
    const points = nodes.map((n) => sigma.getNodeDisplayData(n)).filter((d) => d !== undefined);
    if (points.length === 0) return;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    sigma.getCamera().animate(
      {
        x: (Math.max(...xs) + Math.min(...xs)) / 2,
        y: (Math.max(...ys) + Math.min(...ys)) / 2,
        ratio: Math.min(Math.max(span * 1.4, minRatio), 1),
      },
      { duration: 600 },
    );
  };

  // 영향 모드는 처음에 영향 받은 파일 전체가 들어오게 맞춘다
  useEffect(() => {
    if (!impact || ready === 0 || selected) return;
    fitTo([...impact.files.keys()], 0.35);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [impact, ready]);

  // 고른 파일과 연결된 파일이 한 화면에 들어오게 카메라를 옮긴다
  useEffect(() => {
    if (!sigmaRef.current || !selected) return;
    fitTo([selected, ...graph.neighbors(selected)]);
    // 주소에 남겨서 새로고침·공유해도 같은 파일이 열리게 한다
    const url = new URL(window.location.href);
    url.searchParams.set("file", selected);
    window.history.replaceState(null, "", url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, ready, graph]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return data.nodes
      .filter((n) => n.id.toLowerCase().includes(q))
      .sort((a, b) => fileName(a.id).toLowerCase().indexOf(q) - fileName(b.id).toLowerCase().indexOf(q))
      .slice(0, SEARCH_LIMIT);
  }, [data.nodes, query]);

  const camera = (action: "in" | "out" | "reset") => {
    const c = sigmaRef.current?.getCamera();
    if (!c) return;
    if (action === "in") c.animatedZoom({ duration: 250 });
    else if (action === "out") c.animatedUnzoom({ duration: 250 });
    else c.animatedReset({ duration: 400 });
  };

  const current = selected ? graph.getNodeAttributes(selected) : null;
  const currentImpact = selected ? impact?.files.get(selected) : undefined;
  const outgoing = selected ? graph.outEdges(selected).map((e) => ({ file: graph.target(e), attrs: graph.getEdgeAttributes(e) })) : [];
  const incoming = selected ? graph.inEdges(selected).map((e) => ({ file: graph.source(e), attrs: graph.getEdgeAttributes(e) })) : [];
  const { stats } = data;

  return (
    <div className="gx" style={{ background: BG, fontFamily }}>
      <header className="gx-top">
        <Link href={backHref} className="gx-back">
          ← {title}
        </Link>
        <span className="gx-sub">{subtitle}</span>
        <div className="gx-search">
          <input
            placeholder="파일 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0]) {
                setSelected(results[0].id);
                setQuery("");
              }
              if (e.key === "Escape") setQuery("");
            }}
          />
          {results.length > 0 && (
            <ul className="gx-results">
              {results.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => {
                      setSelected(n.id);
                      setQuery("");
                    }}
                  >
                    <span>{fileName(n.id)}</span>
                    <span className="gx-dim">{n.id}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </header>

      <div className="gx-body">
        <div className="gx-canvas" ref={container} />
        <div className="gx-zoom">
          <button onClick={() => camera("in")} aria-label="확대">+</button>
          <button onClick={() => camera("out")} aria-label="축소">−</button>
          <button onClick={() => camera("reset")} aria-label="전체 보기">⤢</button>
        </div>
        {impact && !current && (
          <div className="gx-legend-float">
            <span><i style={{ background: CHANGE_COLOR }} />바뀐 파일</span>
            <span><i style={{ background: DIRECT_COLOR }} />직접 영향</span>
            <span><i style={{ background: INDIRECT_COLOR }} />간접 영향</span>
          </div>
        )}

        <aside className="gx-panel">
          {current ? (
            <section className="gx-detail">
              <div className="gx-detail-head">
                <span className="gx-dot" style={{ background: current.color, boxShadow: `0 0 8px ${current.color}` }} />
                <b>{current.label}</b>
                <button className="gx-x" onClick={() => setSelected(null)} aria-label="선택 해제">
                  ×
                </button>
              </div>
              <p className="gx-path">{current.path}</p>
              <p className="gx-dim">
                {current.group ?? "묶음 없음"} · 심볼 {current.symbols} · 연결 {current.degree}
              </p>
              {currentImpact && impact && <ImpactInfo file={currentImpact} lineCounts={impact.hasLineCounts} />}
              <DepList title="이 파일이 쓰는 파일" color={OUT_COLOR} items={outgoing} onPick={setSelected} />
              <DepList title="이 파일을 쓰는 파일" color={IN_COLOR} items={incoming} onPick={setSelected} />
            </section>
          ) : impact ? (
            <ImpactPanel
              impact={impact}
              header={impactHeader}
              onlyImpact={onlyImpact}
              setOnlyImpact={setOnlyImpact}
              showAllIndirect={showAllIndirect}
              setShowAllIndirect={setShowAllIndirect}
              onPick={setSelected}
            />
          ) : (
            <>
              <section>
                <div className="gx-stats">
                  <div>
                    <b>{stats.shownFiles}</b>
                    <span>파일</span>
                  </div>
                  <div>
                    <b>{stats.shownEdges}</b>
                    <span>의존</span>
                  </div>
                  <div>
                    <b>{groups.length}</b>
                    <span>묶음</span>
                  </div>
                </div>
                {stats.truncated && <p className="gx-dim">연결된 파일 {stats.connectedFiles}개 중 연결이 많은 파일만 표시</p>}
              </section>
              <section>
                <h3 className="gx-h">기능 묶음</h3>
                <p className="gx-dim">GitNexus 가 찾은 커뮤니티. 눌러서 숨기기</p>
                <ul className="gx-legend">
                  {groups.map((g) => {
                    const off = hidden.has(g.label);
                    return (
                      <li key={g.label}>
                        <button
                          className={off ? "off" : ""}
                          onClick={() =>
                            setHidden((prev) => {
                              const next = new Set(prev);
                              if (next.has(g.label)) next.delete(g.label);
                              else next.add(g.label);
                              return next;
                            })
                          }
                        >
                          <span className="gx-dot" style={{ background: g.color, boxShadow: `0 0 8px ${g.color}` }} />
                          <span>{g.label}</span>
                          <span className="gx-dim">{g.files}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <p className="gx-hint">
                  파일을 누르면 연결된 파일만 남는다.{" "}
                  <span style={{ color: OUT_COLOR }}>━ 쓰는 파일</span> ·{" "}
                  <span style={{ color: IN_COLOR }}>━ 쓰이는 파일</span>
                </p>
              </section>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function DepList({
  title,
  color,
  items,
  onPick,
}: {
  title: string;
  color: string;
  items: { file: string; attrs: EdgeAttrs }[];
  onPick: (file: string) => void;
}) {
  const sorted = [...items].sort((a, b) => b.attrs.weight - a.attrs.weight);
  return (
    <div className="gx-deps">
      <h4 style={{ color }}>
        {title} <span className="gx-dim">{items.length}</span>
      </h4>
      {sorted.length === 0 ? (
        <p className="gx-dim">없음</p>
      ) : (
        <ul>
          {sorted.map((d) => (
            <li key={d.file}>
              <button onClick={() => onPick(d.file)} title={d.file}>
                {fileName(d.file)}
              </button>
              <span className="gx-dim">{typesText(d.attrs.types)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SeverityBadge({ file }: { file: ImpactFile }) {
  const worst = worstSeverity(file.findings);
  if (!worst) return null;
  return (
    <span className={`gx-sev ${worst}`} title={file.findings.map((f) => `[${f.severity}] ${f.title}`).join("\n")}>
      ⚠ {file.findings.length}
    </span>
  );
}

function ImpactTags({ file }: { file: ImpactFile }) {
  return (
    <>
      {file.stale && <span className="gx-tag stale">옛 시그니처 호출</span>}
      {file.confirmed && !file.stale && <span className="gx-tag confirmed">호출부 확인</span>}
    </>
  );
}

/** 선택한 파일이 이번 PR 에서 어떤 위치인지 */
function ImpactInfo({ file, lineCounts }: { file: ImpactFile; lineCounts: boolean }) {
  const label = ["이번 PR 에서 바뀜", "바뀐 파일을 직접 씀", "간접 영향"][file.level];
  return (
    <div className="gx-impact-info" style={{ borderColor: LEVEL_COLOR[file.level] }}>
      <div>
        <b style={{ color: LEVEL_COLOR[file.level] }}>{label}</b> <ImpactTags file={file} />
      </div>
      {file.change && lineCounts && (
        <div className="gx-dim">
          {file.change.status} · <span className="gx-add">+{file.change.additions}</span>{" "}
          <span className="gx-del">−{file.change.deletions}</span>
        </div>
      )}
      {file.reason && <div className="gx-dim">{file.reason}</div>}
      {file.findings.length > 0 && (
        <ul className="gx-findings">
          {file.findings.map((f) => (
            <li key={f.id}>
              <span className={`gx-sev ${f.severity}`}>{f.severity}</span> {f.title}
              {f.line != null && <span className="gx-dim"> :{f.line}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ImpactPanel({
  impact,
  header,
  onlyImpact,
  setOnlyImpact,
  showAllIndirect,
  setShowAllIndirect,
  onPick,
}: {
  impact: Impact;
  header: ReactNode;
  onlyImpact: boolean;
  setOnlyImpact: (v: boolean) => void;
  showAllIndirect: boolean;
  setShowAllIndirect: (v: boolean) => void;
  onPick: (file: string) => void;
}) {
  const indirect = showAllIndirect ? impact.indirect : impact.indirect.slice(0, INDIRECT_PREVIEW);
  return (
    <>
      {header && <section className="gx-impact-head">{header}</section>}
      <section>
        <div className="gx-stats">
          <div>
            <b style={{ color: CHANGE_COLOR }}>{impact.changed.length + impact.outside.length}</b>
            <span>바뀐 파일</span>
          </div>
          <div>
            <b style={{ color: DIRECT_COLOR }}>{impact.direct.length}</b>
            <span>직접 영향</span>
          </div>
          <div>
            <b style={{ color: INDIRECT_COLOR }}>{impact.indirect.length}</b>
            <span>간접 영향</span>
          </div>
        </div>
        <label className="gx-toggle">
          <input type="checkbox" checked={onlyImpact} onChange={(e) => setOnlyImpact(e.target.checked)} />
          영향 받은 파일만 보기
        </label>
      </section>

      <section className="gx-impact-list">
        <h4 style={{ color: CHANGE_COLOR }}>바뀐 파일</h4>
        <ul>
          {impact.changed.map((f) => (
            <li key={f.path}>
              <button onClick={() => onPick(f.path)} title={f.path}>
                {fileName(f.path)}
              </button>
              <SeverityBadge file={f} />
              {f.change && impact.hasLineCounts && (
                <span className="gx-diff">
                  <span className="gx-add">+{f.change.additions}</span> <span className="gx-del">−{f.change.deletions}</span>
                </span>
              )}
            </li>
          ))}
          {impact.outside.map((c) => (
            <li key={c.path} className="gx-outside" title="레포 그래프에 없는 파일 (새 파일이거나 코드가 아닌 파일)">
              <span>{fileName(c.path)}</span>
              <span className="gx-tag">{c.status === "added" ? "새 파일" : "그래프 밖"}</span>
              {impact.hasLineCounts && (
                <span className="gx-diff">
                  <span className="gx-add">+{c.additions}</span> <span className="gx-del">−{c.deletions}</span>
                </span>
              )}
            </li>
          ))}
        </ul>

        <h4 style={{ color: DIRECT_COLOR }}>
          직접 영향 <span className="gx-dim">바뀐 파일을 쓰는 파일</span>
        </h4>
        {impact.direct.length === 0 ? (
          <p className="gx-dim">없음</p>
        ) : (
          <ul>
            {impact.direct.map((f) => (
              <li key={f.path}>
                <button onClick={() => onPick(f.path)} title={f.path}>
                  {fileName(f.path)}
                </button>
                <SeverityBadge file={f} />
                <ImpactTags file={f} />
                <span className="gx-reason">{f.reason}</span>
              </li>
            ))}
          </ul>
        )}

        <h4 style={{ color: INDIRECT_COLOR }}>
          간접 영향 <span className="gx-dim">직접 영향 파일을 쓰는 파일</span>
        </h4>
        {impact.indirect.length === 0 ? (
          <p className="gx-dim">없음</p>
        ) : (
          <ul>
            {indirect.map((f) => (
              <li key={f.path}>
                <button onClick={() => onPick(f.path)} title={f.path}>
                  {fileName(f.path)}
                </button>
                <SeverityBadge file={f} />
                <span className="gx-reason">{f.reason}</span>
              </li>
            ))}
            {impact.indirect.length > INDIRECT_PREVIEW && (
              <li>
                <button className="gx-more" onClick={() => setShowAllIndirect(!showAllIndirect)}>
                  {showAllIndirect ? "접기" : `${impact.indirect.length - INDIRECT_PREVIEW}개 더 보기`}
                </button>
              </li>
            )}
          </ul>
        )}
      </section>
    </>
  );
}
