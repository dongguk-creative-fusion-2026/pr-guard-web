"use client";

import dynamic from "next/dynamic";
import { useMemo, type ReactNode } from "react";
import { computeImpact } from "@/components/graph/impact";
import type { AnalysisContext, Finding, GraphData } from "@/lib/api";

// sigma 는 WebGL 이라 브라우저에서만 그린다
const GraphExplorer = dynamic(() => import("@/components/graph/GraphExplorer").then((m) => m.GraphExplorer), {
  ssr: false,
  loading: () => <div className="gx gx-loading">영향 범위 계산 중…</div>,
});

type Props = {
  data: GraphData;
  context: AnalysisContext | null;
  findings: Finding[];
  title: string;
  subtitle: string;
  backHref: string;
  fontFamily: string;
  initialFile?: string;
  header: ReactNode;
};

/** 영향 계산 결과(Map)는 서버에서 넘기지 않고 여기서 만든다 */
export function ImpactView({ data, context, findings, header, ...rest }: Props) {
  const impact = useMemo(() => computeImpact(data, context, findings), [data, context, findings]);
  return <GraphExplorer data={data} impact={impact} impactHeader={header} {...rest} />;
}
