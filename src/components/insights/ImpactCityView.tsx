"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { worstSeverity } from "@/components/graph/impact";
import type { AnalysisContext, Finding, GraphData } from "@/lib/api";
import { CodeCity, LEVEL_COLORS, type CityImpact } from "./CodeCity";
import { computeInsights } from "./metrics";
import { useCityImpact } from "./useCityImpact";

const LEVEL_LABEL = ["바뀐 파일", "직접 영향", "간접 영향"] as const;
const LEVEL_HINT = ["이번 PR 이 고친 파일", "바뀐 함수를 호출하는 파일", "직접 영향 파일을 호출하는 파일"] as const;

type Props = {
  data: GraphData;
  context: AnalysisContext | null;
  findings: Finding[];
  title: string;
  subtitle: string;
  backHref: string;
  impact2dHref: string;
  fontFamily: string;
  header: ReactNode;
};

/** PR 영향 시티: 바뀐 건물이 솟아 빛나고, 그 파일을 호출하는 건물로 단계별로 번진다 */
export function ImpactCityView({ data, context, findings, title, subtitle, backHref, impact2dHref, fontFamily, header }: Props) {
  const insights = useMemo(() => computeInsights(data), [data]);
  const { impact, cityImpact, replay } = useCityImpact(data, context, findings);
  const [selected, setSelected] = useState<string | null>(null);

  // 파일 단위 목록 (단계별) + 그 파일이 왜 영향을 받는지 (그 파일 함수의 첫 이유)
  const byLevel = useMemo(() => {
    const reason = new Map<string, string>();
    for (const f of impact.functions.values()) if (f.reason && !reason.has(f.file)) reason.set(f.file, f.reason);
    return [0, 1, 2].map((level) =>
      [...impact.files.values()]
        .filter((f) => f.level === level)
        .sort((a, b) => b.findings.length - a.findings.length || a.path.localeCompare(b.path))
        .map((f) => ({ ...f, name: insights.byPath.get(f.path)?.name ?? f.path, reason: reason.get(f.path) ?? null })),
    );
  }, [impact, insights]);

  const current = selected ? impact.files.get(selected) : undefined;

  return (
    <div className="gx ins" style={{ background: "#07070d", fontFamily }}>
      <header className="gx-top">
        <Link href={backHref} className="gx-back">
          ← {title}
        </Link>
        <span className="gx-sub">{subtitle}</span>
        <div className="ins-actions">
          <button onClick={replay}>↺ 다시 재생</button>
          <Link href={impact2dHref}>2D 영향 그래프</Link>
        </div>
      </header>
      <div className="gx-body">
        <div className="ins-stage">
          <div className="gx-legend-float">
            {LEVEL_LABEL.map((l, i) => (
              <span key={l}>
                <i style={{ background: LEVEL_COLORS[i] }} />
                {l}
              </span>
            ))}
          </div>
          <CodeCity insights={insights} mode="structure" selected={selected} onSelect={setSelected} impact={cityImpact} />
        </div>
        <aside className="gx-panel">
          {header && <section className="gx-impact-head">{header}</section>}
          <section>
            <div className="gx-stats">
              {byLevel.map((list, i) => (
                <div key={i}>
                  <b style={{ color: LEVEL_COLORS[i] }}>{list.length + (i === 0 ? impact.outside.length : 0)}</b>
                  <span>{LEVEL_LABEL[i]}</span>
                </div>
              ))}
            </div>
            <p className="gx-hint">건물을 누르면 그 파일이 부르는 파일 · 그 파일을 부르는 파일로 호가 떠올라요.</p>
          </section>
          {current && selected && (
            <section className="gx-detail">
              <div className="gx-detail-head">
                <span className="gx-dot" style={{ background: LEVEL_COLORS[current.level], boxShadow: `0 0 8px ${LEVEL_COLORS[current.level]}` }} />
                <b>{insights.byPath.get(selected)?.name}</b>
                <button className="gx-x" onClick={() => setSelected(null)} aria-label="선택 해제">
                  ×
                </button>
              </div>
              <p className="gx-path">{selected}</p>
              <p style={{ color: LEVEL_COLORS[current.level] }}>{LEVEL_HINT[current.level]}</p>
              {current.findings.length > 0 && (
                <ul className="gx-findings">
                  {current.findings.map((f) => (
                    <li key={f.id}>
                      <span className={`gx-sev ${f.severity}`}>{f.severity}</span> {f.title}
                    </li>
                  ))}
                </ul>
              )}
              <Link className="ins-graph-link" href={`${impact2dHref}?file=${encodeURIComponent(selected)}`}>
                2D 영향 그래프에서 보기 →
              </Link>
            </section>
          )}
          <section className="gx-impact-list">
            {byLevel.map((list, i) => (
              <div key={i}>
                <h4 style={{ color: LEVEL_COLORS[i] }}>
                  {LEVEL_LABEL[i]} <span className="gx-dim">{LEVEL_HINT[i]}</span>
                </h4>
                {list.length === 0 && (i > 0 || impact.outside.length === 0) ? (
                  <p className="gx-dim">없음</p>
                ) : (
                  <ul>
                    {list.map((f) => {
                      const worst = worstSeverity(f.findings);
                      return (
                        <li key={f.path}>
                          <button onClick={() => setSelected(f.path)} title={f.path}>
                            {f.name}
                          </button>
                          {worst && <span className={`gx-sev ${worst}`}>! {f.findings.length}</span>}
                          {i > 0 && f.reason && <span className="gx-reason">{f.reason}</span>}
                        </li>
                      );
                    })}
                    {i === 0 &&
                      impact.outside.map((c) => (
                        <li key={c.path} className="gx-outside">
                          <span>{c.path.slice(c.path.lastIndexOf("/") + 1)}</span>
                          <span className="gx-tag">{c.status === "added" ? "새 파일" : "그래프 밖"}</span>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            ))}
          </section>
        </aside>
      </div>
    </div>
  );
}
