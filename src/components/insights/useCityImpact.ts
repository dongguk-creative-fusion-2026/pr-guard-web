import { useEffect, useMemo, useState } from "react";
import { computeImpact } from "@/components/graph/impact";
import type { AnalysisContext, Finding, GraphData } from "@/lib/api";
import type { CityImpact } from "./CodeCity";

const REVEAL_MS = [500, 1300, 2100];

/** PR 영향을 코드 시티에 얹을 값: 바뀐 파일 → 직접 → 간접 순서로 드러난다. replay() 로 다시 재생 */
export function useCityImpact(data: GraphData, context: AnalysisContext | null, findings: Finding[]) {
  const impact = useMemo(() => computeImpact(data, context, findings), [data, context, findings]);
  const [reveal, setReveal] = useState(-1);
  const [round, setRound] = useState(0);

  useEffect(() => {
    setReveal(-1);
    const timers = REVEAL_MS.map((ms, level) => setTimeout(() => setReveal(level), ms));
    return () => timers.forEach(clearTimeout);
  }, [round]);

  const cityImpact: CityImpact = useMemo(() => {
    const levels = new Map<string, 0 | 1 | 2>();
    const counts = new Map<string, number>();
    for (const [path, info] of impact.files) {
      levels.set(path, info.level);
      if (info.findings.length > 0) counts.set(path, info.findings.length);
    }
    // 영향이 전달되는 파일 쌍: 한 단계 바깥 파일이 안쪽 파일을 쓴다
    const links: CityImpact["links"] = [];
    for (const e of data.edges) {
      const a = levels.get(e.source);
      const b = levels.get(e.target);
      if (a !== undefined && b !== undefined && a === b + 1 && a > 0) links.push({ from: e.source, to: e.target, level: a as 1 | 2 });
    }
    return { levels, reveal, findings: counts, links };
  }, [impact, data.edges, reveal]);

  return { impact, cityImpact, replay: () => setRound((r) => r + 1) };
}
