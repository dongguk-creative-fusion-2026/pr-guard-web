"use client";

import { EdgeCurvedArrowProgram } from "@sigma/edge-curve";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Sigma from "sigma";
import type { NodeHoverDrawingFunction } from "sigma/rendering";
import type { GraphData } from "@/lib/api";
import { fileName } from "@/lib/format";
import {
  buildCodeGraph,
  groupCommunities,
  IN_COLOR,
  OUT_COLOR,
  typesText,
  type EdgeAttrs,
  type FileBox,
  type NodeAttrs,
} from "./graphModel";
import { worstSeverity, type Impact, type ImpactFunction } from "./impact";

const BG = "#0a0a12";
const DIM_NODE = "#24253a";
const DIM_EDGE = "#14141f";
const SEARCH_LIMIT = 10;
// 영향 모드: 바뀐 함수 → 그 함수를 호출하는 함수(1단계) → 1단계를 호출하는 함수(2단계)
const CHANGE_COLOR = "#fde047";
const DIRECT_COLOR = "#f43f5e";
const INDIRECT_COLOR = "#fb923c";
const LEVEL_COLOR = [CHANGE_COLOR, DIRECT_COLOR, INDIRECT_COLOR];
const REVEAL_STEP_MS = 650;
const LIST_PREVIEW = 8;

type Selection = { kind: "fn"; id: string } | { kind: "file"; path: string } | null;

type Props = {
  data: GraphData;
  title: string;
  subtitle: string;
  backHref: string;
  fontFamily: string;
  /** 처음부터 고를 파일 (?file=) */
  initialFile?: string;
  /** 처음부터 고를 함수 (?fn=) */
  initialFunction?: string;
  /** 있으면 PR 영향 모드: 바뀐 함수와 영향 받는 함수를 강조한다 */
  impact?: Impact;
  /** 영향 모드 패널 맨 위 (판정 등) */
  impactHeader?: ReactNode;
};

type NodeDisplay = Partial<NodeAttrs> & { highlighted?: boolean; forceLabel?: boolean; zIndex?: number; hidden?: boolean };

/** 마우스를 올린 함수 이름표: 어두운 알약 + 노드 색 테두리 */
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
    ctx.beginPath();
    ctx.arc(data.x, data.y, data.size + 4, 0, Math.PI * 2);
    ctx.stroke();
  };
}

function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/**
 * 레포 코드 그래프 탐색 화면 (sigma.js, WebGL).
 * 노드 = 함수, 상자 = 파일 (색: GitNexus 기능 묶음), 화살표 = 호출.
 * 함수나 파일 상자를 누르면 직접 호출 관계만 밝게 남긴다.
 * impact 를 주면 PR 이 바꾼 함수에서 호출을 거슬러 영향이 퍼지는 모습을 보여 준다.
 */
