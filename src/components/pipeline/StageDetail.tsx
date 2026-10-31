"use client";

import { motion } from "motion/react";
import { BehaviorDiffTable } from "./BehaviorDiff";
import { EvidenceVerdicts, GeneratedTests } from "./Evidence";
import { AstDiffView } from "./AstDiffView";
import { ImpactGraph } from "./ImpactGraph";
import { SonarStageDetail } from "./SonarDetail";
import { GuardDogPanel } from "@/components/guarddog/GuardDogPanel";
import { guarddogNeedsAttention } from "@/lib/guarddog";
import { LAYER_META, LAYER_ORDER, MARK_META, STATUS_META } from "@/lib/grounding";
import { countByPurpose, semgrepInfo } from "@/lib/semgrep";
import type { GroundLayerId, GroundMark, GroundStatus } from "@/lib/api";
import Link from "next/link";
import { durationMs, STAGE_META, type StageData, type StageId, type StageState } from "./stages";

type GroundView = {
  severity: string;
  title: string;
  file: string | null;
  line: number | null;
  status: GroundStatus;
  layers: { layer: GroundLayerId; mark: GroundMark; note: string }[];
};

type FindingView = {
  severity: string;
  ruleId: string;
  title: string;
  file: string | null;
  line: number | null;
  evidence?: string | null;
};

type ConflictMethodView = {
  id: string;
  file: string;
  snippets: { ref: string; role: string; side: string; symbol: string; file: string; line: number; endLine: number }[];
};

/** 기존 코드 조각 종류 (백엔드 ContractContext.Role) */
const SNIPPET_ROLE: Record<string, string> = {
  BASE_BODY: "PR 전 본문",
  DROPPED_CALLEE: "안 부르게 된 메서드",
  NEW_CALLEE: "새로 부르는 메서드",
  LOST_EXCEPTION: "이제 안 던지는 예외",
  CALLER: "부르는 곳",
  TEST: "테스트",
  RULE: "규칙 지도",
};

/** 규칙 종류 (백엔드 Rule.Kind) */
const RULE_KIND: Record<string, string> = {
  THROWS: "예외",
  RETURNS_NULL: "null 반환",
  GUARD: "검사 호출",
  AUTH: "권한",
  ORDERED: "정렬",
  ATOMIC_UPDATE: "원자적 갱신",
  FIELD: "필드 제약",
  CONVENTION: "관례",
};

function shortId(id: string): string {
  const hash = id.indexOf("#");
  const type = hash < 0 ? id : id.slice(0, hash);
  return type.slice(type.lastIndexOf(".") + 1) + (hash < 0 ? "" : id.slice(hash));
}

function fileName(path: string | null | undefined): string {
  return path ? path.slice(path.lastIndexOf("/") + 1) : "-";
}

