"use client";

import dynamic from "next/dynamic";

// three.js(WebGL)라 브라우저에서만 그린다
export const CityClient = dynamic(() => import("@/components/insights/ImpactCityView").then((m) => m.ImpactCityView), {
  ssr: false,
  loading: () => <div className="gx gx-loading">영향 시티 짓는 중…</div>,
});
