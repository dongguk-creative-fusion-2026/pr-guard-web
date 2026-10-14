"use client";

import { useState } from "react";
import type { SelectedTestClass, SelectionReasonKind, TestSelection, TestSelectionChange } from "@/lib/api";
import { packageOf, seconds, simpleName, type ClassResult } from "@/lib/testSelection";
import { TestFlow } from "./TestFlow";
import type { MutationData } from "@/lib/trust";

/** 바뀐 메서드가 테스트에 어떻게 닿는지 */
const REACH_META: Record<TestSelectionChange["reach"], { label: string; tone: string }> = {
  TRACED: { label: "기록상 지나감", tone: "run" },
  STATIC: { label: "호출 그래프로만", tone: "static" },
  NONE: { label: "닿는 테스트 없음", tone: "none" },
  OUTSIDE: { label: "테스트 밖에서 실행", tone: "warn" },
  UNTRACKED: { label: "기록 못 하는 위치", tone: "warn" },
};

const REASON_META: Record<SelectionReasonKind, { label: string; tone: string }> = {
  TRACE: { label: "기록", tone: "run" },
  STATIC: { label: "호출 그래프", tone: "static" },
  CHANGED_TEST: { label: "바뀐 테스트", tone: "changed" },
  UNKNOWN: { label: "기록에 없음", tone: "unknown" },
  NO_IMPACT: { label: "영향 없음", tone: "none" },
};

type Tab = "run" | "skipped" | "all";

