"use client";

import { useMemo, useState } from "react";
import type { MapRule, RuleKind, RuleMapView } from "@/lib/api";

type Tab = "summary" | "matrix" | "all";

/** 관례(백엔드 RuleExtractor 의 관례 키)를 한눈에 읽히는 약속으로 */
const PROMISES: Record<string, { title: string; area: string; outlier: string }> = {
  WRITE_GUARD: { title: "수정·삭제 전에 검사한다", area: "보안", outlier: "수정·삭제 메서드인데 검사를 부르지 않아요" },
  LOOKUP_THROWS: { title: "없으면 null 대신 예외", area: "실패 처리", outlier: "조회 메서드인데 없을 때 예외를 던지지 않아요" },
  WRITE_AUTH: { title: "쓰기 API 는 권한이 필요하다", area: "보안", outlier: "쓰기 API 인데 권한 어노테이션이 없어요" },
  RESPONSE_NO_SENSITIVE: { title: "응답에 민감 정보를 넣지 않는다", area: "보안", outlier: "응답 DTO 에 민감 필드가 있어요" },
};

/** 표에서 열 이름 */
const COLUMN: Record<string, string> = {
  WRITE_GUARD: "검사",
  LOOKUP_THROWS: "없으면 예외",
  WRITE_AUTH: "권한",
  RESPONSE_NO_SENSITIVE: "민감 정보 없음",
};

const KIND_LABEL: Record<RuleKind, string> = {
  THROWS: "예외",
  RETURNS_NULL: "null 반환",
  GUARD: "검사",
  AUTH: "권한",
  ORDERED: "정렬",
  ATOMIC_UPDATE: "원자적 갱신",
  FIELD: "필드",
  CONVENTION: "관례",
};

/** 잘못 건드리기 쉬운 사실: 원자적 갱신 · 정렬 · null 가능 · 길이 제한 · null 반환 */
function isCareful(r: MapRule): boolean {
  if (r.kind === "ATOMIC_UPDATE" || r.kind === "ORDERED" || r.kind === "RETURNS_NULL") return true;
  return r.kind === "FIELD" && (r.detail === "NULLABLE" || r.detail === "LENGTH" || r.statement.includes("최대"));
}

/** 실수가 드물어 기본으로 숨기는 사실 */
function isQuiet(r: MapRule): boolean {
  return r.kind === "FIELD" && r.detail === "NOT_NULL" && !r.statement.includes("최대");
}

function typeOf(subject: string): string {
  const hash = subject.indexOf("#");
  const type = hash >= 0 ? subject.slice(0, hash) : subject.slice(0, subject.lastIndexOf("."));
  return type.slice(type.lastIndexOf(".") + 1);
}

/** com.a.PostService#getPost(Long) → PostService#getPost(Long), com.a.User.bio → User.bio */
function shortSubject(subject: string): string {
  const hash = subject.indexOf("#");
  if (hash >= 0) return typeOf(subject) + subject.slice(hash);
  const parts = subject.split(".");
  return parts.length >= 2 ? parts.slice(-2).join(".") : subject;
}

/** 파라미터를 뺀 이름: PostService#getPost */
function plainName(subject: string): string {
  return shortSubject(subject).replace(/\(.*\)$/, "");
}

/** "PostService#getPost(Long): 찾는 값이 없으면 …" → "찾는 값이 없으면 …" */
function ruleText(r: MapRule): string {
  const cut = r.statement.indexOf(": ");
  return cut >= 0 ? r.statement.slice(cut + 2) : r.statement;
}

function fileName(path: string | null): string {
  return path ? path.slice(path.lastIndexOf("/") + 1) : "-";
}

/** 도메인: 엔티티 이름이 타입 이름 앞에 오면 그 엔티티 (PostService · PostResponse → Post), 아니면 공통 */
function domainOf(subject: string, entities: string[]): string {
  const type = typeOf(subject);
  return entities.find((e) => type === e || type.startsWith(e)) ?? "공통";
}

