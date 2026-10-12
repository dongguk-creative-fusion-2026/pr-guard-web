"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { computeImpact } from "@/components/graph/impact";
import type { AnalysisContext, Finding, GraphData, GroundLayerId, Review, Severity } from "@/lib/api";
import { fileName, VERDICT_LABEL } from "@/lib/format";
import { groundingOf, hasGrounding, kindLabel, LAYER_META, LAYER_ORDER, layerOf, MARK_META, STATUS_META } from "@/lib/grounding";
import { GroundLayers, type LayerPin, type LayerTile } from "./GroundLayers";

/** 한 화면에 세울 파일 기둥 수 (지적이 있는 파일 → 바뀐 파일 → 직접 → 간접 순으로 채운다) */
const MAX_TILES = 20;
const CELL = 3.2;
const GUTTER = 1.6;
const SEVERITY_RANK: Record<Severity, number> = { BLOCKER: 0, MAJOR: 1, MINOR: 2, INFO: 3 };

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

export function GroundLayersView({ review, findings, context, graph, repo, backHref, diffAnchors }: Props) {
  const grounded = useMemo(() => findings.map((f) => ({ finding: f, g: groundingOf(f) })), [findings]);
  const recorded = hasGrounding(findings);
  const [selected, setSelected] = useState<number | null>(null);
  const [exploded, setExploded] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setExploded(true), 300);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (selected == null) return;
    listRef.current?.querySelector(`[data-finding="${selected}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  const scene = useMemo(() => {
    // 파일마다 영향 단계 (0 = 바뀜, 1 = 직접, 2 = 간접, null = 그래프 밖)
    const level = new Map<string, 0 | 1 | 2 | null>();
    if (graph) {
      const impact = computeImpact(graph, context, findings);
      for (const [path, info] of impact.files) level.set(path, info.level);
      for (const c of impact.outside) level.set(c.path, 0);
    }
    for (const f of context?.files ?? []) if (!level.has(f.path)) level.set(f.path, 0);
    for (const f of findings) if (f.file && !level.has(f.file)) level.set(f.file, null);

    const byFile = new Map<string, typeof grounded>();
    for (const x of grounded) if (x.finding.file) byFile.set(x.finding.file, [...(byFile.get(x.finding.file) ?? []), x]);
    const worst = (path: string) => Math.min(4, ...(byFile.get(path) ?? []).map((x) => SEVERITY_RANK[x.finding.severity]));
    const order = [...level.keys()].sort(
      (a, b) => worst(a) - worst(b) || (level.get(a) ?? 3) - (level.get(b) ?? 3) || a.localeCompare(b),
    );
    const scope = order.slice(0, MAX_TILES);

    const commits = new Map<string, number>();
    for (const h of context?.history ?? []) commits.set(h.file, h.commits);
    for (const [path, h] of Object.entries(graph?.history?.files ?? {})) if (!commits.has(path)) commits.set(path, h.commits);
    const maxCommits = Math.max(1, ...scope.map((p) => commits.get(p) ?? 0));

    const strongest = (path: string, layer: GroundLayerId) => {
      const marks = (byFile.get(path) ?? []).map((x) => layerOf(x.g, layer).mark);
      return marks.includes("CONFIRMED") ? 1 : marks.includes("REFUTED") ? 0.7 : marks.includes("RELATED") ? 0.45 : 0;
    };

    // 같은 크기 칸의 바둑판. 가운데를 원점으로
    const cols = Math.max(1, Math.ceil(Math.sqrt(scope.length)));
    const rows = Math.max(1, Math.ceil(scope.length / cols));
    const pitch = CELL + GUTTER;
    const span = Math.max(cols, rows) * pitch + GUTTER * 2;
    const tiles: LayerTile[] = scope.map((path, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const lv = level.get(path);
      return {
        path,
        name: fileName(path),
        x: (c - (cols - 1) / 2) * pitch,
        z: (r - (rows - 1) / 2) * pitch,
        size: CELL,
        labeled: byFile.has(path),
        signal: {
          INDEX: Math.max(lv === 0 ? 0.85 : lv === 1 ? 0.5 : lv === 2 ? 0.3 : 0.2, strongest(path, "INDEX")),
          HISTORY: (commits.get(path) ?? 0) / maxCommits,
          RUNTIME: strongest(path, "RUNTIME"),
          AI: strongest(path, "AI"),
        },
      };
    });

    // 같은 파일의 지적 여러 개는 기둥 안에서 조금씩 벌려 꽂는다
    const tileOf = new Map(tiles.map((t) => [t.path, t]));
    const pins: LayerPin[] = [];
    for (const [path, list] of byFile) {
      const t = tileOf.get(path);
      if (!t) continue;
      const r = list.length > 1 ? CELL * 0.28 : 0;
      list.forEach((x, k) => {
        const a = (k / list.length) * Math.PI * 2 - Math.PI / 4;
        pins.push({
          id: x.finding.id,
          path,
          x: t.x + Math.cos(a) * r,
          z: t.z + Math.sin(a) * r,
          severity: x.finding.severity,
          status: x.g.status,
          title: x.finding.title,
          marks: Object.fromEntries(LAYER_ORDER.map((id) => [id, layerOf(x.g, id).mark])) as LayerPin["marks"],
        });
      });
    }
    return { span, tiles, pins, hidden: order.length - scope.length };
  }, [findings, context, graph, grounded]);

  const counts = useMemo(() => {
    const out = Object.fromEntries(LAYER_ORDER.map((id) => [id, 0])) as Record<GroundLayerId, number>;
    for (const x of grounded) for (const id of LAYER_ORDER) if (layerOf(x.g, id).mark === "CONFIRMED") out[id]++;
    return out;
  }, [grounded]);

  // 층 전체에 공통인 사정 (예: 실행 검증 꺼짐)
  const notes = useMemo(() => {
    const out: Partial<Record<GroundLayerId, string>> = {};
    for (const id of LAYER_ORDER) {
      const ns = new Set(grounded.map((x) => layerOf(x.g, id)).filter((l) => l.mark === "NONE").map((l) => l.note));
      if (ns.size === 1 && counts[id] === 0) out[id] = [...ns][0];
    }
    return out;
  }, [grounded, counts]);

  const groups = (["CONFIRMED", "AI_ONLY", "REFUTED"] as const).map((status) => ({
    status,
    title: status === "CONFIRMED" ? "확인된 지적" : status === "AI_ONLY" ? "검토할 지적" : "판정에서 뺀 지적",
    items: grounded.filter((x) => x.g.status === status),
  }));

  return (
    <div className="gx ins gl">
      <header className="gx-top">
        <Link href={backHref} className="gx-back">
          ← PR #{review.prNumber}
        </Link>
        <span className="gx-sub">근거 층</span>
        <div className="ins-actions">
          <button onClick={() => setExploded((e) => !e)}>{exploded ? "접기" : "펼치기"}</button>
        </div>
      </header>
      <div className="gx-body">
        <div className="ins-stage">
          <div className="gl-legend">
            <span>
              <i className="gl-k sphere" />그 층이 확인
            </span>
            <span>
              <i className="gl-k ring" />맥락
            </span>
            <span>
              <i className="gl-k x">✕</i>어긋남
            </span>
          </div>
          <GroundLayers
            span={scene.span}
            tiles={scene.tiles}
            pins={scene.pins}
            notes={notes}
            counts={counts}
            selected={selected}
            onSelect={setSelected}
            exploded={exploded}
          />
          {scene.hidden > 0 && <p className="gl-hidden">영향이 먼 파일 {scene.hidden}개는 생략</p>}
        </div>

        <aside className="gx-panel gl-panel" ref={listRef}>
          <section className="gl-head">
            <div className="gl-pr">
              <span className="mono">#{review.prNumber}</span>
              {review.verdict && <span className={`verdict ${review.verdict}`}>{VERDICT_LABEL[review.verdict]}</span>}
            </div>
            <div className="gl-counts">
              {groups.map((g) => (
                <div key={g.status}>
                  <b style={{ color: g.items.length ? STATUS_META[g.status].color : undefined }}>{g.items.length}</b>
                  <span>{g.title}</span>
                </div>
              ))}
            </div>
            {!recorded && <p className="gl-note">근거 확인 전 리뷰</p>}
          </section>

          <section className="gl-layers">
            {[...LAYER_ORDER].reverse().map((id) => (
              <div key={id}>
                <i style={{ background: LAYER_META[id].color }} />
                <b>{LAYER_META[id].label}</b>
                <span>{counts[id] > 0 ? `확인 ${counts[id]}` : (notes[id] ?? "-")}</span>
              </div>
            ))}
          </section>

          {groups.map(({ status, title, items }) =>
            items.length === 0 ? null : (
              <section key={status} className="gl-group">
                <h4>
                  {title} <span>{items.length}</span>
                </h4>
                <ul>
                  {items.map(({ finding: f, g }) => {
                    const open = selected === f.id;
                    return (
                      <li key={f.id} data-finding={f.id} className={open ? "open" : undefined}>
                        <button className="gl-item" onClick={() => setSelected(open ? null : f.id)}>
                          <span className={`tag ${f.severity}`}>{f.severity}</span>
                          <span className={`gl-title${status === "REFUTED" ? " struck" : ""}`}>{f.title}</span>
                          <span className="gl-loc mono">
                            {fileName(f.file)}
                            {f.line != null && `:${f.line}`}
                          </span>
                        </button>
                        {open && (
                          <div className="gl-detail">
                            <dl className="fl-layers">
                              {[...LAYER_ORDER].reverse().map((id) => {
                                const l = layerOf(g, id);
                                return (
                                  <div key={id} className={l.mark}>
                                    <dt>
                                      <span className="fl-mark">{MARK_META[l.mark].symbol}</span>
                                      {LAYER_META[id].short}
                                    </dt>
                                    <dd>{l.note || MARK_META[l.mark].label}</dd>
                                  </div>
                                );
                              })}
                            </dl>
                            {(g.kind || g.symbols.length > 0) && (
                              <p className="fl-claim">
                                {kindLabel(g.kind)}
                                {g.symbols.map((s) => (
                                  <code key={s}>{s}</code>
                                ))}
                              </p>
                            )}
                            <p className="gl-message">{f.message}</p>
                            <a href={diffUrl(repo, review.prNumber, diffAnchors, f)} target="_blank" rel="noreferrer" className="fl-link">
                              바뀐 줄 보기
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
              <p className="gl-note">지적 사항 없음</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
