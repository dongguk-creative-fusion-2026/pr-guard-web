"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { computeImpact } from "@/components/graph/impact";
import { heatColor, squarify } from "@/components/insights/metrics";
import type { AnalysisContext, Finding, GraphData, GroundLayerId, GroundMark, Review } from "@/lib/api";
import { fileName, VERDICT_LABEL } from "@/lib/format";
import {
  countByStatus,
  groundingOf,
  hasGrounding,
  kindLabel,
  LAYER_META,
  LAYER_ORDER,
  layerOf,
  MARK_META,
  STATUS_META,
  STATUS_ORDER,
} from "@/lib/grounding";
import { GroundLayers, type LayerPin, type LayerTile, type TileLook } from "./GroundLayers";

/** 한 화면에 그릴 파일 수 (넘으면 간접 영향 파일부터 뺀다) */
const MAX_TILES = 60;
const DIM: TileLook = { color: "#1e2235", height: 0.2, opacity: 0.6 };
const LEVEL_LOOK: TileLook[] = [
  { color: "#fde047", height: 1.8, opacity: 1 },
  { color: "#f43f5e", height: 1.1, opacity: 1 },
  { color: "#fb923c", height: 0.7, opacity: 1 },
];

type Props = {
  review: Review;
  findings: Finding[];
  context: AnalysisContext | null;
  graph: GraphData | null;
  repo: string;
  backHref: string;
  /** 파일 경로 → GitHub PR diff 앵커 (#diff-…) */
  diffAnchors: Record<string, string>;
  fontFamily: string;
};

/** 지적 하나를 GitHub PR 의 바뀐 줄로 여는 주소 */
function diffUrl(repo: string, pr: number, anchors: Record<string, string>, f: Finding): string {
  const base = `https://github.com/${repo}/pull/${pr}/files`;
  if (!f.file || !anchors[f.file]) return base;
  return `${base}#${anchors[f.file]}${f.line != null ? `R${f.line}` : ""}`;
}

/** 이 PR 이 닿는 파일을 한 판에 배치한다: 바뀐 파일 · 직접 · 간접 영향 · 지적이 있는 파일 */
function layout(findings: Finding[], context: AnalysisContext | null, graph: GraphData | null) {
  const level = new Map<string, 0 | 1 | 2 | null>();
  const lines = new Map<string, number>();
  if (graph) {
    const impact = computeImpact(graph, context, findings);
    for (const [path, info] of impact.files) level.set(path, info.level);
    for (const c of impact.outside) level.set(c.path, 0);
    for (const n of graph.nodes) if (n.lines) lines.set(n.id, n.lines);
  }
  for (const f of context?.files ?? []) if (!level.has(f.path)) level.set(f.path, 0);
  for (const f of findings) if (f.file && !level.has(f.file)) level.set(f.file, null);

  const withFinding = new Set(findings.map((f) => f.file).filter(Boolean));
  const rank = (p: string) => (withFinding.has(p) ? -1 : (level.get(p) ?? 3));
  const scope = [...level.keys()].sort((a, b) => rank(a) - rank(b)).slice(0, MAX_TILES);

  const size = Math.max(22, Math.sqrt(scope.length) * 8);
  const placed = squarify(
    scope.map((path) => ({ item: path, weight: Math.sqrt(lines.get(path) ?? 60) + (withFinding.has(path) ? 6 : 0) })),
    { x: -size / 2, y: -size / 2, w: size, h: size },
  );
  return { size, level, placed };
}

