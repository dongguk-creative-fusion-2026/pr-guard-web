"use client";

import dynamic from "next/dynamic";

// three.js(WebGL)라 브라우저에서만 그린다
export const ImpactCityInlineClient = dynamic(() => import("@/components/insights/ImpactCityInline").then((m) => m.ImpactCityInline), {
  ssr: false,
  loading: () => <div className="dv-city dv-city-loading" />,
});
