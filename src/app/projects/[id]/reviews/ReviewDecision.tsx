import { createHash } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { api, ApiError, type AnalysisContext, type Finding, type Verdict } from "@/lib/api";
import { CATEGORY_LABEL, fileName, formatTime, shortMethod, shortSha, timeAgo, VERDICT_LABEL } from "@/lib/format";
import { computeImpact, type Impact } from "@/components/graph/impact";
import { groundingOf, hasGrounding, kindLabel, LAYER_META, LAYER_ORDER, layerOf, MARK_META } from "@/lib/grounding";
import { computeDelegation, touchedZones, ZONE_META, type FileZone, type Zone } from "@/lib/delegation";
import { pickSelection, seconds } from "@/lib/testSelection";
import type { TestSelection } from "@/lib/api";
import { BehaviorDiffTable, type BehaviorRow } from "@/components/pipeline/BehaviorDiff";
import { PipelineView } from "@/components/pipeline/PipelineView";
import { RerunButton } from "../RerunButton";
import { ReviewMarkdown } from "../ReviewMarkdown";
import { ImpactCityInlineClient } from "./ImpactCityInlineClient";

/** 판정 한 줄 설명: 이 PR 을 어떻게 다루면 되는지 */
const VERDICT_LINE: Record<Verdict, string> = {
  MERGEABLE: "사람이 깊게 보지 않아도 됩니다",
  NEEDS_CHANGES: "아래 지적을 확인한 뒤 머지하세요",
  NOT_RECOMMENDED: "고치기 전에는 머지하지 마세요",
};

/**
 * PR 판단 화면 (PR 이력 → PR 하나). 위에서부터 "머지해도 되나"에 답하는 순서:
 * 판정 → 확인된 지적 → 검토할 지적(AI 만 주장) / 옆에 영향 범위 · 위임 구역.
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
  const count = (s: string) => findings.filter((f) => f.severity === s).length;
  const diffUrl = (f: Finding) => {
    const files = `${repoUrl}/pull/${review.prNumber}/files`;
    if (!f.file) return files;
    const anchor = createHash("sha256").update(f.file).digest("hex");
    return `${files}#diff-${anchor}${f.line != null ? `R${f.line}` : ""}`;
  };

  return (
    <main className="dv">
      <header className="dv-head">
        <div className="dv-crumb">
          <span>#{review.prNumber}</span>
          {pull && (
            <span className="dv-branch">
              {pull.headRef} → {pull.baseRef}
            </span>
          )}
        </div>
        <h1>{pull?.title ?? `PR #${review.prNumber}`}</h1>
        <div className="dv-meta">
          {pull && <span>{pull.author}</span>}
          <span className="mono">{shortSha(review.headSha)}</span>
          <span title={formatTime(review.finishedAt ?? review.createdAt)}>{timeAgo(review.finishedAt ?? review.createdAt)}</span>
          <a href={`${repoUrl}/pull/${review.prNumber}`} target="_blank" rel="noreferrer">
            GitHub
          </a>
          {review.commentUrl && (
            <a href={review.commentUrl} target="_blank" rel="noreferrer">
              PR 코멘트
            </a>
          )}
          <span className="dv-spacer" />
          {runs.length > 1 && (
            <nav className="dv-runs" aria-label="리뷰 차수">
              {[...runs].reverse().map((r) => (
                <Link
                  key={r.id}
                  href={`/projects/${projectId}/prs/${r.prNumber}?review=${r.id}`}
                  className={r.id === review.id ? "active" : ""}
                  title={`${shortSha(r.headSha)} · ${formatTime(r.finishedAt ?? r.createdAt)}`}
                >
                  {r.run}
                </Link>
              ))}
            </nav>
          )}
          {pull?.state === "open" && <RerunButton projectId={projectId} prNumber={review.prNumber} />}
        </div>
      </header>

      {review.status !== "DONE" ? (
        <>
          <div className="dv-status">
            <span className={`badge ${review.status}`}>{review.status}</span>
            {review.error && <span className="error">{review.error}</span>}
          </div>
          <PipelineView reviewId={review.id} projectId={projectId} />
        </>
      ) : (
        <>
          <div className="dv-grid">
            <div className="dv-main">
              {review.verdict && (
                <section className={`dv-verdict ${review.verdict}`}>
                  <div className="dv-verdict-label">
                    <i />
                    {VERDICT_LABEL[review.verdict]}
                  </div>
                  <p>{VERDICT_LINE[review.verdict]}</p>
                  <div className="dv-counts">
                    {(["BLOCKER", "MAJOR", "MINOR"] as const).map((s) => (
                      <span key={s} className={count(s) > 0 ? "on" : ""}>
                        <b>{count(s)}</b> {s}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {review.summary && <p className="dv-summary">{review.summary}</p>}

              {graph?.graph && <ImpactCityInlineClient data={graph.graph} reviewId={review.id} prNumber={review.prNumber} context={context} findings={all} href={`${base}/city`} />}

              {findings.length === 0 ? (
                <p className="dv-empty">지적 사항 없음</p>
              ) : (
                <>
                  <FindingList title="확인된 지적" note="코드 인덱스 · 실행 검증이 같은 문제를 찾음" findings={confirmed} diffUrl={diffUrl} />
                  <FindingList title="검토할 지적" note="AI 만 주장" findings={aiOnly} diffUrl={diffUrl} />
                  {!hasGrounding(all) && <p className="dv-note">근거 확인 전 리뷰</p>}
                </>
              )}

              <BehaviorCard rows={behaviorRows(events)} />
            </div>

            <aside className="dv-side">
              {graph?.graph ? (
                <ReachCard impact={computeImpact(graph.graph, context, findings)} layersHref={`${base}/layers`} cityHref={`${base}/city`} impactHref={`${base}/impact`} />
              ) : (
                <div className="dv-card">
                  <h3>영향 범위</h3>
                  <p className="dv-note">레포 분석이 끝나면 보여요</p>
                  <Link href={`${base}/layers`} className="dv-btn">
                    근거 층
                  </Link>
                </div>
              )}
              <TestSelectionCard selection={pickSelection([], events)} href={`${base}/tests`} />
              {graph?.graph && context && (
                <ZoneCard
                  zones={touchedZones(computeDelegation(graph.graph), (context.files ?? context.history).map((f) => ("path" in f ? f.path : f.file)))}
                  projectId={projectId}
                />
              )}
            </aside>
          </div>

          <div className="dv-folds">
            <details>
              <summary>리뷰 과정</summary>
              <PipelineView reviewId={review.id} projectId={projectId} />
            </details>
            {refuted.length > 0 && (
              <details>
                <summary>
                  판정에서 뺀 지적 <span className="dv-n">{refuted.length}</span>
                </summary>
                <FindingTable findings={refuted} />
              </details>
            )}
            {context && (
              <details>
                <summary>분석 재료</summary>
                <ContextSection context={context} />
              </details>
            )}
            <details>
              <summary>PR 코멘트 원문</summary>
              <div className="review-body">{review.result && <ReviewMarkdown>{review.result}</ReviewMarkdown>}</div>
            </details>
          </div>
        </>
      )}
    </main>
  );
}

/** 이 지적을 AI 말고 확인한 층 (인덱스 · 실행) */
function confirmedBy(f: Finding): string | null {
  const g = groundingOf(f);
  const layers = (["INDEX", "RUNTIME"] as const).filter((id) => layerOf(g, id).mark === "CONFIRMED");
  return layers.length ? layers.map((id) => LAYER_META[id].short).join(" · ") + " 확인" : null;
}

