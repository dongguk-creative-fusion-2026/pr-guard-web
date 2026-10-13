"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { AnalysisContext, Finding, GraphData } from "@/lib/api";
import { ReviewShowScene, showImpact } from "./actors/ReviewShowScene";
import { useReviewShow } from "./actors/reviewShow";
import { ShowCaption } from "./actors/ShowCaption";
import { CodeCity, LEVEL_COLORS } from "./CodeCity";
import { computeInsights } from "./metrics";

type Props = {
  data: GraphData;
  reviewId: number;
  prNumber: number;
  context: AnalysisContext | null;
  findings: Finding[];
  href: string;
};

/**
 * PR 판단 화면 안의 영향 시티: 이 PR 의 리뷰를 도시 위 장면으로 다시 보여 준다.
 * AI 리뷰어가 바뀐 건물을 읽고 영향을 따라간 뒤, 보안 위협이 있으면 해커 홀로그램과 방어막으로 근거 확인 결과를 보여 준다
 */
export function ImpactCityInline({ data, reviewId, prNumber, context, findings, href }: Props) {
  const insights = useMemo(() => computeInsights(data), [data]);
  const changed = useMemo(() => (context ? (context.files ?? context.history).map((f) => ("path" in f ? f.path : f.file)) : []), [context]);
  const [round, setRound] = useState(0);
  const show = useReviewShow({ reviewId, prNumber, changed, findings, round });
  const counts = [show.changed.length, show.impacted.length];

  return (
    <section className="dv-city">
      <header>
        <h3>영향 시티</h3>
        <div className="dv-city-legend">
          {["바뀐 파일", "영향받는 파일"].map((l, i) => (
            <span key={l}>
              <i style={{ background: LEVEL_COLORS[i] }} />
              {l} <b>{counts[i]}</b>
            </span>
          ))}
          {show.threats.length > 0 && (
            <span>
              <i style={{ background: "#ff2236" }} />
              보안 위협 <b>{show.threats.length}</b>
            </span>
          )}
        </div>
        <button onClick={() => setRound((r) => r + 1)}>다시 재생</button>
        <Link href={href}>크게 보기</Link>
      </header>
      <div className="dv-city-stage">
        <CodeCity
          insights={insights}
          mode="structure"
          selected={null}
          onSelect={() => {}}
          impact={showImpact(show, insights.byPath)}
          embedded
          wide
          scene={(city) => <ReviewShowScene show={show} {...city} hackerX={-0.35} />}
        />
        <ShowCaption show={show} />
      </div>
    </section>
  );
}