export function GroundLayersView({ review, findings, context, graph, repo, backHref, diffAnchors, fontFamily }: Props) {
  const grounded = useMemo(() => findings.map((f) => ({ finding: f, g: groundingOf(f) })), [findings]);
  const recorded = hasGrounding(findings);
  const [selected, setSelected] = useState<number | null>(null);
  const [exploded, setExploded] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // 처음엔 겹친 층이 펼쳐지는 모습으로 시작한다
  useEffect(() => {
    const t = setTimeout(() => setExploded(true), 350);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (selected == null) return;
    listRef.current?.querySelector(`[data-finding="${selected}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  const scene = useMemo(() => {
    const { size, level, placed } = layout(findings, context, graph);
    const commits = new Map<string, number>();
    for (const h of context?.history ?? []) commits.set(h.file, h.commits);
    for (const [path, h] of Object.entries(graph?.history?.files ?? {})) if (!commits.has(path)) commits.set(path, h.commits);
    const maxCommits = Math.max(1, ...[...commits.values()]);

    const byFile = new Map<string, typeof grounded>();
    for (const x of grounded) {
      if (!x.finding.file) continue;
      byFile.set(x.finding.file, [...(byFile.get(x.finding.file) ?? []), x]);
    }
    const strongest = (path: string, layer: GroundLayerId): GroundMark => {
      const marks = (byFile.get(path) ?? []).map((x) => layerOf(x.g, layer).mark);
      return (["CONFIRMED", "REFUTED", "RELATED"] as GroundMark[]).find((m) => marks.includes(m)) ?? "NONE";
    };

    const tiles: LayerTile[] = placed.map(({ item: path, rect }) => {
      const pad = Math.min(rect.w, rect.h) * 0.2;
      const lv = level.get(path);
      const c = commits.get(path);
      const t = c != null ? c / maxCommits : null;
      const runtime = strongest(path, "RUNTIME");
      const ai = strongest(path, "AI");
      return {
        path,
        name: fileName(path),
        x: rect.x + rect.w / 2,
        z: rect.y + rect.h / 2,
        w: Math.max(rect.w - pad * 2, 0.4),
        d: Math.max(rect.h - pad * 2, 0.4),
        looks: {
          INDEX: lv != null ? LEVEL_LOOK[lv] : { color: "#475569", height: 0.5, opacity: 1 },
          HISTORY: t != null ? { color: heatColor(t), height: 0.25 + t * 2.2, opacity: 1 } : DIM,
          RUNTIME:
            runtime === "CONFIRMED"
              ? { color: "#34d399", height: 1.4, opacity: 1 }
              : runtime === "RELATED"
                ? { color: "#fbbf24", height: 0.8, opacity: 1 }
                : DIM,
          AI: ai !== "NONE" ? { color: "#f472b6", height: 0.45, opacity: 0.55 } : { ...DIM, height: 0.12 },
        },
      };
    });

    // 같은 파일의 지적 여러 개는 건물 위에 작은 원으로 벌려 꽂는다
    const tileOf = new Map(tiles.map((t) => [t.path, t]));
    const pins: LayerPin[] = [];
    for (const [path, list] of byFile) {
      const t = tileOf.get(path);
      if (!t) continue;
      const r = list.length > 1 ? Math.min(t.w, t.d) * 0.3 : 0;
      list.forEach((x, k) => {
        const a = (k / list.length) * Math.PI * 2;
        pins.push({
          id: x.finding.id,
          x: t.x + Math.cos(a) * r,
          z: t.z + Math.sin(a) * r,
          severity: x.finding.severity,
          status: x.g.status,
          title: x.finding.title,
          marks: Object.fromEntries(LAYER_ORDER.map((id) => [id, layerOf(x.g, id).mark])) as LayerPin["marks"],
        });
      });
    }
    return { size, tiles, pins };
  }, [findings, context, graph, grounded]);

  const counts = useMemo(() => {
    const out = Object.fromEntries(LAYER_ORDER.map((id) => [id, 0])) as Record<GroundLayerId, number>;
    for (const x of grounded) for (const id of LAYER_ORDER) if (layerOf(x.g, id).mark === "CONFIRMED") out[id]++;
    return out;
  }, [grounded]);

  // 층마다 공통으로 붙는 사정 (예: 실행 검증 꺼짐)
  const notes = useMemo(() => {
    const out: Partial<Record<GroundLayerId, string>> = {};
    for (const id of LAYER_ORDER) {
      const ns = new Set(grounded.map((x) => layerOf(x.g, id)).filter((l) => l.mark === "NONE").map((l) => l.note));
      if (ns.size === 1 && counts[id] === 0) out[id] = [...ns][0];
    }
    return out;
  }, [grounded, counts]);

  const byStatus = countByStatus(findings);
  const groups = STATUS_ORDER.map((status) => ({ status, items: grounded.filter((x) => x.g.status === status) }));
  const unplaced = grounded.filter((x) => !x.finding.file).length;

  return (
    <div className="gx ins" style={{ background: "#07070d", fontFamily }}>
      <header className="gx-top">
        <Link href={backHref} className="gx-back">
          ← 리뷰 #{review.id}
        </Link>
        <span className="gx-sub">
          {repo} · PR #{review.prNumber} 근거 층
        </span>
        <div className="ins-actions">
          <button onClick={() => setExploded((e) => !e)}>{exploded ? "층 접기" : "층 펼치기"}</button>
        </div>
      </header>
      <div className="gx-body">
        <div className="ins-stage">
          <div className="gx-legend-float gl-legend">
            <span>
              <b>●</b> 그 층이 확인
            </span>
            <span>
              <b>○</b> 맥락만 있음
            </span>
            <span>
              <b className="gl-x">✕</b> 그 층과 어긋남
            </span>
            <span className="gx-dim">핀이 깊이 내려갈수록 여러 층이 뒷받침하는 지적</span>
          </div>
          <GroundLayers
            size={scene.size}
            tiles={scene.tiles}
            pins={scene.pins}
            notes={notes}
            counts={counts}
            selected={selected}
            onSelect={setSelected}
            exploded={exploded}
          />
        </div>
        <aside className="gx-panel gl-panel" ref={listRef}>
          <section className="gx-impact-head">
            <div className="gx-pr">
              <span className="gx-pr-num">PR #{review.prNumber}</span>
              {review.verdict && <span className={`gx-verdict ${review.verdict}`}>{VERDICT_LABEL[review.verdict]}</span>}
            </div>
            <p className="gl-lead">
              판정에 쓴 지적 <b>{findings.length - byStatus.REFUTED}</b>
              {byStatus.REFUTED > 0 && (
                <>
                  {" "}
                  · 인덱스와 어긋나 뺀 지적 <b className="gl-refuted-num">{byStatus.REFUTED}</b>
                </>
              )}
            </p>
            <div className="gl-status-bar">
              {STATUS_ORDER.map((s) =>
                byStatus[s] > 0 ? (
                  <i key={s} style={{ flex: byStatus[s], background: STATUS_META[s].color }} title={`${STATUS_META[s].label} ${byStatus[s]}`} />
                ) : null,
              )}
            </div>
            {!recorded && <p className="gx-hint">근거 확인 단계가 생기기 전 리뷰예요. 지적을 만든 층만 표시합니다. 다시 리뷰하면 모든 층으로 확인해요.</p>}
          </section>

          <section>
            <h4 className="gx-h">층 (위 = 판단, 아래 = 기반)</h4>
            <ul className="gl-layers">
              {[...LAYER_ORDER].reverse().map((id) => (
                <li key={id}>
                  <i style={{ background: LAYER_META[id].color }} />
                  <div>
                    <b>{LAYER_META[id].label}</b>
                    <span className="gx-dim">{notes[id] ?? LAYER_META[id].hint}</span>
                  </div>
                  <em>{counts[id]}</em>
                </li>
              ))}
            </ul>
          </section>

          {groups.map(({ status, items }) =>
            items.length === 0 ? null : (
              <section key={status} className={`gl-group ${status}`}>
                <h4 className="gx-h" style={{ color: STATUS_META[status].color }}>
                  {STATUS_META[status].label} <span className="gx-dim">{items.length}</span>
                </h4>
                <p className="gx-hint gl-group-hint">{STATUS_META[status].hint}</p>
                <ul className="gl-findings">
                  {items.map(({ finding: f, g }) => {
                    const open = selected === f.id;
                    return (
                      <li key={f.id} data-finding={f.id} className={open ? "open" : undefined}>
                        <button className="gl-finding" onClick={() => setSelected(open ? null : f.id)}>
                          <span className={`gx-sev ${f.severity}`} style={status === "REFUTED" ? { background: "#3f3f5a" } : undefined}>
                            {f.severity}
                          </span>
                          <span className={`gl-title ${status === "REFUTED" ? "struck" : ""}`}>{f.title}</span>
                          <span className="gl-chips" aria-label="층별 판단">
                            {LAYER_ORDER.map((id) => {
                              const mark = layerOf(g, id).mark;
                              return (
                                <i
                                  key={id}
                                  className={`gl-chip ${mark}`}
                                  style={mark === "NONE" ? undefined : { color: LAYER_META[id].color, borderColor: LAYER_META[id].color }}
                                  title={`${LAYER_META[id].label}: ${MARK_META[mark].label}`}
                                >
                                  {LAYER_META[id].short}
                                </i>
                              );
                            })}
                          </span>
                          <span className="gx-path">
                            {fileName(f.file)}
                            {f.line != null && `:${f.line}`}
                          </span>
                        </button>
                        {open && (
                          <div className="gl-detail">
                            <ol className="gl-evidence">
                              {[...LAYER_ORDER].reverse().map((id) => {
                                const l = layerOf(g, id);
                                return (
                                  <li key={id} className={l.mark}>
                                    <span className="gl-mark" style={{ color: l.mark === "REFUTED" ? "#ef4444" : LAYER_META[id].color }}>
                                      {MARK_META[l.mark].symbol}
                                    </span>
                                    <b>{LAYER_META[id].short}</b>
                                    <span>{l.note || MARK_META[l.mark].label}</span>
                                  </li>
                                );
                              })}
                            </ol>
                            {(g.kind || g.symbols.length > 0) && (
                              <p className="gx-dim gl-claim">
                                {kindLabel(g.kind) && <>AI 가 말한 것: {kindLabel(g.kind)} </>}
                                {g.symbols.map((s) => (
                                  <code key={s}>{s}</code>
                                ))}
                              </p>
                            )}
                            <p className="gl-message">{f.message}</p>
                            <a className="gl-diff" href={diffUrl(repo, review.prNumber, diffAnchors, f)} target="_blank" rel="noreferrer">
                              GitHub 에서 바뀐 줄 보기 →
                            </a>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ),
          )}
          {findings.length === 0 && (
            <section>
              <p className="gx-hint">지적 사항이 없어요. 모든 층에서 걸리는 것이 없었습니다.</p>
            </section>
          )}
          {unplaced > 0 && (
            <section>
              <p className="gx-hint">파일이 정해지지 않은 지적 {unplaced}건은 목록에만 있어요 (예: head 빌드 실패).</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