/** 선택한 단계가 만든 결과물. */
export function StageDetail({
  stage,
  state,
  projectId,
  reviewId,
}: {
  stage: Exclude<StageId, "REVIEW">;
  state: StageState;
  projectId?: number;
  reviewId?: number;
}) {
  const meta = STAGE_META[stage];
  const d = state.data;
  const ms = durationMs(state);

  return (
    <motion.div
      key={stage}
      className="stage-detail"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="row">
        <strong>
          {meta.label}
        </strong>
        <span className={`badge ${state.status}`}>{state.status}</span>
        {ms != null && <span className="muted">{ms}ms</span>}
      </div>
      {state.message && <p className="muted">{state.message}</p>}

      {state.status === "PENDING" && <p className="muted">아직 시작하지 않았습니다.</p>}

      {d && stage === "COLLECT" && (
        <ul>
          <li>제목: {d.title}</li>
          <li>
            변경 파일 {d.files}개 · +{d.additions} / −{d.deletions}
          </li>
          <li>
            커밋 {d.commits}개 · PR 본문 {d.hasBody ? "있음" : "없음 (의도 판단 근거 부족)"}
          </li>
        </ul>
      )}

      {d && stage === "CHECKOUT" && (
        <ul>
          <li>
            base (merge-base) <code>{String(d.baseSha).slice(0, 7)}</code> → head <code>{String(d.headSha).slice(0, 7)}</code>
          </li>
          <li>레포 크기 {d.repoKb}KB</li>
        </ul>
      )}

      {d && (stage === "INDEX_BASE" || stage === "INDEX_HEAD") && (
        <div className="stat-grid">
          {[
            ["Java 파일", d.files],
            ["타입", d.types],
            ["메서드", d.methods],
            ["호출", d.calls],
            ["파싱 실패", d.failedFiles],
          ].map(([k, v]) => (
            <div key={k} className="stat">
              <div className="stat-value">{v}</div>
              <div className="muted">{k}</div>
            </div>
          ))}
        </div>
      )}

      {d && stage === "METHOD_DIFF" && (
        <>
          <p className="muted">
            바뀐 메서드(오른쪽)와 그 메서드를 부르는 곳(왼쪽). 빨간 점선은 옛 시그니처로 부르는 호출부입니다.
          </p>
          <ImpactGraph data={d} />
          {d.ast && <AstDiffView methods={d.ast} />}
        </>
      )}

      {d && stage === "IMPACT" && <GraphImpactDetail d={d} />}

      {d && stage === "HISTORY" && (
        <>
          <p className="muted">최근 커밋 {d.commits}개에서 이번에 바뀐 파일과 늘 함께 바뀌어 온 대상</p>
          {(d.coChanges ?? []).length === 0 ? (
            <div className="empty">기준을 넘는 동시 변경 없음</div>
          ) : (
            <div className="cochange-list">
              {(d.coChanges as { file: string; partner: string; directory: boolean; support: number; fileCommits: number; confidence: number }[]).map((c) => (
                <div key={`${c.file}-${c.partner}`} className="cochange">
                  <div className="cochange-label">
                    <code>{fileName(c.file)}</code> ↔{" "}
                    <code>
                      {c.directory ? c.partner.split("/").slice(-2).join("/") + "/" : fileName(c.partner)}
                    </code>
                    <span className="muted">
                      {" "}
                      {c.support}/{c.fileCommits}
                    </span>
                  </div>
                  <div className="bar">
                    <motion.div
                      className="bar-fill"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.round(c.confidence * 100)}%` }}
                      transition={{ duration: 0.6 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          {(d.blameCommits ?? []).length > 0 && (
            <>
              <h3>지운·고친 라인의 원래 커밋</h3>
              <ul>
                {(d.blameCommits as { sha: string; summary: string; file: string }[]).map((b) => (
                  <li key={b.sha}>
                    <code>{b.sha.slice(0, 7)}</code> {b.summary} <span className="muted">({fileName(b.file)})</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {d && stage === "RULE_MAP" && (
        <>
          <p className="muted">
            base <code>{String(d.baseSha ?? "-").slice(0, 7)}</code> · 규칙 {d.rules}개{d.baseCached ? " (저장해 둔 지도)" : " (이번에 만듦)"}
            {d.latestSha && d.latestSha !== d.baseSha && (
              <>
                {" "}· 지금 기본 브랜치 <code>{String(d.latestSha).slice(0, 7)}</code>
              </>
            )}
          </p>
          {d.byKind && (
            <p className="muted">
              {Object.entries(d.byKind as Record<string, number>)
                .map(([k, n]) => `${RULE_KIND[k] ?? k} ${n}`)
                .join(" · ")}
            </p>
          )}
          {(d.conventions ?? []).length > 0 && (
            <>
              <h3>관례</h3>
              <ul>
                {(d.conventions as { statement: string; support: number; total: number }[]).map((c) => (
                  <li key={c.statement}>
                    {c.statement}{" "}
                    <span className="muted">
                      ({c.support}/{c.total})
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {((d.added ?? []).length > 0 || (d.removed ?? []).length > 0) && (
            <>
              <h3>PR 을 만든 뒤 기본 브랜치에서 바뀐 규칙</h3>
              <ul>
                {(d.removed as string[]).map((r) => (
                  <li key={`-${r}`}>
                    <span className="muted">사라짐</span> {r}
                  </li>
                ))}
                {(d.added as string[]).map((r) => (
                  <li key={`+${r}`}>
                    <span className="muted">생김</span> {r}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {d && stage === "LLM_CONFLICT" && (d.methods ?? []).length > 0 && (
        <>
          <h3>바뀐 메서드가 기대던 기존 코드</h3>
          {(d.methods as ConflictMethodView[]).map((m) => (
            <div key={m.id}>
              <p>
                <code>{shortId(m.id)}</code>
              </p>
              <ul>
                {m.snippets.map((s) => (
                  <li key={s.ref}>
                    <span className="muted">[{s.ref}]</span> {SNIPPET_ROLE[s.role] ?? s.role} <code>{shortId(s.symbol)}</code>{" "}
                    <span className="muted">
                      ({s.side} · {fileName(s.file)}:{s.line}
                      {s.endLine > s.line && `-${s.endLine}`})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}

      {d && (stage.startsWith("CHECK_") || stage === "LLM" || stage === "LLM_CONFLICT") && (
        <>
          {stage === "CHECK_C" && state.status === "DONE" && <GuardDogPanel report={d.guarddog ?? null} />}
          {d.analyzers && <p className="muted">검사기: {(d.analyzers as string[]).join(", ")}</p>}
          {d.model && (
            <p className="muted">
              모델 {d.model}
              {d.dropped > 0 && ` · 변경 파일 밖을 가리킨 지적 ${d.dropped}건 제외`}
            </p>
          )}
          {(() => {
            const semgrep = ((d.findings ?? []) as FindingView[]).map(semgrepInfo).filter((s) => s !== null);
            return (
              semgrep.length > 0 && (
                <p className="muted semgrep-summary">
                  Semgrep{" "}
                  {countByPurpose(semgrep).map(([purpose, n]) => (
                    <span key={purpose} className="semgrep-chip" data-purpose={purpose}>
                      {purpose} {n}
                    </span>
                  ))}
                </p>
              )
            );
          })()}
          {(d.findings ?? []).length === 0 ? (
            <div className="empty">{stage === "CHECK_C" && state.status !== "DONE"
              ? state.status === "RUNNING" ? "보안 검사 진행 중입니다." : "보안 검사 결과가 아직 없습니다."
              : stage === "CHECK_C" && guarddogNeedsAttention(d.guarddog)
                ? "발견된 지적은 없지만 의존성 검증이 미완료되었습니다."
                : "지적 사항 없음"}</div>
          ) : (
            <ul className="finding-list">
              {(d.findings as FindingView[]).map((f, i) => {
                const sg = semgrepInfo(f);
                return (
                  <motion.li
                    key={`${f.ruleId}-${i}`}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <span className={`sev ${f.severity}`}>{f.severity}</span>{" "}
                    {sg ? (
                      <>
                        <span className="semgrep-chip" data-purpose={sg.purpose}>
                          {sg.purpose}
                        </span>{" "}
                        {sg.rule}
                      </>
                    ) : (
                      f.title
                    )}{" "}
                    <span className="muted">
                      {fileName(f.file)}
                      {f.line != null && `:${f.line}`}
                    </span>
                    {sg?.fix && (
                      <div className="semgrep-fix">
                        수정 제안 <code>{sg.fix}</code>
                      </div>
                    )}
                  </motion.li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {d && stage === "EXEC_PREPARE" && (
        <p>
          {d.runner === "KUBERNETES" ? "쿠버네티스 Job" : "Docker 컨테이너"} 2개 · 이미지 <code>{d.image}</code>
          <br />
          <span className="muted">
            base <code>{d.base}</code> · head <code>{d.head}</code>
          </span>
        </p>
      )}

      {d && (stage === "EXEC_POD_BASE" || stage === "EXEC_POD_HEAD") && (
        <p>
          <code>{d.name}</code> 기동까지 {Math.round((d.ms ?? 0) / 1000)}초
          <br />
          <span className="muted">노드 배정 → 러너 이미지 받기 → 컨테이너 시작 (root 아님 · 권한 없음 · CPU/메모리 제한)</span>
        </p>
      )}

      {d && (stage === "EXEC_TEST_BASE" || stage === "EXEC_TEST_HEAD") && (
        <p>
          테스트 {d.tests}개 · 실패 {d.failed}개 · 건너뜀 {d.skipped}개 · 종료 코드 {d.exitCode}
          <br />
          <span className="muted">clone → 빌드(Gradle · Maven) → 테스트 → JUnit 결과 전송</span>
        </p>
      )}

      {d && stage === "EXEC_DIFF" && (
        <>
          {d.headFailed ? (
            <p>
              base 에서는 빌드 · 테스트가 됐지만 head 에서는 실패했습니다: {d.reason}
            </p>
          ) : (
            <>
              <p className="muted">base 에서 통과하던 테스트가 head 에서 실패하면 이번 PR 이 깨뜨린 것으로 봅니다 (BLOCKER).</p>
              {(d.regressions ?? []).length === 0 && (d.newFailures ?? []).length === 0 ? (
                <div className="empty">회귀 없음{d.fixed?.length ? ` · 고친 테스트 ${d.fixed.length}개` : ""}</div>
              ) : (
                <ul className="finding-list">
                  {(d.regressions as string[]).map((n) => (
                    <li key={n}>
                      <span className="sev BLOCKER">회귀</span> <code>{n}</code>
                    </li>
                  ))}
                  {(d.newFailures as string[]).map((n) => (
                    <li key={n}>
                      <span className="sev MAJOR">새 실패</span> <code>{n}</code>
                    </li>
                  ))}
                </ul>
              )}
              {(d.behavior ?? []).length > 0 && (
                <>
                  <h3>동작 diff</h3>
                  <p className="muted">같은 입력으로 base 와 head 를 돌린 결과입니다. 코드를 읽지 않고도 무엇이 달라졌는지 보입니다.</p>
                  <BehaviorDiffTable rows={d.behavior} />
                </>
              )}
              <EvidenceVerdicts evidence={d.evidence ?? []} coverage={d.coverage ?? []} traced={!!d.traced} projectId={projectId} />
            </>
          )}
        </>
      )}

      {d && stage === "EXEC_SONAR" && <SonarStageDetail data={d} />}

      {d && stage === "EXEC_EVIDENCE" && <GeneratedTests data={d} />}

      {d && stage === "EXEC_MUTATION" && (
        <>
          <p className="muted">
            PR 이 바꾼 메서드에 작은 버그(조건 반전 · null 반환 · 호출 삭제 …)를 심고 고른 테스트를 돌립니다. 테스트가 실패하면 버그를 잡은 것입니다.
          </p>
          <p>
            변이 {d.killed + d.survived + d.uncovered}개 · 잡음 <b>{d.killed}</b> · 놓침 <b>{d.survived}</b> · 안 닿음 {d.uncovered}
            {d.score >= 0 && <> · 점수 {d.score}%</>}
          </p>
          {projectId != null && reviewId != null && (
            <Link href={`/projects/${projectId}/reviews/${reviewId}/tests`} className="ts-detail-link">
              어떤 버그를 막고 놓쳤는지 보기 →
            </Link>
          )}
        </>
      )}

      {d && stage === "EXEC_SELECT" && (
        <>
          <p className="muted">
            예전 전체 실행에서 테스트마다 지나간 메서드를 기록해 두고, 이번 PR 이 바꾼 메서드를 지나가는 테스트만 base · head 에서 똑같이 돌립니다.
          </p>
          <p>
            {d.mode === "FULL" ? (
              <>전체 실행 · 테스트 클래스 {d.total}개</>
            ) : (
              <>
                테스트 클래스 {d.total}개 중 <b>{d.shadow ? d.impacted : d.run}개</b> {d.shadow ? "면 충분 (그림자 모드라 전체 실행)" : "실행"}
                {!d.shadow && d.skippedSeconds > 0 && <> · 약 {Math.round(d.skippedSeconds)}초 절약</>}
              </>
            )}
          </p>
          {d.mode === "FULL" && (
            <ul className="finding-list">
              {(d.fullReasons as string[]).map((r) => (
                <li key={r}>
                  <span className="sev MAJOR">전체</span> {r}
                </li>
              ))}
            </ul>
          )}
          {projectId != null && reviewId != null && (
            <Link href={`/projects/${projectId}/reviews/${reviewId}/tests`} className="ts-detail-link">
              어떤 테스트를 돌리고 걸렀는지 보기 →
            </Link>
          )}
        </>
      )}

      {d && stage === "GROUND" && (
        <>
          <p className="muted">
            모든 지적을 코드 인덱스 · git 이력 · 실행 · AI 층에 비춰 봅니다. 인덱스의 사실과 어긋나는 AI 지적은 판정에서 뺍니다.
          </p>
          <ul className="finding-list">
            {(d.findings as GroundView[]).map((f, i) => (
              <motion.li key={`${f.title}-${i}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                <span className={`sev ${f.severity}`}>{f.severity}</span>{" "}
                <span className={f.status === "REFUTED" ? "struck" : undefined}>{f.title}</span>{" "}
                <span className="muted">
                  {fileName(f.file)}
                  {f.line != null && `:${f.line}`}
                </span>{" "}
                <span className="layer-chips">
                  {LAYER_ORDER.map((id) => {
                    const l = f.layers.find((x) => x.layer === id);
                    const mark = l?.mark ?? "NONE";
                    return (
                      <i
                        key={id}
                        className={`layer-chip ${mark}`}
                        style={mark === "NONE" ? undefined : { color: LAYER_META[id].color, borderColor: LAYER_META[id].color }}
                        title={`${LAYER_META[id].label}: ${l?.note ?? ""}`}
                      >
                        {MARK_META[mark].symbol} {LAYER_META[id].short}
                      </i>
                    );
                  })}
                </span>
                <div className="muted" style={{ color: STATUS_META[f.status].color }}>
                  {STATUS_META[f.status].label}
                  {f.status === "REFUTED" && ` — ${f.layers.find((x) => x.layer === "INDEX")?.note ?? ""}`}
                </div>
              </motion.li>
            ))}
          </ul>
        </>
      )}

      {d && stage === "VERDICT" && (
        <div>
          <p>
            BLOCKER {d.blocker} · MAJOR {d.major} · MINOR {d.minor}
            {d.refuted ? ` (인덱스와 어긋난 지적 ${d.refuted}건 제외)` : ""} → <strong>{state.message}</strong>
            <br />
            <span className="muted">판정 규칙: BLOCKER → 머지 비권장, MAJOR 기준 충족 또는 의존성 검증 미완료 → 수정 후 머지</span>
          </p>
          {d.reason && <p className="notice">{d.reason}</p>}
          {d.guarddog && <GuardDogPanel report={d.guarddog} />}
        </div>
      )}

      {d && stage === "PUBLISH" && (
        <p>
          요약 코멘트 1건 · 라인 코멘트 {d.inline}건{" "}
          {d.commentUrl && (
            <a href={d.commentUrl} target="_blank" rel="noreferrer">
              PR 에서 보기
            </a>
          )}
        </p>
      )}
    </motion.div>
  );
}

type ImpactFn = { file: string; name: string; line: number; depth: number; via: string | null; confirmed: boolean };

/** GitNexus 호출 그래프로 따라간 변경 영향: 바뀐 함수 → 부르는 함수를 단계별로 */
function GraphImpactDetail({ d }: { d: StageData }) {
  const changed = (d.changed ?? []) as ImpactFn[];
  const impacted = (d.impacted ?? []) as ImpactFn[];
  const depths = [...new Set(impacted.map((f) => f.depth))].sort((a, b) => a - b);
  return (
    <>
      <p className="muted">
        기본 브랜치 <code>{String(d.commitSha ?? "").slice(0, 7)}</code> 의 GitNexus 호출 그래프에서 바뀐 함수를 부르는
        함수를 따라갔습니다. 언어를 가리지 않고, &quot;인덱스로도 확인&quot;은 Java 인덱스가 같은 호출을 찾은 것입니다.
        {d.baseMatches === false && " 그래프 커밋이 이 PR 의 base 와 달라 줄 위치가 조금 어긋날 수 있습니다."}
        {d.complete === false && " 그래프가 레포 일부만 담고 있어 빠진 호출이 있을 수 있습니다."}
      </p>
      <div className="stats">
        {[
          ["바뀐 함수", changed.length],
          ["영향 함수", impacted.length],
          ["고치지 않은 파일", (d.impactedFiles ?? []).length],
          ["인덱스로도 확인", d.confirmed ?? 0],
        ].map(([k, v]) => (
          <div key={k} className="stat">
            <div className="stat-value">{v}</div>
            <div className="muted">{k}</div>
          </div>
        ))}
      </div>
      {changed.length > 0 && (
        <>
          <h4>바뀐 함수</h4>
          <ul className="impact-fns">
            {changed.map((f) => (
              <li key={`${f.file}#${f.name}:${f.line}`}>
                <code>{f.name}</code> <span className="muted">{fileName(f.file)}:{f.line}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {depths.map((depth) => (
        <div key={depth}>
          <h4>{depth}단계 — 부르는 함수</h4>
          <ul className="impact-fns">
            {impacted
              .filter((f) => f.depth === depth)
              .map((f) => (
                <li key={`${f.file}#${f.name}:${f.line}`}>
                  <code>{f.name}</code> <span className="muted">{fileName(f.file)}:{f.line}</span>
                  {f.via && <span className="muted"> → {f.via.split("#").pop()}</span>}
                  {f.confirmed && <span className="impact-confirmed">인덱스로도 확인</span>}
                </li>
              ))}
          </ul>
        </div>
      ))}
      {impacted.length === 0 && <div className="empty">이 변경을 부르는 함수가 그래프에 없음</div>}
      {(d.unmapped ?? []).length > 0 && (
        <p className="muted">그래프에 없는 바뀐 파일(새 파일 · 함수 밖 변경): {(d.unmapped as string[]).map(fileName).join(", ")}</p>
      )}
    </>
  );
}
