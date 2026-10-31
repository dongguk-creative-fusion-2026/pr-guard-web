"use client";

import { useMemo, useState } from "react";
import type { MapRule, RuleKind, RuleMapView } from "@/lib/api";

/** 화면의 묶음. 규칙 종류(백엔드 Rule.Kind)를 사람이 찾는 단위로 모은다 */
const GROUPS: { key: string; label: string; hint: string; kinds: RuleKind[] }[] = [
  { key: "failure", label: "실패 처리", hint: "던지는 예외 · null 반환", kinds: ["THROWS", "RETURNS_NULL"] },
  { key: "access", label: "검사 · 권한", hint: "소유자 확인 · 권한 어노테이션", kinds: ["GUARD", "AUTH"] },
  { key: "query", label: "쿼리", hint: "정렬 · 원자적 갱신", kinds: ["ORDERED", "ATOMIC_UPDATE"] },
  { key: "field", label: "필드 제약", hint: "NOT NULL · 길이 · null 가능", kinds: ["FIELD"] },
];

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

/** com.a.PostService#getPost(Long) → PostService#getPost(Long), com.a.User.bio → User.bio */
function shortSubject(subject: string): string {
  const hash = subject.indexOf("#");
  if (hash >= 0) {
    const type = subject.slice(0, hash);
    return type.slice(type.lastIndexOf(".") + 1) + subject.slice(hash);
  }
  const parts = subject.split(".");
  return parts.length >= 2 ? parts.slice(-2).join(".") : subject;
}

/** "PostService#getPost(Long): 찾는 값이 없으면 …" → "찾는 값이 없으면 …" (주인은 따로 보여 준다) */
function ruleText(r: MapRule): string {
  const cut = r.statement.indexOf(": ");
  return cut >= 0 ? r.statement.slice(cut + 2) : r.statement;
}

function fileName(path: string | null): string {
  return path ? path.slice(path.lastIndexOf("/") + 1) : "-";
}

export function RulesView({ map, htmlUrl }: { map: RuleMapView; htmlUrl: string }) {
  const [group, setGroup] = useState<string>("all");
  const [query, setQuery] = useState("");

  const conventions = map.rules.filter((r) => r.kind === "CONVENTION");
  const facts = map.rules.filter((r) => r.kind !== "CONVENTION");
  const counts = Object.fromEntries(GROUPS.map((g) => [g.key, facts.filter((r) => g.kinds.includes(r.kind)).length]));

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GROUPS.filter((g) => group === "all" || g.key === group)
      .map((g) => ({
        ...g,
        rules: facts.filter(
          (r) => g.kinds.includes(r.kind) && (!q || r.statement.toLowerCase().includes(q) || (r.file ?? "").toLowerCase().includes(q)),
        ),
      }))
      .filter((g) => g.rules.length > 0);
  }, [facts, group, query]);

  const link = (r: MapRule) =>
    r.file ? `${htmlUrl}/blob/${map.commitSha}/${r.file}${r.line > 0 ? `#L${r.line}` : ""}` : null;
  const changed = map.added.length + map.removed.length;

  return (
    <div className="rules">
      <header className="rules-head">
        <div>
          <h1>규칙 지도</h1>
          <p className="muted">
            이 레포의 코드가 지키는 규칙입니다. 새 코드도 이 규칙을 따르면 리뷰에서 걸리지 않아요.
          </p>
        </div>
        <dl className="rules-meta">
          <div>
            <dt>기준</dt>
            <dd>
              <code>{map.branch}</code>{" "}
              <a href={`${htmlUrl}/commit/${map.commitSha}`} target="_blank" rel="noreferrer">
                <code>{map.commitSha.slice(0, 7)}</code>
              </a>
            </dd>
          </div>
          <div>
            <dt>규칙</dt>
            <dd className="num">{facts.length}</dd>
          </div>
          <div>
            <dt>관례</dt>
            <dd className="num">{conventions.length}</dd>
          </div>
          <div>
            <dt>만든 방법</dt>
            <dd>코드에서 자동 추출 · AI 미사용{map.cached ? "" : " · 방금 만듦"}</dd>
          </div>
        </dl>
      </header>

      <section>
        <h2>관례</h2>
        <p className="muted rules-sub">같은 종류의 코드 대부분이 따르는 방식입니다. 새 코드가 어기면 리뷰에서 알려 줘요.</p>
        {conventions.length === 0 ? (
          <div className="empty">아직 관례로 볼 만큼 반복되는 패턴이 없어요 (같은 종류 2곳 이상, 75% 이상).</div>
        ) : (
          <ul className="rules-conventions">
            {conventions.map((c) => {
              const pct = Math.round((c.support / Math.max(1, c.total)) * 100);
              return (
                <li key={c.id}>
                  <p className="rules-convention-text">{c.statement}</p>
                  <div className="rules-meter" role="img" aria-label={`${c.total}곳 중 ${c.support}곳이 따름`}>
                    <span style={{ width: `${pct}%` }} />
                  </div>
                  <p className="muted rules-convention-count">
                    <span className="num">
                      {c.support}/{c.total}
                    </span>{" "}
                    곳이 따름
                  </p>
                  {c.members.length > 0 && (
                    <div className="rules-members">
                      {c.members.slice(0, 4).map((m) => (
                        <code key={m}>{shortSubject(m)}</code>
                      ))}
                      {c.members.length > 4 && <span className="muted">외 {c.members.length - 4}</span>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

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

      <section>
        <div className="rules-bar">
          <h2>규칙</h2>
          <div className="rules-filters">
            <div className="agents-tabs" role="tablist">
              <button type="button" className={group === "all" ? "active" : ""} onClick={() => setGroup("all")}>
                전체 <span className="num">{facts.length}</span>
              </button>
              {GROUPS.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  className={group === g.key ? "active" : ""}
                  onClick={() => setGroup(g.key)}
                  disabled={counts[g.key] === 0}
                >
                  {g.label} <span className="num">{counts[g.key]}</span>
                </button>
              ))}
            </div>
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
        </div>
        {shown.length === 0 ? (
          <div className="empty">{query ? `"${query}" 에 맞는 규칙이 없어요.` : "뽑은 규칙이 없어요."}</div>
        ) : (
          shown.map((g) => (
            <div key={g.key} className="rules-group">
              <h3>
                {g.label} <span className="muted">{g.hint}</span>
              </h3>
              <ul className="rules-list">
                {g.rules.map((r) => {
                  const href = link(r);
                  return (
                    <li key={r.id}>
                      <span className={`rules-kind ${r.kind}`}>{KIND_LABEL[r.kind]}</span>
                      <code className="rules-subject">{shortSubject(r.subject)}</code>
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
    </div>
  );
}
