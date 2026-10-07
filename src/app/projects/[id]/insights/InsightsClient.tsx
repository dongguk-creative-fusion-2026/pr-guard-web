"use client";

import dynamic from "next/dynamic";

// three.js(WebGL)와 현재 시각 계산이 있어서 브라우저에서만 그린다
export const InsightsClient = dynamic(() => import("@/components/insights/InsightsView").then((m) => m.InsightsView), {
  ssr: false,
  loading: () => <div className="gx gx-loading">코드 시티 짓는 중…</div>,
});
