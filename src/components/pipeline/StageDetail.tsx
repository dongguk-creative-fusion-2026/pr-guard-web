"use client";

import { motion } from "motion/react";
import { EvidenceVerdicts, GeneratedTests } from "./Evidence";
import { ImpactGraph } from "./ImpactGraph";
import { durationMs, STAGE_META, type StageId, type StageState } from "./stages";

type FindingView = { severity: string; ruleId: string; title: string; file: string | null; line: number | null };

function fileName(path: string | null | undefined): string {
  return path ? path.slice(path.lastIndexOf("/") + 1) : "-";
}

/** 선택한 단계가 만든 결과물. */
export function StageDetail({
  stage,
  state,
  projectId,
}: {
  stage: Exclude<StageId, "REVIEW">;
  state: StageState;
  projectId?: number;
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
          {meta.icon} {meta.label}
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
        </>
      )}

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

      {d && (stage.startsWith("CHECK_") || stage === "LLM") && (
        <>
          {d.analyzers && <p className="muted">검사기: {(d.analyzers as string[]).join(", ")}</p>}
          {d.model && (
            <p className="muted">
              모델 {d.model}
              {d.dropped > 0 && ` · 변경 파일 밖을 가리킨 지적 ${d.dropped}건 제외`}
            </p>
          )}
          {(d.findings ?? []).length === 0 ? (
            <div className="empty">지적 사항 없음</div>
          ) : (
            <ul className="finding-list">
              {(d.findings as FindingView[]).map((f, i) => (
                <motion.li
                  key={`${f.ruleId}-${i}`}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <span className={`sev ${f.severity}`}>{f.severity}</span> {f.title}{" "}
                  <span className="muted">
                    {fileName(f.file)}
                    {f.line != null && `:${f.line}`}
                  </span>
                </motion.li>
              ))}
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
              <EvidenceVerdicts evidence={d.evidence ?? []} coverage={d.coverage ?? []} traced={!!d.traced} projectId={projectId} />
            </>
          )}
        </>
      )}

      {d && stage === "EXEC_EVIDENCE" && <GeneratedTests data={d} />}

      {d && stage === "VERDICT" && (
        <p>
          BLOCKER {d.blocker} · MAJOR {d.major} · MINOR {d.minor} → <strong>{state.message}</strong>
          <br />
          <span className="muted">판정 규칙: BLOCKER 1건 이상 → 머지 비권장, MAJOR 1건 이상 → 수정 후 머지</span>
        </p>
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