export function RulesView({ map, htmlUrl }: { map: RuleMapView; htmlUrl: string }) {
  const [tab, setTab] = useState<Tab>("summary");

  const conventions = map.rules.filter((r) => r.kind === "CONVENTION");
  const facts = map.rules.filter((r) => r.kind !== "CONVENTION");
  // 엔티티 = 필드 제약이 있는 타입. 긴 이름 먼저 맞춘다 (PostComment 가 Post 로 묶이지 않게)
  const entities = [...new Set(facts.filter((r) => r.kind === "FIELD").map((r) => typeOf(r.subject)))].sort(
    (a, b) => b.length - a.length,
  );
  const outliers = conventions.flatMap((c) => (c.outliers ?? []).map((o) => ({ convention: c, subject: o })));
  const link = (r: MapRule) =>
    r.file ? `${htmlUrl}/blob/${map.commitSha}/${r.file}${r.line > 0 ? `#L${r.line}` : ""}` : null;

  return (
    <div className="rules">
      <header className="rules-head">
        <div>
          <h1>규칙 지도</h1>
          <p className="muted">
            이 레포의 코드가 지키는 규칙입니다. 코드에서 자동으로 뽑았어요 (AI 미사용).
          </p>
        </div>
        <p className="muted rules-basis">
          <code>{map.branch}</code>{" "}
          <a href={`${htmlUrl}/commit/${map.commitSha}`} target="_blank" rel="noreferrer">
            <code>{map.commitSha.slice(0, 7)}</code>
          </a>{" "}
          기준 · 약속 <span className="num">{conventions.length}</span> · 규칙 <span className="num">{facts.length}</span>
        </p>
      </header>

      <div className="agents-tabs rules-tabs" role="tablist">
        {(
          [
            ["summary", "요약"],
            ["matrix", "표"],
            ["all", "전체 규칙"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}>
            {label}
            {key === "summary" && outliers.length > 0 && <span className="rules-tab-dot" aria-label={`확인 필요 ${outliers.length}곳`} />}
          </button>
        ))}
      </div>

      {tab === "summary" && (
        <Summary map={map} conventions={conventions} facts={facts} entities={entities} outliers={outliers} link={link} />
      )}
      {tab === "matrix" && <Matrix conventions={conventions} entities={entities} />}
      {tab === "all" && <AllRules facts={facts} entities={entities} link={link} />}
    </div>
  );
}

