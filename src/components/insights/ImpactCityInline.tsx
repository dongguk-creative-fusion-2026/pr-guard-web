"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { AnalysisContext, Finding, GraphData } from "@/lib/api";
import { CodeCity, LEVEL_COLORS } from "./CodeCity";
import { computeInsights } from "./metrics";
import { useCityImpact } from "./useCityImpact";

/** 옆 영향 범위 카드는 함수 수라서, 여기는 파일 수임을 이름에 밝힌다 */
const LEVEL_LABEL = ["바뀐 파일", "직접 영향 파일", "간접 영향 파일"] as const;

type Props = { data: GraphData; context: AnalysisContext | null; findings: Finding[]; href: string };

/** PR 판단 화면 안의 영향 시티: 프로젝트 구조 위에 이 PR 이 바꾼 건물과 영향이 번지는 건물 */
export function ImpactCityInline({ data, context, findings, href }: Props) {
  const insights = useMemo(() => computeInsights(data), [data]);
  const { impact, cityImpact, replay } = useCityImpact(data, context, findings);
  const counts = [0, 1, 2].map((level) => [...impact.files.values()].filter((f) => f.level === level).length);

  return (
    <section className="dv-city">
      <header>
        <h3>영향 시티</h3>
        <div className="dv-city-legend">
          {LEVEL_LABEL.map((l, i) => (
            <span key={l}>
              <i style={{ background: LEVEL_COLORS[i] }} />
              {l} <b>{counts[i]}</b>
            </span>
          ))}
        </div>
        <button onClick={replay}>다시 재생</button>
        <Link href={href}>크게 보기</Link>
      </header>
      <div className="dv-city-stage">
        <CodeCity insights={insights} mode="structure" selected={null} onSelect={() => {}} impact={cityImpact} embedded />
      </div>
    </section>
  );
}