export function GraphExplorer({
  data,
  title,
  subtitle,
  backHref,
  fontFamily,
  initialFile,
  initialFunction,
  impact,
  impactHeader,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const boxCanvas = useRef<HTMLCanvasElement>(null);
  const sigmaRef = useRef<Sigma<NodeAttrs, EdgeAttrs> | null>(null);

  const { groups, graph, boxes } = useMemo(() => {
    const { groups, groupOf } = groupCommunities(data);
    return { groups, ...buildCodeGraph(data, groups, groupOf) };
  }, [data]);

  const [selected, setSelected] = useState<Selection>(() => {
    if (initialFunction && graph.hasNode(initialFunction)) return { kind: "fn", id: initialFunction };
    if (initialFile && boxes.has(initialFile)) return { kind: "file", path: initialFile };
    return null;
  });
  const [hovered, setHovered] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  // sigma 가 만들어진 뒤 카메라 이동 효과를 다시 돌리려고 쓴다
  const [ready, setReady] = useState(0);
  // 영향이 퍼지는 연출: -1(아무것도) → 0(바뀐 함수) → 1 → 2
  const [reveal, setReveal] = useState(impact ? -1 : 2);
  const [onlyImpact, setOnlyImpact] = useState(false);

  /** 지금 강조할 함수: 중심(고른 함수 · 고른 파일의 함수)과 그 호출 상대 */
  const focus = useMemo(() => {
    const fn = hovered ?? (selected?.kind === "fn" ? selected.id : null);
    const core = new Set<string>(fn ? [fn] : selected?.kind === "file" ? boxes.get(selected.path)?.functions ?? [] : []);
    if (core.size === 0) return null;
    const related = new Set(core);
    for (const id of core) graph.forEachNeighbor(id, (n) => related.add(n));
    return { core, related, file: !fn && selected?.kind === "file" ? selected.path : null };
  }, [hovered, selected, graph, boxes]);

  // 리듀서와 상자 그리기는 sigma 안에서 불리므로 최신 상태를 ref 로 넘긴다
  const view = useRef({ focus, hidden, reveal, onlyImpact, pulse: 0 });
  view.current = { ...view.current, focus, hidden, reveal, onlyImpact };

  useEffect(() => {
    if (!container.current) return;
    const groupHidden = (n: string) => {
      const box = boxes.get(graph.getNodeAttribute(n, "file"));
      return box?.group != null && view.current.hidden.has(box.group);
    };
    const sigma = new Sigma<NodeAttrs, EdgeAttrs>(graph, container.current, {
      defaultEdgeType: "curved",
      edgeProgramClasses: { curved: EdgeCurvedArrowProgram },
      labelFont: fontFamily,
      labelSize: 11,
      labelWeight: "500",
      labelColor: { color: "#d4d4e2" },
      // 함수 크기를 그래프 좌표로 잡아 상자와 함께 커지고 작아지게 한다. 확대하면 함수 이름이 보인다
      itemSizesReference: "positions",
      zoomToSizeRatioFunction: (ratio) => ratio,
      labelRenderedSizeThreshold: 6,
      labelDensity: 1,
      labelGridCellSize: 50,
      defaultDrawNodeHover: hoverRenderer(fontFamily),
      minCameraRatio: 0.02,
      maxCameraRatio: 3,
      stagePadding: 30,
      zIndex: true,
      nodeReducer: (node, attrs) => {
        const { focus, reveal, onlyImpact, pulse } = view.current;
        const res: NodeDisplay = { ...attrs };
        if (groupHidden(node)) return { ...res, hidden: true };
        const hit = impact?.functions.get(node);
        if (hit && hit.findings.length > 0) res.label = `${attrs.label} ⚠${hit.findings.length}`;
        if (focus) {
          if (focus.core.has(node)) return { ...res, size: attrs.size * 1.5, zIndex: 3, forceLabel: true };
          if (focus.related.has(node)) return { ...res, zIndex: 2, forceLabel: true };
          return { ...res, color: DIM_NODE, label: "", zIndex: 0 };
        }
        if (!impact) return res;
        if (!hit || hit.level > reveal) {
          return onlyImpact ? { ...res, hidden: true } : { ...res, color: DIM_NODE, label: "", zIndex: 0 };
        }
        if (hit.level === 0) {
          // 바뀐 함수는 숨쉬듯 커졌다 작아진다
          return { ...res, color: CHANGE_COLOR, size: attrs.size * (1.5 + 0.25 * Math.sin(pulse)), zIndex: 3, forceLabel: true };
        }
        if (hit.level === 1) {
          return { ...res, color: DIRECT_COLOR, size: attrs.size * (hit.stale ? 1.6 : 1.25), zIndex: 2, forceLabel: true };
        }
        return { ...res, color: INDIRECT_COLOR, zIndex: 1 };
      },
      edgeReducer: (edge, attrs) => {
        const { focus, reveal, onlyImpact } = view.current;
        const [source, target] = graph.extremities(edge);
        if (groupHidden(source) || groupHidden(target)) return { ...attrs, hidden: true };
        if (focus) {
          if (focus.core.has(source)) return { ...attrs, color: OUT_COLOR, size: attrs.size * 1.8, zIndex: 2 };
          if (focus.core.has(target)) return { ...attrs, color: IN_COLOR, size: attrs.size * 1.8, zIndex: 2 };
          return { ...attrs, color: DIM_EDGE, zIndex: 0 };
        }
        if (!impact) return attrs;
        // 영향이 전달되는 호출: 한 단계 바깥 함수가 안쪽 함수를 호출한다
        const from = impact.functions.get(source);
        const to = impact.functions.get(target);
        if (from && to && from.level === to.level + 1 && from.level <= reveal) {
          return { ...attrs, color: LEVEL_COLOR[from.level], size: attrs.size * 1.6 + 0.3, zIndex: 2 };
        }
        if (onlyImpact && (!from || !to)) return { ...attrs, hidden: true };
        return { ...attrs, color: DIM_EDGE, zIndex: 0 };
      },
    });

    // 파일 상자: sigma 그림 뒤 캔버스에, 화면이 다시 그려질 때마다 같이 그린다
    const drawBoxes = () => {
      const canvas = boxCanvas.current;
      const el = container.current;
      if (!canvas || !el) return;
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = el.getBoundingClientRect();
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const { focus, hidden, reveal, onlyImpact } = view.current;
      for (const box of boxes.values()) {
        if (box.group != null && hidden.has(box.group)) continue;
        const a = sigma.graphToViewport({ x: box.x, y: -box.y });
        const b = sigma.graphToViewport({ x: box.x + box.w, y: -(box.y + box.h) });
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const w = Math.abs(b.x - a.x);
        const h = Math.abs(b.y - a.y);
        if (x > width || y > height || x + w < 0 || y + h < 0 || w < 2) continue;

        let stroke = alpha(box.color, 0.5);
        let fill = alpha(box.color, 0.06);
        let text = "#c8c8d8";
        let lineWidth = 1;
        const info = impact?.files.get(box.path);
        const touched = focus ? box.functions.some((f) => focus.related.has(f)) : false;
        if (focus) {
          if (focus.file === box.path) {
            stroke = box.color;
            fill = alpha(box.color, 0.14);
            lineWidth = 2;
          } else if (!touched) {
            stroke = alpha(box.color, 0.12);
            fill = "rgba(255,255,255,0.01)";
            text = "#45465c";
          }
        } else if (impact) {
          if (info && info.level <= reveal) {
            stroke = LEVEL_COLOR[info.level];
            fill = alpha(LEVEL_COLOR[info.level], info.level === 0 ? 0.12 : 0.07);
            lineWidth = info.level === 0 ? 2 : 1.4;
          } else {
            if (onlyImpact) continue;
            stroke = alpha(box.color, 0.12);
            fill = "rgba(255,255,255,0.01)";
            text = "#45465c";
          }
        }
        const radius = Math.min(8, w / 8, h / 8);
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, radius);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = stroke;
        ctx.stroke();

        // 파일 이름 (상자가 너무 작으면 생략, 넘치면 자른다)
        if (w < 36) continue;
        const scale = w / box.w;
        const fontSize = Math.max(9, Math.min(13, 18 * scale * 0.62));
        ctx.font = `600 ${fontSize}px ${fontFamily}`;
        ctx.fillStyle = text;
        ctx.textBaseline = "middle";
        let label = box.label;
        const findings = info?.findings.length ?? 0;
        const badge = findings > 0 ? ` ⚠${findings}` : "";
        const room = w - 12;
        while (label.length > 3 && ctx.measureText(label + badge).width > room) label = label.slice(0, -2);
        if (label !== box.label) label = label.slice(0, -1) + "…";
        const ty = y + Math.max(fontSize * 0.8, Math.min(9 * scale, 14));
        ctx.fillText(label, x + 6, ty);
        if (badge) {
          ctx.fillStyle = "#fb7185";
          ctx.fillText(badge, x + 6 + ctx.measureText(label).width, ty);
        }
      }
    };
    sigma.on("afterRender", drawBoxes);

    sigma.on("enterNode", ({ node }) => {
      setHovered(node);
      if (container.current) container.current.style.cursor = "pointer";
    });
    sigma.on("leaveNode", () => {
      setHovered(null);
      if (container.current) container.current.style.cursor = "";
    });
    sigma.on("clickNode", ({ node }) => setSelected({ kind: "fn", id: node }));
    // 빈 곳을 누르면: 파일 상자 안이면 그 파일을, 아니면 선택 해제
    sigma.on("clickStage", ({ event }) => {
      const p = sigma.viewportToGraph({ x: event.x, y: event.y });
      const hit = [...boxes.values()].find(
        (b) => p.x >= b.x && p.x <= b.x + b.w && -p.y >= b.y && -p.y <= b.y + b.h && !(b.group != null && view.current.hidden.has(b.group)),
      );
      setSelected(hit ? { kind: "file", path: hit.path } : null);
    });
    sigmaRef.current = sigma;
    setReady((n) => n + 1);
    return () => {
      sigma.kill();
      sigmaRef.current = null;
    };
  }, [graph, boxes, fontFamily, impact]);

  useEffect(() => {
    sigmaRef.current?.refresh({ skipIndexation: true });
  }, [focus, hidden, reveal, onlyImpact]);

  // 영향 모드: 바뀐 함수부터 한 단계씩 드러내고, 바뀐 함수는 계속 맥동시킨다
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

  /** 주어진 함수들이 한 화면에 들어오게 카메라를 옮긴다 */
  const fitTo = (nodes: string[], minRatio = 0.08) => {
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
        ratio: Math.min(Math.max(span * 1.5, minRatio), 1),
      },
      { duration: 600 },
    );
  };

  // 영향 모드는 처음에 영향 받은 함수 전체가 들어오게 맞춘다
  useEffect(() => {
    if (!impact || ready === 0 || selected) return;
    fitTo([...impact.functions.keys()], 0.15);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [impact, ready]);

  // 고른 것과 그 호출 상대가 한 화면에 들어오게 카메라를 옮기고, 주소에 남긴다 (새로고침 · 공유)
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("fn");
    url.searchParams.delete("file");
    if (selected?.kind === "fn") url.searchParams.set("fn", selected.id);
    if (selected?.kind === "file") url.searchParams.set("file", selected.path);
    window.history.replaceState(null, "", url);
    if (!sigmaRef.current || !selected) return;
    const core = selected.kind === "fn" ? [selected.id] : boxes.get(selected.path)?.functions ?? [];
    const around = new Set(core);
    core.forEach((id) => graph.forEachNeighbor(id, (n) => around.add(n)));
    fitTo([...around]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, ready, graph, boxes]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const files = [...boxes.values()]
      .filter((b) => b.path.toLowerCase().includes(q))
      .map((b) => ({ key: `file:${b.path}`, kind: "파일" as const, name: b.label, sub: b.path, pick: { kind: "file", path: b.path } as Selection }));
    const fns = graph
      .filterNodes((_, a) => !a.placeholder && a.label.toLowerCase().includes(q))
      .map((id) => {
        const a = graph.getNodeAttributes(id);
        return { key: id, kind: "함수" as const, name: a.label, sub: `${fileName(a.file)}:${a.line}`, pick: { kind: "fn", id } as Selection };
      });
    const score = (name: string) => (name.toLowerCase().startsWith(q) ? 0 : 1);
    return [...files, ...fns].sort((a, b) => score(a.name) - score(b.name)).slice(0, SEARCH_LIMIT);
  }, [boxes, graph, query]);

  const camera = (action: "in" | "out" | "reset") => {
    const c = sigmaRef.current?.getCamera();
    if (!c) return;
    if (action === "in") c.animatedZoom({ duration: 250 });
    else if (action === "out") c.animatedUnzoom({ duration: 250 });
    else c.animatedReset({ duration: 400 });
  };

  const { stats } = data;
  const fnCount = graph.filterNodes((_, a) => !a.placeholder).length;
  const pickFn = (id: string) => setSelected({ kind: "fn", id });
  const pickFile = (path: string) => setSelected({ kind: "file", path });

  let panel: ReactNode;
  if (selected?.kind === "fn" && graph.hasNode(selected.id)) {
    panel = <FunctionDetail id={selected.id} graph={graph} boxes={boxes} impact={impact} onPickFn={pickFn} onPickFile={pickFile} onClose={() => setSelected(null)} />;
  } else if (selected?.kind === "file" && boxes.has(selected.path)) {
    panel = <FileDetail box={boxes.get(selected.path)!} data={data} graph={graph} impact={impact} onPickFn={pickFn} onPickFile={pickFile} onClose={() => setSelected(null)} />;
  } else if (impact) {
    panel = <ImpactPanel impact={impact} header={impactHeader} onlyImpact={onlyImpact} setOnlyImpact={setOnlyImpact} onPickFn={pickFn} onPickFile={pickFile} />;
  } else {
    panel = (
      <>
        <section>
          <div className="gx-stats gx-stats-4">
            <div>
              <b>{stats.shownFiles}</b>
              <span>파일</span>
            </div>
            <div>
              <b>{fnCount}</b>
              <span>함수</span>
            </div>
            <div>
              <b>{graph.size}</b>
              <span>{data.functions ? "호출" : "의존"}</span>
            </div>
            <div>
              <b>{groups.length}</b>
              <span>묶음</span>
            </div>
          </div>
          {!data.functions && <p className="gx-warn">함수 정보가 없는 예전 그래프입니다. 프로젝트 화면에서 &quot;다시 만들기&quot;를 누르면 함수 단위로 보입니다.</p>}
          {stats.truncated && <p className="gx-dim">연결된 파일 {stats.connectedFiles}개 중 연결이 많은 파일만 표시</p>}
          {stats.functions !== undefined && stats.shownFunctions !== undefined && stats.functions > stats.shownFunctions && (
            <p className="gx-dim">함수 {stats.functions}개 중 {stats.shownFunctions}개 표시</p>
          )}
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
            점 = 함수, 상자 = 파일. 함수나 상자를 누르면 호출 관계만 남는다. 확대하면 함수 이름이 보인다.{" "}
            <span style={{ color: OUT_COLOR }}>━ 호출하는 쪽</span> · <span style={{ color: IN_COLOR }}>━ 호출받는 쪽</span>
          </p>
        </section>
      </>
    );
  }

  return (
    <div className="gx" style={{ background: BG, fontFamily }}>
      <header className="gx-top">
        <Link href={backHref} className="gx-back">
          ← {title}
        </Link>
        <span className="gx-sub">{subtitle}</span>
        <div className="gx-search">
          <input
            placeholder="파일 · 함수 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0]) {
                setSelected(results[0].pick);
                setQuery("");
              }
              if (e.key === "Escape") setQuery("");
            }}
          />
          {results.length > 0 && (
            <ul className="gx-results">
              {results.map((r) => (
                <li key={r.key}>
                  <button
                    onClick={() => {
                      setSelected(r.pick);
                      setQuery("");
                    }}
                  >
                    <span>
                      <span className={`gx-kind ${r.kind === "파일" ? "file" : "fn"}`}>{r.kind}</span> {r.name}
                    </span>
                    <span className="gx-dim">{r.sub}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </header>

      <div className="gx-body">
        <div className="gx-stage">
          <canvas className="gx-boxes" ref={boxCanvas} />
          <div className="gx-canvas" ref={container} />
        </div>
        <div className="gx-zoom">
          <button onClick={() => camera("in")} aria-label="확대">+</button>
          <button onClick={() => camera("out")} aria-label="축소">−</button>
          <button onClick={() => camera("reset")} aria-label="전체 보기">⤢</button>
        </div>
        {impact && !selected && (
          <div className="gx-legend-float">
            <span><i style={{ background: CHANGE_COLOR }} />바뀐 함수</span>
            <span><i style={{ background: DIRECT_COLOR }} />직접 영향</span>
            <span><i style={{ background: INDIRECT_COLOR }} />간접 영향</span>
          </div>
        )}
        <aside className="gx-panel">{panel}</aside>
      </div>
    </div>
  );
}

type CodeGraph = ReturnType<typeof buildCodeGraph>["graph"];

function FnLink({ id, graph, onPick }: { id: string; graph: CodeGraph; onPick: (id: string) => void }) {
  const a = graph.getNodeAttributes(id);
  return (
    <button className="gx-fn" onClick={() => onPick(id)} title={`${a.file}:${a.line}`}>
      <span>{a.label}</span>
      {!a.placeholder && <span className="gx-dim"> {fileName(a.file)}</span>}
    </button>
  );
}

function CallList({
  title,
  color,
  ids,
  graph,
  onPick,
}: {
  title: string;
  color: string;
  ids: string[];
  graph: CodeGraph;
  onPick: (id: string) => void;
}) {
  return (
    <div className="gx-deps">
      <h4 style={{ color }}>
        {title} <span className="gx-dim">{ids.length}</span>
      </h4>
      {ids.length === 0 ? (
        <p className="gx-dim">없음</p>
      ) : (
        <ul>
          {ids.map((id) => (
            <li key={id}>
              <FnLink id={id} graph={graph} onPick={onPick} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SeverityBadge({ findings }: { findings: ImpactFunction["findings"] }) {
  const worst = worstSeverity(findings);
  if (!worst) return null;
  return (
    <span className={`gx-sev ${worst}`} title={findings.map((f) => `[${f.severity}] ${f.title}`).join("\n")}>
      ⚠ {findings.length}
    </span>
  );
}

function ImpactTags({ fn }: { fn: ImpactFunction }) {
  return (
    <>
      {fn.stale && <span className="gx-tag stale">옛 시그니처 호출</span>}
      {fn.confirmed && !fn.stale && <span className="gx-tag confirmed">호출부 확인</span>}
    </>
  );
}

function FindingList({ findings }: { findings: ImpactFunction["findings"] }) {
  if (findings.length === 0) return null;
  return (
    <ul className="gx-findings">
      {findings.map((f) => (
        <li key={f.id}>
          <span className={`gx-sev ${f.severity}`}>{f.severity}</span> {f.title}
          {f.line != null && <span className="gx-dim"> :{f.line}</span>}
        </li>
      ))}
    </ul>
  );
}

function FunctionDetail({
  id,
  graph,
  boxes,
  impact,
  onPickFn,
  onPickFile,
  onClose,
}: {
  id: string;
  graph: CodeGraph;
  boxes: Map<string, FileBox>;
  impact?: Impact;
  onPickFn: (id: string) => void;
  onPickFile: (path: string) => void;
  onClose: () => void;
}) {
  const a = graph.getNodeAttributes(id);
  const hit = impact?.functions.get(id);
  return (
    <section className="gx-detail">
      <div className="gx-detail-head">
        <span className="gx-dot" style={{ background: a.color, boxShadow: `0 0 8px ${a.color}` }} />
        <b>{a.label}</b>
        <span className="gx-kind fn">{a.placeholder ? "파일" : a.kind}</span>
        <button className="gx-x" onClick={onClose} aria-label="선택 해제">
          ×
        </button>
      </div>
      <button className="gx-path gx-link" onClick={() => onPickFile(a.file)}>
        {a.file}
        {!a.placeholder && `:${a.line}`}
      </button>
      <p className="gx-dim">{boxes.get(a.file)?.group ?? "묶음 없음"}</p>
      {hit && (
        <div className="gx-impact-info" style={{ borderColor: LEVEL_COLOR[hit.level] }}>
          <div>
            <b style={{ color: LEVEL_COLOR[hit.level] }}>{["이번 PR 에서 바뀜", "바뀐 함수를 직접 호출", "간접 영향"][hit.level]}</b>{" "}
            <ImpactTags fn={hit} />
          </div>
          {hit.reason && <div className="gx-dim">{hit.reason}</div>}
          <FindingList findings={hit.findings} />
        </div>
      )}
      <CallList title={a.placeholder ? "이 파일이 쓰는 파일" : "이 함수가 호출하는 함수"} color={OUT_COLOR} ids={graph.outNeighbors(id)} graph={graph} onPick={onPickFn} />
      <CallList title={a.placeholder ? "이 파일을 쓰는 파일" : "이 함수를 호출하는 함수"} color={IN_COLOR} ids={graph.inNeighbors(id)} graph={graph} onPick={onPickFn} />
    </section>
  );
}

function FileDetail({
  box,
  data,
  graph,
  impact,
  onPickFn,
  onPickFile,
  onClose,
}: {
  box: FileBox;
  data: GraphData;
  graph: CodeGraph;
  impact?: Impact;
  onPickFn: (id: string) => void;
  onPickFile: (path: string) => void;
  onClose: () => void;
}) {
  const info = impact?.files.get(box.path);
  const outgoing = data.edges.filter((e) => e.source === box.path).sort((a, b) => b.weight - a.weight);
  const incoming = data.edges.filter((e) => e.target === box.path).sort((a, b) => b.weight - a.weight);
  const fns = box.functions.filter((id) => !graph.getNodeAttribute(id, "placeholder"));
  return (
    <section className="gx-detail">
      <div className="gx-detail-head">
        <span className="gx-dot" style={{ background: box.color, boxShadow: `0 0 8px ${box.color}` }} />
        <b>{box.label}</b>
        <span className="gx-kind file">파일</span>
        <button className="gx-x" onClick={onClose} aria-label="선택 해제">
          ×
        </button>
      </div>
      <p className="gx-path">{box.path}</p>
      <p className="gx-dim">
        {box.group ?? "묶음 없음"} · 함수 {fns.length}
      </p>
      {info && (
        <div className="gx-impact-info" style={{ borderColor: LEVEL_COLOR[info.level] }}>
          <b style={{ color: LEVEL_COLOR[info.level] }}>{["이번 PR 에서 바뀜", "바뀐 함수를 직접 호출", "간접 영향"][info.level]}</b>
          {info.change && impact?.hasLineCounts && (
            <div className="gx-dim">
              {info.change.status} · <span className="gx-add">+{info.change.additions}</span>{" "}
              <span className="gx-del">−{info.change.deletions}</span>
            </div>
          )}
          <FindingList findings={info.findings} />
        </div>
      )}
      {fns.length > 0 && (
        <div className="gx-deps">
          <h4>
            함수 <span className="gx-dim">{fns.length}</span>
          </h4>
          <ul>
            {fns.map((id) => {
              const hit = impact?.functions.get(id);
              return (
                <li key={id}>
                  <button className="gx-fn" onClick={() => onPickFn(id)}>
                    {hit && <i className="gx-level" style={{ background: LEVEL_COLOR[hit.level] }} />}
                    <span>{graph.getNodeAttribute(id, "label")}</span>
                    <span className="gx-dim"> :{graph.getNodeAttribute(id, "line")}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {[
        { title: "이 파일이 쓰는 파일", color: OUT_COLOR, list: outgoing.map((e) => ({ path: e.target, types: e.types })) },
        { title: "이 파일을 쓰는 파일", color: IN_COLOR, list: incoming.map((e) => ({ path: e.source, types: e.types })) },
      ].map((g) => (
        <div className="gx-deps" key={g.title}>
          <h4 style={{ color: g.color }}>
            {g.title} <span className="gx-dim">{g.list.length}</span>
          </h4>
          {g.list.length === 0 ? (
            <p className="gx-dim">없음</p>
          ) : (
            <ul>
              {g.list.map((d) => (
                <li key={d.path}>
                  <button className="gx-fn" onClick={() => onPickFile(d.path)} title={d.path}>
                    {fileName(d.path)}
                  </button>
                  <span className="gx-dim">{typesText(d.types)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}

function ImpactPanel({
  impact,
  header,
  onlyImpact,
  setOnlyImpact,
  onPickFn,
  onPickFile,
}: {
  impact: Impact;
  header: ReactNode;
  onlyImpact: boolean;
  setOnlyImpact: (v: boolean) => void;
  onPickFn: (id: string) => void;
  onPickFile: (path: string) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const section = (key: string, title: string, sub: string, color: string, list: ImpactFunction[]) => {
    const shown = open[key] ? list : list.slice(0, LIST_PREVIEW);
    return (
      <>
        <h4 style={{ color }}>
          {title} <span className="gx-dim">{sub}</span>
        </h4>
        {list.length === 0 ? (
          <p className="gx-dim">없음</p>
        ) : (
          <ul>
            {shown.map((f) => (
              <li key={f.id}>
                <button onClick={() => onPickFn(f.id)} title={f.file}>
                  {f.name}
                </button>
                {!f.placeholder && <span className="gx-dim">{fileName(f.file)}</span>}
                <SeverityBadge findings={f.findings} />
                <ImpactTags fn={f} />
                {f.reason && <span className="gx-reason">{f.reason}</span>}
              </li>
            ))}
            {list.length > LIST_PREVIEW && (
              <li>
                <button className="gx-more" onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}>
                  {open[key] ? "접기" : `${list.length - LIST_PREVIEW}개 더 보기`}
                </button>
              </li>
            )}
          </ul>
        )}
      </>
    );
  };
  return (
    <>
      {header && <section className="gx-impact-head">{header}</section>}
      <section>
        <div className="gx-stats">
          <div>
            <b style={{ color: CHANGE_COLOR }}>{impact.changed.length}</b>
            <span>바뀐 함수</span>
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
          영향 받은 함수만 보기
        </label>
      </section>

      <section className="gx-impact-list">
        <h4 style={{ color: CHANGE_COLOR }}>바뀐 파일</h4>
        <ul>
          {impact.changedFiles.map((f) => (
            <li key={f.path}>
              <button onClick={() => onPickFile(f.path)} title={f.path}>
                {fileName(f.path)}
              </button>
              <SeverityBadge findings={f.findings} />
              {f.change && impact.hasLineCounts && (
                <span className="gx-diff">
                  <span className="gx-add">+{f.change.additions}</span> <span className="gx-del">−{f.change.deletions}</span>
                </span>
              )}
            </li>
          ))}
          {impact.outside.map((c) => (
            <li key={c.path} className="gx-outside" title="그래프에 없는 파일 (새 파일이거나 코드가 아닌 파일)">
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
        {section("changed", "바뀐 함수", "", CHANGE_COLOR, impact.changed)}
        {section("direct", "직접 영향", "바뀐 함수를 호출", DIRECT_COLOR, impact.direct)}
        {section("indirect", "간접 영향", "직접 영향 함수를 호출", INDIRECT_COLOR, impact.indirect)}
      </section>
    </>
  );
}
