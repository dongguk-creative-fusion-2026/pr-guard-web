"use client";

import { useMemo, useState } from "react";
import type { Coupling, Insights } from "./metrics";

const SIZE = 860;
const C = SIZE / 2;
const R = 300;
const HIDDEN = "#f472b6";
const LINKED = "#6366f1";

/**
 * 숨은 결합 원형 다이어그램: 파일을 기능 묶음 순서로 원 둘레에 놓고, 같이 바뀌는 파일끼리 곡선으로 잇는다.
 * 코드 의존이 없는데 같이 바뀌는 쌍(숨은 결합)은 분홍, 의존이 있는 쌍은 흐린 보라.
 */
export function CouplingWheel({
  insights,
  selected,
  onSelect,
  hiddenOnly,
  couplings,
}: {
  insights: Insights;
  selected: string | null;
  onSelect: (path: string | null) => void;
  hiddenOnly: boolean;
  /** 그릴 결합 (기본은 강한 쌍만) */
  couplings: Coupling[];
}) {
  const [hover, setHover] = useState<string | null>(null);
  const focus = hover ?? selected;

  const layout = useMemo(() => {
    // 결합이 있는 파일만 원에 올린다 (없는 파일까지 올리면 이름이 겹친다)
    const involved = new Set(couplings.flatMap((c) => [c.a, c.b]));
    const order = insights.groups.flatMap((g) => g.files.filter((f) => involved.has(f.path)).sort((a, b) => a.path.localeCompare(b.path)));
    const gap = 0.04; // 묶음 사이 빈 각도
    const groupsUsed = [...new Set(order.map((f) => f.group))];
    const step = (Math.PI * 2 - gap * groupsUsed.length) / Math.max(order.length, 1);
    const pos = new Map<string, { angle: number; x: number; y: number }>();
    const arcs: { label: string; color: string; start: number; end: number }[] = [];
    let angle = -Math.PI / 2;
    for (const g of groupsUsed) {
      const files = order.filter((f) => f.group === g);
      const start = angle;
      for (const f of files) {
        const a = angle + step / 2;
        pos.set(f.path, { angle: a, x: C + R * Math.cos(a), y: C + R * Math.sin(a) });
        angle += step;
      }
      arcs.push({ label: g, color: files[0].color, start, end: angle });
      angle += gap;
    }
    return { order, pos, arcs };
  }, [insights, couplings]);

  const maxSupport = Math.max(1, ...couplings.map((c) => c.support));
  const links = couplings.filter((c) => !hiddenOnly || !c.linked);
  // 강조할 링크를 위에 그린다
  const sorted = [...links].sort((a, b) => Number(!a.linked) - Number(!b.linked) || a.support - b.support);

  if (layout.order.length === 0) {
    return <div className="cw-empty">같이 바뀐 파일 쌍이 없어요 (커밋이 적거나 이력이 없는 그래프예요)</div>;
  }

  const arcPath = (start: number, end: number, r: number) => {
    const x1 = C + r * Math.cos(start);
    const y1 = C + r * Math.sin(start);
    const x2 = C + r * Math.cos(end);
    const y2 = C + r * Math.sin(end);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${end - start > Math.PI ? 1 : 0} 1 ${x2} ${y2}`;
  };

  return (
    <div className="cw-wrap" onClick={() => onSelect(null)}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="cw-svg">
        <defs>
          <radialGradient id="cw-glow">
            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
          </radialGradient>
        </defs>
        <circle cx={C} cy={C} r={R} fill="url(#cw-glow)" />
        {layout.arcs.map((a) => (
          <g key={a.label}>
            <path d={arcPath(a.start, a.end, R + 10)} stroke={a.color} strokeWidth={6} fill="none" strokeLinecap="round" opacity={0.85} />
          </g>
        ))}
        {sorted.map((c) => {
          const p = layout.pos.get(c.a);
          const q = layout.pos.get(c.b);
          if (!p || !q) return null;
          const on = focus === null || focus === c.a || focus === c.b;
          // 원 중심 쪽으로 휘는 곡선 (두 점이 가까우면 덜 휜다)
          const mx = (p.x + q.x) / 2;
          const my = (p.y + q.y) / 2;
          const k = 0.25;
          const cx = mx + (C - mx) * (1 - k);
          const cy = my + (C - my) * (1 - k);
          return (
            <path
              key={`${c.a}|${c.b}`}
              d={`M ${p.x} ${p.y} Q ${cx} ${cy} ${q.x} ${q.y}`}
              stroke={c.linked ? LINKED : HIDDEN}
              strokeWidth={1 + (c.support / maxSupport) * 5}
              strokeOpacity={on ? (c.linked ? 0.35 : 0.9) : 0.05}
              fill="none"
              className={c.linked ? "" : "cw-hidden"}
            />
          );
        })}
        {layout.order.map((f) => {
          const p = layout.pos.get(f.path)!;
          const deg = (p.angle * 180) / Math.PI;
          const flip = deg > 90 && deg < 270;
          const lx = C + (R + 22) * Math.cos(p.angle);
          const ly = C + (R + 22) * Math.sin(p.angle);
          const active = focus === f.path;
          const related = focus !== null && couplings.some((c) => (c.a === focus && c.b === f.path) || (c.b === focus && c.a === f.path));
          return (
            <g
              key={f.path}
              onMouseEnter={() => setHover(f.path)}
              onMouseLeave={() => setHover(null)}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(f.path);
              }}
              className="cw-node"
            >
              <circle cx={p.x} cy={p.y} r={active ? 6 : 4} fill={f.color} stroke="#07070d" />
              <text
                x={lx}
                y={ly}
                transform={`rotate(${flip ? deg + 180 : deg} ${lx} ${ly})`}
                textAnchor={flip ? "end" : "start"}
                dominantBaseline="middle"
                className={`cw-label${active ? " active" : related ? " related" : focus ? " dim" : ""}`}
              >
                {f.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