function Summary({
  map,
  conventions,
  facts,
  entities,
  outliers,
  link,
}: {
  map: RuleMapView;
  conventions: MapRule[];
  facts: MapRule[];
  entities: string[];
  outliers: { convention: MapRule; subject: string }[];
  link: (r: MapRule) => string | null;
}) {
  const careful = facts.filter(isCareful);
  const byDomain = groupBy(careful, (r) => domainOf(r.subject, entities));
  const changed = map.added.length + map.removed.length;

  return (
    <>
      <section>
        <h2>이 레포의 약속</h2>
        {conventions.length === 0 ? (
          <div className="empty">아직 약속으로 볼 만큼 반복되는 패턴이 없어요 (같은 종류 2곳 이상, 75% 이상).</div>
        ) : (
          <ul className="rules-promises">
            {conventions.map((c) => {
              const p = PROMISES[c.subject];
              const off = c.outliers?.length ?? 0;
              const pct = Math.round((c.support / Math.max(1, c.total)) * 100);
              return (
                <li key={c.id} className={off > 0 ? "has-outlier" : ""}>
                  <div className="rules-promise-top">
                    <span className="rules-area">{p?.area ?? "관례"}</span>
                    {off > 0 ? (
                      <span className="rules-flag">확인 필요 {off}곳</span>
                    ) : (
                      <span className="rules-kept">모두 지킴</span>
                    )}
                  </div>
                  <h3>{p?.title ?? c.statement}</h3>
                  <p className="muted rules-promise-detail">{c.detail && c.subject === "WRITE_GUARD" ? `예: ${c.detail}` : c.statement}</p>
                  <div className="rules-meter" role="img" aria-label={`${c.total}곳 중 ${c.support}곳이 지킴`}>
                    <span style={{ width: `${pct}%` }} />
                  </div>
                  <details className="rules-promise-more">
                    <summary>
                      <span className="num">
                        {c.support}/{c.total}
                      </span>{" "}
                      곳이 지킴
                    </summary>
                    <div className="rules-members">
                      {c.members.map((m) => (
                        <code key={m}>{plainName(m)}</code>
                      ))}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {outliers.length > 0 && (
        <section>
          <h2>확인 필요</h2>
          <p className="muted rules-sub">약속과 다르게 짜인 곳입니다. 의도된 예외라면 괜찮지만, 아니라면 새 코드도 이걸 따라 할 수 있어요.</p>
          <ul className="rules-outliers">
            {outliers.map(({ convention, subject }) => (
              <li key={convention.id + subject}>
                <code>{plainName(subject)}</code>
                <span>{PROMISES[convention.subject]?.outlier ?? "약속과 다르게 짜여 있어요"}</span>
                <span className="muted">
                  {convention.support}/{convention.total} 곳은 지킴
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {careful.length > 0 && (
        <section>
          <h2>건드릴 때 조심할 곳</h2>
          <p className="muted rules-sub">null 가능 · 길이 제한 · 정렬 · 원자적 갱신처럼 모르고 바꾸기 쉬운 것만 모았어요.</p>
          <div className="rules-domains">
            {Object.entries(byDomain).map(([domain, rules]) => (
              <div key={domain} className="rules-domain">
                <h3>{domain}</h3>
                <ul>
                  {rules.map((r) => {
                    const href = link(r);
                    return (
                      <li key={r.id}>
                        <span className={`rules-kind ${r.kind}`}>{KIND_LABEL[r.kind]}</span>
                        <span className="rules-careful-text">
                          <code>{plainName(r.subject)}</code> {ruleText(r)}
                        </span>
                        {href && (
                          <a className="rules-loc" href={href} target="_blank" rel="noreferrer">
                            {fileName(r.file)}
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {map.previousSha && (
        <section>
          <h2>바뀐 규칙</h2>
          <p className="muted rules-sub">
            지난 지도(<code>{map.previousSha.slice(0, 7)}</code>) 대비{changed === 0 ? " 바뀐 규칙이 없어요." : ` ${changed}개가 바뀌었어요.`}
          </p>
          {changed > 0 && (
            <ul className="rules-changes">
              {map.removed.map((r) => (
                <li key={`-${r.id}`} className="removed">
                  <span className="rules-change-mark">사라짐</span>
                  <span>{r.statement}</span>
                </li>
              ))}
              {map.added.map((r) => (
                <li key={`+${r.id}`} className="added">
                  <span className="rules-change-mark">생김</span>
                  <span>{r.statement}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

/** 표: 행 = 약속이 적용되는 메서드 · 타입, 열 = 약속. 빈칸(지키지 않음)이 바로 보이게 */
function Matrix({ conventions, entities }: { conventions: MapRule[]; entities: string[] }) {
  const rows = useMemo(() => {
    const subjects = new Set<string>();
    conventions.forEach((c) => [...c.members, ...(c.outliers ?? [])].forEach((s) => subjects.add(s)));
    return [...subjects].sort((a, b) => {
      const d = domainOf(a, entities).localeCompare(domainOf(b, entities));
      return d !== 0 ? d : shortSubject(a).localeCompare(shortSubject(b));
    });
  }, [conventions, entities]);

  if (conventions.length === 0) {
    return <div className="empty">표로 볼 약속이 아직 없어요.</div>;
  }
  return (
    <section>
      <p className="muted rules-sub rules-matrix-legend">
        <span className="rules-cell yes">●</span> 지킴 <span className="rules-cell no">○</span> 지키지 않음 · 빈칸은 해당 없음
      </p>
      <div className="rules-matrix-wrap">
        <table className="rules-matrix">
          <thead>
            <tr>
              <th scope="col">도메인</th>
              <th scope="col">코드</th>
              {conventions.map((c) => (
                <th key={c.id} scope="col" title={c.statement}>
                  {COLUMN[c.subject] ?? c.subject}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const off = conventions.some((c) => (c.outliers ?? []).includes(s));
              return (
                <tr key={s} className={off ? "off" : ""}>
                  <td className="muted">{domainOf(s, entities)}</td>
                  <td>
                    <code>{plainName(s)}</code>
                  </td>
                  {conventions.map((c) => (
                    <td key={c.id} className="rules-cell-td">
                      {c.members.includes(s) ? (
                        <span className="rules-cell yes" aria-label="지킴">●</span>
                      ) : (c.outliers ?? []).includes(s) ? (
                        <span className="rules-cell no" aria-label="지키지 않음">○</span>
                      ) : null}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** 전체 규칙: 도메인별. NOT NULL 처럼 실수가 드문 것은 기본으로 숨긴다 */
function AllRules({
  facts,
  entities,
  link,
}: {
  facts: MapRule[];
  entities: string[];
  link: (r: MapRule) => string | null;
}) {
  const [query, setQuery] = useState("");
  const [showQuiet, setShowQuiet] = useState(false);
  const quiet = facts.filter(isQuiet).length;

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = facts.filter(
      (r) =>
        (showQuiet || !isQuiet(r)) &&
        (!q || r.statement.toLowerCase().includes(q) || (r.file ?? "").toLowerCase().includes(q)),
    );
    return groupBy(shown, (r) => domainOf(r.subject, entities));
  }, [facts, entities, query, showQuiet]);

  return (
    <section>
      <div className="rules-bar">
        <label className="rules-toggle" htmlFor="rules-quiet">
          <input id="rules-quiet" type="checkbox" checked={showQuiet} onChange={(e) => setShowQuiet(e.target.checked)} />
          실수가 드문 규칙도 보기 <span className="muted">(NOT NULL {quiet}개)</span>
        </label>
        <input
          id="rules-search"
          type="search"
          className="rules-search"
          placeholder="메서드 · 필드 · 파일 이름"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="규칙 검색"
        />
      </div>
      {Object.keys(groups).length === 0 ? (
        <div className="empty">{query ? `"${query}" 에 맞는 규칙이 없어요.` : "보여 줄 규칙이 없어요."}</div>
      ) : (
        Object.entries(groups).map(([domain, rules]) => (
          <div key={domain} className="rules-group">
            <h3>
              {domain} <span className="muted num">{rules.length}</span>
            </h3>
            <ul className="rules-list">
              {rules.map((r) => {
                const href = link(r);
                return (
                  <li key={r.id}>
                    <span className={`rules-kind ${r.kind}`}>{KIND_LABEL[r.kind]}</span>
                    <code className="rules-subject">{plainName(r.subject)}</code>
                    <span className="rules-text">{ruleText(r)}</span>
                    {href ? (
                      <a className="rules-loc" href={href} target="_blank" rel="noreferrer">
                        {fileName(r.file)}
                        {r.line > 0 && `:${r.line}`}
                      </a>
                    ) : (
                      <span className="rules-loc muted">-</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

/** 공통은 맨 뒤로 */
function groupBy(rules: MapRule[], key: (r: MapRule) => string): Record<string, MapRule[]> {
  const out: Record<string, MapRule[]> = {};
  for (const r of rules) (out[key(r)] ??= []).push(r);
  return Object.fromEntries(
    Object.entries(out).sort(([a], [b]) => (a === "공통" ? 1 : b === "공통" ? -1 : a.localeCompare(b))),
  );
}
