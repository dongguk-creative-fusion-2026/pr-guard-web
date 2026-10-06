"use client";

import dynamic from "next/dynamic";

// sigma 는 WebGL 이라 브라우저에서만 그린다
export const GraphView = dynamic(() => import("@/components/graph/GraphExplorer").then((m) => m.GraphExplorer), {
  ssr: false,
  loading: () => <div className="gx gx-loading">그래프 배치 중…</div>,
});
