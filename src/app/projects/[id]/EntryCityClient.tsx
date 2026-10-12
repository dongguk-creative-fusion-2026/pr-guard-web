"use client";

import dynamic from "next/dynamic";

// three.js(WebGL)라 브라우저에서만 그린다
export const EntryCityClient = dynamic(() => import("@/components/insights/EntryCity").then((m) => m.EntryCity), {
  ssr: false,
  loading: () => null,
});
