import { createHash } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { api, ApiError, type AnalysisContext, type Finding } from "@/lib/api";
import {
  CATEGORY_LABEL,
  fileName,
  formatTime,
  SEVERITY_ORDER,
  shortMethod,
  shortSha,
  VERDICT_LABEL,
} from "@/lib/format";
import { computeImpact, type Impact } from "@/components/graph/impact";
import {
  countByStatus,
  groundingOf,
  hasGrounding,
  kindLabel,
  LAYER_META,
  LAYER_ORDER,
  layerOf,
  MARK_META,
  STATUS_META,
  STATUS_ORDER,
} from "@/lib/grounding";
import { computeDelegation, touchedZones, ZONE_META, type FileZone, type Zone } from "@/lib/delegation";
import { BehaviorDiffTable, type BehaviorRow } from "@/components/pipeline/BehaviorDiff";
import { PipelineView } from "@/components/pipeline/PipelineView";
import { RerunButton } from "../RerunButton";
import { ReviewMarkdown } from "../ReviewMarkdown";

/**
 * PR 판단 화면 (PR 이력 → PR 하나). 위에서부터 "머지해도 되나"에 답하는 순서로 놓는다:
 * 판정 → 근거가 있는 지적 → 사람이 확인할 지적(AI 만 주장) → 이 PR 이 닿는 곳(근거 층 · 영향 시티 · 영향 그래프) → 위임 구역.
 * 리뷰 과정 · 판정에서 뺀 지적 · 분석 재료 · PR 코멘트 원문은 접어 둔다.
 */
