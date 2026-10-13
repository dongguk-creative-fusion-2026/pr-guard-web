"use client";

import type { ShowPhase, ShowState } from "./reviewShow";

const STEPS: { phase: ShowPhase; label: string }[] = [
  { phase: "collect", label: "시작" },
  { phase: "scan", label: "코드 읽기" },
  { phase: "impact", label: "영향 추적" },
  { phase: "threat", label: "보안 위협" },
  { phase: "ground", label: "근거 확인" },
  { phase: "verdict", label: "판정" },
];

const TONE: Record<string, string> = { MERGEABLE: "ok", NEEDS_CHANGES: "warn", NOT_RECOMMENDED: "bad" };

/** 리뷰 장면 자막: 지금 무엇을 하는지 한 줄과 단계 진행 */
export function ShowCaption({ show, title }: { show: ShowState; title?: string }) {
  if (!show.phase) return null;
  const at = STEPS.findIndex((s) => s.phase === show.phase);
  const steps = STEPS.filter((s) => s.phase !== "threat" || show.threats.length > 0);
  const tone = show.phase === "threat" ? "bad" : show.phase === "verdict" && show.verdict ? TONE[show.verdict] : "";
  return (
    <div className="show-cap">
      <div className="show-cap-head">
        {show.live && <span className="show-live">LIVE</span>}
        {title && <span className="show-title">{title}</span>}
      </div>
      <p className={`show-line ${tone}`}>{show.caption}</p>
      <ol className="show-steps">
        {steps.map((s) => {
          const i = STEPS.indexOf(s);
          return (
            <li key={s.phase} className={i < at ? "done" : i === at ? "now" : ""}>
              {s.label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