/** 지적 목록. 한 항목 = 두 줄(심각도 · 제목 / 위치 · 확인한 층). 누르면 내용 · 층별 근거 · 바뀐 줄 */
function FindingList({
  title,
  note,
  findings,
  diffUrl,
}: {
  title: string;
  note: string;
  findings: Finding[];
  diffUrl: (f: Finding) => string;
}) {
  if (findings.length === 0) return null;
  return (
    <section className="fl">
      <h2 className="fl-head">
        {title} <span className="dv-n">{findings.length}</span>
        <span className="fl-note">{note}</span>
      </h2>
      <ul>
        {findings.map((f) => {
          const g = groundingOf(f);
          const by = confirmedBy(f);
          return (
            <li key={f.id}>
              <details>
                <summary>
                  <span className={`tag ${f.severity}`}>{f.severity}</span>
                  <span className="fl-title">{f.title}</span>
                  <span className="fl-sub">
                    <span className="mono">
                      {fileName(f.file)}
                      {f.line != null && `:${f.line}`}
                    </span>
                    {by && <span className="fl-by">{by}</span>}
                  </span>
                </summary>
                <div className="fl-body">
                  <p>{f.message}</p>
                  {f.evidence && <pre className="fl-evidence">{f.evidence}</pre>}
                  <dl className="fl-layers">
                    {[...LAYER_ORDER].reverse().map((id) => {
                      const l = layerOf(g, id);
                      return (
                        <div key={id} className={l.mark}>
                          <dt>
                            <span className="fl-mark">{MARK_META[l.mark].symbol}</span>
                            {LAYER_META[id].short}
                          </dt>
                          <dd>{l.note || MARK_META[l.mark].label}</dd>
                        </div>
                      );
                    })}
                  </dl>
                  {(g.kind || g.symbols.length > 0) && (
                    <p className="fl-claim">
                      {kindLabel(g.kind)}
                      {g.symbols.map((s) => (
                        <code key={s}>{s}</code>
                      ))}
                    </p>
                  )}
                  <a href={diffUrl(f)} target="_blank" rel="noreferrer" className="fl-link">
                    바뀐 줄 보기
                  </a>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** 영향 범위: 숫자 세 개와 3D · 2D 화면으로 가는 길 */
function ReachCard({ impact, layersHref, cityHref, impactHref }: { impact: Impact; layersHref: string; cityHref: string; impactHref: string }) {
  return (
    <div className="dv-card">
      <h3>영향 범위</h3>
      <div className="dv-stats">
        <div>
          <b>{impact.changed.length}</b>
          <span>바뀐 함수</span>
        </div>
        <div>
          <b>{impact.direct.length}</b>
          <span>직접 영향</span>
        </div>
        <div>
          <b>{impact.indirect.length}</b>
          <span>간접 영향</span>
        </div>
      </div>
      <Link href={layersHref} className="dv-btn">
        근거 층 보기
      </Link>
      <div className="dv-links">
        <Link href={cityHref}>영향 시티</Link>
        <Link href={impactHref}>영향 그래프</Link>
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

const ZONE_TONE: Record<Zone, string> = { OWN: "red", REVIEW: "yellow", DELEGATE: "green" };

/** 이 PR 이 건드린 파일의 AI 위임 구역. 사람이 직접 다뤄야 할 곳을 건드렸으면 위에 */
function ZoneCard({ zones, projectId }: { zones: FileZone[]; projectId: number }) {
  if (zones.length === 0) return null;
  const count = (z: Zone) => zones.filter((f) => f.zone === z).length;
  const risky = zones.filter((f) => f.zone !== "DELEGATE");
  return (
    <div className="dv-card">
      <h3>
        위임 구역
        <Link href={`/projects/${projectId}/commits?tab=city&mode=delegation`} className="dv-h-link">
          지도
        </Link>
      </h3>
      <div className="dv-zones">
        {(["OWN", "REVIEW", "DELEGATE"] as Zone[]).map((z) => (
          <span key={z} className={`tag ${ZONE_TONE[z]}${count(z) === 0 ? " off" : ""}`}>
            {ZONE_META[z].label} {count(z)}
          </span>
        ))}
      </div>
      {risky.length > 0 && (
        <ul className="dv-zone-list">
          {risky.map((f) => (
            <li key={f.path}>
              <span className={`dot-sm ${ZONE_TONE[f.zone]}`} />
              <span className="mono">{f.path.slice(f.path.lastIndexOf("/") + 1)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 영향 테스트 선택 요약: 몇 개를 돌리고 몇 개를 걸렀는지 (실행 검증이 돈 리뷰만) */
function TestSelectionCard({ selection: s, href }: { selection: TestSelection | null; href: string }) {
  if (!s || s.mode === "OFF") return null;
  const full = s.mode === "FULL";
  const run = full || s.shadow ? s.impacted : s.run;
  return (
    <div className="dv-card ts-card">
      <h3>
        테스트 선택
        <span className="dv-h-link">{full ? "전체 실행" : s.shadow ? "그림자 모드" : "영향 있는 것만"}</span>
      </h3>
      <div className="dv-stats">
        <div>
          <b>{s.total}</b>
          <span>전체</span>
        </div>
        <div>
          <b className="ts-c-run">{run}</b>
          <span>{full || s.shadow ? "영향" : "실행"}</span>
        </div>
        <div>
          <b className="ts-c-skip">{s.total - run}</b>
          <span>{full || s.shadow ? "거를 수 있음" : "걸러짐"}</span>
        </div>
      </div>
      {s.total > 0 && (
        <div className="ts-bar small" aria-hidden="true">
          <i className="run" style={{ flex: Math.max(run, 0.0001) }} />
          <i className="skip" style={{ flex: Math.max(s.total - run, 0.0001) }} />
        </div>
      )}
      <p className="dv-note ts-card-note">
        {full
          ? s.fullReasons[0]
          : s.shadow
            ? "전체를 돌리며 선택이 놓친 실패가 없는지 확인"
            : s.skippedSeconds > 0
              ? `약 ${seconds(s.skippedSeconds)} 절약`
              : "바뀐 메서드를 지나가는 테스트만"}
      </p>
      <Link href={href} className="dv-btn">
        돌린 테스트 · 걸러진 테스트
      </Link>
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
        <span className="muted">{changed > 0 ? `${changed}곳에서 결과가 다름` : "결과 같음"}</span>
      </div>
      <BehaviorDiffTable rows={rows} compact />
    </div>
  );
}

