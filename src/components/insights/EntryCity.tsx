"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { GraphData } from "@/lib/api";
import { CodeCity } from "./CodeCity";
import { computeInsights } from "./metrics";

/** 입구 도시에 표시할 PR: 그 PR 이 바꾼 파일과 판정 색 */
export type EntryMark = { number: number; title: string; color: string; files: string[] };

/**
 * 프로젝트 입구의 바닥 층: 프로젝트 구조대로 지은 코드 시티 위에 사람이 볼 PR 이 건드린 건물을 판정 색으로 세운다.
 * 표시된 건물을 누르면 그 PR, 나머지는 코드 시티에서 그 파일
 */
export function EntryCity({ data, projectId, marks }: { data: GraphData; projectId: number; marks: EntryMark[] }) {
  const router = useRouter();
  const insights = useMemo(() => computeInsights(data), [data]);
  const [hovered, setHovered] = useState<string | null>(null);
  // 파일 → 그 파일을 건드린 PR 들 (marks 는 급한 순이라 첫 PR 색을 쓴다)
  const byFile = useMemo(() => {
    const map = new Map<string, EntryMark[]>();
    for (const m of marks) for (const f of m.files) if (insights.byPath.has(f)) map.set(f, [...(map.get(f) ?? []), m]);
    return map;
  }, [marks, insights]);
  const cityMarks = useMemo(
    () => new Map([...byFile.entries()].map(([f, ms]) => [f, { color: ms[0].color, badge: ms.length }])),
    [byFile],
  );
  const hoveredPrs = hovered ? (byFile.get(hovered) ?? []) : [];

  return (
    <>
      <CodeCity
        insights={insights}
        mode="structure"
        selected={null}
        onSelect={(path) => {
          if (!path) return;
          const pr = byFile.get(path)?.[0];
          router.push(pr ? `/projects/${projectId}/prs/${pr.number}` : `/projects/${projectId}/commits?file=${encodeURIComponent(path)}`);
        }}
        marks={cityMarks}
        onHover={setHovered}
        shift={0.22}
      />
      {hovered && (
        <div className="en-hover">
          <b className="mono">{insights.byPath.get(hovered)?.name ?? hovered}</b>
          <span>{insights.byPath.get(hovered)?.district}</span>
          {hoveredPrs.map((p) => (
            <span key={p.number} className="en-hover-pr">
              <i style={{ background: p.color }} />#{p.number} {p.title}
            </span>
          ))}
        </div>
      )}
    </>
  );
}