export function TestSelectionView({
  selection,
  results,
  missed,
  executed,
  reviewId,
  live,
  mutation,
  trust,
}: {
  selection: TestSelection;
  results: Record<string, ClassResult>;
  /** 그림자 모드에서 걸렀을 테스트가 실패한 것 */
  missed: string[] | null;
  /** base · head 테스트 실행이 끝났나 */
  executed: boolean;
  reviewId: number;
  /** 리뷰가 아직 진행 중: 장면이 실제 단계를 따라간다 */
  live: boolean;
  mutation: MutationData | null;
  /** 테스트 신뢰도 섹션 (서버에서 만든다) */
  trust?: React.ReactNode;
}) {
  const [hover, setHover] = useState<{ method?: string; test?: string } | null>(null);
  const [tab, setTab] = useState<Tab>("run");
  const [query, setQuery] = useState("");

  const s = selection;
  const full = s.mode === "FULL";
  const skippedCount = s.total - s.run;
  // 그림자 · 전체 실행이면 "골랐다면" 기준으로 보여 준다
  const wouldRun = s.shadow || full ? s.impacted : s.run;
  const wouldSkip = s.total - wouldRun;
  const savedRatio = s.referenceSeconds > 0 ? s.skippedSeconds / s.referenceSeconds : 0;

  // 전체 실행 · 그림자 모드면 모두 돌았으니 "영향 있음 / 없음"으로 나눈다
  const byImpact = full || s.shadow;
  const inRun = (t: SelectedTestClass) => (byImpact ? t.impacted : t.run);
  const counts = { run: s.tests.filter(inRun).length, skipped: s.tests.filter((t) => !inRun(t)).length, all: s.tests.length };
  const tabLabel = { run: byImpact ? "영향 있음" : "실행", skipped: byImpact ? "영향 없음" : "걸러짐", all: "전체" };
  const shown = s.tests.filter((t) => {
    if (tab === "run" && !inRun(t)) return false;
    if (tab === "skipped" && inRun(t)) return false;
    return !query || t.className.toLowerCase().includes(query.toLowerCase());
  });

  return (
    <div className="ts">
      <section className="ts-map-wrap" aria-label="테스트 실행 장면">
        <header className="ts-sec-head">
          <h2>바뀐 메서드 → {full || s.shadow ? "영향 있는 테스트" : "실행한 테스트"}</h2>
        </header>
        <TestFlow selection={s} results={results} reviewId={reviewId} live={live} mutation={mutation} />
        <details className="ts-map-fold">
          <summary>연결만 정리해서 보기</summary>
          <ImpactMap
            selection={s}
            results={results}
            hover={hover}
            setHover={setHover}
            onSkipped={() => setTab("skipped")}
            pileLabel={full || s.shadow ? "영향 없는 테스트" : "걸러진 테스트"}
          />
        </details>
      </section>
      <section className="ts-summary" aria-label="테스트 선택 요약">
        <div className="ts-mode">
          <span className={`ts-mode-chip ${full ? "full" : s.shadow ? "shadow" : "selected"}`}>
            {full ? "전체 실행" : s.shadow ? "그림자 모드" : "선택 실행"}
          </span>
          <p>
            {full
              ? "영향 범위를 확정할 수 없는 변경이 있어 전체 테스트를 돌렸습니다."
              : s.shadow
                ? "전체 테스트를 돌리면서, 골랐다면 무엇을 걸렀을지 함께 기록했습니다."
                : "이번 PR 이 바꾼 코드를 지나가는 테스트만 base · head 에서 똑같이 돌렸습니다."}
          </p>
        </div>

        <div className="ts-stats">
          <div>
            <b>{s.total}</b>
            <span>테스트 클래스</span>
          </div>
          <div className="run">
            <b>{wouldRun}</b>
            <span>{full || s.shadow ? "영향 있음" : "실행"}</span>
          </div>
          <div className="skip">
            <b>{wouldSkip}</b>
            <span>{full || s.shadow ? "거를 수 있었음" : "걸러짐"}</span>
          </div>
          <div>
            <b>{s.referenceSeconds > 0 ? seconds(s.shadow || full ? sumSeconds(s.tests, (t) => !t.impacted) : s.skippedSeconds) : "–"}</b>
            <span>
              {full || s.shadow ? "아낄 수 있었던 시간" : "아낀 시간"}
              {s.referenceSeconds > 0 ? ` (기록 ${seconds(s.referenceSeconds)} 중)` : " (기록에 시간 없음)"}
            </span>
          </div>
        </div>

        {s.total > 0 && (
          <div className="ts-bar" role="img" aria-label={`테스트 클래스 ${s.total}개 중 ${wouldRun}개 영향, ${wouldSkip}개 거름`}>
            <i className="run" style={{ flex: Math.max(wouldRun, 0.0001) }} />
            <i className="skip" style={{ flex: Math.max(wouldSkip, 0.0001) }} />
          </div>
        )}
        {savedRatio > 0 && !full && !s.shadow && (
          <p className="ts-note">기준 기록의 테스트 시간 중 {Math.round(savedRatio * 100)}% 를 돌리지 않았습니다.</p>
        )}

        {s.shadow && missed && (
          <p className={`ts-verify ${missed.length > 0 ? "bad" : "ok"}`}>
            {missed.length > 0
              ? `걸렀을 테스트 중 ${missed.length}개가 실패했습니다. 선택 규칙을 보완해야 합니다: ${missed.slice(0, 3).join(", ")}`
              : executed
                ? "확인: 걸렀을 테스트에서 실패가 하나도 나오지 않았습니다 (선택이 놓친 회귀 0)."
                : "실행이 끝나면 걸렀을 테스트에서 실패가 있었는지 확인합니다."}
          </p>
        )}
        {!s.shadow && !full && skippedCount > 0 && (
          <p className="ts-note">
            걸러진 {skippedCount}개는 기준 기록에서 이번에 바뀐 메서드를 한 번도 지나가지 않았고, 호출 그래프로도 닿지 않는 테스트입니다.
          </p>
        )}

        {full && s.fullReasons.length > 0 && (
          <div className="ts-full">
            <h3>전체를 돌린 이유</h3>
            <ul>
              {s.fullReasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            {s.impacted > 0 && <p className="ts-note">이 변경들이 없었다면 {s.total}개 중 {s.impacted}개만 돌렸을 것입니다.</p>}
          </div>
        )}

        {s.reference ? (
          <p className="ts-ref">
            기준 기록: 실행 #{s.reference.runId}
            {s.reference.prNumber != null && <> (PR #{s.reference.prNumber})</>} · 커밋 <code>{s.reference.sha.slice(0, 7)}</code>
            {s.reference.sameAsBase ? " · 이번 base 와 같은 커밋" : " · 이번 base 와 다른 커밋"}
            {s.reference.tests > 0 && <> · 테스트 {s.reference.tests}개</>}
          </p>
        ) : (
          <p className="ts-ref">기준 기록 없음: 이번 전체 실행이 다음 PR 의 기준이 됩니다.</p>
        )}
      </section>


      {trust}

      <section className="ts-list" aria-label="테스트 클래스 목록">
        <header className="ts-sec-head">
          <div className="ts-tabs" role="tablist">
            {(["run", "skipped", "all"] as Tab[]).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
                {tabLabel[t]} <span>{counts[t]}</span>
              </button>
            ))}
          </div>
          <input
            type="search"
            className="ts-search"
            placeholder="클래스 이름"
            aria-label="테스트 클래스 찾기"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </header>
        {shown.length === 0 ? (
          <p className="ts-empty">{tab === "skipped" ? `${tabLabel.skipped} 테스트가 없습니다` : "해당하는 테스트가 없습니다"}</p>
        ) : (
          <ul className="ts-rows">
            {shown.map((t) => (
              <TestRow key={t.className} test={t} result={results[t.className]} executed={executed} />
            ))}
          </ul>
        )}
        {s.tests.length < s.total && <p className="ts-note">단계 기록에는 {s.tests.length}개까지만 실었습니다.</p>}
      </section>
    </div>
  );
}

function sumSeconds(tests: SelectedTestClass[], pick: (t: SelectedTestClass) => boolean): number {
  return tests.filter(pick).reduce((a, t) => a + t.seconds, 0);
}

function ResultBadge({ result, executed, run }: { result: ClassResult | undefined; executed: boolean; run: boolean }) {
  if (!run) return <span className="ts-res none">돌리지 않음</span>;
  if (!executed) return <span className="ts-res none">실행 전</span>;
  if (!result || (!result.head && !result.base)) return <span className="ts-res none">결과 없음</span>;
  if (result.regressions.length > 0) return <span className="ts-res bad">회귀 {result.regressions.length}</span>;
  if (result.newFailures.length > 0) return <span className="ts-res warn">새 실패 {result.newFailures.length}</span>;
  const h = result.head;
  if (h && h.failed > 0) return <span className="ts-res warn">실패 {h.failed} (base 도 실패)</span>;
  return <span className="ts-res ok">통과 {h?.passed ?? result.base?.passed ?? 0}</span>;
}

function TestRow({ test, result, executed }: { test: SelectedTestClass; result: ClassResult | undefined; executed: boolean }) {
  const kinds = [...new Set(test.reasons.map((r) => r.kind))];
  return (
    <li className={`ts-row ${test.run ? "run" : "skip"}`}>
      <span className="ts-dot" aria-hidden="true" />
      <div className="ts-row-main">
        <div className="ts-row-name">
          <b className="mono">{simpleName(test.className)}</b>
          <span className="ts-pkg mono">{packageOf(test.className)}</span>
        </div>
        <div className="ts-row-why">
          {kinds.map((k) => (
            <span key={k} className={`ts-chip ${REASON_META[k].tone}`}>
              {REASON_META[k].label}
            </span>
          ))}
          <span className="ts-why-text">
            {test.reasons
              .slice(0, 3)
              .map((r) => r.detail)
              .join(" · ")}
            {test.reasons.length > 3 && ` 외 ${test.reasons.length - 3}`}
          </span>
        </div>
      </div>
      <div className="ts-row-side">
        <ResultBadge result={result} executed={executed} run={test.run} />
        {test.seconds > 0 && <span className="ts-time mono">{seconds(test.seconds)}</span>}
      </div>
    </li>
  );
}

const ROW = 44;
const MAX_LEFT = 40;
const MAX_RIGHT = 60;

/**
 * 바뀐 메서드(왼쪽) → 영향 있는 테스트 클래스(오른쪽)를 선으로 잇는다. 실선 = 기록상 지나감, 점선 = 호출 그래프.
 * 걸러진 테스트는 오른쪽 맨 아래 한 덩어리로.
 */
function ImpactMap({
  selection,
  results,
  hover,
  setHover,
  onSkipped,
  pileLabel,
}: {
  selection: TestSelection;
  results: Record<string, ClassResult>;
  hover: { method?: string; test?: string } | null;
  setHover: (h: { method?: string; test?: string } | null) => void;
  onSkipped: () => void;
  pileLabel: string;
}) {
  const left = selection.changes.slice(0, MAX_LEFT);
  const impacted = selection.tests.filter((t) => t.impacted).slice(0, MAX_RIGHT);
  const skipped = selection.tests.filter((t) => !t.impacted).length;

  const edges: { method: string; test: string; kind: "TRACE" | "STATIC" }[] = [];
  for (const c of left) {
    for (const name of c.tests) {
      const t = impacted.find((x) => x.className === name);
      if (!t) continue;
      const r = t.reasons.find((x) => x.target === c.id && (x.kind === "TRACE" || x.kind === "STATIC"));
      edges.push({ method: c.id, test: name, kind: r?.kind === "STATIC" ? "STATIC" : "TRACE" });
    }
  }

  const rightRows = impacted.length + (skipped > 0 ? 1 : 0);
  const rows = Math.max(left.length, rightRows, 1);
  const height = rows * ROW;
  const leftOffset = ((rows - left.length) * ROW) / 2;
  const rightOffset = ((rows - rightRows) * ROW) / 2;
  const yLeft = (i: number) => leftOffset + i * ROW + ROW / 2;
  const yRight = (i: number) => rightOffset + i * ROW + ROW / 2;

  const active = (m: string, t: string) => !hover || hover.method === m || hover.test === t;
  const methodLit = (id: string) => !hover || hover.method === id || (hover.test != null && edges.some((e) => e.method === id && e.test === hover.test));
  const testLit = (name: string) => !hover || hover.test === name || (hover.method != null && edges.some((e) => e.test === name && e.method === hover.method));

  if (left.length === 0 && impacted.length === 0) {
    return <p className="ts-empty">바뀐 메서드도, 영향 있는 테스트도 없습니다.</p>;
  }

  const partial = selection.changes.length > MAX_LEFT || selection.tests.filter((t) => t.impacted).length > MAX_RIGHT;
  return (
    <>
    <div className="ts-map" style={{ height }} onMouseLeave={() => setHover(null)}>
      <ol className="ts-col left">
        {left.length === 0 && (
          <li className="ts-node muted" style={{ top: rows * ROW / 2 - ROW / 2, height: ROW }}>
            바뀐 메서드 없음 (테스트 · 설정만 바뀜)
          </li>
        )}
        {left.map((c, i) => (
          <li key={c.id} style={{ top: yLeft(i) - ROW / 2, height: ROW }}>
            <button
              type="button"
              className={`ts-node method ${REACH_META[c.reach].tone}${methodLit(c.id) ? "" : " dim"}`}
              onMouseEnter={() => setHover({ method: c.id })}
              onFocus={() => setHover({ method: c.id })}
              onBlur={() => setHover(null)}
              title={`${c.file}:${c.line}`}
            >
              <span className="mono ts-node-label">{c.id}</span>
              <span className="ts-node-sub">
                {c.kind === "ADDED" ? "추가" : c.kind === "REMOVED" ? "삭제" : "수정"} · {REACH_META[c.reach].label}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <svg className="ts-lines" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden="true">
        {edges.map((e) => {
          const i = left.findIndex((c) => c.id === e.method);
          const j = impacted.findIndex((t) => t.className === e.test);
          const y1 = yLeft(i);
          const y2 = yRight(j);
          return (
            <path
              key={`${e.method}->${e.test}`}
              d={`M0 ${y1} C 50 ${y1}, 50 ${y2}, 100 ${y2}`}
              className={`${e.kind === "STATIC" ? "static" : "run"}${active(e.method, e.test) ? "" : " dim"}`}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>

      <ol className="ts-col right">
        {impacted.map((t, j) => {
          const r = results[t.className];
          const bad = r && (r.regressions.length > 0 || r.newFailures.length > 0);
          const tag = t.reasons.find((x) => x.kind === "CHANGED_TEST" || x.kind === "UNKNOWN");
          return (
            <li key={t.className} style={{ top: yRight(j) - ROW / 2, height: ROW }}>
              <button
                type="button"
                className={`ts-node test${bad ? " bad" : ""}${testLit(t.className) ? "" : " dim"}`}
                onMouseEnter={() => setHover({ test: t.className })}
                onFocus={() => setHover({ test: t.className })}
                onBlur={() => setHover(null)}
                title={t.className}
              >
                <span className="mono ts-node-label">{simpleName(t.className)}</span>
                <span className="ts-node-sub">
                  {tag ? REASON_META[tag.kind].label : `${t.reasons.length}개 메서드에 닿음`}
                  {bad ? " · 회귀" : ""}
                </span>
              </button>
            </li>
          );
        })}
        {skipped > 0 && (
          <li style={{ top: yRight(impacted.length) - ROW / 2, height: ROW }}>
            <button type="button" className={`ts-node pile${hover ? " dim" : ""}`} onClick={onSkipped}>
              <span className="ts-node-label">
                {pileLabel} {skipped}개
              </span>
              <span className="ts-node-sub">바뀐 메서드에 닿지 않음 · 목록 보기</span>
            </button>
          </li>
        )}
      </ol>
    </div>
    {partial && <p className="ts-note">일부만 그렸습니다. 전체는 아래 목록에 있습니다.</p>}
    </>
  );
}
