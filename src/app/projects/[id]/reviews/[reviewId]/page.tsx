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
import { PipelineView } from "@/components/pipeline/PipelineView";
import { ReviewMarkdown } from "../../ReviewMarkdown";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string; reviewId: string }> }) {
  const p = await params;
  const projectId = Number(p.id);
  const reviewId = Number(p.reviewId);
  if (!Number.isInteger(projectId) || !Number.isInteger(reviewId)) notFound();

  let detail;
  let graph;
  try {
    [detail, graph] = await Promise.all([api.getReview(reviewId), api.getGraph(projectId)]);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const { review, findings, context } = detail;
  if (review.projectId !== projectId) notFound();

  return (
    <>
      <p className="muted">
        <Link href={`/projects/${projectId}`}>← 프로젝트</Link>
      </p>
      <h1>
        리뷰 #{review.id} · PR #{review.prNumber}
      </h1>
      <p className="muted">
        <code>{shortSha(review.headSha)}</code> · run {review.run} · {review.reviewer ?? "-"} ·{" "}
        {formatTime(review.finishedAt ?? review.createdAt)}
        {review.commentUrl && (
          <>
            {" · "}
            <a href={review.commentUrl} target="_blank" rel="noreferrer">
              PR 코멘트
            </a>
          </>
        )}
      </p>

      <PipelineView reviewId={review.id} />

      {review.status !== "DONE" ? (
        <div className="empty">
          <span className={`badge ${review.status}`}>{review.status}</span>
          {review.status === "PENDING" && <p className="muted">대기열에서 차례를 기다리는 중입니다.</p>}
          {review.error && <p className="error">{review.error}</p>}
        </div>
      ) : (
        <>
          <div className="verdict-box">
            {review.verdict && <span className={`verdict large ${review.verdict}`}>{VERDICT_LABEL[review.verdict]}</span>}
            <span className="muted">
              {SEVERITY_ORDER.slice(0, 3)
                .map((s) => `${s} ${findings.filter((f) => f.severity === s).length}`)
                .join(" · ")}
            </span>
          </div>
          {review.summary && <p>{review.summary}</p>}

          {graph?.graph ? (
            <ImpactCard
              impact={computeImpact(graph.graph, context, findings)}
              href={`/projects/${projectId}/reviews/${reviewId}/impact`}
            />
          ) : (
            <p className="muted">
              레포 의존성 그래프가 있으면 이 PR 의 영향 범위를 볼 수 있습니다.{" "}
              <Link href={`/projects/${projectId}`}>프로젝트에서 만들기</Link>
            </p>
          )}

          <h2>지적 사항</h2>
          {findings.length === 0 ? <div className="empty">지적 사항 없음</div> : <FindingTable findings={findings} />}

          {context && <ContextSection context={context} />}

          <h2>PR 에 남긴 코멘트</h2>
          <details className="review">
            <summary>원문 보기</summary>
            <div className="review-body">{review.result && <ReviewMarkdown>{review.result}</ReviewMarkdown>}</div>
          </details>
        </>
      )}
    </>
  );
}

const IMPACT_PREVIEW = 5;

/** 이 PR 이 레포 그래프에서 닿는 범위 요약. 누르면 전체 화면 영향 그래프 */
function ImpactCard({ impact, href }: { impact: Impact; href: string }) {
  const top = [...impact.direct, ...impact.indirect].slice(0, IMPACT_PREVIEW);
  return (
    <div className="graph-card impact-card">
      <div className="graph-card-main">
        <div>
          <div className="graph-card-title">영향 그래프</div>
          <div className="graph-card-status">바뀐 함수에서 그 함수를 호출하는 함수로 영향이 퍼지는 범위</div>
        </div>
        <div className="graph-card-stats">
          <span>
            <b className="impact-0">{impact.changed.length}</b> 바뀐 함수
          </span>
          <span>
            <b className="impact-1">{impact.direct.length}</b> 직접 영향
          </span>
          <span>
            <b className="impact-2">{impact.indirect.length}</b> 간접 영향
          </span>
        </div>
      </div>
      {top.length > 0 && (
        <div className="graph-card-groups">
          {top.map((f) => (
            <span key={f.id} title={f.reason ?? f.file}>
              <i className={`impact-dot-${f.level}`} />
              {f.name}
              {!f.placeholder && <small className="impact-file">{fileName(f.file)}</small>}
              {f.stale && <em className="impact-stale">옛 시그니처 호출</em>}
            </span>
          ))}
          {impact.direct.length + impact.indirect.length > IMPACT_PREVIEW && (
            <span className="graph-card-more">+{impact.direct.length + impact.indirect.length - IMPACT_PREVIEW}</span>
          )}
        </div>
      )}
      <div className="graph-card-actions">
        <Link href={href} className="graph-open impact-open">
          영향 그래프 열기 →
        </Link>
        <Link href={href.replace(/\/impact$/, "/city")} className="graph-more">
          3D 영향 시티
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
                <code>
                  {fileName(f.file)}
                  {f.line != null && `:${f.line}`}
                </code>
              </td>
              <td>
                <strong>{f.title}</strong>
                <div>{f.message}</div>
                {f.evidence && <div className="muted">근거: {f.evidence}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 분석에 쓴 재료. A~D 검사가 어떤 근거를 쓸 수 있는지 보여준다. */
function ContextSection({ context }: { context: AnalysisContext }) {
  const coChanges = context.history.filter((h) => h.coChanges.length > 0);
  return (
    <>
      <h2>분석 재료</h2>
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
                    <span className="badge">{kindLabel(m)}</span>
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

function kindLabel(m: AnalysisContext["changedMethods"][number]): string {
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
