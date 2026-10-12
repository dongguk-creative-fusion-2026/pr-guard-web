"use client";

import dynamic from "next/dynamic";

// three.js(WebGL)라 브라우저에서만 그린다
export const LayersClient = dynamic(() => import("@/components/layers/GroundLayersView").then((m) => m.GroundLayersView), {
  ssr: false,
  loading: () => <div className="gx gx-loading">근거 층 쌓는 중…</div>,
});