export async function ReviewDecision({ projectId, reviewId }: { projectId: number; reviewId: number }) {
  let data;
  try {
    data = await Promise.all([
      api.getReview(reviewId),
      api.getGraph(projectId),
      api.getReviewEvents(reviewId),
      api.getProject(projectId),
      api.listPulls(projectId),
      api.listReviews(projectId, 100),
    ]);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const [detail, graph, events, project, pulls, reviews] = data;
  const { review, findings: all, context } = detail;
  if (review.projectId !== projectId) notFound();

  const pull = pulls.find((p) => p.number === review.prNumber) ?? null;
  const runs = reviews.filter((r) => r.prNumber === review.prNumber);
  const repoUrl = project.htmlUrl;
  const base = `/projects/${projectId}/reviews/${reviewId}`;
  // 코드 인덱스와 어긋나 판정에서 뺀 지적은 따로 접어 둔다
  const findings = all.filter((f) => groundingOf(f).status !== "REFUTED");
  const refuted = all.filter((f) => groundingOf(f).status === "REFUTED");
  const confirmed = findings.filter((f) => groundingOf(f).status === "CONFIRMED");
  const aiOnly = findings.filter((f) => groundingOf(f).status === "AI_ONLY");
  const diffUrl = (f: Finding) => {
    const files = `${repoUrl}/pull/${review.prNumber}/files`;
    if (!f.file) return files;
    const anchor = createHash("sha256").update(f.file).digest("hex");
    return `${files}#diff-${anchor}${f.line != null ? `R${f.line}` : ""}`;
  };

  return (
    <main className="wide dec">
      <header className="dec-head">
        <div className="dec-title">
          <span className="dec-num">PR #{review.prNumber}</span>
          <h1>{pull?.title ?? `PR #${review.prNumber}`}</h1>
          <p className="muted">
            {pull && (
              <>
                {pull.author} · <code>{pull.headRef}</code> → <code>{pull.baseRef}</code> ·{" "}
              </>
            )}
            <code>{shortSha(review.headSha)}</code> · {review.reviewer ?? "-"} · {formatTime(review.finishedAt ?? review.createdAt)} ·{" "}
            <a href={`${repoUrl}/pull/${review.prNumber}`} target="_blank" rel="noreferrer">
              GitHub ↗
            </a>
            {review.commentUrl && (
              <>
                {" · "}
                <a href={review.commentUrl} target="_blank" rel="noreferrer">
                  PR 코멘트 ↗
                </a>
              </>
            )}
          </p>
        </div>
        <div className="dec-runs">
          {runs.length > 1 && (
            <span className="dec-run-list" aria-label="이 PR 의 리뷰 기록">
              {[...runs].reverse().map((r) => (
                <Link
                  key={r.id}
                  href={`/projects/${projectId}/prs/${r.prNumber}?review=${r.id}`}
                  className={r.id === review.id ? "active" : ""}
                  title={`${shortSha(r.headSha)} · ${formatTime(r.finishedAt ?? r.createdAt)}`}
                >
                  {r.status === "DONE" && r.verdict ? <i className={`dot ${r.verdict}`} /> : <i className="dot" />}
                  run {r.run}
                </Link>
              ))}
            </span>
          )}
          {pull?.state === "open" && <RerunButton projectId={projectId} prNumber={review.prNumber} />}
        </div>
      </header>

      {review.status !== "DONE" ? (
        <>
          <div className="dec-status">
            <span className={`badge ${review.status}`}>{review.status}</span>
            {review.status === "PENDING" && <span className="muted">대기열에서 차례를 기다리는 중입니다.</span>}
            {review.status === "RUNNING" && <span className="muted">분석하는 중입니다. 단계가 켜지는 모습을 아래에서 볼 수 있어요.</span>}
            {review.error && <span className="error">{review.error}</span>}
          </div>
          <PipelineView reviewId={review.id} projectId={projectId} />
        </>
      ) : (
        <>
          <div className="dec-grid">
            <section className="dec-main">
              <div className="dec-verdict">
                {review.verdict && <span className={`verdict large ${review.verdict}`}>{VERDICT_LABEL[review.verdict]}</span>}
                <span className="muted">
                  판정에 쓴 지적 {findings.length}건 ·{" "}
                  {SEVERITY_ORDER.slice(0, 3)
                    .map((s) => `${s} ${findings.filter((f) => f.severity === s).length}`)
                    .join(" · ")}
                  {refuted.length > 0 && ` · 인덱스와 어긋나 뺀 지적 ${refuted.length}건`}
                </span>
              </div>
              {review.summary && <p className="dec-summary">{review.summary}</p>}

              {findings.length === 0 ? (
                <div className="empty">지적 사항이 없어요. 사람이 깊게 보지 않아도 되는 PR 입니다.</div>
              ) : (
                <>
                  <FindingGroup
                    title="근거가 있는 지적"
                    hint="AI 말고도 코드 인덱스나 실행 검증이 같은 문제를 찾았어요"
                    color={STATUS_META.CONFIRMED.color}
                    findings={confirmed}
                    diffUrl={diffUrl}
                  />
                  <FindingGroup
                    title="사람이 확인할 지적"
                    hint="AI 만 주장해요. 층별 근거와 바뀐 줄을 보고 판단하세요"
                    color={STATUS_META.AI_ONLY.color}
                    findings={aiOnly}
                    diffUrl={diffUrl}
                  />
                  {!hasGrounding(all) && <p className="muted">근거 확인 단계가 생기기 전 리뷰라, 지적을 만든 층만 표시합니다.</p>}
                </>
              )}

              <BehaviorCard rows={behaviorRows(events)} />
            </section>

            <aside className="dec-side">
              {graph?.graph ? (
                <ReachCard
                  impact={computeImpact(graph.graph, context, findings)}
                  findings={all}
                  layersHref={`${base}/layers`}
                  cityHref={`${base}/city`}
                  impactHref={`${base}/impact`}
                />
              ) : (
                <div className="side-card">
                  <b>이 PR 이 닿는 곳</b>
                  <p className="muted">레포 분석(코드 그래프)이 끝나면 영향 범위와 근거 층을 볼 수 있어요.</p>
                  <Link href={`${base}/layers`}>근거 층 열기 →</Link>
                </div>
              )}
              {graph?.graph && context && (
                <ZoneCard
                  zones={touchedZones(computeDelegation(graph.graph), (context.files ?? context.history).map((f) => ("path" in f ? f.path : f.file)))}
                  projectId={projectId}
                />
              )}
            </aside>
          </div>

          <details className="fold">
            <summary>리뷰 과정 · 파이프라인 다시보기</summary>
            <PipelineView reviewId={review.id} projectId={projectId} />
          </details>
          {refuted.length > 0 && (
            <details className="fold">
              <summary>코드 인덱스와 어긋나 판정에서 뺀 AI 지적 {refuted.length}건</summary>
              <FindingTable findings={refuted} />
            </details>
          )}
          {context && (
            <details className="fold">
              <summary>분석 재료 · 바뀐 메서드 · git 이력</summary>
              <ContextSection context={context} />
            </details>
          )}
          <details className="fold">
            <summary>PR 에 남긴 코멘트 원문</summary>
            <div className="review-body">{review.result && <ReviewMarkdown>{review.result}</ReviewMarkdown>}</div>
          </details>
        </>
      )}
    </main>
  );
}

/** 지적 묶음: 한 줄 요약(심각도 · 제목 · 위치 · 층 칩)을 펴면 내용, 층별 근거, GitHub 의 바뀐 줄 */
function FindingGroup({
  title,
  hint,
  color,
  findings,
  diffUrl,
}: {
  title: string;
  hint: string;
  color: string;
  findings: Finding[];
  diffUrl: (f: Finding) => string;
}) {
  if (findings.length === 0) return null;
  return (
    <section className="fgroup">
      <h2 style={{ color }}>
        {title} <span className="muted">{findings.length}</span>
      </h2>
      <p className="muted fgroup-hint">{hint}</p>
      {findings.map((f) => {
        const g = groundingOf(f);
        return (
          <details key={f.id} className="fitem">
            <summary>
              <span className={`sev ${f.severity}`}>{f.severity}</span>
              <span className="fitem-title">{f.title}</span>
              <code className="fitem-loc">
                {fileName(f.file)}
                {f.line != null && `:${f.line}`}
              </code>
              <LayerChips finding={f} />
            </summary>
            <div className="fitem-body">
              <p>{f.message}</p>
              {f.evidence && <pre className="fitem-evidence">{f.evidence}</pre>}
              <ol className="fitem-layers">
                {[...LAYER_ORDER].reverse().map((id) => {
                  const l = layerOf(g, id);
                  return (
                    <li key={id} className={l.mark}>
                      <span style={{ color: l.mark === "REFUTED" ? "#ef4444" : LAYER_META[id].color }}>{MARK_META[l.mark].symbol}</span>
                      <b>{LAYER_META[id].short}</b>
                      <span>{l.note || MARK_META[l.mark].label}</span>
                    </li>
                  );
                })}
              </ol>
              {(g.kind || g.symbols.length > 0) && (
                <p className="muted">
                  {kindLabel(g.kind) && <>AI 가 말한 것: {kindLabel(g.kind)} </>}
                  {g.symbols.map((s) => (
                    <code key={s}> {s}</code>
                  ))}
                </p>
              )}
              <a href={diffUrl(f)} target="_blank" rel="noreferrer">
                GitHub 에서 바뀐 줄 보기 →
              </a>
            </div>
          </details>
        );
      })}
    </section>
  );
}

const IMPACT_PREVIEW = 5;

/** 이 PR 이 닿는 곳: 영향 범위 숫자와 근거 층 상태, 3D · 2D 화면으로 가는 길 */
function ReachCard({
  impact,
  findings,
  layersHref,
  cityHref,
  impactHref,
}: {
  impact: Impact;
  findings: Finding[];
  layersHref: string;
  cityHref: string;
  impactHref: string;
}) {
  const top = [...impact.direct, ...impact.indirect].slice(0, IMPACT_PREVIEW);
  const byStatus = countByStatus(findings);
  return (
    <div className="graph-card reach-card">
      <div className="graph-card-title">이 PR 이 닿는 곳</div>
      <div className="graph-card-stats">
        <span>
          <b className="impact-0">{impact.changed.length}</b> 바뀐 함수
        </span>
        <span>
          <b className="impact-1">{impact.direct.length}</b> 직접
        </span>
        <span>
          <b className="impact-2">{impact.indirect.length}</b> 간접
        </span>
      </div>
      {top.length > 0 && (
        <div className="graph-card-groups">
          {top.map((f) => (
            <span key={f.id} title={f.reason ?? f.file}>
              <i className={`impact-dot-${f.level}`} />
              {f.name}
              {f.stale && <em className="impact-stale">옛 시그니처 호출</em>}
            </span>
          ))}
          {impact.direct.length + impact.indirect.length > IMPACT_PREVIEW && (
            <span className="graph-card-more">+{impact.direct.length + impact.indirect.length - IMPACT_PREVIEW}</span>
          )}
        </div>
      )}
      {findings.length > 0 && (
        <>
          <div className="ground-bar">
            {STATUS_ORDER.map((s) =>
              byStatus[s] > 0 ? <i key={s} style={{ flex: byStatus[s], background: STATUS_META[s].color }} title={`${STATUS_META[s].label} ${byStatus[s]}`} /> : null,
            )}
          </div>
          <p className="graph-card-note">
            {STATUS_ORDER.filter((s) => byStatus[s] > 0)
              .map((s) => `${STATUS_META[s].label} ${byStatus[s]}`)
              .join(" · ")}
          </p>
        </>
      )}
      <div className="reach-actions">
        <Link href={layersHref} className="graph-open ground-open">
          근거 층 (3D)
        </Link>
        <Link href={cityHref} className="graph-more">
          영향 시티 (3D)
        </Link>
        <Link href={impactHref} className="graph-more">
          영향 그래프
        </Link>
      </div>
    </div>
  );
}

function FindingTable({ findings }: { findings: Finding[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>심각도</th>
            <th>분류</th>
            <th>근거</th>
            <th>위치</th>
            <th>내용</th>
          </tr>
        </thead>
        <tbody>
          {findings.map((f) => (
            <tr key={f.id}>
              <td>
                <span className={`sev ${f.severity}`}>{f.severity}</span>
              </td>
              <td>
                {CATEGORY_LABEL[f.category]}
                <div className="muted">{f.source === "LLM" ? "AI" : f.ruleId}</div>
              </td>
              <td>
                <LayerChips finding={f} />
              </td>
              <td>
                <code>
                  {fileName(f.file)}
                  {f.line != null && `:${f.line}`}
                </code>
              </td>
              <td>
                <strong className={groundingOf(f).status === "REFUTED" ? "struck" : undefined}>{f.title}</strong>
                <div>{f.message}</div>
                {groundingOf(f).status === "REFUTED" && (
                  <div className="refuted-note">인덱스: {layerOf(groundingOf(f), "INDEX").note}</div>
                )}
                {f.evidence && <div className="muted">근거: {f.evidence}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 층별 판단을 작은 칩 네 개로: 인덱스 · 이력 · 실행 · AI. 칩에 올리면 그 층의 근거 */
function LayerChips({ finding }: { finding: Finding }) {
  const g = groundingOf(finding);
  return (
    <span className="layer-chips">
      {LAYER_ORDER.map((id) => {
        const l = layerOf(g, id);
        return (
          <i
            key={id}
            className={`layer-chip ${l.mark}`}
            style={l.mark === "NONE" ? undefined : { color: LAYER_META[id].color, borderColor: LAYER_META[id].color }}
            title={`${LAYER_META[id].label} · ${MARK_META[l.mark].label}${l.note ? `: ${l.note}` : ""}`}
          >
            {MARK_META[l.mark].symbol} {LAYER_META[id].short}
          </i>
        );
      })}
    </span>
  );
}

/** 분석에 쓴 재료. A~D 검사가 어떤 근거를 쓸 수 있는지 보여준다. */
function ContextSection({ context }: { context: AnalysisContext }) {
  const coChanges = context.history.filter((h) => h.coChanges.length > 0);
  return (
    <>
      <p className="muted">
        base <code>{context.baseSha ? shortSha(context.baseSha) : "-"}</code> → head <code>{shortSha(context.headSha)}</code>{" "}
        · Java 파일 {context.headIndex.files}개 · 메서드 {context.headIndex.methods}개 · 호출 {context.headIndex.calls}개 ·
        이력 커밋 {context.historyCommits}개 · {context.elapsedMs}ms
      </p>
      {context.notes.length > 0 && (
        <ul>
          {context.notes.map((n) => (
            <li key={n} className="error">
              {n}
            </li>
          ))}
        </ul>
      )}

      <h3>바뀐 메서드와 호출부</h3>
      {context.changedMethods.length === 0 ? (
        <div className="empty">바뀐 메서드 없음</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>변경</th>
                <th>메서드</th>
                <th>호출부 (head)</th>
              </tr>
            </thead>
            <tbody>
              {context.changedMethods.map((m) => (
                <tr key={`${m.kind}-${m.id ?? m.baseId}`}>
                  <td>
                    <span className="badge">{methodKindLabel(m)}</span>
                    {m.test && <div className="muted">테스트</div>}
                  </td>
                  <td>
                    <code>{shortMethod(m.id ?? m.baseId)}</code>
                    {m.signatureChanged && (
                      <div className="muted">
                        이전: <code>{shortMethod(m.baseId)}</code>
                      </div>
                    )}
                  </td>
                  <td>
                    {m.callers.length === 0 && m.staleCalls.length === 0 && <span className="muted">없음</span>}
                    {m.callers.map((c) => (
                      <div key={`${c.callerId}-${c.line}`}>
                        <code>{shortMethod(c.callerId)}</code> <span className="muted">{fileName(c.file)}:{c.line}</span>
                      </div>
                    ))}
                    {m.staleCalls.map((c) => (
                      <div key={`stale-${c.callerId}-${c.line}`} className="error">
                        옛 시그니처로 호출: <code>{shortMethod(c.callerId)}</code> {fileName(c.file)}:{c.line}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>함께 바뀌어 온 파일 (git 이력)</h3>
      {coChanges.length === 0 ? (
        <div className="empty">기준을 넘는 동시 변경 없음</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>변경 파일</th>
                <th>함께 바뀐 대상</th>
                <th>횟수</th>
                <th>비율</th>
              </tr>
            </thead>
            <tbody>
              {coChanges.flatMap((h) =>
                h.coChanges.map((c) => (
                  <tr key={`${h.file}-${c.partner}`}>
                    <td>
                      <code>{fileName(h.file)}</code>
                    </td>
                    <td>
                      <code>
                        {c.partner}
                        {c.directory ? "/" : ""}
                      </code>
                    </td>
                    <td>
                      {c.support} / {c.fileCommits}
                    </td>
                    <td>{Math.round(c.confidence * 100)}%</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}

      <h3>지운·고친 라인의 원래 커밋 (blame)</h3>
      {context.blame.length === 0 ? (
        <div className="empty">없음</div>
      ) : (
        <ul>
          {dedupeBlame(context.blame).map((b) => (
            <li key={`${b.file}-${b.sha}`}>
              <code>{fileName(b.file)}</code> <code>{shortSha(b.sha)}</code> {b.summary}{" "}
              <span className="muted">({b.author})</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function methodKindLabel(m: AnalysisContext["changedMethods"][number]): string {
  if (m.kind === "ADDED") return "추가";
  if (m.kind === "REMOVED") return "삭제";
  return m.signatureChanged ? "시그니처 변경" : "수정";
}

function dedupeBlame(blame: AnalysisContext["blame"]) {
  const seen = new Set<string>();
  return blame.filter((b) => {
    const key = `${b.file}-${b.sha}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 이 PR 이 건드린 파일의 AI 위임 구역. 사람이 직접 다뤄야 할 곳을 건드렸으면 눈에 띄게 */
function ZoneCard({ zones, projectId }: { zones: FileZone[]; projectId: number }) {
  if (zones.length === 0) return null;
  const count = (z: Zone) => zones.filter((f) => f.zone === z).length;
  const worst = zones[0].zone;
  return (
    <div className={`zone-card ${worst}`}>
      <div className="zone-card-head">
        <b>AI 위임 구역</b>
        {(["OWN", "REVIEW", "DELEGATE"] as Zone[]).map((z) =>
          count(z) > 0 ? (
            <span key={z} className="zone-chip" style={{ background: ZONE_META[z].color }}>
              {ZONE_META[z].label} {count(z)}
            </span>
          ) : null,
        )}
        <Link href={`/projects/${projectId}/commits?tab=city&mode=delegation`}>위임 지도 →</Link>
      </div>
      {worst !== "DELEGATE" && (
        <ul>
          {zones
            .filter((f) => f.zone !== "DELEGATE")
            .map((f) => (
              <li key={f.path}>
                <i className="zone-dot" style={{ background: ZONE_META[f.zone].color }} />
                <code>{f.path.slice(f.path.lastIndexOf("/") + 1)}</code>{" "}
                <span className="muted">
                  {f.reasons
                    .filter((r) => r.kind !== "tested" && r.kind !== "runtime")
                    .map((r) => r.text)
                    .join(" · ")}
                </span>
              </li>
            ))}
        </ul>
      )}
      {worst === "OWN" && <p className="zone-warn">사람이 직접 다뤄야 할 코드를 바꾼 PR 이에요. AI 가 쓴 변경이라면 꼼꼼히 확인하세요.</p>}
    </div>
  );
}

/** 차등 비교 단계가 남긴 동작 diff 표 (실행 검증이 돈 리뷰만) */
function behaviorRows(events: { stage: string; status: string; data: Record<string, unknown> | null }[]): BehaviorRow[] {
  const diff = [...events].reverse().find((e) => e.stage === "EXEC_DIFF" && e.status === "DONE");
  return (diff?.data?.behavior as BehaviorRow[] | undefined) ?? [];
}

/** 동작 diff 카드: 코드 대신 "같은 입력, 다른 결과" 를 리뷰 맨 위에서 보여 준다 */
function BehaviorCard({ rows }: { rows: BehaviorRow[] }) {
  if (rows.length === 0) return null;
  const changed = rows.filter((r) => r.changed).length;
  return (
    <div className={`bd-card ${changed > 0 ? "changed" : ""}`}>
      <div className="bd-card-head">
        <b>동작 diff</b>
        <span className="muted">
          같은 입력으로 base 와 이 PR 을 실제로 실행한 결과 · {changed > 0 ? `${changed}곳에서 결과가 달라졌어요` : "결과가 모두 같아요"}
        </span>
      </div>
      <BehaviorDiffTable rows={rows} compact />
    </div>
  );
}

