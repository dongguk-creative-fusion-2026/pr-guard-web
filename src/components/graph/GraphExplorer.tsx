"use client";

import { EdgeCurvedArrowProgram } from "@sigma/edge-curve";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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

const BG = "#0a0a12";
const DIM_NODE = "#1f2030";
const DIM_EDGE = "#14141f";
const SEARCH_LIMIT = 8;
const SMALL_GRAPH = 60;

type Props = {
  data: GraphData;
  title: string;
  subtitle: string;
  backHref: string;
  fontFamily: string;
  /** 처음부터 고를 파일 (?file=) */
  initialFile?: string;
};

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
 */
export function GraphExplorer({ data, title, subtitle, backHref, fontFamily, initialFile }: Props) {
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

  const { groups, graph } = useMemo(() => {
    const { groups, groupOf } = groupCommunities(data);
    return { groups, graph: buildGraph(data, groups, groupOf) };
  }, [data]);

  // 리듀서는 sigma 안에서 불리므로 최신 상태를 ref 로 넘긴다
  const view = useRef({ selected, hovered, hidden });
  view.current = { selected, hovered, hidden };

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
        const { selected, hovered, hidden } = view.current;
        const res: Partial<typeof attrs> & { highlighted?: boolean; forceLabel?: boolean; zIndex?: number; hidden?: boolean } = { ...attrs };
        if (attrs.group !== null && hidden.has(attrs.group)) return { ...res, hidden: true };
        const focus = hovered ?? selected;
        if (!focus) return res;
        if (node === focus) return { ...res, size: attrs.size * 1.5, zIndex: 3, forceLabel: true };
        if (graph.areNeighbors(node, focus)) return { ...res, zIndex: 2, forceLabel: true };
        return { ...res, color: DIM_NODE, label: "", zIndex: 0 };
      },
      edgeReducer: (edge, attrs) => {
        const { selected, hovered, hidden } = view.current;
        const [source, target] = graph.extremities(edge);
        const groupHidden = (n: string) => {
          const g = graph.getNodeAttribute(n, "group");
          return g !== null && hidden.has(g);
        };
        if (groupHidden(source) || groupHidden(target)) return { ...attrs, hidden: true };
        const focus = hovered ?? selected;
        if (!focus) return attrs;
        if (source === focus) return { ...attrs, color: OUT_COLOR, size: attrs.size * 1.8, zIndex: 2 };
        if (target === focus) return { ...attrs, color: IN_COLOR, size: attrs.size * 1.8, zIndex: 2 };
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
  }, [graph, fontFamily]);

  useEffect(() => {
    sigmaRef.current?.refresh({ skipIndexation: true });
  }, [selected, hovered, hidden]);

  // 고른 파일과 연결된 파일이 한 화면에 들어오게 카메라를 옮긴다
  useEffect(() => {
    const sigma = sigmaRef.current;
    if (!sigma || !selected) return;
    const points = [selected, ...graph.neighbors(selected)]
      .map((n) => sigma.getNodeDisplayData(n))
      .filter((d) => d !== undefined);
    if (points.length === 0) return;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    sigma.getCamera().animate(
      {
        x: (Math.max(...xs) + Math.min(...xs)) / 2,
        y: (Math.max(...ys) + Math.min(...ys)) / 2,
        ratio: Math.min(Math.max(span * 1.4, 0.2), 1),
      },
      { duration: 500 },
    );
    // 주소에 남겨서 새로고침·공유해도 같은 파일이 열리게 한다
    const url = new URL(window.location.href);
    url.searchParams.set("file", selected);
    window.history.replaceState(null, "", url);
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

        <aside className="gx-panel">
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
              <DepList title="이 파일이 쓰는 파일" color={OUT_COLOR} items={outgoing} onPick={setSelected} />
              <DepList title="이 파일을 쓰는 파일" color={IN_COLOR} items={incoming} onPick={setSelected} />
            </section>
          ) : (
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
