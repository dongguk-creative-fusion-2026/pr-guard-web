"use client";

import { useMemo, useState } from "react";
import { heatColor, squarify, type FileMetric, type Insights } from "./metrics";

const W = 1200;
const H = 760;
const GROUP_HEADER = 20;

/** 핫스팟 트리맵: 넓이 = 줄 수, 색 = 변경 빈도 × 크기. 기능 묶음별로 나눈다 */
export function HotspotMap({
  insights,
  selected,
  onSelect,
}: {
  insights: Insights;
  selected: string | null;
  onSelect: (path: string | null) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const layout = useMemo(() => {
    const zones = squarify(
      insights.groups.map((g) => ({ item: g, weight: g.files.reduce((s, f) => s + Math.max(f.lines, 1), 0) })),
      { x: 0, y: 0, w: W, h: H },
    );
    return zones.map(({ item: g, rect }) => {
      const inner = { x: rect.x + 3, y: rect.y + GROUP_HEADER, w: Math.max(rect.w - 6, 1), h: Math.max(rect.h - GROUP_HEADER - 3, 1) };
      return {
        group: g,
        rect,
        cells: squarify(g.files.map((f) => ({ item: f, weight: Math.max(f.lines, 1) })), inner),
      };
    });
  }, [insights]);

  const tipFile: FileMetric | undefined = hover ? insights.byPath.get(hover) : undefined;

  return (
    <div className="hs-wrap" onClick={() => onSelect(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="hs-svg" preserveAspectRatio="xMidYMid meet">
        {layout.map(({ group, rect, cells }) => (
          <g key={group.label}>
            <rect x={rect.x + 1} y={rect.y + 1} width={rect.w - 2} height={rect.h - 2} rx={6} fill="#0d0d18" stroke={group.color} strokeOpacity={0.6} />
            {rect.w > 60 && (
              <text x={rect.x + 8} y={rect.y + 14} className="hs-group" fill={group.color}>
                {group.label}
              </text>
            )}
            {cells.map(({ item: f, rect: r }) => {
              const active = selected === f.path || hover === f.path;
              return (
                <g
                  key={f.path}
                  onMouseEnter={() => setHover(f.path)}
                  onMouseLeave={() => setHover(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(f.path);
                  }}
                  className="hs-cell"
                >
                  <rect
                    x={r.x + 1}
                    y={r.y + 1}
                    width={Math.max(r.w - 2, 0)}
                    height={Math.max(r.h - 2, 0)}
                    rx={3}
                    fill={heatColor(f.hotspot)}
                    stroke={active ? "#fff" : "#07070d"}
                    strokeWidth={active ? 2 : 1}
                    opacity={selected && selected !== f.path ? 0.45 : 1}
                  />
                  {r.w > 70 && r.h > 22 && (
                    <text x={r.x + 6} y={r.y + 15} className="hs-label">
                      {f.name.length * 6.6 > r.w - 10 ? f.name.slice(0, Math.max(3, Math.floor((r.w - 16) / 6.6))) + "…" : f.name}
                    </text>
                  )}
                  {r.w > 70 && r.h > 38 && f.history && (
                    <text x={r.x + 6} y={r.y + 30} className="hs-sub">
                      {f.history.commits}번 · {f.lines}줄
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        ))}
      </svg>
      {tipFile && (
        <div className="hs-tip">
          <b>{tipFile.path}</b>
          <span>
            {tipFile.lines}줄 · 함수 {tipFile.functions}
            {tipFile.history ? ` · ${tipFile.history.commits}번 변경 · 작성자 ${tipFile.history.authors}명` : " · 변경 기록 없음"}
          </span>
        </div>
      )}
    </div>
  );
}
